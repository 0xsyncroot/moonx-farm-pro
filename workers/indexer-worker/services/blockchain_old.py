from web3 import Web3
from web3.middleware import geth_poa_middleware
from typing import List, Dict, Any, Optional, Tuple
import asyncio
import aiohttp
import structlog
from datetime import datetime
from tenacity import retry, stop_after_attempt, wait_exponential
from config.settings import ChainConfig
from models.pool import TokenInfo, PoolInfo, SwapEvent, PoolLiquidity, PoolProtocol, PriceCalculation


logger = structlog.get_logger()


class BlockchainService:
    """Service for interacting with blockchain data."""
    
    def __init__(self, chain_config: ChainConfig):
        self.chain_config = chain_config
        self.w3: Optional[Web3] = None
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def connect(self) -> None:
        """Connect to blockchain RPC."""
        try:
            # Initialize Web3 with HTTP provider
            self.w3 = Web3(Web3.HTTPProvider(
                self.chain_config.rpc_url,
                request_kwargs={'timeout': 30}
            ))
            
            # Add PoA middleware for some chains
            self.w3.middleware_onion.inject(geth_poa_middleware, layer=0)
            
            # Initialize aiohttp session for async requests
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30)
            )
            
            # Test connection
            latest_block = await self.get_latest_block()
            
            logger.info("Connected to blockchain",
                       chain_id=self.chain_config.chain_id,
                       chain_name=self.chain_config.name,
                       latest_block=latest_block)
        except Exception as e:
            logger.error("Failed to connect to blockchain",
                        chain_id=self.chain_config.chain_id,
                        error=str(e))
            raise
    
    async def disconnect(self) -> None:
        """Disconnect from blockchain."""
        if self.session:
            await self.session.close()
        logger.info("Disconnected from blockchain", chain_id=self.chain_config.chain_id)
    
    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=4, max=10))
    async def _make_rpc_call(self, method: str, params: List[Any]) -> Any:
        """Make async RPC call with retry logic."""
        if not self.session:
            raise Exception("Session not initialized")
        
        payload = {
            "jsonrpc": "2.0",
            "method": method,
            "params": params,
            "id": 1
        }
        
        async with self.session.post(
            self.chain_config.rpc_url,
            json=payload,
            headers={"Content-Type": "application/json"}
        ) as response:
            data = await response.json()
            
            if "error" in data:
                raise Exception(f"RPC error: {data['error']}")
            
            return data.get("result")
    
    async def get_latest_block(self) -> int:
        """Get latest block number."""
        try:
            result = await self._make_rpc_call("eth_blockNumber", [])
            return int(result, 16)
        except Exception as e:
            logger.error("Failed to get latest block", error=str(e))
            raise
    
    async def get_block_timestamp(self, block_number: int) -> datetime:
        """Get block timestamp."""
        try:
            result = await self._make_rpc_call("eth_getBlockByNumber", [hex(block_number), False])
            timestamp = int(result["timestamp"], 16)
            return datetime.utcfromtimestamp(timestamp)
        except Exception as e:
            logger.error("Failed to get block timestamp", block_number=block_number, error=str(e))
            raise
    
    async def get_logs(
        self, 
        from_block: int, 
        to_block: int, 
        address: Optional[str] = None,
        topics: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """Get logs from blockchain."""
        try:
            params = {
                "fromBlock": hex(from_block),
                "toBlock": hex(to_block)
            }
            
            if address:
                params["address"] = address
            if topics:
                params["topics"] = topics
            
            result = await self._make_rpc_call("eth_getLogs", [params])
            return result or []
        except Exception as e:
            logger.error("Failed to get logs",
                        from_block=from_block,
                        to_block=to_block,
                        error=str(e))
            raise
    
    async def get_token_info(self, token_address: str, include_market_data: bool = False) -> TokenInfo:
        """Get comprehensive token information."""
        try:
            # ERC20 function signatures
            symbol_sig = "0x95d89b41"  # symbol()
            name_sig = "0x06fdde03"    # name()
            decimals_sig = "0x313ce567"  # decimals()
            total_supply_sig = "0x18160ddd"  # totalSupply()
            
            # Make calls in parallel
            calls = [
                self._make_rpc_call("eth_call", [{"to": token_address, "data": symbol_sig}, "latest"]),
                self._make_rpc_call("eth_call", [{"to": token_address, "data": name_sig}, "latest"]),
                self._make_rpc_call("eth_call", [{"to": token_address, "data": decimals_sig}, "latest"]),
                self._make_rpc_call("eth_call", [{"to": token_address, "data": total_supply_sig}, "latest"])
            ]
            
            symbol_result, name_result, decimals_result, total_supply_result = await asyncio.gather(*calls, return_exceptions=True)
            
            # Decode results with error handling
            symbol = self._decode_string(symbol_result) if not isinstance(symbol_result, Exception) else "UNKNOWN"
            name = self._decode_string(name_result) if not isinstance(name_result, Exception) else "Unknown Token"
            decimals = int(decimals_result, 16) if not isinstance(decimals_result, Exception) and decimals_result != "0x" else 18
            total_supply = str(int(total_supply_result, 16)) if not isinstance(total_supply_result, Exception) and total_supply_result != "0x" else "0"
            
            # Enhanced token info
            token_info = TokenInfo(
                address=token_address,
                symbol=symbol,
                name=name,
                decimals=decimals,
                total_supply=total_supply,
                is_contract_verified=await self._check_contract_verification(token_address)
            )
            
            # Add market data if requested
            if include_market_data:
                market_data = await self._get_token_market_data(token_address)
                if market_data:
                    token_info.current_price_usd = market_data.get("price_usd")
                    token_info.market_cap = market_data.get("market_cap")
                    token_info.volume_24h = market_data.get("volume_24h")
            
            return token_info
            
        except Exception as e:
            logger.error("Failed to get token info", token_address=token_address, error=str(e))
            # Return basic info if call fails
            return TokenInfo(
                address=token_address,
                symbol="UNKNOWN",
                name="Unknown Token",
                decimals=18,
                is_contract_verified=False
            )
    
    async def _check_contract_verification(self, token_address: str) -> bool:
        """Check if contract is verified (basic heuristic)."""
        try:
            # Simple check: try to get contract code
            code_result = await self._make_rpc_call("eth_getCode", [token_address, "latest"])
            return code_result != "0x" and len(code_result) > 10
        except Exception:
            return False
    
    async def _get_token_market_data(self, token_address: str) -> Optional[Dict[str, str]]:
        """Get token market data from external sources (placeholder)."""
        # This would integrate with price APIs like CoinGecko, CoinMarketCap, etc.
        # For now, return None as this requires external API integration
        return None
    
    async def get_uniswap_v3_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get comprehensive Uniswap V3 pool state."""
        try:
            # Uniswap V3 Pool function signatures
            slot0_sig = "0x3850c7bd"  # slot0()
            liquidity_sig = "0x1a686502"  # liquidity()
            tick_spacing_sig = "0xd0c93a7c"  # tickSpacing()
            fee_sig = "0xddca3f43"  # fee()
            
            # Make parallel calls to get pool state
            calls = [
                self._make_rpc_call("eth_call", [{"to": pool_address, "data": slot0_sig}, "latest"]),
                self._make_rpc_call("eth_call", [{"to": pool_address, "data": liquidity_sig}, "latest"]),
                self._make_rpc_call("eth_call", [{"to": pool_address, "data": tick_spacing_sig}, "latest"]),
                self._make_rpc_call("eth_call", [{"to": pool_address, "data": fee_sig}, "latest"])
            ]
            
            slot0_result, liquidity_result, tick_spacing_result, fee_result = await asyncio.gather(
                *calls, return_exceptions=True
            )
            
            pool_state = {}
            
            # Parse slot0 result (contains sqrt_price_x96, tick, etc.)
            if not isinstance(slot0_result, Exception) and slot0_result != "0x":
                slot0_data = self._parse_slot0(slot0_result)
                pool_state.update(slot0_data)
            
            # Parse liquidity
            if not isinstance(liquidity_result, Exception) and liquidity_result != "0x":
                pool_state["liquidity"] = str(int(liquidity_result, 16))
            
            # Parse tick spacing
            if not isinstance(tick_spacing_result, Exception) and tick_spacing_result != "0x":
                pool_state["tick_spacing"] = int(tick_spacing_result, 16)
            
            # Parse fee
            if not isinstance(fee_result, Exception) and fee_result != "0x":
                pool_state["fee"] = int(fee_result, 16)
            
            return pool_state if pool_state else None
            
        except Exception as e:
            logger.error("Failed to get pool state", pool_address=pool_address, error=str(e))
            return None
    
    def _parse_slot0(self, slot0_data: str) -> Dict[str, Any]:
        """Parse Uniswap V3 slot0 data."""
        try:
            # Remove 0x prefix
            data = slot0_data[2:] if slot0_data.startswith("0x") else slot0_data
            
            # slot0 returns:
            # uint160 sqrtPriceX96 (32 bytes)
            # int24 tick (32 bytes) 
            # uint16 observationIndex (32 bytes)
            # uint16 observationCardinality (32 bytes)
            # uint16 observationCardinalityNext (32 bytes)
            # uint8 feeProtocol (32 bytes)
            # bool unlocked (32 bytes)
            
            result = {}
            
            # Extract sqrt price (first 32 bytes, but only use 20 bytes for uint160)
            sqrt_price_hex = data[:64]
            if sqrt_price_hex:
                result["sqrt_price_x96"] = str(int(sqrt_price_hex, 16))
            
            # Extract current tick (second 32 bytes, signed int24)
            tick_hex = data[64:128]
            if tick_hex:
                tick_value = int(tick_hex, 16)
                # Convert to signed int24
                if tick_value >= 2**23:
                    tick_value -= 2**24
                result["current_tick"] = tick_value
            
            # Extract observation index (third 32 bytes)
            obs_index_hex = data[128:192]
            if obs_index_hex:
                result["observation_index"] = int(obs_index_hex, 16)
            
            # Extract observation cardinality (fourth 32 bytes)
            obs_card_hex = data[192:256]
            if obs_card_hex:
                result["observation_cardinality"] = int(obs_card_hex, 16)
            
            return result
            
        except Exception as e:
            logger.error("Failed to parse slot0 data", error=str(e))
            return {}
    
    def _calculate_prices_from_sqrt_price(
        self, 
        sqrt_price_x96: str, 
        token0_decimals: int, 
        token1_decimals: int
    ) -> Dict[str, str]:
        """Calculate token prices from Uniswap V3 sqrt price."""
        try:
            # Convert sqrt_price_x96 to actual price
            sqrt_price = int(sqrt_price_x96) / (2**96)
            price = sqrt_price ** 2
            
            # Adjust for token decimals
            decimal_adjustment = 10 ** (token1_decimals - token0_decimals)
            adjusted_price = price * decimal_adjustment
            
            # Calculate both directions
            price_token0_in_token1 = str(adjusted_price)
            price_token1_in_token0 = str(1 / adjusted_price if adjusted_price != 0 else 0)
            
            return {
                "price_token0": price_token0_in_token1,
                "price_token1": price_token1_in_token0
            }
            
        except Exception as e:
            logger.error("Failed to calculate prices from sqrt price", error=str(e))
            return {
                "price_token0": "0",
                "price_token1": "0"
            }
    
    def _decode_string(self, hex_data: str) -> str:
        """Decode hex string from contract call."""
        try:
            if hex_data == "0x" or len(hex_data) < 3:
                return "UNKNOWN"
            
            # Remove 0x prefix
            data = hex_data[2:]
            
            # Skip first 64 chars (offset) and next 64 chars (length)
            if len(data) > 128:
                # Get length
                length = int(data[64:128], 16) * 2
                # Get string data
                string_data = data[128:128+length]
                return bytes.fromhex(string_data).decode('utf-8', errors='ignore').rstrip('\x00')
            
            return "UNKNOWN"
        except Exception:
            return "UNKNOWN"
    
    async def parse_pool_created_event(self, log: Dict[str, Any], protocol: str) -> Optional[PoolInfo]:
        """Parse pool creation event from log."""
        try:
            # Get block timestamp
            block_number = int(log["blockNumber"], 16)
            block_timestamp = await self.get_block_timestamp(block_number)
            
            # Parse based on protocol
            if protocol == "uniswap_v2":
                return await self._parse_uniswap_v2_pool_created(log, block_number, block_timestamp)
            elif protocol == "uniswap_v3":
                return await self._parse_uniswap_v3_pool_created(log, block_number, block_timestamp)
            elif protocol == "uniswap_v4":
                return await self._parse_uniswap_v4_pool_created(log, block_number, block_timestamp)
            elif protocol == "sushiswap":
                return await self._parse_sushiswap_pool_created(log, block_number, block_timestamp)
            elif protocol == "sushiswap_v3":
                return await self._parse_sushiswap_v3_pool_created(log, block_number, block_timestamp)
            elif protocol == "pancakeswap_v2":
                return await self._parse_pancakeswap_v2_pool_created(log, block_number, block_timestamp)
            elif protocol == "pancakeswap_v3":
                return await self._parse_pancakeswap_v3_pool_created(log, block_number, block_timestamp)
            elif protocol == "balancer_v2":
                return await self._parse_balancer_v2_pool_created(log, block_number, block_timestamp)
            elif protocol == "curve":
                return await self._parse_curve_pool_created(log, block_number, block_timestamp)
            else:
                logger.warning("Unknown protocol for pool creation", protocol=protocol)
                return None
                
        except Exception as e:
            logger.error("Failed to parse pool created event", error=str(e))
            return None
    
    async def _parse_uniswap_v3_pool_created(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> PoolInfo:
        """Parse Uniswap V3 pool created event."""
        # Uniswap V3 PoolCreated event structure:
        # event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract tokens from topics
        token0_address = "0x" + topics[1][-40:]
        token1_address = "0x" + topics[2][-40:]
        fee_tier = int(topics[3], 16)
        
        # Extract pool address from data
        pool_address = "0x" + data[-40:]
        
        # Get token information
        token0 = await self.get_token_info(token0_address)
        token1 = await self.get_token_info(token1_address)
        
        # Get current pool state
        pool_state = await self.get_uniswap_v3_pool_state(pool_address)
        
        pool_info = PoolInfo(
            pool_address=pool_address,
            chain_id=self.chain_config.chain_id,
            protocol=PoolProtocol.UNISWAP_V3,
            token0=token0,
            token1=token1,
            fee_tier=fee_tier,
            factory_address=log["address"],
            creation_block=block_number,
            creation_tx_hash=log["transactionHash"],
            creation_timestamp=block_timestamp
        )
        
        # Add current state data if available
        if pool_state:
            pool_info.current_sqrt_price_x96 = pool_state.get("sqrt_price_x96")
            pool_info.current_tick = pool_state.get("current_tick")
            pool_info.current_liquidity = pool_state.get("liquidity")
            pool_info.tick_spacing = pool_state.get("tick_spacing")
            
            # Calculate prices from sqrt price
            if pool_state.get("sqrt_price_x96"):
                prices = self._calculate_prices_from_sqrt_price(
                    pool_state["sqrt_price_x96"], 
                    token0.decimals, 
                    token1.decimals
                )
                pool_info.current_price_token0 = prices["price_token0"]
                pool_info.current_price_token1 = prices["price_token1"]
        
        return pool_info
    
    async def _parse_uniswap_v2_pool_created(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> PoolInfo:
        """Parse Uniswap V2 pool created event."""
        # Uniswap V2 PairCreated event structure:
        # event PairCreated(address indexed token0, address indexed token1, address pair, uint)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract tokens from topics
        token0_address = "0x" + topics[1][-40:]
        token1_address = "0x" + topics[2][-40:]
        
        # Extract pool address from data (first 20 bytes)
        pool_address = "0x" + data[26:66]
        
        # Get token information
        token0 = await self.get_token_info(token0_address)
        token1 = await self.get_token_info(token1_address)
        
        # Get current pool state (reserves)
        pool_state = await self.get_uniswap_v2_pool_state(pool_address)
        
        pool_info = PoolInfo(
            pool_address=pool_address,
            chain_id=self.chain_config.chain_id,
            protocol=PoolProtocol.UNISWAP_V2,
            token0=token0,
            token1=token1,
            factory_address=log["address"],
            creation_block=block_number,
            creation_tx_hash=log["transactionHash"],
            creation_timestamp=block_timestamp
        )
        
        # Add V2 specific state data
        if pool_state:
            pool_info.reserve0 = pool_state.get("reserve0")
            pool_info.reserve1 = pool_state.get("reserve1")
            
            # Calculate prices from reserves
            if pool_state.get("reserve0") and pool_state.get("reserve1"):
                prices = self._calculate_prices_from_reserves(
                    pool_state["reserve0"],
                    pool_state["reserve1"],
                    token0.decimals,
                    token1.decimals
                )
                pool_info.current_price_token0 = prices["price_token0"]
                pool_info.current_price_token1 = prices["price_token1"]
        
        return pool_info
    
    async def _parse_uniswap_v4_pool_created(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> PoolInfo:
        """Parse Uniswap V4 pool created event."""
        # Uniswap V4 uses singleton pattern with PoolKey
        # event PoolInitialized(PoolId indexed id, Currency indexed currency0, Currency indexed currency1, uint24 fee, int24 tickSpacing, address hooks)
        
        topics = log["topics"]
        data = log["data"]
        
        # V4 has different structure - pool ID in first topic
        pool_id = topics[1]
        token0_address = "0x" + topics[2][-40:]
        token1_address = "0x" + topics[3][-40:]
        
        # Extract fee and tickSpacing from data
        fee_tier = int(data[2:66], 16)
        tick_spacing = int(data[66:130], 16)
        hooks_address = "0x" + data[154:194]
        
        # For V4, pool address is the singleton manager
        pool_address = log["address"]  # This is the PoolManager singleton
        
        # Get token information
        token0 = await self.get_token_info(token0_address)
        token1 = await self.get_token_info(token1_address)
        
        pool_info = PoolInfo(
            pool_address=pool_address,
            chain_id=self.chain_config.chain_id,
            protocol=PoolProtocol.UNISWAP_V4,
            token0=token0,
            token1=token1,
            fee_tier=fee_tier,
            tick_spacing=tick_spacing,
            factory_address=log["address"],
            creation_block=block_number,
            creation_tx_hash=log["transactionHash"],
            creation_timestamp=block_timestamp,
            metadata={
                "pool_id": pool_id,
                "hooks_address": hooks_address,
                "singleton_manager": True
            }
        )
        
        return pool_info
    
    async def _parse_sushiswap_v3_pool_created(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> PoolInfo:
        """Parse SushiSwap V3 pool created event."""
        # SushiSwap V3 follows Uniswap V3 pattern but may have slight differences
        # event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract tokens from topics (same as Uniswap V3)
        token0_address = "0x" + topics[1][-40:]
        token1_address = "0x" + topics[2][-40:]
        fee_tier = int(topics[3], 16)
        
        # Extract pool address from data
        pool_address = "0x" + data[-40:]
        
        # Get token information
        token0 = await self.get_token_info(token0_address)
        token1 = await self.get_token_info(token1_address)
        
        # Get current pool state (same as V3)
        pool_state = await self.get_uniswap_v3_pool_state(pool_address)
        
        pool_info = PoolInfo(
            pool_address=pool_address,
            chain_id=self.chain_config.chain_id,
            protocol=PoolProtocol.SUSHISWAP_V3,
            token0=token0,
            token1=token1,
            fee_tier=fee_tier,
            factory_address=log["address"],
            creation_block=block_number,
            creation_tx_hash=log["transactionHash"],
            creation_timestamp=block_timestamp
        )
        
        # Add current state data if available
        if pool_state:
            pool_info.current_sqrt_price_x96 = pool_state.get("sqrt_price_x96")
            pool_info.current_tick = pool_state.get("current_tick")
            pool_info.current_liquidity = pool_state.get("liquidity")
            pool_info.tick_spacing = pool_state.get("tick_spacing")
            
            # Calculate prices from sqrt price
            if pool_state.get("sqrt_price_x96"):
                prices = self._calculate_prices_from_sqrt_price(
                    pool_state["sqrt_price_x96"], 
                    token0.decimals, 
                    token1.decimals
                )
                pool_info.current_price_token0 = prices["price_token0"]
                pool_info.current_price_token1 = prices["price_token1"]
        
        return pool_info
    
    async def _parse_pancakeswap_v2_pool_created(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> PoolInfo:
        """Parse PancakeSwap V2 pool created event."""
        # PancakeSwap V2 follows Uniswap V2 pattern exactly
        # event PairCreated(address indexed token0, address indexed token1, address pair, uint)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract tokens from topics
        token0_address = "0x" + topics[1][-40:]
        token1_address = "0x" + topics[2][-40:]
        
        # Extract pool address from data
        pool_address = "0x" + data[26:66]
        
        # Get token information
        token0 = await self.get_token_info(token0_address)
        token1 = await self.get_token_info(token1_address)
        
        # Get current pool state
        pool_state = await self.get_uniswap_v2_pool_state(pool_address)  # Same interface as V2
        
        pool_info = PoolInfo(
            pool_address=pool_address,
            chain_id=self.chain_config.chain_id,
            protocol=PoolProtocol.PANCAKESWAP_V2,
            token0=token0,
            token1=token1,
            factory_address=log["address"],
            creation_block=block_number,
            creation_tx_hash=log["transactionHash"],
            creation_timestamp=block_timestamp
        )
        
        # Add V2 specific state data
        if pool_state:
            pool_info.reserve0 = pool_state.get("reserve0")
            pool_info.reserve1 = pool_state.get("reserve1")
            
            # Calculate prices from reserves
            if pool_state.get("reserve0") and pool_state.get("reserve1"):
                prices = self._calculate_prices_from_reserves(
                    pool_state["reserve0"],
                    pool_state["reserve1"],
                    token0.decimals,
                    token1.decimals
                )
                pool_info.current_price_token0 = prices["price_token0"]
                pool_info.current_price_token1 = prices["price_token1"]
        
        return pool_info
    
    async def _parse_pancakeswap_v3_pool_created(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> PoolInfo:
        """Parse PancakeSwap V3 pool created event."""
        # PancakeSwap V3 follows Uniswap V3 pattern
        # event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract tokens from topics
        token0_address = "0x" + topics[1][-40:]
        token1_address = "0x" + topics[2][-40:]
        fee_tier = int(topics[3], 16)
        
        # Extract pool address from data
        pool_address = "0x" + data[-40:]
        
        # Get token information
        token0 = await self.get_token_info(token0_address)
        token1 = await self.get_token_info(token1_address)
        
        # Get current pool state
        pool_state = await self.get_uniswap_v3_pool_state(pool_address)  # Same interface as V3
        
        pool_info = PoolInfo(
            pool_address=pool_address,
            chain_id=self.chain_config.chain_id,
            protocol=PoolProtocol.PANCAKESWAP_V3,
            token0=token0,
            token1=token1,
            fee_tier=fee_tier,
            factory_address=log["address"],
            creation_block=block_number,
            creation_tx_hash=log["transactionHash"],
            creation_timestamp=block_timestamp
        )
        
        # Add current state data if available
        if pool_state:
            pool_info.current_sqrt_price_x96 = pool_state.get("sqrt_price_x96")
            pool_info.current_tick = pool_state.get("current_tick")
            pool_info.current_liquidity = pool_state.get("liquidity")
            pool_info.tick_spacing = pool_state.get("tick_spacing")
            
            # Calculate prices from sqrt price
            if pool_state.get("sqrt_price_x96"):
                prices = self._calculate_prices_from_sqrt_price(
                    pool_state["sqrt_price_x96"], 
                    token0.decimals, 
                    token1.decimals
                )
                pool_info.current_price_token0 = prices["price_token0"]
                pool_info.current_price_token1 = prices["price_token1"]
        
        return pool_info
    
    async def _parse_balancer_v2_pool_created(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> PoolInfo:
        """Parse Balancer V2 pool created event."""
        # Balancer V2 PoolRegistered event structure:
        # event PoolRegistered(bytes32 indexed poolId, address indexed poolAddress, PoolSpecialization specialization)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract pool ID and address from topics
        pool_id = topics[1]
        pool_address = "0x" + topics[2][-40:]
        
        # For Balancer, we need to get tokens from the pool contract
        tokens = await self.get_balancer_pool_tokens(pool_address)
        
        if not tokens or len(tokens) < 2:
            logger.warning("Balancer pool has insufficient tokens", pool_address=pool_address)
            return None
        
        # For now, take first two tokens (Balancer can have more)
        token0 = tokens[0]
        token1 = tokens[1]
        
        pool_info = PoolInfo(
            pool_address=pool_address,
            chain_id=self.chain_config.chain_id,
            protocol=PoolProtocol.BALANCER_V2,
            token0=token0,
            token1=token1,
            factory_address=log["address"],
            creation_block=block_number,
            creation_tx_hash=log["transactionHash"],
            creation_timestamp=block_timestamp,
            metadata={
                "pool_id": pool_id,
                "all_tokens": [t.address for t in tokens],
                "pool_type": "weighted"  # Could be weighted, stable, etc.
            }
        )
        
        return pool_info
    
    async def _parse_curve_pool_created(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> PoolInfo:
        """Parse Curve pool created event."""
        # Curve PlainPoolDeployed event structure varies by factory
        # event PlainPoolDeployed(address[4] coins, uint256[4] A, uint256 fee, address deployer, address pool)
        
        topics = log["topics"]
        data = log["data"]
        
        # Curve event parsing is more complex due to array parameters
        # Extract pool address (usually the last parameter)
        pool_address = "0x" + data[-64:-24]
        
        # Get tokens from the pool contract
        tokens = await self.get_curve_pool_coins(pool_address)
        
        if not tokens or len(tokens) < 2:
            logger.warning("Curve pool has insufficient tokens", pool_address=pool_address)
            return None
        
        # Take first two tokens
        token0 = tokens[0]
        token1 = tokens[1]
        
        pool_info = PoolInfo(
            pool_address=pool_address,
            chain_id=self.chain_config.chain_id,
            protocol=PoolProtocol.CURVE,
            token0=token0,
            token1=token1,
            factory_address=log["address"],
            creation_block=block_number,
            creation_tx_hash=log["transactionHash"],
            creation_timestamp=block_timestamp,
            metadata={
                "all_tokens": [t.address for t in tokens],
                "pool_type": "stable",  # Curve specializes in stable swaps
                "amplification_coefficient": "unknown"  # Would need to query from contract
            }
        )
        
        return pool_info
    
    async def _parse_sushiswap_pool_created(
        self, 
        log: Dict[str, Any], 
        block_number: int, 
        block_timestamp: datetime
    ) -> PoolInfo:
        """Parse SushiSwap pool created event."""
        # SushiSwap PairCreated event structure:
        # event PairCreated(address indexed token0, address indexed token1, address pair, uint)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract tokens from topics
        token0_address = "0x" + topics[1][-40:]
        token1_address = "0x" + topics[2][-40:]
        
        # Extract pool address from data (first 32 bytes)
        pool_address = "0x" + data[26:66]
        
        # Get token information
        token0 = await self.get_token_info(token0_address)
        token1 = await self.get_token_info(token1_address)
        
        return PoolInfo(
            pool_address=pool_address,
            chain_id=self.chain_config.chain_id,
            protocol=PoolProtocol.SUSHISWAP,
            token0=token0,
            token1=token1,
            factory_address=log["address"],
            creation_block=block_number,
            creation_tx_hash=log["transactionHash"],
            creation_timestamp=block_timestamp
        )
    
    async def parse_swap_event(self, log: Dict[str, Any], pool_info: PoolInfo) -> Optional[SwapEvent]:
        """Parse swap event from log."""
        try:
            # Get block timestamp
            block_number = int(log["blockNumber"], 16)
            block_timestamp = await self.get_block_timestamp(block_number)
            
            # Parse based on protocol
            if pool_info.protocol == PoolProtocol.UNISWAP_V2:
                return self._parse_uniswap_v2_swap(log, pool_info, block_number, block_timestamp)
            elif pool_info.protocol == PoolProtocol.UNISWAP_V3:
                return self._parse_uniswap_v3_swap(log, pool_info, block_number, block_timestamp)
            elif pool_info.protocol == PoolProtocol.UNISWAP_V4:
                return self._parse_uniswap_v4_swap(log, pool_info, block_number, block_timestamp)
            elif pool_info.protocol == PoolProtocol.SUSHISWAP:
                return self._parse_sushiswap_swap(log, pool_info, block_number, block_timestamp)
            elif pool_info.protocol == PoolProtocol.SUSHISWAP_V3:
                return self._parse_sushiswap_v3_swap(log, pool_info, block_number, block_timestamp)
            elif pool_info.protocol == PoolProtocol.PANCAKESWAP_V2:
                return self._parse_pancakeswap_v2_swap(log, pool_info, block_number, block_timestamp)
            elif pool_info.protocol == PoolProtocol.PANCAKESWAP_V3:
                return self._parse_pancakeswap_v3_swap(log, pool_info, block_number, block_timestamp)
            elif pool_info.protocol == PoolProtocol.BALANCER_V2:
                return self._parse_balancer_v2_swap(log, pool_info, block_number, block_timestamp)
            elif pool_info.protocol == PoolProtocol.CURVE:
                return self._parse_curve_swap(log, pool_info, block_number, block_timestamp)
            else:
                logger.warning("Unknown protocol for swap event", protocol=pool_info.protocol)
                return None
                
        except Exception as e:
            logger.error("Failed to parse swap event", error=str(e))
            return None
    
    def _parse_uniswap_v2_swap(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> SwapEvent:
        """Parse Uniswap V2 swap event."""
        # Uniswap V2 Swap event structure:
        # event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract addresses from topics
        sender = "0x" + topics[1][-40:]
        recipient = "0x" + topics[2][-40:]
        
        # Parse amounts from data
        amount0_in = str(int(data[2:66], 16))
        amount1_in = str(int(data[66:130], 16))
        amount0_out = str(int(data[130:194], 16))
        amount1_out = str(int(data[194:258], 16))
        
        return SwapEvent(
            tx_hash=log["transactionHash"],
            log_index=int(log["logIndex"], 16),
            pool_address=pool_info.pool_address,
            chain_id=self.chain_config.chain_id,
            block_number=block_number,
            block_timestamp=block_timestamp,
            sender=sender,
            recipient=recipient,
            amount0_in=amount0_in,
            amount1_in=amount1_in,
            amount0_out=amount0_out,
            amount1_out=amount1_out
        )
    
    def _parse_uniswap_v3_swap(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> SwapEvent:
        """Parse Uniswap V3 swap event."""
        # Uniswap V3 Swap event structure:
        # event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract addresses from topics
        sender = "0x" + topics[1][-40:]
        recipient = "0x" + topics[2][-40:]
        
        # Parse amounts from data (each is 32 bytes)
        amount0 = int(data[2:66], 16)
        amount1 = int(data[66:130], 16)
        
        # Convert signed integers
        if amount0 >= 2**255:
            amount0 -= 2**256
        if amount1 >= 2**255:
            amount1 -= 2**256
        
        # Determine input/output amounts
        amount0_in = str(abs(amount0)) if amount0 < 0 else "0"
        amount0_out = str(amount0) if amount0 > 0 else "0"
        amount1_in = str(abs(amount1)) if amount1 < 0 else "0"
        amount1_out = str(amount1) if amount1 > 0 else "0"
        
        return SwapEvent(
            tx_hash=log["transactionHash"],
            log_index=int(log["logIndex"], 16),
            pool_address=pool_info.pool_address,
            chain_id=self.chain_config.chain_id,
            block_number=block_number,
            block_timestamp=block_timestamp,
            sender=sender,
            recipient=recipient,
            amount0_in=amount0_in,
            amount1_in=amount1_in,
            amount0_out=amount0_out,
            amount1_out=amount1_out
        )
    
    def _parse_sushiswap_swap(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> SwapEvent:
        """Parse SushiSwap swap event."""
        # SushiSwap Swap event structure:
        # event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract addresses from topics
        sender = "0x" + topics[1][-40:]
        recipient = "0x" + topics[2][-40:]
        
        # Parse amounts from data
        amount0_in = str(int(data[2:66], 16))
        amount1_in = str(int(data[66:130], 16))
        amount0_out = str(int(data[130:194], 16))
        amount1_out = str(int(data[194:258], 16))
        
        return SwapEvent(
            tx_hash=log["transactionHash"],
            log_index=int(log["logIndex"], 16),
            pool_address=pool_info.pool_address,
            chain_id=self.chain_config.chain_id,
            block_number=block_number,
            block_timestamp=block_timestamp,
            sender=sender,
            recipient=recipient,
            amount0_in=amount0_in,
            amount1_in=amount1_in,
            amount0_out=amount0_out,
            amount1_out=amount1_out
        )
    
    def _parse_uniswap_v4_swap(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> SwapEvent:
        """Parse Uniswap V4 swap event."""
        # Uniswap V4 Swap event structure (emitted by PoolManager):
        # event Swap(PoolId indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
        
        topics = log["topics"]
        data = log["data"]
        
        # V4 has pool ID in first topic and sender in second
        pool_id = topics[1]
        sender = "0x" + topics[2][-40:]
        
        # For V4, recipient is often the same as sender or derived from transaction
        recipient = sender  # Simplified - would need more complex logic in real implementation
        
        # Parse amounts from data (signed integers for V4)
        amount0 = int(data[2:66], 16)
        amount1 = int(data[66:130], 16)
        
        # Convert signed 128-bit integers
        if amount0 >= 2**127:
            amount0 -= 2**128
        if amount1 >= 2**127:
            amount1 -= 2**128
        
        # Determine input/output amounts
        amount0_in = str(abs(amount0)) if amount0 < 0 else "0"
        amount0_out = str(amount0) if amount0 > 0 else "0"
        amount1_in = str(abs(amount1)) if amount1 < 0 else "0"
        amount1_out = str(amount1) if amount1 > 0 else "0"
        
        return SwapEvent(
            tx_hash=log["transactionHash"],
            log_index=int(log["logIndex"], 16),
            pool_address=pool_info.pool_address,
            chain_id=self.chain_config.chain_id,
            block_number=block_number,
            block_timestamp=block_timestamp,
            sender=sender,
            recipient=recipient,
            amount0_in=amount0_in,
            amount1_in=amount1_in,
            amount0_out=amount0_out,
            amount1_out=amount1_out
        )
    
    def _parse_sushiswap_v3_swap(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> SwapEvent:
        """Parse SushiSwap V3 swap event."""
        # SushiSwap V3 follows Uniswap V3 pattern:
        # event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract addresses from topics
        sender = "0x" + topics[1][-40:]
        recipient = "0x" + topics[2][-40:]
        
        # Parse amounts from data (each is 32 bytes)
        amount0 = int(data[2:66], 16)
        amount1 = int(data[66:130], 16)
        
        # Convert signed integers
        if amount0 >= 2**255:
            amount0 -= 2**256
        if amount1 >= 2**255:
            amount1 -= 2**256
        
        # Determine input/output amounts
        amount0_in = str(abs(amount0)) if amount0 < 0 else "0"
        amount0_out = str(amount0) if amount0 > 0 else "0"
        amount1_in = str(abs(amount1)) if amount1 < 0 else "0"
        amount1_out = str(amount1) if amount1 > 0 else "0"
        
        return SwapEvent(
            tx_hash=log["transactionHash"],
            log_index=int(log["logIndex"], 16),
            pool_address=pool_info.pool_address,
            chain_id=self.chain_config.chain_id,
            block_number=block_number,
            block_timestamp=block_timestamp,
            sender=sender,
            recipient=recipient,
            amount0_in=amount0_in,
            amount1_in=amount1_in,
            amount0_out=amount0_out,
            amount1_out=amount1_out
        )
    
    def _parse_pancakeswap_v2_swap(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> SwapEvent:
        """Parse PancakeSwap V2 swap event."""
        # PancakeSwap V2 follows Uniswap V2 pattern:
        # event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract addresses from topics
        sender = "0x" + topics[1][-40:]
        recipient = "0x" + topics[2][-40:]
        
        # Parse amounts from data
        amount0_in = str(int(data[2:66], 16))
        amount1_in = str(int(data[66:130], 16))
        amount0_out = str(int(data[130:194], 16))
        amount1_out = str(int(data[194:258], 16))
        
        return SwapEvent(
            tx_hash=log["transactionHash"],
            log_index=int(log["logIndex"], 16),
            pool_address=pool_info.pool_address,
            chain_id=self.chain_config.chain_id,
            block_number=block_number,
            block_timestamp=block_timestamp,
            sender=sender,
            recipient=recipient,
            amount0_in=amount0_in,
            amount1_in=amount1_in,
            amount0_out=amount0_out,
            amount1_out=amount1_out
        )
    
    def _parse_pancakeswap_v3_swap(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> SwapEvent:
        """Parse PancakeSwap V3 swap event."""
        # PancakeSwap V3 follows Uniswap V3 pattern:
        # event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract addresses from topics
        sender = "0x" + topics[1][-40:]
        recipient = "0x" + topics[2][-40:]
        
        # Parse amounts from data (each is 32 bytes)
        amount0 = int(data[2:66], 16)
        amount1 = int(data[66:130], 16)
        
        # Convert signed integers
        if amount0 >= 2**255:
            amount0 -= 2**256
        if amount1 >= 2**255:
            amount1 -= 2**256
        
        # Determine input/output amounts
        amount0_in = str(abs(amount0)) if amount0 < 0 else "0"
        amount0_out = str(amount0) if amount0 > 0 else "0"
        amount1_in = str(abs(amount1)) if amount1 < 0 else "0"
        amount1_out = str(amount1) if amount1 > 0 else "0"
        
        return SwapEvent(
            tx_hash=log["transactionHash"],
            log_index=int(log["logIndex"], 16),
            pool_address=pool_info.pool_address,
            chain_id=self.chain_config.chain_id,
            block_number=block_number,
            block_timestamp=block_timestamp,
            sender=sender,
            recipient=recipient,
            amount0_in=amount0_in,
            amount1_in=amount1_in,
            amount0_out=amount0_out,
            amount1_out=amount1_out
        )
    
    def _parse_balancer_v2_swap(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> SwapEvent:
        """Parse Balancer V2 swap event."""
        # Balancer V2 Swap event structure:
        # event Swap(bytes32 indexed poolId, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract pool ID and tokens from topics
        pool_id = topics[1]
        token_in = "0x" + topics[2][-40:]
        token_out = "0x" + topics[3][-40:]
        
        # Parse amounts from data
        amount_in = str(int(data[2:66], 16))
        amount_out = str(int(data[66:130], 16))
        
        # For Balancer, we need to map to token0/token1 based on pool configuration
        # This is simplified - real implementation would need proper token mapping
        if token_in.lower() == pool_info.token0.address.lower():
            amount0_in = amount_in
            amount0_out = "0"
            amount1_in = "0"
            amount1_out = amount_out
        else:
            amount0_in = "0"
            amount0_out = amount_out
            amount1_in = amount_in
            amount1_out = "0"
        
        # Extract sender from transaction (Balancer doesn't include in event)
        sender = "0x" + "0" * 40  # Would need to get from transaction details
        recipient = sender  # Simplified
        
        return SwapEvent(
            tx_hash=log["transactionHash"],
            log_index=int(log["logIndex"], 16),
            pool_address=pool_info.pool_address,
            chain_id=self.chain_config.chain_id,
            block_number=block_number,
            block_timestamp=block_timestamp,
            sender=sender,
            recipient=recipient,
            amount0_in=amount0_in,
            amount1_in=amount1_in,
            amount0_out=amount0_out,
            amount1_out=amount1_out
        )
    
    def _parse_curve_swap(
        self, 
        log: Dict[str, Any], 
        pool_info: PoolInfo, 
        block_number: int, 
        block_timestamp: datetime
    ) -> SwapEvent:
        """Parse Curve swap event."""
        # Curve TokenExchange event structure:
        # event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)
        
        topics = log["topics"]
        data = log["data"]
        
        # Extract buyer from topics
        buyer = "0x" + topics[1][-40:]
        sender = buyer
        recipient = buyer  # In Curve, sender and recipient are usually the same
        
        # Parse token indices and amounts from data
        sold_id = int(data[2:66], 16)
        tokens_sold = str(int(data[66:130], 16))
        bought_id = int(data[130:194], 16)
        tokens_bought = str(int(data[194:258], 16))
        
        # Map to token0/token1 based on indices
        # This is simplified - real implementation would need proper token mapping
        if sold_id == 0:  # Selling token0
            amount0_in = tokens_sold
            amount0_out = "0"
            amount1_in = "0"
            amount1_out = tokens_bought
        else:  # Selling token1
            amount0_in = "0"
            amount0_out = tokens_bought
            amount1_in = tokens_sold
            amount1_out = "0"
        
        return SwapEvent(
            tx_hash=log["transactionHash"],
            log_index=int(log["logIndex"], 16),
            pool_address=pool_info.pool_address,
            chain_id=self.chain_config.chain_id,
            block_number=block_number,
            block_timestamp=block_timestamp,
            sender=sender,
            recipient=recipient,
            amount0_in=amount0_in,
            amount1_in=amount1_in,
            amount0_out=amount0_out,
            amount1_out=amount1_out
        )
    
    async def create_price_calculation_from_swap(
        self, 
        swap_event: SwapEvent, 
        pool_info: PoolInfo,
        sqrt_price_x96_after: Optional[str] = None
    ) -> PriceCalculation:
        """Create price calculation from swap event."""
        try:
            # Calculate the effective price from the swap
            price = self._calculate_swap_price(swap_event, pool_info)
            
            # Calculate net amounts (positive for inflow, negative for outflow)
            amount0_net = self._calculate_net_amount(swap_event.amount0_in, swap_event.amount0_out)
            amount1_net = self._calculate_net_amount(swap_event.amount1_in, swap_event.amount1_out)
            
            # Get pool state after swap if available
            price_before = None
            price_after = None
            
            if sqrt_price_x96_after:
                prices = self._calculate_prices_from_sqrt_price(
                    sqrt_price_x96_after,
                    pool_info.token0.decimals,
                    pool_info.token1.decimals
                )
                price_after = float(prices["price_token0"])
            
            # Calculate price impact if we have before/after prices
            price_impact = None
            if price_before and price_after and price_before != 0:
                price_impact = abs((price_after - price_before) / price_before) * 100
            
            return PriceCalculation(
                pool_address=pool_info.pool_address,
                chain_id=self.chain_config.chain_id,
                tx_hash=swap_event.tx_hash,
                block_number=swap_event.block_number,
                timestamp=int(swap_event.block_timestamp.timestamp()),
                price=price,
                amount0=amount0_net,
                amount1=amount1_net,
                token0=pool_info.token0.address,
                token1=pool_info.token1.address,
                price_impact=price_impact,
                price_before=price_before,
                price_after=price_after,
                protocol=pool_info.protocol,
                fee_tier=pool_info.fee_tier,
                calculation_method="swap"
            )
            
        except Exception as e:
            logger.error("Failed to create price calculation from swap", 
                        tx_hash=swap_event.tx_hash, error=str(e))
            raise
    
    def _calculate_swap_price(self, swap_event: SwapEvent, pool_info: PoolInfo) -> float:
        """Calculate effective price from swap amounts."""
        try:
            # Convert string amounts to float for calculation
            amount0_in = float(swap_event.amount0_in) if swap_event.amount0_in != "0" else 0
            amount0_out = float(swap_event.amount0_out) if swap_event.amount0_out != "0" else 0
            amount1_in = float(swap_event.amount1_in) if swap_event.amount1_in != "0" else 0
            amount1_out = float(swap_event.amount1_out) if swap_event.amount1_out != "0" else 0
            
            # Determine which token is being traded for which
            if amount0_in > 0 and amount1_out > 0:
                # Trading token0 for token1
                # Adjust for decimals
                adjusted_amount0 = amount0_in / (10 ** pool_info.token0.decimals)
                adjusted_amount1 = amount1_out / (10 ** pool_info.token1.decimals)
                price = adjusted_amount1 / adjusted_amount0 if adjusted_amount0 != 0 else 0
            elif amount1_in > 0 and amount0_out > 0:
                # Trading token1 for token0
                # Adjust for decimals
                adjusted_amount0 = amount0_out / (10 ** pool_info.token0.decimals)
                adjusted_amount1 = amount1_in / (10 ** pool_info.token1.decimals)
                price = adjusted_amount1 / adjusted_amount0 if adjusted_amount0 != 0 else 0
            else:
                # Fallback: use the ratio of total amounts
                total_amount0 = amount0_in + amount0_out
                total_amount1 = amount1_in + amount1_out
                if total_amount0 != 0:
                    adjusted_amount0 = total_amount0 / (10 ** pool_info.token0.decimals)
                    adjusted_amount1 = total_amount1 / (10 ** pool_info.token1.decimals)
                    price = adjusted_amount1 / adjusted_amount0
                else:
                    price = 0
            
            return price
            
        except Exception as e:
            logger.error("Failed to calculate swap price", error=str(e))
            return 0.0
    
    def _calculate_net_amount(self, amount_in: str, amount_out: str) -> str:
        """Calculate net amount (positive for inflow, negative for outflow)."""
        try:
            in_amount = float(amount_in) if amount_in != "0" else 0
            out_amount = float(amount_out) if amount_out != "0" else 0
            
            # Net flow: positive if more coming in, negative if more going out
            net = in_amount - out_amount
            return str(net)
            
        except Exception:
            return "0"
    
    async def get_uniswap_v2_pool_state(self, pool_address: str) -> Optional[Dict[str, Any]]:
        """Get Uniswap V2 pool state (reserves)."""
        try:
            # Uniswap V2 Pool function signatures
            reserves_sig = "0x0902f1ac"  # getReserves()
            
            # Make call to get reserves
            reserves_result = await self._make_rpc_call("eth_call", [
                {"to": pool_address, "data": reserves_sig}, "latest"
            ])
            
            if reserves_result == "0x":
                return None
            
            # Parse reserves result
            # getReserves() returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)
            data = reserves_result[2:]  # Remove 0x prefix
            
            reserve0 = str(int(data[0:64], 16))
            reserve1 = str(int(data[64:128], 16))
            last_update = int(data[128:192], 16)
            
            return {
                "reserve0": reserve0,
                "reserve1": reserve1,
                "last_update_timestamp": last_update
            }
            
        except Exception as e:
            logger.error("Failed to get V2 pool state", pool_address=pool_address, error=str(e))
            return None
    
    def _calculate_prices_from_reserves(
        self, 
        reserve0: str, 
        reserve1: str, 
        token0_decimals: int, 
        token1_decimals: int
    ) -> Dict[str, str]:
        """Calculate token prices from V2-style reserves."""
        try:
            # Convert reserves to float
            res0 = float(reserve0)
            res1 = float(reserve1)
            
            if res0 == 0 or res1 == 0:
                return {"price_token0": "0", "price_token1": "0"}
            
            # Adjust for token decimals
            adjusted_reserve0 = res0 / (10 ** token0_decimals)
            adjusted_reserve1 = res1 / (10 ** token1_decimals)
            
            # Calculate prices: price = other_reserve / this_reserve
            price_token0_in_token1 = str(adjusted_reserve1 / adjusted_reserve0)
            price_token1_in_token0 = str(adjusted_reserve0 / adjusted_reserve1)
            
            return {
                "price_token0": price_token0_in_token1,
                "price_token1": price_token1_in_token0
            }
            
        except Exception as e:
            logger.error("Failed to calculate prices from reserves", error=str(e))
            return {"price_token0": "0", "price_token1": "0"}
    
    async def get_balancer_pool_tokens(self, pool_address: str) -> Optional[List[TokenInfo]]:
        """Get tokens from a Balancer pool."""
        try:
            # Balancer V2 Pool function signatures
            vault_sig = "0x8d928af8"  # getVault()
            pool_id_sig = "0x38fff2d0"  # getPoolId()
            
            # First get the vault address
            vault_result = await self._make_rpc_call("eth_call", [
                {"to": pool_address, "data": vault_sig}, "latest"
            ])
            
            if vault_result == "0x":
                return None
            
            vault_address = "0x" + vault_result[-40:]
            
            # Get pool ID
            pool_id_result = await self._make_rpc_call("eth_call", [
                {"to": pool_address, "data": pool_id_sig}, "latest"
            ])
            
            if pool_id_result == "0x":
                return None
            
            pool_id = pool_id_result
            
            # Query vault for pool tokens using getPoolTokens(bytes32 poolId)
            get_pool_tokens_sig = "0xf94d4668"  # getPoolTokens(bytes32)
            tokens_result = await self._make_rpc_call("eth_call", [
                {"to": vault_address, "data": get_pool_tokens_sig + pool_id[2:]}, "latest"
            ])
            
            if tokens_result == "0x":
                return None
            
            # Parse token addresses from result
            # This is a simplified parsing - real implementation would need proper ABI decoding
            tokens = []
            data = tokens_result[2:]
            
            # Extract token addresses (this is simplified)
            # Real implementation would properly decode the array
            for i in range(0, len(data), 64):
                if i + 64 <= len(data):
                    token_address = "0x" + data[i+24:i+64]
                    if token_address != "0x" + "0" * 40:  # Skip zero address
                        token_info = await self.get_token_info(token_address)
                        tokens.append(token_info)
                        
                        if len(tokens) >= 8:  # Limit to reasonable number
                            break
            
            return tokens if tokens else None
            
        except Exception as e:
            logger.error("Failed to get Balancer pool tokens", pool_address=pool_address, error=str(e))
            return None
    
    async def get_curve_pool_coins(self, pool_address: str) -> Optional[List[TokenInfo]]:
        """Get coins from a Curve pool."""
        try:
            # Curve pool function signatures
            coins_sig = "0xc6610657"  # coins(uint256)
            
            tokens = []
            
            # Try to get up to 8 coins (Curve pools can have many)
            for i in range(8):
                try:
                    # Call coins(i) to get token at index i
                    coin_call_data = coins_sig + hex(i)[2:].zfill(64)
                    coin_result = await self._make_rpc_call("eth_call", [
                        {"to": pool_address, "data": coin_call_data}, "latest"
                    ])
                    
                    if coin_result == "0x" or coin_result == "0x" + "0" * 64:
                        break  # No more coins
                    
                    coin_address = "0x" + coin_result[-40:]
                    
                    if coin_address != "0x" + "0" * 40:  # Skip zero address
                        token_info = await self.get_token_info(coin_address)
                        tokens.append(token_info)
                    else:
                        break
                        
                except Exception:
                    break  # Stop if we can't get more coins
            
            return tokens if len(tokens) >= 2 else None
            
        except Exception as e:
            logger.error("Failed to get Curve pool coins", pool_address=pool_address, error=str(e))
            return None