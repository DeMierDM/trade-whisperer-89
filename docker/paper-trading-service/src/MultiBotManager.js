/**
 * Multi-Bot Allocation Manager
 * Manages fund distribution and coordination between multiple paper trading bots
 */

class MultiBotManager {
  constructor(databaseManager, alpacaClient, totalCapital = 30000) {
    this.databaseManager = databaseManager;
    this.alpacaClient = alpacaClient;
    this.totalCapital = totalCapital;
    this.bots = new Map(); // botId -> bot instance
    this.allocations = new Map(); // botId -> allocation percentage
    this.performance = new Map(); // botId -> performance metrics
    this.initialized = false;
  }

  /**
   * Initialize the multi-bot system with 3 default bots
   */
  async initialize() {
    console.log('🚀 [MULTI-BOT] Initializing multi-bot allocation system...');

    try {
      // Create or load bot configurations
      await this.setupDefaultBots();
      
      // Initialize performance tracking
      await this.initializePerformanceTracking();
      
      this.initialized = true;
      console.log('✅ [MULTI-BOT] Multi-bot system initialized successfully');
      
      return {
        success: true,
        totalCapital: this.totalCapital,
        botCount: this.bots.size,
        allocations: Object.fromEntries(this.allocations)
      };

    } catch (error) {
      console.error('❌ [MULTI-BOT] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Setup 3 default bots with different strategies and allocations
   */
  async setupDefaultBots() {
    const defaultBots = [
      {
        name: 'Conservative Bot',
        strategy_name: 'small-account-rsi-vwap',
        symbol: 'SPY',
        allocation: 0.4, // 40%
        parameters: {
          rsi_oversold: 35,
          rsi_overbought: 65,
          vwap_threshold: 0.001,
          profit_target: 0.15,
          stop_loss: 0.10
        },
        risk_level: 'conservative',
        max_positions: 3
      },
      {
        name: 'Moderate Bot',
        strategy_name: 'small-account-rsi-vwap',
        symbol: 'QQQ',
        allocation: 0.35, // 35%
        parameters: {
          rsi_oversold: 40,
          rsi_overbought: 60,
          vwap_threshold: 0.002,
          profit_target: 0.20,
          stop_loss: 0.12
        },
        risk_level: 'moderate',
        max_positions: 4
      },
      {
        name: 'Aggressive Bot',
        strategy_name: 'small-account-rsi-vwap',
        symbol: 'IWM',
        allocation: 0.25, // 25%
        parameters: {
          rsi_oversold: 45,
          rsi_overbought: 55,
          vwap_threshold: 0.003,
          profit_target: 0.30,
          stop_loss: 0.15
        },
        risk_level: 'aggressive',
        max_positions: 5
      }
    ];

    for (const botConfig of defaultBots) {
      await this.createOrUpdateBot(
        botConfig.name,
        botConfig.symbol,
        botConfig.strategy_name,
        botConfig.risk_level,
        botConfig.allocation * 100 // Convert to percentage
      );
    }
  }

  /**
   * Create or update a bot in the database
   */
  async createOrUpdateBot(name, symbol, strategyName, riskLevel, allocation) {
    try {
      console.log(`🤖 [MULTI-BOT] Creating/updating bot: ${name}`);

      // Get raw database connection for custom queries
      const client = await this.databaseManager.pool.connect();
      
      try {
        // Check if bot already exists
        const existingBot = await client.query(
          'SELECT * FROM paper_bots WHERE name = $1',
          [name]
        );

        let botId;
        
        if (existingBot.rows && existingBot.rows.length > 0) {
          // Update existing bot
          botId = existingBot.rows[0].id;
          
          await client.query(`
            UPDATE paper_bots 
            SET strategy_name = $1, symbol = $2, allocation_percent = $3, 
                risk_level = $4, last_heartbeat = NOW()
            WHERE id = $5
          `, [strategyName, symbol, allocation, riskLevel, botId]);
          
          console.log(`✅ [MULTI-BOT] Updated existing bot ${botId}: ${name}`);
        } else {
          // Create new bot
          const result = await client.query(`
            INSERT INTO paper_bots (
              name, strategy_name, symbol, allocation_percent, risk_level,
              initial_capital, current_capital, max_positions, status, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'stopped', NOW())
            RETURNING id
          `, [
            name, 
            strategyName, 
            symbol, 
            allocation,
            riskLevel,
            Math.floor(this.totalCapital * allocation / 100), // initial_capital
            Math.floor(this.totalCapital * allocation / 100), // current_capital
            10 // max_positions
          ]);

          botId = result.rows[0].id;
          console.log(`✅ [MULTI-BOT] Created new bot ${botId}: ${name}`);
        }

        return botId;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error(`❌ [MULTI-BOT] Error creating/updating bot ${name}:`, error);
      throw error;
    }
  }

  /**
   * Initialize performance tracking for all bots
   */
  async initializePerformanceTracking() {
    try {
      const bots = await this.databaseManager.query(
        'SELECT * FROM paper_bots ORDER BY id'
      );

      for (const bot of bots.rows) {
        this.performance.set(bot.id, {
          botId: bot.id,
          name: bot.name,
          symbol: bot.symbol,
          strategy: bot.strategy_name,
          initialCapital: parseFloat(bot.initial_capital),
          currentCapital: parseFloat(bot.current_capital),
          allocation: bot.allocation_percent / 100,
          riskLevel: bot.risk_level,
          status: bot.status,
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          totalPnL: 0,
          todayPnL: 0,
          winRate: 0,
          sharpeRatio: 0,
          maxDrawdown: 0,
          avgTradeReturn: 0,
          lastUpdated: new Date().toISOString()
        });

        console.log(`📊 [MULTI-BOT] Initialized performance tracking for ${bot.name}`);
      }

    } catch (error) {
      console.error('❌ [MULTI-BOT] Error initializing performance tracking:', error);
      throw error;
    }
  }

  /**
   * Start all bots
   */
  async startAllBots() {
    try {
      console.log('🚀 [MULTI-BOT] Starting all bots...');

      const bots = await this.getAllBots();
      const results = [];

      for (const bot of bots) {
        try {
          await this.databaseManager.query(`
            UPDATE paper_bots 
            SET status = $1, started_at = $2, last_heartbeat = NOW()
            WHERE id = $3
          `, ['running', new Date().toISOString(), bot.id]
          );

          results.push({
            botId: bot.id,
            name: bot.name,
            status: 'running',
            startedAt: new Date().toISOString()
          });

          console.log(`✅ [MULTI-BOT] Started ${bot.name} (ID: ${bot.id})`);
        } catch (error) {
          console.error(`❌ [MULTI-BOT] Failed to start ${bot.name}:`, error);
          results.push({
            botId: bot.id,
            name: bot.name,
            status: 'error',
            error: error.message
          });
        }
      }

      return results;

    } catch (error) {
      console.error('❌ [MULTI-BOT] Error starting bots:', error);
      throw error;
    }
  }

  /**
   * Stop all bots
   */
  async stopAllBots() {
    try {
      console.log('🛑 [MULTI-BOT] Stopping all bots...');

      await this.databaseManager.query(
        'UPDATE paper_bots SET status = $1, stopped_at = $2 WHERE status = $3',
        ['stopped', new Date().toISOString(), 'running']
      );

      console.log('✅ [MULTI-BOT] All bots stopped');

      return { success: true, message: 'All bots stopped successfully' };

    } catch (error) {
      console.error('❌ [MULTI-BOT] Error stopping bots:', error);
      throw error;
    }
  }

  /**
   * Get all bots with current status
   */
  async getAllBots() {
    try {
      const result = await this.databaseManager.query(`
        SELECT 
          id,
          name,
          strategy_name,
          symbol,
          parameters,
          current_capital,
          initial_capital,
          allocation_percent,
          risk_level,
          status,
          max_positions,
          created_at,
          started_at,
          stopped_at
        FROM paper_bots 
        ORDER BY id
      `);

      return result.rows;

    } catch (error) {
      console.error('❌ [MULTI-BOT] Error fetching bots:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive performance dashboard data
   */
  async getPerformanceDashboard() {
    try {
      const bots = await this.getAllBots();
      const botDetails = [];

      for (const bot of bots) {
        // Get basic performance for now (simplified for testing)
        const performance = {
          total_trades: 0,
          winning_trades: 0,
          losing_trades: 0,
          win_rate: 0,
          total_pnl: 0,
          avg_pnl: 0,
          best_trade: 0,
          worst_trade: 0,
          open_positions: 0
        };
        
        // Create bot details object
        botDetails.push({
          botId: bot.id,
          name: bot.name,
          symbol: bot.symbol,
          strategy: bot.strategy_name,
          status: bot.status,
          riskLevel: bot.risk_level || 'moderate',
          allocation: bot.allocation_percent || 0,
          initialCapital: bot.initial_capital || 0,
          currentCapital: bot.current_capital || bot.initial_capital || 0,
          capitalChange: (bot.current_capital || bot.initial_capital || 0) - (bot.initial_capital || 0),
          capitalChangePercent: bot.initial_capital > 0 
            ? (((bot.current_capital || bot.initial_capital) - bot.initial_capital) / bot.initial_capital) * 100 
            : 0,
          totalTrades: performance.total_trades,
          winningTrades: performance.winning_trades,
          losingTrades: performance.losing_trades,
          winRate: performance.win_rate,
          totalPnL: performance.total_pnl,
          avgTradeReturn: performance.avg_pnl,
          bestTrade: performance.best_trade,
          worstTrade: performance.worst_trade,
          todayTrades: 0,
          todayPnL: 0,
          openPositions: performance.open_positions,
          maxPositions: bot.max_positions || 10,
          recentTrades: [],
          createdAt: bot.created_at,
          startedAt: bot.started_at,
          lastUpdated: bot.last_heartbeat || new Date().toISOString()
        });
      }

      // Calculate summary
      const summary = {
        totalCapital: this.totalCapital,
        totalBots: botDetails.length,
        activeBots: botDetails.filter(b => b.status === 'running').length,
        totalAllocated: botDetails.reduce((sum, b) => sum + b.allocation, 0),
        totalPnL: botDetails.reduce((sum, b) => sum + b.totalPnL, 0),
        todayPnL: botDetails.reduce((sum, b) => sum + b.todayPnL, 0),
        overallWinRate: botDetails.length > 0 
          ? botDetails.reduce((sum, b) => sum + (b.winRate * b.totalTrades), 0) / botDetails.reduce((sum, b) => sum + b.totalTrades, 0) || 0
          : 0
      };

      return {
        summary,
        bots: botDetails
      };
    } catch (error) {
      console.error('❌ [MULTI-BOT] Error getting dashboard:', error);
      throw error;
    }
  }

  /**
   * Get detailed performance for a specific bot
   */
  async getBotDetailedPerformance(botId) {
    try {
      // Get bot info
      const botResult = await this.databaseManager.query(
        'SELECT * FROM paper_bots WHERE id = $1',
        [botId]
      );

      if (botResult.rows.length === 0) {
        throw new Error(`Bot ${botId} not found`);
      }

      const bot = botResult.rows[0];

      // Get trade statistics
      const tradesResult = await this.databaseManager.query(`
        SELECT 
          COUNT(*) as total_trades,
          SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as winning_trades,
          SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
          SUM(pnl) as total_pnl,
          AVG(pnl) as avg_pnl,
          MAX(pnl) as best_trade,
          MIN(pnl) as worst_trade
        FROM paper_trades 
        WHERE bot_id = $1
      `, [botId]);

      // Get today's performance
      const todayResult = await this.databaseManager.query(`
        SELECT 
          COUNT(*) as today_trades,
          SUM(pnl) as today_pnl
        FROM paper_trades 
        WHERE bot_id = $1 AND DATE(executed_at) = CURRENT_DATE
      `, [botId]);

      // Get current positions
      const positionsResult = await this.databaseManager.query(
        'SELECT COUNT(*) as open_positions FROM paper_positions WHERE bot_id = $1 AND status = $2',
        [botId, 'open']
      );

      // Get recent trades (last 5)
      const recentTradesResult = await this.databaseManager.query(`
        SELECT 
          trade_id,
          symbol,
          side,
          quantity,
          price,
          pnl,
          executed_at
        FROM paper_trades 
        WHERE bot_id = $1 
        ORDER BY executed_at DESC 
        LIMIT 5
      `, [botId]);

      const stats = tradesResult.rows[0];
      const todayStats = todayResult.rows[0];
      const positionStats = positionsResult.rows[0];

      return {
        botId: bot.id,
        name: bot.name,
        symbol: bot.symbol,
        strategy: bot.strategy_name,
        status: bot.status,
        riskLevel: bot.risk_level,
        allocation: bot.allocation_percent,
        
        // Capital metrics
        initialCapital: parseFloat(bot.initial_capital),
        currentCapital: parseFloat(bot.current_capital),
        capitalChange: parseFloat(bot.current_capital) - parseFloat(bot.initial_capital),
        capitalChangePercent: ((parseFloat(bot.current_capital) - parseFloat(bot.initial_capital)) / parseFloat(bot.initial_capital)) * 100,

        // Trade metrics
        totalTrades: parseInt(stats.total_trades) || 0,
        winningTrades: parseInt(stats.winning_trades) || 0,
        losingTrades: parseInt(stats.losing_trades) || 0,
        winRate: stats.total_trades > 0 ? (stats.winning_trades / stats.total_trades * 100) : 0,
        
        // P&L metrics
        totalPnL: parseFloat(stats.total_pnl) || 0,
        avgTradeReturn: parseFloat(stats.avg_pnl) || 0,
        bestTrade: parseFloat(stats.best_trade) || 0,
        worstTrade: parseFloat(stats.worst_trade) || 0,
        
        // Today's metrics
        todayTrades: parseInt(todayStats.today_trades) || 0,
        todayPnL: parseFloat(todayStats.today_pnl) || 0,
        
        // Position metrics
        openPositions: parseInt(positionStats.open_positions) || 0,
        maxPositions: bot.max_positions,
        
        // Recent activity
        recentTrades: recentTradesResult.rows,
        
        // Timestamps
        createdAt: bot.created_at,
        startedAt: bot.started_at,
        lastUpdated: new Date().toISOString()
      };

    } catch (error) {
      console.error(`❌ [MULTI-BOT] Error getting performance for bot ${botId}:`, error);
      throw error;
    }
  }

  /**
   * Update allocation percentages for all bots
   */
  async updateAllocations(allocations) {
    try {
      // Validate allocations sum to 100%
      const totalAllocation = Object.values(allocations).reduce((sum, alloc) => sum + alloc, 0);
      if (Math.abs(totalAllocation - 1.0) > 0.01) {
        throw new Error(`Allocations must sum to 100%, got ${totalAllocation * 100}%`);
      }

      console.log('📊 [MULTI-BOT] Updating bot allocations...');

      for (const [botIdStr, allocation] of Object.entries(allocations)) {
        const botId = parseInt(botIdStr);
        const newCapital = Math.floor(this.totalCapital * allocation);

        await this.databaseManager.query(`
          UPDATE paper_bots 
          SET current_capital = $1, initial_capital = $1, allocation_percent = $2
          WHERE bot_id = $3
        `, [newCapital, allocation * 100, botId]);

        this.allocations.set(botId, allocation);

        console.log(`📝 [MULTI-BOT] Updated Bot ${botId} allocation to ${allocation * 100}% ($${newCapital})`);
      }

      return { success: true, message: 'Allocations updated successfully' };

    } catch (error) {
      console.error('❌ [MULTI-BOT] Error updating allocations:', error);
      throw error;
    }
  }

  /**
   * Generate end-of-day performance report
   */
  async generateEndOfDayReport() {
    try {
      console.log('📈 [MULTI-BOT] Generating end-of-day performance report...');

      const dashboard = await this.getPerformanceDashboard();
      const today = new Date().toISOString().split('T')[0];

      const report = {
        reportDate: today,
        generatedAt: new Date().toISOString(),
        summary: dashboard.summary,
        botPerformances: dashboard.bots,
        
        // Rankings
        rankings: {
          bestPerformer: dashboard.bots.reduce((best, bot) => 
            bot.todayPnL > best.todayPnL ? bot : best
          ),
          worstPerformer: dashboard.bots.reduce((worst, bot) => 
            bot.todayPnL < worst.todayPnL ? bot : worst
          ),
          mostTrades: dashboard.bots.reduce((most, bot) => 
            bot.todayTrades > most.todayTrades ? bot : most
          ),
          bestWinRate: dashboard.bots.reduce((best, bot) => 
            bot.winRate > best.winRate ? bot : best
          )
        },
        
        // Key insights
        insights: this.generatePerformanceInsights(dashboard.bots)
      };

      // Store report in database
      await this.databaseManager.query(`
        INSERT INTO paper_bot_reports (
          report_date, report_type, report_data, created_at
        ) VALUES ($1, $2, $3, $4)
      `, [today, 'end_of_day', JSON.stringify(report), new Date().toISOString()]);

      return report;

    } catch (error) {
      console.error('❌ [MULTI-BOT] Error generating end-of-day report:', error);
      throw error;
    }
  }

  /**
   * Generate performance insights from bot data
   */
  generatePerformanceInsights(bots) {
    const insights = [];

    // Total performance
    const totalPnL = bots.reduce((sum, bot) => sum + bot.todayPnL, 0);
    insights.push({
      type: 'summary',
      message: `Total portfolio P&L today: $${totalPnL.toFixed(2)}`
    });

    // Risk analysis
    const conservativeBots = bots.filter(bot => bot.riskLevel === 'conservative');
    const aggressiveBots = bots.filter(bot => bot.riskLevel === 'aggressive');
    
    if (conservativeBots.length > 0 && aggressiveBots.length > 0) {
      const conservativePnL = conservativeBots.reduce((sum, bot) => sum + bot.todayPnL, 0);
      const aggressivePnL = aggressiveBots.reduce((sum, bot) => sum + bot.todayPnL, 0);
      
      insights.push({
        type: 'risk_analysis',
        message: `Conservative bots: $${conservativePnL.toFixed(2)}, Aggressive bots: $${aggressivePnL.toFixed(2)}`
      });
    }

    // Strategy performance
    const strategies = [...new Set(bots.map(bot => bot.strategy))];
    for (const strategy of strategies) {
      const strategyBots = bots.filter(bot => bot.strategy === strategy);
      const strategyPnL = strategyBots.reduce((sum, bot) => sum + bot.todayPnL, 0);
      
      insights.push({
        type: 'strategy',
        message: `${strategy}: $${strategyPnL.toFixed(2)} across ${strategyBots.length} bot(s)`
      });
    }

    return insights;
  }
}

module.exports = MultiBotManager;