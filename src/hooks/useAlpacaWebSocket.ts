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
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.log('No session found');
          return;
        }

        // Get the project reference from the Supabase URL
        const supabaseUrl = await supabase.auth.getSession().then(() => {
          return 'uroueekwllvjcueyrmrg'; // Project ID
        });

        const wsUrl = `wss://${supabaseUrl}.supabase.co/functions/v1/alpaca-websocket`;
        console.log('Connecting to:', wsUrl);

        const ws = new WebSocket(wsUrl, [
          `Bearer ${session.access_token}`,
        ]);

        ws.onopen = () => {
          console.log('WebSocket connected');
          if (mounted) {
            setConnected(true);
            
            // Subscribe to symbols once connected
            if (symbols.length > 0) {
              setTimeout(() => {
                ws.send(JSON.stringify({
                  action: 'subscribe',
                  quotes: symbols,
                  trades: symbols
                }));
                console.log('Subscribed to:', symbols);
              }, 1000);
            }
          }
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Received data:', data);

            if (Array.isArray(data)) {
              data.forEach((item: any) => {
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
                  
                  if (mounted) {
                    setTrades(prev => [trade, ...prev].slice(0, 100)); // Keep last 100 trades
                  }
                }
              });
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
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