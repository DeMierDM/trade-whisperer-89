import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from './use-toast';
import { ENDPOINTS, REQUEST_CONFIG } from '../lib/apiConfig';

interface OptionQuote {
  symbol: string;
  bid: number;
  ask: number;
  bid_size?: number;
  ask_size?: number;
  price?: number;  // Trade price for stocks
  size?: number;   // Trade size
  timestamp: string;
  data_source: string;
  exchange?: string;
  conditions?: string[];
}

interface TradeData {
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
  exchange?: string;
}

interface BarData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Trade aggregation helper
const buildBarsFromRecentTrades = (trades: TradeData[], symbol: string): BarData[] => {
  // Group trades by minute
  const minuteGroups = new Map<string, TradeData[]>();
  
  trades.forEach(trade => {
    const tradeTime = new Date(trade.timestamp);
    const minuteKey = `${tradeTime.getFullYear()}-${String(tradeTime.getMonth() + 1).padStart(2, '0')}-${String(tradeTime.getDate()).padStart(2, '0')} ${String(tradeTime.getHours()).padStart(2, '0')}:${String(tradeTime.getMinutes()).padStart(2, '0')}`;
    
    if (!minuteGroups.has(minuteKey)) {
      minuteGroups.set(minuteKey, []);
    }
    minuteGroups.get(minuteKey)!.push(trade);
  });

  // Convert to bars
  const bars: BarData[] = [];
  minuteGroups.forEach((trades, minuteKey) => {
    if (trades.length === 0) return;
    
    const sortedTrades = trades.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const open = sortedTrades[0].price;
    const close = sortedTrades[sortedTrades.length - 1].price;
    const high = Math.max(...sortedTrades.map(t => t.price));
    const low = Math.min(...sortedTrades.map(t => t.price));
    const volume = sortedTrades.reduce((sum, trade) => sum + trade.size, 0);
    
    // Parse the minute key back to timestamp
    const [dateStr, timeStr] = minuteKey.split(' ');
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    const time = Math.floor(new Date(year, month - 1, day, hour, minute).getTime() / 1000);
    
    bars.push({
      time,
      open,
      high,
      low,
      close,
      volume
    });
  });

  return bars.sort((a, b) => a.time - b.time);
};

