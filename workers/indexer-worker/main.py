#!/usr/bin/env python3
"""
MoonX Indexer Worker - Main Entry Point

A scalable indexer for liquidity pool data from DEX protocols.
Supports Uniswap, SushiSwap, PancakeSwap and other AMM protocols.
"""

import asyncio
import signal
import sys
from pathlib import Path
from typing import Dict, Any, List
import structlog
import click
from datetime import datetime

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from config.settings import get_settings, load_chain_configs, ChainConfig
from repositories.mongodb import MongoPoolRepository, MongoProgressRepository
from repositories.redis_cache import RedisCacheRepository
from services.indexer import IndexerService
from utils.logging import configure_logging

# Basic structlog setup for startup
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.make_filtering_bound_logger(20),  # INFO level
    logger_factory=structlog.WriteLoggerFactory(file=sys.stdout),
    cache_logger_on_first_use=False,
)

logger = structlog.get_logger()


class IndexerWorker:
    """Main indexer worker application."""
    
    def __init__(self, chain_id: int = None, reset_progress: bool = False):
        self.settings = get_settings()
        self.chain_configs = load_chain_configs()
        self.indexer_services: Dict[int, IndexerService] = {}
        self.is_running = False
        self.reset_progress = reset_progress
        
        # Log settings info (logging should already be configured by CLI)
        logger.info("IndexerWorker initialized", 
                   settings_log_level=self.settings.log_level, 
                   settings_log_format=self.settings.log_format,
                   available_chains=list(self.chain_configs.keys()),
                   reset_progress=reset_progress)
        
        # Filter chains if specific chain_id provided
        if chain_id and chain_id in self.chain_configs:
            self.chain_configs = {chain_id: self.chain_configs[chain_id]}
            logger.info("Filtered to specific chain", chain_id=chain_id)
        elif chain_id:
            raise ValueError(f"Chain ID {chain_id} not found in configuration")
    
    async def start(self) -> None:
        """Start the indexer worker."""
        try:
            logger.info("Starting MoonX Indexer Worker",
                       chains=list(self.chain_configs.keys()),
                       settings=self.settings.model_dump())
            
            # Reset progress if requested
            if self.reset_progress:
                logger.info("Resetting indexing progress for all chains...")
                for chain_id in self.chain_configs.keys():
                    try:
                        # Get progress repository for this chain  
                        progress_repo = MongoProgressRepository(
                            self.settings.mongodb_url,
                            self.settings.mongodb_database
                        )
                        await progress_repo.connect()
                        
                        # Delete progress records for this chain
                        await progress_repo.delete_progress(chain_id, "pools")
                        await progress_repo.delete_progress(chain_id, "swaps")
                        
                        await progress_repo.disconnect()
                        
                        logger.info("Reset progress for chain", chain_id=chain_id)
                    except Exception as e:
                        logger.error("Failed to reset progress", 
                                   chain_id=chain_id, 
                                   error=str(e))
                
                logger.info("Progress reset completed")
            
            # Initialize indexer services for each chain
            logger.info("Initializing indexer services for chains", 
                       total_chains=len(self.chain_configs))
            
            for chain_id, chain_config in self.chain_configs.items():
                logger.info("Initializing indexer for chain", 
                           chain_id=chain_id, 
                           chain_name=chain_config.name)
                await self._initialize_chain_indexer(chain_id, chain_config)
                logger.info("Chain indexer initialized successfully", chain_id=chain_id)
            
            if not self.indexer_services:
                logger.error("No indexer services initialized")
                return
            
            logger.info("All chain indexers initialized", 
                       total_services=len(self.indexer_services))
            
            self.is_running = True
            
            # Setup signal handlers for graceful shutdown
            logger.info("Setting up signal handlers for graceful shutdown")
            self._setup_signal_handlers()
            
            # Start all indexer services
            logger.info("Starting all indexer services...")
            tasks = []
            for chain_id, indexer_service in self.indexer_services.items():
                logger.info("Creating task for chain indexer", chain_id=chain_id)
                task = asyncio.create_task(
                    indexer_service.start(),
                    name=f"indexer-{chain_id}"
                )
                tasks.append(task)
            
            logger.info("All indexer services started and running", 
                       count=len(tasks),
                       chains=[f"indexer-{cid}" for cid in self.indexer_services.keys()])
            
            # Wait for all services to complete or error
            try:
                await asyncio.gather(*tasks)
            except asyncio.CancelledError:
                logger.info("Indexer services cancelled")
            
        except Exception as e:
            logger.error("Failed to start indexer worker", error=str(e))
            raise
        finally:
            await self.stop()
    
    async def _initialize_chain_indexer(self, chain_id: int, chain_config: ChainConfig) -> None:
        """Initialize indexer service for a specific chain."""
        try:
            logger.info("Initializing indexer for chain",
                       chain_id=chain_id,
                       chain_name=chain_config.name,
                       start_block=chain_config.start_block,
                       enabled_pools=len([p for p in chain_config.pools if p.get("enabled", True)]))
            
            # Initialize repositories
            logger.info("Creating MongoDB repositories", chain_id=chain_id)
            pool_repo = MongoPoolRepository(
                self.settings.mongodb_url,
                self.settings.mongodb_database
            )
            
            progress_repo = MongoProgressRepository(
                self.settings.mongodb_url,
                self.settings.mongodb_database
            )
            
            logger.info("Creating Redis cache repository", chain_id=chain_id)
            cache_repo = RedisCacheRepository(
                self.settings.redis_url,
                self.settings.redis_db,
                f"{self.settings.redis_key_prefix}:{chain_id}"
            )
            
            # Create indexer service
            logger.info("Creating indexer service instance", chain_id=chain_id)
            indexer_service = IndexerService(
                self.settings,
                chain_config,
                pool_repo,
                progress_repo,
                cache_repo
            )
            
            self.indexer_services[chain_id] = indexer_service
            
            logger.info("Successfully initialized indexer for chain",
                       chain_id=chain_id,
                       chain_name=chain_config.name,
                       total_protocols=len(chain_config.pools))
            
        except Exception as e:
            logger.error("Failed to initialize chain indexer",
                        chain_id=chain_id,
                        error=str(e))
            raise
    
    async def stop(self) -> None:
        """Stop the indexer worker gracefully."""
        if not self.is_running:
            logger.info("Indexer worker already stopped")
            return
        
        logger.info("Starting graceful shutdown of MoonX Indexer Worker",
                   total_services=len(self.indexer_services))
        
        start_time = datetime.utcnow()
        self.is_running = False
        
        # Stop all indexer services with timeout
        shutdown_timeout = 30  # seconds
        stop_tasks = []
        
        for chain_id, indexer_service in self.indexer_services.items():
            logger.info("Initiating shutdown for chain indexer", chain_id=chain_id)
            task = asyncio.create_task(
                self._stop_service_with_timeout(indexer_service, chain_id, shutdown_timeout),
                name=f"stop-indexer-{chain_id}"
            )
            stop_tasks.append(task)
        
        # Wait for all services to stop
        if stop_tasks:
            logger.info("Waiting for all indexer services to stop gracefully",
                       timeout_seconds=shutdown_timeout)
            
            try:
                # Use asyncio.wait instead of wait_for to handle timeout better
                done, pending = await asyncio.wait(
                    stop_tasks, 
                    timeout=shutdown_timeout,
                    return_when=asyncio.ALL_COMPLETED
                )
                
                if pending:
                    logger.warning("Some services did not stop within timeout, forcing shutdown",
                                 timeout_seconds=shutdown_timeout,
                                 pending_count=len(pending))
                    
                    # Force cancel remaining tasks
                    for task in pending:
                        logger.info("Cancelling pending shutdown task")
                        task.cancel()
                    
                    # Wait briefly for forced shutdown
                    if pending:
                        try:
                            await asyncio.wait(pending, timeout=5.0)
                        except Exception as e:
                            logger.warning("Error waiting for cancelled tasks", error=str(e))
                
                # Log results
                for task in done:
                    try:
                        result = task.result()
                        logger.info("Shutdown task completed")
                    except asyncio.CancelledError:
                        logger.info("Shutdown task was cancelled")
                    except Exception as e:
                        logger.warning("Shutdown task failed", error=str(e))
                        
            except asyncio.CancelledError:
                logger.info("Shutdown process was cancelled")
                # Cancel all remaining tasks
                for task in stop_tasks:
                    if not task.done():
                        task.cancel()
            except Exception as e:
                logger.error("Error during shutdown", error=str(e))
                # Cancel all remaining tasks
                for task in stop_tasks:
                    if not task.done():
                        task.cancel()
        
        # Clear services
        self.indexer_services.clear()
        
        end_time = datetime.utcnow()
        shutdown_duration = (end_time - start_time).total_seconds()
        
        logger.info("MoonX Indexer Worker stopped successfully",
                   shutdown_duration_seconds=shutdown_duration)
    
    async def _stop_service_with_timeout(self, service: IndexerService, chain_id: int, timeout: float) -> None:
        """Stop a service with timeout and detailed logging."""
        try:
            logger.info("Stopping indexer service", chain_id=chain_id)
            
            start_time = datetime.utcnow()
            await asyncio.wait_for(service.stop(), timeout=timeout)
            
            end_time = datetime.utcnow()
            stop_duration = (end_time - start_time).total_seconds()
            
            logger.info("Successfully stopped indexer service", 
                       chain_id=chain_id,
                       stop_duration_seconds=stop_duration)
                       
        except asyncio.CancelledError:
            logger.info("Service shutdown was cancelled", 
                       chain_id=chain_id)
            # Don't re-raise CancelledError, let it propagate naturally
            raise
        except asyncio.TimeoutError:
            logger.warning("Service shutdown timeout exceeded, forcing stop",
                          chain_id=chain_id,
                          timeout_seconds=timeout)
            # Continue with shutdown even if timeout
        except Exception as e:
            logger.error("Error stopping indexer service",
                        chain_id=chain_id,
                        error=str(e))
            # Continue with shutdown even if error
    
    def _setup_signal_handlers(self) -> None:
        """Setup signal handlers for graceful shutdown."""
        shutdown_event = asyncio.Event()
        force_shutdown_event = asyncio.Event()
        self._shutdown_event = shutdown_event
        self._force_shutdown_event = force_shutdown_event
        
        def signal_handler(signum, frame):
            signal_name = {
                signal.SIGINT: "SIGINT (Ctrl+C)",
                signal.SIGTERM: "SIGTERM"
            }.get(signum, f"Signal {signum}")
            
            # First signal - graceful shutdown
            if not shutdown_event.is_set():
                logger.info("Received shutdown signal, initiating graceful shutdown",
                           signal=signum,
                           signal_name=signal_name)
                
                shutdown_event.set()
                
                # Schedule graceful shutdown
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self._handle_graceful_shutdown())
                except RuntimeError:
                    # Event loop not available, exit immediately
                    logger.error("No event loop available, exiting immediately")
                    exit(1)
            
            # Second signal - force immediate shutdown  
            elif not force_shutdown_event.is_set():
                logger.warning("Second shutdown signal received, forcing immediate shutdown",
                             signal=signum)
                force_shutdown_event.set()
                
                # Exit immediately on second signal
                logger.info("Forcing immediate exit due to second signal")
                exit(1)
            
            # Third signal - hard exit
            else:
                logger.error("Third shutdown signal received, hard exit")
                exit(2)
        
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        logger.info("Signal handlers configured for graceful shutdown")
    
    async def _handle_graceful_shutdown(self) -> None:
        """Handle graceful shutdown process."""
        try:
            logger.info("Starting graceful shutdown process")
            
            # Check if force shutdown was requested
            if hasattr(self, '_force_shutdown_event') and self._force_shutdown_event.is_set():
                logger.info("Force shutdown requested, skipping graceful shutdown")
                return
            
            await self.stop()
            
            # Exit cleanly
            logger.info("Graceful shutdown completed successfully")
            
            # Clean up remaining tasks
            current_task = asyncio.current_task()
            tasks = [task for task in asyncio.all_tasks() if task != current_task and not task.done()]
            
            if tasks:
                logger.info("Cleaning up remaining tasks", count=len(tasks))
                for task in tasks:
                    if not task.done():
                        task.cancel()
                
                # Wait briefly for tasks to finish
                try:
                    await asyncio.wait_for(
                        asyncio.gather(*tasks, return_exceptions=True),
                        timeout=5.0
                    )
                except asyncio.TimeoutError:
                    logger.warning("Some tasks did not finish during cleanup")
                except Exception as e:
                    logger.warning("Error during task cleanup", error=str(e))
                    
        except asyncio.CancelledError:
            logger.info("Graceful shutdown was cancelled")
            raise
        except Exception as e:
            logger.error("Error during graceful shutdown", error=str(e))
        finally:
            logger.info("Shutdown process completed")
    
    async def health_check(self) -> Dict[str, Any]:
        """Get health status of all indexer services."""
        health = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "services": {}
        }
        
        for chain_id, indexer_service in self.indexer_services.items():
            try:
                service_health = await indexer_service.health_check()
                health["services"][str(chain_id)] = service_health
                
                if service_health.get("status") != "healthy":
                    health["status"] = "unhealthy"
            except Exception as e:
                health["services"][str(chain_id)] = {
                    "status": "unhealthy",
                    "error": str(e)
                }
                health["status"] = "unhealthy"
        
        return health


