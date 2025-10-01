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
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    const connectWebSocket = async () => {
      try {
        console.log('[WS CLIENT] Starting WebSocket connection process...');
        
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('[WS CLIENT] ✗ No session found - cannot connect');
          toast({
            title: 'Authentication Required',
            description: 'Please log in to access live market data',
            variant: 'destructive',
          });
          return;
        }

        console.log('[WS CLIENT] ✓ Session found, connecting to WebSocket proxy...');

        // Use the actual Supabase project URL
        const wsUrl = `wss://uroueekwllvjcueyrmrg.supabase.co/functions/v1/alpaca-websocket`;
        console.log('[WS CLIENT] WebSocket URL:', wsUrl);
        console.log('[WS CLIENT] Auth token length:', session.access_token.length);

        const ws = new WebSocket(wsUrl, [
          `Bearer ${session.access_token}`,
        ]);

        ws.onopen = () => {
          console.log('[WS CLIENT] WebSocket connection opened');
          if (mounted) {
            setConnected(true);
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[WS CLIENT] Received:', data);

            // Handle connection confirmation
            if (data.type === 'connected') {
              console.log('[WS CLIENT] ✓ Connected to Alpaca via proxy');
              
              // Subscribe to symbols after connection is confirmed
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
              return;
            }

            // Handle errors
            if (data.type === 'error') {
              console.error('[WS CLIENT] ✗ Error:', data.message);
              toast({
                title: 'WebSocket Error',
                description: data.message,
                variant: 'destructive',
              });
              return;
            }

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
                
                // Handle trades
                if (item.T === 't') {
                  const trade: Trade = {
                    symbol: item.S,
                    price: item.p,
                    size: item.s,
                    timestamp: item.t
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
          console.error('WebSocket error:', error);
          if (mounted) {
            toast({
              title: 'Connection Error',
              description: 'Failed to connect to live market data',
              variant: 'destructive',
            });
          }
        };

        ws.onclose = () => {
          console.log('WebSocket disconnected');
          if (mounted) {
            setConnected(false);
            // Attempt to reconnect after 5 seconds
            setTimeout(() => {
              if (mounted) connectWebSocket();
            }, 5000);
          }
        };

        wsRef.current = ws;
      } catch (error) {
        console.error('Error connecting WebSocket:', error);
      }
    };

    connectWebSocket();

    return () => {
      mounted = false;
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [symbols.join(','), toast]);

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

  return {
    quotes,
    trades,
    connected,
    subscribe,
    unsubscribe
  };
};