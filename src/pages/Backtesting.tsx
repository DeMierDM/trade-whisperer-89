import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Download, Eye, Loader2, BarChart3, Database, Target } from "lucide-react";
import { useBacktest } from "@/hooks/useBacktest";
import { useBacktestingData } from "@/hooks/useBacktestingData";
import { useOptionsByDTE } from "@/hooks/useOptionsByDTE";
// LIVE WebSocket through Docker server - no direct Alpaca connections
import { useDockerWebSocket } from "@/hooks/useDockerWebSocket";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartBar } from "@/lib/timeUtils";
import { useToast } from "@/hooks/use-toast";

const Backtesting = () => {
  const { toast } = useToast();
  const { loading, results, runBacktest, fetchTrades } = useBacktest();
  const { 
    loading: dataLoading, 
    error: dataError, 
    data: historicalData, 
    fetchHistoricalData,
    clearData 
  } = useBacktestingData();

  const {
    loading: optionsLoading,
    error: optionsError,
    data: optionsData,
    fetchOptionsByDTE,
    clearData: clearOptionsData,
    getSymbols: getOptionSymbols
  } = useOptionsByDTE();

  const [config, setConfig] = useState({
    strategy: 'HAVWAP-Rev-v2',
    symbol: 'SPY',
    startDate: '2024-01-01',
    endDate: '2024-03-28',
    timeframe: '1Min' as '1Min' | '5Min' | '15Min' | '1Hour' | '1Day',
    initialCapital: 100000,
    commissionPerContract: 0.65,
    slippagePct: 50,
  });
  const [trades, setTrades] = useState<any[]>([]);
  const [equityCurve, setEquityCurve] = useState<any[]>([]);
  const [optionSymbols, setOptionSymbols] = useState<string[]>([]);
  const [dataPreviewMode, setDataPreviewMode] = useState(false);
  
  // DTE-based options configuration
  const [optionsConfig, setOptionsConfig] = useState({
    expiryDate: '', // YYMMDD format
    strikeRange: 5, // Number of strikes above/below ATM
    strikeSpacing: 5, // Dollar spacing between strikes
  });

  // LIVE WebSocket connection through Docker server for backtesting preview
  const {
    quotes,
    connected,
    lastError,
    forceReconnect
  } = useDockerWebSocket(optionSymbols);

  useEffect(() => {
    if (results) {
      loadTrades();
    }
  }, [results]);

  const loadTrades = async () => {
    if (!results) return;
    const tradesData = await fetchTrades(results.id);
    setTrades(tradesData);

    // Calculate equity curve
    let equity = config.initialCapital;
    const curve = [{ date: config.startDate, equity }];
    
    tradesData.forEach((trade) => {
      equity += trade.pnl;
      curve.push({
        date: new Date(trade.exit_time).toISOString().split('T')[0],
        equity,
      });
    });
    
    setEquityCurve(curve);
  };

  const handleFetchOptionsData = async () => {
    if (!optionContractsInput.trim()) {
      toast({
        title: "No Option Symbols",
        description: "Please enter option symbols to fetch data for.",
        variant: "destructive"
      });
      return;
    }

    // Parse comma-separated option symbols
    const symbols = optionContractsInput.split(',').map(s => s.trim()).filter(s => s);
    
    // Validate option symbol format (e.g., SPY251010C00653000)
    const invalidSymbols = symbols.filter(symbol => !symbol.match(/^[A-Z]+\d{6}[CP]\d{8}$/));
    
    if (invalidSymbols.length > 0) {
      toast({
        title: "Invalid Option Symbols",
        description: `Invalid format: ${invalidSymbols.join(', ')}. Use format like SPY251010C00653000`,
        variant: "destructive"
      });
      return;
    }

    console.log('[BACKTESTING] Fetching options data for symbols:', symbols);
    
    const result = await fetchOptionsData({
      symbols: symbols,
      startDate: config.startDate,
      endDate: config.endDate,
      timeframe: config.timeframe === '1Min' ? '1min' : 
                 config.timeframe === '5Min' ? '5min' :
                 config.timeframe === '15Min' ? '15min' :
                 config.timeframe === '1Hour' ? '1hour' : '1day',
      limit: 1000
    });

    if (result) {
      toast({
        title: "Options Data Loaded",
        description: `Loaded ${result.totalBars} bars for ${result.totalSymbols} option contracts`,
      });
    } else if (optionsError) {
      toast({
        title: "Options Data Fetch Failed",
        description: optionsError,
        variant: "destructive"
      });
    }
  };

  };

  const handleFetchData = async () => {

  const handleRunBacktest = () => {
    if (!historicalData) {
      toast({
        title: "No Data Available",
        description: "Please fetch historical data first before running a backtest.",
        variant: "destructive"
      });
      return;
    }
    
    console.log('[BACKTESTING] Running backtest with', historicalData.totalBars, 'bars');
    runBacktest(config);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Backtesting & Paper Trading</h1>
          <p className="text-muted-foreground">Test strategies on historical data or run live with paper trading</p>
        </div>

        {/* Mode Selector */}
        <Tabs defaultValue="historical" className="w-full">
          <TabsList className="bg-secondary">
            <TabsTrigger value="historical">Historical Backtest</TabsTrigger>
            <TabsTrigger value="paper">Live Paper Trading</TabsTrigger>
          </TabsList>

          <TabsContent value="historical" className="space-y-4 mt-4">
        <div className="grid grid-cols-12 gap-4">
          {/* Configuration Panel */}
          <Card className="col-span-4 p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4">Configuration</h2>
            <div className="space-y-4">
              <div>
                <Label>Strategy</Label>
                <select 
                  className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground"
                  value={config.strategy}
                  onChange={(e) => setConfig({ ...config, strategy: e.target.value })}
                >
                  <option value="HAVWAP-Rev-v2">HAVWAP-Rev-v2</option>
                  <option value="Delta-Bucket-Trend">Delta-Bucket-Trend</option>
                  <option value="ATM-Scalp-v1">ATM-Scalp-v1</option>
                </select>
              </div>

              <div>
                <Label>Symbol</Label>
                <Input 
                  placeholder="SPY" 
                  className="mt-1"
                  value={config.symbol}
                  onChange={(e) => setConfig({ ...config, symbol: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input 
                    type="date" 
                    className="mt-1"
                    value={config.startDate}
                    onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input 
                    type="date" 
                    className="mt-1"
                    value={config.endDate}
                    onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Timeframe</Label>
                <select 
                  className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground"
                  value={config.timeframe}
                  onChange={(e) => setConfig({ ...config, timeframe: e.target.value as any })}
                >
                  <option value="1Min">1 minute (high detail)</option>
                  <option value="5Min">5 minutes (balanced)</option>
                  <option value="15Min">15 minutes (fast)</option>
                  <option value="1Hour">1 hour (overview)</option>
                  <option value="1Day">1 day (daily candles)</option>
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Lower timeframes provide more detail but take longer to fetch
                </p>
              </div>

              <div>
                <Label>Initial Capital</Label>
                <Input 
                  type="number"
                  className="mt-1"
                  value={config.initialCapital}
                  onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })}
                />
              </div>

              <div>
                <Label>Commission per Contract</Label>
                <Input 
                  type="number"
                  step="0.01"
                  className="mt-1"
                  value={config.commissionPerContract}
                  onChange={(e) => setConfig({ ...config, commissionPerContract: Number(e.target.value) })}
                />
              </div>

              <div>
                <Label>Slippage (% of spread)</Label>
                <Input 
                  type="number"
                  className="mt-1"
                  value={config.slippagePct}
                  onChange={(e) => setConfig({ ...config, slippagePct: Number(e.target.value) })}
                />
              </div>

              <div>
                <Label>Option Contracts (comma-separated)</Label>
                <Input 
                  placeholder="SPY251010C00653000,SPY251010P00653000" 
                  className="mt-1"
                  value={optionContractsInput}
                  onChange={(e) => setOptionContractsInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter option symbols in format: SYMBOL + YYMMDD + C/P + STRIKE (e.g., SPY251010C00653000)
                </p>
              </div>

              <Button 
                className="w-full mt-3 bg-orange-600 hover:bg-orange-700 shadow-glow"
                onClick={handleFetchOptionsData}
                disabled={optionsLoading || !optionContractsInput.trim() || !config.startDate || !config.endDate}
              >
                {optionsLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Fetching Options...
                  </>
                ) : (
                  <>
                    <Target className="w-4 h-4 mr-2" />
                    Fetch Options Data
                  </>
                )}
              </Button>

              {optionsData && (
                <div className="mt-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-orange-500">Options Ready</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        clearOptionsData();
                      }}
                      className="h-6 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-xs text-orange-600 mt-1">
                    {optionsData.totalBars} bars for {optionsData.totalSymbols} contracts ({optionsData.dateRange.start} to {optionsData.dateRange.end})
                  </p>
                </div>
              )}

              {optionsError && (
                <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-500">{optionsError}</p>
                </div>
              )}

              <Button 
                className="w-full mt-6 bg-blue-600 hover:bg-blue-700 shadow-glow"
                onClick={handleFetchData}
                disabled={dataLoading || !config.symbol || !config.startDate || !config.endDate}
              >
                {dataLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Fetching Data...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4 mr-2" />
                    Fetch Historical Data
                  </>
                )}
              </Button>

              {historicalData && (
                <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium text-green-500">Data Ready</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        clearData();
                        setDataPreviewMode(false);
                      }}
                      className="h-6 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    {historicalData.totalBars} bars loaded ({historicalData.dateRange.start} to {historicalData.dateRange.end})
                  </p>
                </div>
              )}

              {dataError && (
                <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-500">{dataError}</p>
                </div>
              )}

              <Button 
                className="w-full mt-3 bg-gradient-primary shadow-glow"
                onClick={handleRunBacktest}
                disabled={loading || !historicalData}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run Backtest
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Results Panel */}
          <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Results</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <Button variant="outline" size="sm">
                  <Eye className="w-4 h-4 mr-2" />
                  Replay
                </Button>
              </div>
            </div>

            {/* Data Preview or Equity Curve */}
            <div className="h-[300px] bg-background/50 rounded-lg border border-border mb-6 p-4">
              {dataPreviewMode && historicalData && !results ? (
                // Data Preview Mode - Show OHLC data
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Historical Data Preview</h3>
                    <Badge variant="outline">
                      {historicalData.totalBars} bars loaded
                    </Badge>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historicalData.bars.slice(-100)}> {/* Last 100 bars for performance */}
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="time" 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 10 }}
                      />
                      <YAxis 
                        stroke="hsl(var(--muted-foreground))"
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                          fontSize: '12px'
                        }}
                        labelFormatter={(label) => `Time: ${label}`}
                        formatter={(value: number, name: string) => [
                          `$${value.toFixed(2)}`, 
                          name.charAt(0).toUpperCase() + name.slice(1)
                        ]}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="close" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={1.5}
                        dot={false}
                        name="close"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : equityCurve.length > 0 ? (
                // Backtest Results Mode - Show Equity Curve
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Equity Curve</h3>
                    <Badge variant="outline">
                      {trades.length} trades
                    </Badge>
                  </div>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={equityCurve}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="equity" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <Database className="w-12 h-12 text-muted-foreground mb-3" />
                  <p className="text-muted-foreground text-center">
                    {dataLoading ? 'Fetching historical data...' : 
                     loading ? 'Running backtest...' : 
                     'Fetch historical data to preview market data'}
                  </p>
                  {!historicalData && !dataLoading && (
                    <p className="text-xs text-muted-foreground mt-1 text-center">
                      Configure your parameters and click "Fetch Historical Data" to get started
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Data Stats or Metrics Grid */}
            {historicalData && !results && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { 
                    label: "Total Bars", 
                    value: historicalData.totalBars.toLocaleString(), 
                    positive: null 
                  },
                  { 
                    label: "First Price", 
                    value: historicalData.bars[0]?.close ? `$${historicalData.bars[0].close.toFixed(2)}` : 'N/A', 
                    positive: null 
                  },
                  { 
                    label: "Last Price", 
                    value: historicalData.bars[historicalData.bars.length - 1]?.close ? 
                      `$${historicalData.bars[historicalData.bars.length - 1].close.toFixed(2)}` : 'N/A', 
                    positive: null 
                  },
                  { 
                    label: "Price Change", 
                    value: historicalData.bars.length >= 2 && historicalData.bars[0]?.close && historicalData.bars[historicalData.bars.length - 1]?.close ? 
                      `${((historicalData.bars[historicalData.bars.length - 1].close - historicalData.bars[0].close) / historicalData.bars[0].close * 100).toFixed(2)}%` : 
                      'N/A',
                    positive: historicalData.bars.length >= 2 && historicalData.bars[0]?.close && historicalData.bars[historicalData.bars.length - 1]?.close ? 
                      historicalData.bars[historicalData.bars.length - 1].close > historicalData.bars[0].close : 
                      null
                  },
                ].map((stat) => (
                  <div key={stat.label} className="p-4 rounded-lg bg-secondary/50 border border-border">
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      stat.positive === true ? "text-success" :
                      stat.positive === false ? "text-danger" : ""
                    }`}>
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Options Data Stats */}
            {optionsData && !results && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Target className="w-5 h-5 text-orange-500" />
                  Options Data Summary
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <p className="text-sm text-muted-foreground">Total Contracts</p>
                    <p className="text-2xl font-bold mt-1 text-orange-500">
                      {optionsData.totalSymbols}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <p className="text-sm text-muted-foreground">Total Bars</p>
                    <p className="text-2xl font-bold mt-1 text-orange-500">
                      {optionsData.totalBars.toLocaleString()}
                    </p>
                  </div>
                </div>
                
                {/* Options symbols list */}
                <div className="mt-4 p-3 rounded-lg bg-secondary/30 border border-border">
                  <p className="text-sm font-medium mb-2">Loaded Contracts:</p>
                  <div className="flex flex-wrap gap-2">
                    {getOptionSymbols().slice(0, 6).map(symbol => (
                      <Badge key={symbol} variant="outline" className="text-xs">
                        {symbol}
                      </Badge>
                    ))}
                    {getOptionSymbols().length > 6 && (
                      <Badge variant="outline" className="text-xs">
                        +{getOptionSymbols().length - 6} more
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Backtest Metrics Grid */}
            {results && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Total Return", value: `${results.totalReturn >= 0 ? '+' : ''}${results.totalReturn.toFixed(2)}%`, positive: results.totalReturn >= 0 },
                  { label: "Sharpe Ratio", value: results.sharpeRatio.toFixed(2), positive: results.sharpeRatio > 0 },
                  { label: "Max Drawdown", value: `-${results.maxDrawdown.toFixed(2)}%`, positive: false },
                  { label: "Win Rate", value: `${results.winRate.toFixed(1)}%`, positive: results.winRate > 50 },
                  { label: "Total Trades", value: results.totalTrades.toString(), positive: null },
                  { label: "Avg Win", value: `$${results.avgWin.toFixed(0)}`, positive: true },
                  { label: "Avg Loss", value: `-$${Math.abs(results.avgLoss).toFixed(0)}`, positive: false },
                  { label: "Profit Factor", value: results.profitFactor.toFixed(2), positive: results.profitFactor > 1 },
                ].map((metric) => (
                  <div key={metric.label} className="p-4 rounded-lg bg-secondary/50 border border-border">
                    <p className="text-sm text-muted-foreground">{metric.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      metric.positive === true ? "text-success" :
                      metric.positive === false ? "text-danger" : ""
                    }`}>
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Trade List */}
            <h3 className="text-lg font-semibold mb-3">Trade History</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {trades.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {loading ? 'Loading trades...' : 'No trades yet'}
                </div>
              ) : (
                trades.map((trade, idx) => (
                  <div key={idx} className="grid grid-cols-7 gap-3 p-3 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all cursor-pointer">
                    <div className="col-span-2">
                      <p className="text-sm font-medium">{trade.symbol}</p>
                      <Badge variant="outline" className="mt-1 text-xs">{trade.side}</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Entry</p>
                      <p className="text-sm">{new Date(trade.entry_time).toLocaleTimeString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Exit</p>
                      <p className="text-sm">{new Date(trade.exit_time).toLocaleTimeString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">P&L</p>
                      <p className={`text-sm font-medium ${trade.pnl >= 0 ? "text-success" : "text-danger"}`}>
                        {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Return</p>
                      <p className={`text-sm font-medium ${trade.return_pct >= 0 ? "text-success" : "text-danger"}`}>
                        {trade.return_pct >= 0 ? '+' : ''}{trade.return_pct.toFixed(1)}%
                      </p>
                    </div>
                    <div className="flex items-center">
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
          </TabsContent>

          <TabsContent value="paper" className="space-y-4 mt-4">
            {/* Paper Trading Info Banner */}
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">📄 Live Paper Trading Mode</h3>
                <div className="flex items-center gap-2">
                  {connected && (
                    <Badge variant="default" className="bg-success animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-white mr-1" />
                      LIVE DATA
                    </Badge>
                  )}
                  <Badge variant="secondary">Simulated Account</Badge>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Test your bot with real-time market data using a simulated paper trading account. No real money at risk.
              </p>
            </div>

            <div className="grid grid-cols-12 gap-4">
              {/* Bot Controls */}
              <Card className="col-span-4 p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Bot Controls</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Strategy</Label>
                    <select
                      className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground"
                      value={config.strategy}
                      onChange={(e) => setConfig({ ...config, strategy: e.target.value })}
                    >
                      <option value="HAVWAP-Rev-v2">HAVWAP-Rev-v2</option>
                      <option value="Delta-Bucket-Trend">Delta-Bucket-Trend</option>
                      <option value="ATM-Scalp-v1">ATM-Scalp-v1</option>
                    </select>
                  </div>

                  <div>
                    <Label>Symbol</Label>
                    <Input
                      placeholder="SPY"
                      className="mt-1"
                      value={config.symbol}
                      onChange={(e) => setConfig({ ...config, symbol: e.target.value })}
                    />
                  </div>

                  <div>
                    <Label>Position Size</Label>
                    <Input
                      type="number"
                      className="mt-1"
                      defaultValue={1}
                    />
                  </div>

                  <div>
                    <Label>Max Risk per Trade</Label>
                    <Input
                      type="number"
                      step="0.01"
                      className="mt-1"
                      defaultValue={100}
                    />
                  </div>

                  <Button
                    className="w-full mt-6 bg-gradient-primary shadow-glow"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Start Paper Bot
                  </Button>

                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled
                  >
                    Stop Bot
                  </Button>
                </div>
              </Card>

              {/* Live Paper Trading Dashboard */}
              <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Paper Account Dashboard</h2>
                  <Badge variant="outline">
                    Account Value: $100,000.00
                  </Badge>
                </div>

                <div className="space-y-4">
                  {/* Account Stats */}
                  <div className="grid grid-cols-4 gap-4">
                    {[
                      { label: "Today's P&L", value: "$0.00", positive: null },
                      { label: "Open Positions", value: "0", positive: null },
                      { label: "Win Rate", value: "0%", positive: null },
                      { label: "Trades Today", value: "0", positive: null },
                    ].map((stat) => (
                      <div key={stat.label} className="p-3 rounded-lg bg-secondary/50 border border-border">
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="text-xl font-bold mt-1">{stat.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Open Positions */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Open Positions</h3>
                    <div className="p-8 text-center text-muted-foreground rounded-lg bg-secondary/30 border border-border">
                      No open positions. Start the bot to begin paper trading.
                    </div>
                  </div>

                  {/* Recent Trades */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Recent Trades</h3>
                    <div className="p-8 text-center text-muted-foreground rounded-lg bg-secondary/30 border border-border">
                      No trades yet. Trades will appear here when the bot executes.
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Backtesting;
