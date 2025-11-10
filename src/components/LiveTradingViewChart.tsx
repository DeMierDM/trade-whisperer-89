import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { ChartBar } from '@/lib/timeUtils';
import { ChartTypeSelector } from './ChartTypeSelector';

export type ChartType = 'Candlestick' | 'Line' | 'Area' | 'Bar';

interface LiveTradingViewChartProps {
  symbol: string;
  bars: ChartBar[];
  currentPrice?: number;
  height?: number;
  width?: number;
  showVolume?: boolean;
  chartType?: ChartType;
  onChartTypeChange?: (type: ChartType) => void;
  showTypeSelector?: boolean;
}

export interface ChartUpdateAPI {
  updateBar: (bar: any) => void;
  updateVolume: (bar: any) => void;
}

export const LiveTradingViewChart = forwardRef<ChartUpdateAPI, LiveTradingViewChartProps>(({
  symbol,
  bars,
  currentPrice,
  height = 400,
  width = 800,
  showVolume = true,
  chartType = 'Candlestick',
  onChartTypeChange,
  showTypeSelector = false,
}, ref) => {
  const instanceId = useRef(Math.random().toString(36).substr(2, 9));
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const priceLineRef = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [hasChart, setHasChart] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(0);
  const [hasLoadedInitialData, setHasLoadedInitialData] = useState(false);
  const lastLoadedBarCountRef = useRef(0);

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
    updateVolume: (bar: any) => {
      if (!volumeSeriesRef.current) {
        return;
      }

      try {
        volumeSeriesRef.current.update({
          time: bar.time,
          value: bar.volume,
          color: bar.close >= bar.open ? '#26a69a99' : '#ef535099', // Semi-transparent like TradingView
        });
      } catch (err: any) {
        console.error('[CHART API] ❌ Volume update failed:', err.message);
      }
    },
  }), []);

  // ============================================================================
  // CHART INITIALIZATION
  // ============================================================================

  // ============================================================================
  // CHART INITIALIZATION (Only once, not on type changes)
  // ============================================================================
  useEffect(() => {
    const initChart = async () => {
      try {
        if (!chartContainerRef.current) {
          console.log('[LIVE CHART] No container ref, skipping initialization');
          return;
        }

        // Don't reinitialize if chart already exists
        if (chartRef.current) {
          console.log('[LIVE CHART] Chart already exists, skipping reinitialization');
          return;
        }

        chartContainerRef.current.innerHTML = '';

        console.log(`[LIVE CHART ${instanceId.current}] Initializing chart container...`);

        // Dynamic import - v5.x API
        const { createChart, ColorType } = await import('lightweight-charts');

        const chart = createChart(chartContainerRef.current, {
          autoSize: true, // Make chart responsive to container
          layout: {
            background: { type: ColorType.Solid, color: '#131722' }, // TradingView's exact dark background
            textColor: '#d1d4dc',
            fontSize: 12,
            fontFamily: '-apple-system, BlinkMacSystemFont, "Trebuchet MS", Roboto, Ubuntu, sans-serif',
          },
          grid: {
            vertLines: { 
              color: '#363c4e', 
              style: 0, 
              visible: true 
            },
            horzLines: { 
              color: '#363c4e', 
              style: 0, 
              visible: true 
            },
          },
          crosshair: {
            mode: 1, // Normal crosshair mode
            vertLine: {
              color: '#758696',
              width: 1,
              style: 3, // Dashed
              visible: true,
              labelVisible: true,
            },
            horzLine: {
              color: '#758696',
              width: 1,
              style: 3, // Dashed
              visible: true,
              labelVisible: true,
            },
          },
          timeScale: {
            timeVisible: true,
            secondsVisible: false,
            borderColor: '#2a2e39',
            rightOffset: 12,
            barSpacing: 3,
            fixLeftEdge: false,
            lockVisibleTimeRangeOnResize: true,
            rightBarStaysOnScroll: true,
          },
          rightPriceScale: {
            borderColor: '#2a2e39',
            textColor: '#b2b5be',
            entireTextOnly: false,
            visible: true,
            borderVisible: true,
            scaleMargins: {
              top: 0.1,
              bottom: 0.1,
            },
          },
          leftPriceScale: {
            visible: false,
          },
          handleScroll: {
            mouseWheel: true,
            pressedMouseMove: true,
            horzTouchDrag: true,
            vertTouchDrag: true,
          },
          handleScale: {
            axisPressedMouseMove: true,
            mouseWheel: true,
            pinch: true,
          },
        });

        chartRef.current = chart;
        setIsInitialized(true);
        setHasChart(true);
        setError(null);

        console.log(`[LIVE CHART ${instanceId.current}] ✅ Chart container initialized successfully`);

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
        volumeSeriesRef.current = null;
        setIsInitialized(false);
        setHasChart(false);
        setHasLoadedInitialData(false); // Reset data loading flag
        lastLoadedBarCountRef.current = 0; // Reset bar count tracker
      }
      if (chartContainerRef.current) {
        chartContainerRef.current.innerHTML = '';
      }
    };
  }, []); // Only initialize once, no dependencies!

  // ============================================================================
  // CHART TYPE & VOLUME SERIES MANAGEMENT
  // ============================================================================
  useEffect(() => {
    const updateChartSeries = async () => {
      if (!chartRef.current || !isInitialized) {
        console.log('[CHART TYPE] Chart not ready for series update');
        return;
      }

      try {
        console.log(`[CHART TYPE] Updating to ${chartType}, volume: ${showVolume}`);
        
        // Import series types
        const { CandlestickSeries, LineSeries, AreaSeries, BarSeries, HistogramSeries } = await import('lightweight-charts');

        // Remove existing main series if it exists
        if (seriesRef.current) {
          chartRef.current.removeSeries(seriesRef.current);
          seriesRef.current = null;
        }

        // Remove existing volume series if it exists
        if (volumeSeriesRef.current) {
          chartRef.current.removeSeries(volumeSeriesRef.current);
          volumeSeriesRef.current = null;
        }

        // Create main price series based on chart type
        let mainSeries: any;

        switch (chartType) {
          case 'Line':
            mainSeries = chartRef.current.addSeries(LineSeries, {
              color: '#2962ff', // TradingView's signature blue
              lineWidth: 2,
              crosshairMarkerVisible: true,
              crosshairMarkerRadius: 6,
              crosshairMarkerBorderColor: '#2962ff',
              crosshairMarkerBackgroundColor: '#2962ff',
              lastValueVisible: true,
              priceLineVisible: true,
              priceLineColor: '#2962ff',
              priceLineWidth: 1,
              priceLineStyle: 2,
            });
            break;
          case 'Area':
            mainSeries = chartRef.current.addSeries(AreaSeries, {
              topColor: 'rgba(41, 98, 255, 0.4)', // TradingView area gradient
              bottomColor: 'rgba(41, 98, 255, 0.0)',
              lineColor: '#2962ff',
              lineWidth: 2,
              crosshairMarkerVisible: true,
              crosshairMarkerRadius: 6,
              crosshairMarkerBorderColor: '#2962ff',
              crosshairMarkerBackgroundColor: '#2962ff',
              lastValueVisible: true,
              priceLineVisible: true,
              priceLineColor: '#2962ff',
              priceLineWidth: 1,
              priceLineStyle: 2,
            });
            break;
          case 'Bar':
            mainSeries = chartRef.current.addSeries(BarSeries, {
              upColor: '#26a69a',
              downColor: '#ef5350',
              openVisible: true,
              thinBars: false,
            });
            break;
          case 'Candlestick':
          default:
            mainSeries = chartRef.current.addSeries(CandlestickSeries, {
              upColor: '#26a69a', // TradingView's exact bull color
              downColor: '#ef5350', // TradingView's exact bear color
              borderUpColor: '#26a69a',
              borderDownColor: '#ef5350',
              wickUpColor: '#26a69a', 
              wickDownColor: '#ef5350',
              priceLineVisible: true,
              lastValueVisible: true,
              priceLineColor: '#2962ff',
              priceLineWidth: 1,
              priceLineStyle: 2, // Dashed
              baseLineVisible: false,
            });
            break;
        }

        seriesRef.current = mainSeries;

        // Add volume histogram if enabled
        if (showVolume) {
          const volumeSeries = chartRef.current.addSeries(HistogramSeries, {
            color: '#26a69a33', // Semi-transparent for professional look
            priceFormat: {
              type: 'volume',
            },
            priceScaleId: 'volume',
            base: 0,
          });

          // Configure volume price scale (bottom 25% of chart like TradingView)
          chartRef.current.priceScale('volume').applyOptions({
            scaleMargins: {
              top: 0.75, // Volume takes bottom 25%
              bottom: 0,
            },
            borderColor: '#2a2e39',
            textColor: '#787b86',
            entireTextOnly: false,
            visible: true,
            borderVisible: true,
          });

          volumeSeriesRef.current = volumeSeries;
        }

        // Reload data if we have bars and this is a new series
        if (bars.length > 0) {
          console.log(`[CHART TYPE] Reloading ${bars.length} bars for new ${chartType} series`);
          setHasLoadedInitialData(false); // Force data reload
          lastLoadedBarCountRef.current = 0; // Reset bar count tracker
        }

        console.log(`[CHART TYPE] ✅ Chart series updated to ${chartType}, volume: ${showVolume}`);

      } catch (err: any) {
        console.error('[CHART TYPE] ❌ Series update failed:', err);
        setError(err.message);
      }
    };

    updateChartSeries();
  }, [chartType, showVolume, isInitialized]); // Update series when type/volume changes

  // ============================================================================
  // HISTORICAL DATA UPDATE (ONLY ONCE for initial load)
  // ============================================================================

  useEffect(() => {
    // CRITICAL: Only load data when we have NEW data, not on every change
    if (hasLoadedInitialData && lastLoadedBarCountRef.current === bars.length) {
      console.log('[LIVE CHART] ⏭️ Skipping - data already loaded for this dataset');
      return;
    }

    console.log('[LIVE CHART] Historical data effect triggered:', {
      initialized: isInitialized,
      hasSeries: !!seriesRef.current,
      barsCount: bars.length,
      lastLoaded: lastLoadedBarCountRef.current,
      hasLoadedInitialData
    });

    if (!isInitialized || !seriesRef.current || bars.length === 0) {
      console.log('[LIVE CHART] ⏸️ Waiting for data/initialization');
      return;
    }

    try {
      console.log('[LIVE CHART] 🔄 Loading initial historical data:', bars.length, 'bars');
      
      // Debug: Log the first few bars to see their structure
      console.log('[LIVE CHART] 🔍 Sample bars (first 3):', bars.slice(0, 3));
      
      // Debug: Check for data quality issues
      const invalidBars = bars.filter(bar => !bar.open || !bar.high || !bar.low || !bar.close || bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0);
      if (invalidBars.length > 0) {
        console.warn('[LIVE CHART] ⚠️ Found bars with invalid OHLC data:', invalidBars.length, 'out of', bars.length);
        console.log('[LIVE CHART] 🔍 Invalid bars sample:', invalidBars.slice(0, 3));
      }

      // Prepare price data
      const chartData = bars.map((bar, index) => {
        // ChartBar.timestamp is already in SECONDS - use directly
        const timestamp = typeof bar.timestamp === 'number' ? bar.timestamp : Number(bar.timestamp);

        if (isNaN(timestamp) || timestamp <= 0) {
          console.error(`[LIVE CHART] ❌ Invalid timestamp for bar ${index}:`, bar);
          return null;
        }
        
        // Additional validation for OHLC values
        const open = Number(bar.open);
        const high = Number(bar.high);
        const low = Number(bar.low);
        const close = Number(bar.close);
        
        if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
          console.warn(`[LIVE CHART] ⚠️ Invalid OHLC values for bar ${index}:`, {open, high, low, close, original: bar});
          return null;
        }

        // For Line and Area charts, only use close price
        if (chartType === 'Line' || chartType === 'Area') {
          return {
            time: timestamp,
            value: close,
          };
        }

        // For Candlestick and Bar charts, use OHLC
        return {
          time: timestamp,
          open: open,
          high: high,
          low: low,
          close: close,
        };
      }).filter(Boolean);

      // Ensure data is sorted
      chartData.sort((a, b) => a.time - b.time);
      
      // Debug: Log final chart data
      console.log('[LIVE CHART] 📊 Final chart data prepared:', {
        totalBars: chartData.length,
        chartType,
        timeRange: chartData.length > 0 ? {
          first: new Date(chartData[0].time * 1000).toISOString(),
          last: new Date(chartData[chartData.length - 1].time * 1000).toISOString()
        } : null,
        sampleData: chartData.slice(0, 3)
      });

      // Load main price data
      seriesRef.current.setData(chartData);
      console.log('[LIVE CHART] ✅ Chart data loaded into series');
      
      // Auto-fit the chart to show all data properly
      if (chartRef.current && chartData.length > 0) {
        setTimeout(() => {
          try {
            chartRef.current.timeScale().fitContent();
            console.log('[LIVE CHART] ✅ Chart auto-fitted to content');
          } catch (err) {
            console.warn('[LIVE CHART] ⚠️ Auto-fit failed:', err);
          }
        }, 100);
      }

      // Load volume data if enabled
      if (showVolume && volumeSeriesRef.current) {
        const volumeData = bars.map((bar, index) => {
          const timestamp = typeof bar.timestamp === 'number' ? bar.timestamp : Number(bar.timestamp);

          if (isNaN(timestamp) || timestamp <= 0) {
            return null;
          }

          return {
            time: timestamp,
            value: Number(bar.volume || 0),
            color: bar.close >= bar.open ? '#26a69a' : '#ef5350',
          };
        }).filter(Boolean);

        volumeData.sort((a, b) => a.time - b.time);
        volumeSeriesRef.current.setData(volumeData);
        console.log('[LIVE CHART] ✅ Volume data loaded:', volumeData.length, 'bars');
      }

      setHasLoadedInitialData(true); // Mark as loaded - prevents re-running
      lastLoadedBarCountRef.current = bars.length; // Remember how many bars we loaded
      setLastUpdateTime(Date.now());
      console.log('[LIVE CHART] ✅ Initial data loaded! Live updates will use update() method.');

    } catch (err: any) {
      console.error('[LIVE CHART] ❌ Data update failed:', err);
      setError(err.message);
    }
  }, [isInitialized, bars, hasLoadedInitialData]); // Depend on bars but use ref tracking to prevent loops

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
        color: '#ff6d00', // TradingView's orange for live prices
        lineWidth: 2,
        lineStyle: 0, // Solid line for live price
        axisLabelVisible: true,
        title: '', // Clean look without title
        axisLabelColor: '#ff6d00',
        axisLabelTextColor: '#ffffff',
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
      {/* Professional TradingView-style Header */}
      <div className="flex items-center justify-between mb-2 px-3 py-2 bg-[#1e222d] rounded-t-lg border-b border-[#2a2e39]">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-[#d1d4dc] tracking-wide">{symbol}</h3>
          {currentPrice && bars.length > 0 && (() => {
            const lastBar = bars[bars.length - 1];
            const priceDiff = currentPrice - lastBar.close;
            const changePercent = ((priceDiff / lastBar.close) * 100);
            const isPositive = priceDiff >= 0;
            
            return (
              <>
                <span className="text-xl font-mono font-bold text-white">
                  ${currentPrice.toFixed(2)}
                </span>
                <span className={`text-sm font-semibold px-2 py-1 rounded ${
                  isPositive ? 'text-[#26a69a] bg-[#26a69a]/10' : 'text-[#ef5350] bg-[#ef5350]/10'
                }`}>
                  {isPositive ? '+' : ''}${priceDiff.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                </span>
              </>
            );
          })()}
        </div>
        <div className="flex items-center gap-4 text-xs text-[#787b86]">
          {showTypeSelector && onChartTypeChange && (
            <ChartTypeSelector 
              currentType={chartType}
              onTypeChange={onChartTypeChange}
              className="mr-2"
            />
          )}
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 bg-[#26a69a] rounded-full animate-pulse"></div>
            LIVE
          </span>
          <span>{bars.length} bars</span>
          <span className="text-[#2962ff] font-medium">TradingView Pro</span>
        </div>
      </div>

      {/* Chart Container */}
      <div
        ref={chartContainerRef}
        className="w-full rounded-lg border border-[#2a2e39] bg-[#131722] overflow-hidden"
        style={{ height: `${height}px`, minHeight: '300px' }}
      />

      {/* Professional Status Footer */}
      <div className="mt-1 px-3 py-2 bg-[#1e222d] rounded-b-lg border-t border-[#2a2e39]">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isInitialized ? 'bg-[#26a69a]' : 'bg-[#ff9800]'}`}></div>
              <span className="text-[#787b86]">Engine: {isInitialized ? 'Active' : 'Loading'}</span>
            </div>
            {bars.length > 0 && (
              <span className="text-[#787b86]">
                Data: {bars.length} bars loaded
              </span>
            )}
            {lastUpdateTime > 0 && (
              <span className="text-[#787b86]">
                Last: {new Date(lastUpdateTime).toLocaleTimeString()}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {error ? (
              <span className="text-[#ef5350] text-xs">
                ⚠ {error}
              </span>
            ) : (
              <span className="text-[#2962ff] text-xs font-medium">
                Powered by TradingView Lightweight Charts
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

LiveTradingViewChart.displayName = 'LiveTradingViewChart';
