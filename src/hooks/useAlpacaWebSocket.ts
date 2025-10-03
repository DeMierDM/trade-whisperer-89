import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Quote {
  symbol: string;
  ask: number;
  bid: number;
  askSize: number;
  bidSize: number;
  timestamp: string;
}

interface Trade {
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
}

export const useAlpacaWebSocket = (symbols: string[] = []) => {
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [trades, setTrades] = useState<Trade[]>([]);
  const [connected, setConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    const connectWebSocket = async () => {
      try {
        console.log('[WS CLIENT] Starting WebSocket connection process...');
        console.log('[WS CLIENT] Reconnect attempt:', reconnectAttempts);
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const errorMsg = 'No session found - please log in';
          console.log('[WS CLIENT] ✗', errorMsg);
          setLastError(errorMsg);
          toast({
            title: 'Authentication Required',
            description: 'Please log in to access live market data',
            variant: 'destructive',
          });
          return;
        }

        console.log('[WS CLIENT] ✓ Session found, connecting to WebSocket proxy...');
        console.log('[WS CLIENT] User ID:', session.user.id);
        console.log('[WS CLIENT] Token expires at:', new Date(session.expires_at! * 1000).toISOString());

        // Pass auth token as query parameter (browsers can't set custom WS headers)
        const wsUrl = `wss://uroueekwllvjcueyrmrg.supabase.co/functions/v1/alpaca-websocket?token=${encodeURIComponent(session.access_token)}`;
        console.log('[WS CLIENT] WebSocket URL constructed');
        console.log('[WS CLIENT] Initiating connection...');

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('[WS CLIENT] ✓ WebSocket connection opened successfully');
          if (mounted) {
            setConnected(true);
            setLastError(null);
            setReconnectAttempts(0);
            toast({
              title: 'Connected',
              description: 'Live market data stream connected',
            });
          }
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            console.log('[WS CLIENT] Received:', message);

            // Handle connection confirmation
            if (message.type === 'connected') {
              console.log('[WS CLIENT] ✓ Connected:', message.stream || 'stocks');
              
              // Subscribe to symbols after stocks stream is confirmed
              if (message.stream === 'stocks' || !message.stream) {
                if (symbols.length > 0) {
                  setTimeout(() => {
                    console.log('[WS CLIENT] Subscribing to symbols:', symbols);
                    ws.send(JSON.stringify({
                      action: 'subscribe',
                      quotes: symbols,
                      trades: symbols
                    }));
                  }, 500);
                }
              }
              return;
            }

            // Handle errors
            if (message.type === 'error') {
              const errorMsg = `${message.stream || 'WebSocket'}: ${message.message}`;
              console.error('[WS CLIENT] ✗ Error:', errorMsg);
              setLastError(errorMsg);
              
              // Show toast for critical errors
              if (message.message.includes('401') || message.message.includes('403')) {
                toast({
                  title: 'Authentication Error',
                  description: 'Please check your API keys in Settings',
                  variant: 'destructive',
                });
              } else {
                toast({
                  title: 'WebSocket Error',
                  description: errorMsg,
                  variant: 'destructive',
                });
              }
              return;
            }

            // Handle tagged data from proxy
            const data = message.stream ? message.data : message;
            
            if (Array.isArray(data)) {
              data.forEach((item: any) => {
                // Handle subscription confirmations
                if (item.T === 'subscription') {
                  console.log('[WS CLIENT] ✓ Subscription confirmed:', item);
                  return;
                }

                // Handle quotes
                if (item.T === 'q') {
                  const quote: Quote = {
                    symbol: item.S,
                    ask: item.ap,
                    bid: item.bp,
                    askSize: item.as,
                    bidSize: item.bs,
                    timestamp: item.t
                  };
                  
                  console.log('[WS CLIENT] Quote:', quote);
                  
                  if (mounted) {
                    setQuotes(prev => {
                      const newQuotes = new Map(prev);
                      newQuotes.set(item.S, quote);
                      return newQuotes;
                    });
                  }
                }
                
                // Handle trades - normalize timestamp to minute epoch (UTC)
                if (item.T === 't') {
                  const tradeTimestamp = new Date(item.t).getTime();
                  const normalizedTimestamp = Math.floor(tradeTimestamp / 60000) * 60000;
                  
                  const trade: Trade = {
                    symbol: item.S,
                    price: item.p,
                    size: item.s,
                    timestamp: new Date(normalizedTimestamp).toISOString()
                  };
                  
                  console.log('[WS CLIENT] Trade:', trade);
                  
                  if (mounted) {
                    setTrades(prev => [trade, ...prev].slice(0, 100));
                  }
                }
              });
            }
          } catch (error) {
            console.error('[WS CLIENT] Error parsing message:', error);
          }
        };

        ws.onerror = (error) => {
          const errorMsg = 'WebSocket connection failed';
          console.error('[WS CLIENT] ✗ Error:', error);
          console.error('[WS CLIENT] Error type:', error.type);
          setLastError(errorMsg);
        };

        ws.onclose = (event) => {
          console.log('[WS CLIENT] WebSocket disconnected');
          console.log('[WS CLIENT] Close code:', event.code);
          console.log('[WS CLIENT] Close reason:', event.reason);
          console.log('[WS CLIENT] Was clean:', event.wasClean);
          
          if (mounted) {
            setConnected(false);
            
            // Exponential backoff for reconnection
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            console.log(`[WS CLIENT] Reconnecting in ${delay}ms...`);
            
            setReconnectAttempts(prev => prev + 1);
            
            reconnectTimeoutRef.current = setTimeout(() => {
              if (mounted) {
                console.log('[WS CLIENT] Attempting reconnection...');
                connectWebSocket();
              }
            }, delay);
          }
        };

        wsRef.current = ws;
      } catch (error: any) {
        const errorMsg = error.message || 'Failed to connect to WebSocket';
        console.error('[WS CLIENT] ✗ Connection error:', error);
        setLastError(errorMsg);
        
        if (mounted) {
          // Retry with backoff
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          setReconnectAttempts(prev => prev + 1);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mounted) connectWebSocket();
          }, delay);
        }
      }
    };

    connectWebSocket();

    return () => {
      mounted = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        console.log('[WS CLIENT] Cleaning up connection');
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbols.join(','), toast, reconnectAttempts]);

  const subscribe = (newSymbols: string[]) => {
    if (wsRef.current && connected) {
      wsRef.current.send(JSON.stringify({
        action: 'subscribe',
        quotes: newSymbols,
        trades: newSymbols
      }));
    }
  };

  const unsubscribe = (symbolsToRemove: string[]) => {
    if (wsRef.current && connected) {
      wsRef.current.send(JSON.stringify({
        action: 'unsubscribe',
        quotes: symbolsToRemove,
        trades: symbolsToRemove
      }));
    }
  };

  const forceReconnect = () => {
    console.log('[WS CLIENT] Force reconnect requested');
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setReconnectAttempts(0);
    setLastError(null);
  };

  return {
    quotes,
    trades,
    connected,
    lastError,
    reconnectAttempts,
    subscribe,
    unsubscribe,
    forceReconnect,
  };
};