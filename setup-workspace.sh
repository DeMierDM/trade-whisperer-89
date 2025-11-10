#!/bin/bash

# 🚀 Trade Whisperer - Complete Workspace Setup Script
# This script sets up your exact trading workspace from anywhere!

echo "🚀 Setting up Trade Whisperer workspace..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if SSH key exists
if [ ! -f ~/.ssh/id_ed25519_github ]; then
    print_error "SSH key not found! Please run this setup first on your main machine."
    exit 1
fi

# Clone or update repository
if [ ! -d "trade-whisperer-89" ]; then
    print_status "Cloning Trade Whisperer repository..."
    git clone git@github.com:DeMierDM/trade-whisperer-89.git
    cd trade-whisperer-89
else
    print_status "Repository exists, updating..."
    cd trade-whisperer-89
    git pull origin clean-master
fi

# Switch to clean-master branch
print_status "Switching to clean-master branch..."
git checkout clean-master

# Check Docker installation
if ! command -v docker &> /dev/null; then
    print_error "Docker not installed! Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose not installed! Please install Docker Compose first."
    exit 1
fi

# Copy environment file
if [ ! -f .env ]; then
    print_status "Creating environment file..."
    cp .env.docker .env
fi

# Start the complete trading system
print_status "Starting Trade Whisperer system..."
docker-compose up -d

# Wait for services to start
print_status "Waiting for services to initialize..."
sleep 10

# Check service health
print_status "Checking service health..."
FRONTEND_STATUS=$(curl -s http://localhost:8080 > /dev/null && echo "✅ Running" || echo "❌ Failed")
API_STATUS=$(curl -s http://localhost:3001/health > /dev/null && echo "✅ Running" || echo "❌ Failed")
BACKTEST_STATUS=$(curl -s http://localhost:3002/health > /dev/null && echo "✅ Running" || echo "❌ Failed")

print_success "🎉 Trade Whisperer Workspace Setup Complete!"
echo ""
echo "📊 Service Status:"
echo "   Frontend (http://localhost:8080): $FRONTEND_STATUS"
echo "   API Server (http://localhost:3001): $API_STATUS"  
echo "   Backtesting (http://localhost:3002): $BACKTEST_STATUS"
echo ""
echo "🔧 Quick Commands:"
echo "   View logs: docker-compose logs -f"
echo "   Stop system: docker-compose down"
echo "   Restart: docker-compose restart"
echo ""
echo "🌐 Access URLs:"
echo "   Main App: http://localhost:8080"
echo "   Backtesting API: http://localhost:3002"
echo "   Trading API: http://localhost:3001"
echo ""
print_success "Happy Trading! 📈"