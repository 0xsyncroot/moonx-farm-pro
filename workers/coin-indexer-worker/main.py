#!/usr/bin/env python3
"""
MoonX Coin Indexer Worker - Main Entry Point

A specialized indexer for new coin creation events.
Supports CreatorCoinCreated and TokenCreated events.
"""

import asyncio
import signal
import sys
from pathlib import Path
from typing import Dict, Any
import structlog
import click
from datetime import datetime

# Add current directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from config.settings import get_settings, load_chain_configs, ChainConfig
from repositories.mongodb import MongoTokenRepository, MongoProgressRepository
from repositories.redis_cache import RedisCacheRepository
from services.token_indexer import TokenIndexerService
from utils.logging import configure_logging

# Basic structlog setup for startup
import logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    stream=sys.stdout
)

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.add_log_level,
        structlog.processors.JSONRenderer()
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    logger_factory=structlog.stdlib.LoggerFactory(),
    context_class=dict,
    cache_logger_on_first_use=False,
)

logger = structlog.get_logger()


class CoinIndexerWorker:
    """Main coin indexer worker application."""
    
    def __init__(self, chain_id: int = None, reset_progress: bool = False):
        self.settings = get_settings()
        self.chain_configs = load_chain_configs()
        self.indexer_services: Dict[int, TokenIndexerService] = {}
        self.is_running = False
        self.reset_progress = reset_progress
        
        logger.info("CoinIndexerWorker initialized", 
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
        """Start the coin indexer worker."""
        try:
            logger.info("Starting MoonX Coin Indexer Worker",
                       chains=list(self.chain_configs.keys()),
                       settings=self.settings.model_dump())
            
            # Reset progress if requested
            if self.reset_progress:
                logger.info("Resetting indexing progress for all chains...")
                for chain_id in self.chain_configs.keys():
                    try:
                        progress_repo = MongoProgressRepository(
                            self.settings.mongodb_url,
                            self.settings.mongodb_database
                        )
                        await progress_repo.connect()
                        await progress_repo.delete_progress(chain_id, "coin_tokens")
                        await progress_repo.disconnect()
                        
                        logger.info("Reset progress for chain", chain_id=chain_id)
                    except Exception as e:
                        logger.error("Failed to reset progress", 
                                   chain_id=chain_id, 
                                   error=str(e))
                
                logger.info("Progress reset completed")
            
            # Initialize indexer services for each chain
            logger.info("Initializing token indexer services for chains", 
                       total_chains=len(self.chain_configs))
            
            for chain_id, chain_config in self.chain_configs.items():
                logger.info("Initializing token indexer for chain", 
                           chain_id=chain_id, 
                           chain_name=chain_config.name)
                await self._initialize_chain_indexer(chain_id, chain_config)
                logger.info("Chain token indexer initialized successfully", chain_id=chain_id)
            
            if not self.indexer_services:
                logger.error("No token indexer services initialized")
                return
            
            logger.info("All chain token indexers initialized", 
                       total_services=len(self.indexer_services))
            
            self.is_running = True
            
            # Setup signal handlers for graceful shutdown
            logger.info("Setting up signal handlers for graceful shutdown")
            self._setup_signal_handlers()
            
            # Start all indexer services
            logger.info("Starting all token indexer services...")
            tasks = []
            for chain_id, indexer_service in self.indexer_services.items():
                logger.info("Creating task for chain token indexer", chain_id=chain_id)
                task = asyncio.create_task(
                    indexer_service.start(),
                    name=f"token-indexer-{chain_id}"
                )
                tasks.append(task)
            
            logger.info("All token indexer services started and running", 
                       count=len(tasks),
                       chains=[f"token-indexer-{cid}" for cid in self.indexer_services.keys()])
            
            # Wait for all services to complete or error
            try:
                await asyncio.gather(*tasks)
            except asyncio.CancelledError:
                logger.info("Token indexer services cancelled")
            
        except Exception as e:
            logger.error("Failed to start coin indexer worker", error=str(e))
            raise
        finally:
            await self.stop()
    
    async def _initialize_chain_indexer(self, chain_id: int, chain_config: ChainConfig) -> None:
        """Initialize token indexer service for a specific chain."""
        try:
            logger.info("Initializing token indexer for chain",
                       chain_id=chain_id,
                       chain_name=chain_config.name,
                       start_block=chain_config.start_block)
            
            # Initialize repositories
            logger.info("Creating MongoDB repositories", chain_id=chain_id)
            token_repo = MongoTokenRepository(
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
                f"{self.settings.redis_key_prefix}:tokens:{chain_id}"
            )
            
            # Create indexer service
            logger.info("Creating token indexer service instance", chain_id=chain_id)
            indexer_service = TokenIndexerService(
                self.settings,
                chain_config,
                token_repo,
                progress_repo,
                cache_repo
            )
            
            self.indexer_services[chain_id] = indexer_service
            
            logger.info("Successfully initialized token indexer for chain",
                       chain_id=chain_id,
                       chain_name=chain_config.name)
            
        except Exception as e:
            logger.error("Failed to initialize chain token indexer",
                        chain_id=chain_id,
                        error=str(e))
            raise
    
    async def stop(self) -> None:
        """Stop the coin indexer worker gracefully."""
        if not self.is_running:
            logger.info("Coin indexer worker already stopped")
            return
        
        logger.info("Starting graceful shutdown of MoonX Coin Indexer Worker",
                   total_services=len(self.indexer_services))
        
        start_time = datetime.utcnow()
        self.is_running = False
        
        # Stop all indexer services with timeout
        shutdown_timeout = 30  # seconds
        stop_tasks = []
        
        for chain_id, indexer_service in self.indexer_services.items():
            logger.info("Initiating shutdown for chain token indexer", chain_id=chain_id)
            task = asyncio.create_task(
                self._stop_service_with_timeout(indexer_service, chain_id, shutdown_timeout),
                name=f"stop-token-indexer-{chain_id}"
            )
            stop_tasks.append(task)
        
        # Wait for all services to stop
        if stop_tasks:
            logger.info("Waiting for all token indexer services to stop gracefully",
                       timeout_seconds=shutdown_timeout)
            
            try:
                done, pending = await asyncio.wait(
                    stop_tasks, 
                    timeout=shutdown_timeout,
                    return_when=asyncio.ALL_COMPLETED
                )
                
                if pending:
                    logger.warning("Some services did not stop within timeout, forcing shutdown",
                                 timeout_seconds=shutdown_timeout,
                                 pending_count=len(pending))
                    
                    # Cancel remaining tasks
                    for task in pending:
                        try:
                            task.cancel()
                            logger.debug("Cancelled pending task", task_name=task.get_name())
                        except Exception as e:
                            logger.warning("Error cancelling task", task_name=task.get_name(), error=str(e))
                    
                    # Wait for cancelled tasks to complete
                    if pending:
                        try:
                            cancelled_done, still_pending = await asyncio.wait(
                                pending, 
                                timeout=5.0,
                                return_when=asyncio.ALL_COMPLETED
                            )
                            
                            if still_pending:
                                logger.error("Some tasks did not respond to cancellation",
                                           still_pending_count=len(still_pending))
                                for task in still_pending:
                                    logger.error("Force-killing unresponsive task", 
                                               task_name=task.get_name())
                        except Exception as e:
                            logger.warning("Error waiting for cancelled tasks", error=str(e))
                
            except asyncio.CancelledError:
                logger.info("Shutdown process was cancelled")
                for task in stop_tasks:
                    if not task.done():
                        try:
                            task.cancel()
                        except Exception as e:
                            logger.warning("Error cancelling task during shutdown cancellation", 
                                         task_name=task.get_name(), error=str(e))
            except Exception as e:
                logger.error("Error during shutdown", error=str(e))
                for task in stop_tasks:
                    if not task.done():
                        try:
                            task.cancel()
                        except Exception as e:
                            logger.warning("Error cancelling task during error handling", 
                                         task_name=task.get_name(), error=str(e))
        
        # Clear services
        self.indexer_services.clear()
        
        end_time = datetime.utcnow()
        shutdown_duration = (end_time - start_time).total_seconds()
        
        logger.info("MoonX Coin Indexer Worker stopped successfully",
                   shutdown_duration_seconds=shutdown_duration)
    
    async def _stop_service_with_timeout(self, service: TokenIndexerService, chain_id: int, timeout: float) -> None:
        """Stop a service with timeout and detailed logging."""
        try:
            logger.info("Stopping token indexer service", chain_id=chain_id)
            
            start_time = datetime.utcnow()
            await asyncio.wait_for(service.stop(), timeout=timeout)
            
            end_time = datetime.utcnow()
            stop_duration = (end_time - start_time).total_seconds()
            
            logger.info("Successfully stopped token indexer service", 
                       chain_id=chain_id,
                       stop_duration_seconds=stop_duration)
                       
        except asyncio.CancelledError:
            logger.info("Service shutdown was cancelled", 
                       chain_id=chain_id)
            raise
        except asyncio.TimeoutError:
            logger.warning("Service shutdown timeout exceeded, forcing stop",
                          chain_id=chain_id,
                          timeout_seconds=timeout)
        except Exception as e:
            logger.error("Error stopping token indexer service",
                        chain_id=chain_id,
                        error=str(e))
    
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
            
            if not shutdown_event.is_set():
                logger.info("Received shutdown signal, initiating graceful shutdown",
                           signal=signum,
                           signal_name=signal_name)
                
                shutdown_event.set()
                
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self._handle_graceful_shutdown())
                except RuntimeError:
                    logger.error("No event loop available, exiting immediately")
                    exit(1)
            
            elif not force_shutdown_event.is_set():
                logger.warning("Second shutdown signal received, forcing immediate shutdown",
                             signal=signum)
                force_shutdown_event.set()
                
                logger.info("Forcing immediate exit due to second signal")
                exit(1)
            
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
            
            if hasattr(self, '_force_shutdown_event') and self._force_shutdown_event.is_set():
                logger.info("Force shutdown requested, skipping graceful shutdown")
                return
            
            await self.stop()
            
            logger.info("Graceful shutdown completed successfully")
            
        except asyncio.CancelledError:
            logger.info("Graceful shutdown was cancelled")
            raise
        except Exception as e:
            logger.error("Error during graceful shutdown", error=str(e))
        finally:
            logger.info("Shutdown process completed")


