import { useState, useCallback } from "react";
import { ChartBar, formatTimeET, formatDateET } from "@/lib/timeUtils";
import { ENDPOINTS, REQUEST_CONFIG } from '../lib/apiConfig';

interface OptionsBar {
  time: string;
  timestamp: number;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  symbol: string;
}

interface OptionsDataRequest {
  symbols: string[]; // Array of option symbols like ["SPY251010C00653000", "SPY251010P00653000"]
  startDate: string;
  endDate: string;
  timeframe: '1min' | '5min' | '15min' | '1hour' | '1day';
  limit?: number;
}

interface OptionsDataResponse {
  bars: Record<string, OptionsBar[]>; // Symbol -> array of bars
  totalSymbols: number;
  totalBars: number;
  dateRange: {
    start: string;
    end: string;
  };
  timeframe: string;
}

export const useOptionsData = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OptionsDataResponse | null>(null);

  const fetchOptionsData = useCallback(async (request: OptionsDataRequest): Promise<OptionsDataResponse | null> => {
    setLoading(true);
    setError(null);
    
    console.log('[OPTIONS DATA] Fetching historical options data:', request);

    try {
      // Convert dates to proper ISO format for API request
      const startISO = new Date(request.startDate + 'T09:30:00.000Z').toISOString();
      const endISO = new Date(request.endDate + 'T20:00:00.000Z').toISOString();

      // Validate date range - options data only goes back to March 2024
      const march2024 = new Date('2024-03-01T00:00:00Z');
      const requestStart = new Date(startISO);

      if (requestStart < march2024) {
        const warningMessage = `Historical options data is only available from March 2024 onwards. Requested start date ${request.startDate} has been adjusted.`;
        console.warn('[OPTIONS DATA]', warningMessage);
      }

      const response = await fetch(ENDPOINTS.MARKET_DATA, {
        method: 'POST',
        headers: REQUEST_CONFIG.DEFAULT_HEADERS,
        body: JSON.stringify({
          dataType: 'options_bars',
          symbols: request.symbols.join(','), // Convert array to comma-separated string
          start: startISO,
          end: endISO,
          timeframe: request.timeframe,
          limit: request.limit || 1000,
          sort: 'asc'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const apiData = await response.json();
      console.log('[OPTIONS DATA] Received response:', apiData);

      if (apiData.data && apiData.data.bars) {
        const rawBars = apiData.data.bars;
        const processedBars: Record<string, OptionsBar[]> = {};

        // Process each symbol's bars
        Object.entries(rawBars).forEach(([symbol, symbolBars]) => {
          if (Array.isArray(symbolBars)) {
            processedBars[symbol] = (symbolBars as any[]).map((bar: any) => ({
              time: formatTimeET(bar.t),
              timestamp: Math.floor(new Date(bar.t).getTime() / 1000), // SECONDS for TradingView
              date: formatDateET(bar.t),
              open: bar.o,
              high: bar.h,
              low: bar.l,
              close: bar.c,
              volume: bar.v,
              symbol: symbol,
            }));

            // Sort by timestamp to ensure proper order
            processedBars[symbol].sort((a, b) => a.timestamp - b.timestamp);
          }
        });

        const result: OptionsDataResponse = {
          bars: processedBars,
          totalSymbols: Object.keys(processedBars).length,
          totalBars: Object.values(processedBars).reduce((sum, bars) => sum + bars.length, 0),
          dateRange: {
            start: request.startDate,
            end: request.endDate
          },
          timeframe: request.timeframe
        };

        setData(result);
        console.log('[OPTIONS DATA] ✅ Processed', result.totalBars, 'bars for', result.totalSymbols, 'option symbols');
        
        return result;
      } else {
        throw new Error('No options data received from API');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch options data';
      console.error('[OPTIONS DATA] Error:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clearData = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  // Helper function to get data for a specific symbol
  const getSymbolData = useCallback((symbol: string): OptionsBar[] => {
    return data?.bars[symbol] || [];
  }, [data]);

  // Helper function to get all symbols
  const getSymbols = useCallback((): string[] => {
    return data ? Object.keys(data.bars) : [];
  }, [data]);

  return {
    loading,
    error,
    data,
    fetchOptionsData,
    clearData,
    getSymbolData,
    getSymbols
  };
};