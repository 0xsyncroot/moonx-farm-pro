"""Block explorer URL utilities for different blockchain networks."""

from typing import Optional, Dict, Any
import structlog

logger = structlog.get_logger(__name__)


class BlockExplorerURLs:
    """Generate block explorer URLs for different blockchain networks."""
    
    # Block explorer base URLs for different chains
    EXPLORERS = {
        1: {  # Ethereum Mainnet
            "name": "Etherscan",
            "base_url": "https://etherscan.io",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        },
        56: {  # BSC
            "name": "BscScan",
            "base_url": "https://bscscan.com",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        },
        137: {  # Polygon
            "name": "PolygonScan",
            "base_url": "https://polygonscan.com",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        },
        8453: {  # Base
            "name": "BaseScan",
            "base_url": "https://basescan.org",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        },
        42161: {  # Arbitrum One
            "name": "Arbiscan",
            "base_url": "https://arbiscan.io",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        },
        10: {  # Optimism
            "name": "Optimistic Etherscan",
            "base_url": "https://optimistic.etherscan.io",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        },
        43114: {  # Avalanche C-Chain
            "name": "Snowtrace",
            "base_url": "https://snowtrace.io",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        },
        250: {  # Fantom
            "name": "FTMScan",
            "base_url": "https://ftmscan.com",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        },
        5: {  # Goerli (Testnet)
            "name": "Goerli Etherscan",
            "base_url": "https://goerli.etherscan.io",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        },
        11155111: {  # Sepolia (Testnet)
            "name": "Sepolia Etherscan",
            "base_url": "https://sepolia.etherscan.io",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        },
        84531: {  # Base Goerli (Testnet)
            "name": "Base Goerli",
            "base_url": "https://goerli.basescan.org",
            "address_path": "/address/",
            "tx_path": "/tx/",
            "token_path": "/token/",
            "block_path": "/block/"
        }
    }
    
    def __init__(self):
        """Initialize block explorer URL generator."""
        logger.debug("Block explorer URL generator initialized", 
                    supported_chains=list(self.EXPLORERS.keys()))
    
    def get_explorer_info(self, chain_id: int) -> Optional[Dict[str, str]]:
        """
        Get explorer information for a chain.
        
        Args:
            chain_id: Blockchain network chain ID
            
        Returns:
            Explorer info dict or None if not supported
        """
        return self.EXPLORERS.get(chain_id)
    
    def get_address_url(self, chain_id: int, address: str) -> Optional[str]:
        """
        Get block explorer URL for an address.
        
        Args:
            chain_id: Blockchain network chain ID
            address: Ethereum address
            
        Returns:
            Block explorer URL or None if chain not supported
        """
        explorer = self.get_explorer_info(chain_id)
        if not explorer:
            logger.debug("Unsupported chain for block explorer", chain_id=chain_id)
            return None
        
        if not address:
            return None
        
        url = f"{explorer['base_url']}{explorer['address_path']}{address}"
        logger.debug("Generated address URL", 
                    chain_id=chain_id, 
                    address=address, 
                    url=url)
        return url
    
    def get_transaction_url(self, chain_id: int, tx_hash: str) -> Optional[str]:
        """
        Get block explorer URL for a transaction.
        
        Args:
            chain_id: Blockchain network chain ID
            tx_hash: Transaction hash
            
        Returns:
            Block explorer URL or None if chain not supported
        """
        explorer = self.get_explorer_info(chain_id)
        if not explorer:
            return None
        
        if not tx_hash:
            return None
        
        # Remove 0x prefix if present
        clean_hash = tx_hash[2:] if tx_hash.startswith('0x') else tx_hash
        url = f"{explorer['base_url']}{explorer['tx_path']}0x{clean_hash}"
        return url
    
    def get_token_url(self, chain_id: int, token_address: str) -> Optional[str]:
        """
        Get block explorer URL for a token.
        
        Args:
            chain_id: Blockchain network chain ID
            token_address: Token contract address
            
        Returns:
            Block explorer URL or None if chain not supported
        """
        explorer = self.get_explorer_info(chain_id)
        if not explorer:
            return None
        
        if not token_address:
            return None
        
        url = f"{explorer['base_url']}{explorer['token_path']}{token_address}"
        return url
    
    def get_block_url(self, chain_id: int, block_number: int) -> Optional[str]:
        """
        Get block explorer URL for a block.
        
        Args:
            chain_id: Blockchain network chain ID
            block_number: Block number
            
        Returns:
            Block explorer URL or None if chain not supported
        """
        explorer = self.get_explorer_info(chain_id)
        if not explorer:
            return None
        
        url = f"{explorer['base_url']}{explorer['block_path']}{block_number}"
        return url
    
    def get_explorer_name(self, chain_id: int) -> str:
        """
        Get the name of the block explorer for a chain.
        
        Args:
            chain_id: Blockchain network chain ID
            
        Returns:
            Explorer name or "Block Explorer" if unknown
        """
        explorer = self.get_explorer_info(chain_id)
        return explorer["name"] if explorer else "Block Explorer"
    
    def is_supported_chain(self, chain_id: int) -> bool:
        """
        Check if a chain is supported.
        
        Args:
            chain_id: Blockchain network chain ID
            
        Returns:
            True if chain is supported, False otherwise
        """
        return chain_id in self.EXPLORERS
    
    def get_supported_chains(self) -> Dict[int, str]:
        """
        Get all supported chains and their names.
        
        Returns:
            Dict mapping chain_id to explorer name
        """
        return {
            chain_id: info["name"] 
            for chain_id, info in self.EXPLORERS.items()
        }


# Global instance for easy access
block_explorer = BlockExplorerURLs()