# CLI Commands
@click.group()
def cli():
    """MoonX Coin Indexer Worker CLI"""
    pass


@cli.command()
@click.option('--chain-id', type=int, help='Specific chain ID to index (optional)')
@click.option('--log-format', type=click.Choice(['json', 'console']), help='Log output format (overrides MOONX_LOG_FORMAT)')
@click.option('--log-level', type=click.Choice(['DEBUG', 'INFO', 'WARNING', 'ERROR']), help='Log level (overrides MOONX_LOG_LEVEL)')
@click.option('--debug', is_flag=True, help='Enable debug logging (same as --log-level DEBUG)')
@click.option('--reset-progress', is_flag=True, help='Reset indexing progress and start fresh')
def start(chain_id: int = None, log_format: str = None, log_level: str = None, debug: bool = False, reset_progress: bool = False):
    """Start the coin indexer worker."""
    
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
    print(f"🚀 Starting MoonX Coin Indexer Worker...")
    print(f"📊 Log format: {effective_log_format} (env: {settings.log_format})")
    print(f"📋 Log level: {effective_log_level} (env: {settings.log_level})")
    if chain_id:
        print(f"⛓️  Chain ID: {chain_id}")
    if reset_progress:
        print(f"🔄 Reset progress: {reset_progress} (will start fresh)")
    print("=" * 50)
    sys.stdout.flush()
    
    # Configure logging with effective settings
    try:
        configure_logging(effective_log_level, effective_log_format)
        
        logger = structlog.get_logger()
        logger.info("MoonX Coin Indexer Worker starting", 
                   log_format=effective_log_format, 
                   log_level=effective_log_level,
                   debug_flag=debug,
                   chain_id=chain_id,
                   env_log_level=settings.log_level,
                   env_log_format=settings.log_format)
    except Exception as e:
        print(f"❌ Logging configuration failed: {e}")
        sys.exit(1)
    
    worker = CoinIndexerWorker(chain_id, reset_progress=reset_progress)
    
    try:
        asyncio.run(worker.start())
    except KeyboardInterrupt:
        logger.info("Coin indexer worker interrupted by user")
        print("\n👋 Coin indexer worker stopped by user")
    except Exception as e:
        logger.error("Coin indexer worker failed", error=str(e))
        print(f"❌ Error: {e}")
        sys.exit(1)


