import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

interface EquityCurveData {
  time: string; // Date string format
  value: number; // Equity value
}

interface EquityCurveChartProps {
  data: EquityCurveData[];
  height?: number;
  initialCapital?: number;
  title?: string;
}

export interface EquityCurveChartAPI {
  updateEquity: (timestamp: string, equity: number) => void;
  reset: () => void;
  addTrade: (timestamp: string, pnl: number) => void;
}

export const EquityCurveChart = forwardRef<EquityCurveChartAPI, EquityCurveChartProps>(
  ({ data, height = 400, initialCapital = 100000, title = "Equity Curve" }, ref) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const equitySeriesRef = useRef<any>(null);
    const currentEquity = useRef(initialCapital);

    useImperativeHandle(ref, () => ({
      updateEquity: (timestamp: string, equity: number) => {
        if (equitySeriesRef.current) {
          currentEquity.current = equity;
          const unixTime = Math.floor(new Date(timestamp).getTime() / 1000);
          equitySeriesRef.current.update({
            time: unixTime,
            value: equity
          });
        }
      },
      
      reset: () => {
        if (equitySeriesRef.current) {
          equitySeriesRef.current.setData([]);
          currentEquity.current = initialCapital;
        }
      },
      
      addTrade: (timestamp: string, pnl: number) => {
        if (equitySeriesRef.current) {
          currentEquity.current += pnl;
          const unixTime = Math.floor(new Date(timestamp).getTime() / 1000);
          equitySeriesRef.current.update({
            time: unixTime,
            value: currentEquity.current
          });
        }
      }
    }));

    useEffect(() => {
      if (!chartContainerRef.current) return;

      const initChart = async () => {
        try {
          // Dynamic import like the main chart
          const { createChart, ColorType, LineStyle } = await import('lightweight-charts');

          // Create chart with same styling as main chart
          const chart = createChart(chartContainerRef.current!, {
            layout: {
              background: { type: ColorType.Solid, color: 'transparent' },
              textColor: 'hsl(var(--foreground))',
            },
            grid: {
              vertLines: { color: 'hsl(var(--border))' },
              horzLines: { color: 'hsl(var(--border))' },
            },
            crosshair: {
              mode: 1,
            },
            rightPriceScale: {
              borderColor: 'hsl(var(--border))',
              scaleMargins: {
                top: 0.1,
                bottom: 0.1,
              },
            },
            timeScale: {
              borderColor: 'hsl(var(--border))',
              timeVisible: true,
              secondsVisible: false,
            },
            width: chartContainerRef.current!.clientWidth,
            height: height,
          });

          // Create equity line series
          const equitySeries = chart.addLineSeries({
            color: '#22c55e', // Success green
            lineWidth: 2,
            lineStyle: LineStyle.Solid,
            priceFormat: {
              type: 'price',
              precision: 2,
              minMove: 0.01,
            },
          });

          // Add baseline at initial capital
          const baselineSeries = chart.addLineSeries({
            color: 'hsl(var(--muted-foreground))',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            priceFormat: {
              type: 'price',
              precision: 2,
              minMove: 0.01,
            },
          });

          chartRef.current = chart;
          equitySeriesRef.current = equitySeries;

          // Set initial data if provided
          if (data && data.length > 0) {
            const formattedData = data.map(point => ({
              time: Math.floor(new Date(point.time).getTime() / 1000),
              value: point.value
            }));
            
            equitySeries.setData(formattedData);
            currentEquity.current = data[data.length - 1]?.value || initialCapital;

            // Set baseline data (horizontal line at initial capital)
            if (data.length >= 2) {
              baselineSeries.setData([
                { time: Math.floor(new Date(data[0].time).getTime() / 1000), value: initialCapital },
                { time: Math.floor(new Date(data[data.length - 1].time).getTime() / 1000), value: initialCapital }
              ]);
            }
          }

          // Handle resize
          const handleResize = () => {
            if (chartContainerRef.current && chart) {
              chart.applyOptions({
                width: chartContainerRef.current.clientWidth,
              });
            }
          };

          window.addEventListener('resize', handleResize);

          // Store cleanup function
          chartRef.current._cleanup = () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
          };

        } catch (error) {
          console.error('Failed to create equity curve chart:', error);
        }
      };

      initChart();

      // Cleanup
      return () => {
        if (chartRef.current?._cleanup) {
          chartRef.current._cleanup();
        }
        chartRef.current = null;
        equitySeriesRef.current = null;
      };
    }, [data, height, initialCapital]);

    return (
      <div className="w-full">
        {title && (
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">{title}</h3>
            <div className="text-xs text-muted-foreground">
              Current: ${currentEquity.current.toLocaleString(undefined, { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
              })}
            </div>
          </div>
        )}
        <div 
          ref={chartContainerRef} 
          className={`w-full border border-border rounded-lg bg-background/50`}
          style={{ height: `${height}px` }}
        />
      </div>
    );
  }
);

EquityCurveChart.displayName = 'EquityCurveChart';