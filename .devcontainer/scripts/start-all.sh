#!/bin/bash

# 🚀 Start All Trade Whisperer Services
# This script starts all trading services in the correct order

set -e

echo "🚀 Starting Trade Whisperer services..."

# Navigate to workspace
cd /workspace

# Start infrastructure services first (PostgreSQL, Redis)
echo "📊 Starting infrastructure services..."
docker-compose up -d postgres redis

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker exec trade-postgres pg_isready -U tradinguser -d trading; do
    sleep 2
done

# Start application services
echo "🔧 Starting application services..."
docker-compose up -d backtesting-server data-service

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Start frontend (if in development mode)
if [ "$NODE_ENV" = "development" ]; then
    echo "🖥️  Starting frontend in development mode..."
    cd /workspace && npm install && npm run dev &
else
    echo "🖥️  Starting frontend in production mode..."
    docker-compose up -d frontend
fi

# Health check
echo "🩺 Performing health checks..."
echo "PostgreSQL: $(docker exec trade-postgres pg_isready -U tradinguser -d trading)"
echo "Backtesting Server: $(curl -s http://localhost:3005/api/health || echo 'Not ready')"
echo "Data Service: $(curl -s http://localhost:3001/api/health || echo 'Not ready')"

echo ""
echo "🎉 Trade Whisperer is ready!"
echo "📊 Frontend: http://localhost:8080"
echo "🔧 Backtesting API: http://localhost:3005"
echo "📈 Data Service: http://localhost:3001"
echo "🗄️  Database: localhost:5432"
echo ""
echo "Run 'docker-compose ps' to check service status"