@cli.command()
def config():
    """Show current configuration."""
    settings = get_settings()
    chain_configs = load_chain_configs()
    
    click.echo("=== MoonX Coin Indexer Configuration ===\n")
    
    click.echo("Settings:")
    for key, value in settings.model_dump().items():
        if 'url' in key.lower() or 'password' in key.lower():
            value = "***masked***"
        click.echo(f"  {key}: {value}")
    
    click.echo(f"\nSupported Chains ({len(chain_configs)}):")
    for chain_id, config in chain_configs.items():
        click.echo(f"  {chain_id}: {config.name}")
        click.echo(f"    Primary RPCs: {len(config.rpc_urls)}")
        click.echo(f"    Backup RPCs: {len(config.backup_rpc_urls)}")
        click.echo(f"    Start Block: {config.start_block}")
        click.echo(f"    Contracts: {len(config.contracts)}")


@cli.command()
def health():
    """Check health status of the worker services."""
    async def check_health():
        worker = CoinIndexerWorker()
        
        # Initialize services briefly to check health
        try:
            for target_chain_id, chain_config in worker.chain_configs.items():
                await worker._initialize_chain_indexer(target_chain_id, chain_config)
            
            health_data = {}
            all_healthy = True
            
            for target_chain_id, indexer_service in worker.indexer_services.items():
                chain_health = await indexer_service.health_check()
                health_data[target_chain_id] = chain_health
                
                if chain_health.get('status') != 'healthy':
                    all_healthy = False
            
            # Cleanup
            await worker.stop()
            
            return health_data, all_healthy
            
        except Exception as e:
            await worker.stop()
            raise e
    
    try:
        health_data, all_healthy = asyncio.run(check_health())
        
        if all_healthy:
            click.echo("✅ All services healthy")
            for chain_id, health in health_data.items():
                click.echo(f"Chain {chain_id}: {health['status']}")
            sys.exit(0)
        else:
            click.echo("❌ Some services unhealthy")
            for chain_id, health in health_data.items():
                status_emoji = "✅" if health['status'] == 'healthy' else "❌"
                click.echo(f"{status_emoji} Chain {chain_id}: {health['status']}")
                if health.get('errors'):
                    for service, error in health['errors'].items():
                        click.echo(f"  - {service}: {error}")
            sys.exit(1)
            
    except Exception as e:
        click.echo(f"💥 Health check failed: {e}")
        sys.exit(1)


