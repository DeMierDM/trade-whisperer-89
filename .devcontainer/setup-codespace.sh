#!/bin/bash

# 🚀 Codespace Setup Script - Complete Trading Environment
# This script sets up your exact trading system in GitHub Codespaces

set -e

echo "🚀 Setting up Trade Whisperer in Codespaces..."

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[CODESPACE]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Change to workspace directory
cd /workspace

# Set up Git configuration for Codespaces
print_status "Configuring Git for Codespaces..."
git config --global init.defaultBranch main
git config --global pull.rebase false
git config --global core.autocrlf input

# Ensure we're on the right branch
if [ -d ".git" ]; then
    git checkout clean-master 2>/dev/null || print_warning "Already on correct branch or branch doesn't exist"
fi

# Install Node.js dependencies
print_status "Installing Node.js dependencies..."
if [ -f "package.json" ]; then
    npm install
    print_success "Frontend dependencies installed"
else
    print_warning "No package.json found in root"
fi

# Install dependencies for all services
print_status "Installing service dependencies..."
services=("docker/api-server" "docker/backtesting-server" "docker/options-data-service" "docker/data-bus-manager" "docker/paper-trading-service")

for service in "${services[@]}"; do
    if [ -d "$service" ] && [ -f "$service/package.json" ]; then
        print_status "Installing dependencies for $service..."
        (cd "$service" && npm install)
        print_success "$service dependencies installed"
    fi
done

# Set up environment files
print_status "Setting up environment configuration..."
if [ ! -f ".env" ]; then
    if [ -f ".env.docker" ]; then
        cp .env.docker .env
        print_success "Environment file created from .env.docker"
    else
        cat > .env << 'EOF'
# Codespace Environment Configuration
NODE_ENV=development
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3004
VITE_BACKTEST_URL=http://localhost:3002
VITE_OPTIONS_URL=http://localhost:3003
VITE_PAPER_TRADING_URL=http://localhost:3005

# Database Configuration
DATABASE_URL=postgresql://trader:trader_pass_2024@localhost:5433/trading_system
REDIS_URL=redis://localhost:6379

# Development Mode
CODESPACE_MODE=true
EOF
        print_success "Default environment file created"
    fi
fi

# Create Codespace-specific scripts directory
mkdir -p .devcontainer/scripts

# Create a start services script
cat > .devcontainer/scripts/start-all.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting all Trading services in Codespace..."

# Start databases first
docker-compose -f .devcontainer/docker-compose.devcontainer.yml up -d postgres-dev redis-dev

# Wait for databases
sleep 10

# Start main services
docker-compose up -d --build

echo "✅ All services started!"
echo ""
echo "🌐 Access URLs:"
echo "   Frontend: http://localhost:8080"
echo "   API: http://localhost:3001"
echo "   Backtesting: http://localhost:3002"
echo "   Options Data: http://localhost:3003"
echo "   Data Bus: http://localhost:3004"
echo "   Paper Trading: http://localhost:3005"
EOF

chmod +x .devcontainer/scripts/start-all.sh

# Create stop services script
cat > .devcontainer/scripts/stop-all.sh << 'EOF'
#!/bin/bash
echo "🛑 Stopping all Trading services..."
docker-compose down
docker-compose -f .devcontainer/docker-compose.devcontainer.yml down
echo "✅ All services stopped!"
EOF

chmod +x .devcontainer/scripts/stop-all.sh

# Create development aliases
cat > .devcontainer/scripts/dev-aliases.sh << 'EOF'
#!/bin/bash
# Development aliases for Trade Whisperer

alias start-all='/workspace/.devcontainer/scripts/start-all.sh'
alias stop-all='/workspace/.devcontainer/scripts/stop-all.sh'
alias logs='docker-compose logs -f'
alias ps='docker-compose ps'
alias restart='docker-compose restart'
alias rebuild='docker-compose up -d --build'

# Quick navigation
alias backend='cd /workspace/docker'
alias frontend='cd /workspace'
alias strategies='cd /workspace/docker/backtesting-server/strategies'

# Quick commands
alias test-frontend='npm test'
alias build-frontend='npm run build'
alias dev-frontend='npm run dev'

echo "✅ Trade Whisperer development aliases loaded!"
echo "Available commands:"
echo "  start-all    - Start all services"
echo "  stop-all     - Stop all services" 
echo "  logs         - View service logs"
echo "  ps           - View service status"
echo "  restart      - Restart services"
echo "  rebuild      - Rebuild and start services"
EOF

# Add aliases to bashrc
echo "source /workspace/.devcontainer/scripts/dev-aliases.sh" >> ~/.bashrc

# Set up SSH for Git operations (if not already configured)
print_status "Configuring SSH for GitHub..."
if [ ! -d "$HOME/.ssh" ]; then
    mkdir -p "$HOME/.ssh"
    chmod 700 "$HOME/.ssh"
fi

# Create SSH config for GitHub
if [ ! -f "$HOME/.ssh/config" ]; then
    cat > "$HOME/.ssh/config" << 'EOF'
Host github.com
    HostName github.com
    User git
    AddKeysToAgent yes
    UseKeychain yes
EOF
    chmod 600 "$HOME/.ssh/config"
fi

# Create a script to sync changes back to local
cat > .devcontainer/scripts/sync-to-local.sh << 'EOF'
#!/bin/bash
echo "🔄 Syncing Codespace changes back to repository..."
echo "Note: Changes are automatically synced via Git. Use 'git push' to update your main repository."
echo ""
echo "To pull these changes to your local machine:"
echo "  git pull origin clean-master"
EOF

chmod +x .devcontainer/scripts/sync-to-local.sh

print_success "🎉 Codespace setup complete!"
print_status "To start the trading system, run: start-all"
print_status "For help, see /workspace/.devcontainer/scripts/"

# Show next steps
echo ""
echo "🚀 Next Steps:"
echo "1. Run 'start-all' to start all trading services"
echo "2. Wait for services to start (about 30-60 seconds)"
echo "3. Open http://localhost:8080 to access the trading dashboard"
echo "4. Use 'logs' to monitor service output"
echo ""
echo "💡 Pro Tips:"
echo "- All your local aliases and commands work here"
echo "- Changes auto-sync via Git"
echo "- Use 'sync-to-local.sh' for sync help"
echo "- Docker services run in the background"