// Function to fetch recent trades from Docker API and build minute candles
const fetchRecentTradesAndBuildBars = async (symbol: string, minutesBack: number = 15): Promise<BarData[]> => {
  try {
    const response = await fetch(ENDPOINTS.RECENT_TRADES, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol: symbol,
        minutesBack: minutesBack
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Fetched ${data.total} trades for ${symbol} from last ${minutesBack} minutes`);
    
    if (data.trades && data.trades.length > 0) {
      const bars = buildBarsFromRecentTrades(data.trades, symbol);
      console.log(`Built ${bars.length} minute candles from recent trades`);
      return bars;
    }
    
    return [];
  } catch (error) {
    console.error('Error fetching recent trades:', error);
    return [];
  }
};

export const useDockerWebSocket = (symbols: string[] = []) => {
  console.log('🎯 useDockerWebSocket hook called with symbols:', symbols);
  const [quotes, setQuotes] = useState<Map<string, OptionQuote>>(new Map());
  const [recentTrades, setRecentTrades] = useState<TradeData[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  const connect = useCallback(() => {
    try {
      console.log('🚀 Connecting to Docker WebSocket server at', ENDPOINTS.WEBSOCKET);
      console.log('🔍 Current wsRef state:', wsRef.current?.readyState);

      const ws = new WebSocket(ENDPOINTS.WEBSOCKET);
      console.log('✨ WebSocket object created, readyState:', ws.readyState);

      ws.onopen = () => {
        console.log('✅ Connected to Docker WebSocket server');
        console.log('🔍 WebSocket readyState after open:', ws.readyState);
        setConnected(true);
        setLastError(null);

        toast({
          title: 'Live Data Connected',
          description: 'Connected to live OPRA feed via Docker server',
        });
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('📨 WebSocket message received:', message.type, message);

          if (message.type === 'connected') {
            console.log('✅ Docker server confirmed connection');
          } else if (message.type === 'stock_trade') {
            const trade = message.data;
            console.log('💰 LIVE STOCK TRADE:', trade.symbol, 'Price:', trade.price, 'Size:', trade.size, 'Source:', trade.data_source);

            // Store trade in recent trades array for bar building
            const tradeData: TradeData = {
              symbol: trade.symbol,
              price: trade.price,
              size: trade.size,
              timestamp: trade.timestamp,
              exchange: trade.exchange
            };

            setRecentTrades(prev => {
              // Keep only last 1000 trades and trades from last 2 hours
              const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
              const filteredTrades = prev.filter(t => new Date(t.timestamp).getTime() > twoHoursAgo);
              return [...filteredTrades, tradeData].slice(-1000);
            });

            // Store trade as a quote with price field for chart updates
            setQuotes(prev => {
              const newQuotes = new Map(prev);
              newQuotes.set(trade.symbol, {
                ...trade,
                // Keep existing bid/ask if available
                bid: prev.get(trade.symbol)?.bid || trade.price,
                ask: prev.get(trade.symbol)?.ask || trade.price,
              });
              console.log('📋 Updated quotes map with trade, now has', newQuotes.size, 'quotes');
              return newQuotes;
            });
          } else if (message.type === 'option_quote') {
            const quote = message.data;
            console.log('📊 LIVE OPTION QUOTE:', quote.symbol, 'Bid:', quote.bid, 'Ask:', quote.ask, 'Source:', quote.data_source);

            setQuotes(prev => {
              const newQuotes = new Map(prev);
              newQuotes.set(quote.symbol, quote);
              console.log('📋 Updated quotes map with option, now has', newQuotes.size, 'quotes');
              return newQuotes;
            });
          } else if (message.type === 'stock_quote') {
            const quote = message.data;
            console.log('📈 LIVE STOCK QUOTE:', quote.symbol, 'Bid:', quote.bid, 'Ask:', quote.ask, 'Source:', quote.data_source);

            setQuotes(prev => {
              const newQuotes = new Map(prev);
              // Merge with existing trade data if available
              const existing = prev.get(quote.symbol);
              newQuotes.set(quote.symbol, {
                ...existing,
                ...quote,
              });
              console.log('📋 Updated quotes map with stock quote, now has', newQuotes.size, 'quotes');
              return newQuotes;
            });
          } else {
            console.log('📝 Other message type:', message.type);
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('❌ Docker WebSocket error:', error);
        console.error('🔍 WebSocket readyState during error:', ws.readyState);
        console.error('🔍 Error details:', {
          type: error.type,
          target: error.target,
          timeStamp: error.timeStamp
        });
        setLastError('WebSocket connection error');
      };

      ws.onclose = (event) => {
        console.log('❌ Docker WebSocket closed:', event.code, event.reason);
        console.log('🔍 Close event details:', { wasClean: event.wasClean, code: event.code, reason: event.reason });
        setConnected(false);

        // Reconnect if not manually closed
        if (event.code !== 1000) {
          console.log('🔄 Reconnecting to Docker WebSocket in 3s...');
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        } else {
          console.log('ℹ️ WebSocket closed normally (code 1000), not reconnecting');
        }
      };

      wsRef.current = ws;

    } catch (error) {
      console.error('❌ Failed to connect to Docker WebSocket:', error);
      setLastError('Failed to connect to Docker server');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // toast is stable, safe to omit from deps

  // Connect once when component mounts
  useEffect(() => {
    console.log('🎬 useEffect[connect] triggered - calling connect()');
    connect();

    return () => {
      console.log('🧹 useDockerWebSocket cleanup triggered');
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        console.log('🔌 Closing WebSocket connection during cleanup');
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [connect]);

  // Send subscription when symbols change
  useEffect(() => {
    if (wsRef.current && connected && symbols.length > 0 && wsRef.current.readyState === WebSocket.OPEN) {
      console.log('📡 Sending subscription for', symbols.length, 'symbols:', symbols);
      console.log('🔍 WebSocket state check - readyState:', wsRef.current.readyState, 'connected:', connected);

      try {
        wsRef.current.send(JSON.stringify({
          action: 'subscribe',
          symbols: symbols
        }));
        console.log('✅ Successfully sent subscription');
      } catch (error) {
        console.error('❌ Error sending subscription:', error);
        setLastError('Failed to send subscription');
      }
    } else if (symbols.length > 0) {
      console.log('⏳ Waiting for WebSocket connection before subscribing to', symbols.length, 'symbols');
      console.log('🔍 Current state - wsRef exists:', !!wsRef.current, 'connected:', connected, 'readyState:', wsRef.current?.readyState);
    }
  }, [symbols, connected]);

  const forceReconnect = useCallback(() => {
    console.log('🔄 Force reconnecting to Docker WebSocket...');
    if (wsRef.current) {
      wsRef.current.close(1000, 'Force reconnect');
    }
    setTimeout(connect, 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // connect is stable now, safe to omit

  return {
    quotes,
    recentTrades,
    connected,
    lastError,
    forceReconnect,
    fetchRecentTradesAndBuildBars,
    buildBarsFromRecentTrades
  };
};