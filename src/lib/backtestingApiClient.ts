/**
 * Backtesting API Client
 * Handles communication with the dedicated backtesting server on port 3002
 */

import { ENDPOINTS, REQUEST_CONFIG, logApiCall, createApiError } from './apiConfig';

export interface BacktestRequest {
  strategy: string;
  parameters: Record<string, any>;
  symbol: string;
  startDate: string;
  endDate: string;
  timeframe?: string;
  initialCapital?: number;
}

export interface BacktestResult {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  progress?: number;
  results?: {
    totalTrades: number;
    winRate: number;
    totalReturn: number;
    sharpeRatio: number;
    maxDrawdown: number;
    profitFactor: number;
    trades: TradeResult[];
    equity: EquityPoint[];
    metrics: PerformanceMetrics;
  };
  error?: string;
}

export interface TradeResult {
  id: string;
  entryTime: string;
  exitTime: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  fees: number;
  duration: number; // minutes
  dte: number; // days to expiration
}

export interface EquityPoint {
  timestamp: string;
  equity: number;
  drawdown: number;
}

export interface PerformanceMetrics {
  totalReturn: number;
  annualizedReturn: number;
  sharpeRatio: number;
  sortino: number;
  maxDrawdown: number;
  avgDrawdown: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgTrade: number;
  totalTrades: number;
  totalFees: number;
}

export interface OptimizationRequest {
  strategy: string;
  parameterRanges: Record<string, { min: number; max: number; step: number }>;
  symbol: string;
  startDate: string;
  endDate: string;
  optimizationTarget: 'totalReturn' | 'sharpeRatio' | 'profitFactor';
  maxIterations?: number;
}

export interface OptimizationResult {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  bestParameters?: Record<string, any>;
  bestPerformance?: PerformanceMetrics;
  iterations?: OptimizationIteration[];
  error?: string;
}

export interface OptimizationIteration {
  iteration: number;
  parameters: Record<string, any>;
  performance: PerformanceMetrics;
  score: number;
}

/**
 * Enhanced fetch wrapper with retry logic and error handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: Error | null }> {
  const url = endpoint;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= REQUEST_CONFIG.RETRY_ATTEMPTS; attempt++) {
    try {
      logApiCall(url, options.method || 'GET', options.body);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_CONFIG.TIMEOUT);

      const response = await fetch(url, {
        ...options,
        headers: {
          ...REQUEST_CONFIG.DEFAULT_HEADERS,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.text();
        throw createApiError(
          errorData || `HTTP ${response.status}`,
          url,
          response.status
        );
      }

      const data = await response.json();
      return { data, error: null };

    } catch (error: any) {
      lastError = error;
      
      if (attempt === REQUEST_CONFIG.RETRY_ATTEMPTS) {
        console.error(`❌ API request failed after ${attempt} attempts:`, error);
        break;
      }

      console.warn(`⚠️ API request attempt ${attempt} failed, retrying...`);
      await new Promise(resolve => setTimeout(resolve, REQUEST_CONFIG.RETRY_DELAY * attempt));
    }
  }

  return { data: null, error: lastError };
}

/**
 * Start a new backtest
 */
