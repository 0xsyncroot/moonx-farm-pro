# Telegram Notifications

The coin indexer now supports Telegram notifications for newly created tokens. When tokens are successfully parsed and saved to the database, a notification will be sent to the configured Telegram channel.

## Setup

### 1. Create a Telegram Bot

1. Message [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` command
3. Follow the prompts to name your bot
4. Save the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Chat ID

**For Channel:**
1. Add your bot to the channel as an administrator
2. Send a test message to the channel
3. Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Look for the `chat.id` in the response (will be negative for channels)

**For Group:**
1. Add your bot to the group
2. Send a test message mentioning the bot
3. Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Look for the `chat.id` in the response

**For Direct Messages:**
1. Start a conversation with your bot
2. Send any message
3. Visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
4. Look for the `chat.id` in the response (will be positive for direct messages)

### 3. Configure Environment Variables

Add the following environment variables to your `.env` file:

```env
# Telegram notification settings
MOONX_COIN_TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
MOONX_COIN_TELEGRAM_CHAT_IDS='["-1001234567890", "-1009876543210", "123456789"]'
MOONX_COIN_TELEGRAM_ENABLED=true

# ENS resolution RPC URLs (optional, for resolving creator addresses)
MOONX_COIN_ENS_ETHEREUM_RPC_URL=https://eth.llamarpc.com
MOONX_COIN_ENS_BASE_RPC_URL=https://base.llamarpc.com
MOONX_COIN_ENS_CONNECTION_TIMEOUT=10
```

**Important Notes:**
- `MOONX_COIN_TELEGRAM_CHAT_IDS` should be a JSON array string containing multiple chat IDs
- This allows sending notifications to multiple channels, groups, or users simultaneously  
- For environment variables, wrap the JSON array in single quotes to prevent shell interpretation
- Channel IDs are negative, group IDs are negative, user IDs are positive
- The validator automatically parses JSON strings into lists - supports various formats

**Migration from single chat_id:**
If you previously used `MOONX_COIN_TELEGRAM_CHAT_ID`, convert it to the new format:
```env
# Old format (deprecated)
MOONX_COIN_TELEGRAM_CHAT_ID=-1001234567890

# New format  
MOONX_COIN_TELEGRAM_CHAT_IDS='["-1001234567890"]'
```

## Notification Format

### Creator Coin Tokens (Zora)
```
🚀 New Token Created!

📊 Token Details:
• Name: MyToken
• Symbol: MTK
• Address: [Clickable link to BaseScan]
• Creator: vitalik.eth (or 0xabcd...ef12 if no ENS)

🌐 Network Info:
• Chain: Base
• Source: Zora
• Block: 12345678

⏰ Time: 2024-01-15 10:30:00 UTC
```

### Clanker Tokens
```
🎯 New Clanker Token Created!

📊 Token Details:
• Name: ClankerToken
• Symbol: CLNK
• Address: [Clickable link to BaseScan]
• Creator: creator.base.eth (or 0xabcd...ef12 if no ENS)
• Admin: admin.base.eth (or 0x9876...4321 if no ENS)
• Description: This is an awesome token with cool features...

🌐 Network Info:
• Chain: Base
• Source: Clanker
• Block: 12345678

⏰ Time: 2024-01-15 10:30:00 UTC
```

### Enhanced Features Examples

**ENS Resolution Priority:**
1. `creator.base.eth` → Base ENS name (preferred)
2. `creator.eth` → Ethereum ENS name (fallback) 
3. `0xabcd...ef12` → Shortened address (no ENS found)

**Block Explorer Links:**
- Token addresses link to token pages (e.g., BaseScan token page)
- Creator/admin addresses link to address pages
- Links work across all supported networks

**Additional Metadata:**
- Clanker tokens show descriptions from `additional_metadata` field
- Automatically truncated if longer than 150 characters
- Falls back to `token_metadata` field for backward compatibility

## Features

- **Multiple Chat Support**: Send notifications to multiple channels, groups, or users simultaneously
- **Concurrent Delivery**: Messages are sent to all chats concurrently for optimal performance
- **Smart Source Detection**: 
  - **Clanker tokens** → Display as "Clanker"
  - **Creator Coin tokens** → Display as "Zora"
- **ENS Name Resolution**: 
  - Resolves creator addresses to ENS names when available
  - Prioritizes Base ENS, falls back to Ethereum ENS
  - Shows shortened addresses when no ENS name found
- **Block Explorer Integration**: 
  - Clickable links to token and address pages
  - Supports major networks (Ethereum, Base, BSC, Polygon, Arbitrum, etc.)
- **Enhanced Clanker Support**:
  - Displays additional metadata/descriptions when available
  - Shows both creator and admin information with ENS resolution
- **Rich Formatting**: Uses HTML formatting with clickable links
- **Resilient Delivery**: Continues sending to other chats even if some fail
- **Error Handling**: Gracefully handles network issues and API errors
- **Health Monitoring**: Included in service health checks
- **Clean Shutdown**: Properly disconnects during service shutdown

## Monitoring

The Telegram service status is included in the health check endpoint. You can monitor it via:

```bash
curl http://localhost:8000/health
```

Look for the `telegram` component in the response:

```json
{
  "status": "healthy",
  "components": {
    "telegram": {
      "status": "healthy"
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **Bot not sending messages**
   - Verify bot token is correct
   - Ensure bot is added to the channel/group with admin permissions
   - Check chat ID is correct (negative for channels/groups)

2. **Health check failing**
   - Check internet connectivity
   - Verify Telegram API is accessible
   - Confirm bot token is valid

3. **Messages not formatted properly**
   - Ensure HTML parse mode is supported
   - Check for special characters that need escaping

4. **Invalid chat_ids configuration**
   - **ValidationError**: If you get `Input should be a valid list` error:
     - Use single quotes around JSON arrays: `'["-123", "-456"]'`
     - Or use single chat ID without brackets: `-1001234567890`
     - Check JSON syntax is valid
   - Verify negative IDs for channels/groups, positive for users
   - The validator supports multiple formats - see "Supported Chat ID Formats" section

5. **Partial delivery failures**
   - Check individual chat permissions (bot must be admin for channels)
   - Verify each chat ID is correct and accessible
   - Some chats may succeed while others fail - this is expected behavior

6. **ENS resolution not working**
   - Check internet connectivity to configured RPC endpoints
   - Verify `MOONX_COIN_ENS_ETHEREUM_RPC_URL` and `MOONX_COIN_ENS_BASE_RPC_URL` are valid
   - ENS setup happens asynchronously after service start - check logs for "ENS resolver setup completed"
   - RPC connections are created simply without pre-testing
   - Falls back to shortened addresses if ENS resolution fails at notification time
   - Base ENS is prioritized over Ethereum ENS

7. **Block explorer links not working**
   - Verify the chain_id in token data is correct
   - Check if the blockchain network is supported
   - Links automatically fallback to plain addresses for unsupported chains

8. **Service startup performance issues**
   - ENS resolver setup is now async and won't block service startup
   - Service will start with basic notifications, ENS features added when ready
   - Check logs for "ENS resolver setup completed successfully" message

### Logs

Check the logs for Telegram-related messages:

```bash
# Connection logs
INFO Connected to Telegram Bot API bot_username=YourBot
INFO Telegram notifier initialized chat_count=2
INFO Disconnected from Telegram API

# Async ENS setup logs
INFO Starting async ENS resolver setup...
DEBUG Created Ethereum RPC connection for ENS rpc_url=https://eth.llamarpc.com chain_id=1
DEBUG Created Base RPC connection for ENS rpc_url=https://base.llamarpc.com chain_id=8453
INFO ENS resolver setup completed successfully available_chains=[8453, 1] ens_enabled=true

# Multi-chat delivery logs
INFO Telegram message send results total_chats=3 successful_sends=2 failed_sends=1
DEBUG Successfully sent Telegram message chat_id=-1001234567890
ERROR Telegram API error chat_id=-1009876543210 error=...

# Success logs  
INFO Successfully sent Telegram notification token_address=0x... token_name=MyToken source=creator_coin

# Error logs
ERROR Error sending Telegram message chat_id=123456789 error=...
WARNING Failed to send Telegram notification token_address=0x... token_name=MyToken
```

### Multi-Chat Configuration Examples

**Single Channel:**
```env
MOONX_COIN_TELEGRAM_CHAT_IDS='["-1001234567890"]'
```

**Multiple Channels:**
```env
MOONX_COIN_TELEGRAM_CHAT_IDS='["-1001234567890", "-1009876543210"]'
```

**Mixed Recipients (Channel + Group + User):**
```env
MOONX_COIN_TELEGRAM_CHAT_IDS='["-1001234567890", "-1009876543210", "123456789"]'
```

### Supported Chat ID Formats

The validator supports multiple formats for `MOONX_COIN_TELEGRAM_CHAT_IDS`:

**JSON Array (Recommended):**
```env
MOONX_COIN_TELEGRAM_CHAT_IDS='["-1001234567890", "-1009876543210"]'
```

**JSON Array without quotes:**
```env
MOONX_COIN_TELEGRAM_CHAT_IDS=["-1001234567890", "-1009876543210"]
```

**Single Chat ID (automatically wrapped):**
```env
MOONX_COIN_TELEGRAM_CHAT_IDS=-1001234567890
```

**Single Chat ID as JSON:**
```env
MOONX_COIN_TELEGRAM_CHAT_IDS='"-1001234567890"'
```

## Supported Networks

The notification system supports block explorer links for the following networks:

| Network | Chain ID | Explorer | 
|---------|----------|----------|
| Ethereum Mainnet | 1 | Etherscan |
| Binance Smart Chain | 56 | BscScan |
| Polygon | 137 | PolygonScan |
| Base | 8453 | BaseScan |
| Arbitrum One | 42161 | Arbiscan |
| Optimism | 10 | Optimistic Etherscan |
| Avalanche C-Chain | 43114 | Snowtrace |
| Fantom | 250 | FTMScan |

**Testnets:**
- Goerli (5), Sepolia (11155111), Base Goerli (84531)

## ENS Resolution

The system automatically resolves creator addresses to ENS names using the following priority:

1. **Base ENS** (preferred): `creator.base.eth`
2. **Ethereum ENS** (fallback): `creator.eth`
3. **Shortened Address** (no ENS): `0xabcd...ef12`

**Technical Details:**
- **Async ENS Setup**: RPC connections for ENS resolution are created asynchronously in background tasks
- **Non-blocking**: ENS resolver setup doesn't block the main indexing flow
- **Simple Connection**: RPC connections are created without testing - lightweight and fast
- **Configurable RPCs**: Use custom RPC URLs via environment variables
- **Timeout Protection**: RPC connections have configurable timeouts
- **Graceful Fallback**: Service starts normally even if ENS setup fails
- **Runtime Updates**: ENS resolver is added to existing notifier when ready
- **Error Resilience**: Failed ENS resolutions fallback gracefully to address display
- **Per-notification**: ENS names are resolved dynamically (not persistently cached)

## Security Notes

- Keep your bot token secure and never commit it to version control
- Use environment variables for sensitive configuration
- Consider using a dedicated channel/group for notifications
- Bot tokens should be rotated regularly for security
- ENS resolution uses public RPC endpoints - consider rate limits for high volume
