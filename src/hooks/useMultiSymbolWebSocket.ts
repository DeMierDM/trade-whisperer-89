/**
 * Multi-Symbol WebSocket Manager for Live Paper Trading
 * 
 * CRITICAL FIX: Uses SINGLE SHARED WebSocket connection to handle all symbols
 * to prevent connection conflicts and ensure proper data flow.
 * 
 * Based on react-use-websocket patterns for shared connections.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ENDPOINTS } from '@/lib/apiConfig';

interface SymbolData {
  symbol: string;
  connected: boolean;
  lastUpdate: number;
  livePrice?: number;
}

interface SharedWebSocketConnection {
  ws?: WebSocket;
  connected: boolean;
  connecting: boolean;
  reconnectAttempts: number;
  symbols: Set<string>;
}

interface MultiSymbolWebSocketHook {
  connections: Record<string, SymbolData>;
  isConnected: (symbol: string) => boolean;
  getLivePrice: (symbol: string) => number | undefined;
  addSymbol: (symbol: string) => void;
  removeSymbol: (symbol: string) => void;
  forceReconnect: (symbol?: string) => void;
  getAllConnectedSymbols: () => string[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
}

export function useMultiSymbolWebSocket(
  initialSymbols: string[] = [],
  options: {
    maxReconnectAttempts?: number;
    reconnectInterval?: number;
    heartbeatInterval?: number;
  } = {}
): MultiSymbolWebSocketHook {
  const { toast } = useToast();
  const {
    maxReconnectAttempts = 10,
    reconnectInterval = 5000,
    heartbeatInterval = 30000
  } = options;

  // CRITICAL: Use single shared connection for all symbols
  const [symbolData, setSymbolData] = useState<Record<string, SymbolData>>({});
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  
  const sharedConnectionRef = useRef<SharedWebSocketConnection>({
    connected: false,
    connecting: false,
    reconnectAttempts: 0,
    symbols: new Set()
  });
  
  const heartbeatTimer = useRef<NodeJS.Timeout>();
  const reconnectTimer = useRef<NodeJS.Timeout>();
  const mountedRef = useRef(true);

  // Cleanup function for shared connection
  const cleanup = useCallback(() => {
    if (heartbeatTimer.current) {
      clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = undefined;
    }
    
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = undefined;
    }
    
    if (sharedConnectionRef.current.ws) {
      sharedConnectionRef.current.ws.close();
    }
  }, []);

  // Create shared WebSocket connection for all symbols
  const createSharedConnection = useCallback(() => {
    console.log(`[Shared WebSocket] 🚀 CREATE CONNECTION CALLED - mounted: ${mountedRef.current}, connecting: ${sharedConnectionRef.current.connecting}, connected: ${sharedConnectionRef.current.connected}`);
    
    if (!mountedRef.current || sharedConnectionRef.current.connecting || sharedConnectionRef.current.connected) {
      console.log('[Shared WebSocket] ⚠️ Aborting connection - conditions not met');
      return;
    }
    
    const symbolList = Array.from(sharedConnectionRef.current.symbols);
    console.log(`[Shared WebSocket] 📋 Symbols from sharedConnectionRef: ${symbolList.length} symbols:`, symbolList);
    
    if (symbolList.length === 0) {
      console.log('[Shared WebSocket] ❌ No symbols to connect - aborting');
      return;
    }
    
    console.log(`[Shared WebSocket] 🔗 Creating connection for symbols: ${symbolList.join(', ')}`);
    
    sharedConnectionRef.current.connecting = true;
    setConnectionStatus('connecting');

    try {
      const wsUrl = `${ENDPOINTS.WEBSOCKET}?symbols=${symbolList.join(',')}`;
      console.log(`[Shared WebSocket] 🌐 Connecting to URL: ${wsUrl}`);
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        if (!mountedRef.current) return;
        
        console.log(`[Shared WebSocket] ✅ Connected with symbols: ${symbolList.join(', ')}`);
        
        sharedConnectionRef.current.connected = true;
        sharedConnectionRef.current.connecting = false;
        sharedConnectionRef.current.reconnectAttempts = 0;
        sharedConnectionRef.current.ws = ws;
        setConnectionStatus('connected');

        // Update all symbols as connected
        setSymbolData(prev => {
          const updated = { ...prev };
          symbolList.forEach(symbol => {
            updated[symbol] = {
              ...updated[symbol],
              symbol,
              connected: true,
              lastUpdate: Date.now()
            };
          });
          return updated;
        });

        // Setup heartbeat
        heartbeatTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat', symbols: symbolList }));
          }
        }, heartbeatInterval);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        try {
          const message = JSON.parse(event.data);
          
          // Handle different message types - ULTRA LOW LATENCY PROCESSING
          if (message.type === 'stock_trade' && message.data?.symbol) {
            const { symbol, price } = message.data;
            if (price && price > 0 && sharedConnectionRef.current.symbols.has(symbol)) {
              console.log(`[ULTRA-FAST] 🚀 ${symbol} TRADE: $${price.toFixed(2)}`);
              setSymbolData(prev => ({
                ...prev,
                [symbol]: {
                  ...prev[symbol],
                  symbol,
                  connected: true,
                  livePrice: price,
                  lastUpdate: Date.now()
                }
              }));
            }
          } else if (message.type === 'stock_quote' && message.data?.symbol) {
            const { symbol, bidPrice, askPrice, bid, ask } = message.data;
            const price = bidPrice || askPrice || (bid && ask ? (bid + ask) / 2 : 0);
            if (price && price > 0 && sharedConnectionRef.current.symbols.has(symbol)) {
              console.log(`[ULTRA-FAST] 💰 ${symbol} QUOTE: $${price.toFixed(2)}`);
              setSymbolData(prev => ({
                ...prev,
                [symbol]: {
                  ...prev[symbol],
                  symbol,
                  connected: true,
                  livePrice: price,
                  lastUpdate: Date.now()
                }
              }));
            }
          } else if (message.type === 'stock_bar' && message.data?.symbol) {
            // REAL-TIME BAR DATA: Update charts with OHLC bars
            const { symbol, timestamp, open, high, low, close, volume, trades } = message.data;
            if (sharedConnectionRef.current.symbols.has(symbol)) {
              console.log(`📊 [BAR UPDATE] ${symbol} OHLC: ${open.toFixed(2)}/${high.toFixed(2)}/${low.toFixed(2)}/${close.toFixed(2)} V:${volume}`);
              
              // Dispatch custom event for chart updates
              window.dispatchEvent(new CustomEvent('stockBarUpdate', { 
                detail: { 
                  symbol, 
                  timestamp,
                  open,
                  high,
                  low,
                  close,
                  volume,
                  trades,
                  timeframe: '1Min'
                }
              }));
              
              // Also update live price
              setSymbolData(prev => ({
                ...prev,
                [symbol]: {
                  ...prev[symbol],
                  symbol,
                  connected: true,
                  livePrice: close,
                  lastUpdate: Date.now()
                }
              }));
            }
          } else if (message.type === 'option_quote' && message.data?.symbol) {
            // LOW-LATENCY OPTIONS: Immediate update via custom events (bypasses React)
            const midPrice = (message.data.bid + message.data.ask) / 2;
            console.log(`[ULTRA-FAST] 📈 OPTION ${message.data.symbol}: $${midPrice.toFixed(2)}`);
            
            // Direct DOM event for instant updates (faster than React state)
            window.dispatchEvent(new CustomEvent('optionQuoteUpdate', { 
              detail: message.data 
            }));
          }
        } catch (error) {
          console.error(`[Shared WebSocket] Error parsing message:`, error);
        }
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        
        console.log(`[Shared WebSocket] 🔌 Connection closed: ${event.code}`);
        
        // Clear heartbeat
        if (heartbeatTimer.current) {
          clearInterval(heartbeatTimer.current);
          heartbeatTimer.current = undefined;
        }
        
        sharedConnectionRef.current.connected = false;
        sharedConnectionRef.current.connecting = false;
        sharedConnectionRef.current.ws = undefined;
        
        // Update all symbols as disconnected
        setSymbolData(prev => {
          const updated = { ...prev };
          Object.keys(updated).forEach(symbol => {
            updated[symbol] = { ...updated[symbol], connected: false };
          });
          return updated;
        });
        
        const shouldReconnect = sharedConnectionRef.current.reconnectAttempts < maxReconnectAttempts && 
                               event.code !== 1000 && 
                               sharedConnectionRef.current.symbols.size > 0;
        
        if (shouldReconnect) {
          console.log(`[Shared WebSocket] 🔄 Scheduling reconnect (attempt ${sharedConnectionRef.current.reconnectAttempts + 1})`);
          setConnectionStatus('connecting');
          
          sharedConnectionRef.current.reconnectAttempts += 1;
          reconnectTimer.current = setTimeout(() => {
            createSharedConnection();
          }, reconnectInterval);
        } else {
          console.log(`[Shared WebSocket] ❌ Max reconnect attempts reached or no symbols`);
          setConnectionStatus('error');
          if (sharedConnectionRef.current.symbols.size > 0) {
            toast({
              title: `WebSocket Connection Lost`,
              description: `Lost connection to live data feed`,
              variant: "destructive"
            });
          }
        }
      };

      ws.onerror = (error) => {
        if (!mountedRef.current) return;
        
        console.error(`[Shared WebSocket] ❌ Connection error:`, error);
        sharedConnectionRef.current.connected = false;
        sharedConnectionRef.current.connecting = false;
        setConnectionStatus('error');
      };

    } catch (error) {
      console.error(`[Shared WebSocket] Failed to create connection:`, error);
      sharedConnectionRef.current.connected = false;
      sharedConnectionRef.current.connecting = false;
      setConnectionStatus('error');
    }
  }, [maxReconnectAttempts, reconnectInterval, heartbeatInterval, toast]);

  // Add symbol to shared connection
  const addSymbol = useCallback((symbol: string) => {
    console.log(`[Shared WebSocket] 📥 ADD SYMBOL CALLED: ${symbol}`);
    
    if (!symbol) {
      console.log(`[Shared WebSocket] ❌ Empty symbol - ignoring`);
      return;
    }
    
    if (sharedConnectionRef.current.symbols.has(symbol)) {
      console.log(`[Shared WebSocket] ⚠️ Symbol ${symbol} already exists - ignoring`);
      return;
    }
    
    console.log(`[Shared WebSocket] ✅ Adding symbol: ${symbol}`);
    sharedConnectionRef.current.symbols.add(symbol);
    
    // Initialize symbol data
    setSymbolData(prev => ({
      ...prev,
      [symbol]: {
        symbol,
        connected: false,
        lastUpdate: Date.now()
      }
    }));
    
    // Reconnect with new symbol list
    if (sharedConnectionRef.current.connected || sharedConnectionRef.current.connecting) {
      console.log(`[Shared WebSocket] Reconnecting to add ${symbol}`);
      if (sharedConnectionRef.current.ws) {
        sharedConnectionRef.current.ws.close();
      }
    }
    
    // Small delay to allow connection to close properly
    setTimeout(() => createSharedConnection(), 100);
  }, [createSharedConnection]);

  // Remove symbol from shared connection
  const removeSymbol = useCallback((symbol: string) => {
    if (!sharedConnectionRef.current.symbols.has(symbol)) return;
    
    console.log(`[Shared WebSocket] Removing symbol: ${symbol}`);
    sharedConnectionRef.current.symbols.delete(symbol);
    
    // Remove from symbol data
    setSymbolData(prev => {
      const updated = { ...prev };
      delete updated[symbol];
      return updated;
    });
    
    // If no symbols left, close connection
    if (sharedConnectionRef.current.symbols.size === 0) {
      console.log(`[Shared WebSocket] No symbols left, closing connection`);
      cleanup();
      setConnectionStatus('disconnected');
    } else {
      // Reconnect with remaining symbols
      if (sharedConnectionRef.current.connected || sharedConnectionRef.current.connecting) {
        console.log(`[Shared WebSocket] Reconnecting to remove ${symbol}`);
        if (sharedConnectionRef.current.ws) {
          sharedConnectionRef.current.ws.close();
        }
      }
      setTimeout(() => createSharedConnection(), 100);
    }
  }, [cleanup, createSharedConnection]);

  // Force reconnect
  const forceReconnect = useCallback(() => {
    console.log(`[Shared WebSocket] Force reconnect requested`);
    sharedConnectionRef.current.reconnectAttempts = 0;
    
    if (sharedConnectionRef.current.ws) {
      sharedConnectionRef.current.ws.close();
    } else {
      createSharedConnection();
    }
  }, [createSharedConnection]);

  // Helper functions
  const isConnected = useCallback((symbol: string) => {
    return symbolData[symbol]?.connected || false;
  }, [symbolData]);

  const getLivePrice = useCallback((symbol: string) => {
    return symbolData[symbol]?.livePrice;
  }, [symbolData]);

  const getAllConnectedSymbols = useCallback(() => {
    return Object.keys(symbolData).filter(symbol => symbolData[symbol]?.connected);
  }, [symbolData]);

  // Initialize with initial symbols
  useEffect(() => {
    initialSymbols.forEach(symbol => {
      if (symbol) addSymbol(symbol);
    });
  }, [initialSymbols, addSymbol]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return {
    connections: symbolData,
    isConnected,
    getLivePrice,
    addSymbol,
    removeSymbol,
    forceReconnect,
    getAllConnectedSymbols,
    connectionStatus
  };
}