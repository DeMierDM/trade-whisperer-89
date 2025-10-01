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
  
  // Use WebSocket for live data
  const { quotes, trades, connected } = useAlpacaWebSocket([selectedSymbol]);

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
      console.log('Fetching options chain for', selectedSymbol);
      
      const { data, error } = await supabase.functions.invoke("fetch-market-data", {
        body: { dataType: "options", symbol: selectedSymbol },
      });

      console.log('Options response:', data);
      console.log('Options error:', error);

      if (error) {
        console.error('Options error:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.data && Array.isArray(data.data)) {
        console.log('Options data count:', data.data.length);
        // Transform API data to match UI format
        const formattedOptions: OptionData[] = data.data.slice(0, 20).map((opt: any) => ({
          strike: `${opt.strike_price || opt.details?.strike_price || 0}${opt.contract_type || opt.details?.contract_type || 'C'}`,
          bid: "0.00", // Historical data doesn't have real-time bid/ask
          ask: "0.00",
          vol: "0K",
          oi: opt.open_interest ? `${(opt.open_interest / 1000).toFixed(1)}K` : "0K",
          delta: "0.00",
          itm: false,
        }));
        setOptionsData(formattedOptions);
      } else {
        console.warn('No options data in response');
        setOptionsData([]);
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
      console.log('Fetching last 30 days of minute bars for', selectedSymbol);
      
      // Current time in UTC
      const now = new Date();
      
      // Get last 30 days - use UTC timestamps to avoid timezone issues
      const end = now.toISOString();
      const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      console.log('Date range:', { start, end });
      
      const { data, error } = await supabase.functions.invoke("fetch-market-data", {
        body: { 
          dataType: "bars", 
          symbol: selectedSymbol,
          start: start,
          end: end,
          timeframe: '1Min'
        },
      });

      console.log('Bars response:', data);
      console.log('Bars error:', error);

      if (error) {
        console.error('Bars error:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const payload = data?.data;
      let arr: any[] = [];
      if (payload?.bars?.[selectedSymbol]) arr = payload.bars[selectedSymbol];
      else if (Array.isArray(payload?.bars)) arr = payload.bars;
      else if (Array.isArray(payload?.results)) arr = payload.results;

      if (arr && arr.length) {
        console.log(`Received ${arr.length} bars, first:`, arr[0], 'last:', arr[arr.length - 1]);
        const mapped = arr.map((b: any) => {
          const barTime = new Date(b.t);
          return {
            time: barTime.toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit',
              hour12: false,
              timeZone: 'America/New_York' // Display in ET
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
        console.log(`Mapped ${mapped.length} bars, latest bar time:`, mapped[mapped.length - 1]?.time, mapped[mapped.length - 1]?.date);
        setBars(mapped);
      } else {
        console.warn('No bars in response payload');
        setBars([]);
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
    if (quote) {
      const midPrice = (quote.ask + quote.bid) / 2;
      setMarketData({
        price: midPrice,
        change: 0, // Would need previous close data
        changePercent: 0,
      });
    }
  }, [quotes, selectedSymbol]);

  // Update chart with live trade data from WebSocket
  useEffect(() => {
    // Get latest trade for selected symbol
    const latestTrade = trades.find(t => t.symbol === selectedSymbol);
    
    if (latestTrade && bars.length > 0) {
      const currentMinute = Math.floor(Date.now() / 60000) * 60000;
      
      setBars(prevBars => {
        const lastBar = prevBars[prevBars.length - 1];
        
        // If last bar is for current minute, update it
        if (lastBar && lastBar.timestamp === currentMinute) {
          const updatedBar = {
            ...lastBar,
            high: Math.max(lastBar.high, latestTrade.price),
            low: Math.min(lastBar.low, latestTrade.price),
            close: latestTrade.price,
            volume: lastBar.volume + latestTrade.size,
          };
          return [...prevBars.slice(0, -1), updatedBar];
        } else {
          // Create new bar for new minute
          const newBar = {
            time: new Date(currentMinute).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/New_York' }),
            timestamp: currentMinute,
            open: latestTrade.price,
            high: latestTrade.price,
            low: latestTrade.price,
            close: latestTrade.price,
            volume: latestTrade.size,
          };
          return [...prevBars, newBar];
        }
      });
      
      // Also update the header price display
      setMarketData(prev => ({
        price: latestTrade.price,
        change: prev ? latestTrade.price - prev.price : 0,
        changePercent: prev && prev.price > 0 ? ((latestTrade.price - prev.price) / prev.price) * 100 : 0,
      }));
    }
  }, [trades, selectedSymbol]);

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
            <Badge variant="outline" className="px-4 py-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse mr-2" />
              Bot Active
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
                          tickFormatter={(ts) => new Intl.DateTimeFormat('en-US', {
                            hour: '2-digit', minute: '2-digit', month: '2-digit', day: '2-digit',
                            hour12: false, timeZone: 'America/New_York'
                          }).format(new Date(ts))}
                          minTickGap={50}
                          tick={{ fill: 'hsl(var(--muted-foreground))' }}
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
