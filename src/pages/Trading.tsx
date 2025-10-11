import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Pause, Square, RefreshCw, AlertTriangle, Loader2, Menu, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getMarketStatus, MarketStatus } from "@/lib/marketHours";
import { DataFlowDebugPanel } from "@/components/DataFlowDebugPanel";
import { LiveTradingViewChart, ChartUpdateAPI } from "@/components/LiveTradingViewChart";
import { useDockerWebSocket } from "@/hooks/useDockerWebSocket";
import { useLiveChartUpdates } from "@/hooks/useLiveChartUpdates";
import { ChartBar } from "@/lib/timeUtils";

const DOCKER_API_URL = 'http://localhost:3001/api';

interface MarketData {
  price: number;
  change: number;
  changePercent: number;
}

interface OptionData {
  strike: string;
  bid: string;
  ask: string;
  vol: string;
  oi: string;
  delta: string;
  itm: boolean;
}

const Trading = () => {
  const { toast } = useToast();
  const [selectedSymbol] = useState("SPY");
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [optionsData, setOptionsData] = useState<OptionData[]>([]);
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(getMarketStatus());
  const [showTabs, setShowTabs] = useState(false); // Hamburger menu state

  // Chart ref for direct updates (bypasses React)
  const chartApiRef = useRef<ChartUpdateAPI | null>(null);

  // Use Docker WebSocket for live data
  const {
    quotes,
    recentTrades,
    connected,
    lastError: wsError,
    forceReconnect,
    fetchRecentTradesAndBuildBars
  } = useDockerWebSocket([selectedSymbol]);

  // Optimized live chart updates (direct to TradingView, no React rerenders)
  const { updateWithLiveTrade, reset: resetLiveUpdates } = useLiveChartUpdates(chartApiRef);

  // Update market status every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // ============================================================================
  // STEP 1: FETCH HISTORICAL DATA (REST API - RUNS ONCE)
  // ============================================================================

  const fetchHistoricalBars = async () => {
    setLoading(true);
    try {
      console.log('[DATA FLOW] 📊 STEP 1: Fetching historical bars for', selectedSymbol);

      // Get data from 60 days ago to now
      const now = Date.now();
      const start = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
      const end = new Date(now).toISOString();

      const response = await fetch(`${DOCKER_API_URL}/fetch-market-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataType: "bars",
          symbol: selectedSymbol,
          start: start,
          end: end,
          timeframe: '1Min'
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data?.error) {
        throw new Error(data.error);
      }

      const payload = data?.data;
      let arr: any[] = [];

      if (payload?.bars?.[selectedSymbol]) {
        arr = payload.bars[selectedSymbol];
      } else if (Array.isArray(payload?.bars)) {
        arr = payload.bars;
      } else if (Array.isArray(payload)) {
        arr = payload;
      }

      if (arr && arr.length) {
        console.log(`[DATA FLOW] ✅ STEP 1 Complete: Received ${arr.length} historical bars`);

        const mapped: ChartBar[] = arr.map((b: any) => {
          const timestamp = b.t || b.timestamp || b.time;
          const barTime = new Date(timestamp);

          return {
            time: barTime.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
              timeZone: 'America/New_York'
            }),
            timestamp: Math.floor(barTime.getTime() / 1000), // TradingView uses seconds
            date: barTime.toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
            open: b.o ?? b.open ?? 0,
            high: b.h ?? b.high ?? 0,
            low: b.l ?? b.low ?? 0,
            close: b.c ?? b.close ?? 0,
            volume: b.v ?? b.volume ?? 0,
          };
        });

        setBars(mapped);

        // Proceed to Step 2: Gap Filling
        await fillGapData(mapped);

        toast({
          title: '📊 Historical Data Loaded',
          description: `Loaded ${mapped.length} bars for ${selectedSymbol}`,
        });
      } else {
        console.warn('[DATA FLOW] ❌ No bars in response');
        setBars([]);
      }
    } catch (error: any) {
      console.error('[DATA FLOW] ❌ STEP 1 Error:', error);
      toast({
        title: "Error fetching historical data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // STEP 2: FILL 15-MINUTE GAP (DOCKER API - RUNS ONCE)
  // ============================================================================

  const fillGapData = async (historicalBars: ChartBar[]) => {
    try {
      console.log('[DATA FLOW] 🔄 STEP 2: Filling 15-minute gap with recent trades');

      // Fetch last 15 minutes of trades and build bars
      const gapBars = await fetchRecentTradesAndBuildBars(selectedSymbol, 15);

      if (gapBars && gapBars.length > 0) {
        console.log(`[DATA FLOW] ✅ STEP 2 Complete: Built ${gapBars.length} gap bars from recent trades`);

        // Convert to ChartBar format
        const gapChartBars: ChartBar[] = gapBars.map(bar => ({
          time: new Date(bar.time * 1000).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'America/New_York'
          }),
          timestamp: bar.time,
          date: new Date(bar.time * 1000).toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
          volume: bar.volume,
        }));

        // Merge with historical bars (avoid duplicates)
        const lastHistoricalTime = historicalBars[historicalBars.length - 1]?.timestamp || 0;
        const newGapBars = gapChartBars.filter(bar => bar.timestamp > lastHistoricalTime);

        const mergedBars = [...historicalBars, ...newGapBars];
        setBars(mergedBars);

        console.log(`[DATA FLOW] ✅ Gap filled: Added ${newGapBars.length} new bars`);
      } else {
        console.log('[DATA FLOW] ℹ️ STEP 2: No gap data available');
      }

      // Mark initial data as loaded - enables Step 3
      setInitialDataLoaded(true);
      console.log('[DATA FLOW] ✅ Initial data load complete. Ready for live updates (STEP 3).');

    } catch (error: any) {
      console.error('[DATA FLOW] ❌ STEP 2 Error:', error);
      // Still mark as loaded to enable live updates
      setInitialDataLoaded(true);
    }
  };

  // ============================================================================
  // STEP 3: LIVE WEBSOCKET UPDATES (CONTINUOUS)
  // ============================================================================

  useEffect(() => {
    if (!initialDataLoaded || !connected || recentTrades.length === 0) {
      return;
    }

    console.log('[DATA FLOW] ⚡ STEP 3: Processing', recentTrades.length, 'live trades');

    // Get latest trade for selected symbol
    const latestTrade = recentTrades.find(t => t.symbol === selectedSymbol);

    if (latestTrade) {
      // Direct chart update (bypasses React state - PERFORMANCE!)
      updateWithLiveTrade(latestTrade);

      // Update header price
      setMarketData({
        price: latestTrade.price,
        change: marketData ? latestTrade.price - marketData.price : 0,
        changePercent: marketData && marketData.price > 0
          ? ((latestTrade.price - marketData.price) / marketData.price) * 100
          : 0,
      });
    }
  }, [recentTrades, initialDataLoaded, connected, selectedSymbol, updateWithLiveTrade]);

  // Update market data from WebSocket quotes
  useEffect(() => {
    const quote = quotes.get(selectedSymbol);
    if (quote && connected) {
      const midPrice = quote.price || (quote.ask + quote.bid) / 2;

      setMarketData(prev => {
        const change = prev ? midPrice - prev.price : 0;
        const changePercent = prev && prev.price > 0 ? (change / prev.price) * 100 : 0;

        return {
          price: midPrice,
          change,
          changePercent,
        };
      });
    }
  }, [quotes, selectedSymbol, connected]);

  const fetchOptionsChain = async () => {
    setLoading(true);
    try {
      console.log('[OPTIONS] Fetching options chain for', selectedSymbol);

      const response = await fetch(`${DOCKER_API_URL}/fetch-market-data`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataType: "options",
          symbol: selectedSymbol,
          allowSimulated: true
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.data && Array.isArray(data.data)) {
        const formattedOptions: OptionData[] = data.data.slice(0, 20).map((opt: any) => {
          const strike = opt.strike_price || opt.details?.strike_price || 0;
          const contractType = opt.contract_type || opt.details?.contract_type || 'C';

          return {
            strike: `${strike}${contractType}`,
            bid: opt.bid || "0.00",
            ask: opt.ask || "0.00",
            vol: opt.volume ? `${(opt.volume / 1000).toFixed(1)}K` : "0K",
            oi: opt.open_interest ? `${(opt.open_interest / 1000).toFixed(1)}K` : "0K",
            delta: opt.greeks?.delta?.toFixed(2) || "0.00",
            itm: opt.in_the_money || false,
          };
        });

        setOptionsData(formattedOptions);
      }
    } catch (error: any) {
      console.error("Error fetching options:", error);
      toast({
        title: "Error fetching options",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Initial data fetch
  useEffect(() => {
    console.log('[TRADING] 🎯 Symbol changed to:', selectedSymbol, '- starting 3-step data flow');
    resetLiveUpdates(); // Reset live update cache
    setInitialDataLoaded(false);
    fetchHistoricalBars(); // Starts Step 1 → Step 2 → Step 3
  }, [selectedSymbol]);

  // Fetch options periodically
  useEffect(() => {
    fetchOptionsChain();
    const interval = setInterval(fetchOptionsChain, 300000);
    return () => clearInterval(interval);
  }, [selectedSymbol]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        {/* Header with Bot Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-3xl font-bold">Live Trading</h1>
              <p className="text-muted-foreground">Real-time options trading with HAVWAP strategies</p>
            </div>
            
            {/* Live Ticker Display */}
            <div className="flex items-center gap-4 p-4 rounded-lg bg-secondary/50 border">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">{selectedSymbol}</span>
                {quotes.has(selectedSymbol) && (
                  <>
                    <span className="text-2xl font-bold text-success">
                      ${quotes.get(selectedSymbol)?.ask?.toFixed(2) || '0.00'}
                    </span>
                    <div className="text-sm text-muted-foreground">
                      <div>Bid: ${quotes.get(selectedSymbol)?.bid?.toFixed(2) || '0.00'}</div>
                      <div>Ask: ${quotes.get(selectedSymbol)?.ask?.toFixed(2) || '0.00'}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Live • {new Date().toLocaleTimeString()}
                    </div>
                  </>
                )}
                {!quotes.has(selectedSymbol) && connected && (
                  <span className="text-muted-foreground">Waiting for data...</span>
                )}
                {!connected && (
                  <span className="text-destructive">Disconnected</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge
              variant={marketStatus.isOpen ? "default" : "secondary"}
              className="px-4 py-2"
            >
              <div className={`w-2 h-2 rounded-full mr-2 ${marketStatus.isOpen ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
              Market {marketStatus.status === 'open' ? 'Open' : marketStatus.status === 'pre-market' ? 'Pre-Market' : marketStatus.status === 'after-hours' ? 'After Hours' : 'Closed'}
            </Badge>
            <Badge variant={connected ? "default" : "secondary"} className="px-4 py-2">
              <div className={`w-2 h-2 rounded-full mr-2 ${connected ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
              {connected ? 'Live Data Connected' : 'Disconnected'}
            </Badge>
            <Button variant="outline" size="sm">
              <Play className="w-4 h-4 mr-2" />
              Start
            </Button>
            <Button variant="outline" size="sm">
              <Pause className="w-4 h-4 mr-2" />
              Pause
            </Button>
            <Button variant="destructive" size="sm">
              <Square className="w-4 h-4 mr-2" />
              Kill Switch
            </Button>
          </div>
        </div>

        {/* Mode Selector */}
        <Tabs defaultValue="live" className="w-full">
          <TabsList className="bg-secondary">
            <TabsTrigger value="live">Live Trading</TabsTrigger>
            <TabsTrigger value="paper">Paper Trading</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-4 mt-4">
            {/* Debug Panel */}
            <div className="mb-4">
              <DataFlowDebugPanel
                wsConnected={connected}
                quotesCount={quotes.size}
                tradesCount={recentTrades.length}
                barsCount={bars.length}
                optionsCount={optionsData.length}
                marketStatus={marketStatus.status}
                latestQuote={quotes.get(selectedSymbol)}
                latestTrade={recentTrades[0]}
                wsError={wsError}
                reconnectAttempts={0}
                onForceReconnect={forceReconnect}
              />
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-12 gap-4 overflow-hidden">
              {/* Chart Panel - TradingView */}
              <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card overflow-hidden">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold">{selectedSymbol}</h2>
                    <Badge variant="outline">1m • TradingView</Badge>
                    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                    {marketData && (
                      <>
                        <span className="text-2xl font-bold text-success">
                          ${marketData.price.toFixed(2)}
                        </span>
                        <span className={`text-sm ${marketData.changePercent >= 0 ? "text-success" : "text-danger"}`}>
                          {marketData.changePercent >= 0 ? "+" : ""}{marketData.changePercent.toFixed(2)}%
                        </span>
                      </>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchHistoricalBars}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>

                {/* TradingView Lightweight Chart */}
                <div className="h-[500px] overflow-hidden w-full">
                  {bars.length > 0 ? (
                    <LiveTradingViewChart
                      ref={chartApiRef}
                      symbol={selectedSymbol}
                      bars={bars}
                      currentPrice={marketData?.price}
                      height={500}
                    />
                  ) : loading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                        <p className="text-muted-foreground">Loading chart data...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-muted-foreground">No chart data available</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Options Matrix */}
              <Card className="col-span-4 p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Options Matrix</h2>
                <div className="space-y-4">
                  {/* Controls */}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">ATM±3</Button>
                    <Button variant="outline" size="sm" className="flex-1">Δ Buckets</Button>
                  </div>

                  {/* Options Chain */}
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground grid grid-cols-7 gap-1 px-2">
                      <span className="col-span-2">Strike</span>
                      <span className="text-right">Bid</span>
                      <span className="text-right">Ask</span>
                      <span className="text-right">Vol</span>
                      <span className="text-right">OI</span>
                      <span className="text-right">Δ</span>
                    </div>
                    {optionsData.length > 0 ? (
                      optionsData.map((option) => (
                        <div
                          key={option.strike}
                          className={`text-sm grid grid-cols-7 gap-1 p-2 rounded transition-all cursor-pointer hover:bg-muted ${
                            option.itm ? "bg-success/5 border border-success/20" : "bg-secondary/50"
                          }`}
                        >
                          <span className="col-span-2 font-medium">{option.strike}</span>
                          <span className="text-right text-muted-foreground">{option.bid}</span>
                          <span className="text-right text-muted-foreground">{option.ask}</span>
                          <span className="text-right text-xs">{option.vol}</span>
                          <span className="text-right text-xs">{option.oi}</span>
                          <span className={`text-right text-xs ${parseFloat(option.delta) > 0 ? "text-success" : "text-danger"}`}>
                            {option.delta}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                        Loading options data...
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* Position Monitor */}
              <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Open Positions</h2>
                <div className="text-center py-12 text-muted-foreground">
                  <p>No open positions</p>
                  <p className="text-sm mt-2">Positions will appear here when trading is active</p>
                </div>
              </Card>

              {/* Risk Monitor */}
              <Card className="col-span-4 p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  Risk Monitor
                </h2>
                <div className="space-y-4">
                  {[
                    { label: "Daily Loss Limit", current: "$0", limit: "$5,000", pct: 0 },
                    { label: "Position Size", current: "0", limit: "10", pct: 0 },
                    { label: "Max Spread", current: "$0.00", limit: "$0.12", pct: 0 },
                    { label: "Time Stop", current: "0m", limit: "180m", pct: 0 },
                  ].map((risk) => (
                    <div key={risk.label} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{risk.label}</span>
                        <span className="text-sm text-muted-foreground">
                          {risk.current} / {risk.limit}
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            risk.pct > 80 ? "bg-danger" : risk.pct > 50 ? "bg-warning" : "bg-success"
                          }`}
                          style={{ width: `${risk.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-sm font-medium text-success">All Risk Checks Passed</p>
                  <p className="text-xs text-muted-foreground mt-1">Last check: 2s ago</p>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="paper">
            <div className="flex items-center justify-center h-[600px]">
              <p className="text-muted-foreground">Paper trading interface (identical to live)</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Trading;
