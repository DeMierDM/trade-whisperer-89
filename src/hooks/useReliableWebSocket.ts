import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from './use-toast';

interface UseReliableWebSocketOptions {
  shouldReconnect?: (event: CloseEvent) => boolean;
  reconnectAttempts?: number;
  reconnectInterval?: number | ((attemptNumber: number) => number);
  heartbeat?: {
    interval?: number;
    message?: string;
    timeout?: number;
  };
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (event: Event) => void;
  onMessage?: (data: any) => void;
}

interface WebSocketState {
  connected: boolean;
  connecting: boolean;
  lastError: string | null;
  reconnectCount: number;
  lastMessage: any;
}

/**
 * Enhanced WebSocket hook following Context7 patterns
 * Provides reliable connection management with exponential backoff,
 * heartbeat monitoring, and proper error handling
 */
export const useReliableWebSocket = (url: string, symbols: string[] = [], options: UseReliableWebSocketOptions = {}) => {
  const {
    shouldReconnect = (event) => event.code !== 1000,
    reconnectAttempts = 10,
    reconnectInterval = (attempt) => Math.min(Math.pow(2, attempt) * 1000, 10000),
    heartbeat,
    onOpen,
    onClose,
    onError,
    onMessage
  } = options;

  const [state, setState] = useState<WebSocketState>({
    connected: false,
    connecting: false,
    lastError: null,
    reconnectCount: 0,
    lastMessage: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attemptCountRef = useRef(0);
  const didUnmountRef = useRef(false);

  const { toast } = useToast();

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }
  }, []);

  // Setup heartbeat monitoring
  const setupHeartbeat = useCallback(() => {
    if (!heartbeat || !wsRef.current) return;

    const { interval = 30000, message = 'ping', timeout = 60000 } = heartbeat;

    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        console.log('[WebSocket] Sending heartbeat:', message);
        wsRef.current.send(JSON.stringify({ type: 'heartbeat', message }));

        // Set timeout for heartbeat response
        heartbeatTimeoutRef.current = setTimeout(() => {
          console.error('[WebSocket] Heartbeat timeout - no response');
          wsRef.current?.close(4408, 'Heartbeat timeout');
        }, timeout);
      }
    }, interval);
  }, [heartbeat]);

  // Connect function with proper error handling
  const connect = useCallback(() => {
    if (didUnmountRef.current || wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    console.log(`[WebSocket] Connecting to ${url} (attempt ${attemptCountRef.current + 1})`);
    
    setState(prev => ({ ...prev, connecting: true, lastError: null }));

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] ✅ Connected successfully');
        
        setState(prev => ({
          ...prev,
          connected: true,
          connecting: false,
          lastError: null,
          reconnectCount: attemptCountRef.current
        }));

        attemptCountRef.current = 0;
        setupHeartbeat();

        // Subscribe to symbols
        if (symbols.length > 0) {
          console.log('[WebSocket] 📡 Subscribing to symbols:', symbols);
          ws.send(JSON.stringify({
            action: 'subscribe',
            symbols: symbols
          }));
        }

        onOpen?.();
        
        if (attemptCountRef.current > 0) {
          toast({
            title: "Connection Restored",
            description: `Reconnected to live data feed`,
          });
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle heartbeat responses
          if (data.type === 'heartbeat_ack' || data.message === 'pong') {
            console.log('[WebSocket] 💓 Heartbeat acknowledged');
            if (heartbeatTimeoutRef.current) {
              clearTimeout(heartbeatTimeoutRef.current);
              heartbeatTimeoutRef.current = null;
            }
            return;
          }

          setState(prev => ({ ...prev, lastMessage: data }));
          onMessage?.(data);
        } catch (error) {
          console.error('[WebSocket] ❌ Message parse error:', error);
        }
      };

      ws.onerror = (event) => {
        console.error('[WebSocket] ❌ Connection error:', event);
        
        setState(prev => ({
          ...prev,
          lastError: 'Connection error occurred',
          connecting: false
        }));

        onError?.(event);
      };

      ws.onclose = (event) => {
        console.log(`[WebSocket] 🔌 Connection closed:`, event.code, event.reason);
        
        clearTimers();
        
        setState(prev => ({
          ...prev,
          connected: false,
          connecting: false
        }));

        onClose?.(event);

        // Attempt reconnection if not manually closed and not unmounted
        if (shouldReconnect(event) && !didUnmountRef.current && attemptCountRef.current < reconnectAttempts) {
          const delay = typeof reconnectInterval === 'function' 
            ? reconnectInterval(attemptCountRef.current)
            : reconnectInterval;

          console.log(`[WebSocket] 🔄 Reconnecting in ${delay}ms (attempt ${attemptCountRef.current + 1}/${reconnectAttempts})`);
          
          setState(prev => ({ ...prev, lastError: `Reconnecting in ${Math.ceil(delay/1000)}s...` }));
          
          reconnectTimeoutRef.current = setTimeout(() => {
            attemptCountRef.current++;
            connect();
          }, delay);
        } else if (attemptCountRef.current >= reconnectAttempts) {
          console.error(`[WebSocket] ❌ Max reconnection attempts (${reconnectAttempts}) reached`);
          setState(prev => ({ ...prev, lastError: 'Connection failed - max attempts reached' }));
          
          toast({
            title: "Connection Lost",
            description: `Failed to reconnect after ${reconnectAttempts} attempts. Please refresh the page.`,
            variant: "destructive"
          });
        }
      };

    } catch (error) {
      console.error('[WebSocket] ❌ Connection creation failed:', error);
      setState(prev => ({
        ...prev,
        connected: false,
        connecting: false,
        lastError: 'Failed to create connection'
      }));
    }
  }, [url, symbols, shouldReconnect, reconnectAttempts, reconnectInterval, setupHeartbeat, onOpen, onMessage, onError, onClose, toast]);

  // Disconnect function
  const disconnect = useCallback(() => {
    console.log('[WebSocket] 🔌 Manually disconnecting...');
    clearTimers();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    
    setState(prev => ({
      ...prev,
      connected: false,
      connecting: false
    }));
  }, [clearTimers]);

  // Force reconnect function
  const forceReconnect = useCallback(() => {
    console.log('[WebSocket] 🔄 Force reconnecting...');
    attemptCountRef.current = 0;
    disconnect();
    setTimeout(connect, 1000);
  }, [disconnect, connect]);

  // Send message function
  const sendMessage = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      wsRef.current.send(message);
      return true;
    }
    console.warn('[WebSocket] ⚠️ Cannot send message - not connected');
    return false;
  }, []);

  // Connect on mount and when symbols change
  useEffect(() => {
    console.log('[WebSocket] Effect triggered - symbols:', symbols);
    connect();
    
    return () => {
      didUnmountRef.current = true;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
      }
    };
  }, [connect]);

  // Update subscription when symbols change
  useEffect(() => {
    if (state.connected && symbols.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] 📡 Updating subscription for symbols:', symbols);
      sendMessage({
        action: 'subscribe',
        symbols: symbols
      });
    }
  }, [symbols, state.connected, sendMessage]);

  return {
    ...state,
    sendMessage,
    disconnect,
    forceReconnect
  };
};