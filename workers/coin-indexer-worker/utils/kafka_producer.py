"""Kafka producer for token events."""

from typing import Dict, Any, Optional
import structlog
import json
import asyncio
from datetime import datetime

try:
    from aiokafka import AIOKafkaProducer
    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False


logger = structlog.get_logger(__name__)


class KafkaProducer:
    """Kafka producer for publishing token events."""
    
    def __init__(self, bootstrap_servers: str, topic_prefix: str = "moonx"):
        self.bootstrap_servers = bootstrap_servers
        self.topic_prefix = topic_prefix
        self.producer: Optional[AIOKafkaProducer] = None
        self.is_connected = False
        
        if not KAFKA_AVAILABLE:
            logger.warning("Kafka is not available, events will not be published. Install aiokafka to enable Kafka support.")
    
    async def connect(self) -> None:
        """Connect to Kafka."""
        if not KAFKA_AVAILABLE:
            logger.info("Kafka not available, skipping connection")
            return
        
        try:
            self.producer = AIOKafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                value_serializer=lambda x: json.dumps(x, default=str).encode('utf-8'),
                key_serializer=lambda x: x.encode('utf-8') if x else None,
                retry_backoff_ms=1000,
                request_timeout_ms=30000,
                delivery_timeout_ms=60000,
                acks='all'  # Wait for all replicas to acknowledge
            )
            
            await self.producer.start()
            self.is_connected = True
            
            logger.info("Connected to Kafka", bootstrap_servers=self.bootstrap_servers)
            
        except Exception as e:
            logger.error("Failed to connect to Kafka", error=str(e))
            raise
    
    async def disconnect(self) -> None:
        """Disconnect from Kafka."""
        if self.producer and self.is_connected:
            try:
                await self.producer.stop()
                self.is_connected = False
                logger.info("Disconnected from Kafka")
            except Exception as e:
                logger.error("Error disconnecting from Kafka", error=str(e))
    
    async def publish_token_created(self, chain_id: int, token_info: Dict[str, Any]) -> None:
        """Publish token created event."""
        if not KAFKA_AVAILABLE or not self.is_connected:
            logger.debug("Kafka not available or not connected, skipping token created event")
            return
        
        try:
            topic = f"{self.topic_prefix}.token.created"
            
            event_data = {
                "event_type": "token_created",
                "chain_id": chain_id,
                "timestamp": datetime.utcnow().isoformat(),
                "token": token_info
            }
            
            # Use token address as key for partitioning
            key = f"{chain_id}:{token_info.get('token_address')}"
            
            await self.producer.send_and_wait(
                topic,
                value=event_data,
                key=key
            )
            
            logger.info("Published token created event",
                       topic=topic,
                       chain_id=chain_id,
                       token_address=token_info.get('token_address'),
                       token_name=token_info.get('name'))
            
        except Exception as e:
            logger.error("Failed to publish token created event",
                        chain_id=chain_id,
                        token_address=token_info.get('token_address'),
                        error=str(e))
    
    async def publish_token_audit_request(self, chain_id: int, token_address: str, 
                                        token_data: Dict[str, Any]) -> None:
        """Publish token audit request event."""
        if not KAFKA_AVAILABLE or not self.is_connected:
            logger.debug("Kafka not available or not connected, skipping audit request event")
            return
        
        try:
            topic = f"{self.topic_prefix}.token.audit_request"
            
            event_data = {
                "event_type": "token_audit_request",
                "chain_id": chain_id,
                "token_address": token_address,
                "timestamp": datetime.utcnow().isoformat(),
                "token_data": token_data,
                "priority": "normal"  # Could be configured based on token source/creator
            }
            
            # Use token address as key for partitioning
            key = f"{chain_id}:{token_address}"
            
            await self.producer.send_and_wait(
                topic,
                value=event_data,
                key=key
            )
            
            logger.info("Published token audit request",
                       topic=topic,
                       chain_id=chain_id,
                       token_address=token_address,
                       token_name=token_data.get('name'))
            
        except Exception as e:
            logger.error("Failed to publish token audit request",
                        chain_id=chain_id,
                        token_address=token_address,
                        error=str(e))
    
    async def publish_batch_events(self, events: list) -> None:
        """Publish multiple events in batch."""
        if not KAFKA_AVAILABLE or not self.is_connected:
            logger.debug("Kafka not available or not connected, skipping batch events")
            return
        
        try:
            tasks = []
            for event in events:
                if event.get('event_type') == 'token_created':
                    task = self.publish_token_created(
                        event['chain_id'], 
                        event['token']
                    )
                elif event.get('event_type') == 'token_audit_request':
                    task = self.publish_token_audit_request(
                        event['chain_id'],
                        event['token_address'],
                        event['token_data']
                    )
                else:
                    logger.warning("Unknown event type in batch", event_type=event.get('event_type'))
                    continue
                
                tasks.append(task)
            
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
                logger.info("Published batch events", count=len(tasks))
            
        except Exception as e:
            logger.error("Failed to publish batch events", error=str(e))
    
    async def health_check(self) -> bool:
        """Check Kafka connection health."""
        if not KAFKA_AVAILABLE:
            return False
            
        try:
            # Simple check - if producer is connected, assume healthy
            return self.is_connected
            
        except Exception as e:
            logger.error("Kafka health check failed", error=str(e))
            return False