# CLI Commands
@click.group()
def cli():
    """MoonX Indexer Worker CLI"""
    pass


@cli.command()
@click.option('--chain-id', type=int, help='Specific chain ID to index (optional)')
@click.option('--log-format', type=click.Choice(['json', 'console']), help='Log output format (overrides MOONX_LOG_FORMAT)')
@click.option('--log-level', type=click.Choice(['DEBUG', 'INFO', 'WARNING', 'ERROR']), help='Log level (overrides MOONX_LOG_LEVEL)')
@click.option('--debug', is_flag=True, help='Enable debug logging (same as --log-level DEBUG)')
@click.option('--reset-progress', is_flag=True, help='Reset indexing progress and start fresh')
def start(chain_id: int = None, log_format: str = None, log_level: str = None, debug: bool = False, reset_progress: bool = False):
    """Start the indexer worker."""
    
    # Load settings to get defaults
    settings = get_settings()
    
    # Determine effective log level
    if debug:
        effective_log_level = "DEBUG"
    elif log_level:
        effective_log_level = log_level
    else:
        effective_log_level = settings.log_level
    
    # Determine effective log format  
    if log_format:
        effective_log_format = log_format
    else:
        effective_log_format = getattr(settings, 'log_format', 'console')
    
    # Print startup info to console for immediate feedback
    print(f"🚀 Starting MoonX Indexer Worker...")
    print(f"📊 Log format: {effective_log_format} (env: {settings.log_format})")
    print(f"📋 Log level: {effective_log_level} (env: {settings.log_level})")
    if chain_id:
        print(f"⛓️  Chain ID: {chain_id}")
    if reset_progress:
        print(f"🔄 Reset progress: {reset_progress} (will start fresh)")
    print("=" * 50)
    sys.stdout.flush()  # Ensure immediate output
    
    # Configure logging with effective settings
    try:
        configure_logging(effective_log_level, effective_log_format)
        
        # Test logging immediately
        logger = structlog.get_logger()
        logger.info("MoonX Indexer Worker starting", 
                   log_format=effective_log_format, 
                   log_level=effective_log_level,
                   debug_flag=debug,
                   chain_id=chain_id,
                   env_log_level=settings.log_level,
                   env_log_format=settings.log_format)
    except Exception as e:
        print(f"❌ Logging configuration failed: {e}")
        sys.exit(1)
    
    worker = IndexerWorker(chain_id, reset_progress=reset_progress)
    
    try:
        asyncio.run(worker.start())
    except KeyboardInterrupt:
        logger.info("Indexer worker interrupted by user")
        print("\n👋 Indexer worker stopped by user")
    except Exception as e:
        logger.error("Indexer worker failed", error=str(e))
        print(f"❌ Error: {e}")
        sys.exit(1)


