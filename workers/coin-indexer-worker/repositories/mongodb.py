from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase, AsyncIOMotorCollection
from typing import Optional, List, Dict, Any
from datetime import datetime
import structlog
from models.token import TokenInfo, TokenSource, TokenStatus

logger = structlog.get_logger()


class MongoTokenRepository:
    """MongoDB implementation for token repository."""
    
    def __init__(self, mongodb_url: str, database_name: str):
        self.mongodb_url = mongodb_url
        self.database_name = database_name
        self.client: Optional[AsyncIOMotorClient] = None
        self.db: Optional[AsyncIOMotorDatabase] = None
        self.is_connected = False
        
        # Collections
        self.tokens: Optional[AsyncIOMotorCollection] = None
    
    async def connect(self) -> None:
        """Connect to MongoDB."""
        if self.is_connected:
            logger.debug("Already connected to MongoDB for tokens")
            return
            
        try:
            self.client = AsyncIOMotorClient(self.mongodb_url)
            self.db = self.client[self.database_name]
            
            # Initialize collections
            self.tokens = self.db.tokens
            
            # Create indexes for optimal performance
            await self._create_indexes()
            
            self.is_connected = True
            logger.info("Connected to MongoDB for tokens", database=self.database_name)
        except Exception as e:
            logger.error("Failed to connect to MongoDB for tokens", error=str(e))
            raise
    
    async def disconnect(self) -> None:
        """Disconnect from MongoDB."""
        if not self.is_connected:
            logger.debug("Already disconnected from MongoDB for tokens")
            return
            
        try:
            if self.client:
                self.client.close()
                self.client = None
                self.db = None
                self.tokens = None
                self.is_connected = False
                logger.info("Disconnected from MongoDB for tokens")
        except Exception as e:
            logger.error("Error disconnecting from MongoDB for tokens", error=str(e))
            raise
    
    async def health_check(self) -> bool:
        """Check MongoDB health."""
        try:
            if not self.client:
                return False
            await self.client.admin.command('ping')
            return True
        except Exception as e:
            logger.error("MongoDB health check failed for tokens", error=str(e))
            return False
    
    async def _create_indexes(self) -> None:
        """Create database indexes for optimal performance."""
        # Token indexes
        await self.tokens.create_index([("chain_id", 1), ("token_address", 1)], unique=True)
        await self.tokens.create_index([("chain_id", 1), ("source", 1)])
        await self.tokens.create_index([("creator", 1)])
        await self.tokens.create_index([("creation_block", 1)])
        await self.tokens.create_index([("creation_timestamp", -1)])
        await self.tokens.create_index([("status", 1)])
        await self.tokens.create_index([("creation_tx_hash", 1)])
        await self.tokens.create_index([("name", "text"), ("symbol", "text")])  # Text search index
        
        logger.info("Created MongoDB indexes for tokens")
    
    async def save_token(self, token: TokenInfo) -> None:
        """Save token information."""
        try:
            doc = token.model_dump()
            doc["created_at"] = datetime.utcnow()
            doc["updated_at"] = datetime.utcnow()
            
            # Use upsert to handle potential duplicates
            filter_query = {
                "chain_id": token.chain_id,
                "token_address": token.token_address
            }
            
            update_doc = {"$set": doc}
            
            result = await self.tokens.update_one(
                filter_query,
                update_doc,
                upsert=True
            )
            
            if result.upserted_id:
                logger.info("Saved new token",
                           chain_id=token.chain_id,
                           token_address=token.token_address,
                           name=token.name,
                           symbol=token.symbol,
                           source=token.source)
            else:
                logger.info("Updated existing token",
                           chain_id=token.chain_id,
                           token_address=token.token_address,
                           name=token.name,
                           symbol=token.symbol,
                           source=token.source)
            
        except Exception as e:
            logger.error("Failed to save token",
                        chain_id=token.chain_id,
                        token_address=token.token_address,
                        name=token.name,
                        symbol=token.symbol,
                        error=str(e))
            raise
    
    async def get_token(self, chain_id: int, token_address: str) -> Optional[TokenInfo]:
        """Get token by address."""
        try:
            doc = await self.tokens.find_one({
                "chain_id": chain_id,
                "token_address": token_address
            })
            
            if doc:
                # Remove MongoDB specific fields
                doc.pop("_id", None)
                return TokenInfo(**doc)
            
            return None
            
        except Exception as e:
            logger.error("Failed to get token",
                        chain_id=chain_id,
                        token_address=token_address,
                        error=str(e))
            raise
    
    async def get_tokens_by_creator(self, chain_id: int, creator: str, limit: int = 100) -> List[TokenInfo]:
        """Get tokens created by a specific address."""
        try:
            cursor = self.tokens.find({
                "chain_id": chain_id,
                "creator": creator
            }).sort("creation_timestamp", -1).limit(limit)
            
            tokens = []
            async for doc in cursor:
                doc.pop("_id", None)
                tokens.append(TokenInfo(**doc))
            
            logger.debug("Retrieved tokens by creator",
                        chain_id=chain_id,
                        creator=creator,
                        count=len(tokens))
            
            return tokens
            
        except Exception as e:
            logger.error("Failed to get tokens by creator",
                        chain_id=chain_id,
                        creator=creator,
                        error=str(e))
            raise
    
    async def get_recent_tokens(self, chain_id: int, source: Optional[TokenSource] = None, 
                              limit: int = 100) -> List[TokenInfo]:
        """Get recent tokens, optionally filtered by source."""
        try:
            filter_query = {"chain_id": chain_id}
            if source:
                filter_query["source"] = source
            
            cursor = self.tokens.find(filter_query).sort("creation_timestamp", -1).limit(limit)
            
            tokens = []
            async for doc in cursor:
                doc.pop("_id", None)
                tokens.append(TokenInfo(**doc))
            
            logger.debug("Retrieved recent tokens",
                        chain_id=chain_id,
                        source=source,
                        count=len(tokens))
            
            return tokens
            
        except Exception as e:
            logger.error("Failed to get recent tokens",
                        chain_id=chain_id,
                        source=source,
                        error=str(e))
            raise
    
    async def search_tokens(self, chain_id: int, search_text: str, limit: int = 50) -> List[TokenInfo]:
        """Search tokens by name or symbol."""
        try:
            cursor = self.tokens.find({
                "chain_id": chain_id,
                "$text": {"$search": search_text}
            }).sort("creation_timestamp", -1).limit(limit)
            
            tokens = []
            async for doc in cursor:
                doc.pop("_id", None)
                tokens.append(TokenInfo(**doc))
            
            logger.debug("Searched tokens",
                        chain_id=chain_id,
                        search_text=search_text,
                        count=len(tokens))
            
            return tokens
            
        except Exception as e:
            logger.error("Failed to search tokens",
                        chain_id=chain_id,
                        search_text=search_text,
                        error=str(e))
            raise
    
    async def update_token_status(self, chain_id: int, token_address: str, 
                                 status: TokenStatus, error_message: Optional[str] = None) -> None:
        """Update token status."""
        try:
            update_doc = {
                "status": status,
                "updated_at": datetime.utcnow()
            }
            
            if error_message:
                update_doc["error_message"] = error_message
            elif status != TokenStatus.ERROR:
                update_doc["error_message"] = None
            
            result = await self.tokens.update_one(
                {"chain_id": chain_id, "token_address": token_address},
                {"$set": update_doc}
            )
            
            if result.modified_count > 0:
                logger.info("Updated token status",
                           chain_id=chain_id,
                           token_address=token_address,
                           status=status,
                           error_message=error_message)
            else:
                logger.warning("Token not found for status update",
                              chain_id=chain_id,
                              token_address=token_address)
            
        except Exception as e:
            logger.error("Failed to update token status",
                        chain_id=chain_id,
                        token_address=token_address,
                        status=status,
                        error=str(e))
            raise
    
    async def get_tokens_count(self, chain_id: int, source: Optional[TokenSource] = None) -> int:
        """Get total tokens count."""
        try:
            filter_query = {"chain_id": chain_id}
            if source:
                filter_query["source"] = source
            
            count = await self.tokens.count_documents(filter_query)
            
            logger.debug("Retrieved tokens count",
                        chain_id=chain_id,
                        source=source,
                        count=count)
            
            return count
            
        except Exception as e:
            logger.error("Failed to get tokens count",
                        chain_id=chain_id,
                        source=source,
                        error=str(e))
            raise


