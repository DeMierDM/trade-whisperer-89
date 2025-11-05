/**
 * SIGNAL API ENDPOINTS
 * Provides signal data for historical backtesting and real-time streaming
 * 
 * This module requires app, engine, and connectedClients to be available
 * It should be required after these are initialized in server.js
 */

module.exports = (app, engine, connectedClients) => {
  // Historical signals endpoint for backtesting visualization
  app.post('/api/signals/historical', async (req, res) => {
    try {
      const { symbol, startDate, endDate, strategies = [] } = req.body;
      
      if (!symbol || !startDate || !endDate) {
        return res.status(400).json({ 
          error: 'symbol, startDate, and endDate are required' 
        });
      }

      console.log(`🎯 [HISTORICAL SIGNALS] Fetching for ${symbol} from ${startDate} to ${endDate}`);

      // Query historical signals from database (if stored) or generate from backtest
      // For now, we'll return a sample response structure
      const signals = [];
      
      // TODO: Implement actual historical signal retrieval
      // This could involve running a quick backtest or querying stored signals
      
      res.json({
        success: true,
        signals: signals,
        metadata: {
          symbol,
          startDate,
          endDate,
          strategies: strategies.length > 0 ? strategies : ['all'],
          count: signals.length
        }
      });

    } catch (error) {
      console.error('❌ [HISTORICAL SIGNALS] Error:', error);
      res.status(500).json({ error: 'Failed to fetch historical signals' });
    }
  });

  // Real-time signal streaming status
  app.get('/api/signals/stream/status', (req, res) => {
    const connectedClientsCount = connectedClients.size;
    
    res.json({
      success: true,
      streaming: {
        enabled: true,
        connectedClients: connectedClientsCount,
        port: 3003,
        endpoint: 'ws://localhost:3003'
      },
      engine: {
        isRunning: engine.isRunning,
        strategiesLoaded: engine.strategies.size,
        activePositions: engine.activePositions.size
      }
    });
  });

  // Trigger manual signal emission for testing
  app.post('/api/signals/test/emit', (req, res) => {
    try {
      const { type = 'long', symbol = 'SPY', price = 400, strategy = 'TEST' } = req.body;
      
      const testSignal = {
        type,
        timestamp: Math.floor(Date.now() / 1000),
        price,
        confidence: 0.75,
        indicators: { rsi: 55, vwap: price * 0.99 }
      };
      
      const testStrategy = { name: strategy };
      const testMetadata = { symbol, timeframe: '1Min', reason: 'Manual test signal' };
      
      engine.emitSignal(testSignal, testStrategy, testMetadata);
      
      res.json({
        success: true,
        message: 'Test signal emitted',
        signal: testSignal,
        connectedClients: connectedClients.size
      });
      
    } catch (error) {
      console.error('❌ [TEST SIGNAL] Error:', error);
      res.status(500).json({ error: 'Failed to emit test signal' });
    }
  });

  console.log('🎯 [SIGNAL API] Signal endpoints registered');
};
