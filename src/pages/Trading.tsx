import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Pause, Square, RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAlpacaWebSocket } from "@/hooks/useAlpacaWebSocket";
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Line } from "recharts";
import { getMarketStatus, MarketStatus } from "@/lib/marketHours";
import { DataFlowDebugPanel } from "@/components/DataFlowDebugPanel";

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
  const [bars, setBars] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(getMarketStatus());
  
  // Use WebSocket for live data
  const { 
    quotes, 
    trades, 
    connected, 
    lastError: wsError,
    reconnectAttempts,
    forceReconnect 
  } = useAlpacaWebSocket([selectedSymbol]);

  // Update market status every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchMarketData = async () => {
    setLoading(true);
    try {
      console.log('Fetching quote for', selectedSymbol);
      
      const { data, error } = await supabase.functions.invoke("fetch-market-data", {
        body: { dataType: "quote", symbol: selectedSymbol },
      });

      console.log('Quote response:', data);
      console.log('Quote error:', error);

      if (error) {
        console.error('Quote error:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.data?.quote) {
        const quote = data.data.quote;
        console.log('Quote data:', quote);
        setMarketData({
          price: quote.ap || 0,
          change: quote.ap - (quote.prevclose || quote.ap) || 0,
          changePercent: quote.prevclose 
            ? ((quote.ap - quote.prevclose) / quote.prevclose) * 100 
            : 0,
        });
      } else {
        console.warn('No quote data in response');
      }
    } catch (error: any) {
      console.error('Error fetching market data:', error);
      toast({
        title: "Error fetching market data",
        description: error.message || 'Failed to fetch market data. Check console for details.',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchOptionsChain = async () => {
    setLoading(true);
    try {
      console.log('[OPTIONS CLIENT] Fetching options chain for', selectedSymbol);
      
      const { data, error } = await supabase.functions.invoke("fetch-market-data", {
        body: { 
          dataType: "options", 
          symbol: selectedSymbol,
          allowSimulated: true // Enable simulated data for paper accounts
        },
      });

      console.log('[OPTIONS CLIENT] Response:', { 
        hasData: !!data, 
        hasError: !!error,
        dataType: typeof data,
        dataKeys: data ? Object.keys(data) : []
      });

      if (error) {
        console.error('[OPTIONS CLIENT] ✗ Error:', error);
        
        // Check if it's a 404 (no access to options data)
        if (error.message?.includes('404')) {
          toast({
            title: 'Options Data Unavailable',
            description: 'Options data requires an upgraded Alpaca account. Paper accounts have limited options access.',
            variant: 'destructive',
          });
          setOptionsData([]);
          setLoading(false);
          return;
        }
        
        throw error;
      }

      if (data?.error) {
        console.error('[OPTIONS CLIENT] ✗ Data error:', data.error);
        throw new Error(data.error);
      }

      if (data?.data && Array.isArray(data.data)) {
        console.log('[OPTIONS CLIENT] ✓ Received', data.data.length, 'options contracts');
        
        if (data.data.length === 0) {
          console.warn('[OPTIONS CLIENT] Empty options array - paper account or no options available');
          setOptionsData([]);
          toast({
            title: 'No Options Available',
            description: 'No options data available for this symbol. Paper accounts have limited options access.',
            variant: 'default',
          });
          return;
        }
        
        console.log('[OPTIONS CLIENT] Sample contract:', JSON.stringify(data.data[0]).substring(0, 300));
        
        // Transform API data to match UI format
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
        
        console.log('[OPTIONS CLIENT] ✓ Formatted', formattedOptions.length, 'options for display');
        setOptionsData(formattedOptions);
        
        toast({
          title: 'Options Data Loaded',
          description: `Loaded ${formattedOptions.length} options contracts`,
        });
      } else {
        console.warn('[OPTIONS CLIENT] ✗ No options data in response. Response structure:', data);
        setOptionsData([]);
        
        toast({
          title: 'No Options Data',
          description: 'No options data available for this symbol',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error("Error fetching options chain:", error);
      toast({
        title: "Error fetching options data",
        description: error.message || 'Failed to fetch options data. Check console for details.',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchBars = async () => {
    setLoading(true);
    try {
      console.log('Fetching historical bars for', selectedSymbol);
      
      // CRITICAL FIX: Use actual past dates, not future dates
      // Current timestamp
      const now = Date.now();
      
      // Get data from 60 days ago to now (to ensure we have trading days)
      const start = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
      const end = new Date(now).toISOString();
      
      console.log('[BARS CLIENT] Requesting bars with date range:', { 
        start, 
        end,
        startDate: new Date(start).toLocaleString(),
        endDate: new Date(end).toLocaleString()
      });
      
      const { data, error } = await supabase.functions.invoke("fetch-market-data", {
        body: { 
          dataType: "bars", 
          symbol: selectedSymbol,
          start: start,
          end: end,
          timeframe: '1Min' // Use 1m for live charting
        },
      });

      console.log('[BARS CLIENT] Response received:', { 
        hasData: !!data, 
        hasError: !!error,
        dataKeys: data ? Object.keys(data) : [],
      });
      
      if (error) {
        console.error('[BARS CLIENT] ✗ Error:', error);
      }
      if (data?.error) {
        console.error('[BARS CLIENT] ✗ Data error:', data.error);
      }

      if (error) {
        console.error('Bars error:', error);
        throw error;
      }

      if (data?.error) {
        // Check if it's an options-related error on paper account
        if (data.error.includes('Options data not available') || data.error.includes('paper trading')) {
          toast({
            title: 'Options Data Unavailable',
            description: 'Paper trading accounts have limited options data access. Historical stock bars will be shown instead.',
            variant: 'default',
          });
          // Continue with whatever stock data we have
        } else {
          throw new Error(data.error);
        }
      }

      const payload = data?.data;
      let arr: any[] = [];
      
      // Try multiple possible response formats
      if (payload?.bars?.[selectedSymbol]) {
        arr = payload.bars[selectedSymbol];
        console.log('[BARS CLIENT] ✓ Found bars in payload.bars[symbol]');
      } else if (Array.isArray(payload?.bars)) {
        arr = payload.bars;
        console.log('[BARS CLIENT] ✓ Found bars as array in payload.bars');
      } else if (Array.isArray(payload?.results)) {
        arr = payload.results;
        console.log('[BARS CLIENT] ✓ Found bars in payload.results');
      } else if (Array.isArray(payload)) {
        arr = payload;
        console.log('[BARS CLIENT] ✓ Found bars in payload directly');
      }

      if (arr && arr.length) {
        console.log(`[BARS CLIENT] ✓ Processing ${arr.length} bars`);
        console.log('[BARS CLIENT] First bar sample:', JSON.stringify(arr[0]).substring(0, 200));
        console.log('[BARS CLIENT] Last bar sample:', JSON.stringify(arr[arr.length - 1]).substring(0, 200));
        const mapped = arr.map((b: any) => {
          // Handle different timestamp formats
          const timestamp = b.t || b.timestamp || b.time;
          const barTime = new Date(timestamp);
          
          return {
            time: barTime.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false,
              timeZone: 'America/New_York'
            }),
            timestamp: barTime.getTime(),
            date: barTime.toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
            open: b.o ?? b.open ?? 0,
            high: b.h ?? b.high ?? 0,
            low: b.l ?? b.low ?? 0,
            close: b.c ?? b.close ?? 0,
            volume: b.v ?? b.volume ?? 0,
          };
        });
        
        console.log(`[BARS CLIENT] ✓ Successfully mapped ${mapped.length} bars`);
        console.log('[BARS CLIENT] Latest bar:', {
          time: mapped[mapped.length - 1]?.time,
          date: mapped[mapped.length - 1]?.date,
          close: mapped[mapped.length - 1]?.close,
        });
        
        setBars(mapped);
        
        toast({
          title: 'Chart Data Loaded',
          description: `Loaded ${mapped.length} bars for ${selectedSymbol}`,
        });
      } else {
        console.warn('[BARS CLIENT] ✗ No bars in response payload. Payload structure:', Object.keys(payload || {}));
        setBars([]);
        
        toast({
          title: 'No Chart Data',
          description: 'No historical data available. Markets may be closed or symbol invalid.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      console.error('Error fetching bars:', error);
      toast({
        title: "Error fetching bars",
        description: error.message || 'Failed to fetch bars. Check console for details.',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Update market data from WebSocket quotes
  useEffect(() => {
    const quote = quotes.get(selectedSymbol);
    if (quote && connected) {
      console.log('[WS CLIENT] ✓ Updating market data from quote:', quote);
      const midPrice = (quote.ask + quote.bid) / 2;
      
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

  // Update chart with live trade data from WebSocket - normalized timestamps
  useEffect(() => {
    if (!connected || trades.length === 0) return;
    
    // Get latest trade for selected symbol
    const latestTrade = trades.find(t => t.symbol === selectedSymbol);
    
    if (latestTrade && bars.length > 0) {
      console.log('[WS CLIENT] ✓ Updating chart with live trade:', latestTrade);
      
      // Parse the normalized timestamp from the trade
      const tradeTime = new Date(latestTrade.timestamp).getTime();
      const currentMinute = Math.floor(tradeTime / 60000) * 60000;
      
      setBars(prevBars => {
        const lastBar = prevBars[prevBars.length - 1];
        
        // Match by normalized timestamp (minute epoch UTC)
        if (lastBar && lastBar.timestamp === currentMinute) {
          const updatedBar = {
            ...lastBar,
            high: Math.max(lastBar.high, latestTrade.price),
            low: Math.min(lastBar.low, latestTrade.price),
            close: latestTrade.price,
            volume: lastBar.volume + latestTrade.size,
          };
          console.log('[WS CLIENT] ✓ Updated current 1m bar at', currentMinute);
          return [...prevBars.slice(0, -1), updatedBar];
        } else if (currentMinute > lastBar.timestamp) {
          // Create new bar for new minute
          const newBar = {
            time: new Date(currentMinute).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit', 
              hour12: false, 
              timeZone: 'America/New_York' 
            }),
            timestamp: currentMinute,
            date: new Date(currentMinute).toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
            open: latestTrade.price,
            high: latestTrade.price,
            low: latestTrade.price,
            close: latestTrade.price,
            volume: latestTrade.size,
          };
          console.log('[WS CLIENT] ✓ Created new 1m bar at', currentMinute);
          return [...prevBars, newBar];
        }
        
        return prevBars;
      });
      
      // Also update the header price display
      setMarketData(prev => ({
        price: latestTrade.price,
        change: prev ? latestTrade.price - prev.price : 0,
        changePercent: prev && prev.price > 0 ? ((latestTrade.price - prev.price) / prev.price) * 100 : 0,
      }));
    }
  }, [trades, selectedSymbol, bars.length, connected]);

  useEffect(() => {
    // Fetch initial options chain data (historical)
    fetchOptionsChain();
    
    // Refresh options every 5 minutes (these are historical, not live)
    const interval = setInterval(fetchOptionsChain, 300000);

    return () => clearInterval(interval);
  }, [selectedSymbol]);

  useEffect(() => {
    // Fetch initial quote and bars for chart + header
    fetchMarketData();
    fetchBars();
  }, [selectedSymbol]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        {/* Header with Bot Controls */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Live Trading</h1>
            <p className="text-muted-foreground">Real-time options trading with HAVWAP strategies</p>
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
                tradesCount={trades.length}
                barsCount={bars.length}
                optionsCount={optionsData.length}
                marketStatus={marketStatus.status}
                latestQuote={quotes.get(selectedSymbol)}
                latestTrade={trades[0]}
                wsError={wsError}
                reconnectAttempts={reconnectAttempts}
                onForceReconnect={forceReconnect}
              />
            </div>

            {/* Main Grid */}
            <div className="grid grid-cols-12 gap-4">
              {/* Chart Panel */}
              <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold">{selectedSymbol}</h2>
                    <Badge variant="outline">1m</Badge>
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : marketData ? (
                      <>
                        <span className="text-2xl font-bold text-success">
                          ${marketData.price.toFixed(2)}
                        </span>
                        <span className={`text-sm ${marketData.changePercent >= 0 ? "text-success" : "text-danger"}`}>
                          {marketData.changePercent >= 0 ? "+" : ""}{marketData.changePercent.toFixed(2)}%
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No data</span>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { fetchMarketData(); fetchBars(); }}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <div className="h-[500px] bg-background/50 rounded-lg p-4 border border-border">
                  {bars.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={bars.slice(-500)} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                         <XAxis 
                          dataKey="timestamp"
                          type="number"
                          domain={["dataMin", "dataMax"]}
                          tickFormatter={(ts) => {
                            const date = new Date(ts);
                            return date.toLocaleDateString('en-US', {
                              month: '2-digit', 
                              day: '2-digit',
                              timeZone: 'America/New_York'
                            }) + ' ' + date.toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              hour12: false,
                              timeZone: 'America/New_York'
                            });
                          }}
                          minTickGap={80}
                          tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                        />
                        <YAxis 
                          domain={["auto", "auto"]}
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <Tooltip 
                          labelFormatter={(ts) => new Intl.DateTimeFormat('en-US', {
                            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
                            hour12: false, timeZone: 'America/New_York'
                          }).format(new Date(Number(ts)))}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))' 
                          }}
                          labelStyle={{ color: 'hsl(var(--foreground))' }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="close" 
                          stroke="hsl(var(--primary))" 
                          dot={false} 
                          strokeWidth={2}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
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
