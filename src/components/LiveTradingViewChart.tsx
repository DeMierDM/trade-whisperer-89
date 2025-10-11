import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { ChartBar } from '@/lib/timeUtils';

interface LiveTradingViewChartProps {
  symbol: string;
  bars: ChartBar[];
  currentPrice?: number;
  height?: number;
  width?: number;
}

export interface ChartUpdateAPI {
  updateBar: (bar: any) => void;
}

export const LiveTradingViewChart = forwardRef<ChartUpdateAPI, LiveTradingViewChartProps>(({
  symbol,
  bars,
  currentPrice,
  height = 400,
  width = 800,
}, ref) => {
  const instanceId = useRef(Math.random().toString(36).substr(2, 9));
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const priceLineRef = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasChart, setHasChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);

  console.log(`[LIVE CHART ${instanceId.current}] Render with`, bars.length, 'bars, symbol:', symbol);

  // Expose update API to parent via ref (PERFORMANCE: Direct updates, no React rerenders)
  useImperativeHandle(ref, () => ({
    updateBar: (bar: any) => {
      if (!seriesRef.current) {
        console.warn('[CHART API] Series not ready for update');
        return;
      }

      try {
        // Direct TradingView update - bypasses React state
        seriesRef.current.update(bar);
        console.log('[CHART API] ⚡ Direct update:', bar.time, 'Close:', bar.close);
      } catch (err: any) {
        console.error('[CHART API] ❌ Update failed:', err.message);
      }
    },
  }), []);

  // ============================================================================
  // CHART INITIALIZATION
  // ============================================================================

  useEffect(() => {
    const initChart = async () => {
      try {
        if (!chartContainerRef.current) {
          console.log('[LIVE CHART] No container ref, skipping initialization');
          return;
        }

        // Clear any existing chart first
        if (chartRef.current) {
          console.log('[LIVE CHART] Cleaning up existing chart before creating new one');
          chartRef.current.remove();
          chartRef.current = null;
          seriesRef.current = null;
        }

        chartContainerRef.current.innerHTML = '';

        console.log(`[LIVE CHART ${instanceId.current}] Initializing chart...`);

        // Dynamic import
        const lightweightCharts = await import('lightweight-charts');
        const { createChart, ColorType } = lightweightCharts;

        const chart = createChart(chartContainerRef.current, {
          width: width,
          height: height,
          layout: {
            background: { type: ColorType.Solid, color: '#1e293b' },
            textColor: '#d1d5db',
          },
          grid: {
            vertLines: { color: '#374151' },
            horzLines: { color: '#374151' },
          },
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
          },
        });

        const candlestickSeries = chart.addCandlestickSeries({
          upColor: '#22c55e',
          downColor: '#ef4444',
          borderUpColor: '#16a34a',
          borderDownColor: '#dc2626',
          wickUpColor: '#16a34a',
          wickDownColor: '#dc2626',
        });

        chartRef.current = chart;
        seriesRef.current = candlestickSeries;
        setIsInitialized(true);
        setHasChart(true);
        setError(null);

        console.log(`[LIVE CHART ${instanceId.current}] ✅ Chart initialized successfully`);

      } catch (err: any) {
        console.error('[LIVE CHART] ❌ Initialization failed:', err);
        setError(err.message);
        setIsInitialized(false);
        setHasChart(false);
      }
    };

    initChart();

    return () => {
      console.log('[LIVE CHART] Cleanup triggered');
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
        setIsInitialized(false);
        setHasChart(false);
      }
      if (chartContainerRef.current) {
        chartContainerRef.current.innerHTML = '';
      }
    };
  }, [width, height]);

  // ============================================================================
  // HISTORICAL DATA UPDATE (ONLY ONCE for initial load)
  // ============================================================================

  useEffect(() => {
    // CRITICAL: Only load initial data ONCE, never again
    if (hasLoadedInitialData) {
      console.log('[LIVE CHART] ⏭️ Skipping - initial data already loaded');
      return;
    }

    console.log('[LIVE CHART] Historical data effect triggered:', {
      initialized: isInitialized,
      hasSeries: !!seriesRef.current,
      barsCount: bars.length,
      hasLoadedInitialData
    });

    if (!isInitialized || !seriesRef.current || bars.length === 0) {
      console.log('[LIVE CHART] ⏸️ Waiting for data/initialization');
      return;
    }

    try {
      console.log('[LIVE CHART] 🔄 Loading initial historical data:', bars.length, 'bars');

      // Simple conversion - NO DATA PROCESSING
      const chartData = bars.map((bar, index) => {
        // ChartBar.timestamp is already in SECONDS - use directly
        const timestamp = typeof bar.timestamp === 'number' ? bar.timestamp : Number(bar.timestamp);

        if (isNaN(timestamp) || timestamp <= 0) {
          console.error(`[LIVE CHART] ❌ Invalid timestamp for bar ${index}:`, bar);
          return null;
        }

        return {
          time: timestamp,
          open: Number(bar.open),
          high: Number(bar.high),
          low: Number(bar.low),
          close: Number(bar.close),
        };
      }).filter(Boolean);

      // Ensure data is sorted
      chartData.sort((a, b) => a.time - b.time);

      // Use setData ONCE for historical
      seriesRef.current.setData(chartData);

      setHasLoadedInitialData(true); // Mark as loaded - prevents re-running
      setLastUpdateTime(Date.now());
      console.log('[LIVE CHART] ✅ Initial data loaded! Live updates will use update() method.');

    } catch (err: any) {
      console.error('[LIVE CHART] ❌ Data update failed:', err);
      setError(err.message);
    }
  }, [isInitialized, bars, hasLoadedInitialData]); // Depend on bars array directly

  // ============================================================================
  // LIVE PRICE LINE (NO BAR BUILDING)
  // ============================================================================

  useEffect(() => {
    if (!isInitialized || !seriesRef.current || !currentPrice) {
      return;
    }

    try {
      // Remove existing price line if it exists
      if (priceLineRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
      }

      // Add new price line at current price
      priceLineRef.current = seriesRef.current.createPriceLine({
        price: currentPrice,
        color: '#fbbf24', // Yellow/gold color
        lineWidth: 2,
        lineStyle: 2, // Dashed line
        axisLabelVisible: true,
        title: `Live: $${currentPrice.toFixed(2)}`,
      });

      console.log('[LIVE CHART] ✅ Price line updated:', currentPrice);

    } catch (err: any) {
      console.error('[LIVE CHART] ❌ Price line update failed:', err);
    }
  }, [isInitialized, currentPrice]);

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="relative w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">{symbol}</h3>
          {currentPrice && (
            <span className="text-xl font-mono text-foreground">
              ${currentPrice.toFixed(2)}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          Real-time • {bars.length} bars • TradingView Engine
          {currentPrice && bars.length > 0 && (() => {
            const lastBar = bars[bars.length - 1];
            const priceDiff = currentPrice - lastBar.close;
            const isLagging = Math.abs(priceDiff) > 0.1;
            const lagSeverity = Math.abs(priceDiff);
            return (
              <span className="ml-2">
                {isLagging ? (
                  <span className={lagSeverity > 1 ? 'text-red-400' : 'text-yellow-400'}>
                    ⚠️ Lag: ${priceDiff > 0 ? '+' : ''}${priceDiff.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-green-400">🔴 LIVE</span>
                )}
                <span className="ml-2 text-gray-400">
                  L: ${currentPrice.toFixed(2)} | C: ${lastBar.close.toFixed(2)}
                </span>
              </span>
            );
          })()}
        </div>
      </div>

      {/* Chart Container */}
      <div
        ref={chartContainerRef}
        className="w-full bg-slate-900 rounded-lg border"
        style={{ height: `${height}px` }}
      />

      {/* Status and Debug Info */}
      <div className="mt-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-4">
          <span className={isInitialized ? 'text-green-400' : 'text-yellow-400'}>
            Initialized: {isInitialized ? '✅' : '⏳'}
          </span>
          <span className={hasChart ? 'text-green-400' : 'text-gray-400'}>
            Has Chart: {hasChart ? '✅' : '❌'}
          </span>
          {bars.length > 0 && (
            <span className="text-blue-400">
              Bars: {bars.length}
            </span>
          )}
          {lastUpdateTime > 0 && (
            <span className="text-green-400">
              Updated: {new Date(lastUpdateTime).toLocaleTimeString()}
            </span>
          )}
        </div>

        {error && (
          <span className="text-red-400">
            ❌ {error}
          </span>
        )}
      </div>
    </div>
  );
});

LiveTradingViewChart.displayName = 'LiveTradingViewChart';
