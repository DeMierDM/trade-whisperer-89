# 🚀 GitHub Codespaces Setup Guide
## Trade Whisperer - 0DTE Options Trading System

### Overview
This guide details the complete GitHub Codespaces setup for the Trade Whisperer system, providing a cloud-based development environment that matches your local setup exactly.

## 📋 Prerequisites

### 1. GitHub Account Setup
```bash
# Ensure you have a GitHub account with Codespaces enabled
# Your account shows: "Hi DeMierDM! You've successfully authenticated"
```

### 2. Environment Variables
Set these in your GitHub repository secrets for Codespaces:
```bash
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_SECRET_KEY=your_alpaca_secret_key
ALPACA_BASE_URL=https://paper-api.alpaca.markets  # Default for paper trading
```

## 🛠️ Codespace Configuration

### Architecture Overview
```
.devcontainer/
├── devcontainer.json          # Main configuration
├── docker-compose.devcontainer.yml  # Lightweight services
├── Dockerfile.devcontainer    # Development container
├── setup-codespace.sh         # Initial setup script
├── start-services.sh          # Service startup script
└── scripts/
    ├── dev-aliases.sh         # Development shortcuts
    └── start-all.sh           # Complete service startup
```

### Key Features
- **Full Development Environment**: Node.js 18, Docker, Git, GitHub CLI
- **Pre-configured VS Code**: 20+ trading-specific extensions
- **Automatic Service Startup**: All trading services start automatically
- **Bidirectional Sync**: Changes sync between Codespaces and local repository
- **Performance Optimized**: Lightweight services for cloud environment

## 🚀 Quick Start

### 1. Open Codespace
```bash
# Method 1: From GitHub Repository
1. Go to https://github.com/DeMierDM/trade-whisperer-89
2. Click "Code" button
3. Select "Codespaces" tab
4. Click "Create codespace on main"

# Method 2: From VS Code
1. Install "GitHub Codespaces" extension
2. Open Command Palette (Cmd+Shift+P)
3. Type "Codespaces: Create New Codespace"
4. Select this repository
```

### 2. Automatic Setup
The Codespace will automatically:
```bash
✅ Install all dependencies
✅ Setup development environment
✅ Start PostgreSQL and Redis
✅ Launch backtesting server
✅ Configure development aliases
✅ Open browser to http://localhost:8080
```

### 3. Development Commands
Once setup is complete, use these shortcuts:
```bash
# Navigation
tw              # Navigate to workspace
engine          # Go to backtesting engine
frontend        # Go to frontend code

# Service management
up              # Start all services
down            # Stop all services
restart         # Restart services
logs            # View service logs
status          # Check service status

# Development
build           # Build the application
test            # Run tests
dev             # Start development server
lint            # Lint code

# Database
dbconnect       # Connect to PostgreSQL
dbreset         # Reset database

# Trading shortcuts
backtest        # Run backtesting test
indicators      # Test indicator calculations
trades          # View recent trades
```

## 🔧 Service Architecture

### Development Services
```yaml
# Lightweight services optimized for Codespaces
services:
  devcontainer:   # Main development container
  postgres:       # PostgreSQL database
  redis:          # Redis cache
  
# Production services (started separately)
  backtesting-server:  # Trading engine
  data-service:        # Market data
  frontend:            # React application
```

### Port Mapping
```
3000  - Frontend (Vite Dev Server)
3001  - Data Service API
3005  - Backtesting Server API
5432  - PostgreSQL Database
6379  - Redis Cache
8080  - Frontend (Production)
5173  - Vite Dev Server (Alternative)
```

## 📊 Development Workflow

### 1. Code Changes
```bash
# All changes are automatically synced bidirectionally
# Edit files in Codespaces → synced to GitHub → available locally
# Edit files locally → push to GitHub → available in Codespaces
```

