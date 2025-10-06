"""Main token indexer service."""

import asyncio
from typing import List, Dict, Any, Optional
import structlog
from datetime import datetime, timedelta

from config.settings import Settings, ChainConfig
from repositories.mongodb import MongoTokenRepository, MongoProgressRepository
from repositories.redis_cache import RedisCacheRepository
from services.blockchain_service import BlockchainService
from services.parsers.creator_coin_parser import CreatorCoinParser
from services.parsers.creator_coin_v4_parser import CreatorCoinV4Parser
from services.parsers.clanker_parser import ClankerParser
from models.token import TokenInfo, CreatorCoinEvent, ClankerTokenEvent
from utils.kafka_producer import KafkaProducer
from utils.telegram_notifier import TelegramNotifier
from utils.ens_resolver import create_ens_resolver


logger = structlog.get_logger(__name__)


class TokenIndexerService:
    """Main token indexer service that orchestrates the token indexing process."""
    
    def __init__(
        self,
        settings: Settings,
        chain_config: ChainConfig,
        token_repo: MongoTokenRepository,
        progress_repo: MongoProgressRepository,
        cache_repo: RedisCacheRepository
    ):
        self.settings = settings
        self.chain_config = chain_config
        self.token_repo = token_repo
        self.progress_repo = progress_repo
        self.cache_repo = cache_repo
        
        self.blockchain_service = BlockchainService(chain_config)
        self.is_running = False
        
        # Initialize parsers
        self.parsers = {}
        
        # Initialize Kafka producer if configured
        self.kafka_producer = None
        if hasattr(settings, 'kafka_bootstrap_servers') and settings.kafka_bootstrap_servers:
            self.kafka_producer = KafkaProducer(
                settings.kafka_bootstrap_servers,
                getattr(settings, 'kafka_topic_prefix', 'moonx')
            )
        
        # Initialize Telegram notifier if configured
        self.telegram_notifier = None
        if (hasattr(settings, 'telegram_bot_token') and settings.telegram_bot_token and
            hasattr(settings, 'telegram_chat_ids') and settings.telegram_chat_ids):
            
            # Create ENS resolver with Web3 instances for Ethereum and Base
            # We'll set this up after blockchain service is connected
            self._telegram_settings = {
                'bot_token': settings.telegram_bot_token,
                'chat_ids': settings.telegram_chat_ids,
                'retake_chat_ids': getattr(settings, 'telegram_retake_chat_ids', None)
            }
    
    async def start(self) -> None:
        """Start the token indexer service."""
        try:
            logger.info("Starting Token Indexer Service",
                       chain_id=self.chain_config.chain_id,
                       chain_name=self.chain_config.name)
            
            # Connect to all services
            logger.info("Connecting to all services...")
            await self.blockchain_service.connect()
            await self.token_repo.connect()
            await self.progress_repo.connect()
            await self.cache_repo.connect()
            
            if self.kafka_producer:
                await self.kafka_producer.connect()
            
            # Initialize parsers with web3 instance
            self._initialize_parsers()
            
            # Initialize Telegram notifier (without ENS resolver initially)
            self._initialize_telegram_notifier()
            
            # Connect to Telegram after notifier is initialized (non-blocking)
            if self.telegram_notifier:
                try:
                    await self.telegram_notifier.connect()
                except Exception as e:
                    logger.error("Failed to connect to Telegram, continuing without notifications", 
                               error=str(e))
                    # Don't crash service - continue without Telegram
                
            # Setup ENS resolver asynchronously (non-blocking)
            if self.telegram_notifier and hasattr(self, '_telegram_settings'):
                asyncio.create_task(self._setup_ens_resolver_async())
            
            self.is_running = True
            
            logger.info("Token indexer service started successfully",
                       chain_id=self.chain_config.chain_id)
            
            # Start main indexing loop
            await self._run_indexing_loop()
            
        except Exception as e:
            logger.error("Failed to start token indexer service", error=str(e))
            raise
        finally:
            await self.stop()
    
    def _initialize_parsers(self) -> None:
        """Initialize event parsers based on configuration."""
        web3_instance = self.blockchain_service.web3
        
        # Create parser instances based on config
        self.parsers = {}
        parser_classes = {
            "creator_coin_parser": CreatorCoinParser,
            "creator_coin_v4_parser": CreatorCoinV4Parser, 
            "clanker_parser": ClankerParser
        }
        
        total_parsers = 0
        
        # Iterate through contracts in config
        for contract_key, contract_config in self.chain_config.contracts.items():
            contract_address = contract_config["address"]
            events_config = contract_config.get("events", {})
            
            if contract_address not in self.parsers:
                self.parsers[contract_address] = []
            
            # Create parser instances for each event
            for event_name, event_config in events_config.items():
                parser_name = event_config.get("parser")
                event_signature = event_config.get("signature")
                
                if not parser_name or not event_signature:
                    logger.warning("Missing parser or signature in config",
                                 contract_key=contract_key,
                                 event_name=event_name)
                    continue
                
                parser_class = parser_classes.get(parser_name)
                if not parser_class:
                    logger.warning("Unknown parser class",
                                 parser_name=parser_name,
                                 event_name=event_name)
                    continue
                
                # Create parser instance with config-provided signature
                parser_instance = parser_class(web3_instance, event_signature)
                self.parsers[contract_address].append(parser_instance)
                total_parsers += 1
                
                logger.debug("Initialized parser",
                           contract_key=contract_key,
                           contract_address=contract_address,
                           event_name=event_name,
                           parser_class=parser_name,
                           event_signature=event_signature)
        
        logger.info("Initialized token event parsers",
                   parser_count=total_parsers,
                   contracts=list(self.parsers.keys()),
                   contracts_config=list(self.chain_config.contracts.keys()))
    
    def _initialize_telegram_notifier(self) -> None:
        """Initialize basic Telegram notifier without ENS resolver."""
        if not hasattr(self, '_telegram_settings') or not self._telegram_settings:
            return
        
        try:
            # Create basic Telegram notifier without ENS resolver
            self.telegram_notifier = TelegramNotifier(
                self._telegram_settings['bot_token'],
                self._telegram_settings['chat_ids'],
                retake_chat_ids=self._telegram_settings.get('retake_chat_ids')
            )
            
            retake_count = len(self._telegram_settings.get('retake_chat_ids', [])) if self._telegram_settings.get('retake_chat_ids') else 0
            logger.info("Telegram notifier initialized",
                       chat_count=len(self._telegram_settings['chat_ids']),
                       retake_chat_count=retake_count)
            
        except Exception as e:
            logger.error("Failed to initialize Telegram notifier", error=str(e))
            self.telegram_notifier = None
    
    async def _setup_ens_resolver_async(self) -> None:
        """Setup ENS resolver asynchronously without blocking main flow."""
        if not self.telegram_notifier:
            return
            
        try:
            logger.info("Starting async ENS resolver setup...")
            
            # Create Web3 instances for ENS resolution
            web3_instances = {}
            
            # Add current chain Web3 instance
            if self.blockchain_service.web3:
                web3_instances[self.chain_config.chain_id] = self.blockchain_service.web3
            
            # Setup Ethereum RPC connection for ENS (if not current chain)
            if self.chain_config.chain_id != 1:
                try:
                    eth_web3 = await self._create_rpc_connection_async(
                        self.settings.ens_ethereum_rpc_url,
                        1,
                        "Ethereum"
                    )
                    if eth_web3:
                        web3_instances[1] = eth_web3
                except Exception as e:
                    logger.debug("Failed to setup Ethereum RPC for ENS", error=str(e))
            
            # Setup Base RPC connection for ENS (if not current chain)
            if self.chain_config.chain_id != 8453:
                try:
                    base_web3 = await self._create_rpc_connection_async(
                        self.settings.ens_base_rpc_url,
                        8453,
                        "Base"
                    )
                    if base_web3:
                        web3_instances[8453] = base_web3
                except Exception as e:
                    logger.debug("Failed to setup Base RPC for ENS", error=str(e))
            
            # Create ENS resolver if we have Web3 instances
            if len(web3_instances) > 1:  # More than just current chain
                try:
                    ens_resolver = create_ens_resolver(web3_instances)
                    
                    # Update existing telegram notifier with ENS resolver
                    self.telegram_notifier.ens_resolver = ens_resolver
                    
                    logger.info("ENS resolver setup completed successfully",
                               available_chains=list(web3_instances.keys()),
                               ens_enabled=True)
                except Exception as e:
                    logger.warning("Failed to create ENS resolver", error=str(e))
            else:
                logger.info("ENS resolver setup skipped - insufficient RPC connections",
                           available_chains=list(web3_instances.keys()))
                
        except Exception as e:
            logger.error("Error during async ENS resolver setup", error=str(e))
            # Don't raise - this is background task and shouldn't affect main flow
    
    async def _create_rpc_connection_async(self, rpc_url: str, chain_id: int, chain_name: str):
        """Create RPC connection simply without testing."""
        try:
            from web3 import Web3
            
            # Create provider with timeout
            provider = Web3.HTTPProvider(
                rpc_url,
                request_kwargs={'timeout': self.settings.ens_connection_timeout}
            )
            web3_instance = Web3(provider)
            
            logger.debug(f"Created {chain_name} RPC connection for ENS",
                       rpc_url=rpc_url,
                       chain_id=chain_id)
            
            return web3_instance
                
        except Exception as e:
            logger.debug(f"Error creating {chain_name} RPC connection",
                        rpc_url=rpc_url,
                        error=str(e))
            return None
    
    async def _run_indexing_loop(self) -> None:
        """Main indexing loop."""
        while self.is_running:
            try:
                # Check if we're still running before processing
                if not self.is_running:
                    logger.info("Service stopping, exiting indexing loop")
                    break
                    
                await self._process_new_tokens()
                
                # Sleep between iterations, but break if service stops during sleep
                for _ in range(self.settings.worker_interval_seconds):
                    if not self.is_running:
                        logger.info("Service stopping during sleep, exiting indexing loop")
                        break
                    await asyncio.sleep(1)
                
            except asyncio.CancelledError:
                logger.info("Indexing loop cancelled")
                break
            except Exception as e:
                # If we're not running anymore, this might be due to shutdown
                if not self.is_running:
                    logger.info("Error during shutdown, stopping indexing loop", error=str(e))
                    break
                    
                error_msg = str(e)
                # Check for specific shutdown-related errors
                if any(shutdown_err in error_msg.lower() for shutdown_err in [
                    "not connected", "connection closed", "session is closed", 
                    "client is closed", "disconnected"
                ]):
                    logger.warning("Connection error during indexing, service may be shutting down", error=error_msg)
                    # Don't retry immediately during shutdown
                    if self.is_running:
                        await asyncio.sleep(5)
                else:
                    logger.error("Error in indexing loop", error=error_msg)
                    if self.is_running:
                        await asyncio.sleep(30)  # Wait before retrying
    
    async def _process_new_tokens(self) -> None:
        """Process new token creation events."""
        try:
            # Check if we're still running before making RPC calls
            if not self.is_running:
                logger.debug("Service stopping, skipping token processing")
                return
                
            # Get current block
            latest_block = await self.blockchain_service.get_latest_block()
            
            # Check again if we're still running after RPC call
            if not self.is_running:
                logger.debug("Service stopping after getting latest block")
                return
            
            # Get last processed block
            last_processed = await self.progress_repo.get_progress(
                self.chain_config.chain_id, 
                "coin_tokens"
            )
            
            # Check again if we're still running after database call
            if not self.is_running:
                logger.debug("Service stopping after getting progress")
                return
            
            if last_processed is None:
                # Start from configured start block
                start_block = self.chain_config.start_block
            else:
                start_block = last_processed + 1
            
            # Don't process more than max_blocks_per_request at once
            end_block = min(
                start_block + self.settings.max_blocks_per_request - 1,
                latest_block - self.chain_config.confirmation_blocks  # Leave some confirmation blocks
            )
            
            if start_block > end_block:
                logger.debug("No new blocks to process",
                           start_block=start_block,
                           latest_block=latest_block,
                           confirmation_blocks=self.chain_config.confirmation_blocks)
                return
            
            logger.info("Processing token events",
                       chain_id=self.chain_config.chain_id,
                       from_block=start_block,
                       to_block=end_block,
                       blocks_count=end_block - start_block + 1)
            
            # Process contracts in parallel
            processed_tokens = await self._process_contracts_parallel(
                start_block, end_block
            )
            
            # Update progress
            await self.progress_repo.save_progress(
                self.chain_config.chain_id,
                "coin_tokens", 
                end_block
            )
            
            # Update stats
            await self.cache_repo.increment_stats(
                self.chain_config.chain_id,
                "tokens_processed",
                len(processed_tokens)
            )
            
            if processed_tokens:
                logger.info("Processed new tokens",
                           chain_id=self.chain_config.chain_id,
                           tokens_count=len(processed_tokens),
                           processed_blocks=end_block - start_block + 1)
            
        except Exception as e:
            logger.error("Error processing new tokens", error=str(e))
            raise
    
    async def _process_contracts_parallel(self, start_block: int, end_block: int) -> List[TokenInfo]:
        """Process all contracts in parallel for optimal performance."""
        try:
            # Create tasks for each contract
            contract_tasks = []
            
            for contract_address, parser_list in self.parsers.items():
                task = self._process_single_contract(
                    contract_address, parser_list, start_block, end_block
                )
                contract_tasks.append(task)
            
            # Process contracts concurrently with semaphore for rate limiting
            semaphore = asyncio.Semaphore(self.settings.max_concurrent_contracts)
            
            async def process_with_semaphore(task):
                async with semaphore:
                    return await task
            
            # Execute all contract processing in parallel
            contract_results = await asyncio.gather(
                *[process_with_semaphore(task) for task in contract_tasks],
                return_exceptions=True
            )
            
            # Collect successful results
            processed_tokens = []
            for i, result in enumerate(contract_results):
                if isinstance(result, Exception):
                    contract_address = list(self.parsers.keys())[i]
                    logger.error("Error processing contract in parallel",
                               contract=contract_address,
                               error=str(result))
                else:
                    processed_tokens.extend(result)
            
            logger.info("Completed parallel contract processing",
                       total_contracts=len(self.parsers),
                       successful_contracts=len([r for r in contract_results if not isinstance(r, Exception)]),
                       total_tokens=len(processed_tokens))
            
            return processed_tokens
            
        except Exception as e:
            logger.error("Error in parallel contract processing", error=str(e))
            raise
    
    async def _process_single_contract(self, contract_address: str, parser_list, 
                                     start_block: int, end_block: int) -> List[TokenInfo]:
        """Process a single contract's events with multiple parsers."""
        try:
            # Get all logs for this contract (no event signature filter)
            logs = await self.blockchain_service.get_logs(
                from_block=start_block,
                to_block=end_block,
                address=contract_address
            )
            
            if not logs:
                logger.debug("No logs found for contract",
                           contract=contract_address,
                           from_block=start_block,
                           to_block=end_block)
                return []
            
            logger.info("Found token creation logs",
                       contract=contract_address,
                       logs_count=len(logs),
                       parser_count=len(parser_list))
            
            # Process logs with all parsers
            tokens = await self._process_contract_logs(parser_list, logs, end_block)
            
            logger.debug("Processed contract successfully",
                       contract=contract_address,
                       tokens_found=len(tokens))
            
            return tokens
            
        except Exception as e:
            logger.error("Error processing single contract",
                       contract=contract_address,
                       error=str(e))
            raise
    
    async def _process_contract_logs(self, parser_list, logs: List[Dict[str, Any]], 
                                   end_block: int) -> List[TokenInfo]:
        """Process logs for a specific contract with parallel block processing."""
        try:
            # Group logs by block for efficient processing
            logs_by_block = {}
            for log in logs:
                block_num = log['blockNumber']
                if block_num not in logs_by_block:
                    logs_by_block[block_num] = []
                logs_by_block[block_num].append(log)
            
            # Process blocks in parallel batches
            batch_size = self.settings.event_processing_batch_size
            block_batches = [
                list(logs_by_block.items())[i:i + batch_size]
                for i in range(0, len(logs_by_block), batch_size)
            ]
            
            processed_tokens = []
            
            # Process each batch of blocks
            for batch in block_batches:
                batch_results = await self._process_block_batch_parallel(parser_list, batch)
                processed_tokens.extend(batch_results)
            
            logger.debug("Completed contract logs processing",
                       total_blocks=len(logs_by_block),
                       total_tokens=len(processed_tokens),
                       parser_count=len(parser_list))
            
            return processed_tokens
            
        except Exception as e:
            logger.error("Error in contract logs processing", error=str(e))
            raise
    
    async def _process_block_batch_parallel(self, parser_list, block_batch: List[tuple]) -> List[TokenInfo]:
        """Process a batch of blocks in parallel."""
        try:
            # Create tasks for each block in the batch
            block_tasks = []
            for block_number, block_logs in block_batch:
                task = self._process_single_block(parser_list, block_number, block_logs)
                block_tasks.append(task)
            
            # Process blocks concurrently
            block_results = await asyncio.gather(*block_tasks, return_exceptions=True)
            
            # Collect successful results
            processed_tokens = []
            for i, result in enumerate(block_results):
                if isinstance(result, Exception):
                    block_number = block_batch[i][0]
                    logger.error("Error processing block in batch",
                               block_number=block_number,
                               error=str(result))
                else:
                    processed_tokens.extend(result)
            
            return processed_tokens
            
        except Exception as e:
            logger.error("Error in block batch processing", error=str(e))
            raise
    
    async def _process_single_block(self, parser_list, block_number: int, 
                                  block_logs: List[Dict[str, Any]]) -> List[TokenInfo]:
        """Process logs for a single block with multiple parsers."""
        try:
            # Get block timestamp
            block_timestamp = await self.blockchain_service.get_block_timestamp(block_number)
            
            all_tokens = []
            
            # Try each parser on the logs
            for parser in parser_list:
                # Filter logs that this parser can handle
                parseable_logs = [log for log in block_logs if parser.can_parse(log)]
                
                if not parseable_logs:
                    continue
                
                # Parse logs based on parser type
                if isinstance(parser, (CreatorCoinParser, CreatorCoinV4Parser)):
                    events = parser.parse_logs(parseable_logs, block_timestamp)
                    tokens = [
                        TokenInfo.from_creator_coin_event(event, self.chain_config.chain_id)
                        for event in events
                    ]
                elif isinstance(parser, ClankerParser):
                    events = parser.parse_logs(parseable_logs, block_timestamp)
                    tokens = [
                        TokenInfo.from_clanker_token_event(event, self.chain_config.chain_id)
                        for event in events
                    ]
                else:
                    logger.warning("Unknown parser type in single block processing", 
                                 parser_type=type(parser))
                    continue
                
                all_tokens.extend(tokens)
                
                logger.debug("Parser processed block logs",
                           parser_type=type(parser).__name__,
                           block_number=block_number,
                           parseable_logs=len(parseable_logs),
                           tokens_found=len(tokens))
            
            # Process tokens in parallel
            processed_tokens = await self._process_tokens_batch_parallel(all_tokens)
            
            return processed_tokens
            
        except Exception as e:
            logger.error("Error processing single block",
                       block_number=block_number,
                       error=str(e))
            raise
    
    async def _process_tokens_batch_parallel(self, tokens: List[TokenInfo]) -> List[TokenInfo]:
        """Process a batch of tokens in parallel."""
        try:
            # Create tasks for token processing
            token_tasks = [self._process_token(token) for token in tokens]
            
            # Process tokens concurrently
            results = await asyncio.gather(*token_tasks, return_exceptions=True)
            
            # Collect successful results
            processed_tokens = []
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error("Error processing token in batch",
                               token_address=tokens[i].token_address,
                               token_name=tokens[i].name,
                               error=str(result))
                else:
                    processed_tokens.append(tokens[i])
            
            return processed_tokens
            
        except Exception as e:
            logger.error("Error in token batch processing", error=str(e))
            raise
    
    async def _process_token(self, token: TokenInfo) -> None:
        """Process a single token."""
        try:
            # Check if already processing this token
            lock_acquired = await self.cache_repo.cache_processing_lock(
                token.chain_id,
                token.token_address,
                ttl_seconds=300  # 5 minutes
            )
            
            if not lock_acquired:
                logger.debug("Token already being processed, skipping",
                           token_address=token.token_address)
                return
            
            try:
                # Save token to database
                await self.token_repo.save_token(token)
                
                # Cache token data
                token_data = token.model_dump()
                await self.cache_repo.cache_token(
                    token.chain_id,
                    token.token_address,
                    token_data,
                    ttl_seconds=3600  # 1 hour
                )
                
                # Publish events if Kafka is available
                if self.kafka_producer:
                    try:
                        # Publish token created event
                        await self.kafka_producer.publish_token_created(
                            token.chain_id,
                            token_data
                        )
                        
                        # Publish audit request event
                        await self.kafka_producer.publish_token_audit_request(
                            token.chain_id,
                            token.token_address,
                            token_data
                        )
                        
                        logger.info("Published Kafka events for token",
                                   token_address=token.token_address,
                                   token_name=token.name)
                    except Exception as e:
                        logger.error("Error publishing Kafka events",
                                   token_address=token.token_address,
                                   error=str(e))
                
                # Send Telegram notification if available
                if self.telegram_notifier:
                    try:
                        # Determine notification method based on token source
                        if token.source.lower() == "clanker":
                            success = await self.telegram_notifier.notify_clanker_token_created(
                                token_data, 
                                self.chain_config.name
                            )
                        else:
                            success = await self.telegram_notifier.notify_token_created(
                                token_data,
                                self.chain_config.name
                            )
                        
                        if success:
                            logger.info("Successfully sent Telegram notification",
                                       token_address=token.token_address,
                                       token_name=token.name,
                                       source=token.source)
                        else:
                            logger.warning("Failed to send Telegram notification",
                                         token_address=token.token_address,
                                         token_name=token.name)
                    except Exception as e:
                        logger.error("Error sending Telegram notification",
                                   token_address=token.token_address,
                                   error=str(e))
                
                logger.info("Successfully processed token",
                           chain_id=token.chain_id,
                           token_address=token.token_address,
                           token_name=token.name,
                           token_symbol=token.symbol,
                           source=token.source,
                           creator=token.creator)
                
            finally:
                # Always remove processing lock
                await self.cache_repo.remove_processing_lock(
                    token.chain_id,
                    token.token_address
                )
            
        except Exception as e:
            logger.error("Error processing token",
                        token_address=token.token_address,
                        token_name=token.name,
                        error=str(e))
            
            # Update token status to error
            try:
                await self.token_repo.update_token_status(
                    token.chain_id,
                    token.token_address,
                    "error",
                    str(e)
                )
            except Exception as update_error:
                logger.error("Error updating token error status",
                           token_address=token.token_address,
                           error=str(update_error))
            
            raise
    
    async def stop(self) -> None:
        """Stop the token indexer service."""
        if not self.is_running:
            logger.info("Token indexer service already stopped")
            return
        
        logger.info("Stopping Token Indexer Service",
                   chain_id=self.chain_config.chain_id)
        
        self.is_running = False
        
        # Disconnect from all services with individual error handling
        disconnect_errors = []
        
        # Blockchain service
        try:
            await self.blockchain_service.disconnect()
            logger.debug("Blockchain service disconnected successfully")
        except Exception as e:
            disconnect_errors.append(f"blockchain: {e}")
            logger.error("Error disconnecting blockchain service", error=str(e))
        
        # Token repository
        try:
            await self.token_repo.disconnect()
            logger.debug("Token repository disconnected successfully")
        except Exception as e:
            disconnect_errors.append(f"token_repo: {e}")
            logger.error("Error disconnecting token repository", error=str(e))
        
        # Progress repository
        try:
            await self.progress_repo.disconnect()
            logger.debug("Progress repository disconnected successfully")
        except Exception as e:
            disconnect_errors.append(f"progress_repo: {e}")
            logger.error("Error disconnecting progress repository", error=str(e))
        
        # Cache repository
        try:
            await self.cache_repo.disconnect()
            logger.debug("Cache repository disconnected successfully")
        except Exception as e:
            disconnect_errors.append(f"cache_repo: {e}")
            logger.error("Error disconnecting cache repository", error=str(e))
        
        # Kafka producer
        if self.kafka_producer:
            try:
                await self.kafka_producer.disconnect()
                logger.debug("Kafka producer disconnected successfully")
            except Exception as e:
                disconnect_errors.append(f"kafka: {e}")
                logger.error("Error disconnecting Kafka producer", error=str(e))
        
        # Telegram notifier
        if self.telegram_notifier:
            try:
                await self.telegram_notifier.disconnect()
                logger.debug("Telegram notifier disconnected successfully")
            except Exception as e:
                disconnect_errors.append(f"telegram: {e}")
                logger.error("Error disconnecting Telegram notifier", error=str(e))
        
        if disconnect_errors:
            logger.warning("Some services had errors during disconnect", 
                          errors=disconnect_errors,
                          chain_id=self.chain_config.chain_id)
        else:
            logger.info("All services disconnected cleanly")
        
        logger.info("Token indexer service stopped successfully",
                   chain_id=self.chain_config.chain_id)
    
    async def health_check(self) -> Dict[str, Any]:
        """Get health status of the indexer service."""
        health = {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "chain_id": self.chain_config.chain_id,
            "chain_name": self.chain_config.name,
            "components": {}
        }
        
        # Check blockchain service
        try:
            blockchain_healthy = await self.blockchain_service.health_check()
            health["components"]["blockchain"] = {
                "status": "healthy" if blockchain_healthy else "unhealthy"
            }
        except Exception as e:
            health["components"]["blockchain"] = {
                "status": "unhealthy",
                "error": str(e)
            }
        
        # Check database
        try:
            db_healthy = await self.token_repo.health_check()
            health["components"]["database"] = {
                "status": "healthy" if db_healthy else "unhealthy"
            }
        except Exception as e:
            health["components"]["database"] = {
                "status": "unhealthy",
                "error": str(e)
            }
        
        # Check cache
        try:
            cache_healthy = await self.cache_repo.health_check()
            health["components"]["cache"] = {
                "status": "healthy" if cache_healthy else "unhealthy"
            }
        except Exception as e:
            health["components"]["cache"] = {
                "status": "unhealthy",
                "error": str(e)
            }
        
        # Check Kafka
        if self.kafka_producer:
            try:
                kafka_healthy = await self.kafka_producer.health_check()
                health["components"]["kafka"] = {
                    "status": "healthy" if kafka_healthy else "unhealthy"
                }
            except Exception as e:
                health["components"]["kafka"] = {
                    "status": "unhealthy",
                    "error": str(e)
                }
        
        # Check Telegram
        if self.telegram_notifier:
            try:
                telegram_healthy = await self.telegram_notifier.health_check()
                health["components"]["telegram"] = {
                    "status": "healthy" if telegram_healthy else "unhealthy"
                }
            except Exception as e:
                health["components"]["telegram"] = {
                    "status": "unhealthy",
                    "error": str(e)
                }
        
        # Overall status
        if any(comp.get("status") == "unhealthy" for comp in health["components"].values()):
            health["status"] = "unhealthy"
        
        return health
    
    async def stop(self) -> None:
        """Stop the token indexer service."""
        if not self.is_running:
            logger.info("Token indexer service already stopped")
            return

        logger.info("Stopping Token Indexer Service",
                   chain_id=self.chain_config.chain_id)

        # Set running flag to False first to signal loops to stop
        self.is_running = False

        # Give indexing loop time to finish current iteration
        await asyncio.sleep(1)

        # Disconnect from all services with individual error handling
        disconnect_errors = []

        # Blockchain service
        try:
            await self.blockchain_service.disconnect()
            logger.debug("Blockchain service disconnected successfully")
        except Exception as e:
            disconnect_errors.append(f"blockchain: {e}")
            logger.error("Error disconnecting blockchain service", error=str(e))

        # Token repository
        try:
            await self.token_repo.disconnect()
            logger.debug("Token repository disconnected successfully")
        except Exception as e:
            disconnect_errors.append(f"token_repo: {e}")
            logger.error("Error disconnecting token repository", error=str(e))

        # Progress repository
        try:
            await self.progress_repo.disconnect()
            logger.debug("Progress repository disconnected successfully")
        except Exception as e:
            disconnect_errors.append(f"progress_repo: {e}")
            logger.error("Error disconnecting progress repository", error=str(e))

        # Cache repository
        try:
            await self.cache_repo.disconnect()
            logger.debug("Cache repository disconnected successfully")
        except Exception as e:
            disconnect_errors.append(f"cache_repo: {e}")
            logger.error("Error disconnecting cache repository", error=str(e))

        # Kafka producer
        if self.kafka_producer:
            try:
                await self.kafka_producer.disconnect()
                logger.debug("Kafka producer disconnected successfully")
            except Exception as e:
                disconnect_errors.append(f"kafka: {e}")
                logger.error("Error disconnecting Kafka producer", error=str(e))

        # Telegram notifier
        if self.telegram_notifier:
            try:
                await self.telegram_notifier.disconnect()
                logger.debug("Telegram notifier disconnected successfully")
            except Exception as e:
                disconnect_errors.append(f"telegram: {e}")
                logger.error("Error disconnecting Telegram notifier", error=str(e))

        if disconnect_errors:
            logger.warning("Some services had errors during disconnect",
                         errors=disconnect_errors,
                         chain_id=self.chain_config.chain_id)
        else:
            logger.info("All services disconnected cleanly")

        logger.info("Token indexer service stopped successfully",
                   chain_id=self.chain_config.chain_id)