export async function startBacktest(request: BacktestRequest): Promise<{ data: BacktestResult | null; error: Error | null }> {
  return apiRequest<BacktestResult>(ENDPOINTS.BACKTEST, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Get backtest status and results
 */
export async function getBacktestStatus(backtestId: string): Promise<{ data: BacktestResult | null; error: Error | null }> {
  return apiRequest<BacktestResult>(`${ENDPOINTS.BACKTEST}/${backtestId}`, {
    method: 'GET',
  });
}

/**
 * Cancel a running backtest
 */
export async function cancelBacktest(backtestId: string): Promise<{ data: { success: boolean } | null; error: Error | null }> {
  return apiRequest<{ success: boolean }>(`${ENDPOINTS.BACKTEST}/${backtestId}/cancel`, {
    method: 'POST',
  });
}

/**
 * Start strategy optimization
 */
export async function startOptimization(request: OptimizationRequest): Promise<{ data: OptimizationResult | null; error: Error | null }> {
  return apiRequest<OptimizationResult>(ENDPOINTS.OPTIMIZE, {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/**
 * Get optimization status and results
 */
export async function getOptimizationStatus(optimizationId: string): Promise<{ data: OptimizationResult | null; error: Error | null }> {
  return apiRequest<OptimizationResult>(`${ENDPOINTS.OPTIMIZE}/${optimizationId}`, {
    method: 'GET',
  });
}

/**
 * Validate strategy configuration
 */
export async function validateStrategy(strategy: string, parameters: Record<string, any>): Promise<{ data: { valid: boolean; errors: string[] } | null; error: Error | null }> {
  return apiRequest<{ valid: boolean; errors: string[] }>(ENDPOINTS.STRATEGY_VALIDATE, {
    method: 'POST',
    body: JSON.stringify({ strategy, parameters }),
  });
}

/**
 * Fetch historical data for backtesting
 */
export async function fetchHistoricalData(symbol: string, startDate: string, endDate: string, timeframe: string = '1min'): Promise<{ data: any | null; error: Error | null }> {
  const params = new URLSearchParams({
    symbol,
    startDate,
    endDate,
    timeframe,
  });

  return apiRequest<any>(`${ENDPOINTS.HISTORICAL_DATA}?${params}`, {
    method: 'GET',
  });
}

/**
 * Calculate performance metrics from trade results
 */
export async function calculatePerformanceMetrics(trades: TradeResult[]): Promise<{ data: PerformanceMetrics | null; error: Error | null }> {
  return apiRequest<PerformanceMetrics>(ENDPOINTS.PERFORMANCE_METRICS, {
    method: 'POST',
    body: JSON.stringify({ trades }),
  });
}

/**
 * Backtesting client class for managing multiple operations
 */
export class BacktestingClient {
  private activeBacktests = new Map<string, BacktestResult>();
  private activeOptimizations = new Map<string, OptimizationResult>();

  /**
   * Run a complete backtest with progress monitoring
   */
  async runBacktest(request: BacktestRequest, onProgress?: (progress: number, status: string) => void): Promise<BacktestResult> {
    const { data: initialResult, error } = await startBacktest(request);
    
    if (error || !initialResult) {
      throw error || new Error('Failed to start backtest');
    }

    this.activeBacktests.set(initialResult.id, initialResult);

    // Poll for completion
    return new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          const { data: currentResult, error: pollError } = await getBacktestStatus(initialResult.id);
          
          if (pollError) {
            clearInterval(pollInterval);
            this.activeBacktests.delete(initialResult.id);
            reject(pollError);
            return;
          }

          if (currentResult) {
            this.activeBacktests.set(initialResult.id, currentResult);
            
            if (onProgress && currentResult.progress !== undefined) {
              onProgress(currentResult.progress, currentResult.status);
            }

            if (currentResult.status === 'completed') {
              clearInterval(pollInterval);
              this.activeBacktests.delete(initialResult.id);
              resolve(currentResult);
            } else if (currentResult.status === 'failed') {
              clearInterval(pollInterval);
              this.activeBacktests.delete(initialResult.id);
              reject(new Error(currentResult.error || 'Backtest failed'));
            }
          }
        } catch (error) {
          clearInterval(pollInterval);
          this.activeBacktests.delete(initialResult.id);
          reject(error);
        }
      }, 1000); // Poll every second
    });
  }

  /**
   * Run strategy optimization with progress monitoring
   */
  async runOptimization(request: OptimizationRequest, onProgress?: (progress: number, bestParams?: Record<string, any>) => void): Promise<OptimizationResult> {
    const { data: initialResult, error } = await startOptimization(request);
    
    if (error || !initialResult) {
      throw error || new Error('Failed to start optimization');
    }

    this.activeOptimizations.set(initialResult.id, initialResult);

    // Poll for completion
    return new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        try {
          const { data: currentResult, error: pollError } = await getOptimizationStatus(initialResult.id);
          
          if (pollError) {
            clearInterval(pollInterval);
            this.activeOptimizations.delete(initialResult.id);
            reject(pollError);
            return;
          }

          if (currentResult) {
            this.activeOptimizations.set(initialResult.id, currentResult);
            
            if (onProgress && currentResult.progress !== undefined) {
              onProgress(currentResult.progress, currentResult.bestParameters);
            }

            if (currentResult.status === 'completed') {
              clearInterval(pollInterval);
              this.activeOptimizations.delete(initialResult.id);
              resolve(currentResult);
            } else if (currentResult.status === 'failed') {
              clearInterval(pollInterval);
              this.activeOptimizations.delete(initialResult.id);
              reject(new Error(currentResult.error || 'Optimization failed'));
            }
          }
        } catch (error) {
          clearInterval(pollInterval);
          this.activeOptimizations.delete(initialResult.id);
          reject(error);
        }
      }, 2000); // Poll every 2 seconds for optimization
    });
  }

  /**
   * Get all active backtests
   */
  getActiveBacktests(): BacktestResult[] {
    return Array.from(this.activeBacktests.values());
  }

  /**
   * Get all active optimizations
   */
  getActiveOptimizations(): OptimizationResult[] {
    return Array.from(this.activeOptimizations.values());
  }

  /**
   * Cancel all active operations
   */
  async cancelAll(): Promise<void> {
    const cancelPromises: Promise<any>[] = [];

    for (const backtestId of this.activeBacktests.keys()) {
      cancelPromises.push(cancelBacktest(backtestId));
    }

    await Promise.all(cancelPromises);
    
    this.activeBacktests.clear();
    this.activeOptimizations.clear();
  }
}

// Default client instance
export const backtestingClient = new BacktestingClient();