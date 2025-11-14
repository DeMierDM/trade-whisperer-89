/**
 * Paper Trading Service - Main Server
 * Integrates with existing data bus and executes live trading strategies
 */

const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const cron = require('node-cron');
require('dotenv').config();

// Core components
const PaperTradingBot = require('./src/PaperTradingBot');
const BusClient = require('./src/BusClient');
const DatabaseManager = require('./src/DatabaseManager');
const StrategyManager = require('./src/StrategyManager');
const AlpacaTradingClient = require('./src/AlpacaTradingClient');
const MockAlpacaClient = require('./src/MockAlpacaClient');
const MultiBotManager = require('./src/MultiBotManager');

const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(express.json());

// Create HTTP server
const server = http.createServer(app);

// WebSocket server for real-time updates
const wss = new WebSocket.Server({ server });

// Initialize core components
let busClient;
let databaseManager;
let strategyManager;
let alpacaClient;
let paperTradingBot;
let multiBotManager;

async function initializeServices() {
  console.log('🚀 Initializing Paper Trading Service...');

  try {
    // Initialize database connection
    databaseManager = new DatabaseManager(process.env.DATABASE_URL);
    await databaseManager.initialize();
    console.log('✅ Database manager initialized');

    // Initialize Alpaca trading client
    if (process.env.ALPACA_PAPER_API_KEY && process.env.ALPACA_PAPER_API_SECRET) {
      try {
        alpacaClient = new AlpacaTradingClient({
          apiKey: process.env.ALPACA_PAPER_API_KEY,
          apiSecret: process.env.ALPACA_PAPER_API_SECRET,
          paper: true,
          usePolygon: false
        });
        await alpacaClient.initialize();
        console.log('✅ Alpaca trading client initialized (LIVE PAPER TRADING)');
      } catch (error) {
        console.warn('⚠️ Alpaca authentication failed - falling back to mock mode');
        console.log('📋 Error details:', error.message);
        alpacaClient = new MockAlpacaClient({
          apiKey: 'MOCK_KEY',
          apiSecret: 'MOCK_SECRET',
          paper: true
        });
        await alpacaClient.initialize();
        console.log('✅ Mock Alpaca client initialized (SIMULATION MODE)');
      }
    } else {
      console.warn('⚠️ Alpaca credentials not found - running in mock mode');
      alpacaClient = new MockAlpacaClient({
        apiKey: 'MOCK_KEY',
        apiSecret: 'MOCK_SECRET',
        paper: true
      });
      await alpacaClient.initialize();
      console.log('✅ Mock Alpaca client initialized (SIMULATION MODE)');
    }

    // Initialize strategy manager (loads existing strategies from backtesting system)
    strategyManager = new StrategyManager();
    await strategyManager.loadStrategies();
    console.log('✅ Strategy manager initialized');

    // Initialize API server WebSocket client for real-time data
    busClient = new BusClient(process.env.API_SERVER_WS_URL || 'ws://api_server:3001');
    await busClient.connect();
    console.log('✅ API server WebSocket client connected');

    // Initialize paper trading bot
    paperTradingBot = new PaperTradingBot({
      busClient,
      databaseManager,
      strategyManager,
      alpacaClient,
      wsServer: wss
    });

    await paperTradingBot.initialize();
    console.log('✅ Paper trading bot initialized');

    // Initialize multi-bot manager
    multiBotManager = new MultiBotManager(databaseManager, alpacaClient, 30000);
    await multiBotManager.initialize();
    console.log('✅ Multi-bot manager initialized');

    console.log('🎯 Paper Trading Service fully operational!');

  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    process.exit(1);
  }
}

// REST API Endpoints

