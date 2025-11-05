import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
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

export interface BusConnectionState {
  connected: boolean;
  error: string | null;
  reconnectAttempts: number;
  subscribedChannels: string[];
}

interface BusSubscriber {
  id: string;
  channels: string[];
  onMessage: (message: BusMessage) => void;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

// Shared WebSocket Connection Manager
class SharedBusConnection {
  private ws: WebSocket | null = null;
  private subscribers: Map<string, BusSubscriber> = new Map();
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private connected = false;
  private subscribedChannels: string[] = [];
  private listeners: Set<(state: BusConnectionState) => void> = new Set();
  private instanceId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  private connecting = false;
  private lastConnectTime = 0;

  constructor() {
    console.log('🚌 🆕 [SHARED] Creating SharedBusConnection instance:', this.instanceId);
    this.connect();
  }

  private connect() {
    const now = Date.now();
    if (this.connecting || (now - this.lastConnectTime < 1000)) {
      console.log('🚌 ⏸️ [SHARED] Skipping connection attempt - too frequent or already connecting');
      return;
    }
    
    this.connecting = true;
    this.lastConnectTime = now;
    
    console.log('🚌 [SHARED] Connecting to data bus manager at', BUS_WEBSOCKET_URL, 'instance:', this.instanceId);
    console.log('🚌 [SHARED] Current state:', { connected: this.connected, subscribers: this.subscribers.size });
    
    if (this.ws) {
      console.log('🚌 [SHARED] Closing existing WebSocket before reconnection');
      this.ws.close(1000, 'Reconnecting');
    }

    this.ws = new WebSocket(BUS_WEBSOCKET_URL);
    
    this.ws.onopen = () => {
      console.log('🚌 ✅ [SHARED] Connected to data bus manager');
      this.connected = true;
      this.connecting = false;
      this.reconnectAttempts = 0;
      
      // Resubscribe to all channels
      this.resubscribeAll();
      
      // Notify all subscribers
      this.subscribers.forEach(subscriber => {
        console.log('🚌 📞 [SHARED] Notifying subscriber of connection:', subscriber.id);
        subscriber.onConnected?.();
      });
      
      this.notifyStateChange();
    };

    this.ws.onmessage = (event) => {
      try {
        const message: BusMessage = JSON.parse(event.data);
        
        console.log('🚌 📨 [SHARED] Message received:', {
          type: message.type,
          channel: message.channel,
          symbol: message.symbol,
          timestamp: message.timestamp
        });

        // Handle connection and subscription confirmations
        if (message.type === 'connected') {
          console.log('🚌 ✅ [SHARED] Server confirmed connection:', message.data);
        } else if (message.type === 'subscribed') {
          // Handle both possible response formats: {data: {channels: []}} or {channels: []}
          const channels = message.data?.channels || (message as any).channels || [];
          console.log('🚌 ✅ [SHARED] Subscription confirmed for channels:', channels);
          this.subscribedChannels = channels;
          this.notifyStateChange();
        } else if (message.type === 'error') {
          console.error('🚌 ❌ [SHARED] Server error:', message.data);
          this.subscribers.forEach(subscriber => {
            subscriber.onError?.(new Error(message.data.message));
          });
        } else {
          // Route message to relevant subscribers
          this.subscribers.forEach(subscriber => {
            if (subscriber.channels.some(channel => message.channel?.startsWith(channel.split('.').slice(0, 2).join('.')))) {
              subscriber.onMessage(message);
            }
          });
        }
      } catch (parseError) {
        console.error('🚌 ❌ [SHARED] Error parsing message:', parseError);
        console.error('🚌 📝 [SHARED] Raw message data:', event.data);
        this.subscribers.forEach(subscriber => {
          subscriber.onError?.(parseError as Error);
        });
      }
    };

    this.ws.onerror = (error) => {
      console.error('🚌 ❌ [SHARED] WebSocket error:', error);
      this.subscribers.forEach(subscriber => {
        subscriber.onError?.(new Error('WebSocket connection error'));
      });
    };

    this.ws.onclose = (event) => {
      console.log('🚌 ❌ [SHARED] WebSocket closed:', {
        code: event.code,
        reason: event.reason,
        wasClean: event.wasClean,
        currentSubscribers: this.subscribers.size
      });
      
      this.connected = false;
      this.connecting = false;
      this.subscribedChannels = [];
      this.notifyStateChange();
      
      this.subscribers.forEach(subscriber => {
        console.log('🚌 📞 [SHARED] Notifying subscriber of disconnection:', subscriber.id);
        subscriber.onDisconnected?.();
      });

      // Auto-reconnect if not manually closed and we have subscribers
      if (event.code !== 1000 && this.reconnectAttempts < 10 && this.subscribers.size > 0) {
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        console.log(`🚌 🔄 [SHARED] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/10), subscribers: ${this.subscribers.size}`);
        
        this.reconnectAttempts += 1;
        this.reconnectTimeout = setTimeout(() => this.connect(), delay);
      } else if (this.reconnectAttempts >= 10) {
        console.error('🚌 💀 [SHARED] Max reconnection attempts reached');
      } else if (this.subscribers.size === 0) {
        console.log('🚌 🏁 [SHARED] No subscribers left, not reconnecting');
      }
    };
  }

  subscribe(subscriber: BusSubscriber): () => void {
    console.log('🚌 📡 [SHARED] Adding subscriber:', subscriber.id, 'channels:', subscriber.channels, 'total subscribers will be:', this.subscribers.size + 1);
    this.subscribers.set(subscriber.id, subscriber);
    
    // Send subscription if connected
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      console.log('🚌 📤 [SHARED] WebSocket is open, sending subscription immediately');
      this.sendSubscription();
    } else {
      console.log('🚌 ⏳ [SHARED] WebSocket not ready, subscription will be sent when connected. Current state:', this.ws?.readyState);
    }
    
