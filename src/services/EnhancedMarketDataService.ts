import { ChartBar } from '@/lib/timeUtils';

export interface MarketDataConfig {
  symbol: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '1d';
  ensureCompleteCoverage: boolean;
}

export interface MarketDataResponse {
  bars: ChartBar[];
  totalBars: number;
  dateRange: {
    startDate: string;
    endDate: string;
    tradingDaysCount: number;
  };
  coverage: {
    hasGaps: boolean;
    gapCount: number;
    lastBarTimestamp: number;
    firstBarTimestamp: number;
  };
  websocketStartpoint: {
    shouldStartWebSocket: boolean;
    startFromTimestamp: number;
    reason: string;
  };
}

/**
 * Enhanced Market Data Service with proper date calculations and WebSocket alignment
 * Ensures complete coverage from current time back to 5 trading days
 */
export class EnhancedMarketDataService {
  private static readonly TRADING_DAYS_LOOKBACK = 5;
  private static readonly MARKET_OPEN_HOUR = 9; // 9:30 AM ET
  private static readonly MARKET_CLOSE_HOUR = 16; // 4:00 PM ET

  /**
   * Calculate proper date range ensuring 5 full trading days of coverage
   */
  static calculateOptimalDateRange(): { startDate: Date; endDate: Date; tradingDaysFound: number } {
    const now = new Date();
    const endDate = new Date(now);
    
    // Set end date to current time (for live data alignment)
    console.log(`[DATA SERVICE] Current time: ${now.toISOString()}`);
    
    // Calculate start date - go back enough calendar days to ensure 5 trading days
    const startDate = new Date(now);
    
    // Go back 10 calendar days to ensure we capture 5 trading days
    // (accounts for weekends and potential holidays)
    startDate.setDate(now.getDate() - 10);
    
    // Count actual trading days in the range for validation
    let tradingDaysFound = 0;
    const tempDate = new Date(startDate);
    
    while (tempDate <= endDate) {
      const dayOfWeek = tempDate.getDay();
      // Monday = 1, Friday = 5 (exclude weekends)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        tradingDaysFound++;
      }
      tempDate.setDate(tempDate.getDate() + 1);
    }
    
