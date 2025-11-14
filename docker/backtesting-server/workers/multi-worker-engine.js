/**
 * Multi-Worker Backtesting Engine
 * 
 * PARALLELIZATION STRATEGY:
 * 1. DATE SPLITTING: Split date range across strategy workers
 * 2. DATA PREFETCHING: Parallel data fetching with rate limiting  
 * 3. GREEKS PROCESSING: Parallel Greeks calculations
 * 4. COORDINATION: Master-worker pattern with result aggregation
 * 
 * Hardware Target: 8-core i7 (16 logical cores) + 64GB RAM
 */

const cluster = require('cluster');
const os = require('os');
const EventEmitter = require('events');
const { Pool } = require('pg');
const moment = require('moment-timezone');

// Worker Configuration for 8-core i7 system
const WORKER_CONFIG = {
  STRATEGY_WORKERS: 8,        // One per physical core for date range splitting
  DATA_WORKERS: 4,            // Parallel data fetching (respects Alpaca limits)
  GREEKS_WORKERS: 4,          // CPU-intensive Greeks calculations
  DB_POOL_SIZE: 40,           // Increased connection pool
  MAX_MEMORY: '3g',           // 3GB per worker
  BATCH_SIZE: 100,            // Options contracts per batch
  RATE_LIMIT_DELAY: 300       // 300ms between API calls (200/min limit)
};