// Test endpoint for validating bot functionality
app.post('/api/test-signal', async (req, res) => {
  try {
    const { symbol = 'SPY', signal_type = 'BUY_CALL' } = req.body;
    
    console.log('🧪 [TEST] Simulating signal processing...');
    
    // Create mock signal
    const mockSignal = {
      signal_id: Date.now(),
      bot_id: 1,
      symbol: symbol,
      signal_type: signal_type,
      signal_strength: 0.8,
      underlying_price: 450.00,
      signal_reason: 'Mock test signal for validation',
      target_delta: signal_type === 'BUY_CALL' ? 0.5 : -0.5,
      rsi_value: 35,
      vwap_value: 449.50,
      timestamp: new Date().toISOString()
    };

    // Test option contract finding
    const contract = await alpacaClient.findOptionContract(mockSignal);
    console.log('🎯 [TEST] Found contract:', contract.symbol);

    // Test order execution (simulation)
    const quantity = 1;
    const order = await alpacaClient.placeOptionOrder(contract, mockSignal, quantity);
    console.log('📋 [TEST] Order executed:', order.id);

    // Get updated account info
    const account = await alpacaClient.getAccount();
    const positions = await alpacaClient.getPositions();

    res.json({
      success: true,
      message: 'Bot functionality test completed successfully',
      test_results: {
        signal: mockSignal,
        contract: contract,
        order: order,
        account_summary: {
          equity: account.equity,
          cash: account.cash,
          positions_count: positions.length
        },
        positions: positions
      }
    });

  } catch (error) {
    console.error('❌ [TEST] Error during functionality test:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  try {
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: Boolean(databaseManager && databaseManager.isConnected()),
        dataBus: Boolean(busClient && busClient.isConnected()),
        alpaca: Boolean(alpacaClient && alpacaClient.isConnected()),
        bot: Boolean(paperTradingBot && paperTradingBot.isRunning())
      }
    };
    res.json(healthData);
  } catch (error) {
    console.error('Health check error:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get available strategies
app.get('/api/strategies', async (req, res) => {
  try {
    const strategies = strategyManager.getAvailableStrategies();
    res.json(strategies);
  } catch (error) {
    console.error('Error fetching strategies:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get active bots
app.get('/api/bots', async (req, res) => {
  try {
    const bots = await databaseManager.getActiveBots();
    res.json(bots);
  } catch (error) {
    console.error('Error fetching bots:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new paper trading bot
app.post('/api/bots', async (req, res) => {
  try {
    const { name, strategy_name, symbol, parameters } = req.body;
    
    const botId = await paperTradingBot.createBot({
      name,
      strategyName: strategy_name,
      symbol,
      parameters: parameters || {}
    });

    res.json({ bot_id: botId, message: 'Bot created successfully' });
  } catch (error) {
    console.error('Error creating bot:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start/stop bot
app.post('/api/bots/:botId/:action', async (req, res) => {
  try {
    const { botId, action } = req.params;
    
    if (action === 'start') {
      await paperTradingBot.startBot(botId);
      res.json({ message: 'Bot started successfully' });
    } else if (action === 'stop') {
      await paperTradingBot.stopBot(botId);
      res.json({ message: 'Bot stopped successfully' });
    } else {
      res.status(400).json({ error: 'Invalid action. Use start or stop.' });
    }
  } catch (error) {
    console.error(`Error ${req.params.action} bot:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Get bot performance
app.get('/api/bots/:botId/performance', async (req, res) => {
  try {
    const { botId } = req.params;
    const performance = await databaseManager.getBotPerformance(botId);
    res.json(performance);
  } catch (error) {
    console.error('Error fetching bot performance:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get bot positions
app.get('/api/bots/:botId/positions', async (req, res) => {
  try {
    const { botId } = req.params;
    const positions = await databaseManager.getBotPositions(botId);
    res.json(positions);
  } catch (error) {
    console.error('Error fetching bot positions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get bot trades
app.get('/api/bots/:botId/trades', async (req, res) => {
  try {
    const { botId } = req.params;
    const { limit = 50 } = req.query;
    const trades = await databaseManager.getBotTrades(botId, limit);
    res.json(trades);
  } catch (error) {
    console.error('Error fetching bot trades:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get recent signals
app.get('/api/signals', async (req, res) => {
  try {
    const { symbol, limit = 20 } = req.query;
    const signals = await databaseManager.getRecentSignals(symbol, limit);
    res.json(signals);
  } catch (error) {
    console.error('Error fetching signals:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all positions (for live chart)
app.get('/api/positions', async (req, res) => {
  try {
    const positions = await databaseManager.getAllPositions();
    res.json(positions);
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all trades (for live chart)
app.get('/api/trades', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const trades = await databaseManager.getAllTrades(limit);
    res.json(trades);
  } catch (error) {
    console.error('Error fetching trades:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get bot metrics for dashboard
app.get('/api/metrics', async (req, res) => {
  try {
    const metrics = await databaseManager.getAllBotMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get historical data for live paper trading chart
app.get('/api/historical/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { period = '1D', bars = 400, timeframe = '1m' } = req.query;
    
    // Calculate date range based on period
    const endDate = new Date();
    const startDate = new Date();
    
    switch (period) {
      case '1D':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '3D':
        startDate.setDate(endDate.getDate() - 3);
        break;
      case '1W':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '1M':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 1);
    }

    console.log(`📊 Fetching historical data for ${symbol}: ${startDate.toISOString()} to ${endDate.toISOString()}`);
    
    // Query aggregated bars from data bus cache
    const historicalBars = await databaseManager.getHistoricalBars(symbol, timeframe, startDate, endDate, bars);
    
    // If no aggregated bars, try to build from raw trade data
    if (!historicalBars || historicalBars.length === 0) {
      console.log(`📊 No aggregated bars found, building from raw stock data for ${symbol}`);
      const rawData = await databaseManager.getHistoricalStockData(symbol, startDate, endDate);
      const builtBars = await databaseManager.buildBarsFromRawData(rawData, timeframe);
      
      res.json({
        symbol,
        period,
        timeframe,
        bars: builtBars || [],
        source: 'built_from_raw_data',
        totalBars: builtBars?.length || 0
      });
    } else {
      res.json({
        symbol,
        period,
        timeframe,
        bars: historicalBars,
        source: 'aggregated_bars',
        totalBars: historicalBars.length
      });
    }
    
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MULTI-BOT MANAGEMENT ENDPOINTS
// ============================================================================

// Get multi-bot dashboard data
app.get('/api/multi-bot/dashboard', async (req, res) => {
  try {
    if (!multiBotManager || !multiBotManager.initialized) {
      return res.status(503).json({ 
        error: 'Multi-bot manager not initialized',
        message: 'Please wait for the service to fully start'
      });
    }

    const dashboard = await multiBotManager.getPerformanceDashboard();
    res.json(dashboard);
  } catch (error) {
    console.error('Error fetching multi-bot dashboard:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start all bots
app.post('/api/multi-bot/start-all', async (req, res) => {
  try {
    if (!multiBotManager || !multiBotManager.initialized) {
      return res.status(503).json({ error: 'Multi-bot manager not initialized' });
    }

    const results = await multiBotManager.startAllBots();
    res.json({ 
      success: true, 
      message: 'All bots started',
      results: results
    });
  } catch (error) {
    console.error('Error starting all bots:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stop all bots
app.post('/api/multi-bot/stop-all', async (req, res) => {
  try {
    if (!multiBotManager || !multiBotManager.initialized) {
      return res.status(503).json({ error: 'Multi-bot manager not initialized' });
    }

    const result = await multiBotManager.stopAllBots();
    res.json(result);
  } catch (error) {
    console.error('Error stopping all bots:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update bot allocations
app.post('/api/multi-bot/allocations', async (req, res) => {
  try {
    if (!multiBotManager || !multiBotManager.initialized) {
      return res.status(503).json({ error: 'Multi-bot manager not initialized' });
    }

    const { allocations } = req.body;
    
    if (!allocations || typeof allocations !== 'object') {
      return res.status(400).json({ 
        error: 'Invalid allocations object',
        message: 'Allocations must be an object with botId: percentage pairs'
      });
    }

    const result = await multiBotManager.updateAllocations(allocations);
    res.json(result);
  } catch (error) {
    console.error('Error updating allocations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get detailed performance for specific bot
app.get('/api/multi-bot/performance/:botId', async (req, res) => {
  try {
    if (!multiBotManager || !multiBotManager.initialized) {
      return res.status(503).json({ error: 'Multi-bot manager not initialized' });
    }

    const { botId } = req.params;
    const performance = await multiBotManager.getBotDetailedPerformance(parseInt(botId));
    res.json(performance);
  } catch (error) {
    console.error('Error fetching bot performance:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate end-of-day report
app.post('/api/multi-bot/reports/end-of-day', async (req, res) => {
  try {
    if (!multiBotManager || !multiBotManager.initialized) {
      return res.status(503).json({ error: 'Multi-bot manager not initialized' });
    }

    const report = await multiBotManager.generateEndOfDayReport();
    res.json(report);
  } catch (error) {
    console.error('Error generating end-of-day report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get historical reports
app.get('/api/multi-bot/reports', async (req, res) => {
  try {
    const { type = 'end_of_day', limit = 10 } = req.query;
    
    const reports = await databaseManager.query(`
      SELECT 
        report_id,
        report_date,
        report_type,
        total_bots,
        active_bots,
        total_capital,
        total_pnl,
        created_at
      FROM paper_bot_reports 
      WHERE report_type = $1
      ORDER BY report_date DESC 
      LIMIT $2
    `, [type, limit]);

    res.json(reports.rows);
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ error: error.message });
  }
});

// Rebalance allocations based on performance
app.post('/api/multi-bot/rebalance', async (req, res) => {
  try {
    if (!multiBotManager || !multiBotManager.initialized) {
      return res.status(503).json({ error: 'Multi-bot manager not initialized' });
    }

    const { strategy = 'equal' } = req.body; // 'equal', 'performance-weighted', 'risk-adjusted'

    // Get current performance
    const dashboard = await multiBotManager.getPerformanceDashboard();
    let newAllocations = {};

    switch (strategy) {
      case 'equal':
        // Equal allocation
        const equalPercent = 1.0 / dashboard.bots.length;
        dashboard.bots.forEach(bot => {
          newAllocations[bot.botId] = equalPercent;
        });
        break;

      case 'performance-weighted':
        // Weight by positive performance
        const totalPosPerf = dashboard.bots
          .filter(bot => bot.totalPnL > 0)
          .reduce((sum, bot) => sum + bot.totalPnL, 0);
        
        if (totalPosPerf > 0) {
          dashboard.bots.forEach(bot => {
            if (bot.totalPnL > 0) {
              newAllocations[bot.botId] = (bot.totalPnL / totalPosPerf) * 0.8 + 0.2 / dashboard.bots.length;
            } else {
              newAllocations[bot.botId] = 0.2 / dashboard.bots.length;
            }
          });
        } else {
          // Fallback to equal if no positive performance
          const fallbackPercent = 1.0 / dashboard.bots.length;
          dashboard.bots.forEach(bot => {
            newAllocations[bot.botId] = fallbackPercent;
          });
        }
        break;

      default:
        return res.status(400).json({ error: 'Invalid rebalancing strategy' });
    }

    const result = await multiBotManager.updateAllocations(newAllocations);
    
    res.json({
      success: true,
      strategy: strategy,
      newAllocations: newAllocations,
      result: result
    });

  } catch (error) {
    console.error('Error rebalancing allocations:', error);
    res.status(500).json({ error: error.message });
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('📡 Frontend client connected to paper trading updates');
  
  // Send initial connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to paper trading service'
  }));

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 WebSocket message from frontend:', data.type);

      // Handle subscription requests
      if (data.type === 'subscribe') {
        // Subscribe to specific bot updates
        if (data.botId) {
          ws.botSubscriptions = ws.botSubscriptions || new Set();
          ws.botSubscriptions.add(data.botId);
          console.log(`📡 Client subscribed to bot ${data.botId} updates`);
        }
      }
    } catch (error) {
      console.error('❌ Error handling WebSocket message:', error);
    }
  });

  ws.on('close', () => {
    console.log('📡 Frontend client disconnected from paper trading updates');
  });

  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// Scheduled tasks

// Market open check (9:25 AM ET) - Prepare for trading day
cron.schedule('25 9 * * 1-5', async () => {
  console.log('🌅 Market opening soon - preparing paper trading bots...');
  if (paperTradingBot) {
    await paperTradingBot.prepareForMarketOpen();
  }
}, {
  timezone: "America/New_York"
});

// Market close check (4:05 PM ET) - End of day processing
cron.schedule('5 16 * * 1-5', async () => {
  console.log('🌅 Market closed - end of day processing...');
  if (paperTradingBot) {
    await paperTradingBot.handleMarketClose();
  }
}, {
  timezone: "America/New_York"
});

// Performance calculation (every 15 minutes during market hours)
cron.schedule('*/15 9-16 * * 1-5', async () => {
  if (paperTradingBot) {
    await paperTradingBot.updatePerformanceMetrics();
  }
}, {
  timezone: "America/New_York"
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down Paper Trading Service...');
  
  if (paperTradingBot) {
    await paperTradingBot.shutdown();
  }
  
  if (busClient) {
    busClient.disconnect();
  }
  
  if (databaseManager) {
    await databaseManager.close();
  }

  server.close(() => {
    console.log('✅ Paper Trading Service shut down complete');
    process.exit(0);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`🚀 Paper Trading Service running on port ${PORT}`);
  initializeServices();
});

module.exports = app;