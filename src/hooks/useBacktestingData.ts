import { useState, useCallback } from "react";
import { ChartBar, formatTimeET, formatDateET } from "@/lib/timeUtils";

interface BacktestDataRequest {
  symbol: string;
  startDate: string;
  endDate: string;
  timeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day';
}

interface BacktestDataResponse {
  bars: ChartBar[];
  totalBars: number;
  dateRange: {
    start: string;
    end: string;
  };
}

export const useBacktestingData = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<BacktestDataResponse | null>(null);

  const fetchHistoricalData = useCallback(async (request: BacktestDataRequest): Promise<BacktestDataResponse | null> => {
    setLoading(true);
    setError(null);
    
    console.log('[BACKTEST DATA] Fetching historical data:', request);

    try {
      // Convert dates to proper ISO format for API request
      const startISO = new Date(request.startDate + 'T09:30:00.000Z').toISOString();
      const endISO = new Date(request.endDate + 'T20:00:00.000Z').toISOString();

      const response = await fetch('http://localhost:3002/api/fetch-historical-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataType: 'bars',
          symbol: request.symbol,
          start: startISO,
          end: endISO,
          timeframe: request.timeframe
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const apiData = await response.json();
      console.log('[BACKTEST DATA] Received', apiData.data.bars?.length || 0, 'historical bars');

      if (apiData.data && apiData.data.bars && apiData.data.bars.length > 0) {
        // Convert to chart format with SECONDS timestamps
        const historicalBars: ChartBar[] = apiData.data.bars.map((bar: any) => ({
          time: formatTimeET(bar.t),
          timestamp: Math.floor(new Date(bar.t).getTime() / 1000), // SECONDS for TradingView
          date: formatDateET(bar.t),
          open: bar.o,
          high: bar.h,
          low: bar.l,
          close: bar.c,
          volume: bar.v,
        }));

        // Sort by timestamp to ensure proper order
        historicalBars.sort((a, b) => a.timestamp - b.timestamp);

        const result: BacktestDataResponse = {
          bars: historicalBars,
          totalBars: historicalBars.length,
          dateRange: {
            start: request.startDate,
            end: request.endDate
          }
        };

        setData(result);
        console.log('[BACKTEST DATA] ✅ Processed', result.totalBars, 'bars for backtesting');
        console.log('[BACKTEST DATA] State update - setting data with', result.totalBars, 'bars');
        console.log('[BACKTEST DATA] Result object:', { totalBars: result.totalBars, barsLength: result.bars.length });
        
        return result;
      } else {
        throw new Error('No historical data received from API');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch historical data';
      console.error('[BACKTEST DATA] Error:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    console.log('[BACKTEST DATA] ⚠️ clearData() called - resetting state to null');
    console.trace('[BACKTEST DATA] clearData call stack:');
    setData(null);
    setError(null);
  }, []);

  return {
    loading,
    error,
    data,
    fetchHistoricalData,
    clearData
  };
};