class MongoProgressRepository:
    """MongoDB implementation for progress tracking."""
    
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
            
            # Create index with error handling for duplicates
            await self._create_progress_index()
            
            logger.info("Connected to MongoDB for progress tracking", database=self.database_name)
        except Exception as e:
            logger.error("Failed to connect to MongoDB for progress tracking", error=str(e))
            raise
    
    async def _create_progress_index(self) -> None:
        """Create progress index with duplicate handling."""
        try:
            await self.progress.create_index([("chain_id", 1), ("indexer_type", 1)], unique=True)
            logger.info("Created unique index for progress tracking")
        except Exception as e:
            if "E11000" in str(e) or "duplicate key" in str(e).lower():
                logger.warning("Duplicate key error when creating index, cleaning up duplicates...")
                await self._cleanup_duplicate_progress()
                # Try creating index again
                try:
                    await self.progress.create_index([("chain_id", 1), ("indexer_type", 1)], unique=True)
                    logger.info("Created unique index for progress tracking after cleanup")
                except Exception as retry_e:
                    logger.error("Still failed to create index after cleanup", error=str(retry_e))
                    # Continue without unique index - not critical
            else:
                logger.error("Failed to create progress index", error=str(e))
                # Continue without index - not critical for functionality
    
    async def _cleanup_duplicate_progress(self) -> None:
        """Remove duplicate progress records, keeping the most recent one."""
        try:
            # Aggregate to find duplicates
            pipeline = [
                {
                    "$group": {
                        "_id": {"chain_id": "$chain_id", "indexer_type": "$indexer_type"},
                        "count": {"$sum": 1},
                        "docs": {"$push": {"_id": "$_id", "updated_at": "$updated_at"}}
                    }
                },
                {"$match": {"count": {"$gt": 1}}}
            ]
            
            duplicates = []
            async for result in self.progress.aggregate(pipeline):
                duplicates.append(result)
            
            if not duplicates:
                logger.info("No duplicate progress records found")
                return
            
            # For each duplicate group, keep the most recent and delete others
            for dup_group in duplicates:
                docs = dup_group["docs"]
                # Sort by updated_at descending, keep the first (most recent)
                docs.sort(key=lambda x: x.get("updated_at", datetime.min), reverse=True)
                docs_to_delete = docs[1:]  # All except the first (most recent)
                
                ids_to_delete = [doc["_id"] for doc in docs_to_delete]
                if ids_to_delete:
                    result = await self.progress.delete_many({"_id": {"$in": ids_to_delete}})
                    logger.info("Cleaned up duplicate progress records",
                              chain_id=dup_group["_id"]["chain_id"],
                              indexer_type=dup_group["_id"]["indexer_type"],
                              deleted_count=result.deleted_count)
            
            logger.info("Finished cleaning up duplicate progress records", 
                       duplicate_groups=len(duplicates))
            
        except Exception as e:
            logger.error("Failed to cleanup duplicate progress records", error=str(e))
    
    async def disconnect(self) -> None:
        """Disconnect from MongoDB."""
        try:
            if self.client:
                self.client.close()
                self.client = None
                self.db = None
                self.progress = None
                logger.info("Disconnected from MongoDB for progress tracking")
        except Exception as e:
            logger.error("Error disconnecting from MongoDB for progress tracking", error=str(e))
            # Don't raise here to allow other cleanup to continue
    
    async def save_progress(self, chain_id: int, indexer_type: str, block_number: int) -> None:
        """Save indexer progress."""
        try:
            doc = {
                "chain_id": chain_id,
                "indexer_type": indexer_type,
                "last_processed_block": block_number,
                "updated_at": datetime.utcnow()
            }
            
            await self.progress.update_one(
                {"chain_id": chain_id, "indexer_type": indexer_type},
                {"$set": doc},
                upsert=True
            )
            
            logger.debug("Saved progress",
                        chain_id=chain_id,
                        indexer_type=indexer_type,
                        block_number=block_number)
            
        except Exception as e:
            logger.error("Failed to save progress",
                        chain_id=chain_id,
                        indexer_type=indexer_type,
                        block_number=block_number,
                        error=str(e))
            raise
    
    async def get_progress(self, chain_id: int, indexer_type: str) -> Optional[int]:
        """Get last processed block number."""
        try:
            doc = await self.progress.find_one({
                "chain_id": chain_id,
                "indexer_type": indexer_type
            })
            
            if doc:
                return doc["last_processed_block"]
            
            return None
            
        except Exception as e:
            logger.error("Failed to get progress",
                        chain_id=chain_id,
                        indexer_type=indexer_type,
                        error=str(e))
            raise
    
    async def delete_progress(self, chain_id: int, indexer_type: str) -> None:
        """Delete progress record."""
        try:
            result = await self.progress.delete_one({
                "chain_id": chain_id,
                "indexer_type": indexer_type
            })
            
            logger.info("Deleted progress",
                       chain_id=chain_id,
                       indexer_type=indexer_type,
                       deleted_count=result.deleted_count)
            
        except Exception as e:
            logger.error("Failed to delete progress",
                        chain_id=chain_id,
                        indexer_type=indexer_type,
                        error=str(e))
            raise
