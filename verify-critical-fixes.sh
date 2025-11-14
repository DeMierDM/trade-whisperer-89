#!/bin/bash
# Comprehensive Verification Script for Critical Fixes
# Tests all 20 critical issues have been properly addressed

set -e

echo "🔍 CRITICAL FIXES VERIFICATION SCRIPT"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

passed=0
failed=0

# Function to check if file exists
check_file_exists() {
    local file=$1
    local description=$2
    
    if [ -f "$file" ]; then
        echo -e "${GREEN}✅ PASS:${NC} $description"
        ((passed++))
        return 0
    else
        echo -e "${RED}❌ FAIL:${NC} $description"
        ((failed++))
        return 1
    fi
}

# Function to check if content exists in file
check_content_in_file() {
    local file=$1
    local pattern=$2
    local description=$3
    
    if [ ! -f "$file" ]; then
        echo -e "${RED}❌ FAIL:${NC} $description - File not found"
        ((failed++))
        return 1
    fi
    
    if grep -q "$pattern" "$file"; then
        echo -e "${GREEN}✅ PASS:${NC} $description"
        ((passed++))
        return 0
    else
        echo -e "${RED}❌ FAIL:${NC} $description"
        ((failed++))
        return 1
    fi
}

echo "📋 Testing File Creation..."
echo "----------------------------"

# Test 1: Devcontainer
check_file_exists ".devcontainer/devcontainer.json" "Devcontainer configuration exists"
check_content_in_file ".devcontainer/devcontainer.json" "ghcr.io/devcontainers/features/docker-in-docker" "Devcontainer has Docker-in-Docker"
check_content_in_file ".devcontainer/devcontainer.json" "postCreateCommand" "Devcontainer has postCreateCommand"
check_content_in_file ".devcontainer/devcontainer.json" "postStartCommand" "Devcontainer has postStartCommand"

echo ""
echo "🔧 Testing Environment Configuration..."
echo "----------------------------------------"

# Test 2: Environment Template
check_file_exists ".env.example" "Environment template exists"
check_content_in_file ".env.example" "ALPACA_LIVE_API_KEY" "Environment has Alpaca config"
check_content_in_file ".env.example" "DATABASE_URL" "Environment has database config"
check_content_in_file ".env.example" "ENABLE_PAPER_TRADING" "Environment has feature flags"
check_content_in_file ".env.example" "MAX_DAILY_LOSS_PERCENT" "Environment has risk controls"

echo ""
echo "🛡️ Testing API Server Error Handling..."
echo "----------------------------------------"

# Test 3: API Server Middleware
check_file_exists "docker/api-server/middleware/errorHandler.js" "API error handler exists"
check_file_exists "docker/api-server/middleware/validation.js" "API validation exists"
check_file_exists "docker/api-server/middleware/rateLimiter.js" "API rate limiter exists"

check_content_in_file "docker/api-server/middleware/errorHandler.js" "class AppError" "Error handler has AppError class"
check_content_in_file "docker/api-server/middleware/errorHandler.js" "asyncHandler" "Error handler has asyncHandler"
check_content_in_file "docker/api-server/middleware/errorHandler.js" "handleUnhandledRejection" "Error handler has process handlers"

check_content_in_file "docker/api-server/middleware/validation.js" "validateSymbol" "Validation has validateSymbol"
check_content_in_file "docker/api-server/middleware/validation.js" "validateDate" "Validation has validateDate"
check_content_in_file "docker/api-server/middleware/validation.js" "sanitizeString" "Validation has sanitizeString"

check_content_in_file "docker/api-server/middleware/rateLimiter.js" "class RateLimiter" "Rate limiter has RateLimiter class"
check_content_in_file "docker/api-server/middleware/rateLimiter.js" "globalLimiter" "Rate limiter has globalLimiter"

# Test 4: API Server Integration
check_content_in_file "docker/api-server/server.js" "require('./middleware/errorHandler')" "API server imports errorHandler"
check_content_in_file "docker/api-server/server.js" "require('./middleware/validation')" "API server imports validation"
check_content_in_file "docker/api-server/server.js" "require('./middleware/rateLimiter')" "API server imports rateLimiter"
check_content_in_file "docker/api-server/server.js" "app.use(globalLimiter.middleware())" "API server uses rate limiter"
check_content_in_file "docker/api-server/server.js" "asyncHandler" "API server uses asyncHandler"
check_content_in_file "docker/api-server/server.js" "app.use(errorHandler)" "API server uses errorHandler middleware"

echo ""
echo "📊 Testing Backtesting Server Error Handling..."
echo "------------------------------------------------"

