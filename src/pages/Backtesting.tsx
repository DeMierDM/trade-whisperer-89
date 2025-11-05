import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Download, Eye, Loader2, BarChart3, Database, Target } from "lucide-react";
import { useBacktest } from "@/hooks/useBacktest";
import { useBacktestingData } from "@/hooks/useBacktestingData";
// LIVE WebSocket through Docker server - no direct Alpaca connections
import { useDockerWebSocket } from "@/hooks/useDockerWebSocket";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartBar } from "@/lib/timeUtils";
import { useToast } from "@/hooks/use-toast";
import { LiveTradingViewChart, ChartUpdateAPI } from "@/components/LiveTradingViewChart";
import { useLiveChartUpdates } from "@/hooks/useLiveChartUpdates";
import { ENDPOINTS } from "@/lib/apiConfig";

interface BacktestConfig {
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  timeframe: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day';
  initialCapital: number;
  commissionPerContract: number;
  slippagePct: number;
}

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



  // Chart reference and update hooks
  const backtestChartRef = useRef<ChartUpdateAPI>(null);
  const { updateWithLiveTrade, reset: resetLiveUpdates } = useLiveChartUpdates(backtestChartRef);

  // Chart data for backtesting visualization - this is the main chart state
  const [chartBars, setChartBars] = useState<ChartBar[]>([]);
  
  // Track loading states separately to avoid race conditions
  const [stockDataLoaded, setStockDataLoaded] = useState(false);
  const [optionsDataLoaded, setOptionsDataLoaded] = useState(false);

  // Live market data state for paper trading
  const [livePrice, setLivePrice] = useState<number | null>(null);
  
  // Options contract selection and data
  const [selectedContract, setSelectedContract] = useState<string>('');
  const [availableContracts, setAvailableContracts] = useState<string[]>([]);
  const [optionsData, setOptionsData] = useState<any>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);

    const [config, setConfig] = useState<BacktestConfig>({
    strategy: 'HAVWAP-Rev-v2',
    symbol: 'SPY',
    startDate: '2024-10-10',
    endDate: '2024-10-10',
    timeframe: '1Min' as '1Min' | '5Min' | '15Min' | '1Hour' | '1Day',
    initialCapital: 100000,
    commissionPerContract: 0.65,
    slippagePct: 50,
  });
  const [trades, setTrades] = useState<any[]>([]);
  const [equityCurve, setEquityCurve] = useState<any[]>([]);
  const [optionSymbols, setOptionSymbols] = useState<string[]>([]);
  const [dataPreviewMode, setDataPreviewMode] = useState(false);
  
  // Legacy manual input removed - using intelligent contract generation
  
  // DTE-based options configuration
  const [optionsConfig, setOptionsConfig] = useState({
    expiryDate: '', // YYMMDD format
    strikeRange: 5, // Number of strikes above/below ATM
    strikeSpacing: 1, // Dollar spacing between strikes
  });

  // LIVE WebSocket connection through Docker server for backtesting preview
  const {
    quotes,
    connected,
    lastError,
    forceReconnect
  } = useDockerWebSocket(optionSymbols);

  // Handle live price updates from WebSocket quotes
  useEffect(() => {
    if (!connected || !stockDataLoaded || dataPreviewMode) return;
    
    const quote = quotes.get(config.symbol);
    if (quote) {
      const price = quote.price || (quote.ask + quote.bid) / 2;
      if (price && price > 0) {
        setLivePrice(price);
        
        // Update chart directly (bypassing React) for performance
        updateWithLiveTrade({
          symbol: config.symbol,
          price: price,
          size: quote.bid_size || 100,
          timestamp: quote.timestamp
        });
      }
    }
  }, [quotes, connected, stockDataLoaded, dataPreviewMode, config.symbol, updateWithLiveTrade]);

  useEffect(() => {
    if (results) {
      loadTrades();
    }
  }, [results]);

  // Remove automatic options fetching - we'll do it sequentially
  // useEffect removed to prevent race conditions between stock and options data

  const loadTrades = async () => {
    if (!results) return;
    const tradesData = await fetchTrades(results.id);
    setTrades(tradesData);

    // Calculate equity curve
    let equity = config.initialCapital;
    const curve = [{ date: config.startDate, equity }];
    
    tradesData.forEach((trade) => {
      equity += parseFloat(trade.net_pnl ?? trade.pnl ?? 0);
      curve.push({
        date: new Date(trade.exit_timestamp || trade.exit_time).toISOString().split('T')[0],
        equity,
      });
    });
    
    setEquityCurve(curve);
  };

  // SIMPLIFIED OPTIONS FETCH: Use direct API call to working backend
  const handleFetchOptionsData = async (hasStockData = false) => {
    console.log('[SIMPLE OPTIONS] 🚀 Fetching options data...');

    if (!hasStockData && (!stockDataLoaded || chartBars.length === 0)) {
      toast({
        title: "No Stock Data",
        description: "Please fetch historical stock data first.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Simple direct API call - just like the working curl command
      const startISO = new Date(config.startDate + 'T09:30:00.000Z').toISOString();
      const endISO = new Date(config.endDate + 'T20:00:00.000Z').toISOString();
      
      console.log('[SIMPLE OPTIONS] � Making direct API call to backtesting server...');
      
      const response = await fetch(ENDPOINTS.HISTORICAL_DATA, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dataType: 'options_bars_by_date_range',
          ticker: config.symbol,
          start: startISO,
          end: endISO,
          timeframe: '1min',
          strikeRange: 5,
          strikeSpacing: 1
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('[SIMPLE OPTIONS] ✅ Received data:', {
        totalContracts: Object.keys(result.data?.bars || {}).length,
        totalBars: result.metadata?.total_bars || 0,
        sampleContracts: Object.keys(result.data?.bars || {}).slice(0, 3)
      });

      if (result.data && result.data.bars) {
        const contractsList = Object.keys(result.data.bars);
        
        // Store options data in local state
        setOptionsData({
          bars: result.data.bars,
          totalBars: result.metadata?.total_bars || 0,
          symbolsWithData: contractsList.length,
          dateRange: {
            start: config.startDate,
            end: config.endDate
          }
        });
        
        setAvailableContracts(contractsList);
        setSelectedContract(contractsList[0] || '');
        setOptionsDataLoaded(true);
        setOptionsError(null);
        
        toast({
          title: "Options Data Loaded!",
          description: `Loaded ${contractsList.length} contracts with ${result.metadata?.total_bars || 0} bars.`,
        });

        return result;
      } else {
        throw new Error('No options data received');
      }
    } catch (error) {
      console.error('[SIMPLE OPTIONS] Error:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch options data";
      setOptionsError(errorMessage);
      toast({
        title: "Options Fetch Failed",
        description: errorMessage,
        variant: "destructive"
      });
      throw error;  
    }
  };



  const handleFetchData = async () => {
    if (!config.symbol || !config.startDate || !config.endDate) {
      toast({
        title: "Missing Configuration",
        description: "Please provide symbol, start date, and end date.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Reset states
      setStockDataLoaded(false);
      setOptionsDataLoaded(false);
      setChartBars([]);
      setAvailableContracts([]);
      setSelectedContract('');

      console.log('[SIMPLE FETCH] 📊 Fetching stock data for', config.symbol);
      console.log('[SIMPLE FETCH] 📅 Date range:', config.startDate, 'to', config.endDate);
      console.log('[SIMPLE FETCH] 🔧 Full config:', JSON.stringify(config, null, 2));
      
      // Fetch stock data
      const stockData = await fetchHistoricalData({
        symbol: config.symbol,
        startDate: config.startDate,
        endDate: config.endDate,
        timeframe: config.timeframe
      });

      if (!stockData || !stockData.bars || stockData.bars.length === 0) {
        throw new Error('No stock data received');
      }

      // Load stock data to chart
      setChartBars(stockData.bars);
      setStockDataLoaded(true);

      toast({
        title: "Stock Data Loaded",
        description: `Loaded ${stockData.totalBars} bars. Now fetching options...`,
      });

      // Fetch options data immediately (no timeout needed)
      console.log('[SIMPLE FETCH] 🎯 Fetching options data...');
      console.log('[SIMPLE FETCH] Stock data loaded:', stockData.bars.length, 'bars');
      const optionsResult = await handleFetchOptionsData(true);
      
      if (optionsResult && optionsResult.data && optionsResult.data.bars) {
        const contracts = Object.keys(optionsResult.data.bars);
        setAvailableContracts(contracts);
        setSelectedContract(contracts[0] || '');
        setOptionsDataLoaded(true);
        
        toast({
          title: "Complete!",
          description: `Loaded stock data and ${contracts.length} option contracts.`,
        });
      }

    } catch (error) {
      console.error('[SIMPLE FETCH] Error:', error);
      toast({
        title: "Fetch Failed",
        description: error instanceof Error ? error.message : "Failed to fetch data",
        variant: "destructive"
      });
    }
  };

  const handleRunBacktest = () => {
    console.log('[BACKTESTING] Running backtest - backend will handle data fetching');
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
                  aria-label="Strategy"
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
                  aria-label="Timeframe"
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

              {/* Legacy manual input removed - using sequential approach now */}



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
                        setOptionsData(null);
                      setOptionsError(null);
                      setOptionsDataLoaded(false);
                      setAvailableContracts([]);
                      setSelectedContract('');
                      }}
                      className="h-6 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-xs text-orange-600 mt-1">
                    {optionsData?.totalBars || 0} bars for {optionsData?.symbolsWithData || 0} contracts ({optionsData?.dateRange?.start || ''} to {optionsData?.dateRange?.end || ''})
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
                    Fetch Data & Generate Options
                  </>
                )}
              </Button>

              {stockDataLoaded && chartBars.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-green-500" />
                      <span className="text-sm font-medium text-green-500">Stock Data Ready</span>
                      {optionsDataLoaded && <span className="text-xs text-green-600">+ Options</span>}
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        clearData();
                        setChartBars([]);
                        setStockDataLoaded(false);
                        setOptionsDataLoaded(false);
                        setAvailableContracts([]);
                        setSelectedContract('');
                        setOptionsData(null);
                        setOptionsError(null);
                      }}
                      className="h-6 px-2 text-xs"
                    >
                      Clear
                    </Button>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    {chartBars.length} bars loaded ({config.startDate} to {config.endDate})
                  </p>
                </div>
              )}

              {/* Options Contracts Dropdown */}
              {optionsDataLoaded && availableContracts.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-medium text-blue-500">Options Contracts</span>
                      <Badge variant="outline" className="text-xs">
                        {availableContracts.length} contracts
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="contract-select" className="text-xs font-medium">
                      Select Contract to Preview:
                    </Label>
                    <select
                      id="contract-select"
                      value={selectedContract}
                      onChange={(e) => setSelectedContract(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      title="Select options contract"
                    >
                      <option value="">-- Select Contract --</option>
                      {availableContracts.map((contract) => {
                        const barsCount = optionsData?.bars?.[contract]?.length || 0;
                        return (
                          <option key={contract} value={contract}>
                            {contract} ({barsCount} bars)
                          </option>
                        );
                      })}
                    </select>
                    
                    {selectedContract && (
                      <div className="mt-2 p-2 bg-background/50 rounded border text-xs">
                        <p className="font-medium text-blue-600">Selected: {selectedContract}</p>
                        <p className="text-muted-foreground mt-1">
                          Bars available: {optionsData?.bars?.[selectedContract]?.length || 0}
                        </p>
                        <p className="text-muted-foreground">
                          Contract type: {selectedContract.includes('C') ? 'Call' : selectedContract.includes('P') ? 'Put' : 'Unknown'}
                        </p>
                      </div>
                    )}
                    
                    {/* Contract Summary */}
                    <div className="mt-2 p-2 bg-background/20 rounded border-dashed border text-xs">
                      <p className="font-medium">Contract Summary:</p>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <span>Total Contracts: {availableContracts.length}</span>
                        <span>Total Bars: {optionsData?.totalBars || 0}</span>
                        <span>Calls: {availableContracts.filter(c => c.includes('C')).length}</span>
                        <span>Puts: {availableContracts.filter(c => c.includes('P')).length}</span>
                      </div>
                    </div>
                  </div>
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

            {/* Chart Display Area */}
            <div className="space-y-4">
              {/* Stock Price Chart */}
              <div className="h-[300px] bg-background/50 rounded-lg border border-border p-4">
                {stockDataLoaded && chartBars.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold">Price Chart - {config.symbol}</h3>
                      <Badge variant="outline">
                        {chartBars.length} bars loaded
                      </Badge>
                    </div>
                    <div className="h-[250px] overflow-hidden w-full">
                      <LiveTradingViewChart
                        ref={backtestChartRef}
                        symbol={config.symbol}
                        bars={chartBars}
                        height={250}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <Database className="w-12 h-12 text-muted-foreground mb-3" />
                    <p className="text-muted-foreground text-center">
                      {dataLoading ? 'Fetching historical data...' : 
                       'Fetch historical data to preview market data'}
                    </p>
                  </div>
                )}
              </div>

              {/* Equity Curve Chart */}
              {equityCurve.length > 0 && (
                <div className="h-[250px] bg-background/50 rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold">Equity Curve</h3>
                    <Badge variant="outline">
                      {trades.length} trades
                    </Badge>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
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
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Data Stats or Metrics Grid */}
            {stockDataLoaded && chartBars.length > 0 && !results && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { 
                    label: "Total Bars", 
                    value: chartBars.length.toLocaleString(), 
                    positive: null 
                  },
                  { 
                    label: "First Price", 
                    value: chartBars[0]?.close ? `$${chartBars[0].close.toFixed(2)}` : 'N/A', 
                    positive: null 
                  },
                  { 
                    label: "Last Price", 
                    value: chartBars[chartBars.length - 1]?.close ? 
                      `$${chartBars[chartBars.length - 1].close.toFixed(2)}` : 'N/A', 
                    positive: null 
                  },
                  { 
                    label: "Price Change", 
                    value: chartBars.length >= 2 && chartBars[0]?.close && chartBars[chartBars.length - 1]?.close ? 
                      `${((chartBars[chartBars.length - 1].close - chartBars[0].close) / chartBars[0].close * 100).toFixed(2)}%` : 
                      'N/A',
                    positive: chartBars.length >= 2 && chartBars[0]?.close && chartBars[chartBars.length - 1]?.close ? 
                      chartBars[chartBars.length - 1].close > chartBars[0].close : 
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
                      {optionsData?.symbolsWithData || 0}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                    <p className="text-sm text-muted-foreground">Total Bars</p>
                    <p className="text-2xl font-bold mt-1 text-orange-500">
                      {(optionsData?.totalBars || 0).toLocaleString()}
                    </p>
                  </div>
                </div>
                
                {/* Options symbols list */}
                <div className="mt-4 p-3 rounded-lg bg-secondary/30 border border-border">
                  <p className="text-sm font-medium mb-2">Loaded Contracts:</p>
                  <div className="flex flex-wrap gap-2">
                    {availableContracts.slice(0, 6).map(symbol => (
                      <Badge key={symbol} variant="outline" className="text-xs">
                        {symbol}
                      </Badge>
                    ))}
                    {availableContracts.length > 6 && (
                      <Badge variant="outline" className="text-xs">
                        +{availableContracts.length - 6} more
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
                  { label: "Total Return", value: `${(results.totalReturn || 0) >= 0 ? '+' : ''}${(results.totalReturn || 0).toFixed(2)}%`, positive: (results.totalReturn || 0) >= 0 },
                  { label: "Sharpe Ratio", value: (results.sharpeRatio || 0).toFixed(2), positive: (results.sharpeRatio || 0) > 0 },
                  { label: "Max Drawdown", value: `-${Math.abs(results.maxDrawdown || 0).toFixed(2)}%`, positive: false },
                  { label: "Win Rate", value: `${(results.winRate || 0).toFixed(1)}%`, positive: (results.winRate || 0) > 50 },
                  { label: "Total Trades", value: (results.totalTrades || 0).toString(), positive: null },
                  { label: "Avg Win", value: `$${Math.abs(results.avgWin || 0).toFixed(0)}`, positive: true },
                  { label: "Avg Loss", value: `-$${Math.abs(results.avgLoss || 0).toFixed(0)}`, positive: false },
                  { label: "Profit Factor", value: (results.profitFactor || 0).toFixed(2), positive: (results.profitFactor || 0) > 1 },
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
                      <p className="text-sm font-medium">{trade.contract_symbol || trade.symbol}</p>
                      <Badge variant="outline" className="mt-1 text-xs">{trade.option_type || trade.side}</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Entry</p>
                      <p className="text-sm">{new Date(trade.entry_timestamp || trade.entry_time).toLocaleTimeString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Exit</p>
                      <p className="text-sm">{new Date(trade.exit_timestamp || trade.exit_time).toLocaleTimeString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">P&L</p>
                      <p className={`text-sm font-medium ${(Number(trade.net_pnl) || Number(trade.pnl) || 0) >= 0 ? "text-success" : "text-danger"}`}>
                        {(Number(trade.net_pnl) || Number(trade.pnl) || 0) >= 0 ? '+' : ''}${(Number(trade.net_pnl) || Number(trade.pnl) || 0).toFixed(0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Return</p>
                      <p className={`text-sm font-medium ${(parseFloat(trade.return_pct) * 100) >= 0 ? "text-success" : "text-danger"}`}>
                        {(parseFloat(trade.return_pct) * 100) >= 0 ? '+' : ''}{(parseFloat(trade.return_pct) * 100).toFixed(1)}%
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
              {lastError && (
                <div className="mt-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-500">{lastError}</p>
                </div>
              )}
            </div>

            {/* Live Stock Chart */}
            {stockDataLoaded && chartBars.length > 0 && (
              <Card className="p-4 bg-gradient-card border-border shadow-card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{config.symbol}</h3>
                    {livePrice && (
                      <span className="text-lg font-mono">
                        ${livePrice.toFixed(2)}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline">1m • LIVE</Badge>
                </div>
                <div className="h-[400px] overflow-hidden w-full">
                  <LiveTradingViewChart
                    ref={backtestChartRef}
                    symbol={config.symbol}
                    bars={chartBars}
                    currentPrice={livePrice || undefined}
                    height={400}
                  />
                </div>
              </Card>
            )}

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
                      aria-label="Paper Trading Strategy"
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
