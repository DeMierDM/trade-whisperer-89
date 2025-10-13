import { useState, useCallback } from "react";
import { ChartBar, formatTimeET, formatDateET } from "@/lib/timeUtils";

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

interface OptionsByDTERequest {
  ticker: string; // e.g., "AAPL", "SPY"
  expiryDate: string; // YYMMDD format, e.g., "241220"
  startDate: string;
  endDate: string;
  timeframe: '1min' | '5min' | '15min' | '1hour' | '1day';
  strikeRange?: number; // Number of strikes above/below ATM (default: 10)
  strikeSpacing?: number; // Dollar spacing between strikes (default: 5)
  limit?: number;
}

interface UnderlyingAnalysis {
  ticker: string;
  price_range: {
    min: number;
    max: number;
    average: number;
  };
  center_strike: number;
  strike_spacing: number;
}

interface SymbolGeneration {
  total_generated: number;
  symbols_with_data: number;
  generated_symbols: string[];
}

interface OptionsByDTEResponse {
  bars: Record<string, OptionsBar[]>;
  underlying_analysis: UnderlyingAnalysis;
  symbol_generation: SymbolGeneration;
  totalSymbolsGenerated: number;
  symbolsWithData: number;
  totalBars: number;
  dateRange: {
    start: string;
    end: string;
  };
  timeframe: string;
  ticker: string;
  expiryDate: string;
}

export const useOptionsByDTE = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<OptionsByDTEResponse | null>(null);

  const fetchOptionsByDTE = useCallback(async (request: OptionsByDTERequest): Promise<OptionsByDTEResponse | null> => {
    setLoading(true);
    setError(null);
    
    console.log('[OPTIONS BY DTE] Fetching options data:', request);

    try {
      // Convert dates to proper ISO format for API request
      const startISO = new Date(request.startDate + 'T09:30:00.000Z').toISOString();
      const endISO = new Date(request.endDate + 'T20:00:00.000Z').toISOString();

      // Validate expiry date format (YYMMDD)
      if (!/^\d{6}$/.test(request.expiryDate)) {
        throw new Error('Expiry date must be in YYMMDD format (e.g., 241220 for Dec 20, 2024)');
      }

      // Validate ticker format
      if (!/^[A-Z]{1,5}$/.test(request.ticker)) {
        throw new Error('Ticker must be 1-5 uppercase letters (e.g., AAPL, SPY)');
      }

      const response = await fetch('http://localhost:3001/api/fetch-market-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataType: 'options_bars_by_dte',
          ticker: request.ticker,
          expiryDate: request.expiryDate,
          start: startISO,
          end: endISO,
          timeframe: request.timeframe,
          strikeRange: request.strikeRange || 10,
          strikeSpacing: request.strikeSpacing || 5,
          limit: request.limit || 1000
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const apiData = await response.json();
      console.log('[OPTIONS BY DTE] Received response:', apiData);

      if (apiData.data && apiData.metadata) {
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

        const result: OptionsByDTEResponse = {
          bars: processedBars,
          underlying_analysis: apiData.data.underlying_analysis,
          symbol_generation: apiData.data.symbol_generation,
          totalSymbolsGenerated: apiData.metadata.total_symbols_generated,
          symbolsWithData: apiData.metadata.symbols_with_data,
          totalBars: apiData.metadata.total_bars,
          dateRange: {
            start: request.startDate,
            end: request.endDate
          },
          timeframe: request.timeframe,
          ticker: request.ticker,
          expiryDate: request.expiryDate
        };

        setData(result);
        console.log('[OPTIONS BY DTE] ✅ Processed', result.totalBars, 'bars for', result.symbolsWithData, 'option symbols');
        
        return result;
      } else {
        throw new Error('No options data received from API');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch options data by DTE';
      console.error('[OPTIONS BY DTE] Error:', errorMessage);
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

  // Helper function to get calls vs puts
  const getCalls = useCallback((): string[] => {
    return getSymbols().filter(symbol => symbol.includes('C'));
  }, [getSymbols]);

  const getPuts = useCallback((): string[] => {
    return getSymbols().filter(symbol => symbol.includes('P'));
  }, [getSymbols]);

  // Helper function to parse strike from symbol
  const getStrike = useCallback((symbol: string): number => {
    const match = symbol.match(/[CP](\d{8})$/);
    if (match) {
      return parseInt(match[1]) / 100; // Convert 00015000 to 150.00
    }
    return 0;
  }, []);

  return {
    loading,
    error,
    data,
    fetchOptionsByDTE,
    clearData,
    getSymbolData,
    getSymbols,
    getCalls,
    getPuts,
    getStrike
  };
};