@cli.command()
def health():
    """Check health of indexer services."""
    async def check_health():
        worker = IndexerWorker()
        
        # Initialize services for health check
        for chain_id, chain_config in worker.chain_configs.items():
            await worker._initialize_chain_indexer(chain_id, chain_config)
        
        health_status = await worker.health_check()
        
        # Cleanup
        await worker.stop()
        
        return health_status
    
    try:
        health_status = asyncio.run(check_health())
        
        click.echo(f"Status: {health_status['status']}")
        click.echo(f"Timestamp: {health_status['timestamp']}")
        
        for chain_id, service_health in health_status.get('services', {}).items():
            click.echo(f"\nChain {chain_id}:")
            click.echo(f"  Status: {service_health.get('status', 'unknown')}")
            click.echo(f"  Chain Name: {service_health.get('chain_name', 'unknown')}")
            
            components = service_health.get('components', {})
            for component, comp_health in components.items():
                click.echo(f"  {component.title()}: {comp_health.get('status', 'unknown')}")
                if comp_health.get('error'):
                    click.echo(f"    Error: {comp_health['error']}")
        
        if health_status['status'] != 'healthy':
            sys.exit(1)
            
    except Exception as e:
        click.echo(f"Health check failed: {e}")
        sys.exit(1)


@cli.command()
def config():
    """Show current configuration."""
    settings = get_settings()
    chain_configs = load_chain_configs()
    
    click.echo("=== MoonX Indexer Configuration ===\n")
    
    click.echo("Settings:")
    for key, value in settings.model_dump().items():
        if 'url' in key.lower() or 'password' in key.lower():
            # Mask sensitive information
            value = "***masked***"
        click.echo(f"  {key}: {value}")
    
    click.echo(f"\nSupported Chains ({len(chain_configs)}):")
    for chain_id, config in chain_configs.items():
        click.echo(f"  {chain_id}: {config.name}")
        click.echo(f"    RPC: {config.rpc_url}")
        click.echo(f"    Start Block: {config.start_block}")
        click.echo(f"    Protocols: {len(config.pools)}")
        for pool_config in config.pools:
            click.echo(f"      - {pool_config['protocol']}")


