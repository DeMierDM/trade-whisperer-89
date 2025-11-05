/**
 * HAVWAP Strategy Parameter Optimization
 * 
 * JavaScript-based grid search optimization for HAVWAP strategy parameters
 * Uses the existing backtesting infrastructure to find optimal parameters
 */

const moment = require('moment-timezone');
const BacktestEngine = require('../engine/backtest-engine');
const HAVWAPProperStrategy = require('../strategies/havwap-proper');
const AlpacaClient = require('../utils/alpaca-client');
const fs = require('fs').promises;
const path = require('path');

class HAVWAPParameterOptimizer {
  constructor(config, alpacaClient, db = null) {
    this.config = {
      // Optimization settings
      optimizationType: config.optimizationType || 'grid', // 'grid' or 'random'
      maxIterations: config.maxIterations || 100,
      
      // Test period
      startDate: config.startDate || '2024-10-01',
      endDate: config.endDate || '2024-10-25',
      
      // Symbols to test
      symbols: config.symbols || ['SPY'],
      
      // Trading parameters
      initialCapital: config.initialCapital || 10000,
      maxPositions: config.maxPositions || 1,
      contracts: config.contracts || 1,
      
      // Optimization targets
      primaryMetric: config.primaryMetric || 'sharpe_ratio',
      minTrades: config.minTrades || 5,
      maxDrawdown: config.maxDrawdown || 0.2
    };
    
    // Store Alpaca client and database
    this.alpacaClient = alpacaClient;
    this.db = db;
    
    // Use backtester's existing infrastructure instead of separate Alpaca client
    this.backtesterBaseUrl = 'http://localhost:3002';
    this.results = [];
    this.bestScore = -Infinity;
    this.bestParams = null;
  }

  /**
   * Define parameter ranges for optimization
   */
  getParameterRanges() {
    return {
      d_entry: {
        min: 0.0005,
        max: 0.0030,
        step: 0.0005,
        default: 0.0015
      },
      d_near: {
        min: 0.0002,
        max: 0.0010,
        step: 0.0002,
        default: 0.0006
      },
      s_min: {
        min: 0.00005,
        max: 0.0003,
        step: 0.00005,
        default: 0.0002
      },
      rv_cap: {
        min: 0.003,
        max: 0.007,
        step: 0.001,
        default: 0.004
      },
      profitTargetReversion: {
        min: 0.15,
        max: 0.30,
        step: 0.05,
        default: 0.20
      },
      stopLossReversion: {
        min: 0.08,
        max: 0.15,
        step: 0.02,
        default: 0.10
      },
      timeStopReversion: {
        min: 120,
        max: 300,
        step: 60,
        default: 180
      },
      profitTargetTrend: {
        min: 0.18,
        max: 0.35,
        step: 0.05,
        default: 0.23
      },
      stopLossTrend: {
        min: 0.10,
        max: 0.18,
        step: 0.02,
        default: 0.125
      },
      timeStopTrend: {
        min: 180,
        max: 420,
        step: 60,
        default: 270
      }
    };
  }

  /**
   * Generate parameter combinations for grid search
   */
  generateParameterCombinations() {
    const ranges = this.getParameterRanges();
    const combinations = [];
    
    if (this.config.optimizationType === 'grid') {
      // Grid search - all combinations
      const paramNames = Object.keys(ranges);
      const values = paramNames.map(name => {
        const range = ranges[name];
        const vals = [];
        for (let val = range.min; val <= range.max; val += range.step) {
          vals.push(Math.round(val * 1000000) / 1000000); // Round to avoid floating point issues
        }
        return vals;
      });
      
      // Generate cartesian product (limited for practicality)
      const maxCombinations = Math.min(this.config.maxIterations, 1000);
      const totalCombinations = values.reduce((acc, arr) => acc * arr.length, 1);
      
      if (totalCombinations <= maxCombinations) {
        // Full grid search
        this.generateCartesianProduct(values, paramNames, combinations);
      } else {
        // Reduced grid search - sample key combinations
        this.generateReducedGrid(ranges, combinations);
      }
      
    } else if (this.config.optimizationType === 'random') {
      // Random search
      for (let i = 0; i < this.config.maxIterations; i++) {
        const params = {};
        for (const [name, range] of Object.entries(ranges)) {
          const steps = Math.round((range.max - range.min) / range.step);
          const randomStep = Math.floor(Math.random() * (steps + 1));
          params[name] = range.min + (randomStep * range.step);
        }
        combinations.push(params);
      }
    }
    
    console.log(`📊 Generated ${combinations.length} parameter combinations`);
    return combinations;
  }

