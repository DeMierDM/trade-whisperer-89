import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  CandlestickData,
  CandlestickSeries,
  Time,
  ColorType,
  SeriesMarker,
  createSeriesMarkers
} from 'lightweight-charts';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TrendingUp, TrendingDown, DollarSign, Clock, Target, BarChart3 } from "lucide-react";
import styles from './BacktestInteractiveChart.module.css';

interface ChartData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface Signal {
  id: number;
  time: number;
  signal_type: string;
  underlying_price: number;
  target_delta: number;
  executed: boolean;
  trade: {
    id: number;
    contract_symbol: string;
    entry_timestamp: string;
    entry_price: number;
    exit_timestamp: string;
    exit_price: number;
    net_pnl: number;
    return_pct: number;
    quantity: number;
    status: string;
    close_reason: string;
  } | null;
}

interface BacktestChartData {
  backtestId: number;
  symbol: string;
  startDate: string;
  endDate: string;
  strategyName: string;
  chartData: ChartData[];
  signals: Signal[];
  totalBars: number;
  totalSignals: number;
  executedSignals: number;
}

interface BacktestInteractiveChartProps {
  backtestId: number;
}

export const BacktestInteractiveChart: React.FC<BacktestInteractiveChartProps> = ({ backtestId }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const seriesMarkersRef = useRef<any>(null);
  const [chartData, setChartData] = useState<BacktestChartData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoveredSignal, setHoveredSignal] = useState<Signal | null>(null);
  const [hoveredSignalGroup, setHoveredSignalGroup] = useState<Signal[]>([]);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);

  // Fetch chart data
  useEffect(() => {
    const fetchChartData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`http://localhost:3002/api/backtest/${backtestId}/chart-data`);
        if (!response.ok) {
          throw new Error(`Failed to fetch chart data: ${response.statusText}`);
        }
        const data: BacktestChartData = await response.json();
        setChartData(data);
      } catch (err) {
        console.error('Error fetching chart data:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchChartData();
  }, [backtestId]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || !chartData) return;

    // Create chart with dark theme
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#d1d5db',
      },
      grid: {
        vertLines: { color: '#374151' },
        horzLines: { color: '#374151' },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#4b5563',
      },
      rightPriceScale: {
        borderColor: '#4b5563',
      },
    });

    // Configure candlestick series with dark theme colors
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // Convert and set chart data
    const formattedData: CandlestickData[] = chartData.chartData.map(bar => ({
      time: bar.time as Time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));

    candlestickSeries.setData(formattedData);

    // Create both entry and exit markers for executed signals
    const markers: SeriesMarker<Time>[] = [];
    
    chartData.signals
      .filter(signal => signal.executed && signal.trade)
      .forEach(signal => {
        const isCall = signal.signal_type === 'BUY_CALL';
        
        // Entry marker
        const entryTime = new Date(signal.trade!.entry_timestamp).getTime() / 1000;
        markers.push({
          time: entryTime as Time,
          position: 'belowBar' as const,
          color: isCall ? '#10b981' : '#ef4444', // Green for calls, red for puts
          shape: 'arrowUp' as const,
          text: isCall ? 'C▲' : 'P▲',
          id: `entry-${signal.id}`,
          price: signal.trade!.entry_price * 100, // Convert to actual price
        });
        
        // Exit marker
        const exitTime = new Date(signal.trade!.exit_timestamp).getTime() / 1000;
        const isProfitable = signal.trade!.net_pnl > 0;
        markers.push({
          time: exitTime as Time,
          position: 'aboveBar' as const,
          color: isProfitable ? '#10b981' : '#ef4444', // Green for profit, red for loss
          shape: 'arrowDown' as const,
          text: isCall ? 'C▼' : 'P▼',
          id: `exit-${signal.id}`,
          price: signal.trade!.exit_price * 100, // Convert to actual price
        });
      });

    // Create series markers using the v5 API
    let seriesMarkers = null;
    if (markers.length > 0) {
      seriesMarkers = createSeriesMarkers(candlestickSeries, markers);
      seriesMarkersRef.current = seriesMarkers;
    }

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;

    // Handle chart clicks for signal interaction
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time) {
        setHoveredSignal(null);
        setHoveredSignalGroup([]);
        setTooltipPosition(null);
        return;
      }

      // Find signal at this time (check both entry and exit times)
      const timeAtCursor = param.time as number;
      const signalAtTime = chartData.signals.find(signal => {
        if (!signal.executed || !signal.trade) return false;
        
        const entryTime = new Date(signal.trade.entry_timestamp).getTime() / 1000;
        const exitTime = new Date(signal.trade.exit_timestamp).getTime() / 1000;
        
        // Check if cursor is near entry or exit time (within 1 minute)
        return Math.abs(entryTime - timeAtCursor) < 60 || Math.abs(exitTime - timeAtCursor) < 60;
      });

      if (signalAtTime && signalAtTime.executed) {
        setHoveredSignal(signalAtTime);
        
        // Find all signals for the same trade if it's a multi-signal trade
        const relatedSignals = signalAtTime.trade 
          ? chartData.signals.filter(s => s.trade?.id === signalAtTime.trade?.id)
          : [signalAtTime];
        
        setHoveredSignalGroup(relatedSignals);
        
        setTooltipPosition({
          x: param.point.x,
          y: param.point.y
        });
      } else {
        setHoveredSignal(null);
        setHoveredSignalGroup([]);
        setTooltipPosition(null);
      }
    });

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chart) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [chartData]);

  // Update signal highlighting when hovered signal changes
  useEffect(() => {
    if (!chartData || !seriesMarkersRef.current) return;

    // Create markers with highlighting
    const markers: SeriesMarker<Time>[] = chartData.signals
      .filter(signal => signal.executed)
      .map(signal => {
        const isHighlighted = hoveredSignalGroup.some(s => s.id === signal.id);
        const isDimmed = hoveredSignal && !isHighlighted;
        
        return {
          time: signal.time as Time,
          position: signal.signal_type === 'BUY_CALL' ? 'belowBar' : 'aboveBar' as const,
          color: isDimmed 
            ? (signal.signal_type === 'BUY_CALL' ? '#a3e3a3' : '#f5b3b3') // Dimmed colors
            : (signal.signal_type === 'BUY_CALL' ? '#4ade80' : '#f87171'), // Normal colors
          shape: 'arrowUp' as const,
          text: signal.signal_type === 'BUY_CALL' ? 'C' : 'P',
          id: `signal-${signal.id}`,
          price: signal.underlying_price,
          size: isHighlighted ? 2 : 1, // Larger size when highlighted
        };
      });

    seriesMarkersRef.current.setMarkers(markers);
  }, [hoveredSignal, hoveredSignalGroup, chartData]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(2)}%`;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          <span className="ml-2">Loading chart data...</span>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <div className="text-center text-red-500">
          <p>Error loading chart: {error}</p>
        </div>
      </Card>
    );
  }

  if (!chartData) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-500">
          <p>No chart data available</p>
        </div>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card className="p-6">
        <div className="space-y-4">
          {/* Chart Header */}
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">
                {chartData.symbol} - {chartData.strategyName}
              </h3>
              <p className="text-sm text-gray-500">
                {new Date(chartData.startDate).toLocaleDateString()} - {new Date(chartData.endDate).toLocaleDateString()}
              </p>
            </div>
            <div className="flex space-x-4 text-sm">
              <Badge variant="outline">
                <BarChart3 className="w-3 h-3 mr-1" />
                {chartData.totalBars} Bars
              </Badge>
              <Badge variant="outline">
                <Target className="w-3 h-3 mr-1" />
                {chartData.executedSignals}/{chartData.totalSignals} Signals
              </Badge>
            </div>
          </div>

          {/* Chart Container */}
          <div className="relative">
            <div ref={chartContainerRef} className="w-full h-[500px] border rounded" />
            
            {/* Signal Tooltip */}
            {hoveredSignal && tooltipPosition && (
              <div 
                className={styles.tooltip}
                style={{
                  '--tooltip-x': `${Math.min(tooltipPosition.x + 10, window.innerWidth - 400)}px`,
                  '--tooltip-y': `${Math.max(tooltipPosition.y - 150, 10)}px`,
                } as React.CSSProperties}
              >
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-white">
                      {hoveredSignal.signal_type === 'BUY_CALL' ? 'CALL Trade' : 'PUT Trade'}
                    </h4>
                    <Badge 
                      variant={hoveredSignal.signal_type === 'BUY_CALL' ? "default" : "secondary"}
                      className="text-xs bg-blue-600 text-white"
                    >
                      {hoveredSignal.signal_type === 'BUY_CALL' ? (
                        <TrendingUp className="w-3 h-3 mr-1" />
                      ) : (
                        <TrendingDown className="w-3 h-3 mr-1" />
                      )}
                      {hoveredSignal.signal_type.replace('BUY_', '')}
                    </Badge>
                  </div>

                  {hoveredSignal.trade && (
                    <div className="space-y-3">
                      {/* Contract Info */}
                      <div className="bg-gray-800 rounded-lg p-3">
                        <h5 className="font-medium text-sm text-white mb-2 flex items-center">
                          <DollarSign className="w-3 h-3 mr-1" />
                          {hoveredSignal.trade.contract_symbol}
                        </h5>
                        <div className="text-xs text-gray-300">
                          Quantity: {hoveredSignal.trade.quantity} contract{hoveredSignal.trade.quantity !== 1 ? 's' : ''}
                        </div>
                      </div>

                      {/* Entry & Exit */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-blue-900/30 rounded-lg p-3">
                          <div className="text-xs text-blue-300 mb-1">Entry ▲</div>
                          <div className="text-white font-medium">{formatCurrency(hoveredSignal.trade.entry_price)}</div>
                          <div className="text-xs text-gray-400 flex items-center mt-1">
                            <Clock className="w-3 h-3 mr-1" />
                            {new Date(hoveredSignal.trade.entry_timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                        
                        <div className="bg-purple-900/30 rounded-lg p-3">
                          <div className="text-xs text-purple-300 mb-1">Exit ▼</div>
                          <div className="text-white font-medium">{formatCurrency(hoveredSignal.trade.exit_price)}</div>
                          <div className="text-xs text-gray-400 flex items-center mt-1">
                            <Clock className="w-3 h-3 mr-1" />
                            {new Date(hoveredSignal.trade.exit_timestamp).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>

                      {/* P&L Summary */}
                      <div className={`rounded-lg p-3 ${hoveredSignal.trade.net_pnl >= 0 ? 'bg-green-900/30' : 'bg-red-900/30'}`}>
                        <div className="flex justify-between items-center">
                          <div className="text-xs text-gray-300">Net P&L</div>
                          <Badge 
                            variant={hoveredSignal.trade.status === 'CLOSED' ? 'default' : 'secondary'} 
                            className="text-xs bg-gray-700"
                          >
                            {hoveredSignal.trade.status}
                          </Badge>
                        </div>
                        <div className={`text-lg font-semibold ${hoveredSignal.trade.net_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatCurrency(hoveredSignal.trade.net_pnl)}
                        </div>
                        <div className="text-xs text-gray-400">
                          Return: {formatPercentage(hoveredSignal.trade.return_pct || 0)} • {hoveredSignal.trade.close_reason}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Chart Legend */}
          <div className="flex justify-center space-x-6 text-sm text-gray-600">
            <div className="flex items-center">
              <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
              <span>CALL Signals</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 bg-red-500 rounded mr-2"></div>
              <span>PUT Signals</span>
            </div>
            <div className="text-xs text-gray-500">
              Hover over signals to see trade details
            </div>
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
};