@cli.command()
@click.argument('chain_id', type=int)
def test_connection(chain_id: int):
    """Test blockchain connection for a specific chain."""
    async def test_chain_connection():
        chain_configs = load_chain_configs()
        
        if chain_id not in chain_configs:
            click.echo(f"Chain ID {chain_id} not found in configuration")
            return False
        
        chain_config = chain_configs[chain_id]
        
        from services.blockchain_service import BlockchainService
        
        blockchain_service = BlockchainService(chain_config)
        
        try:
            await blockchain_service.connect()
            
            latest_block = await blockchain_service.get_latest_block()
            click.echo(f"✓ Connected to {chain_config.name} (Chain ID: {chain_id})")
            click.echo(f"✓ Latest block: {latest_block}")
            
            return True
            
        except Exception as e:
            click.echo(f"✗ Failed to connect to {chain_config.name}: {e}")
            return False
        finally:
            await blockchain_service.disconnect()
    
    try:
        success = asyncio.run(test_chain_connection())
        if not success:
            sys.exit(1)
    except Exception as e:
        click.echo(f"Connection test failed: {e}")
        sys.exit(1)


@cli.command()
@click.option('--chain-id', type=int, default=8453, help='Chain ID to debug')
def debug_blockchain(chain_id: int):
    """Debug blockchain connection and data."""
    async def debug():
        print(f"🔍 Debugging blockchain connection for chain {chain_id}...")
        
        # Load config
        settings = get_settings()
        chain_configs = load_chain_configs()
        
        if chain_id not in chain_configs:
            print(f"❌ Chain {chain_id} not found in configuration")
            return
            
        chain_config = chain_configs[chain_id]
        print(f"✅ Chain: {chain_config.name}")
        print(f"📡 RPC: {chain_config.rpc_url}")
        print(f"🏁 Start block: {chain_config.start_block}")
        
        # Test blockchain connection
        from services.blockchain_service import BlockchainService
        blockchain_service = BlockchainService(chain_config)
        
        try:
            await blockchain_service.connect()
            
            # Get current status
            latest_block = await blockchain_service.get_latest_block()
            print(f"🔢 Latest block: {latest_block}")
            print(f"📊 Block range: {chain_config.start_block} → {latest_block}")
            print(f"🔍 Difference: {latest_block - chain_config.start_block:,} blocks")
            
            # Test a recent range 
            recent_start = max(latest_block - 1000, chain_config.start_block)
            recent_end = latest_block
            
            print(f"\n🧪 Testing recent block range: {recent_start} → {recent_end}")
            
            # Test each protocol
            for pool_config in chain_config.pools:
                if not pool_config.get("enabled", True):
                    continue
                    
                protocol = pool_config["protocol"]
                print(f"\n🔎 Testing {protocol}:")
                
                # Get contract address and topic
                if protocol == "uniswap_v4":
                    contract = pool_config["pool_manager"]
                    topic = pool_config["pool_init_topic"]
                    print(f"   📍 Pool Manager: {contract}")
                else:
                    contract = pool_config["factory"]
                    topic = pool_config["pool_created_topic"]
                    print(f"   🏭 Factory: {contract}")
                
                print(f"   📝 Topic: {topic}")
                
                # Query recent logs
                try:
                    logs = await blockchain_service.get_logs(
                        from_block=recent_start,
                        to_block=recent_end,
                        address=contract,
                        topics=[topic]
                    )
                    print(f"   📋 Recent logs found: {len(logs)}")
                    
                    if logs:
                        print(f"   📄 Sample log: {logs[0]}")
                        
                except Exception as e:
                    print(f"   ❌ Query failed: {e}")
            
        except Exception as e:
            print(f"❌ Blockchain connection failed: {e}")
        finally:
            await blockchain_service.disconnect()
    
    try:
        asyncio.run(debug())
    except Exception as e:
        print(f"❌ Debug failed: {e}")


