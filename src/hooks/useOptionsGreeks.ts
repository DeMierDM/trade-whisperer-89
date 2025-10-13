import { useState, useEffect, useCallback } from 'react';

interface OptionsGreeks {
  [symbol: string]: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho?: number;
    impliedVolatility?: number;
    lastUpdated: string;
  };
}

interface UseOptionsGreeksReturn {
  greeks: OptionsGreeks;
  loading: boolean;
  error: string | null;
  fetchGreeks: (symbols: string[]) => Promise<void>;
  isStale: boolean;
}

export const useOptionsGreeks = (
  optionSymbols: string[] = [],
  refreshInterval: number = 5000 // 5 seconds
): UseOptionsGreeksReturn => {
  const [greeks, setGreeks] = useState<OptionsGreeks>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<number>(0);

  // Check if data is stale (older than refresh interval)
  const isStale = Date.now() - lastFetch > refreshInterval;

  const fetchGreeks = useCallback(async (symbols: string[]) => {
    if (symbols.length === 0) {
      console.log('[GREEKS] ⏸️ No symbols to fetch Greeks for');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('[GREEKS] 📊 Fetching real Greeks from Alpaca for', symbols.length, 'option symbols');
      console.log('[GREEKS] 📋 Symbols:', symbols.slice(0, 5), '...');

      // Call the Docker API endpoint that proxies to Alpaca's options snapshots API
      // This endpoint returns real Greeks data from Alpaca
      const response = await fetch("http://localhost:3001/api/fetch-market-data", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          dataType: "options_greeks", // Correct endpoint name
          symbols: symbols.slice(0, 100).join(',') // Comma-separated string (limit to 100)
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GREEKS] ❌ API error:', response.status, errorText);
        throw new Error(`Failed to fetch Greeks: ${response.status} ${errorText}`);
      }

      const result = await response.json();
      console.log('[GREEKS] 📦 Response received:', {
        hasData: !!result.data,
        snapshotCount: result.data ? Object.keys(result.data).length : 0
      });

      if (result.data) {
        // Transform Alpaca snapshots into our Greeks format
        const greeksData: OptionsGreeks = {};

        for (const [symbol, snapshot] of Object.entries(result.data)) {
          const snapshotData = snapshot as any;

          // Check if this option has Greeks data (won't be available for 0DTE)
          if (snapshotData.greeks) {
            greeksData[symbol] = {
              delta: snapshotData.greeks.delta || 0,
              gamma: snapshotData.greeks.gamma || 0,
              theta: snapshotData.greeks.theta || 0,
              vega: snapshotData.greeks.vega || 0,
              rho: snapshotData.greeks.rho || 0,
              impliedVolatility: snapshotData.impliedVolatility || 0,
              lastUpdated: new Date().toISOString()
            };
            console.log('[GREEKS] ✅ Greeks for', symbol, ':', {
              delta: greeksData[symbol].delta.toFixed(3),
              gamma: greeksData[symbol].gamma.toFixed(4),
              IV: (greeksData[symbol].impliedVolatility * 100).toFixed(1) + '%'
            });
          } else {
            console.log('[GREEKS] ⚠️ No Greeks available for', symbol, '(may be 0DTE)');
          }
        }

        setGreeks(prev => ({ ...prev, ...greeksData }));
        setLastFetch(Date.now());
        console.log('[GREEKS] ✅ Updated Greeks for', Object.keys(greeksData).length, 'of', symbols.length, 'options');
      } else {
        console.warn('[GREEKS] ⚠️ No data in response');
      }

    } catch (err: any) {
      console.error('[GREEKS] ❌ Error fetching Greeks:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch Greeks when symbols change or on interval
  useEffect(() => {
    if (optionSymbols.length > 0) {
      fetchGreeks(optionSymbols);

      const interval = setInterval(() => {
        fetchGreeks(optionSymbols);
      }, refreshInterval);

      return () => clearInterval(interval);
    }
  }, [optionSymbols, refreshInterval, fetchGreeks]);

  return {
    greeks,
    loading,
    error,
    fetchGreeks,
    isStale
  };
};

// Helper functions for estimated Greeks calculations
function extractStrikeFromSymbol(symbol: string): number {
  // Extract strike from symbol like "SPY251009C00580000"
  const match = symbol.match(/[CP](\d{8})/);
  return match ? parseInt(match[1]) / 1000 : 580; // Convert from cents to dollars
}

function estimateDelta(isCall: boolean, strike: number): number {
  // Simplified delta estimation
  // In reality, this requires current stock price, time to expiry, volatility, etc.
  const baseStrike = 580; // Assume SPY around $580
  const moneyness = strike / baseStrike;
  
  if (isCall) {
    return Math.max(0.01, Math.min(0.99, 0.5 + (baseStrike - strike) * 0.02));
  } else {
    return Math.max(-0.99, Math.min(-0.01, -0.5 + (strike - baseStrike) * 0.02));
  }
}

function estimateGamma(strike: number): number {
  // Simplified gamma estimation - highest for ATM options
  const baseStrike = 580;
  const distance = Math.abs(strike - baseStrike);
  return Math.max(0.001, 0.05 * Math.exp(-distance * 0.1));
}

function estimateTheta(): number {
  // Simplified theta estimation - always negative for long options
  return -(0.01 + Math.random() * 0.05);
}

function estimateVega(strike: number): number {
  // Simplified vega estimation
  const baseStrike = 580;
  const distance = Math.abs(strike - baseStrike);
  return Math.max(0.01, 0.3 * Math.exp(-distance * 0.05));
}

function estimateRho(isCall: boolean): number {
  // Simplified rho estimation
  return isCall ? 0.1 + Math.random() * 0.2 : -(0.1 + Math.random() * 0.2);
}