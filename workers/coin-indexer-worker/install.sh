#!/bin/bash

# MoonX Coin Indexer Worker - Installation Script
# This script handles common installation issues automatically

echo "🚀 Installing MoonX Coin Indexer Worker..."

# Check Python version
PYTHON_VERSION=$(python3 --version 2>/dev/null | awk '{print $2}' | cut -d. -f1,2)
if [[ -z "$PYTHON_VERSION" ]]; then
    echo "❌ Python 3 not found. Please install Python 3.8 or higher."
    exit 1
fi

echo "✅ Python version: $PYTHON_VERSION"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "⬆️ Upgrading pip..."
pip install --upgrade pip

# Try installing requirements in order of preference
echo "📋 Installing dependencies..."

if pip install -r requirements.txt; then
    echo "✅ Successfully installed from requirements.txt"
elif pip install -r requirements-stable.txt; then
    echo "✅ Successfully installed from requirements-stable.txt"
elif pip install -r requirements-minimal.txt; then
    echo "✅ Successfully installed from requirements-minimal.txt"
else
    echo "❌ Failed to install dependencies. Please check the error messages above."
    echo "💡 Try running manually:"
    echo "   pip install --upgrade pip"
    echo "   pip install -r requirements-minimal.txt"
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp environment.example .env
    echo "✅ Created .env file. Please edit it with your configuration:"
    echo "   nano .env"
else
    echo "✅ .env file already exists"
fi

echo ""
echo "🎉 Installation completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Edit configuration: nano .env"  
echo "2. Start the worker: python main.py start"
echo "3. Check status: python main.py config"
echo "4. Monitor RPC: python main.py rpc-stats"
echo ""
echo "📚 For help: python main.py --help"
