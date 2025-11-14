/**
 * Enhanced Backtesting Server with Multi-Worker Support
 * 
 * Adds new endpoint for parallel backtesting using your 8-core i7
 * - /api/backtest/parallel - Multi-worker parallel execution
 * - Maintains backward compatibility with existing endpoints
 */

// Import dependencies from main server context
const express = require('express');
const { Pool } = require('pg');
const os = require('os');

// Get references to main server objects (these are globals in server.js)
const getMainServerContext = () => {
  try {
    // Use require.main to access the main module's exports
    const mainModule = require.cache[require.resolve('./server.js')];
    if (mainModule && mainModule.exports) {
      return {
        app: mainModule.exports,
        pool: global.pool || new Pool({ connectionString: process.env.DATABASE_URL }),
        alpacaClient: global.alpacaClient
      };
    }
  } catch (error) {
    console.error('❌ Could not access main server context:', error.message);
  }
  
  // Fallback: create new instances
  return {
    app: express(),
    pool: new Pool({ connectionString: process.env.DATABASE_URL }),
    alpacaClient: null
  };
};

const MultiWorkerBacktestEngine = require('./workers/multi-worker-engine');
const { globalRegistry } = require('./strategy-registry');

// Get server context
const { app, pool, alpacaClient } = getMainServerContext();

/**
 * ENHANCED: Multi-worker parallel backtest endpoint
 * POST /api/backtest/parallel
 */