  /**
   * Generate reduced grid for high-dimensional spaces
   */
  generateReducedGrid(ranges, combinations) {
    // Focus on most important parameters with full combinations
    // Use default values for less critical parameters
    
    const criticalParams = ['d_entry', 'd_near', 'profitTargetReversion', 'stopLossReversion'];
    const otherParams = Object.keys(ranges).filter(name => !criticalParams.includes(name));
    
    // Get all combinations for critical parameters
    const criticalValues = criticalParams.map(name => {
      const range = ranges[name];
      const vals = [];
      for (let val = range.min; val <= range.max; val += range.step) {
        vals.push(Math.round(val * 1000000) / 1000000);
      }
      return vals;
    });
    
    // Generate combinations for critical parameters
    const criticalCombinations = [];
    this.generateCartesianProduct(criticalValues, criticalParams, criticalCombinations);
    
    // Limit to maxIterations
    const selectedCombinations = criticalCombinations.slice(0, this.config.maxIterations);
    
    // Add default values for other parameters
    selectedCombinations.forEach(combo => {
      otherParams.forEach(name => {
        combo[name] = ranges[name].default;
      });
      combinations.push(combo);
    });
  }

  /**
   * Generate cartesian product of arrays
   */
  generateCartesianProduct(arrays, names, result) {
    if (arrays.length === 0) return;
    
    // Simple recursive cartesian product
    const combine = (current, remaining) => {
      if (remaining.length === 0) {
        const params = {};
        current.forEach((val, index) => {
          params[names[index]] = val;
        });
        result.push(params);
        return;
      }
      
      const [first, ...rest] = remaining;
      first.forEach(val => {
        combine([...current, val], rest);
      });
    };
    
    combine([], arrays);
  }

  /**
   * Simple validation of optimization setup (no external API needed)
   */
  async validateOptimizationSetup() {
    console.log(`\n📊 Validating optimization setup...`);
    console.log(`   Period: ${this.config.startDate} to ${this.config.endDate}`);
    console.log(`   Symbols: ${this.config.symbols.join(', ')}`);
    console.log(`   Using local BacktestEngine`);
    
    const weekdays = this.getWeekdays(this.config.startDate, this.config.endDate);
    console.log(`   Trading days: ${weekdays.length}`);
    console.log(`   Total backtests per parameter set: ${this.config.symbols.length * weekdays.length}`);
    
    // Check if we have the Alpaca client
    if (!this.alpacaClient) {
      console.log(`   ❌ No Alpaca client available`);
      return false;
    }
    
    console.log(`   ✅ Alpaca client is available`);
    return true;
  }

