/**
 * Docker API Client - Replaces Supabase functions
 * Calls local Docker API server at http://localhost:3001
 */

// Extend Window interface for auth callbacks
declare global {
  interface Window {
    dockerAuthCallbacks?: any[];
  }
}

const DOCKER_API_URL = 'http://localhost:3001';

interface FetchMarketDataOptions {
  dataType: 'bars' | 'quote' | 'options' | 'account' | 'orders';
  symbol?: string;
  start?: string;
  end?: string;
  timeframe?: string;
  useLiveKeys?: boolean;
}

interface TestApiConnectionOptions {
  provider: 'alpaca';
  apiKey?: string;
  apiSecret?: string;
  mode?: 'paper' | 'live';
  getKeys?: boolean;
}

interface BacktestOptions {
  strategy: any;
  parameters: any;
  marketData: any;
}

interface OptimizeOptions {
  strategy: any;
  parameterRanges: any;
  marketData: any;
}

// Mock user for local development (replaces Supabase auth)
const DEFAULT_USER = {
  id: 'local-user-123',
  email: 'trader@local.dev',
  created_at: new Date().toISOString()
};

// Local storage key for mock auth state
const AUTH_STATE_KEY = 'docker-auth-state';

// Get mock auth state from localStorage
const getMockAuthState = () => {
  try {
    const stored = localStorage.getItem(AUTH_STATE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

// Set mock auth state in localStorage
const setMockAuthState = (state: any) => {
  try {
    if (state) {
      localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(AUTH_STATE_KEY);
    }
  } catch {
    // Ignore localStorage errors
  }
};

// Initialize with authenticated state for local development
const initializeDefaultAuth = () => {
  const existing = getMockAuthState();
  if (!existing) {
    const defaultState = {
      access_token: 'local-token-123',
      user: DEFAULT_USER,
      authenticated: true
    };
    setMockAuthState(defaultState);
    return defaultState;
  }
  return existing;
};

/**
 * Mock authentication for Docker API (replaces Supabase auth)
 * Automatically authenticates users for local development
 */
export const dockerAuth = {
  getUser: async () => {
    const authState = getMockAuthState() || initializeDefaultAuth();
    return {
      data: { user: authState.authenticated ? authState.user : null },
      error: null
    };
  },
  
  getSession: async () => {
    const authState = getMockAuthState() || initializeDefaultAuth();
    return {
      data: authState.authenticated ? { 
        session: {
          access_token: authState.access_token,
          user: authState.user
        }
      } : { session: null },
      error: null
    };
  },
  
  signInWithPassword: async (credentials: any) => {
    const authState = {
      access_token: 'local-token-123',
      user: DEFAULT_USER,
      authenticated: true
    };
    setMockAuthState(authState);
    
    // Trigger auth state change
    setTimeout(() => {
      if (window.dockerAuthCallbacks) {
        window.dockerAuthCallbacks.forEach((callback: any) => {
          callback('SIGNED_IN', authState);
        });
      }
    }, 0);
    
    return {
      data: { user: DEFAULT_USER },
      error: null
    };
  },
  
  signUp: async (credentials: any) => {
    const authState = {
      access_token: 'local-token-123',
      user: DEFAULT_USER,
      authenticated: true
    };
    setMockAuthState(authState);
    
    return {
      data: { user: DEFAULT_USER },
      error: null
    };
  },
  
  signOut: async () => {
    setMockAuthState(null);
    
    // Trigger auth state change
    setTimeout(() => {
      if (window.dockerAuthCallbacks) {
        window.dockerAuthCallbacks.forEach((callback: any) => {
          callback('SIGNED_OUT', null);
        });
      }
    }, 0);
    
    return {
      error: null
    };
  },
  
  onAuthStateChange: (callback: any) => {
    // Initialize callbacks array if not exists
    if (!window.dockerAuthCallbacks) {
      window.dockerAuthCallbacks = [];
    }
    
    // Add callback to global array
    window.dockerAuthCallbacks.push(callback);
    
    // Immediately call with current auth state
    const authState = getMockAuthState() || initializeDefaultAuth();
    setTimeout(() => {
      callback(authState.authenticated ? 'SIGNED_IN' : 'SIGNED_OUT', 
               authState.authenticated ? authState : null);
    }, 0);
    
    // Return unsubscribe function
    return {
      data: { 
        subscription: { 
          unsubscribe: () => {
            if (window.dockerAuthCallbacks) {
              const index = window.dockerAuthCallbacks.indexOf(callback);
              if (index > -1) {
                window.dockerAuthCallbacks.splice(index, 1);
              }
            }
          } 
        } 
      }
    };
  }
};

export async function fetchMarketData(options: FetchMarketDataOptions) {
  try {
    console.log('[DOCKER API] Fetching market data:', options);

    const response = await fetch(`${DOCKER_API_URL}/api/fetch-market-data`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        data: null,
        error: new Error(errorData.error || `HTTP ${response.status}`)
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    console.error('[DOCKER API] Error:', error);
    return {
      data: null,
      error: new Error(error.message || 'Failed to connect to Docker API')
    };
  }
}

export async function testApiConnection(options: TestApiConnectionOptions) {
  try {
    console.log('[DOCKER API] Testing API connection:', options);

    const response = await fetch(`${DOCKER_API_URL}/api/test-connection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return {
        data: null,
        error: new Error(errorData.error || `HTTP ${response.status}`)
      };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (error: any) {
    console.error('[DOCKER API] Error:', error);
    return {
      data: null,
      error: new Error(error.message || 'Failed to connect to Docker API')
    };
  }
}

export async function runBacktest(options: BacktestOptions) {
  // Mock backtesting for now
  console.log('[DOCKER API] Backtesting not yet implemented, returning mock data');
  await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate processing
  
  return {
    data: {
      id: 'backtest-' + Date.now(),
      status: 'completed',
      results: {
        totalReturn: 0.15,
        sharpeRatio: 1.2,
        maxDrawdown: -0.08,
        winRate: 0.65
      }
    },
    error: null
  };
}

export async function optimizeStrategy(options: OptimizeOptions) {
  // Mock optimization for now
  console.log('[DOCKER API] Strategy optimization not yet implemented, returning mock data');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate processing
  
  return {
    data: {
      id: 'optimize-' + Date.now(),
      status: 'completed',
      bestParameters: {
        param1: 10,
        param2: 0.5
      },
      performance: {
        totalReturn: 0.22,
        sharpeRatio: 1.5
      }
    },
    error: null
  };
}

/**
 * Docker client that mimics Supabase interface
 */
export const dockerClient = {
  auth: dockerAuth,
  
  functions: {
    invoke: async (functionName: string, options: any) => {
      switch (functionName) {
        case 'fetch-market-data':
          return await fetchMarketData(options.body);
        case 'test-api-connection':
          return await testApiConnection(options.body);
        case 'options-backtester':
          return await runBacktest(options.body);
        case 'strategy-optimizer':
          return await optimizeStrategy(options.body);
        default:
          console.warn(`[DOCKER API] Unknown function: ${functionName}`);
          return {
            data: null,
            error: new Error(`Function ${functionName} not implemented`)
          };
      }
    }
  },
  
  // Mock database operations for compatibility
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        single: async () => ({ data: null, error: new Error('Database operations moved to Docker API') })
      })
    }),
    insert: () => ({ error: new Error('Database operations moved to Docker API') }),
    update: () => ({ error: new Error('Database operations moved to Docker API') }),
    delete: () => ({ error: new Error('Database operations moved to Docker API') })
  }),
  
  rpc: async () => ({ data: null, error: new Error('RPC functions moved to Docker API') })
};