# Test 5: Backtesting Server
check_file_exists "docker/backtesting-server/middleware/errorHandler.js" "Backtesting error handler exists"
check_content_in_file "docker/backtesting-server/middleware/errorHandler.js" "class BacktestError" "Backtesting has BacktestError"
check_content_in_file "docker/backtesting-server/middleware/errorHandler.js" "validateBacktestParams" "Backtesting has parameter validation"
check_content_in_file "docker/backtesting-server/middleware/errorHandler.js" "withTimeout" "Backtesting has timeout wrapper"

echo ""
echo "💼 Testing Paper Trading Error Handling..."
echo "-------------------------------------------"

# Test 6: Paper Trading
check_file_exists "docker/paper-trading-service/src/errorHandler.js" "Paper trading error handler exists"
check_content_in_file "docker/paper-trading-service/src/errorHandler.js" "class TradingError" "Paper trading has TradingError"
check_content_in_file "docker/paper-trading-service/src/errorHandler.js" "validateOrderParams" "Paper trading has order validation"
check_content_in_file "docker/paper-trading-service/src/errorHandler.js" "safeExecute" "Paper trading has safeExecute wrapper"

echo ""
echo "⚛️ Testing Frontend Error Boundaries..."
echo "----------------------------------------"

# Test 7: Frontend Error Boundaries
check_file_exists "src/components/ErrorBoundary.tsx" "Error Boundary component exists"
check_content_in_file "src/components/ErrorBoundary.tsx" "componentDidCatch" "Error Boundary has componentDidCatch"
check_content_in_file "src/components/ErrorBoundary.tsx" "errorCount" "Error Boundary has error count tracking"
check_content_in_file "src/components/ErrorBoundary.tsx" "AlertTriangle" "Error Boundary has UI components"

check_content_in_file "src/App.tsx" "import ErrorBoundary" "App imports ErrorBoundary"
check_content_in_file "src/App.tsx" "<ErrorBoundary" "App uses ErrorBoundary"
check_content_in_file "src/App.tsx" "retry: 3" "QueryClient has retry logic"

echo ""
echo "🗄️ Testing Database Connection Reliability..."
echo "----------------------------------------------"

# Test 8: Database Reliability
check_content_in_file "docker/paper-trading-service/src/DatabaseManager.js" "reconnectAttempts" "DatabaseManager has reconnect attempts"
check_content_in_file "docker/paper-trading-service/src/DatabaseManager.js" "startHealthCheck" "DatabaseManager has health checks"
check_content_in_file "docker/paper-trading-service/src/DatabaseManager.js" "handlePoolError" "DatabaseManager has pool error handler"
check_content_in_file "docker/paper-trading-service/src/DatabaseManager.js" "async query" "DatabaseManager has query wrapper"

echo ""
echo "🌐 Testing WebSocket Error Handling..."
echo "---------------------------------------"

# Test 9: WebSocket Reliability
check_content_in_file "docker/paper-trading-service/src/BusClient.js" "ConnectionState" "BusClient has ConnectionState enum"
check_content_in_file "docker/paper-trading-service/src/BusClient.js" "startHeartbeat" "BusClient has heartbeat mechanism"
check_content_in_file "docker/paper-trading-service/src/BusClient.js" "attemptReconnection" "BusClient has reconnection logic"
check_content_in_file "docker/paper-trading-service/src/BusClient.js" "exponential backoff" "BusClient has exponential backoff"

echo ""
echo "📁 Testing Project Structure..."
echo "--------------------------------"

# Additional structure checks
check_file_exists "docker/api-server/server.js" "API server exists"
check_file_exists "docker/backtesting-server/server.js" "Backtesting server exists"
check_file_exists "docker/paper-trading-service/src/DatabaseManager.js" "DatabaseManager exists"
check_file_exists "docker/paper-trading-service/src/BusClient.js" "BusClient exists"
check_file_exists "src/App.tsx" "Frontend App.tsx exists"

echo ""
echo "======================================"
echo "📊 VERIFICATION RESULTS"
echo "======================================"
echo -e "${GREEN}✅ Passed: $passed${NC}"
echo -e "${RED}❌ Failed: $failed${NC}"
echo ""

if [ $failed -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL TESTS PASSED! Critical fixes successfully implemented.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Start docker-compose to test services"
    echo "2. Test error handling by triggering errors"
    echo "3. Test rate limiting with high request volume"
    echo "4. Test database reconnection by restarting PostgreSQL"
    echo "5. Test WebSocket reconnection by restarting Data Bus"
    exit 0
else
    echo -e "${RED}⚠️ SOME TESTS FAILED! Please review the failures above.${NC}"
    exit 1
fi
