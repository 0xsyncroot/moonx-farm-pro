from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from typing import Optional, List, Dict, Any
from datetime import datetime
import structlog
from repositories.base import PoolRepository, ProgressRepository
from models.pool import PoolInfo, SwapEvent, PoolLiquidity, IndexerProgress, PriceCalculation


logger = structlog.get_logger()


class MongoPoolRepository(PoolRepository):
    """MongoDB implementation of pool repository."""
    
    def __init__(self, mongodb_url: str, database_name: str):
        self.mongodb_url = mongodb_url
        self.database_name = database_name
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None
        
        # Collections
        self.pools: Optional[AsyncIOMotorCollection] = None
        self.swap_events: Optional[AsyncIOMotorCollection] = None
        self.pool_liquidity: Optional[AsyncIOMotorCollection] = None
        self.price_calculations: Optional[AsyncIOMotorCollection] = None
    
    async def connect(self) -> None:
        """Connect to MongoDB."""
        try:
            self.client = AsyncIOMotorClient(self.mongodb_url)
            self.db = self.client[self.database_name]
            
            # Initialize collections
            self.pools = self.db.pools
            self.swap_events = self.db.swap_events
            self.pool_liquidity = self.db.pool_liquidity
            self.price_calculations = self.db.price_calculations
            
            # Create indexes for optimal performance
            await self._create_indexes()
            
            logger.info("Connected to MongoDB", database=self.database_name)
        except Exception as e:
            logger.error("Failed to connect to MongoDB", error=str(e))
            raise
    
    async def disconnect(self) -> None:
        """Disconnect from MongoDB."""
        if self.client:
            self.client.close()
            logger.info("Disconnected from MongoDB")
    
    async def health_check(self) -> bool:
        """Check MongoDB health."""
        try:
            if not self.client:
                return False
            await self.client.admin.command('ping')
            return True
        except Exception as e:
            logger.error("MongoDB health check failed", error=str(e))
            return False
    
    async def _create_indexes(self) -> None:
        """Create database indexes for optimal performance."""
        # Pool indexes
        await self.pools.create_index([("chain_id", 1), ("pool_address", 1)], unique=True)
        await self.pools.create_index([("chain_id", 1), ("protocol", 1)])
        await self.pools.create_index([("creation_block", 1)])
        
        # Swap event indexes
        await self.swap_events.create_index([("chain_id", 1), ("pool_address", 1), ("block_number", 1)])
        await self.swap_events.create_index([("tx_hash", 1), ("log_index", 1)], unique=True)
        await self.swap_events.create_index([("block_timestamp", -1)])
        
        # Pool liquidity indexes
        await self.pool_liquidity.create_index([("chain_id", 1), ("pool_address", 1), ("block_number", -1)])
        await self.pool_liquidity.create_index([("block_timestamp", -1)])
        
        # Price calculation indexes
        await self.price_calculations.create_index([("chain_id", 1), ("pool_address", 1), ("block_number", -1)])
        await self.price_calculations.create_index([("tx_hash", 1)], unique=True)
        await self.price_calculations.create_index([("timestamp", -1)])
        await self.price_calculations.create_index([("chain_id", 1), ("token0", 1), ("token1", 1)])
        
        logger.info("Created MongoDB indexes")
    
    async def save_pool(self, pool: PoolInfo) -> None:
        """Save pool information."""
        try:
            doc = pool.model_dump()
            doc["created_at"] = datetime.utcnow()
            doc["updated_at"] = datetime.utcnow()
            
            # Debug: Enhanced debugging for MongoDB 64-bit error
            import json
            
            def check_large_ints(obj, path=""):
                if isinstance(obj, dict):
                    for key, value in obj.items():
                        check_large_ints(value, f"{path}.{key}" if path else key)
                elif isinstance(obj, list):
                    for i, item in enumerate(obj):
                        check_large_ints(item, f"{path}[{i}]")
                elif isinstance(obj, int):
                    if obj > 2**63 - 1 or obj < -2**63:
                        logger.error("LARGE INTEGER FOUND - This will cause MongoDB error", 
                                   path=path, 
                                   value=obj, 
                                   hex_value=hex(obj) if obj >= 0 else hex(obj & 0xFFFFFFFFFFFFFFFF),
                                   pool_address=pool.pool_address,
                                   doc_sample=str(doc)[:200])
                    elif obj > 2**32:  # Log potential large ints
                        logger.warning("Large integer detected", 
                                     path=path, 
                                     value=obj, 
                                     hex_value=hex(obj),
                                     pool_address=pool.pool_address)
                elif hasattr(obj, '__dict__'):
                    # Check object attributes
                    check_large_ints(obj.__dict__, f"{path}.__dict__")
            
            # Try JSON serialization to find problematic fields
            try:
                json_str = json.dumps(doc, default=str)
                logger.info("Document JSON serialization successful", 
                           pool_address=pool.pool_address,
                           doc_size=len(json_str))
            except Exception as json_error:
                logger.error("Document JSON serialization failed", 
                           pool_address=pool.pool_address,
                           json_error=str(json_error))
            
            check_large_ints(doc)
            
            # Log specific fields that might contain large ints
            suspect_fields = ['creation_block', 'last_indexed_block', 'current_tick', 'current_liquidity', 
                            'current_sqrt_price_x96', 'reserve0', 'reserve1', 'fee_tier', 'tick_spacing']
            for field in suspect_fields:
                if field in doc and doc[field] is not None:
                    value = doc[field]
                    if isinstance(value, (int, str)):
                        try:
                            int_val = int(value) if isinstance(value, str) else value
                            if int_val > 2**32:
                                logger.warning(f"Suspect field {field}", 
                                             field=field,
                                             value=value,
                                             type=type(value).__name__,
                                             int_value=int_val,
                                             pool_address=pool.pool_address)
                        except (ValueError, TypeError):
                            pass
            
            await self.pools.replace_one(
                {"chain_id": pool.chain_id, "pool_address": pool.pool_address},
                doc,
                upsert=True
            )
            
            logger.info("Saved pool", 
                       chain_id=pool.chain_id, 
                       pool_address=pool.pool_address,
                       protocol=pool.protocol)
        except Exception as e:
            logger.error("Failed to save pool", 
                        chain_id=pool.chain_id,
                        pool_address=pool.pool_address,
                        error=str(e))
            raise
    
    async def get_pool(self, chain_id: int, pool_address: str) -> Optional[PoolInfo]:
        """Get pool information by address."""
        try:
            doc = await self.pools.find_one({"chain_id": chain_id, "pool_address": pool_address})
            if doc:
                # Remove MongoDB specific fields
                doc.pop("_id", None)
                doc.pop("created_at", None)
                doc.pop("updated_at", None)
                return PoolInfo(**doc)
            return None
        except Exception as e:
            logger.error("Failed to get pool", 
                        chain_id=chain_id,
                        pool_address=pool_address,
                        error=str(e))
            raise
    
    async def get_pools_by_chain(self, chain_id: int, limit: int = 100, offset: int = 0) -> List[PoolInfo]:
        """Get pools by chain ID."""
        try:
            cursor = self.pools.find({"chain_id": chain_id}).skip(offset).limit(limit)
            pools = []
            async for doc in cursor:
                doc.pop("_id", None)
                doc.pop("created_at", None)
                doc.pop("updated_at", None)
                pools.append(PoolInfo(**doc))
            return pools
        except Exception as e:
            logger.error("Failed to get pools by chain", chain_id=chain_id, error=str(e))
            raise
    
    async def update_pool_status(self, chain_id: int, pool_address: str, status: str, last_indexed_block: int) -> None:
        """Update pool status and last indexed block."""
        try:
            await self.pools.update_one(
                {"chain_id": chain_id, "pool_address": pool_address},
                {
                    "$set": {
                        "status": status,
                        "last_indexed_block": last_indexed_block,
                        "updated_at": datetime.utcnow()
                    }
                }
            )
            
            logger.info("Updated pool status",
                       chain_id=chain_id,
                       pool_address=pool_address,
                       status=status,
                       last_indexed_block=last_indexed_block)
        except Exception as e:
            logger.error("Failed to update pool status",
                        chain_id=chain_id,
                        pool_address=pool_address,
                        error=str(e))
            raise
    
    async def save_swap_event(self, event: SwapEvent) -> None:
        """Save swap event."""
        try:
            doc = event.model_dump()
            doc["created_at"] = datetime.utcnow()
            
            await self.swap_events.replace_one(
                {"tx_hash": event.tx_hash, "log_index": event.log_index},
                doc,
                upsert=True
            )
            
            logger.debug("Saved swap event",
                        tx_hash=event.tx_hash,
                        pool_address=event.pool_address,
                        block_number=event.block_number)
        except Exception as e:
            logger.error("Failed to save swap event",
                        tx_hash=event.tx_hash,
                        error=str(e))
            raise
    
    async def get_swap_events(
        self, 
        chain_id: int, 
        pool_address: Optional[str] = None,
        from_block: Optional[int] = None,
        to_block: Optional[int] = None,
        limit: int = 100
    ) -> List[SwapEvent]:
        """Get swap events with filters."""
        try:
            query = {"chain_id": chain_id}
            
            if pool_address:
                query["pool_address"] = pool_address
            if from_block:
                query["block_number"] = {"$gte": from_block}
            if to_block:
                if "block_number" in query:
                    query["block_number"]["$lte"] = to_block
                else:
                    query["block_number"] = {"$lte": to_block}
            
            cursor = self.swap_events.find(query).sort("block_number", -1).limit(limit)
            events = []
            async for doc in cursor:
                doc.pop("_id", None)
                doc.pop("created_at", None)
                events.append(SwapEvent(**doc))
            return events
        except Exception as e:
            logger.error("Failed to get swap events", error=str(e))
            raise
    
    async def save_pool_liquidity(self, liquidity: PoolLiquidity) -> None:
        """Save pool liquidity snapshot with deduplication."""
        try:
            doc = liquidity.model_dump()
            doc["created_at"] = datetime.utcnow()
            
            # Use replace_one with unique key to prevent duplicates
            await self.pool_liquidity.replace_one(
                {
                    "pool_address": liquidity.pool_address,
                    "chain_id": liquidity.chain_id,
                    "block_number": liquidity.block_number
                },
                doc,
                upsert=True
            )
            
            logger.debug("Saved pool liquidity",
                        pool_address=liquidity.pool_address,
                        block_number=liquidity.block_number)
        except Exception as e:
            logger.error("Failed to save pool liquidity",
                        pool_address=liquidity.pool_address,
                        error=str(e))
            raise
    
    async def get_latest_liquidity(self, chain_id: int, pool_address: str) -> Optional[PoolLiquidity]:
        """Get latest liquidity snapshot for a pool."""
        try:
            doc = await self.pool_liquidity.find_one(
                {"chain_id": chain_id, "pool_address": pool_address},
                sort=[("block_number", -1)]
            )
            if doc:
                doc.pop("_id", None)
                doc.pop("created_at", None)
                return PoolLiquidity(**doc)
            return None
        except Exception as e:
            logger.error("Failed to get latest liquidity",
                        chain_id=chain_id,
                        pool_address=pool_address,
                        error=str(e))
            raise
    
    async def save_price_calculation(self, price_calc: PriceCalculation) -> None:
        """Save price calculation with proper unique key."""
        try:
            doc = price_calc.model_dump()
            doc["created_at"] = datetime.utcnow()
            
            # Use compound key to handle multiple swaps per transaction
            await self.price_calculations.replace_one(
                {
                    "tx_hash": price_calc.tx_hash,
                    "pool_address": price_calc.pool_address,
                    "block_number": price_calc.block_number
                },
                doc,
                upsert=True
            )
            
            logger.debug("Saved price calculation",
                        tx_hash=price_calc.tx_hash,
                        pool_address=price_calc.pool_address,
                        price=price_calc.price)
        except Exception as e:
            logger.error("Failed to save price calculation",
                        tx_hash=price_calc.tx_hash,
                        error=str(e))
            raise
    
    async def get_price_calculations(
        self, 
        chain_id: int, 
        pool_address: Optional[str] = None,
        from_block: Optional[int] = None,
        to_block: Optional[int] = None,
        limit: int = 100
    ) -> List[PriceCalculation]:
        """Get price calculations with filters."""
        try:
            query = {"chain_id": chain_id}
            
            if pool_address:
                query["pool_address"] = pool_address
            if from_block:
                query["block_number"] = {"$gte": from_block}
            if to_block:
                if "block_number" in query:
                    query["block_number"]["$lte"] = to_block
                else:
                    query["block_number"] = {"$lte": to_block}
            
            cursor = self.price_calculations.find(query).sort("block_number", -1).limit(limit)
            calculations = []
            async for doc in cursor:
                doc.pop("_id", None)
                doc.pop("created_at", None)
                calculations.append(PriceCalculation(**doc))
            return calculations
        except Exception as e:
            logger.error("Failed to get price calculations", error=str(e))
            raise
    
    async def get_latest_price(self, chain_id: int, pool_address: str) -> Optional[PriceCalculation]:
        """Get latest price calculation for a pool."""
        try:
            doc = await self.price_calculations.find_one(
                {"chain_id": chain_id, "pool_address": pool_address},
                sort=[("block_number", -1)]
            )
            if doc:
                doc.pop("_id", None)
                doc.pop("created_at", None)
                return PriceCalculation(**doc)
            return None
        except Exception as e:
            logger.error("Failed to get latest price",
                        chain_id=chain_id,
                        pool_address=pool_address,
                        error=str(e))
            raise