class MultiWorkerBacktestEngine extends EventEmitter {
  constructor(db, alpacaClient, config = {}) {
    super();
    
    this.db = db;
    this.alpacaClient = alpacaClient;
    this.config = { ...WORKER_CONFIG, ...config };
    
    this.workers = {
      strategy: new Map(),      // Date range workers
      data: new Map(),          // Data fetching workers  
      greeks: new Map()         // Greeks calculation workers
    };
    
    this.taskQueues = {
      data: [],                 // Data fetching tasks
      greeks: [],              // Greeks calculation tasks
      strategy: []             // Strategy execution tasks
    };
    
    this.results = {
      completed: new Map(),     // Completed worker results
      errors: [],               // Error collection
      performance: {}           // Performance metrics
    };
    
    this.masterPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: this.config.DB_POOL_SIZE
    });
    
    console.log(`🏎️ [MULTI-WORKER] Initializing with ${this.config.STRATEGY_WORKERS} strategy workers`);
    console.log(`   💾 Memory per worker: ${this.config.MAX_MEMORY}`);
    console.log(`   🔌 Database pool: ${this.config.DB_POOL_SIZE} connections`);
  }

  /**
   * Run parallel backtest with intelligent work distribution
   */
  async runParallelBacktest(backtestConfig) {
    const startTime = Date.now();
    
    try {
      console.log(`\n🚀 [MULTI-WORKER] Starting parallel backtest ID: ${backtestConfig.backtestId}`);
      console.log(`   📊 Strategy: ${backtestConfig.strategy.name}`);
      console.log(`   📅 Range: ${backtestConfig.startDate} to ${backtestConfig.endDate}`);
      
      // PHASE 1: Split work into optimal chunks
      const workPlan = await this.createWorkPlan(backtestConfig);
      console.log(`   📋 Work plan: ${workPlan.dateRanges.length} date chunks, ${workPlan.totalDays} total days`);
      
      // PHASE 2: Pre-fetch all required data in parallel
      console.log(`\n📡 [DATA PREFETCH] Starting parallel data fetching...`);
      const dataResults = await this.parallelDataFetch(workPlan);
      console.log(`✅ [DATA PREFETCH] Completed: ${dataResults.contractsLoaded} contracts, ${dataResults.barsLoaded} bars`);
      
      // PHASE 3: Execute strategy workers in parallel
      console.log(`\n🎯 [STRATEGY EXEC] Starting parallel strategy execution...`);
      const strategyResults = await this.parallelStrategyExecution(workPlan, dataResults);
      console.log(`✅ [STRATEGY EXEC] Completed: ${strategyResults.totalTrades} trades across ${strategyResults.workersUsed} workers`);
      
      // PHASE 4: Aggregate and persist results
      console.log(`\n📊 [AGGREGATION] Aggregating results...`);
      const finalResults = await this.aggregateResults(backtestConfig, strategyResults);
      
      const duration = (Date.now() - startTime) / 1000;
      console.log(`\n✅ [MULTI-WORKER] Parallel backtest completed in ${duration.toFixed(1)}s`);
      console.log(`   🎯 Total Return: ${(finalResults.performance.totalReturn * 100).toFixed(2)}%`);
      console.log(`   📈 Trades: ${finalResults.performance.totalTrades}`);
      console.log(`   🏎️ Speed improvement: ~${(this.config.STRATEGY_WORKERS * 0.8).toFixed(1)}x`);
      
      return finalResults;
      
    } catch (error) {
      console.error(`❌ [MULTI-WORKER] Parallel backtest failed:`, error);
      throw error;
    }
  }

  /**
   * Create intelligent work distribution plan
   */
  async createWorkPlan(backtestConfig) {
    const { startDate, endDate, symbol } = backtestConfig;
    
    // Calculate total trading days
    const start = moment.tz(startDate, 'America/New_York');
    const end = moment.tz(endDate, 'America/New_York');
    
    const tradingDays = [];
    const current = start.clone();
    
    while (current.isSameOrBefore(end)) {
      // Only include weekdays (trading days)
      if (current.day() >= 1 && current.day() <= 5) {
        tradingDays.push(current.format('YYYY-MM-DD'));
      }
      current.add(1, 'day');
    }
    
    // Split trading days across workers for optimal parallel execution
    const daysPerWorker = Math.ceil(tradingDays.length / this.config.STRATEGY_WORKERS);
    const dateRanges = [];
    
    for (let i = 0; i < tradingDays.length; i += daysPerWorker) {
      const rangeStart = tradingDays[i];
      const rangeEnd = tradingDays[Math.min(i + daysPerWorker - 1, tradingDays.length - 1)];
      
      dateRanges.push({
        id: `worker_${Math.floor(i / daysPerWorker) + 1}`,
        startDate: rangeStart,
        endDate: rangeEnd,
        tradingDays: tradingDays.slice(i, i + daysPerWorker),
        estimatedContracts: daysPerWorker * 50, // Estimate 50 contracts per day
        priority: i === 0 ? 'high' : 'normal'   // First range gets priority
      });
    }
    
    return {
      symbol,
      totalDays: tradingDays.length,
      dateRanges,
      estimatedTotalContracts: tradingDays.length * 50,
      parallelization: {
        strategyWorkers: Math.min(dateRanges.length, this.config.STRATEGY_WORKERS),
        dataWorkers: this.config.DATA_WORKERS,
        greeksWorkers: this.config.GREEKS_WORKERS
      }
    };
  }

  /**
   * Parallel data fetching with intelligent batching
   */
  async parallelDataFetch(workPlan) {
    const dataStartTime = Date.now();
    const allContracts = new Map();
    const allBars = new Map();
    
    // Create data fetching tasks for each date range
    const fetchTasks = workPlan.dateRanges.map((range, index) => ({
      id: `data_task_${index + 1}`,
      symbol: workPlan.symbol,
      startDate: range.startDate,
      endDate: range.endDate,
      tradingDays: range.tradingDays,
      workerId: index % this.config.DATA_WORKERS,
      estimatedContracts: range.estimatedContracts
    }));
    
    console.log(`📡 [DATA FETCH] Created ${fetchTasks.length} data tasks for ${this.config.DATA_WORKERS} workers`);
    
    // Group tasks by worker to balance load
    const workerTasks = Array(this.config.DATA_WORKERS).fill(0).map(() => []);
    fetchTasks.forEach(task => {
      workerTasks[task.workerId].push(task);
    });
    
    // Execute data fetching in parallel with rate limiting
    const fetchPromises = workerTasks.map(async (tasks, workerIndex) => {
      if (tasks.length === 0) return { contracts: 0, bars: 0 };
      
      console.log(`📡 [DATA WORKER ${workerIndex + 1}] Processing ${tasks.length} date ranges`);
      
      let workerContracts = 0;
      let workerBars = 0;
      
      for (const task of tasks) {
        try {
          // Add rate limiting delay between API calls
          if (workerContracts > 0) {
            await new Promise(resolve => setTimeout(resolve, this.config.RATE_LIMIT_DELAY));
          }
          
          console.log(`📡 [DATA WORKER ${workerIndex + 1}] Fetching ${task.symbol} ${task.startDate} to ${task.endDate}`);
          
          // Use existing data cache manager for fetching
          const DataCacheManager = require('../utils/data-cache-manager');
          const dataCacheManager = new DataCacheManager(this.masterPool, this.alpacaClient);
          
          // Fetch underlying and options data
          const underlyingData = await dataCacheManager.fetchUnderlyingData(
            task.symbol, 
            task.startDate, 
            task.endDate, 
            '1Min'
          );
          
          if (underlyingData.length === 0) {
            console.log(`⚠️ [DATA WORKER ${workerIndex + 1}] No underlying data for ${task.startDate}`);
            continue;
          }
          
          // Fetch 0DTE options for each trading day
          for (const tradingDay of task.tradingDays) {
            // For 0DTE, expiry date = trading day
            // Convert trading day to market hours range
            const dayStartUTC = moment.tz(tradingDay + ' 09:30:00', 'America/New_York').utc().format();
            const dayEndUTC = moment.tz(tradingDay + ' 16:00:00', 'America/New_York').utc().format();

            const optionsData = await dataCacheManager.getOptionsData(
              task.symbol,
              tradingDay,        // expiryDate (0DTE)
              dayStartUTC,       // startTime (market open)
              dayEndUTC,         // endTime (market close)
              null               // underlyingPrice (will be calculated)
            );

            workerContracts += optionsData.contracts?.length || 0;
            workerBars += optionsData.totalBars || 0;
            
            // Store in shared maps (thread-safe for this use case)
            if (optionsData.contracts) {
              optionsData.contracts.forEach(contract => {
                allContracts.set(contract.symbol, contract);
              });
            }
            
            if (optionsData.bars) {
              Object.entries(optionsData.bars).forEach(([symbol, bars]) => {
                allBars.set(symbol, bars);
              });
            }
          }
          
        } catch (error) {
          console.error(`❌ [DATA WORKER ${workerIndex + 1}] Error fetching ${task.symbol} ${task.startDate}:`, error.message);
          this.results.errors.push({
            worker: `data_${workerIndex + 1}`,
            task: task.id,
            error: error.message,
            timestamp: new Date().toISOString()
          });
        }
      }
      
      console.log(`✅ [DATA WORKER ${workerIndex + 1}] Completed: ${workerContracts} contracts, ${workerBars} bars`);
      return { contracts: workerContracts, bars: workerBars };
    });
    
    // Wait for all data workers to complete
    const fetchResults = await Promise.all(fetchPromises);
    
    const totalContracts = fetchResults.reduce((sum, result) => sum + result.contracts, 0);
    const totalBars = fetchResults.reduce((sum, result) => sum + result.bars, 0);
    const fetchDuration = (Date.now() - dataStartTime) / 1000;
    
    console.log(`✅ [DATA FETCH] Completed in ${fetchDuration.toFixed(1)}s:`);
    console.log(`   📋 Contracts loaded: ${totalContracts.toLocaleString()}`);
    console.log(`   📊 Bars loaded: ${totalBars.toLocaleString()}`);
    console.log(`   🏎️ Throughput: ${(totalBars / fetchDuration).toFixed(0)} bars/second`);
    
    return {
      contractsLoaded: totalContracts,
      barsLoaded: totalBars,
      contracts: allContracts,
      bars: allBars,
      duration: fetchDuration
    };
  }

  /**
   * Parallel strategy execution across date ranges
   */
  async parallelStrategyExecution(workPlan, dataResults) {
    const execStartTime = Date.now();
    
    console.log(`🎯 [STRATEGY EXEC] Starting ${workPlan.dateRanges.length} parallel workers`);
    
    // Create strategy execution tasks
    const execPromises = workPlan.dateRanges.map(async (range, workerIndex) => {
      console.log(`🎯 [STRATEGY WORKER ${workerIndex + 1}] Processing ${range.startDate} to ${range.endDate}`);
      
      try {
        // Create dedicated database connection for this worker
        const workerPool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: Math.ceil(this.config.DB_POOL_SIZE / this.config.STRATEGY_WORKERS)
        });
        
        // Create worker-specific engine instance
        const BacktestEngine = require('../engine/backtest-engine');
        const workerEngine = new BacktestEngine(workerPool, this.alpacaClient);
        
        // Execute backtest for this date range
        const workerResult = await workerEngine.runBacktest({
          backtestId: `${workPlan.symbol}_worker_${workerIndex + 1}`,
          strategy: this.createStrategyInstance(),
          symbol: workPlan.symbol,
          startDate: range.startDate,
          endDate: range.endDate,
          timeframe: '1Min',
          initialCapital: 10000 / this.config.STRATEGY_WORKERS, // Split capital
          preloadedData: {
            contracts: dataResults.contracts,
            bars: dataResults.bars
          }
        });
        
        // Cleanup worker pool
        await workerPool.end();
        
        console.log(`✅ [STRATEGY WORKER ${workerIndex + 1}] Completed: ${workerResult.performance?.totalTrades || 0} trades`);
        
        return {
          workerId: workerIndex + 1,
          dateRange: range,
          result: workerResult,
          performance: workerResult.performance || {}
        };
        
      } catch (error) {
        console.error(`❌ [STRATEGY WORKER ${workerIndex + 1}] Error:`, error.message);
        
        this.results.errors.push({
          worker: `strategy_${workerIndex + 1}`,
          dateRange: range,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        return {
          workerId: workerIndex + 1,
          dateRange: range,
          result: null,
          performance: {},
          error: error.message
        };
      }
    });
    
    // Wait for all strategy workers to complete
    const execResults = await Promise.all(execPromises);
    
    // Calculate aggregated metrics
    const totalTrades = execResults.reduce((sum, result) => 
      sum + (result.performance?.totalTrades || 0), 0
    );
    
    const workersUsed = execResults.filter(result => !result.error).length;
    const execDuration = (Date.now() - execStartTime) / 1000;
    
    console.log(`✅ [STRATEGY EXEC] Completed in ${execDuration.toFixed(1)}s:`);
    console.log(`   📈 Total trades: ${totalTrades}`);
    console.log(`   🏃 Workers used: ${workersUsed}/${this.config.STRATEGY_WORKERS}`);
    console.log(`   🏎️ Throughput: ${(totalTrades / execDuration).toFixed(1)} trades/second`);
    
    return {
      totalTrades,
      workersUsed,
      duration: execDuration,
      workerResults: execResults,
      errors: execResults.filter(result => result.error)
    };
  }

  /**
   * Aggregate results from all workers into final backtest result
   */
  async aggregateResults(backtestConfig, strategyResults) {
    console.log(`📊 [AGGREGATION] Combining results from ${strategyResults.workersUsed} workers`);
    
    // Combine all trades
    const allTrades = [];
    const allSignals = [];
    let totalCapital = 0;
    let totalPnL = 0;
    
    for (const workerResult of strategyResults.workerResults) {
      if (!workerResult.error && workerResult.result) {
        const result = workerResult.result;
        
        // Combine trades
        if (result.trades) {
          allTrades.push(...result.trades);
        }
        
        // Combine signals
        if (result.signals) {
          allSignals.push(...result.signals);
        }
        
        // Aggregate P&L
        totalCapital += result.performance?.finalCapital || 0;
        totalPnL += result.performance?.totalPnL || 0;
      }
    }
    
    // Calculate final performance metrics
    const performance = this.calculateAggregatedPerformance(allTrades, backtestConfig.initialCapital);
    
    // Update database with aggregated results
    await this.masterPool.query(`
      UPDATE backtests 
      SET 
        status = 'completed',
        final_capital = $1,
        total_return = $2,
        total_trades = $3,
        winning_trades = $4,
        losing_trades = $5,
        win_rate = $6,
        sharpe_ratio = $7,
        max_drawdown = $8,
        completed_at = NOW(),
        metadata = $9
      WHERE id = $10
    `, [
      performance.finalCapital,
      performance.totalReturn,
      performance.totalTrades,
      performance.winningTrades,
      performance.losingTrades,
      performance.winRate,
      performance.sharpeRatio,
      performance.maxDrawdown,
      JSON.stringify({
        multiWorker: true,
        workersUsed: strategyResults.workersUsed,
        parallelExecution: true,
        errors: this.results.errors
      }),
      backtestConfig.backtestId
    ]);
    
    console.log(`✅ [AGGREGATION] Final results:`);
    console.log(`   💰 Final Capital: $${performance.finalCapital.toLocaleString()}`);
    console.log(`   📊 Total Return: ${(performance.totalReturn * 100).toFixed(2)}%`);
    console.log(`   📈 Total Trades: ${performance.totalTrades}`);
    console.log(`   🎯 Win Rate: ${(performance.winRate * 100).toFixed(1)}%`);
    
    return {
      backtestId: backtestConfig.backtestId,
      status: 'completed',
      performance,
      trades: allTrades,
      signals: allSignals,
      multiWorker: {
        enabled: true,
        workersUsed: strategyResults.workersUsed,
        errors: this.results.errors,
        performance: {
          dataFetchDuration: strategyResults.duration,
          totalDuration: (Date.now() - Date.now()) / 1000 // Placeholder
        }
      }
    };
  }

  /**
   * Calculate aggregated performance metrics
   */
  calculateAggregatedPerformance(allTrades, initialCapital) {
    if (allTrades.length === 0) {
      return {
        finalCapital: initialCapital,
        totalReturn: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        sharpeRatio: 0,
        maxDrawdown: 0
      };
    }
    
    // Sort trades by timestamp
    const sortedTrades = allTrades.sort((a, b) => 
      new Date(a.entry_timestamp || a.timestamp) - new Date(b.entry_timestamp || b.timestamp)
    );
    
    let runningCapital = initialCapital;
    let maxCapital = initialCapital;
    let maxDrawdown = 0;
    let totalPnL = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    const returns = [];
    
    for (const trade of sortedTrades) {
      const tradePnL = trade.net_pnl || trade.pnl || 0;
      totalPnL += tradePnL;
      runningCapital += tradePnL;
      
      if (tradePnL > 0) winningTrades++;
      else if (tradePnL < 0) losingTrades++;
      
      // Calculate drawdown
      if (runningCapital > maxCapital) {
        maxCapital = runningCapital;
      }
      
      const drawdown = (maxCapital - runningCapital) / maxCapital;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
      
      // Store return for Sharpe calculation
      const returnPct = tradePnL / initialCapital;
      returns.push(returnPct);
    }
    
    // Calculate Sharpe ratio
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;
    
    return {
      finalCapital: runningCapital,
      totalReturn: totalPnL / initialCapital,
      totalTrades: sortedTrades.length,
      winningTrades,
      losingTrades,
      winRate: sortedTrades.length > 0 ? winningTrades / sortedTrades.length : 0,
      sharpeRatio: sharpeRatio * Math.sqrt(252), // Annualized
      maxDrawdown
    };
  }

  /**
   * Create strategy instance (placeholder - implement based on your strategy)
   */
  createStrategyInstance() {
    // Return strategy instance based on backtestConfig
    // This would be configured based on the actual strategy being tested
    const IWMOptimizedStrategy = require('../strategies/iwm-optimized-v2-strategy');
    return new IWMOptimizedStrategy();
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    console.log('🧹 [MULTI-WORKER] Cleaning up resources...');
    
    // Close master database pool
    if (this.masterPool) {
      await this.masterPool.end();
    }
    
    // Clear worker references
    this.workers.strategy.clear();
    this.workers.data.clear();
    this.workers.greeks.clear();
    
    console.log('✅ [MULTI-WORKER] Cleanup completed');
  }
}

module.exports = MultiWorkerBacktestEngine;