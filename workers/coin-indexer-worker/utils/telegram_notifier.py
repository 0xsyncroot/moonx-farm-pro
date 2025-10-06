"""Telegram notification service for token events."""

from typing import Optional, Dict, Any, List, Tuple
import structlog
import asyncio
import aiohttp
import json
from datetime import datetime
from web3 import Web3

from .ens_resolver import ENSResolver
from .block_explorer import BlockExplorerURLs

logger = structlog.get_logger(__name__)


class TelegramNotifier:
    """Telegram notification service for publishing token events."""
    
    def __init__(self, bot_token: str, chat_ids: List[str], 
                 ens_resolver: Optional[ENSResolver] = None,
                 block_explorer: Optional[BlockExplorerURLs] = None,
                 retake_chat_ids: Optional[List[str]] = None):
        """Initialize Telegram notifier with bot token and list of chat IDs."""
        self.bot_token = bot_token
        
        # Validate bot token format
        if not self._validate_bot_token(bot_token):
            logger.warning("Bot token format may be invalid", 
                          token_format="Expected: <bot_id>:<token>",
                          token_example="123456789:ABCdefGHIjklMNOpqrsTUVwxyz",
                          received_token_format=f"Received: {bot_token[:20]}..." if bot_token else "None")
        else:
            # Extract bot ID for logging
            bot_id = bot_token.split(':')[0] if ':' in bot_token else 'unknown'
            logger.info("Bot token format is valid", bot_id=bot_id)
        
        # Debug log received chat_ids
        logger.debug("TelegramNotifier received chat_ids", 
                    chat_ids=chat_ids, 
                    chat_ids_type=type(chat_ids))
        
        # Ensure chat_ids is a list and contains only strings
        if isinstance(chat_ids, list):
            self.chat_ids = [str(chat_id) for chat_id in chat_ids]
        else:
            self.chat_ids = [str(chat_ids)]
            
        logger.debug("TelegramNotifier processed chat_ids", 
                    final_chat_ids=self.chat_ids)
        
        # Setup retake chat IDs (separate channel for Retake tokens)
        if retake_chat_ids:
            if isinstance(retake_chat_ids, list):
                self.retake_chat_ids = [str(chat_id) for chat_id in retake_chat_ids]
            else:
                self.retake_chat_ids = [str(retake_chat_ids)]
        else:
            self.retake_chat_ids = []
            
        logger.debug("TelegramNotifier processed retake_chat_ids", 
                    retake_chat_ids=self.retake_chat_ids)
        
        self.base_url = f"https://api.telegram.org/bot{bot_token}"
        self.session: Optional[aiohttp.ClientSession] = None
        self.is_connected = False
        
        # ENS resolution and block explorer utilities
        self.ens_resolver = ens_resolver
        self.block_explorer = block_explorer or BlockExplorerURLs()
    
    async def connect(self) -> None:
        """Connect to Telegram API with timeout and graceful error handling."""
        try:
            # Create session with timeout
            timeout = aiohttp.ClientTimeout(total=10.0)  # 10 second timeout
            self.session = aiohttp.ClientSession(timeout=timeout)
            
            # Build and log the full API URL for debugging
            api_url = f"{self.base_url}/getMe"
            logger.info("Attempting to connect to Telegram Bot API", 
                       base_url=self.base_url,
                       full_api_url=api_url,
                       chat_count=len(self.chat_ids))
            
            # Test connection by getting bot info
            async with self.session.get(api_url) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("ok"):
                        bot_info = data.get("result", {})
                        self.is_connected = True
                        logger.info("Successfully connected to Telegram Bot API", 
                                   bot_username=bot_info.get("username"),
                                   bot_name=bot_info.get("first_name"),
                                   bot_id=bot_info.get("id"))
                        return
                    else:
                        logger.error("Telegram API returned error", 
                                   error=data.get('description', 'Unknown error'))
                else:
                    # Try to get response text for debugging
                    try:
                        response_text = await response.text()
                        logger.error("Telegram API HTTP error", 
                                   status=response.status,
                                   url=api_url,
                                   response_text=response_text[:500])  # First 500 chars
                    except Exception:
                        logger.error("Telegram API HTTP error", 
                                   status=response.status,
                                   url=api_url)
            
        except asyncio.TimeoutError:
            logger.error("Telegram API connection timeout", 
                        url=f"{self.base_url}/getMe",
                        timeout_seconds=10)
        except aiohttp.ClientError as e:
            logger.error("Telegram API client error", 
                        error=str(e),
                        error_type=type(e).__name__)
        except Exception as e:
            logger.error("Unexpected error connecting to Telegram API", 
                        error=str(e),
                        error_type=type(e).__name__)
        
        # Cleanup session on failure
        if self.session:
            await self.session.close()
            self.session = None
            
        self.is_connected = False
        logger.warning("Telegram notifications will be disabled due to connection failure")
        
        # Provide manual testing suggestion
        api_url = f"{self.base_url}/getMe"
        logger.info("To test the bot token manually, try this curl command:",
                   curl_command=f'curl -X GET "{api_url}"')
    
    def _validate_bot_token(self, token: str) -> bool:
        """Validate Telegram bot token format."""
        if not token or not isinstance(token, str):
            return False
        
        # Bot token format: <bot_id>:<token>
        # Example: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
        parts = token.split(':')
        if len(parts) != 2:
            return False
        
        bot_id, token_part = parts
        
        # Bot ID should be numeric
        if not bot_id.isdigit():
            return False
        
        # Token part should be at least 35 characters (typical length)
        if len(token_part) < 35:
            return False
        
        return True
    
    async def disconnect(self) -> None:
        """Disconnect from Telegram API."""
        if self.session:
            await self.session.close()
            self.session = None
        self.is_connected = False
        logger.info("Disconnected from Telegram API")
    
    async def send_message(self, message: str, parse_mode: str = "HTML") -> Dict[str, bool]:
        """
        Send a message to all configured Telegram chats.
        
        Args:
            message: Message text to send
            parse_mode: Parse mode (HTML, Markdown, or None)
        
        Returns:
            Dict mapping chat_id to success status
        """
        if not self.is_connected or not self.session:
            logger.warning("Telegram notifier not connected, cannot send message")
            return {chat_id: False for chat_id in self.chat_ids}
        
        results = {}
        
        # Send message to all chat IDs concurrently
        tasks = []
        for chat_id in self.chat_ids:
            task = self._send_message_to_chat(message, chat_id, parse_mode)
            tasks.append(task)
        
        # Wait for all sends to complete
        send_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for i, result in enumerate(send_results):
            chat_id = self.chat_ids[i]
            if isinstance(result, Exception):
                logger.error("Exception sending message to chat", 
                           chat_id=chat_id, error=str(result))
                results[chat_id] = False
            else:
                results[chat_id] = result
        
        successful_sends = sum(1 for success in results.values() if success)
        logger.info("Telegram message send results",
                   total_chats=len(self.chat_ids),
                   successful_sends=successful_sends,
                   failed_sends=len(self.chat_ids) - successful_sends)
        
        return results
    
    async def send_message_to_chats(self, message: str, target_chat_ids: List[str], parse_mode: str = "HTML") -> Dict[str, bool]:
        """
        Send a message to specific list of Telegram chats.
        
        Args:
            message: Message text to send
            target_chat_ids: List of target chat IDs  
            parse_mode: Parse mode (HTML, Markdown, or None)
        
        Returns:
            Dict mapping chat_id to success status
        """
        if not self.is_connected or not self.session:
            logger.warning("Telegram notifier not connected, cannot send message")
            return {chat_id: False for chat_id in target_chat_ids}
        
        if not target_chat_ids:
            logger.warning("No target chat IDs provided")
            return {}
        
        results = {}
        
        # Send message to all target chat IDs concurrently
        tasks = []
        for chat_id in target_chat_ids:
            task = self._send_message_to_chat(message, chat_id, parse_mode)
            tasks.append(task)
        
        # Wait for all sends to complete
        send_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for i, result in enumerate(send_results):
            chat_id = target_chat_ids[i]
            if isinstance(result, Exception):
                logger.error("Exception sending message to chat", 
                           chat_id=chat_id, error=str(result))
                results[chat_id] = False
            else:
                results[chat_id] = result
        
        successful_sends = sum(1 for success in results.values() if success)
        logger.info("Telegram message send results to specific chats",
                   total_chats=len(target_chat_ids),
                   successful_sends=successful_sends,
                   failed_sends=len(target_chat_ids) - successful_sends)
        
        return results
    
    async def _send_message_to_chat(self, message: str, chat_id: str, parse_mode: str = "HTML") -> bool:
        """
        Send a message to a specific chat.
        
        Args:
            message: Message text to send
            chat_id: Target chat ID
            parse_mode: Parse mode (HTML, Markdown, or None)
        
        Returns:
            True if successful, False otherwise
        """
        try:
            payload = {
                "chat_id": chat_id,
                "text": message,
                "parse_mode": parse_mode,
                "disable_web_page_preview": True
            }
            
            async with self.session.post(
                f"{self.base_url}/sendMessage",
                data=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    if data.get("ok"):
                        logger.debug("Successfully sent Telegram message", 
                                   chat_id=chat_id)
                        return True
                    else:
                        logger.error("Telegram API error", 
                                   chat_id=chat_id,
                                   error=data.get("description", "Unknown error"))
                        return False
                else:
                    logger.error("HTTP error sending Telegram message", 
                               chat_id=chat_id,
                               status=response.status)
                    return False
                    
        except asyncio.TimeoutError:
            logger.error("Timeout sending Telegram message", chat_id=chat_id)
            return False
        except Exception as e:
            logger.error("Error sending Telegram message", chat_id=chat_id, error=str(e))
            return False
    
    async def notify_token_created(self, token_info: Dict[str, Any], chain_name: str) -> bool:
        """
        Send notification for a newly created token.
        
        Args:
            token_info: Token information dictionary
            chain_name: Name of the blockchain network
        
        Returns:
            True if at least one chat received the message successfully
        """
        try:
            # Extract basic token information
            name = token_info.get("name", "Unknown")
            symbol = token_info.get("symbol", "Unknown")
            token_address = token_info.get("token_address", "Unknown")
            creator_address = token_info.get("creator", "Unknown")
            source = token_info.get("source", "Unknown")
            block_number = token_info.get("block_number", "Unknown")
            chain_id = token_info.get("chain_id", 1)
            creation_tx_hash = token_info.get("creation_tx_hash", "")
            creation_timestamp = token_info.get("creation_timestamp")
            
            # Get enhanced display information
            source_display = self._get_source_display_name(source)
            creator_display = await self._get_creator_display_name(creator_address, chain_id)
            token_link = self._get_token_link(token_address, chain_id)
            zora_profile_link = self._get_zora_profile_link(name, source)
            tx_link = self._get_tx_link(creation_tx_hash, chain_id)
            relative_time = self._get_relative_time(creation_timestamp)
            
            # For Zora tokens, don't send notification if profile link cannot be built
            if source_display == "Zora" and not zora_profile_link:
                logger.info("Skipping Zora token notification - cannot build profile link", 
                           token_name=name,
                           token_address=token_address,
                           reason="Name contains spaces or invalid characters")
                return False
            
            # For Zora tokens with valid profile link, fetch enhanced profile data
            profile_data = None
            follow_data = None
            if source_display == "Zora" and zora_profile_link:
                # Extract profile ID from URL
                profile_id = zora_profile_link.split('@')[1]
                logger.debug("Fetching Zora profile data", profile_id=profile_id)
                
                profile_data, follow_data = await self._fetch_zora_profile_data(profile_id)
                
                logger.debug("Zora API call results",
                           profile_id=profile_id,
                           profile_data_available=bool(profile_data),
                           follow_data_available=bool(follow_data),
                           profile_data_keys=list(profile_data.keys()) if profile_data else None)
                
                # If API call failed, don't send notification
                if not profile_data:
                    logger.info("Skipping Zora token notification - failed to fetch profile data",
                               token_name=name,
                               token_address=token_address,
                               profile_id=profile_id)
                    return False
                
                # Check followers count - only notify if followers > 10
                followers_count = 0
                if follow_data and isinstance(follow_data, dict):
                    followed_edges = follow_data.get("followedEdges") or {}
                    if isinstance(followed_edges, dict):
                        followers_count = followed_edges.get("count", 0)
                
                if followers_count <= 10:
                    logger.info("Skipping Zora token notification - insufficient followers",
                               token_name=name,
                               token_address=token_address,
                               profile_id=profile_id,
                               followers_count=followers_count,
                               minimum_required=11)
                    return False
                
                logger.debug("Zora token passed followers check",
                           profile_id=profile_id,
                           followers_count=followers_count)
            
            # Build enhanced message for Zora tokens with profile data (follow_data is optional)
            if source_display == "Zora" and profile_data:
                # Use empty dict for follow_data if not available
                follow_data_safe = follow_data or {}
                message = await self._build_enhanced_zora_message(
                    name, symbol, token_address, creator_display, chain_name, 
                    block_number, zora_profile_link, profile_data, follow_data_safe, tx_link, relative_time
                )
            else:
                # Regular message format
                message = f"""🎨 <b>New Token:</b> {name} ({symbol})
├── <b>CA:</b> <code>{token_address}</code>
├── <b>Creator:</b> {creator_display}"""

                # Add Zora profile link if available (for non-enhanced cases)
                if zora_profile_link:
                    clean_name = zora_profile_link.split('@')[1]
                    message += f"\n└── <b>Profile:</b> <a href=\"{zora_profile_link}\">@{clean_name}</a>"
                else:
                    message = message.replace("├── <b>Creator:", "└── <b>Creator:")

                message += f"""

<b>Network:</b> {chain_name} • {source_display} • Block #{block_number}
<b>Created:</b> {tx_link} • {datetime.utcnow().strftime('%d-%m-%Y %H:%M UTC')} {relative_time}"""
            
            # Check metadata_uri for notification decision
            metadata_uri_field = token_info.get("metadata_uri", "")
            image_url_field = token_info.get("image_url", "") 
            metadata_uri = metadata_uri_field or image_url_field
            
            logger.debug("Checking for token metadata URI",
                       token_address=token_address,
                       metadata_uri_field=metadata_uri_field,
                       image_url_field=image_url_field,
                       final_metadata_uri=metadata_uri,
                       source=source)
            
            # Skip notification if no metadata_uri found
            if not metadata_uri or not (metadata_uri.startswith("ipfs://") or metadata_uri.startswith("https://")):
                logger.info("Skipping token notification - no valid metadata_uri found",
                           token_address=token_address,
                           metadata_uri=metadata_uri,
                           source=source)
                return False
            
            # Send text message (has valid metadata_uri)
            logger.debug("Valid metadata_uri found, sending text notification",
                       token_address=token_address,
                       metadata_uri=metadata_uri)
            results = await self.send_message(message)
            return any(results.values())
            
        except Exception as e:
            logger.error("Error formatting token notification", 
                        token_address=token_info.get("token_address"),
                        error=str(e))
            return False
    
    async def notify_clanker_token_created(self, token_info: Dict[str, Any], chain_name: str) -> bool:
        """
        Send notification for a newly created Clanker token.
        
        Args:
            token_info: Clanker token information dictionary
            chain_name: Name of the blockchain network
        
        Returns:
            True if at least one chat received the message successfully
        """
        try:
            # Extract basic token information
            name = token_info.get("name", "Unknown")
            symbol = token_info.get("symbol", "Unknown") 
            token_address = token_info.get("token_address", "Unknown")
            creator_address = token_info.get("creator", "Unknown")
            admin_address = token_info.get("token_admin", "Unknown")
            block_number = token_info.get("block_number", "Unknown")
            chain_id = token_info.get("chain_id", 1)
            creation_tx_hash = token_info.get("creation_tx_hash", "")
            creation_timestamp = token_info.get("creation_timestamp")
            
            # Get enhanced display information
            creator_display = await self._get_creator_display_name(creator_address, chain_id)
            admin_display = await self._get_creator_display_name(admin_address, chain_id)
            token_link = self._get_token_link(token_address, chain_id)
            tx_link = self._get_tx_link(creation_tx_hash, chain_id)
            relative_time = self._get_relative_time(creation_timestamp)
            
            # Check for Retake platform
            retake_info = self._extract_retake_info(token_info)
            is_retake_token = retake_info is not None
            
            # Get additional metadata
            additional_metadata = self._extract_additional_metadata(token_info)
            
            # Legacy metadata field for backward compatibility
            token_metadata = token_info.get("token_metadata", "")
            if token_metadata and len(token_metadata.strip()) > 0:
                if not additional_metadata:
                    additional_metadata = token_metadata[:150] + ("..." if len(token_metadata) > 150 else "")
            
            # Create formatted message
            if is_retake_token:
                retake_url = retake_info.get("url", "")
                message = f"""🎬 <b>New Token:</b> {name} ({symbol})
├── <b>CA:</b> <code>{token_address}</code>
├── <b>Creator:</b> {creator_display}
├── <b>Admin:</b> {admin_display}
└── <b>Stream:</b> <a href=\"{retake_url}\">Watch Live</a>"""
            else:
                message = f"""🚀 <b>New Token:</b> {name} ({symbol})
├── <b>CA:</b> <code>{token_address}</code>
├── <b>Creator:</b> {creator_display}
└── <b>Admin:</b> {admin_display}"""

            # Add description if available (keep readable)
            if additional_metadata:
                short_desc = additional_metadata[:120] + "..." if len(additional_metadata) > 120 else additional_metadata
                # Adjust tree structure if we have description
                if is_retake_token:
                    message = message.replace("└── <b>Stream:", "├── <b>Stream:")
                    message += f"\n└── <b>Description:</b> {short_desc}"
                else:
                    message = message.replace("└── <b>Admin:", "├── <b>Admin:")
                    message += f"\n└── <b>Description:</b> {short_desc}"

            message += f"""

<b>Network:</b> {chain_name} • Clanker{" (Retake)" if is_retake_token else ""} • Block #{block_number}
<b>Created:</b> {tx_link} • {datetime.utcnow().strftime('%d-%m-%Y %H:%M UTC')} {relative_time}"""
            
            # Check metadata_uri for notification decision
            metadata_uri_field = token_info.get("metadata_uri", "")
            image_url_field = token_info.get("image_url", "") 
            metadata_uri = metadata_uri_field or image_url_field
            
            logger.debug("Checking for metadata URI in token_info",
                       token_address=token_address,
                       metadata_uri_field=metadata_uri_field,
                       image_url_field=image_url_field,
                       final_metadata_uri=metadata_uri,
                       available_fields=list(token_info.keys()))
            
            # Skip notification if no metadata_uri found
            if not metadata_uri or not (metadata_uri.startswith("ipfs://") or metadata_uri.startswith("https://")):
                logger.info("Skipping Clanker token notification - no valid metadata_uri found",
                           token_address=token_address,
                           metadata_uri=metadata_uri,
                           is_retake_token=is_retake_token)
                return False
            
            # Send text message (has valid metadata_uri)
            logger.debug("Valid metadata_uri found, sending Clanker text notification",
                       token_address=token_address,
                       metadata_uri=metadata_uri)
            results = await self.send_message(message)
            regular_success = any(results.values())
            
            # Send special Retake notification if applicable
            retake_success = False
            if is_retake_token:
                retake_success = await self.notify_retake_token_created(token_info, chain_name, retake_info)
            
            logger.info("Clanker token notification results",
                       token_address=token_address,
                       is_retake_token=is_retake_token,
                       notification_success=regular_success,
                       retake_notification_success=retake_success,
                       metadata_uri=metadata_uri)
            
            return regular_success or retake_success  # Return True if at least one send was successful
            
        except Exception as e:
            logger.error("Error formatting Clanker token notification", 
                        token_address=token_info.get("token_address"),
                        error=str(e))
            return False
    
    async def notify_retake_token_created(self, token_info: Dict[str, Any], chain_name: str, retake_info: Dict[str, Any]) -> bool:
        """
        Send notification for a newly created Retake token.
        
        Args:
            token_info: Token information dictionary
            chain_name: Name of the blockchain network
            retake_info: Retake platform information
        
        Returns:
            True if at least one chat received the message successfully
        """
        if not self.retake_chat_ids:
            logger.debug("No Retake chat IDs configured, skipping Retake notification")
            return False
        
        try:
            # Extract basic token information
            name = token_info.get("name", "Unknown")
            symbol = token_info.get("symbol", "Unknown") 
            token_address = token_info.get("token_address", "Unknown")
            creator_address = token_info.get("creator", "Unknown")
            admin_address = token_info.get("token_admin", "Unknown")
            block_number = token_info.get("block_number", "Unknown")
            chain_id = token_info.get("chain_id", 1)
            creation_tx_hash = token_info.get("creation_tx_hash", "")
            creation_timestamp = token_info.get("creation_timestamp")
            
            # Get enhanced display information
            creator_display = await self._get_creator_display_name(creator_address, chain_id)
            admin_display = await self._get_creator_display_name(admin_address, chain_id)
            tx_link = self._get_tx_link(creation_tx_hash, chain_id)
            relative_time = self._get_relative_time(creation_timestamp)
            
            # Extract Retake information
            retake_url = retake_info.get("url", "")
            description = retake_info.get("description", "")
            
            # Build social links with enhanced Farcaster support
            social_sections = []
            farcaster_data = None
            
            # First pass: check for Farcaster and fetch data
            for social_entry in retake_info.get("all_social_urls", []):
                if isinstance(social_entry, dict):
                    platform = social_entry.get("platform", "").strip()
                    if platform.lower() == "farcaster":
                        # Fetch Farcaster data using token name as username
                        farcaster_data = await self._fetch_farcaster_user_data(name)
                        break
            
            # Build social links
            for social_entry in retake_info.get("all_social_urls", []):
                if isinstance(social_entry, dict):
                    platform = social_entry.get("platform", "").strip()
                    url = social_entry.get("url", "").strip()
                    if platform.lower() != "retake" and url:
                        if platform.lower() == "twitter":
                            social_sections.append(f"Twitter: <a href=\"{url}\">@{name}</a>")
                        elif platform.lower() == "farcaster" and farcaster_data:
                            # Enhanced Farcaster format with API data
                            fid = farcaster_data.get("fid", 0)
                            follower_count = farcaster_data.get("followerCount", 0)
                            following_count = farcaster_data.get("followingCount", 0)
                            username = farcaster_data.get("username", name)
                            farcaster_url = f"https://farcaster.xyz/{username}"
                            
                            social_sections.append(f"Farcaster: 🆔 {fid} 👥: {follower_count} 👤: {following_count} 🔗: <a href=\"{farcaster_url}\">link</a>")
                        elif platform.lower() == "farcaster":
                            # Fallback if Farcaster API failed
                            social_sections.append(f"Farcaster: <a href=\"https://farcaster.xyz/{name}\">{name}</a>")
                        else:
                            # Other social platforms
                            social_sections.append(f"{platform}: <a href=\"{url}\">{name}</a>")
            
            # Format social sections with proper tree structure
            if social_sections:
                if len(social_sections) == 1:
                    social_links = social_sections[0]
                else:
                    social_links = "\n      ├── " + social_sections[0]
                    for i in range(1, len(social_sections)):
                        if i == len(social_sections) - 1:  # Last item
                            social_links += f"\n      └── {social_sections[i]}"
                        else:
                            social_links += f"\n      ├── {social_sections[i]}"
            else:
                social_links = "—"
            
            # Create formatted message for Retake
            short_desc = description[:100] + "..." if len(description) > 100 else description
            message = f"""🎬 <b>Retake Token:</b> {name} ({symbol})
├── <b>CA:</b> <code>{token_address}</code>
├── <b>Creator:</b> {creator_display}
├── <b>Admin:</b> {admin_display}
└── <b>Stream:</b> <a href=\"{retake_url}\">Watch Live</a>"""

            # Add optional fields with proper tree structure
            tree_items = []
            if short_desc:
                tree_items.append(f"<b>Description:</b> {short_desc}")
            if social_links != "—":
                if "\n" in social_links:  # Multi-line social format
                    tree_items.append(f"<b>Social:</b>{social_links}")
                else:  # Single line social format
                    tree_items.append(f"<b>Social:</b>\n      └── {social_links}")
                
            if tree_items:
                # Replace last └── with ├── and add new items
                message = message.replace("└── <b>Stream:", "├── <b>Stream:")
                for i, item in enumerate(tree_items):
                    if i == len(tree_items) - 1:  # Last item
                        message += f"\n└── {item}"
                    else:
                        message += f"\n├── {item}"

            message += f"""

<b>Network:</b> {chain_name} • Clanker (Retake) • Block #{block_number}
<b>Created:</b> {tx_link} • {datetime.utcnow().strftime('%d-%m-%Y %H:%M UTC')} {relative_time}"""
            
            # Check metadata_uri for Retake notification decision
            metadata_uri_field = token_info.get("metadata_uri", "")
            image_url_field = token_info.get("image_url", "")
            metadata_uri = metadata_uri_field or image_url_field
            
            logger.debug("Checking for metadata URI in Retake token_info",
                       token_address=token_address,
                       metadata_uri_field=metadata_uri_field,
                       image_url_field=image_url_field,
                       final_metadata_uri=metadata_uri,
                       available_fields=list(token_info.keys()))
            
            # Skip Retake notification if no metadata_uri found
            if not metadata_uri or not (metadata_uri.startswith("ipfs://") or metadata_uri.startswith("https://")):
                logger.info("Skipping Retake token notification - no valid metadata_uri found",
                           token_address=token_address,
                           metadata_uri=metadata_uri,
                           retake_url=retake_url)
                return False
            
            # Send text message to Retake channels (has valid metadata_uri)
            logger.debug("Valid metadata_uri found, sending Retake text notification",
                       token_address=token_address,
                       metadata_uri=metadata_uri)
            results = await self.send_message_to_chats(message, self.retake_chat_ids)
            success = any(results.values())
            
            logger.info("Retake token notification sent",
                       token_address=token_address,
                       retake_url=retake_url,
                       notification_success=success,
                       total_retake_channels=len(self.retake_chat_ids),
                       metadata_uri=metadata_uri)
            
            return success
            
        except Exception as e:
            logger.error("Error formatting Retake token notification", 
                        token_address=token_info.get("token_address"),
                        retake_url=retake_info.get("url", ""),
                        error=str(e))
            return False
    
    async def health_check(self) -> bool:
        """Check if Telegram service is healthy."""
        if not self.is_connected or not self.session:
            return False
        
        try:
            async with self.session.get(
                f"{self.base_url}/getMe",
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("ok", False)
                return False
                
        except Exception as e:
            logger.error("Telegram health check failed", error=str(e))
            return False
    
    def _get_source_display_name(self, source: str) -> str:
        """
        Get display name for token source.
        
        Args:
            source: Token source (e.g., 'clanker', 'creator_coin', 'creator_coin_v4')
            
        Returns:
            Display name ('Clanker' for clanker, 'Zora' for others)
        """
        source_lower = source.lower().strip()
        
        if 'clanker' in source_lower:
            return 'Clanker'
        else:
            return 'Zora'
    
    async def _get_creator_display_name(self, address: str, chain_id: int = 1) -> str:
        """
        Get display name for creator address with block explorer link.
        
        Args:
            address: Creator address
            chain_id: Blockchain chain ID for explorer link
            
        Returns:
            ENS name with address link, or just address link if no ENS
        """
        if not address or not Web3.is_address(address):
            return address or "Unknown"
        
        # Always get the clickable address link (use short format for better display)
        address_link = self._get_address_link(address, chain_id, short_format=True)
        
        # Try to get ENS name
        if self.ens_resolver:
            try:
                ens_result = await self.ens_resolver.resolve_and_format(address, prefer_base=True)
                # Check if ENS resolution returned something different than just the address
                if ens_result and not ens_result.startswith('<code>') and ens_result != address:
                    # We have an ENS name, show: ENS_NAME (short_address_link)
                    return f"{ens_result} ({address_link})"
            except Exception as e:
                logger.debug("Failed to resolve ENS", address=address, error=str(e))
        
        # Fallback to just the clickable address link (short format)
        return address_link
    
    def _get_address_link(self, address: str, chain_id: int, short_format: bool = False) -> str:
        """
        Get clickable link for address.
        
        Args:
            address: Ethereum address
            chain_id: Blockchain chain ID
            short_format: If True, display shortened address format (5 chars + ... + 4 chars)
            
        Returns:
            HTML formatted link or plain address
        """
        if not address:
            return "Unknown"
        
        # Format address display
        if short_format and len(address) > 10:
            display_address = f"{address[:5]}...{address[-4:]}"
        else:
            display_address = address
        
        explorer_url = self.block_explorer.get_address_url(chain_id, address)
        if explorer_url:
            return f'<a href="{explorer_url}">{display_address}</a>'
        else:
            return f"<code>{display_address}</code>"
    
    def _get_token_link(self, address: str, chain_id: int) -> str:
        """
        Get clickable link for token address.
        
        Args:
            address: Token address
            chain_id: Blockchain chain ID
            
        Returns:
            HTML formatted link or plain address
        """
        if not address:
            return "Unknown"
        
        token_url = self.block_explorer.get_token_url(chain_id, address)
        if token_url:
            return f'<a href="{token_url}">{address}</a>'
        else:
            return f"<code>{address}</code>"
    
    def _get_tx_link(self, tx_hash: str, chain_id: int) -> str:
        """
        Get clickable link for transaction hash.
        
        Args:
            tx_hash: Transaction hash
            chain_id: Blockchain chain ID
            
        Returns:
            HTML formatted link or plain tx hash
        """
        if not tx_hash:
            return "N/A"
        
        tx_url = self.block_explorer.get_transaction_url(chain_id, tx_hash)
        if tx_url:
            return f'<a href="{tx_url}">Scan</a>'
        else:
            return f"<code>{tx_hash[:10]}...</code>"
    
    def _get_zora_profile_link(self, token_name: str, source: str) -> Optional[str]:
        """
        Get Zora profile link for Zora tokens.
        
        Args:
            token_name: Token name
            source: Token source
            
        Returns:
            Zora profile URL or None if not applicable
        """
        source_display = self._get_source_display_name(source)
        
        # Only create Zora profile links for non-Clanker tokens
        if source_display == "Zora" and token_name and token_name != "Unknown":
            # Don't create profile link if name contains spaces
            if ' ' in token_name:
                return None
            
            # Clean token name for URL (remove special chars, convert to lowercase)
            clean_name = token_name.lower().replace('-', '').replace('_', '')
            if clean_name and clean_name.isalnum():  # Only alphanumeric characters
                return f"https://zora.co/@{clean_name}"
        
        return None
    
    async def _fetch_zora_profile_data(self, profile_id: str) -> Tuple[Optional[Dict], Optional[Dict]]:
        """
        Fetch Zora profile data from GraphQL API.
        
        Args:
            profile_id: Zora profile ID (clean token name)
            
        Returns:
            Tuple of (profile_data, follow_data) or (None, None) if failed
        """
        if not self.session:
            logger.warning("No HTTP session available for Zora API call")
            return None, None
        
        try:
            zora_api_url = "https://api.zora.co/universal/graphql"
            
            # First API call - Profile data
            profile_payload = {
                "hash": "2235344f44551e5c5eee3e04c46465c7",
                "variables": {"profileId": profile_id},
                "operationName": "UserProfileWebQuery"
            }
            
            # Second API call - Follow data  
            follow_payload = {
                "hash": "c7c7fb2ef84bae095076863db797dcf8",
                "variables": {"profileId": profile_id}, 
                "operationName": "FollowInformationWebQuery"
            }
            
            # Make both API calls concurrently
            profile_task = self.session.post(
                zora_api_url,
                json=profile_payload,
                timeout=aiohttp.ClientTimeout(total=15)
            )
            
            follow_task = self.session.post(
                zora_api_url,
                json=follow_payload,
                timeout=aiohttp.ClientTimeout(total=15)
            )
            
            profile_response, follow_response = await asyncio.gather(
                profile_task, follow_task, return_exceptions=True
            )
            
            profile_data = None
            follow_data = None
            
            # Parse profile response
            if not isinstance(profile_response, Exception):
                if profile_response.status == 200:
                    try:
                        profile_json = await profile_response.json()
                        data_section = profile_json.get("data") if profile_json else None
                        profile_data = data_section.get("profile") if data_section else None
                        
                        logger.debug("Profile API success", 
                                   profile_id=profile_id,
                                   has_profile=bool(profile_data),
                                   profile_json_keys=list(profile_json.keys()) if profile_json else None,
                                   data_keys=list(data_section.keys()) if data_section else None,
                                   profile_type=type(profile_data).__name__ if profile_data else None)
                    except Exception as e:
                        logger.warning("Failed to parse profile response", 
                                     profile_id=profile_id, error=str(e))
                else:
                    logger.warning("Profile API HTTP error", 
                                 profile_id=profile_id, 
                                 status=profile_response.status)
            else:
                logger.warning("Profile API request failed", 
                             profile_id=profile_id, 
                             error=str(profile_response))
            
            # Parse follow response
            if not isinstance(follow_response, Exception):
                if follow_response.status == 200:
                    try:
                        follow_json = await follow_response.json()
                        follow_data = follow_json.get("data", {}).get("profile")
                        logger.debug("Follow API success", 
                                   profile_id=profile_id,
                                   has_follow_data=bool(follow_data))
                    except Exception as e:
                        logger.warning("Failed to parse follow response", 
                                     profile_id=profile_id, error=str(e))
                else:
                    logger.warning("Follow API HTTP error", 
                                 profile_id=profile_id, 
                                 status=follow_response.status)
            else:
                logger.warning("Follow API request failed", 
                             profile_id=profile_id, 
                             error=str(follow_response))
            
            # Close responses
            if not isinstance(profile_response, Exception):
                profile_response.close()
            if not isinstance(follow_response, Exception):
                follow_response.close()
            
            return profile_data, follow_data
            
        except Exception as e:
            logger.warning("Failed to fetch Zora profile data", 
                          profile_id=profile_id, 
                          error=str(e),
                          error_type=type(e).__name__)
            return None, None
    
    def _extract_retake_info(self, token_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Extract Retake platform information from token metadata.
        
        Args:
            token_info: Token information dictionary
            
        Returns:
            Dict with retake info if found, None otherwise
        """
        def _check_social_urls_for_retake(parsed_metadata: Dict) -> Optional[Dict[str, Any]]:
            """Helper to check socialMediaUrls for Retake platform."""
            social_media_urls = parsed_metadata.get("socialMediaUrls", [])
            if not isinstance(social_media_urls, list):
                return None
            
            # Look for Retake platform (case insensitive)
            for social_entry in social_media_urls:
                if isinstance(social_entry, dict):
                    platform = social_entry.get("platform", "").strip()
                    if platform.lower() == "retake":
                        retake_url = social_entry.get("url", "").strip()
                        if retake_url:
                            return {
                                "platform": platform,
                                "url": retake_url,
                                "description": parsed_metadata.get("description", ""),
                                "all_social_urls": social_media_urls
                            }
            return None
        
        try:
            # 1. Try metadata_json field (already parsed object)
            metadata_json = token_info.get("metadata_json")
            if metadata_json and isinstance(metadata_json, dict):
                retake_info = _check_social_urls_for_retake(metadata_json)
                if retake_info:
                    logger.debug("Found Retake info from metadata_json")
                    return retake_info
            
            # 2. Try token_metadata as JSON string (root level)
            token_metadata = token_info.get("token_metadata", "")
            if token_metadata and isinstance(token_metadata, str) and len(token_metadata.strip()) > 0:
                try:
                    parsed_metadata = json.loads(token_metadata)
                    if isinstance(parsed_metadata, dict):
                        retake_info = _check_social_urls_for_retake(parsed_metadata)
                        if retake_info:
                            logger.debug("Found Retake info from token_metadata")
                            return retake_info
                except json.JSONDecodeError:
                    logger.debug("Failed to parse token_metadata as JSON for Retake info")
            
            # 3. Try raw_event_data.token_metadata (nested path)
            raw_event_data = token_info.get("raw_event_data", {})
            if isinstance(raw_event_data, dict):
                raw_token_metadata = raw_event_data.get("token_metadata", "")
                if raw_token_metadata and isinstance(raw_token_metadata, str) and len(raw_token_metadata.strip()) > 0:
                    try:
                        parsed_metadata = json.loads(raw_token_metadata)
                        if isinstance(parsed_metadata, dict):
                            retake_info = _check_social_urls_for_retake(parsed_metadata)
                            if retake_info:
                                logger.debug("Found Retake info from raw_event_data.token_metadata")
                                return retake_info
                    except json.JSONDecodeError:
                        logger.debug("Failed to parse raw_event_data.token_metadata as JSON for Retake info")
            
            return None
            
        except (AttributeError, TypeError) as e:
            logger.debug("Failed to extract Retake info", error=str(e))
            return None
    
    def _get_relative_time(self, creation_timestamp) -> str:
        """
        Get relative time from creation timestamp.
        
        Args:
            creation_timestamp: Token creation timestamp (can be datetime object or timestamp)
            
        Returns:
            Formatted relative time string
        """
        try:
            if creation_timestamp is None:
                return ""
            
            # Handle different timestamp formats
            if isinstance(creation_timestamp, str):
                # Try parsing ISO format first
                try:
                    creation_time = datetime.fromisoformat(creation_timestamp.replace('Z', '+00:00'))
                except:
                    return ""
            elif isinstance(creation_timestamp, (int, float)):
                # Unix timestamp
                creation_time = datetime.fromtimestamp(creation_timestamp)
            elif isinstance(creation_timestamp, datetime):
                creation_time = creation_timestamp
            else:
                return ""
            
            # Calculate time difference
            now = datetime.utcnow()
            if creation_time.tzinfo is not None:
                # If creation_time has timezone info, make now timezone aware
                from datetime import timezone
                now = now.replace(tzinfo=timezone.utc)
                
            diff = now - creation_time
            
            total_seconds = int(diff.total_seconds())
            
            if total_seconds < 60:
                return f"({total_seconds}s ago)"
            elif total_seconds < 3600:
                minutes = total_seconds // 60
                return f"({minutes}m ago)"
            elif total_seconds < 86400:
                hours = total_seconds // 3600
                return f"({hours}h ago)"
            else:
                days = total_seconds // 86400
                return f"({days}d ago)"
                
        except Exception as e:
            logger.debug("Error calculating relative time", error=str(e))
            return ""
    
    def _format_number_compact(self, value: str) -> str:
        """Format large numbers in compact form (K, M, B)."""
        try:
            num = float(value)
            if num >= 1_000_000_000:
                return f"{num/1_000_000_000:.1f}B"
            elif num >= 1_000_000:
                return f"{num/1_000_000:.1f}M"
            elif num >= 1_000:
                return f"{num/1_000:.1f}K"
            else:
                return f"{num:.1f}"
        except (ValueError, TypeError):
            return value
    
    def _safe_format_int(self, value) -> str:
        """Safely format value as integer with comma separator."""
        try:
            return f"{int(value):,}"
        except (ValueError, TypeError):
            return str(value)
    
    def _build_social_links(self, social_accounts: Dict[str, Any]) -> str:
        """Build social media links string."""
        links = []
        
        # Check Twitter/X (field can be None)
        twitter = social_accounts.get("twitter")
        if twitter and isinstance(twitter, dict) and twitter.get("username"):
            username = twitter["username"]
            links.append(f"<a href=\"https://x.com/{username}\">𝕏</a>")
        
        # Check Farcaster (field can be None)
        farcaster = social_accounts.get("farcaster")
        if farcaster and isinstance(farcaster, dict) and farcaster.get("username"):
            username = farcaster["username"]
            links.append(f"<a href=\"https://farcaster.xyz/{username}\">🟣</a>")
        
        # Check Instagram (field can be None)
        instagram = social_accounts.get("instagram")
        if instagram and isinstance(instagram, dict) and instagram.get("username"):
            username = instagram["username"]
            links.append(f"<a href=\"https://instagram.com/{username}\">📷</a>")
        
        # Check TikTok (field can be None)
        tiktok = social_accounts.get("tiktok")
        if tiktok and isinstance(tiktok, dict) and tiktok.get("username"):
            username = tiktok["username"]
            links.append(f"<a href=\"https://tiktok.com/@{username}\">🎵</a>")
        
        return " ".join(links) if links else "—"
    
    async def _build_enhanced_zora_message(
        self, name: str, symbol: str, token_address: str, creator_display: str, 
        chain_name: str, block_number: str, zora_profile_link: str, 
        profile_data: Dict, follow_data: Dict, tx_link: str, relative_time: str = ""
    ) -> str:
        """Build enhanced Zora message with profile data."""
        
        try:
            # Validate input data
            if not profile_data or not isinstance(profile_data, dict):
                raise ValueError(f"Invalid profile_data: {type(profile_data)}")
            
            # Log profile data structure for debugging
            logger.debug("Processing profile data", 
                        profile_id=zora_profile_link.split('@')[1] if '@' in zora_profile_link else "unknown",
                        profile_data_keys=list(profile_data.keys()),
                        profile_data_type=type(profile_data).__name__)
            
            # Extract profile information with safe defaults
            try:
                display_name = profile_data.get("displayName") or name
                bio = profile_data.get("bio") or ""
                is_unverified = profile_data.get("isUnverifiedCreator", False)
                blocked = profile_data.get("blocked", False)
                logger.debug("Basic profile info extracted", display_name=display_name[:20] + "..." if len(display_name) > 20 else display_name)
            except Exception as e:
                logger.warning("Error extracting basic profile info", error=str(e))
                display_name = name
                bio = ""
                is_unverified = False
                blocked = False
            
            # External wallet info (can be None)  
            try:
                external_wallet = profile_data.get("externalWallet") or {}
                ens_name = external_wallet.get("ensName") if external_wallet else None
                wallet_address = external_wallet.get("walletAddress", "Unknown") if external_wallet else "Unknown"
                logger.debug("Wallet info extracted", has_ens=bool(ens_name), wallet_address=wallet_address[:10] + "..." if wallet_address != "Unknown" else "Unknown")
            except Exception as e:
                logger.warning("Error extracting wallet info", error=str(e))
                ens_name = None
                wallet_address = "Unknown"
            
            # Build wallet display
            try:
                if ens_name:
                    explorer_url = self.block_explorer.get_address_url(8453, wallet_address) if self.block_explorer else "#"
                    wallet_display = f"{ens_name} (<a href=\"{explorer_url}\">{wallet_address}</a>)"
                else:
                    explorer_url = self.block_explorer.get_address_url(8453, wallet_address) if self.block_explorer else "#"
                    wallet_display = f"<a href=\"{explorer_url}\">{wallet_address}</a>"
            except Exception as e:
                logger.debug("Error building wallet display", error=str(e), wallet_address=wallet_address)
                wallet_display = wallet_address
            
            # Social accounts (can be None)
            try:
                social_accounts = profile_data.get("socialAccounts") or {}
                social_links = self._build_social_links(social_accounts)
                logger.debug("Social accounts processed", social_links=social_links)
            except Exception as e:
                logger.warning("Error processing social accounts", error=str(e))
                social_links = "—"
            
            # Token stats (creatorCoin can be None)
            try:
                creator_coin = profile_data.get("creatorCoin") or {}
                volume_24h = self._format_number_compact(creator_coin.get("volume24h", "0")) if creator_coin else "0"
                total_volume = self._format_number_compact(creator_coin.get("totalVolume", "0")) if creator_coin else "0"
                market_cap = self._format_number_compact(creator_coin.get("marketCap", "0")) if creator_coin else "0"
                market_cap_delta = creator_coin.get("marketCapDelta24h", "0") if creator_coin else "0"
                unique_holders = creator_coin.get("uniqueHolders", "0") if creator_coin else "0"
                logger.debug("Token stats extracted", market_cap=market_cap, volume_24h=volume_24h)
            except Exception as e:
                logger.warning("Error extracting token stats", error=str(e))
                volume_24h = total_volume = market_cap = market_cap_delta = unique_holders = "0"
            
            # Format market cap change
            try:
                delta_num = float(market_cap_delta)
                delta_emoji = "📈" if delta_num >= 0 else "📉"
                delta_formatted = f"{delta_emoji} {self._format_number_compact(market_cap_delta)}"
            except (ValueError, TypeError):
                delta_formatted = "➖"
            
            # Follow stats (handle empty follow_data)
            try:
                if follow_data and isinstance(follow_data, dict):
                    followed_edges = follow_data.get("followedEdges") or {}
                    following_edges = follow_data.get("followingEdges") or {}
                    followers_in_vc = follow_data.get("followersInVcFollowing") or {}
                    
                    followers = followed_edges.get("count", 0) if isinstance(followed_edges, dict) else 0
                    following = following_edges.get("count", 0) if isinstance(following_edges, dict) else 0
                    mutual_followers = followers_in_vc.get("count", 0) if isinstance(followers_in_vc, dict) else 0
                else:
                    followers = following = mutual_followers = 0
                logger.debug("Follow stats extracted", followers=followers, following=following, mutual=mutual_followers)
            except Exception as e:
                logger.warning("Error extracting follow stats", error=str(e))
                followers = following = mutual_followers = 0
            
            # Status emojis
            verified_emoji = "❌" if is_unverified else "✅"
            blocked_emoji = "🚫" if blocked else "🔓"
            
            # Build enhanced message
            try:
                clean_name = zora_profile_link.split('@')[1] if '@' in zora_profile_link else name.lower()
                
                # Build enhanced message with all info using tree structure
                message = f"""🎨 <b>Zora Token:</b> {display_name} ({symbol})
├── <b>CA:</b> <code>{token_address}</code>
├── <b>Creator:</b> {creator_display}
├── <b>Profile:</b> <a href=\"{zora_profile_link}\">@{clean_name}</a> {verified_emoji}
├── <b>Stats:</b>
│   ├── Market Cap: ${market_cap} ({delta_formatted})
│   ├── 24h Vol: ${volume_24h} • Total: ${total_volume}
│   ├── Holders: {self._safe_format_int(unique_holders)}
│   └── Followers: {self._safe_format_int(followers)} • Following: {self._safe_format_int(following)}"""

                # Add optional fields with proper tree structure
                tree_items = []
                if bio:
                    bio_short = bio[:80] + "..." if len(bio) > 80 else bio
                    tree_items.append(f"<b>Bio:</b> {bio_short}")
                if social_links != "—":
                    tree_items.append(f"<b>Social:</b> {social_links}")
                    
                if tree_items:
                    for i, item in enumerate(tree_items):
                        if i == len(tree_items) - 1:  # Last item  
                            message += f"\n└── {item}"
                        else:
                            message += f"\n├── {item}"
                else:
                    # If no optional items, make Stats the last item
                    message = message.replace("├── <b>Stats:</b>", "└── <b>Stats:</b>")

                message += f"""

<b>Network:</b> {chain_name} • Zora • Block #{block_number}
<b>Created:</b> {tx_link} • {datetime.utcnow().strftime('%d-%m-%Y %H:%M UTC')} {relative_time}"""
                
                logger.debug("Enhanced message built successfully", message_length=len(message))
                return message
                
            except Exception as e:
                logger.warning("Error building enhanced message components", error=str(e))
                raise  # Re-raise to trigger fallback
            
        except Exception as e:
            import traceback
            error_traceback = traceback.format_exc()
            logger.warning("Error building enhanced Zora message, falling back to basic format", 
                          profile_id=zora_profile_link.split('@')[1] if '@' in zora_profile_link else "unknown",
                          error=str(e),
                          traceback=error_traceback)
            
            # Fallback to basic message format
            clean_name = zora_profile_link.split('@')[1] if '@' in zora_profile_link else name
            return f"""🎨 <b>Zora Token:</b> {name} ({symbol})
├── <b>CA:</b> <code>{token_address}</code>
├── <b>Creator:</b> {creator_display}
└── <b>Profile:</b> <a href=\"{zora_profile_link}\">@{clean_name}</a>

<b>Network:</b> {chain_name} • Zora • Block #{block_number}
<b>Created:</b> {tx_link} • {datetime.utcnow().strftime('%d-%m-%Y %H:%M UTC')} {relative_time}"""
    
    async def _send_photo_with_caption_if_available(self, profile_data: Dict, caption: str) -> bool:
        """Send photo with caption if avatar is available."""
        try:
            # Avatar field can be None
            avatar = profile_data.get("avatar")
            if not avatar or not isinstance(avatar, dict):
                return False
            
            avatar_url = avatar.get("downloadableUri")
            if not avatar_url:
                return False
            
            # Send photo with caption to all chats
            tasks = []
            for chat_id in self.chat_ids:
                task = self._send_photo_to_chat(avatar_url, chat_id, caption)
                tasks.append(task)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            successful_sends = sum(1 for result in results if result and not isinstance(result, Exception))
            
            logger.info("Photo with caption send results",
                       successful_sends=successful_sends,
                       total_chats=len(self.chat_ids))
            
            return successful_sends > 0
            
        except Exception as e:
            logger.debug("Failed to send photo with caption", error=str(e))
            return False
    
    def _convert_ipfs_to_http(self, ipfs_uri: str, gateway_index: int = 0) -> str:
        """
        Convert IPFS URI to HTTP gateway URL with multiple gateway options.
        
        Args:
            ipfs_uri: IPFS URI (e.g., ipfs://bafybeifzb4bru2yepab4dznrlueejuuynq7suztqaunadx46a5kptuytve)
            gateway_index: Index of gateway to use (for fallback)
            
        Returns:
            HTTP gateway URL
        """
        if not ipfs_uri.startswith("ipfs://"):
            return ipfs_uri
        
        # Extract hash from ipfs://hash
        ipfs_hash = ipfs_uri[7:]  # Remove "ipfs://" prefix
        
        # Multiple IPFS gateways for reliability
        gateways = [
            "https://ipfs.io/ipfs/",
            "https://dweb.link/ipfs/",
            "https://nftstorage.link/ipfs/",
            "https://w3s.link/ipfs/",
        ]
        
        gateway = gateways[gateway_index % len(gateways)]
        return f"{gateway}{ipfs_hash}"

    async def _fetch_token_metadata_and_image(self, metadata_uri: str) -> Optional[str]:
        """
        Fetch token metadata and extract image URL with IPFS gateway fallback.
        
        Args:
            metadata_uri: Metadata URI (IPFS or HTTPS)
            
        Returns:
            Image URL or None if not found
        """
        if not self.session or not metadata_uri:
            return None
        
        # For IPFS URIs, try multiple gateways
        max_gateway_attempts = 4 if metadata_uri.startswith("ipfs://") else 1
        
        for gateway_index in range(max_gateway_attempts):
            try:
                # Convert IPFS URI to HTTP if needed
                if metadata_uri.startswith("ipfs://"):
                    http_url = self._convert_ipfs_to_http(metadata_uri, gateway_index)
                elif metadata_uri.startswith("https://"):
                    http_url = metadata_uri
                else:
                    logger.debug("Unsupported metadata URI format", uri=metadata_uri)
                    return None
                
                logger.debug("Fetching token metadata", 
                           uri=http_url, 
                           attempt=gateway_index + 1, 
                           max_attempts=max_gateway_attempts)
                
                async with self.session.get(
                    http_url,
                    timeout=aiohttp.ClientTimeout(total=15)
                ) as response:
                    if response.status == 200:
                        try:
                            metadata = await response.json()
                            
                            # Try to extract image from metadata
                            # For token metadata, image is typically stored in "image" field
                            image_url = metadata.get("image")
                            
                            logger.debug("Checking for image in metadata", 
                                       metadata_uri=metadata_uri,
                                       has_image_field=bool(image_url),
                                       image_value=image_url[:50] + "..." if image_url and len(str(image_url)) > 50 else image_url)
                            
                            if image_url:
                                # Convert IPFS image URL to HTTP if needed
                                if image_url.startswith("ipfs://"):
                                    # This is an IPFS image link - convert to HTTP gateway
                                    http_image_url = self._convert_ipfs_to_http(image_url, gateway_index)
                                    
                                    logger.debug("Found IPFS image link in metadata", 
                                               metadata_uri=metadata_uri,
                                               gateway_used=http_url,
                                               ipfs_image_url=image_url,
                                               http_image_url=http_image_url[:100] + "..." if len(http_image_url) > 100 else http_image_url)
                                    
                                    return http_image_url
                                elif image_url.startswith("https://"):
                                    # Already HTTP URL
                                    logger.debug("Found HTTPS image link in metadata", 
                                               metadata_uri=metadata_uri,
                                               gateway_used=http_url,
                                               image_url=image_url[:100] + "..." if len(image_url) > 100 else image_url)
                                    return image_url
                                else:
                                    # Relative or other format - try to construct full URL
                                    logger.debug("Found relative image link in metadata", 
                                               metadata_uri=metadata_uri,
                                               gateway_used=http_url,
                                               raw_image_url=image_url)
                                    # Could implement base URL resolution here if needed
                                    return image_url
                            
                            # Also check nested content.uri field as fallback
                            content = metadata.get("content", {})
                            if isinstance(content, dict) and content.get("uri"):
                                content_uri = content["uri"]
                                if content_uri.startswith("ipfs://"):
                                    http_content_url = self._convert_ipfs_to_http(content_uri, gateway_index)
                                    logger.debug("Found IPFS content URI as image fallback", 
                                               metadata_uri=metadata_uri,
                                               content_uri=content_uri,
                                               http_content_url=http_content_url[:100] + "..." if len(http_content_url) > 100 else http_content_url)
                                    return http_content_url
                                elif content_uri.startswith("https://"):
                                    logger.debug("Found HTTPS content URI as image fallback", 
                                               metadata_uri=metadata_uri,
                                               content_uri=content_uri)
                                    return content_uri
                            
                            logger.debug("No image field found in metadata", 
                                       metadata_uri=metadata_uri,
                                       available_fields=list(metadata.keys()),
                                       has_content=bool(metadata.get("content")))
                            return None  # No image found, don't try other gateways
                        
                        except json.JSONDecodeError as e:
                            logger.warning("Failed to parse metadata JSON", 
                                         metadata_uri=metadata_uri, 
                                         gateway_used=http_url,
                                         error=str(e))
                            return None  # Invalid JSON, don't try other gateways
                    else:
                        logger.warning("Failed to fetch metadata", 
                                     metadata_uri=metadata_uri, 
                                     gateway_used=http_url,
                                     status=response.status,
                                     attempt=gateway_index + 1)
                        # Continue to next gateway
            
            except asyncio.TimeoutError:
                logger.warning("Timeout fetching metadata", 
                             metadata_uri=metadata_uri,
                             attempt=gateway_index + 1)
                # Continue to next gateway
            except Exception as e:
                logger.warning("Error fetching metadata", 
                              metadata_uri=metadata_uri,
                              attempt=gateway_index + 1,
                              error=str(e))
                # Continue to next gateway
        
        logger.warning("Failed to fetch metadata from all gateways", 
                     metadata_uri=metadata_uri,
                     attempts=max_gateway_attempts)
        return None

    async def _fetch_farcaster_user_data(self, username: str) -> Optional[Dict[str, Any]]:
        """
        Fetch Farcaster user data from API.
        
        Args:
            username: Farcaster username (token name)
            
        Returns:
            User data dict or None if failed
        """
        if not self.session or not username:
            return None
        
        try:
            api_url = f"https://client.farcaster.xyz/v2/user-by-username?username={username}"
            
            async with self.session.get(
                api_url,
                timeout=aiohttp.ClientTimeout(total=10)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    result = data.get("result", {})
                    user_data = result.get("user", {})
                    
                    if user_data:
                        logger.debug("Successfully fetched Farcaster data", 
                                   username=username,
                                   fid=user_data.get("fid"),
                                   follower_count=user_data.get("followerCount", 0))
                        return user_data
                    else:
                        logger.warning("No user data found in Farcaster response", username=username)
                else:
                    logger.warning("Farcaster API HTTP error", 
                                 username=username, 
                                 status=response.status)
                    
        except asyncio.TimeoutError:
            logger.warning("Farcaster API timeout", username=username)
        except Exception as e:
            logger.warning("Failed to fetch Farcaster data", 
                          username=username, 
                          error=str(e))
        
        return None

    async def _send_photo_to_chat(self, photo_url: str, chat_id: str, caption: str = None) -> bool:
        """Send photo to specific chat with optional caption."""
        try:
            payload = {
                "chat_id": chat_id,
                "photo": photo_url,
                "disable_notification": True
            }
            
            # Add caption if provided
            if caption:
                payload["caption"] = caption
                payload["parse_mode"] = "HTML"
            
            async with self.session.post(
                f"{self.base_url}/sendPhoto",
                data=payload,
                timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get("ok", False)
                else:
                    logger.debug("Photo send HTTP error", 
                               chat_id=chat_id, 
                               status=response.status)
                return False
                
        except Exception as e:
            logger.debug("Error sending photo", chat_id=chat_id, error=str(e))
            return False
    
    def _extract_additional_metadata(self, token_info: Dict[str, Any]) -> Optional[str]:
        """
        Extract and format additional metadata for Clanker tokens.
        
        Args:
            token_info: Token information dictionary
            
        Returns:
            Formatted metadata string or None
        """
        # Try multiple sources for metadata, in order of preference
        
        # 1. Try metadata_json field (already parsed object)
        metadata_json = token_info.get("metadata_json")
        if metadata_json and isinstance(metadata_json, dict):
            description = metadata_json.get("description", "")
            if description and len(description.strip()) > 0:
                clean_description = description.strip()
                if len(clean_description) > 150:
                    clean_description = clean_description[:150] + "..."
                return clean_description
        
        # 2. Try token_metadata as JSON string (root level)
        token_metadata = token_info.get("token_metadata", "")
        if token_metadata and isinstance(token_metadata, str) and len(token_metadata.strip()) > 0:
            try:
                parsed_metadata = json.loads(token_metadata)
                if isinstance(parsed_metadata, dict):
                    description = parsed_metadata.get("description", "")
                    if description and len(description.strip()) > 0:
                        clean_description = description.strip()
                        if len(clean_description) > 150:
                            clean_description = clean_description[:150] + "..."
                        return clean_description
            except json.JSONDecodeError:
                logger.debug("Failed to parse token_metadata as JSON", 
                           token_metadata=token_metadata[:100] + "..." if len(token_metadata) > 100 else token_metadata)
        
        # 3. Try raw_event_data.token_metadata (nested path)
        raw_event_data = token_info.get("raw_event_data", {})
        if isinstance(raw_event_data, dict):
            raw_token_metadata = raw_event_data.get("token_metadata", "")
            if raw_token_metadata and isinstance(raw_token_metadata, str) and len(raw_token_metadata.strip()) > 0:
                try:
                    parsed_metadata = json.loads(raw_token_metadata)
                    if isinstance(parsed_metadata, dict):
                        description = parsed_metadata.get("description", "")
                        if description and len(description.strip()) > 0:
                            clean_description = description.strip()
                            if len(clean_description) > 150:
                                clean_description = clean_description[:150] + "..."
                            return clean_description
                except json.JSONDecodeError:
                    logger.debug("Failed to parse raw_event_data.token_metadata as JSON", 
                               token_metadata=raw_token_metadata[:100] + "..." if len(raw_token_metadata) > 100 else raw_token_metadata)
        
        # 4. Fallback: Try different possible field names for additional metadata
        metadata_fields = [
            'additional_metadata',
            'additionalMetadata', 
            'extra_metadata',
            'metadata_extra',
            'token_description',
            'description'
        ]
        
        for field in metadata_fields:
            metadata = token_info.get(field)
            if metadata and isinstance(metadata, str) and len(metadata.strip()) > 0:
                clean_metadata = metadata.strip()
                if len(clean_metadata) > 150:
                    clean_metadata = clean_metadata[:150] + "..."
                return clean_metadata
        
        return None