class MongoProgressRepository(ProgressRepository):
    """MongoDB implementation of progress repository."""
    
    def __init__(self, mongodb_url: str, database_name: str):
        self.mongodb_url = mongodb_url
        self.database_name = database_name
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None
        self.progress: Optional[AsyncIOMotorCollection] = None
    
    async def connect(self) -> None:
        """Connect to MongoDB."""
        try:
            self.client = AsyncIOMotorClient(self.mongodb_url)
            self.db = self.client[self.database_name]
            self.progress = self.db.indexer_progress
            
            # Create indexes
            await self.progress.create_index([("chain_id", 1), ("indexer_type", 1), ("pool_address", 1)], unique=True)
            
            logger.info("Connected to MongoDB for progress tracking", database=self.database_name)
        except Exception as e:
            logger.error("Failed to connect to MongoDB for progress", error=str(e))
            raise
    
    async def disconnect(self) -> None:
        """Disconnect from MongoDB."""
        if self.client:
            self.client.close()
    
    async def health_check(self) -> bool:
        """Check MongoDB health."""
        try:
            if not self.client:
                return False
            await self.client.admin.command('ping')
            return True
        except Exception:
            return False
    
    async def save_progress(self, progress: IndexerProgress) -> None:
        """Save indexer progress."""
        try:
            doc = progress.model_dump()
            doc["created_at"] = datetime.utcnow()
            
            await self.progress.replace_one(
                {
                    "chain_id": progress.chain_id,
                    "indexer_type": progress.indexer_type,
                    "pool_address": progress.pool_address
                },
                doc,
                upsert=True
            )
            
            logger.info("Saved indexer progress",
                       chain_id=progress.chain_id,
                       indexer_type=progress.indexer_type,
                       last_processed_block=progress.last_processed_block)
        except Exception as e:
            logger.error("Failed to save progress", error=str(e))
            raise
    
    async def get_progress(self, chain_id: int, indexer_type: str, pool_address: Optional[str] = None) -> Optional[IndexerProgress]:
        """Get indexer progress."""
        try:
            doc = await self.progress.find_one({
                "chain_id": chain_id,
                "indexer_type": indexer_type,
                "pool_address": pool_address
            })
            if doc:
                doc.pop("_id", None)
                doc.pop("created_at", None)
                return IndexerProgress(**doc)
            return None
        except Exception as e:
            logger.error("Failed to get progress", error=str(e))
            raise
    
    async def delete_progress(self, chain_id: int, indexer_type: str, pool_address: Optional[str] = None) -> bool:
        """Delete indexer progress."""
        try:
            filter_dict = {
                "chain_id": chain_id,
                "indexer_type": indexer_type
            }
            if pool_address:
                filter_dict["pool_address"] = pool_address
            
            result = await self.progress.delete_many(filter_dict)
            
            logger.info("Deleted indexer progress",
                       chain_id=chain_id,
                       indexer_type=indexer_type,
                       pool_address=pool_address,
                       deleted_count=result.deleted_count)
            
            return result.deleted_count > 0
        except Exception as e:
            logger.error("Failed to delete progress", error=str(e))
            raise
    
    async def update_progress(
        self, 
        chain_id: int, 
        indexer_type: str, 
        last_processed_block: int,
        pool_address: Optional[str] = None,
        status: Optional[str] = None,
        error_message: Optional[str] = None
    ) -> None:
        """Update indexer progress."""
        try:
            # For upsert, we need to include required fields when creating new documents
            update_doc = {
                "last_processed_block": last_processed_block,
                "updated_at": datetime.utcnow()
            }
            
            # Add status and error_message to update_doc if provided
            if status:
                update_doc["status"] = status
            if error_message is not None:
                update_doc["error_message"] = error_message
            
            # Use setOnInsert to set required fields only when creating new documents
            # Don't include fields that are also in update_doc to avoid conflicts
            set_on_insert = {
                "chain_id": chain_id,
                "indexer_type": indexer_type,
                "pool_address": pool_address,
                "target_block": last_processed_block,  # Use current block as target initially
                "started_at": datetime.utcnow()
            }
            
            # Only set default status in setOnInsert if no status is provided in update
            if not status:
                set_on_insert["status"] = "running"
            
            await self.progress.update_one(
                {
                    "chain_id": chain_id,
                    "indexer_type": indexer_type,
                    "pool_address": pool_address
                },
                {
                    "$set": update_doc,
                    "$setOnInsert": set_on_insert
                },
                upsert=True
            )
            
            logger.info("Updated indexer progress",
                       chain_id=chain_id,
                       indexer_type=indexer_type,
                       last_processed_block=last_processed_block)
        except Exception as e:
            logger.error("Failed to update progress", error=str(e))
            raise