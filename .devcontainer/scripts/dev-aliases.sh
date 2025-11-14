#!/bin/bash

# 📊 Development Aliases for Trade Whisperer
# This script provides convenient shortcuts for Codespace development

echo "📊 Loading Trade Whisperer development aliases..."

# Navigation shortcuts
alias tw='cd /workspace'
alias engine='cd /workspace/docker/backtesting-server'
alias frontend='cd /workspace/src'
alias docs='cd /workspace && ls -la *.md'

# Service management
alias up='docker-compose up -d'
alias down='docker-compose down'
alias restart='docker-compose restart'
alias logs='docker-compose logs -f'
alias status='docker-compose ps'

# Development shortcuts
alias build='npm run build'
alias test='npm test'
alias dev='npm run dev'
alias lint='npm run lint'

# Database shortcuts
alias dbconnect='docker exec -it trade-postgres psql -U tradinguser -d trading'
alias dblogs='docker logs trade-postgres'
alias dbreset='docker-compose down && docker-compose up -d postgres'

# Backtesting shortcuts
alias backtest='cd /workspace && node docker/backtesting-server/test-backtesting.js'
alias indicators='cd /workspace && node docker/backtesting-server/test-indicators.js'
alias trades='cd /workspace && curl -s http://localhost:3005/api/backtesting/trades | jq .'

# GitHub shortcuts
alias gitpush='git add . && git commit -m "Codespace development update" && git push'
alias gitstatus='git status'
alias gitpull='git pull origin main'

# Quick system info
alias sysinfo='echo "📊 Trade Whisperer System Status:" && docker-compose ps && echo "" && df -h && echo "" && free -h'

echo "✅ Development aliases loaded! Type 'tw' to navigate to workspace."
echo "🔧 Available commands: up, down, restart, logs, status, backtest, indicators, trades"