@cli.command()
@click.option('--chain-id', type=int, default=8453, help='Chain ID to benchmark')
@click.option('--blocks', type=int, default=100, help='Number of blocks to test')
def benchmark(chain_id: int, blocks: int):
    """Benchmark parallel vs sequential processing performance."""
    async def run_benchmark():
        print(f"🏁 Running performance benchmark...")
        print(f"⛓️  Chain ID: {chain_id}")
        print(f"📊 Blocks to test: {blocks}")
        print("=" * 50)
        
        # Load config
        settings = get_settings()
        chain_configs = load_chain_configs()
        
        if chain_id not in chain_configs:
            print(f"❌ Chain {chain_id} not found")
            return
            
        chain_config = chain_configs[chain_id]
        
        # Test blockchain connection
        from services.blockchain_service import BlockchainService
        blockchain_service = BlockchainService(chain_config)
        
        try:
            await blockchain_service.connect()
            latest_block = await blockchain_service.get_latest_block()
            start_block = latest_block - blocks
            end_block = latest_block
            
            print(f"📊 Testing block range: {start_block} → {end_block}")
            
            # Test each enabled protocol
            enabled_protocols = [p for p in chain_config.pools if p.get("enabled", True)]
            
            print(f"\n🔍 Testing {len(enabled_protocols)} protocols:")
            for protocol in enabled_protocols:
                print(f"   • {protocol['protocol']}")
            
            # Benchmark 1: Sequential Processing (old way)
            print(f"\n⏰ Testing Sequential Processing...")
            sequential_start = asyncio.get_event_loop().time()
            
            total_logs_sequential = 0
            for protocol in enabled_protocols:
                if protocol['protocol'] == 'uniswap_v4':
                    contract = protocol['pool_manager']
                    topic = protocol['pool_init_topic']
                else:
                    contract = protocol['factory']
                    topic = protocol['pool_created_topic']
                
                logs = await blockchain_service.get_logs(
                    from_block=start_block,
                    to_block=end_block,
                    address=contract,
                    topics=[topic]
                )
                total_logs_sequential += len(logs)
                print(f"   📋 {protocol['protocol']}: {len(logs)} logs")
            
            sequential_end = asyncio.get_event_loop().time()
            sequential_duration = sequential_end - sequential_start
            
            # Benchmark 2: Parallel Processing (new way)
            print(f"\n🚀 Testing Parallel Processing...")
            parallel_start = asyncio.get_event_loop().time()
            
            parallel_tasks = []
            for protocol in enabled_protocols:
                if protocol['protocol'] == 'uniswap_v4':
                    contract = protocol['pool_manager']
                    topic = protocol['pool_init_topic']
                else:
                    contract = protocol['factory']
                    topic = protocol['pool_created_topic']
                
                task = asyncio.create_task(
                    blockchain_service.get_logs(
                        from_block=start_block,
                        to_block=end_block,
                        address=contract,
                        topics=[topic]
                    )
                )
                parallel_tasks.append((protocol['protocol'], task))
            
            # Wait for all parallel tasks
            total_logs_parallel = 0
            for protocol_name, task in parallel_tasks:
                logs = await task
                total_logs_parallel += len(logs)
                print(f"   📋 {protocol_name}: {len(logs)} logs")
            
            parallel_end = asyncio.get_event_loop().time()
            parallel_duration = parallel_end - parallel_start
            
            # Results
            print(f"\n📊 BENCHMARK RESULTS:")
            print(f"   ⏰ Sequential: {sequential_duration:.2f}s")
            print(f"   🚀 Parallel: {parallel_duration:.2f}s")
            
            if sequential_duration > 0:
                speedup = sequential_duration / parallel_duration
                improvement = ((sequential_duration - parallel_duration) / sequential_duration) * 100
                print(f"   ⚡ Speedup: {speedup:.2f}x")
                print(f"   📈 Improvement: {improvement:.1f}%")
            
            print(f"   📋 Total logs: {total_logs_parallel}")
            
        except Exception as e:
            print(f"❌ Benchmark failed: {e}")
        finally:
            await blockchain_service.disconnect()
    
    try:
        asyncio.run(run_benchmark())
    except Exception as e:
        print(f"❌ Benchmark error: {e}")


