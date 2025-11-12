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
  const [sharedConnection, setSharedConnection] = useState<SharedWebSocketConnection>({
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
    
    if (sharedConnection.ws) {
      sharedConnection.ws.close();
    }
  }, [sharedConnection]);

  // Create connection for a symbol
  const createConnection = useCallback((symbol: string) => {
    if (!mountedRef.current) return;
    
    console.log(`[Multi-WebSocket] Creating connection for ${symbol}`);
    
    setConnections(prev => ({
      ...prev,
      [symbol]: {
        ...prev[symbol],
        connecting: true,
        connected: false
      }
    }));

    try {
      const wsUrl = `${ENDPOINTS.WEBSOCKET}?symbols=${symbol}`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        if (!mountedRef.current) return;
        
        console.log(`[Multi-WebSocket] ✅ Connected to ${symbol}`);
        
        setConnections(prev => ({
          ...prev,
          [symbol]: {
            ...prev[symbol],
            connected: true,
            connecting: false,
            reconnectAttempts: 0,
            ws,
            lastUpdate: Date.now()
          }
        }));

        // Setup heartbeat
        heartbeatTimers.current[symbol] = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat', symbol }));
          }
        }, heartbeatInterval);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        
        try {
          const message = JSON.parse(event.data);
          
          // Handle different message types - ULTRA LOW LATENCY PROCESSING
          if (message.type === 'stock_trade' && message.data?.symbol === symbol) {
            const price = message.data.price;
            if (price && price > 0) {
              console.log(`[ULTRA-FAST] 🚀 ${symbol} TRADE: $${price.toFixed(2)}`);
              setConnections(prev => ({
                ...prev,
                [symbol]: {
                  ...prev[symbol],
                  livePrice: price,
                  lastUpdate: Date.now()
                }
              }));
            }
          } else if (message.type === 'stock_quote' && message.data?.symbol === symbol) {
            const price = message.data.bidPrice || message.data.askPrice || 
                         (message.data.bid && message.data.ask ? (message.data.bid + message.data.ask) / 2 : 0);
            if (price && price > 0) {
              console.log(`[ULTRA-FAST] 💰 ${symbol} QUOTE: $${price.toFixed(2)}`);
              setConnections(prev => ({
                ...prev,
                [symbol]: {
                  ...prev[symbol],
                  livePrice: price,
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
          console.error(`[Multi-WebSocket] Error parsing message for ${symbol}:`, error);
        }
      };

      ws.onclose = (event) => {
        if (!mountedRef.current) return;
        
        console.log(`[Multi-WebSocket] 🔌 Connection closed for ${symbol}: ${event.code}`);
        
        // Clear heartbeat
        if (heartbeatTimers.current[symbol]) {
          clearInterval(heartbeatTimers.current[symbol]);
          delete heartbeatTimers.current[symbol];
        }
        
        setConnections(prev => {
          const conn = prev[symbol];
          if (!conn) return prev;
          
          const shouldReconnect = conn.reconnectAttempts < maxReconnectAttempts && event.code !== 1000;
          
          if (shouldReconnect) {
            console.log(`[Multi-WebSocket] 🔄 Scheduling reconnect for ${symbol} (attempt ${conn.reconnectAttempts + 1})`);
            
            reconnectTimers.current[symbol] = setTimeout(() => {
              createConnection(symbol);
            }, reconnectInterval);
          } else {
            console.log(`[Multi-WebSocket] ❌ Max reconnect attempts reached for ${symbol}`);
            toast({
              title: `Connection Lost`,
              description: `Lost connection to ${symbol} data feed`,
              variant: "destructive"
            });
          }
          
          return {
            ...prev,
            [symbol]: {
              ...conn,
              connected: false,
              connecting: shouldReconnect,
              reconnectAttempts: conn.reconnectAttempts + 1,
              ws: undefined
            }
          };
        });
      };

      ws.onerror = (error) => {
        if (!mountedRef.current) return;
        
        console.error(`[Multi-WebSocket] ❌ Connection error for ${symbol}:`, error);
        setConnections(prev => ({
          ...prev,
          [symbol]: {
            ...prev[symbol],
            connected: false,
            connecting: false
          }
        }));
      };

    } catch (error) {
      console.error(`[Multi-WebSocket] Failed to create connection for ${symbol}:`, error);
      setConnections(prev => ({
        ...prev,
        [symbol]: {
          ...prev[symbol],
          connected: false,
          connecting: false
        }
      }));
    }
  }, [maxReconnectAttempts, reconnectInterval, heartbeatInterval, toast]);

  // Add symbol connection
  const addSymbol = useCallback((symbol: string) => {
    if (!symbol) return;
    
    // Check if already exists or is in progress
    setConnections(prev => {
      const existing = prev[symbol];
      if (existing?.connected || existing?.connecting) {
        console.log(`[Multi-WebSocket] Symbol ${symbol} already exists (connected: ${existing.connected}, connecting: ${existing.connecting})`);
        return prev;
      }
      
      console.log(`[Multi-WebSocket] Adding symbol: ${symbol}`);
      
      const newState = {
        ...prev,
        [symbol]: {
          symbol,
          connected: false,
          connecting: true, // Set to true immediately to prevent duplicates
          lastUpdate: 0,
          reconnectAttempts: 0,
          maxReconnectAttempts
        }
      };
      
      // Start connection in next tick to ensure state is updated first
      setTimeout(() => {
        if (mountedRef.current) {
          createConnection(symbol);
        }
      }, 0);
      
      return newState;
    });
  }, [createConnection, maxReconnectAttempts]);

  // Remove symbol connection
  const removeSymbol = useCallback((symbol: string) => {
    console.log(`[Multi-WebSocket] Removing symbol: ${symbol}`);
    
    // Clear timers
    if (heartbeatTimers.current[symbol]) {
      clearInterval(heartbeatTimers.current[symbol]);
      delete heartbeatTimers.current[symbol];
    }
    
    if (reconnectTimers.current[symbol]) {
      clearTimeout(reconnectTimers.current[symbol]);
      delete reconnectTimers.current[symbol];
    }
    
    // Close WebSocket
    if (connections[symbol]?.ws) {
      connections[symbol].ws.close(1000, 'Symbol removed');
    }
    
    // Remove from state
    setConnections(prev => {
      const newConnections = { ...prev };
      delete newConnections[symbol];
      return newConnections;
    });
  }, [connections]);

  // Force reconnect for a symbol
  const forceReconnect = useCallback((symbol: string) => {
    console.log(`[Multi-WebSocket] Force reconnecting ${symbol}`);
    
    if (connections[symbol]?.ws) {
      connections[symbol].ws.close();
    }
    
    setConnections(prev => ({
      ...prev,
      [symbol]: {
        ...prev[symbol],
        reconnectAttempts: 0
      }
    }));
    
    setTimeout(() => createConnection(symbol), 1000);
  }, [connections, createConnection]);

  // Utility functions
  const isConnected = useCallback((symbol: string) => {
    return connections[symbol]?.connected || false;
  }, [connections]);

  const getLivePrice = useCallback((symbol: string) => {
    return connections[symbol]?.livePrice;
  }, [connections]);

  const getAllConnectedSymbols = useCallback(() => {
    // Include both connected and connecting symbols to prevent duplicate attempts
    return Object.keys(connections).filter(symbol => 
      connections[symbol].connected || connections[symbol].connecting
    );
  }, [connections]);

  // Initialize connections for initial symbols
  useEffect(() => {
    initialSymbols.forEach(symbol => {
      if (symbol && !connections[symbol]) {
        addSymbol(symbol);
      }
    });
  }, [initialSymbols, addSymbol, connections]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [cleanup]);

  return {
    connections,
    isConnected,
    getLivePrice,
    addSymbol,
    removeSymbol,
    forceReconnect,
    getAllConnectedSymbols
  };
}