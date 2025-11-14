import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  CandlestickData,
  CandlestickSeries,
  Time,
  ColorType,
  SeriesMarker
} from 'lightweight-charts';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BarChart3, Bot, Play, Square } from "lucide-react";
import { ChartBar } from '@/lib/timeUtils';
import styles from './LivePaperTradingChart.module.css';
import { calculateStrategyOutcome, getStrategyDescription } from '@/utils/strategyCalculations';

interface PaperTradingBot {
  id: number;
  name: string;
  strategy_name: string;
  symbol: string;
  status: string;
  current_capital: number;
  initial_capital: number;
  allocation_percent: number;
  risk_level: string;
  parameters: any;
}

interface LiveSignal {
  id: number;
  bot_id: number;
  timestamp: string;
  signal_type: 'BUY_CALL' | 'BUY_PUT';
  underlying_symbol: string;
  underlying_price: number;
  signal_strength: number;
  signal_reason: string;
  executed: boolean;
  position_id?: number;
}

interface LivePosition {
  id: number;
  bot_id: number;
  contract_symbol: string;
  underlying_symbol: string;
  option_type: 'call' | 'put';
  strike_price: number;
  expiry_date: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  entry_time: string;
  entry_signal_type: string;
  signal_strength: number;
  signal_reason: string;
  underlying_price_at_entry: number;
  profit_target_price?: number;
  stop_loss_price?: number;
  max_hold_until?: string;
  status: 'open' | 'closed';
  unrealized_pnl: number;
}

interface LiveTrade {
  id: number;
  bot_id: number;
  position_id: number;
  contract_symbol: string;
  underlying_symbol: string;
  option_type: 'call' | 'put';
  strike_price: number;
  expiry_date: string;
  quantity: number;
  entry_price: number;
  exit_price: number;
  entry_time: string;
  exit_time: string;
  entry_signal_type: string;
  signal_strength: number;
  signal_reason: string;
  exit_reason: string;
  gross_pnl: number;
  commission: number;
  net_pnl: number;
  return_pct: number;
  underlying_price_entry: number;
  underlying_price_exit: number;
  duration_minutes: number;
}

interface LivePaperTradingChartProps {
  symbol: string;
  activeBots: PaperTradingBot[];
  bars: ChartBar[];
  currentPrice?: number;
  height?: number;
  showVolume?: boolean;
  onBotStatusChange?: (botId: number, action: 'start' | 'stop') => void;
}

// Color scheme for 3 bots - professional and distinguishable
const BOT_COLORS = {
  1: { primary: '#2563eb', secondary: '#93c5fd', name: 'Azure' }, // Blue
  2: { primary: '#dc2626', secondary: '#fca5a5', name: 'Crimson' }, // Red  
  3: { primary: '#16a34a', secondary: '#86efac', name: 'Emerald' }, // Green
} as const;

const getBotColor = (botId: number, type: 'primary' | 'secondary' = 'primary') => {
  const colorIndex = ((botId - 1) % 3) + 1 as keyof typeof BOT_COLORS;
  return BOT_COLORS[colorIndex][type];
};

const getBotName = (botId: number) => {
  const colorIndex = ((botId - 1) % 3) + 1 as keyof typeof BOT_COLORS;
  return BOT_COLORS[colorIndex].name;
};

interface LivePaperTradingChartAdvancedProps extends LivePaperTradingChartProps {
  signals?: LiveSignal[];
  positions?: LivePosition[];
  trades?: LiveTrade[];
}

