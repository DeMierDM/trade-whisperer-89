import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, RefreshCw, TrendingUp, TrendingDown, BarChart3, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProfessionalTradingChartProps {
  symbol: string;
  onSymbolChange?: (symbol: string) => void;
}

interface ChartBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface OptionContract {
  symbol: string;
  type: 'call' | 'put';
  strike: number;
  bid: number;
  ask: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  impliedVolatility: number;
  volume: number;
  openInterest: number;
  spread: number;
  spreadPercent: number;
  midPrice: number;
  intrinsicValue: number;
  timeValue: number;
  lastTrade: {
    price: number;
    time: string;
    size: number;
  };
}

interface ChartData {
  success: boolean;
  symbol: string;
  bars: ChartBar[];
  summary: {
    firstPrice: number;
    lastPrice: number;
    priceChange: number;
    priceChangePercent: number;
    totalVolume: number;
  };
  latestQuote?: {
    price: number;
    bid: number;
    ask: number;
  };
}

interface OptionsData {
  success: boolean;
  symbol: string;
  currentPrice: number;
  contracts: OptionContract[];
  summary: {
    totalContracts: number;
    callContracts: number;
    putContracts: number;
    atmStrike: number;
    totalVolume: number;
    averageIV: number;
  };
}

const ProfessionalTradingChart: React.FC<ProfessionalTradingChartProps> = ({ 
  symbol, 
  onSymbolChange 
}) => {
  const { toast } = useToast();
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candlestickSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);

  const [chartData, setChartData] = useState<ChartData | null>(null);
  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
  const [showVolume, setShowVolume] = useState(true);
  const [timeframe, setTimeframe] = useState('1m');
  const [selectedExpiry, setSelectedExpiry] = useState<string>('');

  // Initialize TradingView chart
  useEffect(() => {
    const initChart = async () => {
      if (!chartContainerRef.current) return;

      try {
        // Import TradingView library components
        const { createChart, ColorType, CandlestickSeries, HistogramSeries } = await import('lightweight-charts');

        // Create chart
        const chart = createChart(chartContainerRef.current, {
          width: chartContainerRef.current.clientWidth,
          height: 500,
          layout: {
            background: { type: ColorType.Solid, color: '#1a1a1a' },
            textColor: '#d1d5db',
          },
          grid: {
            vertLines: { color: '#2d2d2d' },
            horzLines: { color: '#2d2d2d' },
          },
          crosshair: {
            mode: 1,
          },
          rightPriceScale: {
            borderColor: '#485158',
          },
          timeScale: {
            borderColor: '#485158',
            timeVisible: true,
            secondsVisible: false,
          },
        });

        // Create candlestick series
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: '#22c55e',
          downColor: '#ef4444',
          borderUpColor: '#22c55e',
          borderDownColor: '#ef4444',
          wickUpColor: '#22c55e',
          wickDownColor: '#ef4444',
        });

        // Create volume series
        const volumeSeries = chart.addSeries(HistogramSeries, {
          color: '#64748b',
          priceFormat: {
            type: 'volume',
          },
          priceScaleId: 'volume',
        });

        // Set volume price scale
        chart.priceScale('volume').applyOptions({
          scaleMargins: {
            top: 0.7,
            bottom: 0,
          },
        });

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;
        volumeSeriesRef.current = volumeSeries;

        // Handle resize
        const handleResize = () => {
          if (chart && chartContainerRef.current) {
            chart.applyOptions({
              width: chartContainerRef.current.clientWidth,
            });
          }
        };

        window.addEventListener('resize', handleResize);

        console.log('📊 [Professional Chart] Initialized successfully');

      } catch (error) {
        console.error('📊 [Professional Chart] Initialization failed:', error);
      }
    };

    initChart();

    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, []);

  // Fetch chart data
  const fetchChartData = useCallback(async () => {
    if (!symbol) return;
    
    setLoading(true);
    try {
      console.log(`📊 [Professional Chart] Fetching data for ${symbol}`);
      
      const response = await fetch('/api/trading-chart-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, timeframe }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: ChartData = await response.json();
      
      if (!data.success) {
        throw new Error('Failed to fetch chart data');
      }

      setChartData(data);

      // Update chart with new data
      if (candlestickSeriesRef.current && volumeSeriesRef.current) {
        const candlestickData = data.bars.map(bar => ({
          time: bar.time,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        }));

        const volumeData = data.bars.map(bar => ({
          time: bar.time,
          value: bar.volume,
          color: bar.close >= bar.open ? '#22c55e80' : '#ef444480',
        }));

        candlestickSeriesRef.current.setData(candlestickData);
        
        if (showVolume) {
          volumeSeriesRef.current.setData(volumeData);
        }

        // Fit content
        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      }

      console.log(`📊 [Professional Chart] Loaded ${data.bars.length} bars for ${symbol}`);
      
      toast({
        title: '📊 Chart Updated',
        description: `Loaded ${data.bars.length} bars for ${symbol}`,
      });

    } catch (error: any) {
      console.error('📊 [Professional Chart] Error:', error);
      toast({
        title: 'Chart Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [symbol, timeframe, showVolume, toast]);

  // Fetch options data
  const fetchOptionsData = useCallback(async () => {
    if (!symbol) return;
    
    setOptionsLoading(true);
    try {
      console.log(`⚡ [Options Matrix] Fetching data for ${symbol}`);
      
      const response = await fetch('/api/options-matrix-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbol, 
          expiration: selectedExpiry || undefined 
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: OptionsData = await response.json();
      
      if (!data.success) {
        throw new Error('Failed to fetch options data');
      }

      setOptionsData(data);
      
      console.log(`⚡ [Options Matrix] Loaded ${data.contracts.length} contracts for ${symbol}`);
      
      toast({
        title: '⚡ Options Updated',
        description: `Loaded ${data.contracts.length} contracts for ${symbol}`,
      });

    } catch (error: any) {
      console.error('⚡ [Options Matrix] Error:', error);
      toast({
        title: 'Options Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setOptionsLoading(false);
    }
  }, [symbol, selectedExpiry, toast]);

  // Load data on symbol change
  useEffect(() => {
    fetchChartData();
    fetchOptionsData();
  }, [fetchChartData, fetchOptionsData]);

  // Toggle volume display
  const toggleVolume = useCallback(() => {
    setShowVolume(prev => {
      const newValue = !prev;
      if (volumeSeriesRef.current) {
        if (newValue && chartData) {
          const volumeData = chartData.bars.map(bar => ({
            time: bar.time,
            value: bar.volume,
            color: bar.close >= bar.open ? '#22c55e80' : '#ef444480',
          }));
          volumeSeriesRef.current.setData(volumeData);
        } else {
          volumeSeriesRef.current.setData([]);
        }
      }
      return newValue;
    });
  }, [chartData]);

  return (
    <div className="space-y-4">
      {/* Chart Controls */}
      <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border">
        <div className="flex items-center gap-4">
          {/* Symbol Selector */}
          <div className="flex items-center gap-2">
            <label htmlFor="symbol-selector" className="text-sm font-medium">Symbol:</label>
            <select 
              id="symbol-selector"
              title="Select trading symbol"
              value={symbol} 
              onChange={(e) => onSymbolChange?.(e.target.value)}
              className="px-3 py-1 bg-background border rounded text-sm min-w-[80px]"
            >
              <option value="SPY">SPY</option>
              <option value="QQQ">QQQ</option>
              <option value="IWM">IWM</option>
              <option value="DIA">DIA</option>
              <option value="VIX">VIX</option>
              <option value="AAPL">AAPL</option>
              <option value="MSFT">MSFT</option>
              <option value="NVDA">NVDA</option>
              <option value="TSLA">TSLA</option>
            </select>
          </div>

          {/* Timeframe Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Timeframe:</label>
            <div className="flex gap-1">
              {['1m', '5m', '15m', '30m', '1h'].map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    timeframe === tf 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-background border hover:bg-muted'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Current Price Display */}
          {chartData && (
            <div className="flex items-center gap-3 px-4 py-2 bg-background rounded border">
              <span className="font-semibold text-lg">{symbol}</span>
              <span className="text-2xl font-bold">
                ${chartData.summary.lastPrice.toFixed(2)}
              </span>
              <div className={`flex items-center gap-1 ${
                chartData.summary.priceChange >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
                {chartData.summary.priceChange >= 0 ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
                <span className="font-medium">
                  {chartData.summary.priceChangePercent >= 0 ? '+' : ''}
                  {chartData.summary.priceChangePercent.toFixed(2)}%
                </span>
              </div>
              {chartData.latestQuote && (
                <div className="text-sm text-muted-foreground">
                  <div>Bid: ${chartData.latestQuote.bid.toFixed(2)}</div>
                  <div>Ask: ${chartData.latestQuote.ask.toFixed(2)}</div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={showVolume ? "default" : "outline"}
            size="sm"
            onClick={toggleVolume}
          >
            <BarChart3 className="w-4 h-4 mr-1" />
            Volume
          </Button>
          <Button variant="outline" size="sm" onClick={fetchChartData} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-12 gap-4">
        {/* Chart Panel */}
        <Card className="col-span-8 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {symbol} • {timeframe} • TradingView
            </h2>
            {loading && <Loader2 className="w-5 h-5 animate-spin" />}
          </div>
          
          <div 
            ref={chartContainerRef}
            className="w-full h-[500px] bg-gray-900 rounded-lg"
          />
          
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-white">Loading chart data...</p>
              </div>
            </div>
          )}
        </Card>

        {/* Options Matrix Panel */}
        <Card className="col-span-4 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Options Matrix</h2>
            {optionsLoading && <Loader2 className="w-5 h-5 animate-spin" />}
          </div>

          <Tabs defaultValue="chain" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="chain">Chain</TabsTrigger>
              <TabsTrigger value="greeks">Greeks</TabsTrigger>
            </TabsList>

            <TabsContent value="chain" className="space-y-4">
              {optionsData && (
                <div className="text-sm space-y-2">
                  <div className="text-xs text-muted-foreground grid grid-cols-5 gap-1 px-2 py-1 border-b">
                    <span>Strike</span>
                    <span className="text-right">Bid</span>
                    <span className="text-right">Ask</span>
                    <span className="text-right">Vol</span>
                    <span className="text-right">OI</span>
                  </div>
                  
                  <div className="max-h-[400px] overflow-y-auto space-y-1">
                    {optionsData.contracts
                      .filter(c => c.type === 'call')
                      .slice(0, 15)
                      .map((contract) => (
                        <div
                          key={contract.symbol}
                          className={`grid grid-cols-5 gap-1 p-2 rounded text-sm hover:bg-muted/50 cursor-pointer transition-colors ${
                            Math.abs(contract.strike - optionsData.currentPrice) < 5
                              ? 'bg-green-500/10 border border-green-500/20'
                              : 'bg-secondary/30'
                          }`}
                        >
                          <span className="font-mono">{contract.strike}C</span>
                          <span className="text-right text-green-500">${contract.bid}</span>
                          <span className="text-right text-red-500">${contract.ask}</span>
                          <span className="text-right text-xs">{(contract.volume / 1000).toFixed(0)}K</span>
                          <span className="text-right text-xs">{(contract.openInterest / 1000).toFixed(0)}K</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
              
              {optionsLoading && (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  <p className="text-muted-foreground">Loading options...</p>
                </div>
              )}
              
              {!optionsData && !optionsLoading && (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No options data available</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="greeks" className="space-y-4">
              {optionsData && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="p-3 bg-secondary/50 rounded">
                      <div className="text-muted-foreground">Current Price</div>
                      <div className="font-semibold">${optionsData.currentPrice.toFixed(2)}</div>
                    </div>
                    <div className="p-3 bg-secondary/50 rounded">
                      <div className="text-muted-foreground">ATM Strike</div>
                      <div className="font-semibold">${optionsData.summary.atmStrike}</div>
                    </div>
                    <div className="p-3 bg-secondary/50 rounded">
                      <div className="text-muted-foreground">Avg IV</div>
                      <div className="font-semibold">{optionsData.summary.averageIV.toFixed(1)}%</div>
                    </div>
                    <div className="p-3 bg-secondary/50 rounded">
                      <div className="text-muted-foreground">Total Vol</div>
                      <div className="font-semibold">{(optionsData.summary.totalVolume / 1000).toFixed(0)}K</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground grid grid-cols-6 gap-1 px-2 py-1 border-b">
                      <span>Strike</span>
                      <span className="text-right">Δ</span>
                      <span className="text-right">Γ</span>
                      <span className="text-right">Θ</span>
                      <span className="text-right">V</span>
                      <span className="text-right">IV</span>
                    </div>
                    
                    <div className="max-h-[300px] overflow-y-auto space-y-1">
                      {optionsData.contracts
                        .filter(c => c.type === 'call')
                        .slice(0, 10)
                        .map((contract) => (
                          <div
                            key={contract.symbol}
                            className="grid grid-cols-6 gap-1 p-2 rounded text-xs hover:bg-muted/50"
                          >
                            <span className="font-mono">{contract.strike}C</span>
                            <span className={`text-right ${contract.delta > 0.5 ? 'text-green-500' : 'text-orange-500'}`}>
                              {contract.delta.toFixed(2)}
                            </span>
                            <span className="text-right">{contract.gamma.toFixed(3)}</span>
                            <span className="text-right text-red-500">{contract.theta.toFixed(2)}</span>
                            <span className="text-right text-blue-500">{contract.vega.toFixed(2)}</span>
                            <span className="text-right">{contract.impliedVolatility.toFixed(0)}%</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
};

export default ProfessionalTradingChart;