app.post('/api/backtest/parallel', async (req, res) => {
  try {
    const {
      strategy = 'iwm-optimized-v2-strategy',
      symbol = 'IWM',
      startDate,
      endDate,
      timeframe = '1Min',
      initialCapital = 10000,
      parameters = {},
      strikeRange = 10,
      strikeSpacing = 1,
      enableParallel = true,      // NEW: Enable/disable parallel processing
      maxWorkers = 8              // NEW: Override worker count
    } = req.body;

    console.log(`\n🏎️ [PARALLEL BACKTEST] Starting enhanced parallel backtest:`);
    console.log(`   Strategy: ${strategy}`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Date Range: ${startDate} to ${endDate}`);
    console.log(`   Workers: ${enableParallel ? maxWorkers : 1}`);
    console.log(`   Initial Capital: $${initialCapital.toLocaleString()}`);
    
    // Create backtest record
    const backtestResult = await pool.query(`
      INSERT INTO backtests (
        strategy_name, symbol, start_date, end_date, 
        initial_capital, status, parameters, created_at,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)
      RETURNING id
    `, [
      strategy, 
      symbol, 
      startDate, 
      endDate, 
      initialCapital, 
      'running', 
      JSON.stringify(parameters),
      JSON.stringify({ 
        parallel: enableParallel, 
        maxWorkers: maxWorkers,
        hardwareOptimized: true 
      })
    ]);

    const backtestId = backtestResult.rows[0].id;

    // Calculate performance estimate
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const daysDiff = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24));
    
    // Enhanced estimation for parallel processing
    const baseSeconds = daysDiff * 10;
    const parallelSpeedup = enableParallel ? Math.min(maxWorkers * 0.8, 6) : 1; // 80% efficiency, max 6x
    const estimatedSeconds = Math.ceil(baseSeconds / parallelSpeedup);

    console.log(`⏱️  [PARALLEL BACKTEST] Estimated completion: ${estimatedSeconds}s (${parallelSpeedup.toFixed(1)}x speedup)`);

    // Return immediate response
    res.json({
      success: true,
      backtestId: backtestId,
      status: 'running',
      message: 'Enhanced parallel backtest initiated',
      estimatedSeconds: estimatedSeconds,
      estimatedCompletionTime: new Date(Date.now() + estimatedSeconds * 1000).toISOString(),
      parallelConfig: {
        enabled: enableParallel,
        maxWorkers: maxWorkers,
        estimatedSpeedup: parallelSpeedup,
        hardwareOptimized: true
      },
      config: {
        strategy,
        symbol,
        startDate,
        endDate,
        initialCapital
      }
    });

    // Run enhanced backtest asynchronously
    (async () => {
      try {
        console.log(`\n🏎️ [PARALLEL BACKTEST ${backtestId}] Starting enhanced execution...`);
        
        // Load and validate strategy
        console.log(`🔍 [PARALLEL BACKTEST ${backtestId}] Loading strategy: ${strategy}`);
        const validation = globalRegistry.validateStrategyForBacktest(strategy);
        
        if (!validation.valid) {
          throw new Error(`Strategy validation failed: ${validation.error}`);
        }
        
        const StrategyClass = globalRegistry.getStrategy(strategy);
        console.log(`✅ [PARALLEL BACKTEST ${backtestId}] Strategy loaded: ${validation.metadata.description}`);
        
        // Create strategy instance with parameters
        const strategyInstance = new StrategyClass({
          ...parameters,
          // Ensure required parameters exist
          vwapPeriod: parameters.vwapPeriod || 60,
          priceVwapThreshold: parameters.priceVwapThreshold || 0.0005,
          slopeThreshold: parameters.slopeThreshold || 0.00001
        });
        
        let result;
        
        if (enableParallel && daysDiff > 1) {
          // Use multi-worker engine for longer backtests
          console.log(`🏎️ [PARALLEL BACKTEST ${backtestId}] Using multi-worker engine with ${maxWorkers} workers`);
          
          const multiWorkerEngine = new MultiWorkerBacktestEngine(
            pool, 
            alpacaClient, 
            { 
              strikeRange, 
              strikeSpacing,
              STRATEGY_WORKERS: Math.min(maxWorkers, 8),
              DATA_WORKERS: Math.min(4, Math.ceil(maxWorkers / 2)),
              GREEKS_WORKERS: Math.min(4, Math.ceil(maxWorkers / 2))
            }
          );
          
          result = await multiWorkerEngine.runParallelBacktest({
            backtestId,
            strategy: strategyInstance,
            symbol,
            startDate,
            endDate,
            timeframe,
            initialCapital,
            strikeRange,
            strikeSpacing
          });
          
          // Cleanup multi-worker resources
          await multiWorkerEngine.cleanup();
          
        } else {
          // Use standard engine for single day or when parallel disabled
          console.log(`📊 [PARALLEL BACKTEST ${backtestId}] Using standard engine (parallel disabled or short timeframe)`);
          
          const BacktestEngine = require('./engine/backtest-engine.js');
          const engine = new BacktestEngine(pool, alpacaClient, { strikeRange, strikeSpacing });

          result = await engine.runBacktest({
            backtestId,
            strategy: strategyInstance,
            symbol,
            startDate,
            endDate,
            timeframe,
            initialCapital,
            strikeRange,
            strikeSpacing
          });
        }

        console.log(`✅ [PARALLEL BACKTEST ${backtestId}] Enhanced backtest completed successfully`);
        console.log(`   Total Trades: ${result.performance?.totalTrades || 0}`);
        console.log(`   Total Return: ${((result.performance?.totalReturn || 0) * 100).toFixed(2)}%`);
        console.log(`   Win Rate: ${((result.performance?.winRate || 0) * 100).toFixed(1)}%`);
        
        if (result.multiWorker) {
          console.log(`   🏎️ Multi-Worker Stats: ${result.multiWorker.workersUsed} workers, ${result.multiWorker.errors.length} errors`);
        }
        
      } catch (error) {
        console.error(`❌ [PARALLEL BACKTEST ${backtestId}] Error:`, error);
        console.error(error.stack);
        
        // Update backtest record with error
        await pool.query(`
          UPDATE backtests 
          SET status = 'failed', 
              error_message = $1,
              completed_at = NOW()
          WHERE id = $2
        `, [error.message, backtestId]);
      }
    })();
    
  } catch (error) {
    console.error('❌ [PARALLEL BACKTEST] Error starting parallel backtest:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ENHANCED: Get system performance metrics
 * GET /api/system/performance
 */
app.get('/api/system/performance', async (req, res) => {
  try {
    const os = require('os');
    
    // CPU information
    const cpuCount = os.cpus().length;
    const cpuModel = os.cpus()[0]?.model || 'Unknown';
    const cpuSpeed = os.cpus()[0]?.speed || 0;
    
    // Memory information  
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    
    // Load average (1, 5, 15 minutes)
    const loadAverage = os.loadavg();
    
    // Database connection pool stats
    const dbStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    };
    
    // Calculate optimal worker configuration for this system
    const optimalConfig = {
      recommendedStrategyWorkers: Math.min(cpuCount, 8),
      recommendedDataWorkers: Math.min(Math.ceil(cpuCount / 2), 4),
      recommendedGreeksWorkers: Math.min(Math.ceil(cpuCount / 2), 4),
      maxMemoryPerWorker: Math.floor(totalMemory / cpuCount / (1024 * 1024 * 1024)) + 'GB',
      parallelProcessingRecommended: cpuCount >= 4 && (usedMemory / totalMemory) < 0.8
    };
    
    res.json({
      hardware: {
        cpuCores: cpuCount,
        cpuModel: cpuModel,
        cpuSpeed: `${(cpuSpeed / 1000).toFixed(1)} GHz`,
        totalMemory: `${(totalMemory / (1024 * 1024 * 1024)).toFixed(1)} GB`,
        freeMemory: `${(freeMemory / (1024 * 1024 * 1024)).toFixed(1)} GB`,
        memoryUsage: `${((usedMemory / totalMemory) * 100).toFixed(1)}%`
      },
      performance: {
        loadAverage1min: loadAverage[0].toFixed(2),
        loadAverage5min: loadAverage[1].toFixed(2),
        loadAverage15min: loadAverage[2].toFixed(2),
        cpuUtilization: `${Math.min((loadAverage[0] / cpuCount) * 100, 100).toFixed(1)}%`
      },
      database: dbStats,
      optimization: optimalConfig,
      recommendations: {
        enableParallel: optimalConfig.parallelProcessingRecommended,
        maxWorkers: optimalConfig.recommendedStrategyWorkers,
        memoryOptimization: usedMemory / totalMemory > 0.7 ? 'Consider reducing worker count or batch sizes' : 'Memory usage optimal for parallel processing',
        cpuOptimization: loadAverage[0] > cpuCount ? 'System under high load - consider reducing parallel workers' : 'CPU available for parallel processing'
      }
    });
    
  } catch (error) {
    console.error('❌ [SYSTEM PERFORMANCE] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * ENHANCED: Benchmark system performance for backtesting
 * POST /api/system/benchmark
 */
app.post('/api/system/benchmark', async (req, res) => {
  try {
    console.log('🏎️ [BENCHMARK] Starting system performance benchmark...');
    
    const startTime = Date.now();
    const {
      testDuration = 10,    // seconds
      maxWorkers = 8,       // max workers to test
      testDataSize = 1000   // number of fake calculations
    } = req.body;
    
    // Return immediate response
    res.json({
      success: true,
      benchmarkId: startTime,
      status: 'running',
      message: 'System benchmark started',
      estimatedDuration: testDuration,
      config: {
        maxWorkers,
        testDataSize,
        testDuration
      }
    });
    
    // Run benchmark in background
    (async () => {
      try {
        const GreeksCalculator = require('./utils/greeks-calculator');
        const calculator = new GreeksCalculator();
        
        console.log(`🏎️ [BENCHMARK] Testing ${maxWorkers} workers with ${testDataSize} calculations each`);
        
        // Test sequential processing
        const sequentialStart = Date.now();
        for (let i = 0; i < testDataSize; i++) {
          calculator.calculateAllGreeks(100, 105, 0.0274, 0.05, null, 'call', 2.50);
        }
        const sequentialDuration = Date.now() - sequentialStart;
        
        // Test parallel processing
        const parallelStart = Date.now();
        const workerPromises = Array(maxWorkers).fill(0).map(async (_, workerIndex) => {
          const workerStart = Date.now();
          const calculationsPerWorker = Math.floor(testDataSize / maxWorkers);
          
          for (let i = 0; i < calculationsPerWorker; i++) {
            calculator.calculateAllGreeks(100, 105, 0.0274, 0.05, null, 'call', 2.50);
          }
          
          return {
            workerId: workerIndex + 1,
            calculations: calculationsPerWorker,
            duration: Date.now() - workerStart
          };
        });
        
        const workerResults = await Promise.all(workerPromises);
        const parallelDuration = Date.now() - parallelStart;
        
        const speedup = sequentialDuration / parallelDuration;
        const efficiency = speedup / maxWorkers;
        
        const benchmarkResults = {
          benchmarkId: startTime,
          completedAt: new Date().toISOString(),
          sequential: {
            calculations: testDataSize,
            duration: sequentialDuration,
            calculationsPerSecond: Math.round(testDataSize / (sequentialDuration / 1000))
          },
          parallel: {
            workers: maxWorkers,
            totalCalculations: testDataSize,
            duration: parallelDuration,
            calculationsPerSecond: Math.round(testDataSize / (parallelDuration / 1000)),
            workerResults: workerResults
          },
          performance: {
            speedup: speedup.toFixed(2),
            efficiency: `${(efficiency * 100).toFixed(1)}%`,
            recommendation: speedup > 2 ? 'Excellent parallel performance - use multi-worker mode' : 
                           speedup > 1.5 ? 'Good parallel performance - moderate benefit' :
                           'Limited parallel benefit - consider single-worker mode'
          }
        };
        
        console.log(`✅ [BENCHMARK] Completed: ${speedup.toFixed(2)}x speedup, ${(efficiency * 100).toFixed(1)}% efficiency`);
        
        // Store results in database for future reference
        await pool.query(`
          INSERT INTO system_benchmarks (
            benchmark_id, completed_at, results
          ) VALUES ($1, NOW(), $2)
        `, [startTime, JSON.stringify(benchmarkResults)]);
        
      } catch (error) {
        console.error(`❌ [BENCHMARK] Error:`, error);
      }
    })();
    
  } catch (error) {
    console.error('❌ [BENCHMARK] Error starting benchmark:', error);
    res.status(500).json({ error: error.message });
  }
});

console.log(`\n🏎️ [MULTI-WORKER] Enhanced backtesting endpoints loaded:`);
console.log(`   POST /api/backtest/parallel - Multi-worker parallel backtesting`);
console.log(`   GET /api/system/performance - System performance metrics`);
console.log(`   POST /api/system/benchmark - Performance benchmarking`);
console.log(`   🖥️  Optimized for: 8-core i7 @ 3.8GHz + 64GB RAM`);

// Export the enhanced engine for external use
module.exports = {
  ...module.exports,
  MultiWorkerBacktestEngine
};