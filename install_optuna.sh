#!/bin/bash

# Install Python Optuna in the backtesting container
echo "🐍 Installing Python Optuna support in backtesting container..."

# Install Python and dependencies in the running container
docker exec trading_backtest apk add --no-cache python3 py3-pip python3-dev

# Install Python optimization libraries
docker exec trading_backtest pip3 install optuna==3.6.1 requests==2.31.0 pandas==2.0.3 numpy==1.24.3

# Copy Python optimizer to container
docker cp /Users/demierminor/Desktop/trade-whisperer-89/docker/backtesting-server/python_optuna/ trading_backtest:/app/

# Make Python script executable
docker exec trading_backtest chmod +x /app/python_optuna/optuna_optimizer.py

# Test Python installation
echo "🧪 Testing Python Optuna installation..."
docker exec trading_backtest python3 -c "import optuna; print(f'✅ Optuna {optuna.__version__} installed successfully')"

echo "✅ Python Optuna setup complete!"
echo ""
echo "🚀 Now you can run REAL Optuna optimization:"
echo "curl -X POST http://localhost:3002/api/optimize/optuna \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"maxTrials\": 50, \"startDate\": \"2024-09-01\", \"endDate\": \"2024-10-25\", \"symbol\": \"SPY\"}'"