import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Download, Eye, Loader2, BarChart3, Database, Target, History, TrendingUp } from "lucide-react";
import { useBacktest } from "@/hooks/useBacktest";
import { useBacktestingData } from "@/hooks/useBacktestingData";
// LIVE WebSocket through Docker server - no direct Alpaca connections
import { useDockerWebSocket } from "@/hooks/useDockerWebSocket";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ChartBar } from "@/lib/timeUtils";
import { useToast } from "@/hooks/use-toast";
import { LiveTradingViewChart, ChartUpdateAPI } from "@/components/LiveTradingViewChart";
import { TradingChartTabs, BotChartData } from "@/components/TradingChartTabs";
import EnhancedTradingCharts, { EnhancedBotConfig } from "@/components/EnhancedTradingCharts";
import { useLiveChartUpdates } from "@/hooks/useLiveChartUpdates";
import { ENDPOINTS } from "@/lib/apiConfig";
import { BacktestResults } from "@/components/BacktestResults";
import { BacktestProgress } from "@/components/BacktestProgress";
import { BacktestErrorBoundary } from "@/components/BacktestErrorBoundary";
// Paper Trading Multi-Symbol Integration  
import { usePaperTradingAPI, usePaperTradingWebSocket, PaperTradingBot } from "@/hooks/usePaperTradingAPI";
import { useLivePaperTradingData } from "@/hooks/useLivePaperTradingData";
import { usePreviousBacktests } from "@/hooks/usePreviousBacktests";
// Enhanced Multi-Symbol WebSocket with Context7 patterns
import { useMultiSymbolWebSocket } from "@/hooks/useMultiSymbolWebSocket";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const { loading, results, metrics, trades, progress, statusMessage, runBacktest, fetchTrades, fetchBacktestById } = useBacktest();
  const { backtests: previousBacktests, loading: loadingPrevious, refresh: refreshBacktests } = usePreviousBacktests();
  const { 
    loading: dataLoading, 
    error: dataError, 
    data: historicalData, 
    fetchHistoricalData,
    clearData 
  } = useBacktestingData();

  // Progress tracking states
  const [dataFetchStep, setDataFetchStep] = useState(0); // 0: idle, 1: fetching stock, 2: fetching options, 3: complete
  const [dataFetchProgress, setDataFetchProgress] = useState(0);
  const [dataFetchMessage, setDataFetchMessage] = useState('');



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

  // CRITICAL SEPARATION: Split options data by tab to prevent cross-contamination
  // Historical Backtest: OHLCV bars from database (Alpaca historical API - bars only)
  // Structure: { bars: { [contract]: [{ t, o, h, l, c, v }] }, totalBars, symbolsWithData, dateRange }
  const [historicalOptionsData, setHistoricalOptionsData] = useState<any>(null);

  // Live Paper Trading: Real-time quotes + trades from WebSocket (Alpaca indicative feed)
  // Structure: { contracts: [{ symbol, bid, ask, bid_size, ask_size, trades, lastPrice }], currentPrice, timestamp }
  const [liveOptionsData, setLiveOptionsData] = useState<any>(null);

  // Paper Trading Multi-Symbol State Management
  const { 
    bots: paperBots, 
    activeBots, 
    createBot, 
    startBot, 
    stopBot, 
    deleteBot 
  } = usePaperTradingAPI();
  
  const { 
    connect: connectPaperWebSocket, 
    disconnect: disconnectPaperWebSocket, 
    lastMessage 
  } = usePaperTradingWebSocket();

  // Active symbol for chart display (defaults to SPY)
  const [activeChartSymbol, setActiveChartSymbol] = useState<string>('SPY');
  
  // Tab state management
  const [activeTab, setActiveTab] = useState<string>('historical');
  
  // Clear chart data when switching between tabs to prevent contamination
  useEffect(() => {
    console.log(`[TAB SWITCH] Active tab changed to: ${activeTab}`);
    
    // When switching from historical to paper or vice versa, clear potentially contaminated data
    if (activeTab === 'paper') {
      console.log('[TAB SWITCH] Switched to Live Paper Trading - auto-loading options data');
      
      // Auto-load options data when switching to Live Paper Trading tab
      if (activeChartSymbol) {
        console.log(`[AUTO-LOAD] Loading options matrix for ${activeChartSymbol}`);
        handleFetchLiveOptionsData(activeChartSymbol, 'running');
      }
    } else if (activeTab === 'historical') {
      console.log('[TAB SWITCH] Switched to Historical Backtest mode');
    }
  }, [activeTab, activeChartSymbol]);
  
  // Bot creation state
  const [selectedBotSymbol, setSelectedBotSymbol] = useState<string>('SPY');
  const [selectedBotStrategy, setSelectedBotStrategy] = useState<string>('rsi-vwap-morning-session');
  const [selectedPositionSize, setSelectedPositionSize] = useState<number>(1);
  const [selectedMaxRisk, setSelectedMaxRisk] = useState<number>(500);
  
  // Available symbols for bot creation (only supported symbols)
  const availableBotSymbols = ['SPY', 'QQQ', 'IWM'];
  const availableStrategies = [
    { value: 'rsi-vwap-morning-session', label: 'RSI-VWAP Morning Session' },
    { value: 'momentum-scalper', label: 'Momentum Scalper' },
    { value: 'mean-reversion', label: 'Mean Reversion' }
  ];
  
  // Symbol-specific data loading states 
  const [symbolDataLoaded, setSymbolDataLoaded] = useState<Record<string, boolean>>({});
  const [symbolChartBars, setSymbolChartBars] = useState<Record<string, ChartBar[]>>({});
  const [symbolLivePrices, setSymbolLivePrices] = useState<Record<string, number>>({});
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Helper function to get unique symbols from active paper trading bots
  const getActiveBotSymbols = (): string[] => {
    if (!activeBots || activeBots.length === 0) {
      return [config.symbol]; // Fallback to config symbol
    }
    const symbols = [...new Set(activeBots.map(bot => bot.symbol))];
    return symbols.length > 0 ? symbols : [config.symbol];
  };

  // Validate symbol data separation and integrity - TAB-AWARE
  const validateSymbolDataSeparation = () => {
    let symbolsToValidate: string[] = [];
    
    if (activeTab === 'paper') {
      // Paper trading mode: validate active bot symbols
      symbolsToValidate = getActiveBotSymbols();
    } else if (activeTab === 'historical') {
      // Historical backtesting mode: only validate config symbol
      symbolsToValidate = [config.symbol];
    } else {
      // Unknown tab, no validation needed
      console.log(`[DATA VALIDATION] Skipping validation for unknown tab: ${activeTab}`);
      return {};
    }
    
    const validationResults: Record<string, any> = {};
    
    for (const symbol of symbolsToValidate) {
      const hasData = symbolChartBars[symbol] && symbolChartBars[symbol].length > 0;
      const isLoaded = symbolDataLoaded[symbol] || false;
      const barCount = symbolChartBars[symbol]?.length || 0;
      
      validationResults[symbol] = {
        hasData,
        isLoaded, 
        barCount,
        status: hasData && isLoaded ? 'VALID' : 'MISSING_DATA'
      };
    }
    
    console.log(`[DATA VALIDATION] Tab: ${activeTab}, Symbols:`, symbolsToValidate, 'Results:', validationResults);
    return validationResults;
  };

  // Get current symbol data for active chart  
  const getCurrentSymbolData = () => {
    // CRITICAL FIX: Never fallback to wrong symbol data
    // Each symbol MUST use only its own data to prevent contamination
    const symbolBars = symbolChartBars[activeChartSymbol] || [];
    const symbolPrice = symbolLivePrices[activeChartSymbol] || 0;
    const symbolLoaded = symbolDataLoaded[activeChartSymbol] || false;
    
    // Log data separation status for validation
    console.log(`[DATA SEPARATION] ${activeChartSymbol}: ${symbolBars.length} bars, loaded: ${symbolLoaded}, price: ${symbolPrice}`);
    
    // Validate data integrity 
    if (activeChartSymbol && symbolBars.length === 0 && symbolLoaded) {
      console.warn(`⚠️ [DATA INTEGRITY] Symbol ${activeChartSymbol} marked as loaded but has no bars!`);
    }
    
    return {
      loaded: symbolLoaded,
      chartBars: symbolBars,
      livePrice: symbolPrice
    };
  };

  // Convert paper bots to enhanced bot config format with proper data validation
  const getEnhancedBotConfigs = (): EnhancedBotConfig[] => {
    if (!paperBots || paperBots.length === 0) return [];
    
    return paperBots.map(bot => ({
      botId: bot.id,
      botName: bot.name || `${bot.symbol} Bot`,
      symbol: bot.symbol,
      strategy: bot.strategy || 'HAVWAP',
      timeframe: '1m', // Default to 1-minute for live trading
      status: bot.status as 'running' | 'stopped' | 'error',
      isActive: true // All paper trading bots are considered active
    }));
  };

  // Handle WebSocket initialization from enhanced charts
  const handleWebSocketReady = (botId: string, config: { symbol: string; startTimestamp: number }) => {
    console.log(`[BACKTESTING] 🔌 WebSocket ready for bot ${botId} (${config.symbol})`);
    console.log(`[BACKTESTING] 📅 Starting from timestamp: ${new Date(config.startTimestamp * 1000).toISOString()}`);
    
    // Ensure multi-symbol WebSocket includes this symbol
    if (!isSymbolConnected(config.symbol)) {
      console.log(`[BACKTESTING] 🔄 Adding ${config.symbol} to multi-symbol WebSocket`);
      addSymbolConnection(config.symbol);
    }
    
    // Update live price tracking
    const currentPrice = getSymbolLivePrice(config.symbol);
    if (currentPrice !== undefined) {
      setSymbolLivePrices(prev => ({
        ...prev,
        [config.symbol]: currentPrice
      }));
    }
  };

  // Handle validation completion for monitoring
  const handleValidationComplete = (results: any[]) => {
    const readyCount = results.filter(r => r.status === 'ready' || r.status === 'websocket-only').length;
    const errorCount = results.filter(r => r.status === 'error').length;
    
    console.log(`[BACKTESTING] ✅ Data validation complete: ${readyCount} ready, ${errorCount} errors`);
    
    if (errorCount > 0) {
      toast({
        title: "Data Validation Warning",
        description: `${errorCount} bot${errorCount !== 1 ? 's' : ''} had data issues. Using WebSocket-only mode for affected bots.`,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Data Validation Complete",
        description: `All ${readyCount} trading bot${readyCount !== 1 ? 's' : ''} validated successfully with complete 5-day historical coverage.`,
      });
    }
  };

  // FIXED: Only show ACTIVE/RUNNING bots in tabs, not all bots
  const getBotChartsData = (): BotChartData[] => {
    if (!paperBots || paperBots.length === 0) return [];
    
    // CRITICAL FIX: Only include active (running) bots in chart tabs
    const activeBots = paperBots.filter(bot => 
      bot.status === 'running' || bot.status === 'error' // Include error status to show issues
    );
    
    console.log(`[BOT TABS] Total bots: ${paperBots.length}, Active bots: ${activeBots.length}`);
    
    return activeBots.map(bot => ({
      botId: bot.id.toString(), // Ensure string type for compatibility
      botName: bot.name || `${bot.symbol} Bot`,
      symbol: bot.symbol,
      status: bot.status as 'running' | 'stopped' | 'error',
      bars: symbolChartBars[bot.symbol] || [],
      currentPrice: symbolLivePrices[bot.symbol],
      isConnected: isSymbolConnected(bot.symbol),
      strategy: bot.strategy || 'HAVWAP',
      lastUpdate: wsConnections[bot.symbol]?.lastUpdate || 0,
    }));
  };

    // FIXED: Use current November 2025 dates instead of hardcoded January/February dates
  const getCurrentDateRange = () => {
    const now = new Date();
    const endDate = now.toISOString().split('T')[0]; // Today: 2025-11-11
    
    // Get 5 trading days ago (approximately 1 week back)
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7); // Go back 7 days to ensure 5 trading days
    const startDateStr = startDate.toISOString().split('T')[0];
    
    return { startDate: startDateStr, endDate };
  };

  const [config, setConfig] = useState<BacktestConfig>(() => {
    const { startDate, endDate } = getCurrentDateRange();
    return {
      strategy: 'rsi-vwap-morning-session',
      symbol: 'SPY',
      startDate, // Dynamic current dates: 2025-11-04 to 2025-11-11
      endDate,
      timeframe: '1Min' as '1Min' | '5Min' | '15Min' | '1Hour' | '1Day',
      initialCapital: 100000,
      commissionPerContract: 0.65,
      slippagePct: 50,
    };
  });
  const [legacyTrades, setLegacyTrades] = useState<any[]>([]);
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

  // Enhanced Multi-Symbol WebSocket connection with background bot operations
  const activeSymbols = getActiveBotSymbols();
  const {
    connections: wsConnections,
    isConnected: isSymbolConnected,
    getLivePrice: getSymbolLivePrice,
    addSymbol: addSymbolConnection,
    removeSymbol: removeSymbolConnection,
    forceReconnect: forceSymbolReconnect,
    getAllConnectedSymbols,
    connectionStatus: wsConnectionStatus
  } = useMultiSymbolWebSocket(activeSymbols, {
    maxReconnectAttempts: 10,
    reconnectInterval: 5000,
    heartbeatInterval: 30000
  });

  // Update legacy states from multi-symbol WebSocket for backward compatibility
  useEffect(() => {
    // Update individual symbol live prices
    const updatedPrices: Record<string, number> = {};
    let hasUpdates = false;
    
    activeSymbols.forEach(symbol => {
      const price = getSymbolLivePrice(symbol);
      if (price !== undefined && price > 0) {
        updatedPrices[symbol] = price;
        hasUpdates = true;
        
        console.log(`[LIVE DATA] 💰 ${symbol} price update: $${price.toFixed(2)}`);
        
        // Update legacy single symbol price if it matches config
        if (symbol === config.symbol) {
          setLivePrice(price);
        }
      }
    });
    
    if (hasUpdates) {
      setSymbolLivePrices(prev => ({ ...prev, ...updatedPrices }));
      
      // CRITICAL FIX: Update chart bars with live price data for Paper Trading charts
      Object.entries(updatedPrices).forEach(([symbol, price]) => {
        setSymbolChartBars(prev => {
          const currentBars = prev[symbol] || [];
          if (currentBars.length === 0) return prev;

          // Get the last bar and update it with current price
          const updatedBars = [...currentBars];
          const lastBar = updatedBars[updatedBars.length - 1];
          const currentTime = Math.floor(Date.now() / 1000);

          // Check if we need a new bar (more than 1 minute since last bar)
          if (currentTime - lastBar.timestamp > 60) {
            // Create new 1-minute bar
            const currentDate = new Date(currentTime * 1000);
            const newBar = {
              time: currentDate.toISOString(),
              timestamp: currentTime,
              date: currentDate.toISOString().split('T')[0],
              open: price,
              high: price,
              low: price,
              close: price,
              volume: 1
            };
            updatedBars.push(newBar);
            console.log(`[LIVE BARS] ✅ New bar created for ${symbol}: $${price}`);
          } else {
            // Update current bar with new price
            updatedBars[updatedBars.length - 1] = {
              ...lastBar,
              high: Math.max(lastBar.high, price),
              low: Math.min(lastBar.low, price),
              close: price,
              volume: lastBar.volume + 1
            };
            console.log(`[LIVE BARS] ⚡ Updated current bar for ${symbol}: $${price}`);
          }

          return { ...prev, [symbol]: updatedBars };
        });
      });
      
      // ULTRA LOW-LATENCY: Immediate updates, no polling delays
      console.log(`[LIVE DATA] ⚡ ULTRA-FAST updated ${Object.keys(updatedPrices).length} symbols - ZERO polling, pure WebSocket events`);
    }
  }, [wsConnections, activeSymbols, config.symbol, getSymbolLivePrice]);

  // Handle live trade updates for active chart symbol
  useEffect(() => {
    const activePrice = getSymbolLivePrice(activeChartSymbol);
    if (activePrice !== undefined) {
      updateWithLiveTrade({
        symbol: activeChartSymbol,
        price: activePrice,
        size: 100, // Default size for WebSocket updates
        timestamp: new Date().toISOString()
      });
    }
  }, [wsConnections, activeChartSymbol, getSymbolLivePrice, updateWithLiveTrade]);

  // ULTRA LOW-LATENCY: WebSocket-driven options updates (NO POLLING)
  useEffect(() => {
    // Initial options data load
    const fetchInitialOptionsData = async () => {
      if (!activeChartSymbol) return;
      
      // Only load options data for Live Paper Trading tab
      if (activeTab !== 'paper') {
        console.log(`[OPTIONS INIT] ⏭️  Skipping options load - not on Live Paper Trading tab`);
        return;
      }
      
      try {
        // Get today's date in YYYY-MM-DD format for 0DTE options
        const today = new Date();
        const todayExpiration = today.toISOString().split('T')[0];
        
        console.log(`[OPTIONS INIT] 🔄 Initial LIVE options load for ${activeChartSymbol} with 0DTE expiration: ${todayExpiration}`);
        const response = await fetch(ENDPOINTS.OPTIONS_MATRIX_DATA, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            symbol: activeChartSymbol,
            expiration: todayExpiration  // Request today's 0DTE options
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.contracts && data.contracts.length > 0) {
            // LIVE Paper Trading: quotes + trades from WebSocket indicative feed
            setLiveOptionsData({
              contracts: data.contracts,
              currentPrice: data.currentPrice,
              summary: data.summary,
              timestamp: data.timestamp,
              totalContracts: data.contracts.length,
              symbolsWithData: 1,
              recentTrades: data.recentTrades || []
            });
            console.log(`[OPTIONS INIT] ✅ Loaded ${data.contracts.length} LIVE contracts for ${activeChartSymbol}`);
          }
        }
      } catch (error) {
        console.error('[OPTIONS INIT] ❌ Error:', error);
      }
    };

    // ULTRA-FAST: Listen for live option quote updates (bypass React state)
    const handleLiveOptionUpdate = (event: any) => {
      const optionQuote = event.detail;
      console.log(`[LIVE OPTIONS] ⚡ Ultra-fast update: ${optionQuote.symbol} - Bid: $${optionQuote.bid} Ask: $${optionQuote.ask}`);

      // Update LIVE options data (WebSocket quotes + trades)
      setLiveOptionsData(prev => {
        if (!prev || !prev.contracts || !Array.isArray(prev.contracts)) {
          console.log(`[LIVE OPTIONS] ⚠️ No contracts array to update`);
          return prev;
        }

        // Update the specific contract in the contracts array
        const updatedContracts = prev.contracts.map(option => {
          if (option.symbol === optionQuote.symbol) {
            console.log(`[LIVE OPTIONS] 🔄 Updating ${optionQuote.symbol}: $${optionQuote.bid}/$${optionQuote.ask}`);
            return {
              ...option,
              bid: optionQuote.bid,
              ask: optionQuote.ask,
              bid_size: optionQuote.bid_size,
              ask_size: optionQuote.ask_size,
              midPrice: (optionQuote.bid + optionQuote.ask) / 2,
              spread: optionQuote.ask - optionQuote.bid,
              timestamp: optionQuote.timestamp,
              lastUpdate: Date.now()
            };
          }
          return option;
        });

        return {
          ...prev,
          contracts: updatedContracts,
          lastUpdate: Date.now()
        };
      });
    };

    // Note: Options data now loads automatically when switching to Live Paper Trading tab
    // No initial load needed - controlled by tab switching
    
    // CONTEXT7: Load live options matrix for the active bot symbol
    const loadLiveOptionsMatrix = async () => {
      if (!activeChartSymbol) return;
      
      const activeBotForSymbol = paperBots?.find(bot => bot.symbol === activeChartSymbol);
      const botStatus = activeBotForSymbol?.status || 'running';
      
      console.log(`[LIVE OPTIONS MATRIX] 🔄 Auto-loading for ${activeChartSymbol} (bot status: ${botStatus})`);
      await handleFetchLiveOptionsData(activeChartSymbol, botStatus);
    };
    
    // Load options matrix automatically when symbol changes
    loadLiveOptionsMatrix();
    
    // Listen for ultra-fast option updates
    window.addEventListener('optionQuoteUpdate', handleLiveOptionUpdate);
    
    // Listen for real-time stock bar updates
    const handleStockBarUpdate = (event: any) => {
      const barData = event.detail;
      console.log(`📊 [CHART BAR] ${barData.symbol} new 1Min bar received`);
      
      // Update symbol chart bars with new OHLC data
      setSymbolChartBars(prev => {
        const currentBars = prev[barData.symbol] || [];
        const newBar = {
          t: new Date(barData.timestamp).getTime(),
          o: barData.open,
          h: barData.high, 
          l: barData.low,
          c: barData.close,
          v: barData.volume,
          timestamp: barData.timestamp
        };
        
        // Replace last bar if same minute, otherwise append
        const lastBar = currentBars[currentBars.length - 1];
        if (lastBar && Math.abs(lastBar.t - newBar.t) < 60000) {
          // Update current minute bar
          return {
            ...prev,
            [barData.symbol]: [...currentBars.slice(0, -1), newBar]
          };
        } else {
          // New minute bar
          return {
            ...prev,
            [barData.symbol]: [...currentBars, newBar].slice(-500) // Keep last 500 bars
          };
        }
      });
    };
    
    window.addEventListener('stockBarUpdate', handleStockBarUpdate);
    
    return () => {
      window.removeEventListener('optionQuoteUpdate', handleLiveOptionUpdate);
      window.removeEventListener('stockBarUpdate', handleStockBarUpdate);
    };
  }, [activeChartSymbol, paperBots]);

  // AUTO-LOAD OPTIONS WHEN SWITCHING TO LIVE PAPER TRADING TAB
  useEffect(() => {
    if (activeTab === 'paper' && activeChartSymbol) {
      console.log(`[TAB SWITCH] 🎯 Switched to Live Paper Trading - auto-loading data for ${activeChartSymbol}`);

      // CRITICAL: Clear historical data to prevent contamination
      setHistoricalOptionsData(null);
      setChartBars([]);
      setStockDataLoaded(false);

      const activeBotForSymbol = paperBots?.find(bot => bot.symbol === activeChartSymbol);
      const botStatus = activeBotForSymbol?.status || 'running';

      // Auto-load options data when switching to Live Paper Trading
      handleFetchLiveOptionsData(activeChartSymbol, botStatus);

      // CRITICAL FIX: Load chart bars for paper trading tab
      // This ensures the chart displays data even when no bots are running
      console.log(`[TAB SWITCH] 📊 Checking chart data for ${activeChartSymbol}:`, {
        hasData: symbolChartBars[activeChartSymbol]?.length || 0,
        isLoaded: symbolDataLoaded[activeChartSymbol],
        hasBots: paperBots?.length || 0
      });

      // Always load if we don't have bars, regardless of the loaded flag
      if (!symbolChartBars[activeChartSymbol] || symbolChartBars[activeChartSymbol].length === 0) {
        console.log(`[TAB SWITCH] 📊 Loading chart data for ${activeChartSymbol}...`);
        (async () => {
          try {
            const response = await fetch(ENDPOINTS.TRADING_CHART_DATA, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                symbol: activeChartSymbol,
                timeframe: '1m',
                forceCurrentData: true  // Force current data, not backtest dates
              })
            });

            if (response.ok) {
              const chartData = await response.json();
              console.log(`[TAB SWITCH] 📥 Received chart data:`, {
                symbol: activeChartSymbol,
                dataLength: chartData.data?.length || 0,
                count: chartData.count,
                success: chartData.success
              });

              if (chartData.data && chartData.data.length > 0) {
                setSymbolChartBars(prev => ({...prev, [activeChartSymbol]: chartData.data}));
                setSymbolDataLoaded(prev => ({...prev, [activeChartSymbol]: true}));
                console.log(`[TAB SWITCH] ✅ Loaded ${chartData.count} chart bars for ${activeChartSymbol}`);

                toast({
                  title: "Chart Data Loaded",
                  description: `${chartData.count} bars loaded for ${activeChartSymbol}`,
                });
              } else {
                console.warn(`[TAB SWITCH] ⚠️ No bars in response for ${activeChartSymbol}`);
              }
            } else {
              console.error(`[TAB SWITCH] ❌ Failed to fetch chart data: HTTP ${response.status}`);
            }
          } catch (error) {
            console.error(`[TAB SWITCH] ❌ Error loading chart data for ${activeChartSymbol}:`, error);
          }
        })();
      } else {
        console.log(`[TAB SWITCH] ✓ Chart data already loaded for ${activeChartSymbol} (${symbolChartBars[activeChartSymbol].length} bars)`);
      }
    } else if (activeTab === 'historical') {
      // CRITICAL: Clear live paper trading data to prevent contamination
      console.log(`[TAB SWITCH] ↩️  Switched to Historical - clearing live options data`);
      setLiveOptionsData(null);
      setSymbolChartBars({});
      setSymbolDataLoaded({});
      setSymbolLivePrices({});
      setOptionsDataLoaded(false);
    }
  }, [activeTab, activeChartSymbol, paperBots]);

  // REAL-TIME OPTIONS MATRIX: React to WebSocket price updates (NO POLLING)
  useEffect(() => {
    if (!activeChartSymbol || !symbolLivePrices[activeChartSymbol]) return;

    const currentPrice = symbolLivePrices[activeChartSymbol];
    const activeBotForSymbol = paperBots?.find(bot => bot.symbol === activeChartSymbol);

    if (activeBotForSymbol?.status === 'running' && liveOptionsData?.contracts) {
      // Only update if underlying price changed significantly (avoid excessive updates)
      const lastKnownPrice = liveOptionsData.currentPrice || 0;
      const priceChange = Math.abs(currentPrice - lastKnownPrice);
      const significantChange = priceChange > 0.50; // 50 cents threshold
      
      if (significantChange) {
        console.log(`[LIVE OPTIONS] 🔄 WebSocket price change: $${lastKnownPrice.toFixed(2)} → $${currentPrice.toFixed(2)} (Δ$${priceChange.toFixed(2)})`);

        // Update the current price in LIVE options data for real-time ATM sorting
        setLiveOptionsData(prev => prev ? {
          ...prev,
          currentPrice: currentPrice,
          lastPriceUpdate: Date.now()
        } : prev);
      }
    }
  }, [symbolLivePrices, activeChartSymbol, paperBots, liveOptionsData?.currentPrice]);

  // Derived states for template compatibility
  // Manage symbol connections when active bots change
  useEffect(() => {
    const currentSymbols = new Set(getAllConnectedSymbols());
    const requiredSymbols = new Set(activeSymbols);
    
    // Add new symbols for background operations
    requiredSymbols.forEach(symbol => {
      if (!currentSymbols.has(symbol)) {
        console.log(`[Multi-WebSocket] � Adding symbol connection: ${symbol}`);
        addSymbolConnection(symbol);
      }
    });
    
    // Note: We keep all symbol connections active for background bot operations
    // Even if user switches charts, bots continue receiving data and trading
  }, [activeSymbols, getAllConnectedSymbols, addSymbolConnection]);

  // Connection status helpers for backward compatibility
  const forceReconnect = () => {
    activeSymbols.forEach(symbol => {
      console.log(`[Multi-WebSocket] 🔄 Force reconnecting ${symbol}`);
      forceSymbolReconnect(symbol);
    });
  };

  // Multi-Symbol Data Loading Effect - Load data for all active bot symbols
  useEffect(() => {
    const loadSymbolData = async () => {
      const activeBotSymbols = getActiveBotSymbols();
      console.log(`[Multi-Symbol] Starting data load for symbols:`, activeBotSymbols);
      
      for (const symbol of activeBotSymbols) {
        // Skip if already loaded
        if (symbolDataLoaded[symbol]) {
          console.log(`[Multi-Symbol] ⏭️ Skipping ${symbol} - already loaded`);
          continue;
        }
        
        try {
          console.log(`[Multi-Symbol] 📡 Loading data for ${symbol}...`);
          
          // CRITICAL FIX: Proper mode detection to prevent date contamination
          // Check activeTab instead of config.startDate to prevent backtest date contamination
          let response;
          const isHistoricalBacktest = activeTab === 'historical' && (dataPreviewMode || config.startDate);
          const isLivePaperTrading = activeTab === 'paper';
          
          if (isHistoricalBacktest) {
            // Historical Backtest mode: use specific date range from config
            console.log(`[Historical Backtest] Loading data for ${symbol} (${config.startDate} to ${config.endDate})`);
            response = await fetchHistoricalData({
              symbol: symbol,
              startDate: config.startDate,
              endDate: config.endDate,
              timeframe: config.timeframe
            });
          } else if (isLivePaperTrading) {
            // Live Paper Trading mode: ALWAYS use current date - last 5 trading days
            console.log(`[Live Paper Trading] Loading CURRENT market data for ${symbol} (last 5 trading days)`);
            const chartResponse = await fetch(ENDPOINTS.TRADING_CHART_DATA, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                symbol, 
                timeframe: '1m',
                // Explicitly request current data - no historical dates
                forceCurrentData: true 
              })
            });
            
            if (chartResponse.ok) {
              const chartData = await chartResponse.json();
              response = { bars: chartData.data || [] };
              console.log(`[Live Paper Trading] ✅ Loaded ${chartData.data?.length || 0} CURRENT bars for ${symbol}`);
            }
          } else {
            console.warn(`[Data Fetch] Unknown mode - activeTab: ${activeTab}, dataPreviewMode: ${dataPreviewMode}`);
          }
          
          if (response && response.bars && response.bars.length > 0) {
            // Update symbol-specific state
            setSymbolChartBars(prev => ({...prev, [symbol]: response.bars}));
            setSymbolDataLoaded(prev => ({...prev, [symbol]: true}));
            
            // Also update legacy single symbol state if this is the config symbol
            if (symbol === config.symbol) {
              setChartBars(response.bars);
              setStockDataLoaded(true);
            }
            
            console.log(`[Multi-Symbol] ✅ Loaded ${response.bars.length} bars for ${symbol}`);
          } else {
            console.warn(`[Multi-Symbol] ⚠️ No data returned for ${symbol}`);
          }
        } catch (error) {
          console.error(`[Multi-Symbol] ❌ Failed to load data for ${symbol}:`, error);
          toast({
            title: "Data Loading Error",
            description: `Failed to load data for ${symbol}: ${error instanceof Error ? error.message : error}`,
            variant: "destructive"
          });
        }
      }
    };
    
    // TAB-AWARE DATA LOADING: Only load data appropriate for current tab
    let shouldLoad = false;
    let loadReason = '';
    
    if (!dataPreviewMode) {
      if (activeTab === 'paper' && activeBots && activeBots.length > 0) {
        shouldLoad = true;
        loadReason = `Paper Trading mode with ${activeBots.length} active bots`;
      } else if (activeTab === 'historical' && config.symbol) {
        shouldLoad = true;
        loadReason = `Historical Backtest mode for symbol: ${config.symbol}`;
      }
    }
    
    if (shouldLoad) {
      console.log(`[Multi-Symbol] Triggering data load - ${loadReason}`);
      loadSymbolData().then(() => {
        // Validate data separation after loading (tab-aware)
        setTimeout(() => {
          const validation = validateSymbolDataSeparation();
          const missingData = Object.entries(validation).filter(([_, status]) => status.status === 'MISSING_DATA');
          
          if (missingData.length > 0) {
            console.error(`🚨 [CRITICAL] Missing data for ${activeTab} mode:`, missingData.map(([symbol, _]) => symbol));
            toast({
              title: `Data Loading Issue - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Mode`,
              description: `Missing data for symbols: ${missingData.map(([symbol, _]) => symbol).join(', ')}`,
              variant: "destructive"
            });
          } else {
            console.log(`✅ [DATA VALIDATION] All symbols have valid data for ${activeTab} mode`);
          }
        }, 2000);
      });
    } else {
      console.log(`[Multi-Symbol] Skipping data load - Tab: ${activeTab}, Preview: ${dataPreviewMode}, Bots: ${activeBots?.length || 0}, Config: ${config.symbol}`);
    }
  }, [activeTab, activeBots, dataPreviewMode, config.symbol, config.startDate, config.endDate, config.timeframe, symbolDataLoaded]);

  // Initialize data loading on component mount
  useEffect(() => {
    console.log('[Multi-Symbol] Component mounted, initializing data loading...');
    
    // Ensure we load data for the default symbol immediately
    if (!symbolDataLoaded[config.symbol] && !dataPreviewMode) {
      console.log(`[Multi-Symbol] Loading initial data for default symbol: ${config.symbol}`);
      
      const loadInitialData = async () => {
        try {
          let response;
          
          // Check if we're in live paper trading mode - ONLY based on active tab
          const isLivePaperTrading = activeTab === 'paper';
          
          if (isLivePaperTrading) {
            // Live Paper Trading mode: ALWAYS use current date - last 5 trading days
            console.log(`[Live Paper Trading] Loading CURRENT market data for ${config.symbol} (last 5 trading days)`);
            const chartResponse = await fetch(ENDPOINTS.TRADING_CHART_DATA, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                symbol: config.symbol, 
                timeframe: '1m',
                forceCurrentData: true  // Force current data, not backtest dates
              })
            });
            
            if (chartResponse.ok) {
              const chartData = await chartResponse.json();
              response = { bars: chartData.data || [] };
              console.log(`[Live Paper Trading] ✅ Loaded ${chartData.data?.length || 0} CURRENT bars for ${config.symbol}`);
            }
          } else {
            // Historical Backtesting mode: use configured historical dates
            console.log(`[Historical Backtest] Loading HISTORICAL data for ${config.symbol} from ${config.startDate} to ${config.endDate}`);
            response = await fetchHistoricalData({
              symbol: config.symbol,
              startDate: config.startDate,
              endDate: config.endDate,
              timeframe: config.timeframe
            });
            console.log(`[Historical Backtest] ✅ Loaded ${response?.bars?.length || 0} historical bars for ${config.symbol}`);
          }
          
          if (response && response.bars && response.bars.length > 0) {
            setSymbolChartBars(prev => ({...prev, [config.symbol]: response.bars}));
            setSymbolDataLoaded(prev => ({...prev, [config.symbol]: true}));
            setChartBars(response.bars);
            setStockDataLoaded(true);
            
            console.log(`[Multi-Symbol] ✅ Initial load complete: ${response.bars.length} bars for ${config.symbol}`);
          }
        } catch (error) {
          console.error(`[Multi-Symbol] ❌ Initial data load failed:`, error);
        }
      };
      
      loadInitialData();
    }
  }, []); // Run only once on mount

  useEffect(() => {
    if (results) {
      loadTrades();
    }
  }, [results]);

  // Remove automatic options fetching - we'll do it sequentially
  // useEffect removed to prevent race conditions between stock and options data

  // Live Options Loading: Trigger when activeChartSymbol changes for live/paper bots
  useEffect(() => {
    if (!activeChartSymbol || activeTab !== 'paper') return;
    
    // Find the bot for the active chart symbol
    const activeBotForSymbol = paperBots?.find(bot => bot.symbol === activeChartSymbol);
    
    if (activeBotForSymbol) {
      console.log(`[LIVE OPTIONS] 🔄 Chart symbol changed to ${activeChartSymbol} (bot status: ${activeBotForSymbol.status})`);
      handleFetchLiveOptionsData(activeChartSymbol, activeBotForSymbol.status);
    } else {
      console.log(`[LIVE OPTIONS] ⚠️ No bot found for symbol ${activeChartSymbol}`);
      // Clear LIVE options data if no bot exists for this symbol
      setLiveOptionsData(null);
      setOptionsDataLoaded(false);
    }
  }, [activeChartSymbol, activeTab, paperBots]);

  // Auto-load options data when bot status changes to 'running' in paper trading mode
  useEffect(() => {
    if (activeTab === 'paper' && activeChartSymbol && paperBots) {
      const activeBotForSymbol = paperBots.find(bot => bot.symbol === activeChartSymbol);
      
      if (activeBotForSymbol && activeBotForSymbol.status === 'running') {
        console.log(`[AUTO-LOAD OPTIONS] 🚀 Bot for ${activeChartSymbol} is running - auto-loading options matrix`);
        handleFetchLiveOptionsData(activeChartSymbol, activeBotForSymbol.status);
      }
    }
  }, [paperBots, activeChartSymbol, activeTab]);

  const loadTrades = async () => {
    if (!results) return;
    const tradesData = await fetchTrades(results.id);
    setLegacyTrades(tradesData);

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

  // LIVE OPTIONS MATRIX: Use real-time API for current market data
  const handleFetchLiveOptionsData = async (symbol: string, botStatus: 'running' | 'stopped' | 'error') => {
    console.log(`[LIVE OPTIONS] 🚀 Fetching live options data for ${symbol} (status: ${botStatus})...`);

    // Don't load options for stopped or errored bots
    if (botStatus !== 'running') {
      console.log(`[LIVE OPTIONS] ⏸️ Skipping options fetch for ${symbol} - bot status: ${botStatus}`);
      setLiveOptionsData(null);
      setOptionsDataLoaded(false);
      return;
    }

    try {
      console.log('[LIVE OPTIONS] 📡 Making API call to options-matrix-data endpoint...');

      // Get today's date in YYYY-MM-DD format for 0DTE options
      const today = new Date();
      const todayExpiration = today.toISOString().split('T')[0];

      console.log(`[LIVE OPTIONS] 🎯 Requesting 0DTE options for ${symbol} with expiration: ${todayExpiration}`);

      const response = await fetch(ENDPOINTS.OPTIONS_MATRIX_DATA, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: symbol,
          expiration: todayExpiration  // Request today's 0DTE options
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error('Failed to fetch options data');
      }

      console.log(`[LIVE OPTIONS] ✅ Loaded ${data.contracts.length} contracts for ${symbol}`);

      // LIVE Paper Trading: quotes + trades from WebSocket indicative feed
      setLiveOptionsData({
        contracts: data.contracts,
        currentPrice: data.currentPrice,
        summary: data.summary,
        timestamp: data.timestamp,
        totalContracts: data.contracts.length,
        symbolsWithData: 1,
        recentTrades: data.recentTrades || []
      });

      setOptionsDataLoaded(true);
      
      toast({
        title: '⚡ Live Options Loaded',
        description: `${data.contracts.length} contracts for ${symbol}`,
      });

    } catch (error: any) {
      console.error('[LIVE OPTIONS] ❌ Error:', error);
      setLiveOptionsData(null);
      setOptionsDataLoaded(false);

      toast({
        title: 'Live Options Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // SIMPLIFIED OPTIONS FETCH: Use direct API call to working backend (for historical backtesting)
  const handleFetchOptionsData = async (hasStockData = false) => {
    console.log('[HISTORICAL OPTIONS] 🚀 Fetching historical options data...');

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
      
      console.log('[HISTORICAL OPTIONS] � Making direct API call to backtesting server...');
      
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

        // Historical Backtest: OHLCV bars from database
        setHistoricalOptionsData({
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
      
      // Start progress tracking
      setDataFetchStep(1);
      setDataFetchProgress(10);
      setDataFetchMessage('Fetching stock data...');

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
      
      setDataFetchProgress(40);
      setDataFetchMessage(`Stock data loaded (${stockData.totalBars} bars)`);

      toast({
        title: "Stock Data Loaded",
        description: `Loaded ${stockData.totalBars} bars. Now fetching options...`,
      });

      // Fetch options data immediately
      setDataFetchStep(2);
      setDataFetchProgress(50);
      setDataFetchMessage('Fetching options data...');
      
      console.log('[SIMPLE FETCH] 🎯 Fetching options data...');
      console.log('[SIMPLE FETCH] Stock data loaded:', stockData.bars.length, 'bars');
      const optionsResult = await handleFetchOptionsData(true);
      
      if (optionsResult && optionsResult.data && optionsResult.data.bars) {
        const contracts = Object.keys(optionsResult.data.bars);
        setAvailableContracts(contracts);
        setSelectedContract(contracts[0] || '');
        setOptionsDataLoaded(true);
        
        setDataFetchStep(3);
        setDataFetchProgress(100);
        setDataFetchMessage(`Data loaded: ${contracts.length} option contracts`);
        
        toast({
          title: "Data Loaded - Running Backtest",
          description: `Loaded stock data and ${contracts.length} option contracts. Now running backtest...`,
        });

        // Automatically run backtest after data is loaded
        console.log('[AUTO-BACKTEST] Data loaded successfully, initiating backtest...');
        setTimeout(() => {
          // Reset data fetch progress when backtest starts
          setDataFetchStep(0);
          runBacktest(config);
        }, 500); // Small delay to ensure UI updates
      }

    } catch (error) {
      console.error('[SIMPLE FETCH] Error:', error);
      setDataFetchStep(0);
      setDataFetchProgress(0);
      setDataFetchMessage('');
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
                  <option value="rsi-vwap-morning-session">RSI-VWAP Morning Session (10:00-11:30 AM) ⭐</option>
                  <option value="rsi-vwap-fusion">RSI-VWAP Fusion (All Day)</option>
                  <option value="rsi-vwap-adaptive-tod">RSI-VWAP Adaptive Time-of-Day</option>
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



              {historicalOptionsData && (
                <div className="mt-3 p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-orange-500" />
                      <span className="text-sm font-medium text-orange-500">Historical Options Ready</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setHistoricalOptionsData(null);
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
                    {historicalOptionsData?.totalBars || 0} OHLCV bars for {historicalOptionsData?.symbolsWithData || 0} contracts ({historicalOptionsData?.dateRange?.start || ''} to {historicalOptionsData?.dateRange?.end || ''})
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
                        setHistoricalOptionsData(null);
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

              {/* Previous Backtests Dropdown */}
              {previousBacktests.length > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-purple-500/10 border border-purple-500/20">
                  <div className="flex items-center gap-2 mb-2">
                    <History className="w-4 h-4 text-purple-500" />
                    <span className="text-sm font-medium text-purple-500">Previous Backtests</span>
                    <Badge variant="outline" className="text-xs">
                      {previousBacktests.length} available
                    </Badge>
                  </div>
                  
                  <Select
                    onValueChange={async (value) => {
                      const backtestId = value;
                      console.log('[PREVIOUS BACKTEST] Loading backtest ID:', backtestId);

                      try {
                        // Fetch both metrics and trades for selected backtest
                        const [metricsData] = await Promise.all([
                          fetchBacktestById(backtestId),
                          fetchTrades(backtestId)
                        ]);

                        toast({
                          title: "Backtest Loaded",
                          description: `Loaded ${metricsData.total_trades || 0} trades from backtest #${backtestId}`,
                        });
                      } catch (error) {
                        console.error('[PREVIOUS BACKTEST] Error loading:', error);
                        toast({
                          title: "Load Failed",
                          description: `Could not load backtest #${backtestId}`,
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Load Previous Backtest..." />
                    </SelectTrigger>
                    <SelectContent>
                      {previousBacktests.map((bt) => {
                        const returnPct = (parseFloat(bt.total_return || '0') * 100).toFixed(2);
                        const returnColor = parseFloat(bt.total_return || '0') >= 0 ? 'text-green-500' : 'text-red-500';
                        
                        return (
                          <SelectItem key={bt.id} value={bt.id.toString()}>
                            <div className="flex flex-col">
                              <span className="font-medium">
                                {bt.strategy_name} - {bt.symbol}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {bt.total_trades || 0} trades • <span className={returnColor}>{returnPct}%</span> • {new Date(bt.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  
                  {loadingPrevious && (
                    <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Loading previous backtests...
                    </div>
                  )}
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
                        const barsCount = historicalOptionsData?.bars?.[contract]?.length || 0;
                        return (
                          <option key={contract} value={contract}>
                            {contract} ({barsCount} OHLCV bars)
                          </option>
                        );
                      })}
                    </select>

                    {selectedContract && (
                      <div className="mt-2 p-2 bg-background/50 rounded border text-xs">
                        <p className="font-medium text-blue-600">Selected: {selectedContract}</p>
                        <p className="text-muted-foreground mt-1">
                          OHLCV bars available: {historicalOptionsData?.bars?.[selectedContract]?.length || 0}
                        </p>
                        <p className="text-muted-foreground">
                          Contract type: {selectedContract.includes('C') ? 'Call' : selectedContract.includes('P') ? 'Put' : 'Unknown'}
                        </p>
                      </div>
                    )}
                    
                    {/* Contract Summary */}
                    <div className="mt-2 p-2 bg-background/20 rounded border-dashed border text-xs">
                      <p className="font-medium">Historical Options Summary:</p>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <span>Total Contracts: {availableContracts.length}</span>
                        <span>Total OHLCV Bars: {historicalOptionsData?.totalBars || 0}</span>
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

            {/* Conditional Display: Progress, BacktestResults, or Preview */}
            {(dataFetchStep > 0 && dataFetchStep < 3) ? (
              // Data fetching progress
              <BacktestProgress
                currentStep={dataFetchStep}
                progress={dataFetchProgress}
                statusMessage={dataFetchMessage}
                steps={[
                  { id: 1, title: 'Fetch Stock Data', status: dataFetchStep > 1 ? 'completed' : dataFetchStep === 1 ? 'active' : 'pending' },
                  { id: 2, title: 'Fetch Options Data', status: dataFetchStep > 2 ? 'completed' : dataFetchStep === 2 ? 'active' : 'pending' },
                  { id: 3, title: 'Start Backtest', status: dataFetchStep >= 3 ? 'completed' : 'pending' },
                ]}
              />
            ) : loading ? (
              // Backtest running progress
              <BacktestProgress
                currentStep={2}
                progress={progress}
                statusMessage={statusMessage}
                steps={[
                  { id: 1, title: 'Data Ready', status: 'completed' },
                  { id: 2, title: 'Running Backtest', status: progress < 100 ? 'active' : 'completed' },
                  { id: 3, title: 'Loading Results', status: progress >= 100 ? 'active' : 'pending' },
                ]}
              />
            ) : metrics ? (
              // Show results with error boundary
              <BacktestErrorBoundary>
                <BacktestResults 
                  metrics={metrics}
                  trades={trades}
                  loading={false}
                />
              </BacktestErrorBoundary>
            ) : (
              <>
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
                          {legacyTrades.length} trades
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

                {/* Historical Options Data Stats */}
                {historicalOptionsData && !results && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <Target className="w-5 h-5 text-orange-500" />
                      Historical Options Data Summary (OHLCV)
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                        <p className="text-sm text-muted-foreground">Total Contracts</p>
                        <p className="text-2xl font-bold mt-1 text-orange-500">
                          {historicalOptionsData?.symbolsWithData || 0}
                        </p>
                      </div>
                      <div className="p-4 rounded-lg bg-orange-500/10 border border-orange-500/20">
                        <p className="text-sm text-muted-foreground">Total OHLCV Bars</p>
                        <p className="text-2xl font-bold mt-1 text-orange-500">
                          {(historicalOptionsData?.totalBars || 0).toLocaleString()}
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

                {/* Backtest Metrics Grid - Legacy */}
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

                {/* Trade List - Legacy */}
                <h3 className="text-lg font-semibold mb-3">Trade History</h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {legacyTrades.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      {loading ? 'Loading trades...' : 'No trades yet'}
                    </div>
                  ) : (
                    legacyTrades.map((trade, idx) => (
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
              </>
            )}
          </Card>
        </div>
          </TabsContent>

          <TabsContent value="paper" className="space-y-4 mt-4">
            {/* Paper Trading Info Banner */}
            <div className="bg-muted/50 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold">📄 Live Paper Trading Mode</h3>
                <div className="flex items-center gap-2">
                  {activeSymbols.some(symbol => isSymbolConnected(symbol)) && (
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
              {dataError && (
                <div className="mt-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-500">{dataError}</p>
                </div>
              )}
            </div>

            {/* Multi-Bot Trading Charts - Individual Tabs for Each Bot */}
            <div data-testid="chart-container">
              {/* Enhanced system temporarily disabled to fix duplicate charts issue */}
              {false && (
                <EnhancedTradingCharts
                  botConfigs={getEnhancedBotConfigs()}
                  onWebSocketReady={handleWebSocketReady}
                  onValidationComplete={handleValidationComplete}
                  autoStartWebSocket={true}
                />
              )}
              
              {/* Primary Chart System - Working Version */}
              <TradingChartTabs
                    botCharts={getBotChartsData()}
                    defaultActiveTab={paperBots?.[0]?.id}
                    onTabChange={(botId, symbol) => {
                      console.log(`[CHART TABS] Switched to bot ${botId} (${symbol})`);
                      setActiveChartSymbol(symbol);
                      
                      // Load chart data if not already loaded
                      if (!symbolDataLoaded[symbol]) {
                        (async () => {
                      try {
                        console.log(`[CHART TABS] Loading chart data for ${symbol}`);
                        const response = await fetch(ENDPOINTS.TRADING_CHART_DATA, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ 
                            symbol, 
                            timeframe: '1m',
                            forceCurrentData: true  // Force current data, not backtest dates
                          })
                        });
                        
                        if (response.ok) {
                          const chartData = await response.json();
                          if (chartData.data && chartData.data.length > 0) {
                            setSymbolChartBars(prev => ({...prev, [symbol]: chartData.data}));
                            setSymbolDataLoaded(prev => ({...prev, [symbol]: true}));
                            toast({
                              title: "Chart Data Loaded",
                              description: `${chartData.count} bars loaded for ${symbol}`,
                            });
                          }
                        }
                      } catch (error) {
                        console.error(`Error loading chart data for ${symbol}:`, error);
                        toast({
                          title: "Chart Loading Error",
                          description: `Failed to load chart data for ${symbol}`,
                          variant: "destructive"
                        });
                      }
                    })();
                  }
                }}
                height={450}
              />
              
              {/* Connection Status Summary */}
              {(() => {
                const connectedSymbols = getAllConnectedSymbols();
                const connectionDetails = activeSymbols.map(symbol => ({
                  symbol,
                  connected: isSymbolConnected(symbol),
                  price: getSymbolLivePrice(symbol),
                  lastUpdate: wsConnections[symbol]?.lastUpdate || 0
                }));
                
                return (
                  <Card className="mt-4 p-3 bg-secondary/20">
                    <div className="text-xs space-y-2">
                      {/* Connection Status Bar */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <TrendingUp className="w-4 h-4 text-primary" />
                          <span className="font-medium">Multi-Symbol WebSocket Status:</span>
                          <div className="flex gap-2">
                            {connectionDetails.map(({ symbol, connected, price }) => (
                              <div 
                                key={symbol} 
                                className={`flex items-center gap-1 px-2 py-1 rounded text-xs ${
                                  connected ? 'bg-green-500/20 text-green-700' : 'bg-red-500/20 text-red-700'
                                }`}
                              >
                                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                                <span>{symbol}</span>
                                {price && <span className="font-mono">${price.toFixed(2)}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="text-muted-foreground">
                          {connectedSymbols.length}/{activeSymbols.length} Connected • {paperBots?.length || 0} Active Bots
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })()}
            </div>

            <div className="grid grid-cols-12 gap-4">
              {/* Multi-Bot Management Controls */}
              <Card className="col-span-4 p-6 bg-gradient-card border-border shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Multi-Bot Manager</h2>
                  <Badge variant="outline">
                    {activeBots?.length || 0} Active
                  </Badge>
                </div>
                
                {/* Quick Bot Status Overview */}
                <div className="mb-4">
                  <Label className="text-xs font-semibold mb-2 block">Symbol Status</Label>
                  <div className="grid grid-cols-3 gap-2">
                    {availableBotSymbols.map((symbol) => {
                      const existingBot = activeBots?.find(bot => bot.symbol === symbol);
                      const isRunning = existingBot?.status === 'running';
                      const isStopped = existingBot?.status === 'stopped';
                      
                      return (
                        <div
                          key={symbol}
                          className={`p-2 rounded-lg text-center cursor-pointer transition-all ${
                            isRunning 
                              ? 'bg-green-500/20 border-green-500/50 border' 
                              : isStopped
                              ? 'bg-yellow-500/20 border-yellow-500/50 border'
                              : 'bg-secondary/50 border-border border hover:bg-secondary'
                          }`}
                          onClick={() => {
                            if (existingBot) {
                              setActiveChartSymbol(symbol);
                            } else {
                              setSelectedBotSymbol(symbol);
                            }
                          }}
                        >
                          <div className="text-xs font-semibold">{symbol}</div>
                          <div className="text-[10px] text-muted-foreground mt-1">
                            {isRunning ? '🟢 Running' : isStopped ? '🟡 Stopped' : '⭕ Available'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Create New Bot Form */}
                <div className="space-y-4 border border-border rounded-lg p-4 bg-secondary/20 mb-4">
                  <h3 className="font-semibold text-sm">Create New Bot</h3>
                  


                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Symbol</Label>
                      <select
                        className="w-full mt-1 p-2 text-sm rounded-lg bg-secondary border border-border text-foreground"
                        value={selectedBotSymbol}
                        onChange={(e) => setSelectedBotSymbol(e.target.value)}
                        aria-label="Select trading symbol for bot"
                      >
                        {availableBotSymbols.map((symbol) => (
                          <option key={symbol} value={symbol}>
                            {symbol}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs">Strategy</Label>
                      <select
                        className="w-full mt-1 p-2 text-sm rounded-lg bg-secondary border border-border text-foreground"
                        value={selectedBotStrategy}
                        onChange={(e) => setSelectedBotStrategy(e.target.value)}
                        aria-label="Select trading strategy for bot"
                      >
                        {availableStrategies.map((strategy) => (
                          <option key={strategy.value} value={strategy.value}>
                            {strategy.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Position Size</Label>
                      <Input
                        type="number"
                        className="mt-1 text-sm"
                        value={selectedPositionSize}
                        onChange={(e) => setSelectedPositionSize(Number(e.target.value))}
                        min={1}
                        max={10}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Max Risk ($)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        className="mt-1 text-sm"
                        value={selectedMaxRisk}
                        onChange={(e) => setSelectedMaxRisk(Number(e.target.value))}
                        min={100}
                        max={2000}
                      />
                    </div>
                  </div>

                  <Button
                    className="w-full bg-gradient-primary shadow-glow text-sm"
                    onClick={async () => {
                      try {
                        // Check if bot already exists for this symbol
                        const existingBot = activeBots?.find(bot => bot.symbol === selectedBotSymbol);
                        if (existingBot) {
                          toast({
                            title: "Bot Already Exists",
                            description: `A bot for ${selectedBotSymbol} already exists. Use the controls to start/stop it.`,
                            variant: "destructive"
                          });
                          return;
                        }

                        const newBot: Partial<PaperTradingBot> = {
                          name: `${selectedBotStrategy}-${selectedBotSymbol}`,
                          strategy: selectedBotStrategy,
                          symbol: selectedBotSymbol,
                          parameters: {
                            positionSize: selectedPositionSize,
                            maxRisk: selectedMaxRisk
                          }
                        };
                        
                        console.log(`[BOT CREATION] Creating bot for ${selectedBotSymbol}:`, newBot);
                        
                        const createdBot = await createBot(newBot);
                        if (createdBot) {
                          toast({
                            title: "Bot Created Successfully",
                            description: `${selectedBotSymbol} trading bot deployed and ready`,
                          });
                          
                          // Set as active chart symbol to show the new bot's trading space
                          setActiveChartSymbol(selectedBotSymbol);
                          
                          console.log(`[BOT CREATION] ✅ Bot created for ${selectedBotSymbol}, switching to chart view`);
                        }
                      } catch (error) {
                        console.error(`[BOT CREATION] ❌ Failed to create bot:`, error);
                        toast({
                          title: "Bot Creation Failed",
                          description: `Failed to create ${selectedBotSymbol} bot: ${error}`,
                          variant: "destructive"
                        });
                      }
                    }}
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Create {selectedBotSymbol} Bot
                  </Button>
                </div>

                {/* All Bots List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">All Bots</h3>
                    <div className="flex gap-1 text-xs">
                      <span className="text-green-500">●</span>
                      <span className="text-muted-foreground">{activeBots?.length || 0} Running</span>
                      <span className="text-yellow-500 ml-2">●</span>
                      <span className="text-muted-foreground">{(paperBots?.length || 0) - (activeBots?.length || 0)} Stopped</span>
                    </div>
                  </div>
                  {paperBots && paperBots.length > 0 ? (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {paperBots.map((bot) => (
                        <div
                          key={bot.id}
                          className={`p-3 rounded-lg border transition-all duration-200 cursor-pointer ${
                            bot.symbol === activeChartSymbol 
                              ? 'border-primary bg-primary/10' 
                              : 'border-border bg-secondary/50 hover:bg-secondary'
                          }`}
                          onClick={() => setActiveChartSymbol(bot.symbol)}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge 
                                variant={bot.status === 'running' ? 'default' : 'secondary'}
                                className={`text-xs ${
                                  bot.status === 'running' 
                                    ? 'bg-green-500/20 text-green-600 border-green-500/50' 
                                    : 'bg-yellow-500/20 text-yellow-600 border-yellow-500/50'
                                }`}
                              >
                                <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                                  bot.status === 'running' ? 'bg-green-500' : 'bg-yellow-500'
                                }`}></span>
                                {bot.symbol}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                {bot.strategy}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ({bot.status})
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant={bot.status === 'running' ? 'destructive' : 'default'}
                                className={`h-7 px-2 text-xs ${
                                  bot.status === 'running' 
                                    ? 'bg-red-500/10 hover:bg-red-500/20 text-red-600 border-red-500/50' 
                                    : 'bg-green-500/10 hover:bg-green-500/20 text-green-600 border-green-500/50'
                                }`}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    if (bot.status === 'running') {
                                      await stopBot(bot.id);
                                      toast({
                                        title: "Bot Stopped",
                                        description: `${bot.symbol} bot has been stopped`,
                                      });
                                    } else {
                                      await startBot(bot.id);
                                      toast({
                                        title: "Bot Started", 
                                        description: `${bot.symbol} bot is now running`,
                                      });
                                      // Switch to this bot's chart
                                      setActiveChartSymbol(bot.symbol);
                                    }
                                  } catch (error) {
                                    toast({
                                      title: "Bot Control Error",
                                      description: `Failed to ${bot.status === 'running' ? 'stop' : 'start'} bot: ${error}`,
                                      variant: "destructive"
                                    });
                                  }
                                }}
                              >
                                {bot.status === 'running' ? 'Stop' : 'Start'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline" 
                                className="h-6 w-6 p-0 text-red-500 hover:text-red-400"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deleteBot(bot.id);
                                }}
                              >
                                🗑️
                              </Button>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">P&L:</span>
                              <span className={`ml-1 font-semibold ${
                                (bot.totalPnl || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                              }`}>
                                {bot.totalPnl ? `$${bot.totalPnl.toFixed(2)}` : '$0.00'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Trades:</span>
                              <span className="ml-1 font-semibold">{bot.totalTrades || 0}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Capital:</span>
                              <span className="ml-1 font-semibold">${parseFloat(bot.current_capital || '0').toLocaleString()}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-muted-foreground bg-secondary/30 border border-border rounded-lg">
                      <p className="text-sm">No bots created</p>
                      <p className="text-xs">Create your first bot above</p>
                    </div>
                  )}
                </div>
              </Card>

              {/* Options Matrix for Active Symbol */}
              <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Options Matrix • {activeChartSymbol}</h2>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Live Options Data
                    </Badge>
                    {/* Current Price Debug Info */}
                    <Badge variant="secondary" className="text-xs">
                      Underlying: ${(liveOptionsData?.currentPrice || symbolLivePrices[activeChartSymbol] || 0).toFixed(2)}
                    </Badge>
                    {liveOptionsData?.contracts?.length > 0 && (
                      <Badge variant="default" className="text-xs bg-success animate-pulse">
                        <div className="w-2 h-2 rounded-full bg-white mr-1" />
                        LIVE OPTIONS ({liveOptionsData.contracts.length})
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Options Chain Controls */}
                <div className="mb-4">
                  <div className="flex gap-2 mb-3">
                    <Button variant="outline" size="sm" className="flex-1">ATM±3</Button>
                    <Button variant="outline" size="sm" className="flex-1">Δ Buckets</Button>
                    <Button variant="outline" size="sm" className="flex-1">Weekly</Button>
                    <Button variant="outline" size="sm" className="flex-1">Monthly</Button>
                  </div>
                </div>

                {/* Options Chain Header */}
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground grid grid-cols-9 gap-2 px-2 py-2 bg-secondary/30 rounded">
                    <span className="font-medium">Type</span>
                    <span className="col-span-2 font-medium">Strike</span>
                    <span className="text-right">Bid</span>
                    <span className="text-right">Ask</span>
                    <span className="text-right">Mid</span>
                    <span className="text-right">Vol</span>
                    <span className="text-right">OI</span>
                    <span className="text-right">Δ</span>
                  </div>

                  {/* Options Chain Data */}
                  <div className="max-h-[300px] overflow-y-auto space-y-1">
                    {(() => {
                      // LIVE options data: quotes + trades from WebSocket indicative feed
                      let contracts = [];

                      if (liveOptionsData?.contracts && Array.isArray(liveOptionsData.contracts)) {
                        // Live options data format (quotes + trades)
                        contracts = liveOptionsData.contracts;
                      } else if (liveOptionsData && Array.isArray(liveOptionsData)) {
                        // Fallback: array format
                        contracts = liveOptionsData;
                      }

                      if (contracts.length > 0) {
                        // Get current underlying price for ATM sorting
                        const currentPrice = liveOptionsData?.currentPrice ||
                                           (symbolLivePrices[activeChartSymbol] || 0);
                        
                        // Sort contracts by distance from current price (ATM first)
                        const sortedContracts = [...contracts].sort((a, b) => {
                          const strikeA = a.strike_price || a.strike || a.strikePrice || 0;
                          const strikeB = b.strike_price || b.strike || b.strikePrice || 0;
                          const distanceA = Math.abs(strikeA - currentPrice);
                          const distanceB = Math.abs(strikeB - currentPrice);
                          return distanceA - distanceB;
                        });
                        
                        console.log(`[OPTIONS DISPLAY] 💎 Showing ATM options around $${currentPrice.toFixed(2)} (${sortedContracts.length} total contracts)`);
                        
                        // Group by strike price and show calls/puts together, take top 6 strikes (12 contracts)  
                        const strikeGroups = new Map();
                        sortedContracts.forEach(contract => {
                          const strike = contract.strike_price || contract.strike || contract.strikePrice;
                          if (!strikeGroups.has(strike)) {
                            strikeGroups.set(strike, { call: null, put: null });
                          }
                          const type = contract.type || (contract.symbol?.includes('C') ? 'call' : 'put');
                          strikeGroups.get(strike)[type] = contract;
                        });
                        
                        // Convert to array and take top 6 strikes
                        const topStrikes = Array.from(strikeGroups.entries()).slice(0, 6);
                        
                        return topStrikes.flatMap(([strike, { call, put }], strikeIndex) => {
                          const contracts = [];
                          if (call) contracts.push({ ...call, _strikeIndex: strikeIndex });
                          if (put) contracts.push({ ...put, _strikeIndex: strikeIndex });
                          return contracts;
                        }).map((option: any, index: number) => {
                          const strike = option.strike_price || option.strike || option.strikePrice;
                          const bid = option.bid || option.bid_price || 0;
                          const ask = option.ask || option.ask_price || 0;
                          const mid = bid && ask ? ((bid + ask) / 2).toFixed(2) : (option.midPrice?.toFixed(2) || 'N/A');
                          const volume = option.volume || option.vol || 0;
                          const openInterest = option.open_interest || option.openInterest || option.oi || 0;
                          const delta = option.delta || option.greeks?.delta || 0;
                          const isITM = option.in_the_money || option.intrinsicValue > 0 || false;
                          
                          // Determine option type with clear visual indicators
                          const optionType = option.type || (option.symbol?.includes('C') ? 'call' : 'put');
                          const typeColor = optionType === 'call' ? 'text-green-500' : 'text-red-500';
                          const typeBgColor = optionType === 'call' ? 'bg-green-500/10' : 'bg-red-500/10';
                          const typeIcon = optionType === 'call' ? '📈' : '📉';
                          
                          return (
                            <div
                              key={`${strike}-${index}-${optionType}`}
                              className={`text-sm grid grid-cols-9 gap-2 p-2 rounded transition-all cursor-pointer hover:bg-muted ${
                                isITM ? "bg-success/5 border border-success/20" : "bg-secondary/30"
                              }`}
                            >
                              <span className={`flex items-center gap-1 text-xs font-semibold ${typeColor} ${typeBgColor} px-2 py-1 rounded`}>
                                <span className="text-[10px]">{typeIcon}</span>
                                {optionType.toUpperCase()}
                              </span>
                              <span className="col-span-2 font-medium">${strike}</span>
                              <span className="text-right text-muted-foreground">${bid?.toFixed(2) || '0.00'}</span>
                              <span className="text-right text-muted-foreground">${ask?.toFixed(2) || '0.00'}</span>
                              <span className="text-right font-medium">${mid}</span>
                              <span className="text-right text-xs">{volume.toLocaleString()}</span>
                              <span className="text-right text-xs">{openInterest.toLocaleString()}</span>
                              <span className={`text-right text-xs font-medium ${parseFloat(delta) > 0 ? "text-green-500" : "text-red-500"}`}>
                                {parseFloat(delta).toFixed(3)}
                              </span>
                            </div>
                          );
                        });
                      } else {
                        // Determine appropriate message based on bot status
                        const activeBotForSymbol = paperBots?.find(bot => bot.symbol === activeChartSymbol);
                        const botStatus = activeBotForSymbol?.status;
                        
                        if (botStatus === 'stopped') {
                          return (
                            <div className="text-center py-8 text-muted-foreground">
                              <div className="text-yellow-500 mb-2">⏸️</div>
                              <p className="text-sm">Bot is stopped - No options data</p>
                              <p className="text-xs mt-2">Start the bot to load live options data</p>
                            </div>
                          );
                        } else if (botStatus === 'error') {
                          return (
                            <div className="text-center py-8 text-muted-foreground">
                              <div className="text-red-500 mb-2">❌</div>
                              <p className="text-sm">Bot has errors - No options data</p>
                              <p className="text-xs mt-2">Check bot logs and restart</p>
                            </div>
                          );
                        } else if (botStatus === 'running') {
                          return (
                            <div className="text-center py-8 text-muted-foreground">
                              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
                              <p className="text-sm">Loading live options for {activeChartSymbol}...</p>
                              <p className="text-xs mt-2">Fetching real-time options data</p>
                            </div>
                          );
                        } else {
                          return (
                            <div className="text-center py-8 text-muted-foreground">
                              <div className="text-gray-500 mb-2">📊</div>
                              <p className="text-sm">No bot found for {activeChartSymbol}</p>
                              <p className="text-xs mt-2">Create a bot for this symbol</p>
                            </div>
                          );
                        }
                      }
                    })()}
                  </div>
                </div>
              </Card>
            </div>

            {/* Second Row: Account Dashboard & Risk Monitor */}
            <div className="grid grid-cols-12 gap-4 mt-4">
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

              {/* Risk Monitor */}
              <Card className="col-span-4 p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                  Risk Monitor
                </h2>
                <div className="space-y-4">
                  {[
                    { label: "Daily Loss Limit", current: "$0", limit: "$5,000", pct: 0 },
                    { label: "Position Size", current: "0", limit: "10", pct: 0 },
                    { label: "Max Spread", current: "$0.00", limit: "$0.12", pct: 0 },
                    { label: "Active Symbols", current: getActiveBotSymbols().length.toString(), limit: "5", pct: (getActiveBotSymbols().length / 5) * 100 },
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
                            risk.pct > 80 ? "bg-red-500" : risk.pct > 50 ? "bg-yellow-500" : "bg-green-500"
                          } ${
                            risk.pct > 75 ? 'w-3/4' : 
                            risk.pct > 50 ? 'w-1/2' : 
                            risk.pct > 25 ? 'w-1/4' : 
                            risk.pct > 0 ? 'w-1/6' : 'w-0'
                          }`}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-sm font-medium text-success">All Risk Checks Passed</p>
                  <p className="text-xs text-muted-foreground mt-1">Multi-symbol operations active</p>
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
