/**
 * Data Bus Manager Server
 * Central hub for all market data distribution
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const DataBusManager = require('./DataBusManager');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// WebSocket server for client subscriptions
const wss = new WebSocket.Server({ server });

// Initialize Data Bus Manager
const busManager = new DataBusManager({
  databaseUrl: process.env.DATABASE_URL,
  alpacaApiKey: process.env.ALPACA_LIVE_API_KEY || process.env.ALPACA_PAPER_API_KEY,
  alpacaApiSecret: process.env.ALPACA_LIVE_API_SECRET || process.env.ALPACA_PAPER_API_SECRET,
  cacheTTL: 30000,
  maxCacheSize: 1000,
  sqlPoolSize: 20,
  sqlBatchSize: 100,
  sqlFlushInterval: 5000
});

// Track connected WebSocket clients
const connectedClients = new Map(); // ws -> { subscriptions: Set }

// Initialize bus manager
busManager.initialize().catch(error => {
  console.error('❌ Failed to initialize bus manager:', error);
  process.exit(1);
});

// ==================== REST API ENDPOINTS ====================

// Health check
app.get('/health', async (req, res) => {
  const health = await busManager.healthCheck();
  res.status(health.healthy ? 200 : 503).json(health);
});

// Get bus statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await busManager.getStats();
    res.json(stats);
  } catch (error) {
    console.error('❌ Error getting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get option chain
app.post('/api/options/chain', async (req, res) => {
  try {
    const { symbol, expiryDate, strikeRange, strikeSpacing } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }

    console.log(`📊 API: Get option chain for ${symbol}`);

    const chain = await busManager.getOptionChain(symbol, expiryDate, strikeRange, strikeSpacing);

    res.json({
      symbol,
      expiryDate,
      data: chain,
      count: chain.length,
      source: 'data-bus',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting option chain:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get historical options bars
app.post('/api/options/bars', async (req, res) => {
  try {
    const { symbols, startDate, endDate, timeframe } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'symbols array is required' });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }

    console.log(`📊 API: Get options bars for ${symbols.length} symbols`);

    const bars = await busManager.getHistoricalOptionsBars(symbols, startDate, endDate, timeframe);

    res.json({
      symbols,
      startDate,
      endDate,
      timeframe,
      data: bars,
      count: Object.keys(bars).length,
      source: 'data-bus',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting options bars:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get historical stock data (aggregated OHLCV bars)
app.post('/api/stocks/historical', async (req, res) => {
  try {
    const { symbol, startDate, endDate, timeframe = '1m' } = req.body;

    if (!symbol || !startDate || !endDate) {
      return res.status(400).json({ error: 'symbol, startDate, and endDate are required' });
    }

    console.log(`📊 API: Get historical bars for ${symbol} (${timeframe})`);

    // Try to get pre-aggregated bars first
    let data = await busManager.getHistoricalBars(symbol, timeframe, startDate, endDate);
    let source = 'pre-aggregated-bars';

    // If no aggregated bars available, fall back to raw trade data (for backwards compatibility)
    if (!data || data.length === 0) {
      console.log(`📊 No aggregated bars found, falling back to raw data for ${symbol}`);
      const rawData = await busManager.getHistoricalStockData(symbol, startDate, endDate);
      
      // Convert raw trades to simple OHLCV format for compatibility
      if (rawData && rawData.length > 0) {
        // For now, just return the raw data in a compatible format
        // In the future, we could aggregate on-the-fly here
        data = rawData.map(trade => ({
          bar_timestamp: trade.timestamp,
          open: trade.price,
          high: trade.price,
          low: trade.price,
          close: trade.price,
          volume: trade.volume || 0,
          trade_count: 1
        }));
        source = 'raw-trades-converted';
      } else {
        data = [];
      }
    }

    res.json({
      symbol,
      timeframe,
      startDate,
      endDate,
      data,
      count: data.length,
      source,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error getting historical stock data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add stock symbol to watchlist
app.post('/api/stocks/watch', (req, res) => {
  try {
    const { symbol } = req.body;

    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }

    busManager.addStockSymbol(symbol);

    res.json({
      message: `Symbol ${symbol} added to watchlist`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error adding symbol:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== WEBSOCKET HANDLING ====================

wss.on('connection', (ws) => {
  console.log('🔌 Client connected to data bus WebSocket');

  // Initialize client metadata
  connectedClients.set(ws, {
    subscriptions: new Set()
  });

  // Handle incoming messages from client
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 Received message from client:', data.action);

      if (data.action === 'subscribe') {
        handleSubscribe(ws, data);
      } else if (data.action === 'unsubscribe') {
        handleUnsubscribe(ws, data);
      }
    } catch (error) {
      console.error('❌ Error processing client message:', error.message);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message
      }));
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    console.log('❌ Client disconnected from data bus');
    handleClientDisconnect(ws);
  });

  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to Trade Whisperer Data Bus',
    timestamp: new Date().toISOString()
  }));
});

/**
 * Handle subscribe request from client
 */
function handleSubscribe(ws, data) {
  const clientData = connectedClients.get(ws);
  const { channels } = data;

  if (!channels || !Array.isArray(channels)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'channels array is required'
    }));
    return;
  }

  channels.forEach(channel => {
    // Create callback for this subscription
    const callback = (ch, messageData) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'data',
          channel: ch,
          data: messageData,
          timestamp: new Date().toISOString()
        }));
      }
    };

    // Store callback reference
    clientData.subscriptions.add({ channel, callback });

    // Subscribe to bus
    busManager.subscribe(channel, callback);

    console.log(`📡 Client subscribed to: ${channel}`);
  });

  // Send confirmation
  ws.send(JSON.stringify({
    type: 'subscribed',
    channels,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Handle unsubscribe request from client
 */
function handleUnsubscribe(ws, data) {
  const clientData = connectedClients.get(ws);
  const { channels } = data;

  if (!channels || !Array.isArray(channels)) {
    return;
  }

  channels.forEach(channel => {
    // Find and remove subscription
    for (const sub of clientData.subscriptions) {
      if (sub.channel === channel) {
        busManager.unsubscribe(channel, sub.callback);
        clientData.subscriptions.delete(sub);
        console.log(`📡 Client unsubscribed from: ${channel}`);
      }
    }
  });

  ws.send(JSON.stringify({
    type: 'unsubscribed',
    channels,
    timestamp: new Date().toISOString()
  }));
}

/**
 * Handle client disconnect
 */
function handleClientDisconnect(ws) {
  const clientData = connectedClients.get(ws);

  if (clientData) {
    // Unsubscribe from all channels
    for (const sub of clientData.subscriptions) {
      busManager.unsubscribe(sub.channel, sub.callback);
    }
  }

  connectedClients.delete(ws);
}

// ==================== SERVER STARTUP ====================

server.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚌 DATA BUS MANAGER');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📈 Statistics: http://localhost:${PORT}/api/stats`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down Data Bus Manager...');

  // Close WebSocket server
  wss.close();

  // Destroy bus manager
  await busManager.destroy();

  // Close HTTP server
  server.close(() => {
    console.log('✅ Server shut down complete');
    process.exit(0);
  });
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM signal');

  // Close WebSocket server
  wss.close();

  // Destroy bus manager
  await busManager.destroy();

  // Close HTTP server
  server.close(() => {
    console.log('✅ Server shut down complete');
    process.exit(0);
  });
});
