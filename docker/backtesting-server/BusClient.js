/**
 * BusClient
 * Client library for connecting to the Data Bus
 * Can be used by any service (API server, backtesting, etc.)
 */

const WebSocket = require('ws');
const EventEmitter = require('eventemitter3');

class BusClient extends EventEmitter {
  constructor(busUrl = 'ws://data_bus_manager:3004') {
    super();

    this.busUrl = busUrl;
    this.ws = null;
    this.subscriptions = new Set();
    this.connected = false;
    this.reconnectDelay = 5000;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;

    console.log(`📡 BusClient initialized for: ${busUrl}`);
  }

  /**
   * Connect to the data bus
   */
  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('⚠️ Already connected to data bus');
      return;
    }

    try {
      console.log(`🚀 Connecting to data bus: ${this.busUrl}`);

      this.ws = new WebSocket(this.busUrl);

      this.ws.on('open', () => {
        console.log('✅ Connected to data bus');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');

        // Resubscribe to all channels
        if (this.subscriptions.size > 0) {
          this.resubscribe();
        }
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (error) => {
        console.error('❌ Data bus WebSocket error:', error.message);
        this.connected = false;
        this.emit('error', error);
      });

      this.ws.on('close', () => {
        console.log('❌ Disconnected from data bus');
        this.connected = false;
        this.emit('disconnected');

        // Attempt to reconnect
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`🔄 Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect(), this.reconnectDelay);
        } else {
          console.error('❌ Max reconnect attempts reached. Giving up.');
        }
      });

    } catch (error) {
      console.error('❌ Failed to connect to data bus:', error.message);
      this.connected = false;
    }
  }

  /**
   * Handle incoming message from bus
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);

      if (message.type === 'connected') {
        console.log('✅ Data bus connection confirmed');
      } else if (message.type === 'subscribed') {
        console.log('📡 Subscribed to channels:', message.channels);
      } else if (message.type === 'data') {
        // Emit data to subscribers
        this.emit(message.channel, message.data);
        this.emit('data', message.channel, message.data);
      } else if (message.type === 'error') {
        console.error('❌ Data bus error:', message.message);
        this.emit('error', new Error(message.message));
      }
    } catch (error) {
      console.error('❌ Error handling message:', error.message);
    }
  }

  /**
   * Subscribe to channels
   */
  subscribe(channels) {
    if (!Array.isArray(channels)) {
      channels = [channels];
    }

    // Add to subscriptions
    channels.forEach(channel => this.subscriptions.add(channel));

    // Send subscribe message if connected
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        channels
      }));

      console.log('📡 Subscribing to:', channels);
    }
  }

  /**
   * Unsubscribe from channels
   */
  unsubscribe(channels) {
    if (!Array.isArray(channels)) {
      channels = [channels];
    }

    // Remove from subscriptions
    channels.forEach(channel => this.subscriptions.delete(channel));

    // Send unsubscribe message if connected
    if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'unsubscribe',
        channels
      }));

      console.log('📡 Unsubscribing from:', channels);
    }
  }

  /**
   * Resubscribe to all channels after reconnection
   */
  resubscribe() {
    if (this.subscriptions.size > 0) {
      const channels = Array.from(this.subscriptions);
      this.ws.send(JSON.stringify({
        action: 'subscribe',
        channels
      }));

      console.log('📡 Resubscribed to', channels.length, 'channels');
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect from bus
   */
  disconnect() {
    if (this.ws) {
      this.reconnectAttempts = this.maxReconnectAttempts; // Prevent auto-reconnect
      this.ws.close();
      this.ws = null;
      this.connected = false;
      console.log('🛑 Disconnected from data bus');
    }
  }
}

module.exports = BusClient;