  /**
   * Get weekdays between two dates
   */
  getWeekdays(startDate, endDate) {
    const weekdays = [];
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end)) {
      if (current.isoWeekday() >= 1 && current.isoWeekday() <= 5) {
        weekdays.push(current.format('YYYY-MM-DD'));
      }
      current.add(1, 'day');
    }
    
    return weekdays;
  }

  /**
   * Run backtest with specific parameters using backtester API
   */
  async runParameterTest(params, testNumber, totalTests) {
    console.log(`\n🧪 Test ${testNumber}/${totalTests}:`);
    console.log(`   d_entry: ${params.d_entry.toFixed(4)} (${(params.d_entry*100).toFixed(2)}%)`);
    console.log(`   d_near: ${params.d_near.toFixed(4)} (${(params.d_near*100).toFixed(2)}%)`);
    console.log(`   Reversion PT/SL: ${(params.profitTargetReversion*100).toFixed(0)}%/${(params.stopLossReversion*100).toFixed(0)}%`);
    
    const weekdays = this.getWeekdays(this.config.startDate, this.config.endDate);
    const allResults = [];
    let totalBacktests = 0;
    let successfulBacktests = 0;
    
    // Test across all symbols and days using backtester API
    for (const symbol of this.config.symbols) {
      for (const date of weekdays) {
        try {
          totalBacktests++;
          
          // Call backtester API with specific parameters
          const result = await this.callBacktesterAPI(symbol, date, params);
          
          if (result && result.success) {
            allResults.push(result);
            successfulBacktests++;
            
            // Debug logging for first few successful backtests
            if (successfulBacktests <= 3) {
              const tradeCount = result.trades ? result.trades.length : 0;
              console.log(`      ✓ ${symbol} ${date}: ${tradeCount} trades, PnL: ${result.total_pnl || 0}`);
            }
          } else {
            console.log(`      ✗ ${symbol} ${date}: ${result ? result.error || 'No trades generated' : 'API call failed'}`);
          }
          
        } catch (error) {
          console.log(`   ⚠️  Failed ${symbol} ${date}: ${error.message}`);
        }
      }
    }
    
    console.log(`   ✅ Completed ${successfulBacktests}/${totalBacktests} backtests`);
    
    // Calculate performance metrics
    const metrics = this.calculateMetrics(allResults);
    console.log(`   📊 Metrics:`);
    console.log(`      Return: ${(metrics.total_return*100).toFixed(2)}%`);
    console.log(`      Sharpe: ${metrics.sharpe_ratio.toFixed(3)}`);
    console.log(`      Trades: ${metrics.total_trades}`);
    console.log(`      Win Rate: ${(metrics.win_rate*100).toFixed(1)}%`);
    console.log(`      Max DD: ${(metrics.max_drawdown*100).toFixed(1)}%`);
    console.log(`      PF: ${metrics.profit_factor.toFixed(2)}`);
    
    // Calculate score
    const score = this.calculateScore(metrics);
    console.log(`   🎯 Score: ${score.toFixed(4)} (${score > 0.001 ? 'VALID' : 'MINIMAL'})`);
    
    // Log if this is the best so far
    if (score > this.bestScore) {
      console.log(`   🌟 NEW BEST SCORE! (previous: ${this.bestScore.toFixed(4)})`);
    }
    
    // Store result
    const result = {
      test_number: testNumber,
      parameters: params,
      metrics: metrics,
      score: score,
      successful_backtests: successfulBacktests,
      total_backtests: totalBacktests
    };
    
    this.results.push(result);
    
    // Update best result
    if (score > this.bestScore) {
      this.bestScore = score;
      this.bestParams = params;
      console.log(`   🏆 NEW BEST SCORE: ${score.toFixed(4)}`);
    }
    
    return result;
  }

  /**
   * Call the local BacktestEngine directly (no HTTP needed)
   */
  async callBacktesterAPI(symbol, date, params) {
    try {
      // Import and use BacktestEngine directly
      const BacktestEngine = require('../engine/backtest-engine');
      const HAVWAPProperStrategy = require('../strategies/havwap-proper-strategy');
      
      // Create a backtest engine instance with proper database connection
      const engine = new BacktestEngine(this.db, this.alpacaClient);
      
      // Create strategy with custom parameters
      const strategy = new HAVWAPProperStrategy(params);
      
      // Run the backtest directly using the main runBacktest method
      const result = await engine.runBacktest({
        strategy: strategy,
        symbol: symbol,
        startDate: date,
        endDate: date,
        initialCapital: this.config.initialCapital,
        maxPositions: this.config.maxPositions,
        contracts: this.config.contracts,
        mode: 'optimization' // Special mode for optimization
      });
      
      return result;
      
    } catch (error) {
      console.error(`Direct backtest failed for ${symbol} ${date}:`, error.message);
      return { success: false, error: error.message };
    }
  }  /**
   * Run backtest simulation using cached data (no API calls)
   */
  async runCachedBacktest({ strategy, symbol, date, cachedData, initialCapital, maxPositions, contracts }) {
    try {
      // Extract data from cache
      const { underlyingBars, optionContracts } = cachedData;
      
      if (!underlyingBars || underlyingBars.length === 0) {
        return { success: false, error: 'No underlying data' };
      }
      
      // Initialize portfolio state
      let portfolioValue = initialCapital;
      let cash = initialCapital;
      let position = null;
      let positions = [];
      const trades = [];
      
      // Process each minute bar
      for (let i = 0; i < underlyingBars.length; i++) {
        const currentBar = underlyingBars[i];
        const timestamp = new Date(currentBar.t);
        
        // Skip if outside trading hours (9:30 AM - 3:50 PM ET)
        const hour = timestamp.getHours();
        const minute = timestamp.getMinutes();
        if (hour < 9 || (hour === 9 && minute < 30) || hour >= 16 || (hour === 15 && minute >= 50)) {
          continue;
        }
        
        // Build time window for strategy (last 30 bars up to current)
        const windowStart = Math.max(0, i - 29);
        const timeWindow = underlyingBars.slice(windowStart, i + 1);
        
        if (timeWindow.length < 10) continue; // Need minimum data
        
        // Generate signals
        const signals = strategy.generateSignals(timeWindow, timestamp);
        
        // Handle position entry
        if (!position && (signals.call_signal > 0 || signals.put_signal > 0)) {
          const optionType = signals.call_signal > 0 ? 'call' : 'put';
          const availableContracts = optionContracts.filter(c => 
            c.type === optionType && 
            c.bars && c.bars.length > 0
          );
          
          if (availableContracts.length > 0) {
            // Select ATM contract
            const currentPrice = currentBar.c;
            const selectedContract = availableContracts.reduce((best, contract) => {
              const bestDiff = Math.abs(best.strike - currentPrice);
              const contractDiff = Math.abs(contract.strike - currentPrice);
              return contractDiff < bestDiff ? contract : best;
            });
            
            // Find entry price from contract bars
            const contractBar = selectedContract.bars.find(bar => 
              Math.abs(new Date(bar.t).getTime() - timestamp.getTime()) < 60000 // Within 1 minute
            );
            
            if (contractBar && contractBar.c > 0) {
              const entryPrice = contractBar.c;
              const positionSize = Math.min(contracts, Math.floor(cash / (entryPrice * 100)));
              
              if (positionSize > 0) {
                position = {
                  symbol: selectedContract.symbol,
                  type: optionType,
                  strike: selectedContract.strike,
                  entryPrice,
                  quantity: positionSize,
                  entryTime: timestamp,
                  contractBars: selectedContract.bars
                };
                
                cash -= positionSize * entryPrice * 100;
                positions.push(position);
              }
            }
          }
        }
        
        // Handle position exit
        if (position) {
          let shouldExit = false;
          let exitReason = '';
          
          // Find current contract price
          const contractBar = position.contractBars.find(bar => 
            Math.abs(new Date(bar.t).getTime() - timestamp.getTime()) < 60000
          );
          
          if (contractBar && contractBar.c > 0) {
            const currentPrice = contractBar.c;
            const pnlPercent = (currentPrice - position.entryPrice) / position.entryPrice;
            
            // Exit signals from strategy
            const exitResult = strategy.shouldExit(position, currentPrice, timestamp);
            if (exitResult.shouldExit) {
              shouldExit = true;
              exitReason = exitResult.reason;
            }
            
            // Profit target / stop loss
            if (position.type === 'call' || position.type === 'put') {
              if (pnlPercent >= (strategy.config.profitTargetReversion || 0.5)) {
                shouldExit = true;
                exitReason = 'profit_target';
              } else if (pnlPercent <= -(strategy.config.stopLossReversion || 0.3)) {
                shouldExit = true;
                exitReason = 'stop_loss';
              }
            }
            
            // Auto-close at 3:50 PM for 0DTE
            if (hour === 15 && minute >= 50) {
              shouldExit = true;
              exitReason = 'eod_close';
            }
            
            if (shouldExit) {
              const exitValue = position.quantity * currentPrice * 100;
              const tradePnL = exitValue - (position.quantity * position.entryPrice * 100);
              
              cash += exitValue;
              
              trades.push({
                symbol: position.symbol,
                type: position.type,
                strike: position.strike,
                entry_time: position.entryTime,
                exit_time: timestamp,
                entry_price: position.entryPrice,
                exit_price: currentPrice,
                quantity: position.quantity,
                pnl: tradePnL,
                reason: exitReason
              });
              
              position = null;
            }
          }
        }
      }
      
      // Calculate final portfolio value
      portfolioValue = cash;
      if (position) {
        // Mark position to market if still open
        const lastBar = position.contractBars[position.contractBars.length - 1];
        if (lastBar && lastBar.c > 0) {
          portfolioValue += position.quantity * lastBar.c * 100;
        }
      }
      
      const totalPnL = portfolioValue - initialCapital;
      
      return {
        success: true,
        symbol,
        date,
        trades,
        total_pnl: totalPnL,
        initial_capital: initialCapital,
        final_value: portfolioValue,
        trade_count: trades.length,
        win_count: trades.filter(t => t.pnl > 0).length,
        parameters: strategy.config
      };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate performance metrics
   */
  calculateMetrics(results) {
    if (!results || results.length === 0) {
      return {
        total_return: 0,
        sharpe_ratio: 0,
        max_drawdown: 1,
        profit_factor: 0,
        win_rate: 0,
        total_trades: 0,
        validity_score: 0
      };
    }

    const returns = [];
    let totalPnL = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let runningBalance = this.config.initialCapital;
    let peak = this.config.initialCapital;
    let maxDrawdown = 0;

    results.forEach(dayResult => {
      if (dayResult.trades && dayResult.trades.length > 0) {
        let dayPnL = 0;
        
        dayResult.trades.forEach(trade => {
          const tradePnL = trade.realized_pnl || 0;
          totalPnL += tradePnL;
          dayPnL += tradePnL;
          totalTrades++;
          
          if (tradePnL > 0) {
            winningTrades++;
            grossWins += tradePnL;
          } else {
            grossLosses += Math.abs(tradePnL);
          }
        });
        
        runningBalance += dayPnL;
        
        if (runningBalance > peak) {
          peak = runningBalance;
        } else {
          const drawdown = (peak - runningBalance) / peak;
          maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
        
        const dailyReturn = dayPnL / this.config.initialCapital;
        returns.push(dailyReturn);
      } else {
        returns.push(0);
      }
    });

    const totalReturn = totalPnL / this.config.initialCapital;
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1 ? returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1) : 0;
    const volatility = Math.sqrt(variance * 252); // Annualized volatility
    const sharpeRatio = volatility > 0 ? (avgReturn * 252) / volatility : 0;
    
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? 999 : 0);

    return {
      total_return: totalReturn,
      sharpe_ratio: sharpeRatio,
      max_drawdown: maxDrawdown,
      profit_factor: profitFactor,
      win_rate: winRate,
      total_trades: totalTrades,
      gross_wins: grossWins,
      gross_losses: grossLosses,
      avg_return: avgReturn,
      volatility: volatility
    };
  }

  /**
   * Calculate optimization score (based on freqtrade/zipline best practices)
   */
  calculateScore(metrics) {
    // Don't penalize parameter sets that simply have no trades
    // Instead, score them low but not with extreme penalty
    if (metrics.total_trades === 0) {
      return 0.001; // Very low score but not penalty
    }
    
    // For low trade counts, reduce minimum requirement for 0DTE trading
    const minTradesForValidity = Math.max(1, this.config.minTrades * 0.3); // 30% of original requirement
    
    // More flexible validity scoring for 0DTE optimization
    let validityMultiplier = 1.0;
    
    // Trade count component (more lenient for 0DTE)
    if (metrics.total_trades >= minTradesForValidity) {
      validityMultiplier *= 1.0;
    } else if (metrics.total_trades > 0) {
      validityMultiplier *= 0.7; // Partial credit for some trades
    } else {
      return 0.001; // Very low score but not penalty
    }
    
    // Drawdown component
    if (metrics.max_drawdown <= this.config.maxDrawdown) {
      validityMultiplier *= 1.0;
    } else {
      validityMultiplier *= Math.max(0.3, 1.0 - metrics.max_drawdown); // Gradual penalty
    }
    
    // Calculate base score using target-based approach (like freqtrade)
    let score = 0;
    
    if (this.config.primaryMetric === 'sharpe_ratio') {
      // Target Sharpe >= 2.0 as user requested
      const sharpeComponent = Math.max(0, metrics.sharpe_ratio) / 2.0; // Normalize to target of 2.0
      const returnComponent = Math.max(0, metrics.total_return) * 10; // 10% return = 1.0 component
      score = sharpeComponent * 0.7 + returnComponent * 0.3;
      
      // Bonus for exceeding Sharpe target
      if (metrics.sharpe_ratio >= 2.0) {
        score *= (1.0 + (metrics.sharpe_ratio - 2.0) * 0.1); // 10% bonus per point above 2.0
      }
    } else if (this.config.primaryMetric === 'total_return') {
      const returnComponent = Math.max(0, metrics.total_return) * 10;
      const sharpeComponent = Math.max(0, metrics.sharpe_ratio) / 2.0;
      score = returnComponent * 0.7 + sharpeComponent * 0.3;
    } else if (this.config.primaryMetric === 'profit_factor') {
      const pfComponent = Math.log(Math.max(1, metrics.profit_factor)) / Math.log(2); // Log base 2
      const sharpeComponent = Math.max(0, metrics.sharpe_ratio) / 2.0;
      score = pfComponent * 0.6 + sharpeComponent * 0.4;
    }
    
    // Apply validity multiplier
    score *= validityMultiplier;
    
    // Additional bonus for high win rate (stability)
    if (metrics.win_rate > 0.6) {
      score *= (1.0 + (metrics.win_rate - 0.6) * 0.2); // Up to 8% bonus for 100% win rate
    }
    
    // Ensure minimum positive score for valid backtests
    return Math.max(0.001, score);
  }

  /**
   * Run the optimization
   */
  async runOptimization() {
    console.log(`\n🚀 Starting HAVWAP Parameter Optimization:`);
    console.log(`   Type: ${this.config.optimizationType.toUpperCase()}`);
    console.log(`   Period: ${this.config.startDate} to ${this.config.endDate}`);
    console.log(`   Symbols: ${this.config.symbols.join(', ')}`);
    console.log(`   Target: ${this.config.primaryMetric}`);
    
    const startTime = Date.now();
    
    // Validate optimization setup
    console.log(`\n📥 Validating optimization setup...`);
    const setupValid = await this.validateOptimizationSetup();
    if (!setupValid) {
      throw new Error('Optimization setup validation failed');
    }
    
    console.log(`   ✅ Setup validated - ready to optimize via backtester API`);
    
    // Generate parameter combinations
    const combinations = this.generateParameterCombinations();
    
    // Test each combination
    for (let i = 0; i < combinations.length; i++) {
      await this.runParameterTest(combinations[i], i + 1, combinations.length);
      
      // Save intermediate results every 10 tests
      if ((i + 1) % 10 === 0) {
        await this.saveIntermediateResults();
      }
    }
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000 / 60; // minutes
    
    console.log(`\n✅ Optimization completed in ${duration.toFixed(1)} minutes`);
    console.log(`\n🏆 BEST RESULTS:`);
    console.log(`   Score: ${this.bestScore.toFixed(4)}`);
    console.log(`   Parameters:`);
    
    Object.entries(this.bestParams).forEach(([key, value]) => {
      if (typeof value === 'number') {
        console.log(`      ${key}: ${value.toFixed(4)}`);
      } else {
        console.log(`      ${key}: ${value}`);
      }
    });
    
    // Save final results
    await this.saveResults();
    
    return {
      best_parameters: this.bestParams,
      best_score: this.bestScore,
      all_results: this.results
    };
  }

  /**
   * Save intermediate results
   */
  async saveIntermediateResults() {
    const filename = path.join(__dirname, 'results', `intermediate_${Date.now()}.json`);
    const data = {
      progress: this.results.length,
      current_best_score: this.bestScore,
      current_best_params: this.bestParams,
      timestamp: new Date().toISOString()
    };
    
    try {
      await fs.mkdir(path.dirname(filename), { recursive: true });
      await fs.writeFile(filename, JSON.stringify(data, null, 2));
    } catch (error) {
      console.log(`   ⚠️  Could not save intermediate results: ${error.message}`);
    }
  }

  /**
   * Save final results
   */
  async saveResults() {
    const timestamp = Date.now();
    
    // Save detailed results
    const resultsFile = path.join(__dirname, 'results', `havwap_optimization_${timestamp}.json`);
    const resultsData = {
      config: this.config,
      best_parameters: this.bestParams,
      best_score: this.bestScore,
      all_results: this.results,
      timestamp: new Date().toISOString()
    };
    
    // Save optimized strategy
    const strategyFile = path.join(__dirname, '..', 'strategies', 'havwap-optimized.js');
    const strategyCode = this.generateOptimizedStrategy();
    
    try {
      await fs.mkdir(path.dirname(resultsFile), { recursive: true });
      await fs.writeFile(resultsFile, JSON.stringify(resultsData, null, 2));
      await fs.writeFile(strategyFile, strategyCode);
      
      console.log(`💾 Results saved to: ${resultsFile}`);
      console.log(`📄 Optimized strategy saved to: ${strategyFile}`);
    } catch (error) {
      console.error(`❌ Error saving results: ${error.message}`);
    }
  }

  /**
   * Generate optimized strategy file
   */
  generateOptimizedStrategy() {
    const params = this.bestParams;
    
    return `/**
 * HAVWAP Strategy - Parameter Optimized
 * Generated: ${new Date().toISOString()}
 * Optimization Score: ${this.bestScore.toFixed(4)}
 * Target Metric: ${this.config.primaryMetric}
 */

const HAVWAPProperStrategy = require('./havwap-proper');

class HAVWAPOptimizedStrategy extends HAVWAPProperStrategy {
  constructor(customParams = {}) {
    const optimizedParams = {
      d_entry: ${params.d_entry},
      d_near: ${params.d_near},
      s_min: ${params.s_min},
      rv_cap: ${params.rv_cap},
      profitTargetReversion: ${params.profitTargetReversion},
      stopLossReversion: ${params.stopLossReversion},
      timeStopReversion: ${params.timeStopReversion},
      profitTargetTrend: ${params.profitTargetTrend},
      stopLossTrend: ${params.stopLossTrend},
      timeStopTrend: ${params.timeStopTrend},
      ...customParams
    };
    
    super(optimizedParams);
    this.name = 'HAVWAP Optimized';
  }
}

module.exports = HAVWAPOptimizedStrategy;`;
  }
}

module.exports = HAVWAPParameterOptimizer;