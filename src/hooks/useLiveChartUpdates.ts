import { useRef, useCallback } from 'react';
import { ChartBar } from '@/lib/timeUtils';

/**
 * Optimized hook for live chart updates
 *
 * PERFORMANCE OPTIMIZATIONS:
 * 1. Direct chart updates via refs (bypasses React state)
 * 2. Current-minute bar caching (no array processing)
 * 3. Minimal timestamp calculations
 * 4. No React rerenders on live updates
 */

interface LiveTrade {
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
}

interface ChartUpdateAPI {
  updateBar: (bar: any) => void;
}

export const useLiveChartUpdates = (chartApiRef: React.RefObject<ChartUpdateAPI | null>) => {
  // Cache current minute bar to avoid recalculation
  const currentMinuteBarRef = useRef<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  const updateWithLiveTrade = useCallback((trade: LiveTrade) => {
    if (!chartApiRef.current) {
      console.warn('[LIVE UPDATE] Chart API not ready');
      return;
    }

    const startTime = performance.now();

    try {
      // Get current minute timestamp (in SECONDS for TradingView)
      const tradeTime = new Date(trade.timestamp).getTime();
      const minuteTimestamp = Math.floor(tradeTime / 60000) * 60; // Minutes in seconds

      const currentBar = currentMinuteBarRef.current;

      // Check if this is the same minute
      if (currentBar && currentBar.timestamp === minuteTimestamp) {
        // UPDATE existing bar (common case - fast path)
        currentBar.high = Math.max(currentBar.high, trade.price);
        currentBar.low = Math.min(currentBar.low, trade.price);
        currentBar.close = trade.price;
        currentBar.volume += trade.size;

        // Direct chart update - NO React state change
        chartApiRef.current.updateBar({
          time: minuteTimestamp,
          open: currentBar.open,
          high: currentBar.high,
          low: currentBar.low,
          close: currentBar.close,
        });

        const elapsed = performance.now() - startTime;
        console.log(`[LIVE UPDATE] ⚡ Updated bar in ${elapsed.toFixed(2)}ms - Close: $${trade.price}`);

      } else {
        // NEW minute - create new bar
        const newBar = {
          timestamp: minuteTimestamp,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volume: trade.size,
        };

        currentMinuteBarRef.current = newBar;

        // Direct chart update for new bar
        chartApiRef.current.updateBar({
          time: minuteTimestamp,
          open: newBar.open,
          high: newBar.high,
          low: newBar.low,
          close: newBar.close,
        });

        const elapsed = performance.now() - startTime;
        console.log(`[LIVE UPDATE] 🆕 New bar created in ${elapsed.toFixed(2)}ms - Time: ${new Date(minuteTimestamp * 1000).toLocaleTimeString()}`);
      }

    } catch (error) {
      console.error('[LIVE UPDATE] ❌ Error updating chart:', error);
    }
  }, [chartApiRef]);

  const reset = useCallback(() => {
    currentMinuteBarRef.current = null;
    console.log('[LIVE UPDATE] 🔄 Reset current minute bar cache');
  }, []);

  return {
    updateWithLiveTrade,
    reset,
  };
};
