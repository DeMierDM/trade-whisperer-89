import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Pause, Square, RefreshCw, AlertTriangle, Loader2, Menu, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getMarketStatus, MarketStatus } from "@/lib/marketHours";
import { DataFlowDebugPanel } from "@/components/DataFlowDebugPanel";
import { LiveTradingViewChart, ChartUpdateAPI } from "@/components/LiveTradingViewChart";
import ProfessionalTradingChart from "@/components/ProfessionalTradingChart";
import MultiBotDashboard from "@/components/MultiBotDashboard";
import { useStockBusData } from "@/hooks/useStockBusData";
import { useOptionsBusData } from "@/hooks/useOptionsBusData";
import { useLiveChartUpdates } from "@/hooks/useLiveChartUpdates";
import { ChartBar } from "@/lib/timeUtils";
import { ENDPOINTS, REQUEST_CONFIG, logApiCall, createApiError } from '../lib/apiConfig';

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
  const [selectedSymbol, setSelectedSymbol] = useState("SPY");
    const [activeBotSymbols, setActiveBotSymbols] = useState<string[]>(["SPY", "QQQ", "IWM"]); // Context7: Default fallback symbols // Context7: Dynamic bot symbols
  const [timeframe, setTimeframe] = useState("1m");
  const [marketData, setMarketData] = useState<MarketData | null>(null);
  const [optionsData, setOptionsData] = useState<OptionData[]>([]);
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(getMarketStatus());
  const [showTabs, setShowTabs] = useState(false); // Hamburger menu state
  const [chartType, setChartType] = useState<'Candlestick' | 'Line' | 'Area' | 'Bar'>('Candlestick');
  const [showVolume, setShowVolume] = useState(true);

  // Chart ref for direct updates (bypasses React)
  const chartApiRef = useRef<ChartUpdateAPI | null>(null);

  // Context7 Pattern: Fetch active bot symbols dynamically
  const fetchActiveBotSymbols = useCallback(async () => {
    console.log('🤖 [Context7] Fetching active bot symbols...');
    try {
      // Use relative path to leverage Vite proxy or try paper trading service directly
      let response;
      try {
        console.log('🤖 [Context7] Trying /api/bots via proxy...');
        response = await fetch('/api/bots'); // Try via proxy first
      } catch (proxyError) {
        console.log('🤖 [Context7] Proxy failed, trying direct container access...');
        // Fallback to direct container access
        response = await fetch('http://trading_paper_bots:3005/api/bots');
      }
      
      if (response.ok) {
        const bots = await response.json();
        const uniqueSymbols = [...new Set(bots.map((bot: any) => bot.symbol))];
        console.log('🤖 [Context7] Fetched bot symbols:', uniqueSymbols);
        setActiveBotSymbols(uniqueSymbols);
        
        // Set first available symbol as selected if current selection not in active bots
        if (uniqueSymbols.length > 0 && !uniqueSymbols.includes(selectedSymbol)) {
          console.log(`🤖 [Context7] Switching from ${selectedSymbol} to ${uniqueSymbols[0]}`);
          setSelectedSymbol(uniqueSymbols[0]);
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('🤖 [Context7] Failed to fetch active bot symbols:', error);
      // Fallback to default symbols from validation results
      console.log('🤖 [Context7] Using fallback symbols: SPY, QQQ, IWM');
      setActiveBotSymbols(["SPY", "QQQ", "IWM"]);
    }
  }, [selectedSymbol]);

  // Memoize symbol arrays to prevent recreation on every render
  const stockSymbols = useMemo(() => [selectedSymbol], [selectedSymbol]);
  const underlyingSymbols = useMemo(() => [selectedSymbol], [selectedSymbol]);

  // Use Data Bus for live stock data (replaces useDockerWebSocket)
  const {
    quotes,
    recentTrades,
    connected,
    error: wsError,
    bars: liveBars,
    buildBarsFromRecentTrades
  } = useStockBusData(stockSymbols);

  // Initialize option symbols for bus subscription - start with empty array
  const [optionSymbols, setOptionSymbols] = useState<string[]>([]);

  // Use Data Bus for options data
  const {
    optionQuotes,
    optionChains,
    connected: optionsConnected
  } = useOptionsBusData(underlyingSymbols, optionSymbols);

  // Use refs for frequently changing values to prevent useCallback recreation
  const optionChainsRef = useRef(optionChains);
  const marketDataRef = useRef(marketData);

  // Update refs on every render
  useEffect(() => {
    optionChainsRef.current = optionChains;
    marketDataRef.current = marketData;
  });

  // Force reconnect function for debug panel
  const forceReconnect = () => {
    console.log('[BUS] Force reconnecting all bus connections...');
    // Force remount by toggling a key - simpler than exposing forceReconnect from hooks
    window.location.reload();
  };

  // Optimized live chart updates (direct to TradingView, no React rerenders)
  const { updateWithLiveTrade, reset: resetLiveUpdates } = useLiveChartUpdates(chartApiRef);

  // Update market status every minute and fetch active bot symbols
  useEffect(() => {
    // Fetch active bot symbols on component mount
    fetchActiveBotSymbols();
    
    const interval = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchActiveBotSymbols]);

  // ============================================================================
  // STEP 1: FETCH HISTORICAL DATA (BUS FIRST, THEN REST API FALLBACK)
  // ============================================================================

  const fetchHistoricalBars = useCallback(async () => {
    console.log('[FETCH] 🚀 fetchHistoricalBars called for symbol:', selectedSymbol);
    setLoading(true);
    try {
      console.log('[DATA FLOW] 📊 STEP 1: Fetching historical bars for', selectedSymbol);

      // STEP 1A: Try to get data from Data Bus first (fast, local)
      const busData = await fetchHistoricalFromBus();
      
      if (busData && busData.length > 0) {
        console.log(`[DATA FLOW] ✅ STEP 1A Complete: Got ${busData.length} bars from data bus`);
        setBars(busData);
        
        // Proceed to Step 2: Gap Filling
        await fillGapData(busData);
        
        toast({
          title: '📊 Historical Data Loaded',
          description: `Loaded ${busData.length} bars from data bus for ${selectedSymbol}`,
        });
        
        return; // Success - no need for external API
      }

      // STEP 1B: Fallback to external API if bus data insufficient
      console.log('[DATA FLOW] ℹ️ STEP 1A: Insufficient bus data, falling back to external API');
      
      // Get data from 60 days ago to now
      const now = Date.now();
      const start = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
      const end = new Date(now).toISOString();

      const response = await fetch(ENDPOINTS.MARKET_DATA, {
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
        console.log(`[DATA FLOW] ✅ STEP 1B Complete: Received ${arr.length} historical bars from external API`);

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
          description: `Loaded ${mapped.length} bars from external API for ${selectedSymbol}`,
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
  }, [selectedSymbol, toast]);

  // Helper function to fetch historical data from data bus
  const fetchHistoricalFromBus = useCallback(async (): Promise<ChartBar[] | null> => {
    try {
      console.log('[BUS-FETCH] 🚌 fetchHistoricalFromBus called for:', selectedSymbol);
      console.log('[DATA FLOW] 🚌 Trying data bus for historical data...');

      // Get data from last 30 days (or available data range)
      const now = new Date();
      const startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(); // Last 30 days
      const endDate = now.toISOString();

      console.log('[DATA FLOW] 🚌 Requesting:', { symbol: selectedSymbol, startDate, endDate });

      // Use API server endpoint which aggregates from bus_stock_data
      const response = await fetch('http://localhost:3001/api/historical-bars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedSymbol,
          timeframe: '1m', // Always use 1-minute bars from database
          startDate,
          endDate
        })
      });

      if (!response.ok) {
        console.warn('[DATA FLOW] 🚌 Bus historical API not available:', response.status);
        return null;
      }

      const busResponse = await response.json();
      
      if (!busResponse.data || busResponse.data.length === 0) {
        console.warn('[DATA FLOW] 🚌 No recent historical data in bus for', selectedSymbol);
        return null;
      }

      console.log(`[DATA FLOW] 🚌 Got ${busResponse.data.length} records from bus (last 2 hours)`);

      // Convert bus data to ChartBar format
      const mapped: ChartBar[] = busResponse.data.map((bar: any) => {
        const timestamp = new Date(bar.bar_timestamp);
        
        return {
          time: timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'America/New_York'
          }),
          timestamp: Math.floor(timestamp.getTime() / 1000), // TradingView uses seconds
          date: timestamp.toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
          open: parseFloat(bar.open || 0),
          high: parseFloat(bar.high || 0),
          low: parseFloat(bar.low || 0),
          close: parseFloat(bar.close || 0),
          volume: parseInt(bar.volume || 0),
        };
      });

      // Sort by timestamp
      mapped.sort((a, b) => a.timestamp - b.timestamp);

      // Only use bus data if we have reasonable amount (at least 5 bars for aggregated data)
      if (mapped.length >= 5) {
        return mapped;
      } else {
        console.warn('[DATA FLOW] 🚌 Insufficient bus data:', mapped.length, 'bars');
        return null;
      }

    } catch (error) {
      console.error('[DATA FLOW] 🚌 Error fetching from bus:', error);
      return null;
    }
  }, [selectedSymbol]);

  // ============================================================================
  // STEP 2: FILL 15-MINUTE GAP (DOCKER API - RUNS ONCE)
  // ============================================================================

  const fillGapData = async (historicalBars: ChartBar[]) => {
    try {
      console.log('[DATA FLOW] 🔄 STEP 2: Filling 15-minute gap with recent trades');

      // Build bars from recent trades using bus data helper
      if (recentTrades.length > 0) {
        const symbolTrades = recentTrades.filter(t => t.symbol === selectedSymbol);
        const gapBars = buildBarsFromRecentTrades(symbolTrades, selectedSymbol);

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
          console.log('[DATA FLOW] ℹ️ STEP 2: No gap data available from recent trades');
        }
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

  // Update market data from WebSocket quotes (adapted for bus data structure)
  useEffect(() => {
    const quote = quotes[selectedSymbol];
    if (quote && connected) {
      const midPrice = quote.price || (quote.ask && quote.bid ? (quote.ask + quote.bid) / 2 : 0);

      if (midPrice > 0) {
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
    }
  }, [quotes, selectedSymbol, connected]);

  const fetchOptionsChain = useCallback(async () => {
    setLoading(true);
    try {
      console.log('[OPTIONS] Fetching options chain via Data Bus for', selectedSymbol);

      // Try to get from bus cache first, then fallback to REST API
      const existingChain = optionChainsRef.current[selectedSymbol];
      if (existingChain && existingChain.contracts && existingChain.contracts.length > 0) {
        console.log('[OPTIONS] Using cached chain from data bus');

        const formattedOptions: OptionData[] = existingChain.contracts.slice(0, 20).map((opt: any) => {
          const strike = opt.strike || 0;
          const contractType = opt.option_type === 'call' ? 'C' : 'P';

          return {
            strike: `${strike}${contractType}`,
            bid: opt.bid?.toString() || "0.00",
            ask: opt.ask?.toString() || "0.00",
            vol: opt.volume ? `${(opt.volume / 1000).toFixed(1)}K` : "0K",
            oi: opt.open_interest ? `${(opt.open_interest / 1000).toFixed(1)}K` : "0K",
            delta: opt.delta?.toFixed(3) || "0.000",
            itm: opt.option_type === 'call' ? strike < (marketDataRef.current?.price || 0) : strike > (marketDataRef.current?.price || 0),
          };
        });

        setOptionsData(formattedOptions);

        // Update option symbols for live quotes subscription
        const symbols = existingChain.contracts.map((c: any) => c.symbol).filter(Boolean);
        setOptionSymbols(symbols);

        setLoading(false);
        return;
      }

      // Fallback to REST API if no bus data
      const response = await fetch(ENDPOINTS.MARKET_DATA, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataType: "options",
          symbol: selectedSymbol,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data?.error) {
        throw new Error(data.error);
      }

      // Process REST API response
      if (Array.isArray(data?.data)) {
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
  }, [selectedSymbol, toast]);

  // Initial data fetch - Auto-load on component mount and symbol changes
  useEffect(() => {
    console.log('[TRADING] 🎯 AUTO-LOADING TRIGGER: Symbol changed to:', selectedSymbol);
    console.log('[TRADING] 🎯 AUTO-LOADING: Current bars length:', bars.length);
    console.log('[TRADING] 🎯 AUTO-LOADING: Initial data loaded:', initialDataLoaded);

    // Reset state for new symbol
    resetLiveUpdates();
    setInitialDataLoaded(false);

    // Force auto-load with a small delay to ensure component is ready
    console.log('[TRADING] 🎯 AUTO-LOADING: Triggering fetchHistoricalBars in 100ms...');
    const timeoutId = setTimeout(() => {
      console.log('[TRADING] 🎯 AUTO-LOADING: Now calling fetchHistoricalBars...');
      fetchHistoricalBars();
    }, 100);

    // Cleanup timeout on unmount or symbol change
    return () => clearTimeout(timeoutId);
  }, [selectedSymbol, fetchHistoricalBars, resetLiveUpdates]);

  // Fetch options periodically
  useEffect(() => {
    fetchOptionsChain();
    const interval = setInterval(fetchOptionsChain, 300000);
    return () => clearInterval(interval);
  }, [fetchOptionsChain]);

  // Reload data when timeframe changes
  useEffect(() => {
    console.log('[TRADING] 📊 Timeframe changed to:', timeframe, '- reloading data');
    resetLiveUpdates();
    setInitialDataLoaded(false);
    fetchHistoricalBars();
  }, [timeframe, resetLiveUpdates, fetchHistoricalBars]);

  return (
    <div className="min-h-screen bg-background">
      <div style={{backgroundColor: 'red', color: 'white', padding: '10px', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999}}>
        🤖 CONTEXT7 DEBUG: Active Bot Symbols = {activeBotSymbols.join(', ')} (Length: {activeBotSymbols.length})
      </div>
      <div className="container mx-auto p-6 space-y-4" style={{marginTop: '60px'}}>
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
                {quotes[selectedSymbol] && (
                  <>
                    <span className="text-2xl font-bold text-success">
                      ${quotes[selectedSymbol]?.ask?.toFixed(2) || '0.00'}
                    </span>
                    <div className="text-sm text-muted-foreground">
                      <div>Bid: ${quotes[selectedSymbol]?.bid?.toFixed(2) || '0.00'}</div>
                      <div>Ask: ${quotes[selectedSymbol]?.ask?.toFixed(2) || '0.00'}</div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Live • {new Date().toLocaleTimeString()}
                    </div>
                  </>
                )}
                {!quotes[selectedSymbol] && connected && (
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

        {/* Chart Controls */}
        <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg border">
          <div className="flex items-center gap-4">
            {/* Symbol Selector */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Symbol:</label>
              <select 
                value={selectedSymbol} 
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="px-3 py-1 bg-background border rounded text-sm min-w-[80px]"
                title="Select trading symbol"
                aria-label="Select trading symbol"
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

            {/* Manual Refresh Button */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  console.log('[MANUAL] 🔄 Manual refresh triggered');
                  fetchHistoricalBars();
                }}
                disabled={loading}
                className={`px-4 py-2 text-sm rounded font-medium transition-all ${
                  loading 
                    ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                    : 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                }`}
                title="Manually refresh chart data"
              >
                {loading ? 'Loading...' : '🔄 Refresh Data'}
              </button>
              <span className="text-xs text-muted-foreground">
                {bars.length > 0 ? `${bars.length} bars loaded` : 'No data'}
              </span>
            </div>

            {/* Current Price Display */}
            {quotes[selectedSymbol] && (
              <div className="flex items-center gap-3 px-4 py-2 bg-background rounded border">
                <span className="font-semibold text-lg">{selectedSymbol}</span>
                <span className="text-2xl font-bold text-success">
                  ${quotes[selectedSymbol]?.ask?.toFixed(2) || '0.00'}
                </span>
                <div className="text-sm text-muted-foreground">
                  <div>Bid: ${quotes[selectedSymbol]?.bid?.toFixed(2) || '0.00'}</div>
                  <div>Ask: ${quotes[selectedSymbol]?.ask?.toFixed(2) || '0.00'}</div>
                </div>
              </div>
            )}
          </div>

          {/* Chart Stats */}
          <div className="text-sm text-muted-foreground">
            Real-time • {bars.length} bars • TradingView Engine
          </div>
        </div>

        {/* Mode Selector */}
        <Tabs defaultValue="live" className="w-full">
          <TabsList className="bg-secondary">
            <TabsTrigger value="live">Live Trading</TabsTrigger>
            <TabsTrigger value="paper">Paper Trading</TabsTrigger>
            <TabsTrigger value="multi-bot">Multi-Bot Manager</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-4 mt-4">
            {/* Debug Panel */}
            <div className="mb-4">
              <DataFlowDebugPanel
                wsConnected={connected}
                quotesCount={Object.keys(quotes).length}
                tradesCount={recentTrades.length}
                barsCount={bars.length}
                optionsCount={optionsData.length}
                marketStatus={marketStatus.status}
                latestQuote={quotes[selectedSymbol] ? {
                  symbol: quotes[selectedSymbol].symbol,
                  bid: quotes[selectedSymbol].bid || 0,
                  ask: quotes[selectedSymbol].ask || 0
                } : undefined}
                latestTrade={recentTrades[0]}
                wsError={wsError}
                reconnectAttempts={0}
                onForceReconnect={forceReconnect}
              />
            </div>

            {/* Context7 Pattern: Active Bot Symbol Tabs */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="text-sm font-medium text-muted-foreground">Active Trading Bots:</div>
                <div className="flex gap-1">
                  {activeBotSymbols.map((symbol) => (
                    <button
                      key={symbol}
                      onClick={() => setSelectedSymbol(symbol)}
                      className={`px-3 py-1 text-sm rounded-md border transition-colors ${
                        selectedSymbol === symbol
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-secondary hover:bg-secondary/80 border-border'
                      }`}
                      data-testid={`bot-tab-${symbol}`}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground ml-2">
                  ({activeBotSymbols.length} active bots)
                </div>
              </div>
            </div>

            {/* Main Grid */}
            {/* Professional Trading Interface */}
            <ProfessionalTradingChart
              symbol={selectedSymbol}
              onSymbolChange={setSelectedSymbol}
            />

            <div className="grid grid-cols-12 gap-4 overflow-hidden mt-4">
              {/* Legacy Chart Panel for comparison (hidden by default) */}
              <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card overflow-hidden hidden">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold">{selectedSymbol}</h2>
                    <Badge variant="outline">{timeframe} • TradingView</Badge>
                    {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                    {!initialDataLoaded && !loading && (
                      <Badge variant="secondary" className="text-xs">
                        Loading data from bus...
                      </Badge>
                    )}
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
                  <div className="flex items-center gap-2">
                    <Button 
                      variant={showVolume ? "default" : "outline"} 
                      size="sm" 
                      onClick={() => setShowVolume(!showVolume)}
                      title="Toggle Volume"
                    >
                      📊
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      console.log('[TRADING] 🔄 Manual refresh requested');
                      fetchHistoricalBars(); // Starts Step 1 → Step 2 → Step 3
                    }}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
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
                      chartType={chartType}
                      showVolume={showVolume}
                      onChartTypeChange={setChartType}
                      showTypeSelector={true}
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

          <TabsContent value="multi-bot" className="space-y-4 mt-4">
            <MultiBotDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Trading;
