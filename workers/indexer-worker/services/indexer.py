import asyncio
from typing import List, Dict, Any, Optional
import structlog
from datetime import datetime, timedelta
from tenacity import retry, stop_after_attempt, wait_exponential

from config.settings import Settings, ChainConfig
from repositories.base import PoolRepository, ProgressRepository, CacheRepository
from services.blockchain_service import BlockchainService
from services.creation_block_detector import CreationBlockDetector
from models.pool import PoolInfo, SwapEvent, PoolLiquidity, IndexerProgress, PoolStatus, PoolProtocol


logger = structlog.get_logger()


class IndexerService:
    """Main indexer service that orchestrates the indexing process."""
    
    def __init__(
        self,
        settings: Settings,
        chain_config: ChainConfig,
        pool_repo: PoolRepository,
        progress_repo: ProgressRepository,
        cache_repo: CacheRepository
    ):
        self.settings = settings
        self.chain_config = chain_config
        self.pool_repo = pool_repo
        self.progress_repo = progress_repo
        self.cache_repo = cache_repo
        
        self.blockchain_service = BlockchainService(chain_config)
        self.is_running = False
        self.tasks: List[asyncio.Task] = []
        
        # Event system for immediate swap processing
        self._new_pool_event = asyncio.Event()
        self._new_pools_queue = asyncio.Queue()
    
    async def start(self) -> None:
        """Start the indexer service."""
        try:
            # Connect to all services
            logger.info("Connecting to all services...")
            await self.blockchain_service.connect()
            await self.pool_repo.connect()
            await self.progress_repo.connect()
            await self.cache_repo.connect()
            logger.info("All services connected successfully")
            
            self.is_running = True
            
            # Start indexing tasks
            logger.info("Creating background worker tasks...")
            pool_task = asyncio.create_task(self._pool_indexer_worker())
            swap_task = asyncio.create_task(self._swap_indexer_worker())
            # Temporarily disable pool state updater to focus on core indexing
            # state_task = asyncio.create_task(self._pool_state_updater_worker())
            
            self.tasks = [pool_task, swap_task]
            
            logger.info("Indexer service fully started and running",
                       chain_id=self.chain_config.chain_id,
                       chain_name=self.chain_config.name,
                       total_workers=len(self.tasks),
                       worker_interval=self.settings.worker_interval_seconds)
            
            # Wait for tasks to complete or error
            logger.info("All workers are now running, monitoring for completion...")
            await asyncio.gather(*self.tasks, return_exceptions=True)
            
        except Exception as e:
            logger.error("Failed to start indexer service", error=str(e))
            raise
    
    async def stop(self) -> None:
        """Stop the indexer service gracefully."""
        if not self.is_running:
            logger.info("Indexer service already stopped", chain_id=self.chain_config.chain_id)
            return
            
        logger.info("Starting graceful shutdown of indexer service",
                   chain_id=self.chain_config.chain_id,
                   total_workers=len(self.tasks))
        
        start_time = datetime.utcnow()
        self.is_running = False
        
        # Allow workers to complete current operations
        logger.info("Signaling workers to stop", chain_id=self.chain_config.chain_id)
        
        # Wait briefly for workers to notice shutdown signal and complete current work
        logger.info("Allowing workers to complete current operations",
                   grace_period_seconds=5)
        await asyncio.sleep(5)
        
        # Cancel all worker tasks
        logger.info("Cancelling worker tasks", 
                   chain_id=self.chain_config.chain_id,
                   task_count=len(self.tasks))
        
        for i, task in enumerate(self.tasks):
            task_name = task.get_name() if hasattr(task, 'get_name') else f"task-{i}"
            logger.info("Cancelling worker task",
                       chain_id=self.chain_config.chain_id,
                       task_name=task_name)
            task.cancel()
        
        # Wait for tasks to finish cancellation
        logger.info("Waiting for worker tasks to finish",
                   chain_id=self.chain_config.chain_id)
        
        cancelled_tasks = await asyncio.gather(*self.tasks, return_exceptions=True)
        
        # Log results of task cancellation
        for i, result in enumerate(cancelled_tasks):
            if isinstance(result, asyncio.CancelledError):
                logger.info("Worker task cancelled successfully",
                           chain_id=self.chain_config.chain_id,
                           task_index=i)
            elif isinstance(result, Exception):
                logger.warning("Worker task stopped with error",
                             chain_id=self.chain_config.chain_id,
                             task_index=i,
                             error=str(result))
            else:
                logger.info("Worker task completed normally",
                           chain_id=self.chain_config.chain_id,
                           task_index=i)
        
        # Disconnect from services
        logger.info("Disconnecting from services", chain_id=self.chain_config.chain_id)
        
        disconnect_tasks = [
            ("blockchain_service", self.blockchain_service.disconnect()),
            ("pool_repository", self.pool_repo.disconnect()),
            ("progress_repository", self.progress_repo.disconnect()),
            ("cache_repository", self.cache_repo.disconnect())
        ]
        
        for service_name, disconnect_task in disconnect_tasks:
            try:
                logger.info("Disconnecting from service",
                           chain_id=self.chain_config.chain_id,
                           service=service_name)
                await disconnect_task
                logger.info("Successfully disconnected from service",
                           chain_id=self.chain_config.chain_id,
                           service=service_name)
            except Exception as e:
                logger.error("Error disconnecting from service",
                           chain_id=self.chain_config.chain_id,
                           service=service_name,
                           error=str(e))
        
        end_time = datetime.utcnow()
        shutdown_duration = (end_time - start_time).total_seconds()
        
        logger.info("Indexer service stopped successfully",
                   chain_id=self.chain_config.chain_id,
                   shutdown_duration_seconds=shutdown_duration)
    
    async def _check_shutdown_signal(self) -> bool:
        """Check if service should shutdown and raise CancelledError if needed."""
        if not self.is_running:
            logger.info("Shutdown signal detected, stopping current operation")
            raise asyncio.CancelledError("Service shutdown requested")
        return True
    
    async def _pool_indexer_worker(self) -> None:
        """Worker that indexes new pools."""
        logger.info("Pool indexer worker started",
                   chain_id=self.chain_config.chain_id,
                   interval_seconds=self.settings.worker_interval_seconds)
        
        iteration = 0
        while self.is_running:
            try:
                iteration += 1
                logger.info("Pool indexer worker heartbeat",
                           iteration=iteration,
                           chain_id=self.chain_config.chain_id,
                           is_running=self.is_running)
                
                # Check if we should stop before acquiring lock
                if not self.is_running:
                    logger.info("Pool indexer worker stopping - shutdown signal detected")
                    break
                
                # Acquire distributed lock for pool indexing
                lock_key = f"pool_indexer:{self.chain_config.chain_id}"
                
                logger.info("Attempting to acquire pool indexing lock", lock_key=lock_key)
                
                lock_acquired = False
                if await self.cache_repo.acquire_lock(lock_key, self.settings.lock_timeout_seconds):
                    logger.info("Successfully acquired pool indexing lock, starting indexing")
                    lock_acquired = True
                    try:
                        # Check again if we should stop before heavy work
                        if not self.is_running:
                            logger.info("Pool indexer worker stopping - shutdown signal detected during indexing")
                            break
                            
                        await self._index_pools()
                        logger.info("Pool indexing cycle completed successfully")
                        
                    except asyncio.CancelledError:
                        logger.info("Pool indexer worker cancelled during indexing")
                        raise
                    finally:
                        if lock_acquired:
                            await self.cache_repo.release_lock(lock_key)
                            logger.info("Released pool indexing lock")
                else:
                    logger.info("Another instance is already indexing pools, skipping this cycle")
                
                # Check if we should stop before sleeping
                if not self.is_running:
                    logger.info("Pool indexer worker stopping - shutdown signal detected before sleep")
                    break
                
                # Wait for next interval with graceful interruption
                logger.info("Pool indexer worker sleeping",
                           sleep_seconds=self.settings.worker_interval_seconds,
                           next_iteration=iteration + 1)
                
                try:
                    await asyncio.sleep(self.settings.worker_interval_seconds)
                except asyncio.CancelledError:
                    logger.info("Pool indexer worker sleep cancelled")
                    break
                
            except asyncio.CancelledError:
                logger.info("Pool indexer worker cancelled",
                           iteration=iteration)
                break
            except Exception as e:
                logger.error("Error in pool indexer worker", 
                           error=str(e),
                           iteration=iteration)
                
                # Check if we should stop before retry delay
                if not self.is_running:
                    logger.info("Pool indexer worker stopping - shutdown signal detected during error handling")
                    break
                    
                try:
                    await asyncio.sleep(self.settings.worker_retry_delay)
                except asyncio.CancelledError:
                    logger.info("Pool indexer worker retry delay cancelled")
                    break
        
        logger.info("Pool indexer worker stopped",
                   chain_id=self.chain_config.chain_id,
                   final_iteration=iteration)
    
    async def _swap_indexer_worker(self) -> None:
        """Worker that indexes swap events."""
        logger.info("Swap indexer worker started",
                   chain_id=self.chain_config.chain_id,
                   interval_seconds=self.settings.worker_interval_seconds)
        
        iteration = 0
        while self.is_running:
            try:
                iteration += 1
                logger.info("Swap indexer worker heartbeat",
                           iteration=iteration,
                           chain_id=self.chain_config.chain_id)
                
                # Check shutdown signal
                if not self.is_running:
                    logger.info("Swap indexer worker stopping - shutdown signal detected")
                    break
                
                # Get all active pools
                pools = await self.pool_repo.get_pools_by_chain(
                    self.chain_config.chain_id,
                    limit=1000
                )
                
                logger.info("Processing swap indexing for pools",
                           total_pools=len(pools),
                           chain_id=self.chain_config.chain_id)
                
                # Sort pools by priority: recently created first, then by last_indexed_block
                from datetime import datetime, timedelta
                now = datetime.utcnow()
                
                def pool_priority(pool):
                    # Higher priority (lower number) = more recent
                    hours_since_creation = (now - pool.creation_timestamp).total_seconds() / 3600
                    blocks_behind = max(0, pool.last_indexed_block - pool.creation_block)
                    return (hours_since_creation, -blocks_behind)  # Recent pools first, then active pools
                
                pools.sort(key=pool_priority)
                
                # Process pools in batches
                pool_batches = [
                    pools[i:i + self.settings.worker_pool_size] 
                    for i in range(0, len(pools), self.settings.worker_pool_size)
                ]
                
                for batch_idx, batch in enumerate(pool_batches):
                    # Check shutdown signal before each batch
                    if not self.is_running:
                        logger.info("Swap indexer worker stopping - shutdown signal detected during batch processing")
                        break
                        
                    logger.info("Processing pool batch",
                               batch_index=f"{batch_idx+1}/{len(pool_batches)}",
                               batch_size=len(batch))
                    
                    # Create tasks for parallel processing
                    tasks = []
                    for pool in batch:
                        if pool.status == PoolStatus.ACTIVE:
                            task = asyncio.create_task(self._index_pool_swaps(pool))
                            tasks.append(task)
                    
                    # Execute batch in parallel
                    if tasks:
                        try:
                            await asyncio.gather(*tasks, return_exceptions=True)
                        except asyncio.CancelledError:
                            logger.info("Swap indexer batch cancelled")
                            break
                
                # Check shutdown signal before sleeping
                if not self.is_running:
                    logger.info("Swap indexer worker stopping - shutdown signal detected before sleep")
                    break
                
                # Wait for next interval with graceful interruption
                logger.info("Swap indexer worker sleeping",
                           sleep_seconds=self.settings.worker_interval_seconds,
                           next_iteration=iteration + 1)
                
                try:
                    await asyncio.sleep(self.settings.worker_interval_seconds)
                except asyncio.CancelledError:
                    logger.info("Swap indexer worker sleep cancelled")
                    break
                
            except asyncio.CancelledError:
                logger.info("Swap indexer worker cancelled", iteration=iteration)
                break
            except Exception as e:
                logger.error("Error in swap indexer worker", 
                           error=str(e),
                           iteration=iteration)
                
                # Check if we should stop before retry delay
                if not self.is_running:
                    logger.info("Swap indexer worker stopping - shutdown signal detected during error handling")
                    break
                    
                try:
                    await asyncio.sleep(self.settings.worker_retry_delay)
                except asyncio.CancelledError:
                    logger.info("Swap indexer worker retry delay cancelled")
                    break
        
        logger.info("Swap indexer worker stopped",
                   chain_id=self.chain_config.chain_id,
                   final_iteration=iteration)
    
    async def _pool_state_updater_worker(self) -> None:
        """Worker that periodically updates pool states with current data."""
        logger.info("Pool state updater worker started",
                   chain_id=self.chain_config.chain_id)
        
        # Run less frequently than swap indexing (every 5 minutes)
        update_interval = max(self.settings.worker_interval_seconds * 5, 300)
        iteration = 0
        
        while self.is_running:
            try:
                iteration += 1
                logger.info("Pool state updater worker heartbeat",
                           iteration=iteration,
                           chain_id=self.chain_config.chain_id)
                
                # Check shutdown signal
                if not self.is_running:
                    logger.info("Pool state updater worker stopping - shutdown signal detected")
                    break
                
                # Acquire distributed lock for pool state updating
                lock_key = f"pool_state_updater:{self.chain_config.chain_id}"
                
                logger.info("Attempting to acquire pool state update lock", lock_key=lock_key)
                
                lock_acquired = False
                if await self.cache_repo.acquire_lock(lock_key, self.settings.lock_timeout_seconds):
                    logger.info("Successfully acquired pool state update lock")
                    lock_acquired = True
                    try:
                        # Check again if we should stop before heavy work
                        if not self.is_running:
                            logger.info("Pool state updater worker stopping - shutdown signal detected during update")
                            break
                            
                        await self._update_pool_states()
                        logger.info("Pool state update cycle completed successfully")
                        
                    except asyncio.CancelledError:
                        logger.info("Pool state updater worker cancelled during update")
                        raise
                    finally:
                        if lock_acquired:
                            await self.cache_repo.release_lock(lock_key)
                            logger.info("Released pool state update lock")
                else:
                    logger.info("Another instance is already updating pool states, skipping this cycle")
                
                # Check if we should stop before sleeping
                if not self.is_running:
                    logger.info("Pool state updater worker stopping - shutdown signal detected before sleep")
                    break
                
                # Wait for next interval with graceful interruption
                logger.info("Pool state updater worker sleeping",
                           sleep_seconds=update_interval,
                           next_iteration=iteration + 1)
                
                try:
                    await asyncio.sleep(update_interval)
                except asyncio.CancelledError:
                    logger.info("Pool state updater worker sleep cancelled")
                    break
                
            except asyncio.CancelledError:
                logger.info("Pool state updater worker cancelled", iteration=iteration)
                break
            except Exception as e:
                logger.error("Error in pool state updater worker", 
                           error=str(e),
                           iteration=iteration)
                
                # Check if we should stop before retry delay
                if not self.is_running:
                    logger.info("Pool state updater worker stopping - shutdown signal detected during error handling")
                    break
                    
                try:
                    await asyncio.sleep(self.settings.worker_retry_delay)
                except asyncio.CancelledError:
                    logger.info("Pool state updater worker retry delay cancelled")
                    break
        
        logger.info("Pool state updater worker stopped",
                   chain_id=self.chain_config.chain_id,
                   final_iteration=iteration)
    
    async def _update_pool_states(self) -> None:
        """Update current states for all active pools."""
        try:
            # Get all active pools
            pools = await self.pool_repo.get_pools_by_chain(
                self.chain_config.chain_id,
                limit=1000
            )
            
            logger.info("Updating pool states", pool_count=len(pools))
            
            # Process pools in batches
            pool_batches = [
                pools[i:i + self.settings.worker_pool_size] 
                for i in range(0, len(pools), self.settings.worker_pool_size)
            ]
            
            for batch in pool_batches:
                # Create tasks for parallel processing
                tasks = []
                for pool in batch:
                    if pool.status == PoolStatus.ACTIVE:
                        task = asyncio.create_task(self._update_single_pool_state(pool))
                        tasks.append(task)
                
                # Execute batch in parallel
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)
            
            logger.info("Completed pool state update")
            
        except Exception as e:
            logger.error("Failed to update pool states", error=str(e))
            raise
    
    async def _update_single_pool_state(self, pool: PoolInfo) -> None:
        """Update state for a single pool."""
        try:
            # Skip if pool was updated recently (within last hour)
            if pool.state_updated_at:
                time_since_update = datetime.utcnow() - pool.state_updated_at
                if time_since_update.total_seconds() < 3600:  # 1 hour
                    return
            
            logger.debug("Updating pool state", pool_address=pool.pool_address)
            
            # Get current pool state based on protocol
            if pool.protocol == PoolProtocol.UNISWAP_V3:
                await self._update_uniswap_v3_pool_state(pool)
            elif pool.protocol == PoolProtocol.SUSHISWAP:
                await self._update_sushiswap_pool_state(pool)
            else:
                logger.debug("Pool state update not implemented for protocol", 
                           protocol=pool.protocol)
            
        except Exception as e:
            logger.error("Failed to update pool state",
                        pool_address=pool.pool_address,
                        error=str(e))
    
    async def _update_uniswap_v3_pool_state(self, pool: PoolInfo) -> None:
        """Update Uniswap V3 pool state with current data (simplified - no price calculation)."""
        try:
            # Get current pool state
            pool_state = await self.blockchain_service.get_uniswap_v3_pool_state(pool.pool_address)
            
            if not pool_state:
                logger.warning("Could not get pool state", pool_address=pool.pool_address)
                return
            
            # Update pool fields with current state (no price calculation)
            pool.current_sqrt_price_x96 = pool_state.get("sqrt_price_x96")
            pool.current_tick = pool_state.get("current_tick") 
            pool.current_liquidity = pool_state.get("liquidity")
            pool.state_updated_at = datetime.utcnow()
            
            # Save updated pool to database
            await self.pool_repo.save_pool(pool)
            
            logger.debug("Pool state updated (no price calculation)",
                        pool_address=pool.pool_address,
                        sqrt_price=pool_state.get("sqrt_price_x96"),
                        tick=pool_state.get("current_tick"),
                        liquidity=pool_state.get("liquidity"))
            
        except Exception as e:
            logger.error("Failed to update Uniswap V3 pool state",
                        pool_address=pool.pool_address,
                        error=str(e))
            raise
    
    async def _update_sushiswap_pool_state(self, pool: PoolInfo) -> None:
        """Update SushiSwap pool state with current data."""
        try:
            # For SushiSwap (V2 style), we need to get reserves
            logger.debug("SushiSwap pool state update not fully implemented yet",
                        pool_address=pool.pool_address)
            
        except Exception as e:
            logger.error("Failed to update SushiSwap pool state",
                        pool_address=pool.pool_address,
                        error=str(e))
            raise
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _index_pools(self) -> None:
        """Index new pools from factory contracts."""
        try:
            # Get current progress
            progress = await self.progress_repo.get_progress(
                self.chain_config.chain_id,
                "pools"
            )
            
            latest_block = await self.blockchain_service.get_latest_block()
            
            if progress:
                # Continue from last processed block
                start_block = progress.last_processed_block + 1
                logger.info("Continuing from last processed block",
                           chain_id=self.chain_config.chain_id,
                           last_processed=progress.last_processed_block,
                           start_block=start_block,
                           latest_block=latest_block)
            else:
                # First run: determine optimal start block considering all protocols
                max_scan_blocks = min(self.settings.max_blocks_per_request * 10, 10000)  # Max 10k blocks for first scan
                
                # Find the minimum creation block across all enabled protocols
                enabled_protocols = [p for p in self.chain_config.pools if p.get("enabled", True)]
                protocol_creation_blocks = [p.get("creation_block", 0) for p in enabled_protocols if p.get("creation_block")]
                
                # Safety check: filter out creation blocks that are in the future
                valid_creation_blocks = [cb for cb in protocol_creation_blocks if cb <= latest_block]
                future_creation_blocks = [cb for cb in protocol_creation_blocks if cb > latest_block]
                
                if future_creation_blocks:
                    logger.warning("Found creation blocks in the future - these will be ignored",
                                 future_blocks=future_creation_blocks,
                                 latest_block=latest_block,
                                 protocols_affected=[p.get("protocol") for p in enabled_protocols 
                                                   if p.get("creation_block") in future_creation_blocks])
                
                protocol_creation_blocks = valid_creation_blocks
                
                if protocol_creation_blocks:
                    min_protocol_creation = min(protocol_creation_blocks)
                    max_protocol_creation = max(protocol_creation_blocks)
                    
                    logger.info("Analyzing protocol creation blocks",
                               min_creation_block=min_protocol_creation,
                               max_creation_block=max_protocol_creation,
                               protocol_count=len(protocol_creation_blocks))
                    
                    # Strategy: scan from the earliest protocol that makes sense
                    # If all protocols are very recent (within max_scan_blocks), scan from recent history
                    # Otherwise, scan from the oldest protocol creation block
                    recent_threshold = latest_block - max_scan_blocks
                    
                    # Strategy: For first run, we want to catch recent activity 
                    # But also not miss important protocols that might be a bit older
                    
                    # If the oldest protocol is within reasonable range (last 10M blocks), use it
                    max_reasonable_age = 10000000  # 10M blocks back
                    oldest_reasonable_block = latest_block - max_reasonable_age
                    
                    if min_protocol_creation >= oldest_reasonable_block:
                        # All protocols are within reasonable age, start from oldest
                        start_block = min_protocol_creation
                        scan_strategy = "oldest_protocol_in_range"
                    else:
                        # Some protocols are very old, but let's still try to catch newer ones
                        newer_protocols = [cb for cb in protocol_creation_blocks if cb >= oldest_reasonable_block]
                        
                        if newer_protocols:
                            start_block = min(newer_protocols)
                            scan_strategy = "oldest_newer_protocol"
                        else:
                            # All protocols are ancient, scan recent history instead
                            start_block = recent_threshold
                            scan_strategy = "recent_history_fallback"
                else:
                    # No protocol creation blocks defined, use default behavior
                    start_block = max(latest_block - max_scan_blocks, self.chain_config.start_block)
                    scan_strategy = "default_fallback"
                
                logger.info("First run - smart start block calculation",
                           chain_id=self.chain_config.chain_id,
                           latest_block=latest_block,
                           config_start_block=self.chain_config.start_block,
                           calculated_start_block=start_block,
                           scan_strategy=scan_strategy,
                           max_scan_blocks=max_scan_blocks,
                           blocks_to_scan=latest_block - start_block + 1)
            
            if start_block > latest_block:
                logger.info("No new blocks to process for pools",
                           start_block=start_block,
                           latest_block=latest_block)
                return
            
            # Process blocks in chunks
            end_block = min(start_block + self.settings.max_blocks_per_request, latest_block)
            
            logger.info("Indexing pools",
                       start_block=start_block,
                       end_block=end_block,
                       latest_block=latest_block,
                       chain_id=self.chain_config.chain_id,
                       block_range_size=end_block - start_block + 1)
            
            # Index pools for each protocol CONCURRENTLY
            enabled_protocols = [p for p in self.chain_config.pools if p.get("enabled", True)]
            
            logger.info("Starting PARALLEL pool indexing for all protocols", 
                       total_protocols=len(self.chain_config.pools),
                       enabled_protocols=[p["protocol"] for p in enabled_protocols],
                       parallel_count=len(enabled_protocols))
            
            if not enabled_protocols:
                logger.info("No enabled protocols to process")
                return
            
            # Create concurrent tasks for all enabled protocols
            protocol_tasks = []
            for pool_config in enabled_protocols:
                protocol_name = pool_config.get("protocol", "unknown")
                
                logger.info("Creating parallel task for protocol", protocol=protocol_name)
                
                task = asyncio.create_task(
                    self._index_pools_for_protocol_with_error_handling(
                        pool_config, start_block, end_block
                    ),
                    name=f"protocol-{protocol_name}"
                )
                protocol_tasks.append((protocol_name, task))
            
            # Execute all protocols in parallel with progress tracking
            logger.info("Executing protocols in parallel", task_count=len(protocol_tasks))
            
            start_time = asyncio.get_event_loop().time()
            completed_protocols = []
            failed_protocols = []
            
            # Wait for all protocols to complete
            for protocol_name, task in protocol_tasks:
                try:
                    await task
                    completed_protocols.append(protocol_name)
                    logger.info("Protocol completed successfully", 
                               protocol=protocol_name,
                               completed_count=len(completed_protocols),
                               total_count=len(protocol_tasks))
                except Exception as e:
                    failed_protocols.append((protocol_name, str(e)))
                    logger.error("Protocol failed", 
                                protocol=protocol_name, 
                                error=str(e))
            
            end_time = asyncio.get_event_loop().time()
            parallel_duration = end_time - start_time
            
            logger.info("Parallel protocol processing completed",
                       total_protocols=len(protocol_tasks),
                       completed_protocols=len(completed_protocols),
                       failed_protocols=len(failed_protocols),
                       parallel_duration_seconds=parallel_duration,
                       completed_list=completed_protocols,
                       failed_list=[f[0] for f in failed_protocols])
            
            # Update progress
            await self.progress_repo.update_progress(
                self.chain_config.chain_id,
                "pools",
                end_block,
                status="running"
            )
            
            logger.info("Completed pool indexing batch",
                       start_block=start_block,
                       end_block=end_block)
            
        except Exception as e:
            logger.error("Failed to index pools", error=str(e))
            # Update progress with error
            await self.progress_repo.update_progress(
                self.chain_config.chain_id,
                "pools",
                start_block - 1 if 'start_block' in locals() else 0,
                status="error",
                error_message=str(e)
            )
            raise
    
    async def _index_pools_for_protocol(
        self,
        pool_config: Dict[str, Any],
        start_block: int,
        end_block: int
    ) -> None:
        """Index pools for a specific protocol."""
        try:
            # Handle different contract architectures
            protocol = pool_config.get("protocol")
            
            # Respect protocol-specific creation block
            protocol_creation_block = pool_config.get("creation_block")
            if protocol_creation_block:
                # Don't scan before protocol was deployed
                actual_start_block = max(start_block, protocol_creation_block)
                if actual_start_block > start_block:
                    logger.info("Adjusting start block based on protocol creation block",
                               protocol=protocol,
                               original_start_block=start_block,
                               protocol_creation_block=protocol_creation_block,
                               adjusted_start_block=actual_start_block)
                start_block = actual_start_block
            
            # Skip if start_block is beyond end_block after adjustment
            if start_block > end_block:
                logger.info("Protocol creation block is beyond scan range, skipping",
                           protocol=protocol,
                           creation_block=protocol_creation_block,
                           scan_end=end_block)
                return
            
            # Calculate efficiency metrics
            total_possible_blocks = end_block - start_block + 1
            blocks_saved = 0
            if protocol_creation_block and protocol_creation_block > start_block:
                blocks_saved = protocol_creation_block - start_block
                efficiency_pct = (blocks_saved / total_possible_blocks) * 100 if total_possible_blocks > 0 else 0
            else:
                efficiency_pct = 0
            
            logger.info("Starting pool indexing for protocol",
                       protocol=protocol,
                       start_block=start_block,
                       end_block=end_block,
                       creation_block=protocol_creation_block,
                       blocks_saved_by_creation_block=blocks_saved,
                       efficiency_percentage=f"{efficiency_pct:.1f}%")
            
            if protocol == "uniswap_v4":
                # Uniswap V4 uses pool_manager instead of factory
                contract_address = pool_config["pool_manager"]
                topic = pool_config["pool_init_topic"]
                logger.info("Using Uniswap V4 configuration",
                           pool_manager=contract_address,
                           topic=topic)
            else:
                # Traditional factory-based protocols
                contract_address = pool_config["factory"]
                topic = pool_config["pool_created_topic"]
                logger.info("Using traditional factory configuration",
                           factory=contract_address,
                           topic=topic)
            
            logger.info("Querying blockchain for pool creation logs",
                       protocol=protocol,
                       contract=contract_address,
                       from_block=start_block,
                       to_block=end_block)
            
            # Get pool creation logs with timing
            log_start_time = asyncio.get_event_loop().time()
            
            logs = await self.blockchain_service.get_logs(
                from_block=start_block,
                to_block=end_block,
                address=contract_address,
                topics=[topic]
            )
            
            log_fetch_time = asyncio.get_event_loop().time() - log_start_time
            
            logger.info("Found pool creation logs",
                       protocol=pool_config["protocol"],
                       count=len(logs),
                       blocks_scanned=end_block - start_block + 1,
                       fetch_time_seconds=f"{log_fetch_time:.2f}",
                       logs_per_second=f"{len(logs) / max(log_fetch_time, 0.001):.1f}" if logs else "0")
            
            # Process logs in parallel batches for better performance
            if logs:
                processing_start_time = asyncio.get_event_loop().time()
                await self._process_logs_in_parallel(logs, pool_config["protocol"])
                processing_time = asyncio.get_event_loop().time() - processing_start_time
                
                logger.info("Completed log processing",
                           protocol=protocol,
                           processed_logs=len(logs),
                           processing_time_seconds=f"{processing_time:.2f}",
                           total_time_seconds=f"{log_fetch_time + processing_time:.2f}")
            else:
                logger.info("No logs to process for protocol", protocol=protocol)
                
        except Exception as e:
            logger.error("Failed to index pools for protocol",
                        protocol=pool_config.get("protocol"),
                        error=str(e))
            raise
    
    async def _index_pools_for_protocol_with_error_handling(
        self,
        pool_config: Dict[str, Any],
        start_block: int,
        end_block: int
    ) -> None:
        """Wrapper for protocol indexing with error handling and performance tracking."""
        protocol_name = pool_config.get("protocol", "unknown")
        start_time = asyncio.get_event_loop().time()
        
        try:
            logger.info("Starting protocol indexing", 
                       protocol=protocol_name,
                       start_block=start_block,
                       end_block=end_block)
            
            await self._index_pools_for_protocol(pool_config, start_block, end_block)
            
            end_time = asyncio.get_event_loop().time()
            duration = end_time - start_time
            
            logger.info("Protocol indexing completed successfully", 
                       protocol=protocol_name,
                       duration_seconds=duration,
                       blocks_processed=end_block - start_block + 1,
                       blocks_per_second=round((end_block - start_block + 1) / duration, 2) if duration > 0 else 0)
            
        except Exception as e:
            end_time = asyncio.get_event_loop().time()
            duration = end_time - start_time
            
            logger.error("Protocol indexing failed", 
                        protocol=protocol_name,
                        error=str(e),
                        duration_seconds=duration,
                        error_type=type(e).__name__)
            raise
    
    async def _process_logs_in_parallel(self, logs: List[Dict[str, Any]], protocol: str) -> None:
        """Process multiple logs in parallel with batch optimization."""
        if not logs:
            return
        
        logger.info("Starting parallel log processing", 
                   protocol=protocol,
                   total_logs=len(logs))
        
        # Configuration for parallel processing
        max_concurrent_logs = min(
            len(logs), 
            self.settings.max_concurrent_logs_per_protocol,
            self.settings.worker_pool_size * 2
        )
        batch_size = max(1, min(self.settings.log_batch_size, len(logs) // max_concurrent_logs))
        
        # Split logs into batches
        log_batches = [
            logs[i:i + batch_size] 
            for i in range(0, len(logs), batch_size)
        ]
        
        logger.info("Processing logs in parallel batches",
                   protocol=protocol,
                   total_batches=len(log_batches),
                   max_concurrent=max_concurrent_logs,
                   batch_size=batch_size)
        
        start_time = asyncio.get_event_loop().time()
        processed_count = 0
        error_count = 0
        
        # Create semaphore to limit concurrent processing
        semaphore = asyncio.Semaphore(max_concurrent_logs)
        
        # Process batches concurrently
        tasks = []
        for batch_idx, log_batch in enumerate(log_batches):
            task = asyncio.create_task(
                self._process_log_batch_with_semaphore(
                    semaphore, log_batch, protocol, batch_idx
                ),
                name=f"log-batch-{protocol}-{batch_idx}"
            )
            tasks.append(task)
        
        # Wait for all batches to complete
        batch_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Collect results
        for batch_idx, result in enumerate(batch_results):
            if isinstance(result, Exception):
                error_count += len(log_batches[batch_idx])
                logger.error("Log batch processing failed",
                           protocol=protocol,
                           batch_idx=batch_idx,
                           error=str(result))
            else:
                processed_count += result
        
        end_time = asyncio.get_event_loop().time()
        duration = end_time - start_time
        
        logger.info("Parallel log processing completed",
                   protocol=protocol,
                   total_logs=len(logs),
                   processed_count=processed_count,
                   error_count=error_count,
                   duration_seconds=duration,
                   logs_per_second=round(len(logs) / duration, 2) if duration > 0 else 0)
    
    async def _process_log_batch_with_semaphore(
        self, 
        semaphore: asyncio.Semaphore, 
        log_batch: List[Dict[str, Any]], 
        protocol: str, 
        batch_idx: int
    ) -> int:
        """Process a batch of logs with semaphore control."""
        async with semaphore:
            try:
                logger.debug("Processing log batch",
                           protocol=protocol,
                           batch_idx=batch_idx,
                           batch_size=len(log_batch))
                
                # Process logs in this batch concurrently
                batch_tasks = []
                for log in log_batch:
                    task = asyncio.create_task(
                        self._process_pool_creation_log(log, protocol),
                        name=f"log-{protocol}-{log.get('transactionHash', 'unknown')}"
                    )
                    batch_tasks.append(task)
                
                # Wait for all logs in batch to complete
                await asyncio.gather(*batch_tasks, return_exceptions=True)
                
                logger.debug("Log batch completed",
                           protocol=protocol,
                           batch_idx=batch_idx,
                           processed_count=len(log_batch))
                
                return len(log_batch)
                
            except Exception as e:
                logger.error("Error processing log batch",
                           protocol=protocol,
                           batch_idx=batch_idx,
                           error=str(e))
                raise
    
    async def _process_pool_creation_log(self, log: Dict[str, Any], protocol: str) -> None:
        """Process a single pool creation log."""
        try:
            # Parse pool info from log
            pool_info = await self.blockchain_service.parse_pool_created_event(log, protocol)
            
            if not pool_info:
                logger.warning("Failed to parse pool creation log", tx_hash=log.get("transactionHash"))
                return
            
            # Check for deduplication
            dedup_key = f"pool_processed:{pool_info.chain_id}:{pool_info.pool_address}"
            
            if await self.cache_repo.exists(dedup_key):
                logger.debug("Pool already processed, skipping", pool_address=pool_info.pool_address)
                return
            
            try:
                # Save pool to database (batch operation will be handled by repository)
                await self.pool_repo.save_pool(pool_info)
                
                # Mark as processed only after successful save (TTL: 24 hours)
                await self.cache_repo.set(dedup_key, "1", ttl=86400)
                
            except Exception as save_error:
                # Clear cache key if save fails to allow retry
                try:
                    await self.cache_repo.delete(dedup_key)
                    logger.warning("Cleared cache key after save failure", 
                                 pool_address=pool_info.pool_address,
                                 save_error=str(save_error))
                except Exception as cache_error:
                    logger.error("Failed to clear cache key after save failure",
                               pool_address=pool_info.pool_address,
                               cache_error=str(cache_error))
                raise save_error
            
            logger.debug("Indexed new pool",  # Changed to debug to reduce log noise in parallel processing
                        pool_address=pool_info.pool_address,
                        protocol=pool_info.protocol,
                        token0=pool_info.token0_address[:8] + "...",  # Use address prefix from logs
                        token1=pool_info.token1_address[:8] + "...")
            
            # Immediately start indexing swaps for this new pool (non-blocking)
            asyncio.create_task(self._index_pool_swaps(pool_info))
            
            # Notify swap worker about new pool for future processing
            try:
                self._new_pools_queue.put_nowait(pool_info)
                self._new_pool_event.set()
            except asyncio.QueueFull:
                pass  # Queue full, swap worker will catch up in next cycle
            
        except Exception as e:
            logger.error("Failed to process pool creation log",
                        tx_hash=log.get("transactionHash"),
                        error=str(e))
            # Don't re-raise to continue processing other logs
    
    async def _index_pool_swaps(self, pool: PoolInfo) -> None:
        """Index swap events for a specific pool."""
        try:
            # Acquire lock for this specific pool
            lock_key = f"swap_indexer:{pool.chain_id}:{pool.pool_address}"
            
            if not await self.cache_repo.acquire_lock(lock_key, self.settings.lock_timeout_seconds):
                logger.debug("Another instance is indexing this pool, skipping",
                           pool_address=pool.pool_address)
                return

            try:
                await self._process_pool_swaps(pool)
                
                # Also index liquidity events for protocols that support it
                if await self._should_index_liquidity_events(pool):
                    await self._process_pool_liquidity_events(pool)
                    
            finally:
                await self.cache_repo.release_lock(lock_key)
                
        except Exception as e:
            logger.error("Failed to index pool swaps",
                        pool_address=pool.pool_address,
                        error=str(e))
    
    async def _should_index_liquidity_events(self, pool: PoolInfo) -> bool:
        """Check if we should index liquidity events for this pool."""
        try:
            parser = self.blockchain_service.protocol_factory.get_parser(pool.protocol)
            return parser and parser.supports_liquidity_tracking()
        except Exception:
            return False
    
    async def _process_pool_liquidity_events(self, pool: PoolInfo) -> None:
        """Process liquidity modification events for a pool (e.g., Uniswap V4 ModifyLiquidity)."""
        try:
            # Get current progress for liquidity events
            progress = await self.progress_repo.get_progress(
                pool.chain_id,
                "liquidity",
                pool.pool_address
            )
            
            # Get current blockchain state
            latest_block = await self.blockchain_service.get_latest_block()
            
            if progress:
                start_block = progress.last_processed_block + 1
            else:
                # Start from pool creation block or recent history
                chain_max_range = getattr(self.chain_config, 'max_block_range', 2000)
                lookback_blocks = min(self.settings.max_blocks_per_request, chain_max_range)
                start_block = max(
                    pool.creation_block,
                    latest_block - lookback_blocks
                )
                logger.info("Starting liquidity event indexing for new pool",
                           pool_address=pool.pool_address,
                           creation_block=pool.creation_block,
                           start_block=start_block,
                           latest_block=latest_block)
            
            if start_block > latest_block:
                logger.debug("Liquidity events: start block ahead of latest block",
                           start_block=start_block,
                           latest_block=latest_block,
                           pool_address=pool.pool_address)
                return
            
            # Process blocks in chunks
            block_range = min(self.settings.max_blocks_per_request, latest_block - start_block + 1)
            end_block = min(start_block + block_range - 1, latest_block)
            
            logger.info("Processing liquidity events for pool",
                       pool_address=pool.pool_address,
                       protocol=pool.protocol,
                       start_block=start_block,
                       end_block=end_block,
                       block_range=block_range)
            
            # Get protocol configuration to find liquidity event topic
            pool_config = self._get_pool_config_for_protocol(pool.protocol)
            if not pool_config:
                logger.warning("No pool config found for protocol", protocol=pool.protocol)
                return
            
            # Get liquidity event topic (currently only V4 supports this)
            liquidity_topic = pool_config.get("modify_liquidity_topic")
            if not liquidity_topic:
                logger.debug("No liquidity topic configured for protocol", protocol=pool.protocol)
                return
            
            # Determine contract address based on protocol
            if pool.protocol == PoolProtocol.UNISWAP_V4:
                # For V4, events come from PoolManager
                contract_address = pool_config.get("pool_manager")
            else:
                # For other protocols, might be different - expand as needed
                contract_address = pool.pool_address
            
            if not contract_address:
                logger.warning("No contract address for liquidity events", protocol=pool.protocol)
                return
            
            # Get liquidity modification logs
            logs = await self.blockchain_service.get_logs(
                from_block=start_block,
                to_block=end_block,
                address=contract_address,
                topics=[liquidity_topic]
            )
            
            logger.info("Found liquidity modification logs",
                       pool_address=pool.pool_address,
                       protocol=pool.protocol,
                       count=len(logs))
            
            # Process each log
            processed_count = 0
            for log in logs:
                try:
                    # Parse liquidity event
                    liquidity_event = await self.blockchain_service.parse_liquidity_event(log, pool)
                    
                    if liquidity_event:
                        # For now, just log the event - can save to DB later
                        logger.info("Processed liquidity event",
                                   pool_address=pool.pool_address,
                                   tx_hash=liquidity_event.tx_hash,
                                   sender=liquidity_event.sender,
                                   liquidity_delta=liquidity_event.liquidity_delta,
                                   tick_lower=liquidity_event.tick_lower,
                                   tick_upper=liquidity_event.tick_upper)
                        processed_count += 1
                    
                except Exception as e:
                    logger.error("Failed to process liquidity event",
                               pool_address=pool.pool_address,
                               tx_hash=log.get("transactionHash"),
                               error=str(e))
                    continue
            
            # Update progress
            await self.progress_repo.update_progress(
                pool.chain_id,
                "liquidity",
                end_block,
                pool_identifier=pool.pool_address
            )
            
            logger.info("Completed liquidity event processing",
                       pool_address=pool.pool_address,
                       processed_events=processed_count,
                       end_block=end_block)
            
        except Exception as e:
            logger.error("Failed to process pool liquidity events",
                        pool_address=pool.pool_address,
                        error=str(e))
    
    def _get_pool_config_for_protocol(self, protocol: PoolProtocol) -> Optional[Dict[str, Any]]:
        """Get pool configuration for a specific protocol."""
        for pool_config in self.chain_config.pools:
            if pool_config.get("protocol") == protocol:
                return pool_config
        return None
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _process_pool_swaps(self, pool: PoolInfo) -> None:
        """Process swap events for a pool."""
        try:
            # Get current progress for this pool
            progress = await self.progress_repo.get_progress(
                pool.chain_id,
                "swaps",
                pool.pool_address
            )
            
            # Get current blockchain state
            latest_block = await self.blockchain_service.get_latest_block()
            
            if progress:
                # Resume from last processed block
                start_block = progress.last_processed_block + 1
            else:
                # For new pools, start from recent history instead of creation_block
                # Use current block minus max_block_range to avoid processing too much historical data
                chain_max_range = getattr(self.chain_config, 'max_block_range', 2000)
                lookback_blocks = min(self.settings.max_blocks_per_request, chain_max_range)
                start_block = max(
                    pool.creation_block,  # Don't go before pool was created
                    latest_block - lookback_blocks  # But also don't go too far back
                )
                logger.info("Starting swap indexing for new pool from recent history",
                           pool_address=pool.pool_address,
                           creation_block=pool.creation_block,
                           start_block=start_block,
                           latest_block=latest_block,
                           lookback_blocks=lookback_blocks)
            
            if start_block > latest_block:
                logger.debug("Start block ahead of latest block, skipping",
                           start_block=start_block,
                           latest_block=latest_block,
                           pool_address=pool.pool_address)
                return
            
            # Process blocks in chunks
            end_block = min(start_block + self.settings.max_blocks_per_request, latest_block)
            
            # Get swap event topic based on protocol
            # pool.protocol is an Enum; config stores protocol names as strings
            swap_topic = self._get_swap_event_topic(getattr(pool.protocol, "value", pool.protocol))
            
            if not swap_topic:
                return
            
            # Get swap logs
            logs = await self.blockchain_service.get_logs(
                from_block=start_block,
                to_block=end_block,
                address=pool.pool_address,
                topics=[swap_topic]
            )
            
            # Process swap events
            for log in logs:
                await self._process_swap_log(log, pool)
            
            # Update progress
            await self.progress_repo.update_progress(
                pool.chain_id,
                "swaps",
                end_block,
                pool_address=pool.pool_address,
                status="running"
            )
            
            # Update pool's last indexed block
            await self.pool_repo.update_pool_status(
                pool.chain_id,
                pool.pool_address,
                "active",
                end_block
            )
            
            if logs:
                logger.info("Processed swap events",
                           pool_address=pool.pool_address,
                           protocol=pool.protocol,
                           events_count=len(logs),
                           start_block=start_block,
                           end_block=end_block,
                           blocks_processed=end_block - start_block + 1)
            else:
                logger.debug("No swap events found in block range",
                           pool_address=pool.pool_address,
                           protocol=pool.protocol,
                           start_block=start_block,
                           end_block=end_block)
            
        except Exception as e:
            logger.error("Failed to process pool swaps",
                        pool_address=pool.pool_address,
                        error=str(e))
            # Update progress with error
            await self.progress_repo.update_progress(
                pool.chain_id,
                "swaps",
                start_block - 1 if 'start_block' in locals() else 0,
                pool_address=pool.pool_address,
                status="error",
                error_message=str(e)
            )
            raise
    
    async def _process_swap_log(self, log: Dict[str, Any], pool: PoolInfo) -> None:
        """Process a single swap log."""
        try:
            # Check for deduplication
            dedup_key = f"swap_processed:{log['transactionHash']}:{log['logIndex']}"
            
            if await self.cache_repo.exists(dedup_key):
                logger.debug("Swap already processed, skipping", 
                           tx_hash=log["transactionHash"],
                           log_index=log["logIndex"])
                return
            
            # Parse swap event
            swap_event = await self.blockchain_service.parse_swap_event(log, pool)
            
            if not swap_event:
                logger.warning("Failed to parse swap event", 
                             tx_hash=log["transactionHash"])
                return
            
            try:
                # Save swap event to database
                await self.pool_repo.save_swap_event(swap_event)
                
                # Price calculation disabled - raw swap data is sufficient
                
                # Mark as processed only after successful save (TTL: 7 days)
                await self.cache_repo.set(dedup_key, "1", ttl=604800)
                
            except Exception as save_error:
                # Clear cache key if save fails to allow retry
                try:
                    await self.cache_repo.delete(dedup_key)
                    logger.warning("Cleared swap cache key after save failure", 
                                 tx_hash=log["transactionHash"],
                                 save_error=str(save_error))
                except Exception as cache_error:
                    logger.error("Failed to clear swap cache key after save failure",
                               tx_hash=log["transactionHash"],
                               cache_error=str(cache_error))
                raise save_error
            
            logger.debug("Indexed swap event",
                        tx_hash=swap_event.tx_hash,
                        pool_address=swap_event.pool_address)
            
        except Exception as e:
            logger.error("Failed to process swap log",
                        tx_hash=log.get("transactionHash"),
                        error=str(e))
            # Don't re-raise to continue processing other logs
    
    def _get_swap_event_topic(self, protocol: str) -> Optional[str]:
        """Get swap event topic hash for protocol from config."""
        # Get from chain config instead of hardcoded values
        for pool_config in self.chain_config.pools:
            if pool_config["protocol"] == protocol and pool_config.get("enabled", True):
                return pool_config.get("swap_topic")
        
        logger.warning("No swap topic found for protocol", protocol=protocol)
        return None
    
    async def health_check(self) -> Dict[str, Any]:
        """Check health of all components."""
        try:
            health = {
                "status": "healthy",
                "timestamp": datetime.utcnow().isoformat(),
                "chain_id": self.chain_config.chain_id,
                "chain_name": self.chain_config.name,
                "components": {}
            }
            
            # Check blockchain connection
            try:
                latest_block = await self.blockchain_service.get_latest_block()
                health["components"]["blockchain"] = {
                    "status": "healthy",
                    "latest_block": latest_block
                }
            except Exception as e:
                health["components"]["blockchain"] = {
                    "status": "unhealthy",
                    "error": str(e)
                }
                health["status"] = "unhealthy"
            
            # Check database connections
            try:
                db_healthy = await self.pool_repo.health_check()
                health["components"]["database"] = {
                    "status": "healthy" if db_healthy else "unhealthy"
                }
                if not db_healthy:
                    health["status"] = "unhealthy"
            except Exception as e:
                health["components"]["database"] = {
                    "status": "unhealthy",
                    "error": str(e)
                }
                health["status"] = "unhealthy"
            
            # Check cache connection
            try:
                cache_healthy = await self.cache_repo.health_check()
                health["components"]["cache"] = {
                    "status": "healthy" if cache_healthy else "unhealthy"
                }
                if not cache_healthy:
                    health["status"] = "unhealthy"
            except Exception as e:
                health["components"]["cache"] = {
                    "status": "unhealthy",
                    "error": str(e)
                }
                health["status"] = "unhealthy"
            
            return health
            
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }