import { useEffect, useRef, useState, useCallback } from 'react';
import { useToast } from './use-toast';

// Bus WebSocket endpoint - connects to data_bus_manager on port 3004
const BUS_WEBSOCKET_URL = 'ws://localhost:3004';

export interface BusMessage {
  channel: string;
  type: 'quote' | 'trade' | 'chain' | 'indicator' | 'connected' | 'subscribed' | 'error';
  symbol?: string;
  data: any;
  timestamp: string;
  source?: string;
}

export interface BusSubscription {
  channels: string[];
  onMessage: (message: BusMessage) => void;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export interface BusConnectionState {
  connected: boolean;
  error: string | null;
  reconnectAttempts: number;
  subscribedChannels: string[];
}

/**
 * Core data bus WebSocket hook
 * Connects to the centralized data bus manager on port 3004
 * Handles channel-based subscriptions and message routing
 */
export function useBusData(subscription: BusSubscription): BusConnectionState {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [subscribedChannels, setSubscribedChannels] = useState<string[]>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscriptionRef = useRef(subscription);
  const { toast } = useToast();

  // Update subscription ref when it changes
  useEffect(() => {
    subscriptionRef.current = subscription;
  }, [subscription]);

  const connect = useCallback(() => {
    try {
      console.log('🚌 [BUS] Connecting to data bus manager at', BUS_WEBSOCKET_URL);
      
      // Clean up existing connection
      if (wsRef.current) {
        wsRef.current.close(1000, 'Reconnecting');
      }

      const ws = new WebSocket(BUS_WEBSOCKET_URL);
      
      ws.onopen = () => {
        console.log('🚌 ✅ [BUS] Connected to data bus manager');
        setConnected(true);
        setError(null);
        setReconnectAttempts(0);
        
        // Subscribe to channels immediately after connection
        if (subscription.channels.length > 0) {
          console.log('🚌 📡 [BUS] Subscribing to channels:', subscription.channels);
          
          try {
            ws.send(JSON.stringify({
              action: 'subscribe',
              channels: subscription.channels
            }));
            console.log('🚌 ✅ [BUS] Subscription request sent');
          } catch (subscribeError) {
            console.error('🚌 ❌ [BUS] Error sending subscription:', subscribeError);
            setError('Failed to subscribe to channels');
          }
        }

        // Notify parent component
        subscription.onConnected?.();
        
        toast({
          title: 'Data Bus Connected',
          description: `Connected to centralized data bus (${subscription.channels.length} channels)`,
        });
      };

      ws.onmessage = (event) => {
        try {
          const message: BusMessage = JSON.parse(event.data);
          
          console.log('🚌 📨 [BUS] Message received:', {
            type: message.type,
            channel: message.channel,
            symbol: message.symbol,
            timestamp: message.timestamp
          });

          // Handle connection and subscription confirmations
          if (message.type === 'connected') {
            console.log('🚌 ✅ [BUS] Server confirmed connection:', message.data);
          } else if (message.type === 'subscribed') {
            console.log('🚌 ✅ [BUS] Subscription confirmed for channels:', message.data.channels);
            setSubscribedChannels(message.data.channels || []);
          } else if (message.type === 'error') {
            console.error('🚌 ❌ [BUS] Server error:', message.data);
            setError(message.data.message || 'Server error');
            subscription.onError?.(new Error(message.data.message));
          } else {
            // Route message to subscription handler
            subscriptionRef.current.onMessage(message);
          }
        } catch (parseError) {
          console.error('🚌 ❌ [BUS] Error parsing message:', parseError);
          console.error('🚌 📝 [BUS] Raw message data:', event.data);
          setError('Message parsing error');
          subscription.onError?.(parseError as Error);
        }
      };

      ws.onerror = (error) => {
        console.error('🚌 ❌ [BUS] WebSocket error:', error);
        setError('WebSocket connection error');
        subscription.onError?.(new Error('WebSocket connection error'));
      };

      ws.onclose = (event) => {
        console.log('🚌 ❌ [BUS] WebSocket closed:', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
        });
        
        setConnected(false);
        setSubscribedChannels([]);
        subscription.onDisconnected?.();

        // Auto-reconnect if not manually closed
        if (event.code !== 1000 && reconnectAttempts < 10) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // Exponential backoff, max 30s
          console.log(`🚌 🔄 [BUS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/10)`);
          
          setReconnectAttempts(prev => prev + 1);
          reconnectTimeoutRef.current = setTimeout(connect, delay);
        } else if (reconnectAttempts >= 10) {
          console.error('🚌 💀 [BUS] Max reconnection attempts reached');
          setError('Max reconnection attempts reached');
          
          toast({
            title: 'Data Bus Connection Failed',
            description: 'Unable to reconnect to data bus after multiple attempts',
            variant: 'destructive'
          });
        }
      };

      wsRef.current = ws;

    } catch (connectionError) {
      console.error('🚌 ❌ [BUS] Failed to create WebSocket connection:', connectionError);
      setError('Failed to connect to data bus');
      subscription.onError?.(connectionError as Error);
    }
  }, [subscription, reconnectAttempts, toast]);

  // Initial connection
  useEffect(() => {
    console.log('🚌 🎬 [BUS] Initial connection setup');
    connect();

    return () => {
      console.log('🚌 🧹 [BUS] Cleaning up connection');
      
      // Clear reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      // Close WebSocket connection
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [connect]);

  // Resubscribe when channels change
  useEffect(() => {
    if (wsRef.current && connected && wsRef.current.readyState === WebSocket.OPEN) {
      if (subscription.channels.length > 0) {
        console.log('🚌 🔄 [BUS] Resubscribing to updated channels:', subscription.channels);
        
        try {
          wsRef.current.send(JSON.stringify({
            action: 'subscribe',
            channels: subscription.channels
          }));
        } catch (subscribeError) {
          console.error('🚌 ❌ [BUS] Error resubscribing:', subscribeError);
          setError('Failed to update subscription');
        }
      }
    }
  }, [subscription.channels, connected]);

  const forceReconnect = useCallback(() => {
    console.log('🚌 🔄 [BUS] Force reconnecting...');
    setReconnectAttempts(0);
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Force reconnect');
    }
    
    setTimeout(connect, 1000);
  }, [connect]);

  return {
    connected,
    error,
    reconnectAttempts,
    subscribedChannels,
    forceReconnect
  } as BusConnectionState & { forceReconnect: () => void };
}