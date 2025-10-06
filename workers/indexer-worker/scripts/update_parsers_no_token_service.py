#!/usr/bin/env python3
"""
Script to update all parsers to remove token_service usage
"""

import re
from pathlib import Path

# Get project root
project_root = Path(__file__).parent.parent
parsers_dir = project_root / "services" / "parsers"

def update_parser_file(file_path: Path):
    """Update a single parser file to remove token_service usage."""
    if not file_path.exists():
        print(f"⚠️  {file_path.name} not found")
        return
    
    print(f"🔧 Updating {file_path.name}")
    
    with open(file_path, 'r') as f:
        content = f.read()
    
    original_content = content
    
    # 1. Remove token_service import from base_parser (if exists)
    content = re.sub(
        r'from \.\.token_service import TokenService\n?',
        '',
        content
    )
    
    # 2. Update constructor signature if it includes token_service
    content = re.sub(
        r'def __init__\(self, blockchain_service: BaseBlockchainService, token_service: TokenService\):',
        'def __init__(self, blockchain_service: BaseBlockchainService):',
        content
    )
    
    # 3. Remove token_service assignment in constructor
    content = re.sub(
        r'\s+self\.token_service = token_service\n',
        '',
        content
    )
    
    # 4. Replace token fetching with address-only approach
    # Pattern: Get token information + PoolInfo creation
    token_fetch_pattern = r'(\s+)# Get token information\n\s+token0 = await self\.token_service\.get_token_info\(token0_address\)\n\s+token1 = await self\.token_service\.get_token_info\(token1_address\)\n'
    content = re.sub(
        token_fetch_pattern,
        r'\1# Only use token addresses from logs (no additional fetching)\n',
        content
    )
    
    # 5. Replace PoolInfo token0=token0, token1=token1 with addresses
    content = re.sub(
        r'(\s+)token0=token0,\n(\s+)token1=token1,',
        r'\1token0_address=token0_address,\n\2token1_address=token1_address,',
        content
    )
    
    # 6. Handle single token fetching (for complex parsers like Balancer/Curve)
    content = re.sub(
        r'token_info = await self\.token_service\.get_token_info\(.*?\)',
        '# Token info removed - logs only approach',
        content
    )
    
    # 7. Remove any remaining token_service references
    content = re.sub(
        r'self\.token_service\.',
        '# Removed token_service usage - ',
        content
    )
    
    if content != original_content:
        with open(file_path, 'w') as f:
            f.write(content)
        print(f"✅ Updated {file_path.name}")
    else:
        print(f"ℹ️  {file_path.name} - no changes needed")

def main():
    """Update all parser files."""
    print("🚀 Batch updating parsers to remove token_service...")
    print("=" * 60)
    
    parser_files = [
        "aerodrome_parser.py",
        "sushiswap_parsers.py", 
        "pancakeswap_parsers.py",
        "balancer_parser.py",
        "curve_parser.py"
    ]
    
    for parser_file in parser_files:
        file_path = parsers_dir / parser_file
        update_parser_file(file_path)
    
    print("\n" + "=" * 60)
    print("✅ Batch update completed!")
    print("\n📋 Next steps:")
    print("1. Check linting errors: python -m flake8 services/parsers/")
    print("2. Test parsers: python main.py debug-blockchain --chain-id 8453")
    print("3. Run indexer: python main.py start --chain-id 8453 --debug")

if __name__ == "__main__":
    main()