/**
 * API Configuration for Trade Whisperer
 * Centralized configuration for all API endpoints and port routing
 */

// Environment-based configuration
const isDevelopment = import.meta.env.DEV;

// API Endpoints Configuration
export const API_CONFIG = {
  // Main API Server - handles market data, WebSocket, auth
  MAIN_API: {
    HOST: 'localhost',
    PORT: 3001,
    PROTOCOL: 'http',
    WS_PROTOCOL: 'ws',
    get BASE_URL() {
      return `${this.PROTOCOL}://${this.HOST}:${this.PORT}`;
    },
    get WS_URL() {
      return `${this.WS_PROTOCOL}://${this.HOST}:${this.PORT}`;
    }
  },
  
  // Backtesting Server - handles strategy backtesting and optimization
  BACKTESTING: {
    HOST: 'localhost', 
    PORT: 3002,
    PROTOCOL: 'http',
    get BASE_URL() {
      return `${this.PROTOCOL}://${this.HOST}:${this.PORT}`;
    }
  },

  // Options Data Service - dedicated options data for IWM/SPY/QQQ
  OPTIONS_DATA: {
    HOST: 'localhost',
    PORT: 3003,
    PROTOCOL: 'http',
    get BASE_URL() {
      return `${this.PROTOCOL}://${this.HOST}:${this.PORT}`;
    }
  },

  // Frontend Development Server
  FRONTEND: {
    HOST: 'localhost',
    PORT: 8080,
    PROTOCOL: 'http',
    get BASE_URL() {
      return `${this.PROTOCOL}://${this.HOST}:${this.PORT}`;
    }
  }
};

// API Endpoint Mapping
export const ENDPOINTS = {
  // Main API Server Endpoints (Port 3001)
  MARKET_DATA: `${API_CONFIG.MAIN_API.BASE_URL}/api/fetch-market-data`,
  TEST_CONNECTION: `${API_CONFIG.MAIN_API.BASE_URL}/api/test-connection`,
  RECENT_TRADES: `${API_CONFIG.MAIN_API.BASE_URL}/api/get-recent-trades`,
  API_KEYS: `${API_CONFIG.MAIN_API.BASE_URL}/api/config/api-keys`,
  ACCOUNT_INFO: `${API_CONFIG.MAIN_API.BASE_URL}/api/account`,
  
  // Configuration Endpoints (Port 3001)
  STRATEGY_DEFAULTS: `${API_CONFIG.MAIN_API.BASE_URL}/api/config/strategy-defaults`,
  RISK_CONTROLS: `${API_CONFIG.MAIN_API.BASE_URL}/api/config/risk-controls`,
  
  // WebSocket Endpoints (Port 3001)
  WEBSOCKET: `${API_CONFIG.MAIN_API.WS_URL}/ws`,
  ALPACA_WEBSOCKET: `${API_CONFIG.MAIN_API.WS_URL}/ws`,
  
  // Backtesting Server Endpoints (Port 3002) 
  BACKTEST: `${API_CONFIG.BACKTESTING.BASE_URL}/api/backtest`,
  OPTIMIZE: `${API_CONFIG.BACKTESTING.BASE_URL}/api/optimize`,
  HISTORICAL_DATA: `${API_CONFIG.BACKTESTING.BASE_URL}/api/fetch-historical-data`,
  STRATEGY_VALIDATE: `${API_CONFIG.BACKTESTING.BASE_URL}/api/validate-strategy`,
  PERFORMANCE_METRICS: `${API_CONFIG.BACKTESTING.BASE_URL}/api/performance-metrics`,

  // Options Data Service Endpoints (Port 3003)
  OPTIONS_CHAIN: (ticker: string) => `${API_CONFIG.OPTIONS_DATA.BASE_URL}/api/options/chain/${ticker}`,
  OPTIONS_BARS: (ticker: string) => `${API_CONFIG.OPTIONS_DATA.BASE_URL}/api/options/bars/${ticker}`,
  OPTIONS_QUOTES: (ticker: string) => `${API_CONFIG.OPTIONS_DATA.BASE_URL}/api/options/quotes/${ticker}`,
  OPTIONS_BULK: `${API_CONFIG.OPTIONS_DATA.BASE_URL}/api/options/bulk`,
  OPTIONS_CACHE_CLEAR: (pattern: string) => `${API_CONFIG.OPTIONS_DATA.BASE_URL}/api/cache/${pattern}`
};

// Service Health Check URLs
export const HEALTH_CHECKS = {
  MAIN_API: `${API_CONFIG.MAIN_API.BASE_URL}/health`,
  BACKTESTING: `${API_CONFIG.BACKTESTING.BASE_URL}/health`,
  OPTIONS_DATA: `${API_CONFIG.OPTIONS_DATA.BASE_URL}/health`
};

// Request Configuration
export const REQUEST_CONFIG = {
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  
  DEFAULT_HEADERS: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Client': 'trade-whisperer-frontend'
  }
};

// Environment-specific overrides
if (!isDevelopment) {
  // Production configurations would go here
  console.log('Running in production mode - using development configuration for now');
}

// Validation helper
export function validateApiConfig() {
  const checks = [
    { name: 'Main API', url: API_CONFIG.MAIN_API.BASE_URL },
    { name: 'Backtesting API', url: API_CONFIG.BACKTESTING.BASE_URL },
    { name: 'Options Data API', url: API_CONFIG.OPTIONS_DATA.BASE_URL }
  ];
  
  console.log('🔍 API Configuration Validation:');
  checks.forEach(check => {
    console.log(`   ${check.name}: ${check.url}`);
  });
  
  return checks;
}

// Service discovery helper
export async function checkServiceHealth() {
  const results = {
    mainApi: { status: 'unknown', url: HEALTH_CHECKS.MAIN_API, error: undefined as string | undefined },
    backtesting: { status: 'unknown', url: HEALTH_CHECKS.BACKTESTING, error: undefined as string | undefined },
    optionsData: { status: 'unknown', url: HEALTH_CHECKS.OPTIONS_DATA, error: undefined as string | undefined }
  };
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const mainApiResponse = await fetch(HEALTH_CHECKS.MAIN_API, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    results.mainApi.status = mainApiResponse.ok ? 'healthy' : 'unhealthy';
  } catch (error: any) {
    results.mainApi.status = 'error';
    results.mainApi.error = error.message;
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const backtestingResponse = await fetch(HEALTH_CHECKS.BACKTESTING, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    results.backtesting.status = backtestingResponse.ok ? 'healthy' : 'unhealthy';
  } catch (error: any) {
    results.backtesting.status = 'error';
    results.backtesting.error = error.message;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const optionsDataResponse = await fetch(HEALTH_CHECKS.OPTIONS_DATA, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    results.optionsData.status = optionsDataResponse.ok ? 'healthy' : 'unhealthy';
  } catch (error: any) {
    results.optionsData.status = 'error';
    results.optionsData.error = error.message;
  }
  
  return results;
}

// Logging helper for API calls
export function logApiCall(endpoint: string, method: string, data?: any) {
  if (isDevelopment) {
    console.log(`🔗 API Call: ${method} ${endpoint}`, data ? { data } : '');
  }
}

// Error handling helper
export function createApiError(message: string, endpoint: string, status?: number) {
  return new Error(`API Error [${endpoint}]${status ? ` (${status})` : ''}: ${message}`);
}

export default {
  API_CONFIG,
  ENDPOINTS,
  HEALTH_CHECKS,
  REQUEST_CONFIG,
  validateApiConfig,
  checkServiceHealth,
  logApiCall,
  createApiError
};