@cli.command()
@click.option('--chain-id', type=int, help='Specific chain ID to check (optional)')
def rpc_stats(chain_id: int = None):
    """Show RPC endpoint statistics."""
    async def check_rpc_stats():
        worker = CoinIndexerWorker(chain_id)
        
        # Initialize services briefly to get RPC stats
        for target_chain_id, chain_config in worker.chain_configs.items():
            await worker._initialize_chain_indexer(target_chain_id, chain_config)
        
        stats_data = {}
        
        for target_chain_id, indexer_service in worker.indexer_services.items():
            rpc_stats = indexer_service.blockchain_service.get_rpc_stats()
            stats_data[target_chain_id] = rpc_stats
        
        # Cleanup
        await worker.stop()
        
        return stats_data
    
    try:
        stats = asyncio.run(check_rpc_stats())
        
        for target_chain_id, rpc_stats in stats.items():
            click.echo(f"\n=== Chain {target_chain_id} RPC Statistics ===")
            
            if rpc_stats['current_rpc']:
                click.echo(f"Current RPC: {rpc_stats['current_rpc']}")
                click.echo(f"Is Backup: {rpc_stats['current_rpc_is_backup']}")
            else:
                click.echo("Current RPC: Not connected")
            
            click.echo(f"\nPrimary RPCs ({len(rpc_stats['primary_rpcs'])}):")
            for i, rpc in enumerate(rpc_stats['primary_rpcs']):
                status = "🟢 Healthy" if rpc['is_healthy'] else "🔴 Unhealthy"
                click.echo(f"  {i+1}. {rpc['url']}")
                click.echo(f"     Status: {status}")
                click.echo(f"     Success Rate: {rpc['success_rate']:.2%}")
                click.echo(f"     Requests: {rpc['total_requests']} (Failures: {rpc['total_failures']})")
                if rpc['last_success']:
                    click.echo(f"     Last Success: {rpc['last_success']}")
                if rpc['last_failure']:
                    click.echo(f"     Last Failure: {rpc['last_failure']}")
            
            if rpc_stats['backup_rpcs']:
                click.echo(f"\nBackup RPCs ({len(rpc_stats['backup_rpcs'])}):")
                for i, rpc in enumerate(rpc_stats['backup_rpcs']):
                    status = "🟢 Healthy" if rpc['is_healthy'] else "🔴 Unhealthy"
                    click.echo(f"  {i+1}. {rpc['url']}")
                    click.echo(f"     Status: {status}")
                    click.echo(f"     Success Rate: {rpc['success_rate']:.2%}")
                    click.echo(f"     Requests: {rpc['total_requests']} (Failures: {rpc['total_failures']})")
            
    except Exception as e:
        click.echo(f"Failed to get RPC stats: {e}")
        sys.exit(1)


if __name__ == "__main__":
    cli()