    console.log(`[DATA SERVICE] 📅 Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    console.log(`[DATA SERVICE] 📊 Trading Days Found: ${tradingDaysFound}`);
    
    return {
      startDate,
      endDate, 
      tradingDaysFound
    };
  }

  /**
   * Fetch complete market data with gap detection and WebSocket alignment
   */
  static async fetchCompleteMarketData(config: MarketDataConfig): Promise<MarketDataResponse> {
    console.log(`[DATA SERVICE] 🔄 Fetching complete market data for ${config.symbol}`);
    
    const { startDate, endDate, tradingDaysFound } = this.calculateOptimalDateRange();
    
    try {
      // Primary: Try our trading-chart-data API (includes bus data + external fallback)
      const response = await fetch('/api/trading-chart-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: config.symbol,
          timeframe: config.timeframe,
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          ensureCompleteCoverage: true,
          tradingDaysRequired: this.TRADING_DAYS_LOOKBACK
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.success || !data.bars || data.bars.length === 0) {
        throw new Error(`No data returned for ${config.symbol}`);
      }

      // Analyze data coverage and gaps
      const coverage = this.analyzeCoverage(data.bars, config.timeframe, startDate, endDate);
      
      // Determine WebSocket starting point
      const websocketStartpoint = this.calculateWebSocketStartpoint(data.bars, endDate);
      
      const result: MarketDataResponse = {
        bars: data.bars,
        totalBars: data.bars.length,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          tradingDaysCount: tradingDaysFound
        },
        coverage,
        websocketStartpoint
      };

      console.log(`[DATA SERVICE] ✅ Complete data loaded:`, {
        symbol: config.symbol,
        bars: result.totalBars,
        coverage: coverage.hasGaps ? `${coverage.gapCount} gaps detected` : 'complete',
        wsStart: websocketStartpoint.reason
      });

      return result;

    } catch (error) {
      console.error(`[DATA SERVICE] ❌ Failed to fetch data for ${config.symbol}:`, error);
      
      // Fallback: Return empty result with WebSocket-only strategy
      return {
        bars: [],
        totalBars: 0,
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          tradingDaysCount: tradingDaysFound
        },
        coverage: {
          hasGaps: true,
          gapCount: 0,
          lastBarTimestamp: 0,
          firstBarTimestamp: 0
        },
        websocketStartpoint: {
          shouldStartWebSocket: true,
          startFromTimestamp: Math.floor(Date.now() / 1000),
          reason: 'Historical data unavailable - using WebSocket-only strategy'
        }
      };
    }
  }

  /**
   * Analyze data coverage for gaps and completeness
   */
  private static analyzeCoverage(
    bars: ChartBar[], 
    timeframe: string, 
    startDate: Date, 
    endDate: Date
  ): MarketDataResponse['coverage'] {
    if (bars.length === 0) {
      return {
        hasGaps: true,
        gapCount: 0,
        lastBarTimestamp: 0,
        firstBarTimestamp: 0
      };
    }

    // Sort bars by timestamp
    const sortedBars = [...bars].sort((a, b) => a.timestamp - b.timestamp);
    const firstBar = sortedBars[0];
    const lastBar = sortedBars[sortedBars.length - 1];
    
    // Calculate expected interval in seconds
    const intervalSeconds = this.getIntervalSeconds(timeframe);
    
    // Count gaps (periods longer than expected interval)
    let gapCount = 0;
    for (let i = 1; i < sortedBars.length; i++) {
      const timeDiff = sortedBars[i].timestamp - sortedBars[i-1].timestamp;
      
      // If gap is more than 2x the expected interval (allowing for market breaks)
      if (timeDiff > intervalSeconds * 2) {
        gapCount++;
      }
    }
    
    console.log(`[DATA SERVICE] 🔍 Coverage Analysis:`, {
      totalBars: bars.length,
      timeSpan: `${new Date(firstBar.timestamp * 1000).toISOString()} to ${new Date(lastBar.timestamp * 1000).toISOString()}`,
      gaps: gapCount,
      avgInterval: bars.length > 1 ? (lastBar.timestamp - firstBar.timestamp) / (bars.length - 1) : 0
    });

    return {
      hasGaps: gapCount > 0,
      gapCount,
      lastBarTimestamp: lastBar.timestamp,
      firstBarTimestamp: firstBar.timestamp
    };
  }

  /**
   * Calculate optimal WebSocket starting point based on historical data
   */
  private static calculateWebSocketStartpoint(
    bars: ChartBar[], 
    endDate: Date
  ): MarketDataResponse['websocketStartpoint'] {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    if (bars.length === 0) {
      return {
        shouldStartWebSocket: true,
        startFromTimestamp: currentTimestamp,
        reason: 'No historical data - starting WebSocket from current time'
      };
    }

    // Sort bars and get the latest
    const sortedBars = [...bars].sort((a, b) => a.timestamp - b.timestamp);
    const latestBar = sortedBars[sortedBars.length - 1];
    const latestBarTime = new Date(latestBar.timestamp * 1000);
    
    // Calculate how far behind the latest bar is from current time
    const timeBehind = currentTimestamp - latestBar.timestamp;
    const minutesBehind = timeBehind / 60;
    
    console.log(`[DATA SERVICE] 🕐 WebSocket Alignment:`, {
      latestBarTime: latestBarTime.toISOString(),
      currentTime: new Date().toISOString(),
      minutesBehind: minutesBehind.toFixed(2)
    });
    
    if (minutesBehind <= 2) {
      // Data is very recent, start WebSocket from next bar
      return {
        shouldStartWebSocket: true,
        startFromTimestamp: latestBar.timestamp + 60, // Next minute
        reason: `Historical data is recent (${minutesBehind.toFixed(1)}min behind) - continuing from last bar`
      };
    } else if (minutesBehind <= 15) {
      // Data is somewhat recent, start WebSocket from current time
      return {
        shouldStartWebSocket: true,
        startFromTimestamp: currentTimestamp,
        reason: `Historical data is ${minutesBehind.toFixed(1)}min behind - starting WebSocket from current time`
      };
    } else {
      // Data is old, recommend fetching fresh data
      return {
        shouldStartWebSocket: true,
        startFromTimestamp: currentTimestamp,
        reason: `Historical data is stale (${minutesBehind.toFixed(1)}min behind) - recommend refreshing data`
      };
    }
  }

  /**
   * Get interval in seconds for timeframe
   */
  private static getIntervalSeconds(timeframe: string): number {
    switch (timeframe) {
      case '1m': return 60;
      case '5m': return 300;
      case '15m': return 900;
      case '1h': return 3600;
      case '1d': return 86400;
      default: return 60;
    }
  }

  /**
   * Validate if market data is suitable for live trading
   */
  static validateForLiveTrading(response: MarketDataResponse): {
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check data age
    if (response.bars.length === 0) {
      issues.push('No historical data available');
      recommendations.push('Enable WebSocket-only mode for real-time data collection');
    } else {
      const latestBar = Math.max(...response.bars.map(bar => bar.timestamp));
      const minutesOld = (Date.now() / 1000 - latestBar) / 60;
      
      if (minutesOld > 30) {
        issues.push(`Data is ${minutesOld.toFixed(1)} minutes old`);
        recommendations.push('Consider refreshing data before starting live trading');
      }
    }

    // Check coverage gaps
    if (response.coverage.hasGaps && response.coverage.gapCount > 10) {
      issues.push(`Significant data gaps detected (${response.coverage.gapCount} gaps)`);
      recommendations.push('Review data quality before relying on historical indicators');
    }

    // Check minimum data requirements
    if (response.totalBars < 100) {
      issues.push('Insufficient historical data for reliable analysis');
      recommendations.push('Accumulate more data via WebSocket before trading');
    }

    return {
      isValid: issues.length === 0,
      issues,
      recommendations
    };
  }
}