    // Return unsubscribe function
    return () => {
      console.log('🚌 🗑️ [SHARED] Removing subscriber:', subscriber.id, 'remaining subscribers will be:', this.subscribers.size - 1);
      this.subscribers.delete(subscriber.id);
      
      // Update subscriptions
      if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
        console.log('🚌 📤 [SHARED] Updating subscription after removal');
        this.sendSubscription();
      }
    };
  }

  private sendSubscription() {
    const allChannels = Array.from(new Set(
      Array.from(this.subscribers.values()).flatMap(sub => sub.channels)
    ));
    
    if (allChannels.length > 0) {
      console.log('🚌 📤 [SHARED] Sending subscription for channels:', allChannels);
      this.ws?.send(JSON.stringify({
        action: 'subscribe',
        channels: allChannels
      }));
    }
  }

  private resubscribeAll() {
    if (this.subscribers.size > 0) {
      this.sendSubscription();
    }
  }

  private notifyStateChange() {
    const state: BusConnectionState = {
      connected: this.connected,
      error: this.connected ? null : 'Disconnected',
      reconnectAttempts: this.reconnectAttempts,
      subscribedChannels: this.subscribedChannels
    };
    
    this.listeners.forEach(listener => listener(state));
  }

  onStateChange(listener: (state: BusConnectionState) => void): () => void {
    this.listeners.add(listener);
    
    // Send current state immediately
    listener({
      connected: this.connected,
      error: this.connected ? null : 'Disconnected',
      reconnectAttempts: this.reconnectAttempts,
      subscribedChannels: this.subscribedChannels
    });
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  forceReconnect() {
    console.log('🚌 🔄 [SHARED] Force reconnecting...');
    this.reconnectAttempts = 0;
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Force reconnect');
    }
    
    setTimeout(() => this.connect(), 1000);
  }

  destroy() {
    console.log('🚌 🧹 [SHARED] Destroying shared connection instance:', this.instanceId);
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Component unmounting');
    }
    
    this.subscribers.clear();
    this.listeners.clear();
  }
}

// Singleton shared connection instance
let sharedConnection: SharedBusConnection | null = null;

function getSharedConnection(): SharedBusConnection {
  if (!sharedConnection) {
    console.log('🚌 🎯 [SHARED] Creating new shared connection instance');
    sharedConnection = new SharedBusConnection();
  } else {
    console.log('🚌 ♻️ [SHARED] Reusing existing shared connection instance');
  }
  return sharedConnection;
}

// Clean up on HMR (Vite hot reload)
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('🚌 🔥 [SHARED] HMR cleanup: destroying shared connection');
    if (sharedConnection) {
      sharedConnection.destroy();
      sharedConnection = null;
    }
  });
}

/**
 * Shared data bus WebSocket hook
 * Multiple components can use this without creating duplicate connections
 */
export function useSharedBusData(
  subscriberId: string,
  channels: string[],
  onMessage: (message: BusMessage) => void,
  onError?: (error: Error) => void,
  onConnected?: () => void,
  onDisconnected?: () => void
): BusConnectionState & { forceReconnect: () => void } {
  const [state, setState] = useState<BusConnectionState>({
    connected: false,
    error: null,
    reconnectAttempts: 0,
    subscribedChannels: []
  });

  const { toast } = useToast();

  // Use refs to store latest callback references without triggering effects
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  const onConnectedRef = useRef(onConnected);
  const onDisconnectedRef = useRef(onDisconnected);
  const toastRef = useRef(toast);
  
  // Debounce channels changes to prevent rapid re-subscriptions
  const [debouncedChannels, setDebouncedChannels] = useState(channels);
  const channelsString = channels.join(',');
  
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedChannels(channels);
    }, 500); // 500ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [channelsString]);

  // Update refs on every render
  onMessageRef.current = onMessage;
  onErrorRef.current = onError;
  onConnectedRef.current = onConnected;
  onDisconnectedRef.current = onDisconnected;
  toastRef.current = toast;

  useEffect(() => {
    console.log('🚌 🔄 [SHARED] Setting up subscription for:', subscriberId, debouncedChannels);
    
    const connection = getSharedConnection();
    const unsubscribe = connection.subscribe({
      id: subscriberId,
      channels: debouncedChannels,
      onMessage: (message) => onMessageRef.current(message),
      onError: (error) => onErrorRef.current?.(error),
      onConnected: () => {
        onConnectedRef.current?.();
        toastRef.current({
          title: 'Data Bus Connected',
          description: `Connected to centralized data bus (${debouncedChannels.length} channels)`,
        });
      },
      onDisconnected: () => onDisconnectedRef.current?.()
    });

    const unsubscribeState = connection.onStateChange(setState);

    return () => {
      console.log('🚌 🧹 [SHARED] Cleaning up subscription for:', subscriberId);
      unsubscribe();
      unsubscribeState();
    };
  }, [subscriberId, debouncedChannels.join(',')]); // Use debounced channels

  return {
    ...state,
    forceReconnect: () => getSharedConnection().forceReconnect()
  };
}

// Legacy compatibility - keep the old useBusData interface but use shared connection internally
export function useBusData(subscription: {
  channels: string[];
  onMessage: (message: BusMessage) => void;
  onError?: (error: Error) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}): BusConnectionState & { forceReconnect: () => void } {
  const subscriberId = useRef(`legacy-${Date.now()}-${Math.random()}`).current;
  
  return useSharedBusData(
    subscriberId,
    subscription.channels,
    subscription.onMessage,
    subscription.onError,
    subscription.onConnected,
    subscription.onDisconnected
  );
}