### 2. Testing Strategies
```bash
# Run unit tests
npm test

# Test indicators
indicators

# Run backtesting
backtest

# Full system test
curl http://localhost:3005/api/health
curl http://localhost:3001/api/health
```

### 3. Database Operations
```bash
# Connect to database
dbconnect

# Check database status
\dt

# Run queries
SELECT * FROM backtesting_configs LIMIT 5;
```

## 🔍 Troubleshooting

### Common Issues

#### 1. Services Not Starting
```bash
# Check service status
status

# Restart all services
down && up

# Check logs
logs

# Manual startup
/workspace/.devcontainer/scripts/start-all.sh
```

#### 2. Database Connection Issues
```bash
# Check PostgreSQL status
docker exec trade-postgres pg_isready -U tradinguser -d trading

# Reset database
dbreset

# Check database logs
docker logs trade-postgres
```

#### 3. Frontend Not Loading
```bash
# Check if frontend is running
curl http://localhost:8080

# Start frontend manually
cd /workspace && npm run dev

# Check for port conflicts
netstat -tulpn | grep :8080
```

#### 4. Environment Variables Missing
```bash
# Check environment variables
env | grep ALPACA

# Verify in GitHub settings:
# Repository → Settings → Secrets and variables → Codespaces
```

### Performance Optimization

#### 1. Memory Management
```bash
# Check memory usage
free -h

# Check Docker memory
docker stats

# Optimize if needed
docker system prune -f
```

#### 2. Disk Space
```bash
# Check disk usage
df -h

# Clean up Docker
docker system prune -a -f

# Clean npm cache
npm cache clean --force
```

## 🔐 Security Considerations

### 1. API Keys
- Never commit API keys to repository
- Use GitHub Codespaces secrets
- Keys are automatically injected into environment

### 2. Database Security
- Database only accessible within Codespace
- No external network access
- Temporary credentials for development

### 3. Network Security
- All services run in isolated containers
- Only necessary ports are forwarded
- SSL/TLS for all external connections

## 🔄 Sync and Backup

### 1. Code Synchronization
```bash
# Manual sync (automatic by default)
git add . && git commit -m "Codespace development update" && git push

# Quick alias
gitpush
```

### 2. Database Backup
```bash
# Export database
pg_dump -h localhost -U tradinguser -d trading > backup.sql

# Import to local
# (Run from local machine)
psql -h localhost -U tradinguser -d trading < backup.sql
```

## 📈 Performance Benchmarks

### Expected Performance
```
Service Startup: < 60 seconds
Database Query: < 100ms
Indicator Calculation: < 50ms
Backtest Execution: < 5 seconds (1000 trades)
Frontend Load: < 3 seconds
```

### Monitoring Commands
```bash
# System performance
sysinfo

# Service health
curl http://localhost:3005/api/health
curl http://localhost:3001/api/health

# Database performance
dbconnect
\timing
SELECT COUNT(*) FROM backtesting_results;
```

## 🎯 Success Criteria

### ✅ Codespace is Ready When:
- [ ] All services show "healthy" status
- [ ] Frontend loads at http://localhost:8080
- [ ] Database connection successful
- [ ] Backtesting API responds
- [ ] All development aliases work
- [ ] GitHub sync is bidirectional
- [ ] Environment variables are loaded

### 🚨 Issues to Escalate:
- Services fail to start after 5 minutes
- Database connection timeouts
- Memory usage > 90%
- API authentication failures
- Git sync failures

## 📞 Support

### Quick Diagnostics
```bash
# Run complete system check
sysinfo

# Check all service logs
logs

# Verify GitHub authentication
gh auth status

# Test trading system
backtest && echo "✅ Trading system operational"
```

### Manual Recovery
```bash
# Complete restart
down
docker system prune -f
up
/workspace/.devcontainer/scripts/start-all.sh
```

This comprehensive setup ensures your Trade Whisperer development environment is fully functional in GitHub Codespaces with seamless synchronization to your local repository.