@cli.command()
@click.option('--log-format', type=click.Choice(['json', 'console']), default='console', help='Log output format')
@click.option('--log-level', type=click.Choice(['DEBUG', 'INFO', 'WARNING', 'ERROR']), default='INFO', help='Log level')
def test_logging(log_format: str, log_level: str):
    """Test logging configuration."""
    print("🧪 Testing logging configuration...")
    print(f"📊 Format: {log_format}")
    print(f"📋 Level: {log_level}")
    print("=" * 40)
    
    try:
        # Configure logging
        configure_logging(log_level, log_format)
        
        # Get logger and test all levels
        logger = structlog.get_logger("test")
        
        print("\n📝 Testing log outputs:")
        logger.error("This is an ERROR message", test_type="error_test")
        logger.warning("This is a WARNING message", test_type="warning_test")
        logger.info("This is an INFO message", test_type="info_test")
        logger.debug("This is a DEBUG message", test_type="debug_test")
        
        print(f"\n✅ Logging test completed with format='{log_format}' and level='{log_level}'")
        print("💡 Use --log-format console for colored terminal output")
        print("💡 Use --log-format json for structured JSON output")
        print("💡 Set MOONX_LOG_LEVEL and MOONX_LOG_FORMAT environment variables for defaults")
        
    except Exception as e:
        print(f"❌ Logging test failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    cli()