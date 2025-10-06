"""ENS resolver utilities for resolving addresses to ENS names."""

from typing import Optional, Dict, Any
import structlog
import asyncio
from web3 import Web3

logger = structlog.get_logger(__name__)


class ENSResolver:
    """Resolve Ethereum addresses to ENS names with Base and Ethereum network support."""
    
    def __init__(self, web3_instances: Dict[int, Web3]):
        """
        Initialize ENS resolver with Web3 instances for different chains.
        
        Args:
            web3_instances: Dict mapping chain_id to Web3 instance
        """
        self.web3_instances = web3_instances
        
        # Chain IDs for ENS networks
        self.ETHEREUM_CHAIN_ID = 1
        self.BASE_CHAIN_ID = 8453
        
        logger.info("ENS resolver initialized", 
                   available_chains=list(web3_instances.keys()))
    
    async def resolve_address(self, address: str, prefer_base: bool = True) -> Optional[str]:
        """
        Resolve an address to ENS name.
        
        Args:
            address: Ethereum address to resolve
            prefer_base: If True, try Base ENS first, then Ethereum
            
        Returns:
            ENS name if found, None otherwise
        """
        if not address or not Web3.is_address(address):
            return None
        
        # Normalize address
        try:
            normalized_address = Web3.to_checksum_address(address)
        except Exception as e:
            logger.debug("Invalid address format", address=address, error=str(e))
            return None
        
        # Try Base ENS first if preferred and available
        if prefer_base and self.BASE_CHAIN_ID in self.web3_instances:
            base_ens = await self._resolve_on_chain(normalized_address, self.BASE_CHAIN_ID)
            if base_ens:
                logger.debug("Resolved ENS on Base", address=address, ens=base_ens)
                return base_ens
        
        # Try Ethereum ENS
        if self.ETHEREUM_CHAIN_ID in self.web3_instances:
            eth_ens = await self._resolve_on_chain(normalized_address, self.ETHEREUM_CHAIN_ID)
            if eth_ens:
                logger.debug("Resolved ENS on Ethereum", address=address, ens=eth_ens)
                return eth_ens
        
        # If Base wasn't preferred or wasn't available, try it now
        if not prefer_base and self.BASE_CHAIN_ID in self.web3_instances:
            base_ens = await self._resolve_on_chain(normalized_address, self.BASE_CHAIN_ID)
            if base_ens:
                logger.debug("Resolved ENS on Base (fallback)", address=address, ens=base_ens)
                return base_ens
        
        logger.debug("No ENS name found for address", address=address)
        return None
    
    async def _resolve_on_chain(self, address: str, chain_id: int) -> Optional[str]:
        """
        Resolve address on a specific chain.
        
        Args:
            address: Normalized Ethereum address
            chain_id: Chain ID to resolve on
            
        Returns:
            ENS name if found, None otherwise
        """
        try:
            web3 = self.web3_instances.get(chain_id)
            if not web3:
                return None
            
            # Use asyncio executor to avoid blocking
            loop = asyncio.get_event_loop()
            
            # Try to resolve using web3.py ENS resolver
            def resolve_sync():
                try:
                    if hasattr(web3, 'ens'):
                        return web3.ens.name(address)
                    return None
                except Exception:
                    return None
            
            ens_name = await loop.run_in_executor(None, resolve_sync)
            
            return ens_name
            
        except Exception as e:
            logger.debug("Error resolving ENS on chain",
                        address=address,
                        chain_id=chain_id,
                        error=str(e))
            return None
    
    def get_display_name(self, address: str, ens_name: Optional[str] = None) -> str:
        """
        Get display name for an address, preferring ENS name.
        
        Args:
            address: Ethereum address
            ens_name: Optional ENS name (if already resolved)
            
        Returns:
            ENS name if available, otherwise shortened address
        """
        if ens_name:
            return ens_name
        
        if not address or not Web3.is_address(address):
            return address or "Unknown"
        
        # Return shortened address format
        return f"<code>{address}</code>"
    
    async def resolve_and_format(self, address: str, prefer_base: bool = True) -> str:
        """
        Resolve address to ENS and format for display.
        
        Args:
            address: Ethereum address to resolve
            prefer_base: If True, try Base ENS first
            
        Returns:
            Formatted display name (ENS name or shortened address)
        """
        ens_name = await self.resolve_address(address, prefer_base)
        return self.get_display_name(address, ens_name)


def create_ens_resolver(web3_instances: Dict[int, Web3]) -> ENSResolver:
    """
    Factory function to create ENS resolver.
    
    Args:
        web3_instances: Dict mapping chain_id to Web3 instance
        
    Returns:
        Configured ENS resolver
    """
    return ENSResolver(web3_instances)