export const LivePaperTradingChart: React.FC<LivePaperTradingChartAdvancedProps> = ({
  symbol,
  activeBots,
  bars,
  currentPrice,
  height = 600,
  showVolume = true,
  onBotStatusChange,
  signals: externalSignals = [],
  positions: externalPositions = [],
  trades: externalTrades = []
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const priceLineRef = useRef<any>(null);
  
  const [signals, setSignals] = useState<LiveSignal[]>(externalSignals);
  const [positions, setPositions] = useState<LivePosition[]>(externalPositions);
  const [trades, setTrades] = useState<LiveTrade[]>(externalTrades);
  const [hoveredMarker, setHoveredMarker] = useState<any>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Update signals/positions/trades when external data changes
  useEffect(() => {
    setSignals(externalSignals);
  }, [externalSignals]);

  useEffect(() => {
    setPositions(externalPositions);
  }, [externalPositions]);

  useEffect(() => {
    setTrades(externalTrades);
  }, [externalTrades]);

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: height,
      layout: {
        background: { type: ColorType.Solid, color: '#0c0a09' }, // Deep black for pro look
        textColor: '#f5f5f4',
      },
      grid: {
        vertLines: { color: '#292524' },
        horzLines: { color: '#292524' },
      },
      crosshair: {
        mode: 1,
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderColor: '#57534e',
      },
      rightPriceScale: {
        borderColor: '#57534e',
      },
    });

    // Create candlestick series
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444', 
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // Create volume series if enabled
    let volumeSeries = null;
    if (showVolume) {
      volumeSeries = chart.addSeries('Histogram' as any, {
        color: '#64748b33',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        base: 0,
      });

      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.75, bottom: 0 },
      });
    }

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    if (volumeSeries) volumeSeriesRef.current = volumeSeries;
    setIsInitialized(true);

    // Handle crosshair movement for tooltips
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || !param.time) {
        setHoveredMarker(null);
        setTooltipPosition(null);
        return;
      }

      // Check if cursor is near any signal/trade markers
      const timeAtCursor = param.time as number;
      const tolerance = 300; // 5 minutes in seconds

      // Find signal at cursor
      const nearbySignal = signals.find(signal => {
        const signalTime = new Date(signal.timestamp).getTime() / 1000;
        return Math.abs(signalTime - timeAtCursor) < tolerance;
      });

      // Find trade at cursor  
      const nearbyTrade = trades.find(trade => {
        const entryTime = new Date(trade.entry_time).getTime() / 1000;
        const exitTime = new Date(trade.exit_time).getTime() / 1000;
        return Math.abs(entryTime - timeAtCursor) < tolerance || Math.abs(exitTime - timeAtCursor) < tolerance;
      });

      // Find position at cursor
      const nearbyPosition = positions.find(position => {
        const entryTime = new Date(position.entry_time).getTime() / 1000;
        return Math.abs(entryTime - timeAtCursor) < tolerance;
      });

      if (nearbyTrade) {
        setHoveredMarker({ type: 'trade', data: nearbyTrade });
        setTooltipPosition({ x: param.point.x, y: param.point.y });
      } else if (nearbyPosition) {
        setHoveredMarker({ type: 'position', data: nearbyPosition });
        setTooltipPosition({ x: param.point.x, y: param.point.y });
      } else if (nearbySignal) {
        setHoveredMarker({ type: 'signal', data: nearbySignal });
        setTooltipPosition({ x: param.point.x, y: param.point.y });
      } else {
        setHoveredMarker(null);
        setTooltipPosition(null);
      }
    });

    // Cleanup
    return () => {
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
      setIsInitialized(false);
    };
  }, [height, showVolume]);

  // Update chart data when bars change
  useEffect(() => {
    if (!isInitialized || !candlestickSeriesRef.current || bars.length === 0) return;

    const chartData: CandlestickData[] = bars.map(bar => ({
      time: (typeof bar.timestamp === 'number' ? bar.timestamp : Number(bar.timestamp)) as Time,
      open: bar.open,
      high: bar.high,
      low: bar.low,
      close: bar.close,
    }));

    candlestickSeriesRef.current.setData(chartData);

    // Update volume data
    if (volumeSeriesRef.current) {
      const volumeData = bars.map(bar => ({
        time: (typeof bar.timestamp === 'number' ? bar.timestamp : Number(bar.timestamp)) as Time,
        value: bar.volume || 0,
        color: bar.close >= bar.open ? '#22c55e44' : '#ef444444',
      }));
      volumeSeriesRef.current.setData(volumeData);
    }
  }, [isInitialized, bars]);

  // Update current price line
  useEffect(() => {
    if (!isInitialized || !candlestickSeriesRef.current || !currentPrice) return;

    // Remove existing price line
    if (priceLineRef.current) {
      candlestickSeriesRef.current.removePriceLine(priceLineRef.current);
    }

    // Add new price line
    priceLineRef.current = candlestickSeriesRef.current.createPriceLine({
      price: currentPrice,
      color: '#f59e0b',
      lineWidth: 2,
      lineStyle: 0,
      axisLabelVisible: true,
      title: `Live: $${currentPrice.toFixed(2)}`,
    });
  }, [isInitialized, currentPrice]);

  // Update markers for signals, positions, and trades
  useEffect(() => {
    if (!isInitialized || !candlestickSeriesRef.current) return;

    const markers: SeriesMarker<Time>[] = [];

    // Add signal markers (arrows pointing up for entry signals)
    signals.forEach(signal => {
      const botColor = getBotColor(signal.bot_id);
      markers.push({
        time: (new Date(signal.timestamp).getTime() / 1000) as Time,
        position: 'belowBar' as const,
        color: botColor,
        shape: 'arrowUp' as const,
        text: signal.signal_type === 'BUY_CALL' ? 'C↑' : 'P↑',
        id: `signal-${signal.id}`,
        size: 1.5,
      });
    });

    // Add position entry markers (circles for open positions)
    positions.filter(pos => pos.status === 'open').forEach(position => {
      const botColor = getBotColor(position.bot_id);
      markers.push({
        time: (new Date(position.entry_time).getTime() / 1000) as Time,
        position: 'belowBar' as const,
        color: botColor,
        shape: 'circle' as const,
        text: position.option_type === 'call' ? 'C' : 'P',
        id: `position-${position.id}`,
        size: 1.2,
      });
    });

    // Add trade markers (both entry and exit)
    trades.forEach(trade => {
      const botColor = getBotColor(trade.bot_id);
      const isProfitable = trade.net_pnl > 0;
      
      // Entry marker
      markers.push({
        time: (new Date(trade.entry_time).getTime() / 1000) as Time,
        position: 'belowBar' as const,
        color: botColor,
        shape: 'arrowUp' as const,
        text: trade.option_type === 'call' ? 'C↑' : 'P↑',
        id: `trade-entry-${trade.id}`,
        size: 1.5,
      });
      
      // Exit marker
      markers.push({
        time: (new Date(trade.exit_time).getTime() / 1000) as Time,
        position: 'aboveBar' as const,
        color: isProfitable ? '#22c55e' : '#ef4444',
        shape: 'arrowDown' as const,
        text: isProfitable ? '💰' : '💸',
        id: `trade-exit-${trade.id}`,
        size: 1.5,
      });
    });

    // Apply markers to series (using setMarkers method)
    if ((candlestickSeriesRef.current as any).setMarkers) {
      (candlestickSeriesRef.current as any).setMarkers(markers);
    }
  }, [isInitialized, signals, positions, trades]);

  // Format currency helper
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  // Expected outcomes calculation helper using strategy calculations
  const calculateExpectedOutcomes = (position: LivePosition) => {
    // Find the bot for this position to get strategy info
    const bot = activeBots.find(b => b.id === position.bot_id);
    const strategyName = bot?.strategy_name || 'iwm-optimized-strategy';
    
    return calculateStrategyOutcome(
      strategyName,
      position.entry_price,
      position.quantity,
      position.option_type,
      position.underlying_price_at_entry,
      bot?.parameters
    );
  };

  const renderTooltip = () => {
    if (!hoveredMarker || !tooltipPosition) return null;

    const { type, data } = hoveredMarker;

    return (
      <div 
        className={styles.tooltip}
        style={{
          '--tooltip-x': `${Math.min(tooltipPosition.x + 10, window.innerWidth - 320)}px`,
          '--tooltip-y': `${Math.max(tooltipPosition.y - 150, 10)}px`,
        } as React.CSSProperties}
      >
        {type === 'trade' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-white flex items-center">
                <Bot className="w-4 h-4 mr-2" style={{ color: getBotColor(data.bot_id) }} />
                {getBotName(data.bot_id)} Bot
              </h4>
              <Badge 
                variant={data.net_pnl >= 0 ? "default" : "destructive"}
                className={data.net_pnl >= 0 ? "bg-green-600" : "bg-red-600"}
              >
                {data.option_type.toUpperCase()} TRADE
              </Badge>
            </div>
            
            <div className="text-xs text-gray-300">
              <strong>{data.contract_symbol}</strong>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-gray-400">Entry</div>
                <div className="text-white font-medium">{formatCurrency(data.entry_price)}</div>
                <div className="text-gray-400">{new Date(data.entry_time).toLocaleTimeString()}</div>
              </div>
              <div>
                <div className="text-gray-400">Exit</div>
                <div className="text-white font-medium">{formatCurrency(data.exit_price)}</div>
                <div className="text-gray-400">{new Date(data.exit_time).toLocaleTimeString()}</div>
              </div>
            </div>
            
            <div className="border-t border-gray-700 pt-2">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-xs">Net P&L</span>
                <span className={`font-semibold ${data.net_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(data.net_pnl)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs mt-1">
                <span className="text-gray-400">Return</span>
                <span className="text-gray-300">{(data.return_pct * 100).toFixed(1)}%</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Reason: {data.exit_reason}
              </div>
            </div>
          </div>
        )}

        {type === 'position' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-white flex items-center">
                <Bot className="w-4 h-4 mr-2" style={{ color: getBotColor(data.bot_id) }} />
                {getBotName(data.bot_id)} Bot
              </h4>
              <Badge 
                variant="outline"
                className="border-yellow-600 text-yellow-400"
              >
                OPEN {data.option_type.toUpperCase()}
              </Badge>
            </div>
            
            <div className="text-xs text-gray-300">
              <strong>{data.contract_symbol}</strong>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Entry Price</span>
                <span className="text-white font-medium">{formatCurrency(data.entry_price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Current Price</span>
                <span className="text-white font-medium">{formatCurrency(data.current_price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Unrealized P&L</span>
                <span className={`font-semibold ${data.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(data.unrealized_pnl)}
                </span>
              </div>
            </div>

            {(() => {
              const expected = calculateExpectedOutcomes(data);
              return (
                  <div className="border-t border-gray-700 pt-2">
                    <div className="text-xs text-gray-400 mb-1">Expected Outcomes</div>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-green-400">Target Profit</span>
                        <span className="text-green-400">{formatCurrency(expected.expected_profit_dollars)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-red-400">Stop Loss</span>
                        <span className="text-red-400">{formatCurrency(-expected.expected_loss_dollars)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-blue-400">Risk/Reward</span>
                        <span className="text-blue-400">{expected.risk_reward_ratio.toFixed(1)}:1</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-yellow-400">Success Rate</span>
                        <span className="text-yellow-400">{(expected.success_probability * 100).toFixed(0)}%</span>
                      </div>
                      <div className="text-gray-400 mt-2">
                        Max hold: {expected.max_hold_minutes} minutes
                      </div>
                      {expected.strategy_notes.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {expected.strategy_notes.map((note, index) => (
                            <div key={index} className="text-xs text-cyan-400">
                              {note}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
              );
            })()}
          </div>
        )}

        {type === 'signal' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-white flex items-center">
                <Bot className="w-4 h-4 mr-2" style={{ color: getBotColor(data.bot_id) }} />
                {getBotName(data.bot_id)} Bot
              </h4>
              <Badge 
                variant={data.executed ? "default" : "secondary"}
                className={data.executed ? "bg-blue-600" : "bg-gray-600"}
              >
                {data.signal_type}
              </Badge>
            </div>
            
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-gray-400">Signal Strength</span>
                <span className="text-white font-medium">{data.signal_strength?.toFixed(1) || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Underlying Price</span>
                <span className="text-white font-medium">{formatCurrency(data.underlying_price)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span className={data.executed ? "text-green-400" : "text-yellow-400"}>
                  {data.executed ? "Executed" : "Generated"}
                </span>
              </div>
            </div>

            {data.signal_reason && (
              <div className="border-t border-gray-700 pt-2">
                <div className="text-xs text-gray-400">Reason</div>
                <div className="text-xs text-gray-300">{data.signal_reason}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <Card className="p-6 bg-gray-950 border-gray-800">
        <div className="space-y-4">
          {/* Chart Header with Bot Status */}
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-semibold text-white flex items-center">
                <BarChart3 className="w-5 h-5 mr-2" />
                {symbol} Live Paper Trading
              </h3>
              <p className="text-sm text-gray-400">
                Real-time multi-bot signals and trades
              </p>
            </div>
            
            {/* Active Bots Quick Controls */}
            <div className="flex space-x-3">
              {activeBots.slice(0, 3).map((bot, index) => (
                <div 
                  key={bot.id} 
                  className={styles.botContainer}
                  style={{ 
                    borderColor: getBotColor(bot.id),
                    backgroundColor: `${getBotColor(bot.id)}20`
                  }}
                >
                  <Bot 
                    className="w-4 h-4" 
                    style={{ color: getBotColor(bot.id) }}
                  />
                  <span className="text-xs font-medium text-white">
                    {getBotName(bot.id)}
                  </span>
                  <Badge 
                    variant={bot.status === 'running' ? 'default' : 'secondary'}
                    className="text-xs"
                  >
                    {bot.status}
                  </Badge>
                  {onBotStatusChange && (
                    <button
                      onClick={() => onBotStatusChange(bot.id, bot.status === 'running' ? 'stop' : 'start')}
                      className="ml-1 p-1 hover:bg-gray-700 rounded"
                    >
                      {bot.status === 'running' ? (
                        <Square className="w-3 h-3 text-red-400" />
                      ) : (
                        <Play className="w-3 h-3 text-green-400" />
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Chart Container */}
          <div className="relative">
            <div ref={chartContainerRef} className="w-full border border-gray-700 rounded-lg" />
            {renderTooltip()}
          </div>

          {/* Chart Legend */}
          <div className="flex justify-between items-center text-sm">
            <div className="flex space-x-6">
              {[1, 2, 3].map(botIndex => (
                <div key={botIndex} className="flex items-center space-x-2">
                  <div 
                    className={styles.legendDot}
                    style={{ backgroundColor: getBotColor(botIndex) }}
                  ></div>
                  <span className="text-gray-300">{getBotName(botIndex)} Bot</span>
                </div>
              ))}
            </div>
            
            <div className="flex space-x-4 text-xs text-gray-500">
              <span className="flex items-center">
                <span className="mr-1">↑</span> Entry Signals
              </span>
              <span className="flex items-center">
                <span className="mr-1">○</span> Open Positions
              </span>
              <span className="flex items-center">
                <span className="mr-1">↓</span> Exit Trades
              </span>
            </div>
          </div>

          {/* Real-time Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-800">
            {activeBots.slice(0, 3).map(bot => (
              <div 
                key={bot.id}
                className={styles.botStats}
                style={{ 
                  borderColor: getBotColor(bot.id),
                  backgroundColor: `${getBotColor(bot.id)}10`
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">{getBotName(bot.id)} Bot</span>
                  <Bot className="w-4 h-4" style={{ color: getBotColor(bot.id) }} />
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Capital</span>
                    <span className="text-white">{formatCurrency(bot.current_capital)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">P&L</span>
                    <span className={bot.current_capital >= bot.initial_capital ? 'text-green-400' : 'text-red-400'}>
                      {formatCurrency(bot.current_capital - bot.initial_capital)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Allocation</span>
                    <span className="text-gray-300">{bot.allocation_percent}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </TooltipProvider>
  );
};