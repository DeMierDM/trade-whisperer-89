/**
 * PaperTradingBot - Main orchestrator for live paper trading
 * Manages strategy instances, signal generation, and trade execution
 */

const EventEmitter = require('eventemitter3');
const moment = require('moment-timezone');

class PaperTradingBot extends EventEmitter {
  constructor(components) {
    super();
    
    this.busClient = components.busClient;
    this.databaseManager = components.databaseManager;
    this.strategyManager = components.strategyManager;
    this.alpacaClient = components.alpacaClient;
    this.wsServer = components.wsServer;
    
    // Bot management
    this.activeBots = new Map();
    this.running = false;
    
    // Market data tracking
    this.marketData = new Map();
    this.lastProcessedData = new Map();
    
    console.log('🤖 [PaperTradingBot] Initialized main orchestrator');
  }

  /**
   * Initialize the paper trading bot system
   */
  async initialize() {
    try {
      console.log('🚀 [PaperTradingBot] Starting initialization...');
      
      // Set up market data handlers
      this.setupMarketDataHandlers();
      
      // Load existing active bots from database
      await this.loadActiveBots();
      
      // Set up periodic tasks
      this.setupPeriodicTasks();
      
      this.running = true;
      console.log('✅ [PaperTradingBot] Initialization complete');
      
    } catch (error) {
      console.error('❌ [PaperTradingBot] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Set up market data event handlers for real-time processing
   */
  setupMarketDataHandlers() {
    // Context7: Listen for real-time stock and options data
    this.busClient.on('stock_quote', (data) => {
      this.handleStockQuote(data);
    });
    
    this.busClient.on('stock_trade', (data) => {
      this.handleStockTrade(data);
    });
    
    this.busClient.on('option_quote', (data) => {
      this.handleOptionQuote(data);
    });
    
    this.busClient.on('realtime_bar', (data) => {
      this.handleRealtimeBar(data);
    });
    
    console.log('📡 [PaperTradingBot] Real-time market data handlers configured');
  }

  /**
   * Context7: Handle real-time stock quotes
   */
  handleStockQuote(data) {
    try {
      const { symbol, bid, ask, mid, timestamp } = data;
      
      // Update market data store
      if (!this.marketData.has(symbol)) {
        this.marketData.set(symbol, {
          quotes: [],
          trades: [],
          lastPrice: mid,
          currentBid: bid,
          currentAsk: ask,
          lastUpdate: Date.now(),
          optionsQuotes: new Map()
        });
      }
      
      const symbolData = this.marketData.get(symbol);
      symbolData.lastPrice = mid;
      symbolData.currentBid = bid;
      symbolData.currentAsk = ask;
      symbolData.lastUpdate = Date.now();
      
      // Process quote for active bots immediately (Context7 pattern)
      this.processQuoteForBots(symbol, data);
      
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error handling stock quote:', error);
    }
  }

  /**
   * Context7: Handle real-time stock trades
   */
  handleStockTrade(data) {
    try {
      const { symbol, price, volume, timestamp } = data;
      
      // Update market data store
      if (!this.marketData.has(symbol)) {
        this.marketData.set(symbol, {
          quotes: [],
          trades: [],
          lastPrice: price,
          lastUpdate: Date.now(),
          optionsQuotes: new Map()
        });
      }
      
      const symbolData = this.marketData.get(symbol);
      symbolData.lastPrice = price;
      symbolData.lastUpdate = Date.now();
      
      // Process trade for active bots immediately (Context7 - no waiting)
      this.processTradeForBots(symbol, data);
      
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error handling stock trade:', error);
    }
  }

  /**
   * Context7: Handle real-time options quotes with proper bid/ask semantics
   */
  handleOptionQuote(data) {
    try {
      const { symbol, bid, ask, mid, timestamp } = data;
      
      // Extract underlying symbol (e.g., SPY251111C00680000 -> SPY)
      const underlyingSymbol = symbol.match(/^[A-Z]+/)[0];
      
      if (!this.marketData.has(underlyingSymbol)) {
        this.marketData.set(underlyingSymbol, {
          quotes: [],
          trades: [],
          lastPrice: null,
          lastUpdate: Date.now(),
          optionsQuotes: new Map()
        });
      }
      
      const symbolData = this.marketData.get(underlyingSymbol);
      
      // Store options quotes with proper bid/ask semantics
      symbolData.optionsQuotes.set(symbol, {
        bid: bid,      // Price you can SELL the option at
        ask: ask,      // Price you can BUY the option at
        mid: mid,
        timestamp: timestamp,
        lastUpdate: Date.now()
      });
      
      // Process options data for active bots
      this.processOptionsForBots(underlyingSymbol, symbol, data);
      
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error handling option quote:', error);
    }
  }

  /**
   * Context7: Handle real-time bar updates
   */
  handleRealtimeBar(data) {
    try {
      const { symbol, bar } = data;
      
      // Process bar updates for active bots (real-time indicator updates)
      this.processBarForBots(symbol, bar);
      
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error handling realtime bar:', error);
    }
  }

  /**
   * Context7: Process quotes immediately for active bots
   */
  async processQuoteForBots(symbol, quoteData) {
    const activeBots = Array.from(this.activeBots.values())
      .filter(bot => bot.symbol === symbol && bot.status === 'running');
      
    for (const bot of activeBots) {
      try {
        await this.updateBotWithQuote(bot, quoteData);
      } catch (error) {
        console.error(`❌ [PaperTradingBot] Error processing quote for bot ${bot.bot_id}:`, error);
      }
    }
  }

  /**
   * Context7: Process trades immediately for active bots
   */
  async processTradeForBots(symbol, tradeData) {
    const activeBots = Array.from(this.activeBots.values())
      .filter(bot => bot.symbol === symbol && bot.status === 'running');
      
    for (const bot of activeBots) {
      try {
        await this.updateBotWithTrade(bot, tradeData);
      } catch (error) {
        console.error(`❌ [PaperTradingBot] Error processing trade for bot ${bot.bot_id}:`, error);
      }
    }
  }

  /**
   * Context7: Process options data for bots that need options information
   */
  async processOptionsForBots(underlyingSymbol, optionSymbol, optionsData) {
    const activeBots = Array.from(this.activeBots.values())
      .filter(bot => bot.symbol === underlyingSymbol && bot.status === 'running');
      
    for (const bot of activeBots) {
      try {
        await this.updateBotWithOptions(bot, optionSymbol, optionsData);
      } catch (error) {
        console.error(`❌ [PaperTradingBot] Error processing options for bot ${bot.bot_id}:`, error);
      }
    }
  }

  /**
   * Context7: Process real-time bar updates for indicator calculations
   */
  async processBarForBots(symbol, barData) {
    const activeBots = Array.from(this.activeBots.values())
      .filter(bot => bot.symbol === symbol && bot.status === 'running');
      
    for (const bot of activeBots) {
      try {
        await this.updateBotWithBar(bot, barData);
      } catch (error) {
        console.error(`❌ [PaperTradingBot] Error processing bar for bot ${bot.bot_id}:`, error);
      }
    }
  }

  /**
   * Context7: Update bot with real-time quote data
   */
  async updateBotWithQuote(bot, quoteData) {
    try {
      if (!await this.isMarketOpen()) return;
      
      const strategy = bot.strategyInstance;
      if (!strategy) return;
      
      // Context7: Pass real-time quote to strategy for immediate processing
      if (strategy.processQuote) {
        await strategy.processQuote(quoteData);
      }
      
      // Update bot's current market state
      bot.lastQuote = quoteData;
      bot.lastUpdate = Date.now();
      
    } catch (error) {
      console.error(`❌ [PaperTradingBot] Error updating bot ${bot.bot_id} with quote:`, error);
    }
  }

  /**
   * Context7: Update bot with real-time trade data and generate signals immediately
   */
  async updateBotWithTrade(bot, tradeData) {
    try {
      if (!await this.isMarketOpen()) return;
      
      const strategy = bot.strategyInstance;
      if (!strategy) return;
      
      // Get real-time bars from BusClient (Context7 pattern)
      const bars = this.busClient.getRealtimeBars(bot.symbol, 50);
      
      if (bars.length < 5) return; // Need minimum bars for analysis
      
      // Context7: Process trade and generate signals immediately
      if (strategy.processTrade) {
        await strategy.processTrade(tradeData, bars);
      }
      
      // Generate signals using real-time data (Context7)
      const signals = strategy.generateSignals(bars);
      
      if (signals && signals.length > 0) {
        console.log(`🎯 [PaperTradingBot] Bot ${bot.bot_id} generated ${signals.length} REAL-TIME signals`);
        
        for (const signal of signals) {
          await this.handleSignal(bot, signal);
        }
      }
      
      // Update bot state
      bot.lastTrade = tradeData;
      bot.lastUpdate = Date.now();
      
    } catch (error) {
      console.error(`❌ [PaperTradingBot] Error updating bot ${bot.bot_id} with trade:`, error);
    }
  }

  /**
   * Context7: Update bot with options data for options strategies
   */
  async updateBotWithOptions(bot, optionSymbol, optionsData) {
    try {
      if (!await this.isMarketOpen()) return;
      
      const strategy = bot.strategyInstance;
      if (!strategy) return;
      
      // Context7: Pass options data to strategy for Greeks calculation
      if (strategy.processOptionsData) {
        await strategy.processOptionsData(optionSymbol, optionsData);
      }
      
      // Store options data for bot
      if (!bot.optionsData) bot.optionsData = new Map();
      
      bot.optionsData.set(optionSymbol, {
        bid: optionsData.bid,    // Price you can SELL at
        ask: optionsData.ask,    // Price you can BUY at
        mid: optionsData.mid,
        timestamp: optionsData.timestamp,
        lastUpdate: Date.now()
      });
      
    } catch (error) {
      console.error(`❌ [PaperTradingBot] Error updating bot ${bot.bot_id} with options:`, error);
    }
  }

  /**
   * Context7: Update bot with real-time bar data for indicator calculations
   */
  async updateBotWithBar(bot, barData) {
    try {
      if (!await this.isMarketOpen()) return;
      
      const strategy = bot.strategyInstance;
      if (!strategy) return;
      
      // Context7: Update indicators immediately with new bar data
      if (strategy.updateIndicators) {
        await strategy.updateIndicators(barData);
      }
      
      // Update bot's bar history
      if (!bot.barHistory) bot.barHistory = [];
      bot.barHistory.push(barData);
      
      // Keep only last 300 bars (5 hours)
      if (bot.barHistory.length > 300) {
        bot.barHistory = bot.barHistory.slice(-300);
      }
      
    } catch (error) {
      console.error(`❌ [PaperTradingBot] Error updating bot ${bot.bot_id} with bar:`, error);
    }
  }

  /**
   * Legacy: Process signals for a specific bot (kept for compatibility)
   */
  async processBotSignals(bot, tradeData) {
    try {
      // Check if market is open
      const isMarketOpen = await this.isMarketOpen();
      if (!isMarketOpen) return;
      
      // Get strategy instance
      const strategy = bot.strategyInstance;
      if (!strategy) return;
      
      // Convert trade data to bar format for strategy processing
      const symbolData = this.marketData.get(bot.symbol);
      if (!symbolData || symbolData.trades.length === 0) return;
      
      // Create bars from recent trade data (last 5 minutes)
      const recentTrades = symbolData.trades.slice(-60); // Last 60 trades for bar formation
      
      if (recentTrades.length < 5) return; // Need minimum trades for analysis
      
      // Convert trades to OHLCV bars (simplified 1-minute bars)
      const bars = this.convertTradesToBars(recentTrades);
      
      // Generate signals using strategy
      const signals = strategy.generateSignals(bars);
      
      if (signals && signals.length > 0) {
        console.log(`🎯 [PaperTradingBot] Bot ${bot.bot_id} generated ${signals.length} signals from ${bars.length} bars`);
        
        for (const signal of signals) {
          await this.handleSignal(bot, signal);
        }
      }
      
    } catch (error) {
      console.error(`❌ [PaperTradingBot] Error processing signals for bot ${bot.bot_id}:`, error);
    }
  }

  /**
   * Handle a trading signal
   */
  async handleSignal(bot, signal) {
    try {
      console.log(`📢 [PaperTradingBot] Processing ${signal.signal_type} signal for bot ${bot.bot_id}`);
      
      // Record signal in database
      const signalId = await this.databaseManager.recordSignal({
        botId: bot.bot_id,
        symbol: signal.symbol || bot.symbol,
        signalType: signal.signal_type,
        signalStrength: signal.signal_strength,
        underlyingPrice: signal.underlying_price,
        signalReason: signal.signal_reason,
        targetDelta: signal.target_delta,
        rsiValue: signal.rsi_value,
        vwapValue: signal.vwap_value,
        timestamp: signal.signal_timestamp
      });

      // Check if bot can open new position
      const canOpen = await this.canOpenPosition(bot);
      if (!canOpen.allowed) {
        console.log(`⚠️ [PaperTradingBot] Cannot open position: ${canOpen.reason}`);
        return;
      }

      // Execute trade
      const tradeResult = await this.alpacaClient.executeSignal(signal, 1);
      
      // Record position in database
      const positionId = await this.databaseManager.openPosition({
        botId: bot.bot_id,
        signalId: signalId,
        symbol: bot.symbol,
        optionSymbol: tradeResult.optionSymbol,
        positionType: signal.signal_type,
        quantity: tradeResult.quantity,
        entryPrice: tradeResult.entryPrice,
        entryTime: new Date(),
        targetDelta: signal.target_delta
      });

      // Update bot state
      bot.activePositions = (bot.activePositions || 0) + 1;
      bot.lastSignalTime = new Date();

      // Broadcast to WebSocket clients
      this.broadcastUpdate('position_opened', {
        botId: bot.bot_id,
        positionId: positionId,
        signal: signal,
        tradeResult: tradeResult
      });

      console.log(`✅ [PaperTradingBot] Position opened: ${tradeResult.optionSymbol} for bot ${bot.bot_id}`);
      
    } catch (error) {
      console.error(`❌ [PaperTradingBot] Error handling signal:`, error);
      
      // Broadcast error
      this.broadcastUpdate('signal_error', {
        botId: bot.bot_id,
        error: error.message,
        signal: signal
      });
    }
  }

  /**
   * Check if bot can open new position
   */
  async canOpenPosition(bot) {
    try {
      // Get current positions
      const openPositions = await this.databaseManager.getBotPositions(bot.bot_id, 'open');
      
      // Check position limits
      const maxPositions = bot.parameters?.maxPositions || 3;
      if (openPositions.length >= maxPositions) {
        return { 
          allowed: false, 
          reason: `Maximum positions reached (${maxPositions})` 
        };
      }

      // Check account buying power
      const account = await this.alpacaClient.getAccount();
      const minBuyingPower = bot.parameters?.minBuyingPower || 1000;
      
      if (account.buying_power < minBuyingPower) {
        return { 
          allowed: false, 
          reason: `Insufficient buying power: $${account.buying_power}` 
        };
      }

      // Check daily trade limit
      const today = new Date().toISOString().split('T')[0];
      const todayTrades = openPositions.filter(pos => 
        pos.entry_time.toISOString().split('T')[0] === today
      );
      
      const maxDailyTrades = bot.parameters?.maxDailyTrades || 5;
      if (todayTrades.length >= maxDailyTrades) {
        return { 
          allowed: false, 
          reason: `Daily trade limit reached (${maxDailyTrades})` 
        };
      }

      return { allowed: true };
      
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error checking position limits:', error);
      return { allowed: false, reason: 'Error checking limits' };
    }
  }

  /**
   * Create a new bot
   */
  async createBot(botConfig) {
    try {
      console.log(`🆕 [PaperTradingBot] Creating bot: ${botConfig.name}`);
      
      // Validate strategy
      const validation = this.strategyManager.validateStrategyParameters(
        botConfig.strategyName, 
        botConfig.parameters
      );
      
      if (!validation.valid) {
        throw new Error(`Invalid parameters: ${validation.errors.join(', ')}`);
      }

      // Create bot in database
      const botId = await this.databaseManager.createBot(botConfig);
      
      console.log(`✅ [PaperTradingBot] Bot created with ID: ${botId}`);
      
      return botId;
      
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error creating bot:', error);
      throw error;
    }
  }

  /**
   * Start a bot
   */
  async startBot(botId) {
    try {
      console.log(`▶️ [PaperTradingBot] Starting bot: ${botId}`);
      
      // Get bot from database
      const botData = await this.databaseManager.getBotById(botId);
      if (!botData) {
        throw new Error(`Bot not found: ${botId}`);
      }

      // Create strategy instance
      const strategyInfo = this.strategyManager.createStrategyInstance(
        botData.strategy_name,
        botData.parameters
      );

      // Add to active bots
      const bot = {
        ...botData,
        strategyInstance: strategyInfo.instance,
        strategyInstanceId: strategyInfo.instanceId,
        activePositions: 0,
        lastSignalTime: null,
        status: 'running'
      };
      
      this.activeBots.set(botId, bot);

      // Subscribe to symbol data
      this.busClient.subscribeToSymbols([botData.symbol]);

      // Update status in database
      await this.databaseManager.updateBotStatus(botId, 'running');

      // Broadcast update
      this.broadcastUpdate('bot_started', { botId, bot: bot });

      console.log(`✅ [PaperTradingBot] Bot ${botId} started for symbol ${botData.symbol}`);
      
    } catch (error) {
      console.error(`❌ [PaperTradingBot] Error starting bot ${botId}:`, error);
      throw error;
    }
  }

  /**
   * Stop a bot
   */
  async stopBot(botId) {
    try {
      console.log(`⏹️ [PaperTradingBot] Stopping bot: ${botId}`);
      
      const bot = this.activeBots.get(botId);
      if (!bot) {
        throw new Error(`Active bot not found: ${botId}`);
      }

      // Remove strategy instance
      if (bot.strategyInstanceId) {
        this.strategyManager.removeStrategyInstance(bot.strategyInstanceId);
      }

      // Remove from active bots
      this.activeBots.delete(botId);

      // Update status in database
      await this.databaseManager.updateBotStatus(botId, 'stopped');

      // Broadcast update
      this.broadcastUpdate('bot_stopped', { botId });

      console.log(`✅ [PaperTradingBot] Bot ${botId} stopped`);
      
    } catch (error) {
      console.error(`❌ [PaperTradingBot] Error stopping bot ${botId}:`, error);
      throw error;
    }
  }

  /**
   * Load existing active bots from database
   */
  async loadActiveBots() {
    try {
      const bots = await this.databaseManager.getActiveBots();
      const runningBots = bots.filter(bot => bot.status === 'running');
      
      console.log(`🔄 [PaperTradingBot] Loading ${runningBots.length} active bots`);
      
      for (const botData of runningBots) {
        try {
          await this.startBot(botData.bot_id);
        } catch (error) {
          console.error(`❌ [PaperTradingBot] Failed to load bot ${botData.bot_id}:`, error);
        }
      }
      
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error loading active bots:', error);
    }
  }

  /**
   * Setup periodic tasks
   */
  setupPeriodicTasks() {
    // Position monitoring (every 30 seconds)
    this.positionMonitorInterval = setInterval(() => {
      this.monitorPositions();
    }, 30000);
    
    // Performance updates (every 5 minutes)
    this.performanceUpdateInterval = setInterval(() => {
      this.updatePerformanceMetrics();
    }, 300000);
    
    // Context7: Real-time PnL updates (every 5 seconds)
    this.pnlUpdateInterval = setInterval(() => {
      this.updateRealtimePnL();
    }, 5000);
    
    console.log('⏰ [PaperTradingBot] Periodic tasks scheduled (position monitoring, performance, real-time PnL)');
  }

  /**
   * Monitor open positions for exit conditions
   */
  async monitorPositions() {
    for (const bot of this.activeBots.values()) {
      try {
        const openPositions = await this.databaseManager.getBotPositions(bot.bot_id, 'open');
        
        for (const position of openPositions) {
          const shouldExit = await this.checkExitConditions(bot, position);
          if (shouldExit.exit) {
            await this.closePosition(position.position_id, shouldExit.reason);
          }
        }
      } catch (error) {
        console.error(`❌ [PaperTradingBot] Error monitoring positions for bot ${bot.bot_id}:`, error);
      }
    }
  }

  /**
   * Context7: Check exit conditions using real-time options data
   */
  async checkExitConditions(bot, position) {
    try {
      // Context7: Use real-time options data instead of API call
      let currentPrice = null;
      
      if (position.option_symbol) {
        // Get real-time option quote (bid = sell price for options)
        const optionQuote = this.busClient.getCurrentOptionQuote(position.option_symbol);
        if (optionQuote) {
          // For selling positions, use bid (price you can sell at)
          // For buying positions, use ask (price you'd pay to close by buying back)
          currentPrice = position.quantity > 0 ? optionQuote.bid : optionQuote.ask;
        }
      }
      
      if (!currentPrice) {
        console.log(`⚠️ [PaperTradingBot] No real-time price for ${position.option_symbol}`);
        return { exit: false };
      }

      const entryPrice = parseFloat(position.entry_price);
      const pnl = (currentPrice - entryPrice) * position.quantity;
      const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
      
      // Update position with real-time PnL
      position.currentPrice = currentPrice;
      position.unrealizedPnL = pnl;
      position.pnlPercent = pnlPercent;

      // Profit target (default 50%)
      const profitTarget = bot.parameters?.profitTarget || 50;
      if (pnlPercent >= profitTarget) {
        return { exit: true, reason: `Profit target reached: ${pnlPercent.toFixed(2)}%` };
      }

      // Stop loss (default -50%)
      const stopLoss = bot.parameters?.stopLoss || -50;
      if (pnlPercent <= stopLoss) {
        return { exit: true, reason: `Stop loss hit: ${pnlPercent.toFixed(2)}%` };
      }

      // Time-based exit (close before expiry)
      const entryTime = new Date(position.entry_time);
      const hoursHeld = (Date.now() - entryTime.getTime()) / (1000 * 60 * 60);
      const maxHoldTime = bot.parameters?.maxHoldHours || 24;
      
      if (hoursHeld >= maxHoldTime) {
        return { exit: true, reason: `Max hold time reached: ${hoursHeld.toFixed(1)}h` };
      }

      // Market close exit (3:50 PM ET for 0DTE)
      const now = moment().tz('America/New_York');
      const marketClose = moment().tz('America/New_York').hour(15).minute(50);
      
      if (now.isAfter(marketClose) && this.isToday0DTE(position.option_symbol)) {
        return { exit: true, reason: 'Market close - 0DTE position' };
      }

      return { exit: false };
      
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error checking exit conditions:', error);
      return { exit: false };
    }
  }

  /**
   * Close a position
   */
  async closePosition(positionId, reason) {
    try {
      // Get position details
      const positions = await this.databaseManager.getBotPositions(null);
      const position = positions.find(p => p.position_id === positionId);
      
      if (!position) {
        throw new Error(`Position not found: ${positionId}`);
      }

      // Close position with Alpaca
      const closeResult = await this.alpacaClient.closePosition(
        position.option_symbol, 
        reason
      );

      // Update database
      await this.databaseManager.closePosition(positionId, null, reason);

      // Update bot active positions count
      const bot = this.activeBots.get(position.bot_id);
      if (bot) {
        bot.activePositions = Math.max(0, (bot.activePositions || 1) - 1);
      }

      // Broadcast update
      this.broadcastUpdate('position_closed', {
        positionId,
        reason,
        closeResult
      });

      console.log(`✅ [PaperTradingBot] Position ${positionId} closed: ${reason}`);
      
    } catch (error) {
      console.error(`❌ [PaperTradingBot] Error closing position ${positionId}:`, error);
    }
  }

  /**
   * Update performance metrics for all bots
   */
  async updatePerformanceMetrics() {
    try {
      for (const botId of this.activeBots.keys()) {
        await this.databaseManager.updateBotMetrics(botId);
      }
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error updating performance metrics:', error);
    }
  }

  /**
   * Context7: Update real-time PnL for all active positions using live options data
   */
  async updateRealtimePnL() {
    try {
      for (const bot of this.activeBots.values()) {
        if (bot.status !== 'running') continue;
        
        // Get active positions for this bot
        const activePositions = await this.databaseManager.getBotPositions(bot.bot_id, 'open');
        
        let totalPnL = 0;
        let totalValue = 0;
        
        for (const position of activePositions) {
          if (!position.option_symbol) continue;
          
          // Get real-time option quote
          const optionQuote = this.busClient.getCurrentOptionQuote(position.option_symbol);
          if (!optionQuote) continue;
          
          // Context7: Calculate PnL with proper bid/ask semantics
          const entryPrice = parseFloat(position.entry_price);
          let currentPrice;
          
          if (position.quantity > 0) {
            // Long position - use bid (price you can sell at)
            currentPrice = optionQuote.bid;
          } else {
            // Short position - use ask (price you'd pay to close)
            currentPrice = optionQuote.ask;
          }
          
          const pnl = (currentPrice - entryPrice) * Math.abs(position.quantity);
          const pnlPercent = ((currentPrice - entryPrice) / entryPrice) * 100;
          
          totalPnL += pnl;
          totalValue += entryPrice * Math.abs(position.quantity);
          
          // Update position with real-time data
          position.currentPrice = currentPrice;
          position.unrealizedPnL = pnl;
          position.pnlPercent = pnlPercent;
          position.lastPnLUpdate = Date.now();
        }
        
        // Update bot's total PnL
        bot.totalUnrealizedPnL = totalPnL;
        bot.totalPositionValue = totalValue;
        bot.portfolioPnLPercent = totalValue > 0 ? (totalPnL / totalValue) * 100 : 0;
        bot.lastPnLUpdate = Date.now();
        
        // Broadcast real-time PnL update
        this.broadcastUpdate('bot_pnl_update', {
          botId: bot.bot_id,
          totalPnL: totalPnL.toFixed(2),
          pnlPercent: bot.portfolioPnLPercent.toFixed(2),
          positionCount: activePositions.length,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error updating real-time PnL:', error);
    }
  }

  /**
   * Broadcast update to WebSocket clients
   */
  broadcastUpdate(type, data) {
    const message = JSON.stringify({
      type: type,
      timestamp: new Date().toISOString(),
      data: data
    });

    this.wsServer.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        // Check if client is subscribed to this bot
        if (!data.botId || !client.botSubscriptions || client.botSubscriptions.has(data.botId)) {
          client.send(message);
        }
      }
    });
  }

  /**
   * Prepare for market open
   */
  async prepareForMarketOpen() {
    console.log('🌅 [PaperTradingBot] Preparing for market open...');
    
    // Reset daily counters, check account status, etc.
    for (const bot of this.activeBots.values()) {
      if (bot.strategyInstance && bot.strategyInstance.resetStreaming) {
        bot.strategyInstance.resetStreaming();
      }
    }
  }

  /**
   * Handle market close
   */
  async handleMarketClose() {
    console.log('🌆 [PaperTradingBot] Market closed - end of day processing...');
    
    // Close 0DTE positions, update performance, etc.
    await this.updatePerformanceMetrics();
  }

  /**
   * Check if market is open
   */
  async isMarketOpen() {
    try {
      return await this.alpacaClient.isMarketOpen();
    } catch (error) {
      console.error('❌ [PaperTradingBot] Error checking market status:', error);
      return false;
    }
  }

  /**
   * Check if option is 0DTE (expires today)
   */
  isToday0DTE(optionSymbol) {
    // Parse option symbol to extract expiry date
    // This is a simplified check - real implementation would parse OCC format
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return optionSymbol.includes(today);
  }

  /**
   * Get system status
   */
  getStatus() {
    return {
      running: this.running,
      activeBots: this.activeBots.size,
      connectedClients: this.wsServer.clients.size,
      marketDataSymbols: this.marketData.size,
      lastUpdate: new Date()
    };
  }

  /**
   * Check if running
   */
  isRunning() {
    return this.running;
  }

  /**
   * Convert trade data to OHLCV bars for strategy analysis
   */
  convertTradesToBars(trades) {
    const bars = [];
    const barDuration = 60000; // 1-minute bars in milliseconds
    
    if (trades.length === 0) return bars;
    
    // Group trades by minute intervals
    const tradesByMinute = new Map();
    
    trades.forEach(trade => {
      const timestamp = new Date(trade.timestamp);
      const barTime = new Date(Math.floor(timestamp.getTime() / barDuration) * barDuration);
      const timeKey = barTime.getTime();
      
      if (!tradesByMinute.has(timeKey)) {
        tradesByMinute.set(timeKey, []);
      }
      
      tradesByMinute.get(timeKey).push({
        price: parseFloat(trade.price),
        size: parseFloat(trade.size || 1),
        timestamp: timestamp
      });
    });
    
    // Convert grouped trades to OHLCV bars
    for (const [barTime, minuteTrades] of tradesByMinute) {
      if (minuteTrades.length === 0) continue;
      
      const prices = minuteTrades.map(t => t.price);
      const volumes = minuteTrades.map(t => t.size);
      
      const bar = {
        t: new Date(barTime).toISOString(),
        o: prices[0], // Open: first trade price
        h: Math.max(...prices), // High: highest price  
        l: Math.min(...prices), // Low: lowest price
        c: prices[prices.length - 1], // Close: last trade price
        v: volumes.reduce((sum, vol) => sum + vol, 0), // Volume: sum of all trades
        // Legacy format support
        open: prices[0],
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: prices[prices.length - 1],
        volume: volumes.reduce((sum, vol) => sum + vol, 0),
        timestamp: new Date(barTime).toISOString()
      };
      
      bars.push(bar);
    }
    
    // Sort bars by timestamp
    bars.sort((a, b) => new Date(a.t) - new Date(b.t));
    
    console.log(`📊 [PaperTradingBot] Generated ${bars.length} bars from ${trades.length} trades`);
    
    return bars;
  }

  /**
   * Shutdown the paper trading bot
   */
  async shutdown() {
    console.log('🛑 [PaperTradingBot] Shutting down...');
    
    this.running = false;
    
    // Clear intervals
    if (this.positionMonitorInterval) {
      clearInterval(this.positionMonitorInterval);
    }
    if (this.performanceUpdateInterval) {
      clearInterval(this.performanceUpdateInterval);
    }
    
    // Stop all bots
    for (const botId of this.activeBots.keys()) {
      try {
        await this.stopBot(botId);
      } catch (error) {
        console.error(`❌ [PaperTradingBot] Error stopping bot ${botId}:`, error);
      }
    }
    
    console.log('✅ [PaperTradingBot] Shutdown complete');
  }
}

module.exports = PaperTradingBot;