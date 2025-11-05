/**
 * HAVWAP Strategy Optuna Hyperparameter Optimization
 * 
 * Optimizes HAVWAP-Proper strategy parameters using Optuna framework
 * Targets: Daily Sharpe Ratio maximization and Total PnL
 * Test Period: Multiple weeks of market data for robust parameter identification
 * Holding: All-day positions allowed for maximum opportunity capture
 */

const optuna = require('optuna');
const moment = require('moment-timezone');
const { BacktestEngine } = require('../engine/backtest-engine');
const HAVWAPProperStrategy = require('../strategies/havwap-proper');
const AlpacaClient = require('../utils/alpaca-client');

class HAVWAPOptunaOptimizer {
  constructor(config = {}) {
    this.config = {
      // Optimization settings
      nTrials: config.nTrials || 500, // Number of optimization trials
      nJobs: config.nJobs || 4, // Parallel jobs
      studyName: config.studyName || 'havwap-optimization',
      
      // Test period (multiple weeks for robust results)
      startDate: config.startDate || '2024-10-01',
      endDate: config.endDate || '2024-10-25',
      
      // Symbols to test (liquid 0DTE options)
      symbols: config.symbols || ['SPY', 'QQQ', 'IWM'],
      
      // Backtest settings
      initialCapital: config.initialCapital || 10000,
      maxPositions: config.maxPositions || 1,
      contracts: config.contracts || 1,
      
      // Optimization targets
      primaryMetric: config.primaryMetric || 'sharpe_ratio', // 'sharpe_ratio', 'total_return', 'profit_factor'
      secondaryMetric: config.secondaryMetric || 'total_return',
      
      // Risk constraints
      maxDrawdown: config.maxDrawdown || 0.20, // 20% max drawdown
      minTrades: config.minTrades || 10, // Minimum trades for valid optimization
      
      ...config
    };
    
    this.alpacaClient = new AlpacaClient();
    this.study = null;
    this.results = [];
  }

  /**
   * Define parameter search spaces for Optuna
   */
  defineParameterSpaces(trial) {
    return {
      // Distance thresholds (most critical parameters)
      d_entry: trial.suggest_float('d_entry', 0.0005, 0.0050, step=0.0001), // 0.05% - 0.50%
      d_near: trial.suggest_float('d_near', 0.0002, 0.0015, step=0.0001),   // 0.02% - 0.15%
      s_min: trial.suggest_float('s_min', 0.00001, 0.0005, step=0.00001),   // Slope sensitivity
      
      // Volatility filters
      rv_cap: trial.suggest_float('rv_cap', 0.002, 0.008, step=0.0005),     // 20-80 bps realized vol cap
      iv_chg_cap: trial.suggest_float('iv_chg_cap', 1.5, 5.0, step=0.25),   // IV change cap
      
      // Order flow threshold
      theta_imb: trial.suggest_float('theta_imb', 0.55, 0.80, step=0.05),   // Imbalance threshold
      
      // Delta targets
      deltaTargetReversion: trial.suggest_float('deltaTargetReversion', 0.40, 0.60, step=0.02),
      deltaTargetTrend: trial.suggest_float('deltaTargetTrend', 0.50, 0.65, step=0.02),
      
      // Exit parameters - REVERSION strategy
      profitTargetReversion: trial.suggest_float('profitTargetReversion', 0.10, 0.40, step=0.02), // 10-40%
      stopLossReversion: trial.suggest_float('stopLossReversion', 0.05, 0.20, step=0.01),         // 5-20%
      timeStopReversion: trial.suggest_int('timeStopReversion', 60, 600, step=30),                 // 1-10 minutes
      
      // Exit parameters - TREND strategy  
      profitTargetTrend: trial.suggest_float('profitTargetTrend', 0.12, 0.45, step=0.02),         // 12-45%
      stopLossTrend: trial.suggest_float('stopLossTrend', 0.08, 0.25, step=0.01),                 // 8-25%
      timeStopTrend: trial.suggest_int('timeStopTrend', 120, 900, step=30),                       // 2-15 minutes
      
      // Option selection
      maxSpreadPct: trial.suggest_int('maxSpreadPct', 8, 25, step=2),                             // Max bid/ask spread %
      minVolume: trial.suggest_int('minVolume', 0, 5, step=1),                                    // Minimum volume filter
      
      // All-day holding option
      zeroDTECloseTime: trial.suggest_categorical('zeroDTECloseTime', ['15:30', '15:45', '15:50', '15:55']) // Close timing
    };
  }

  /**
   * Get weekdays between start and end dates
   */
  getWeekdays(startDate, endDate) {
    const weekdays = [];
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end)) {
      // Only include weekdays (Monday=1, Friday=5)
      if (current.isoWeekday() >= 1 && current.isoWeekday() <= 5) {
        weekdays.push(current.format('YYYY-MM-DD'));
      }
      current.add(1, 'day');
    }
    
    return weekdays;
  }

  /**
   * Calculate performance metrics from backtest results
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
        avg_return_per_trade: 0,
        validity_score: 0
      };
    }

    const returns = [];
    const dailyPnL = [];
    let totalPnL = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let runningBalance = this.config.initialCapital;
    let peak = this.config.initialCapital;
    let maxDrawdown = 0;

    // Process each day's results
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
            losingTrades++;
            grossLosses += Math.abs(tradePnL);
          }
        });
        
        dailyPnL.push(dayPnL);
        runningBalance += dayPnL;
        
        // Track drawdown
        if (runningBalance > peak) {
          peak = runningBalance;
        } else {
          const drawdown = (peak - runningBalance) / peak;
          maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
        
        // Calculate daily return
        const dailyReturn = dayPnL / this.config.initialCapital;
        returns.push(dailyReturn);
      } else {
        // No trades day - zero return
        returns.push(0);
        dailyPnL.push(0);
      }
    });

    // Calculate metrics
    const totalReturn = totalPnL / this.config.initialCapital;
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance * 252); // Annualized
    const sharpeRatio = volatility > 0 ? (avgReturn * 252) / volatility : 0;
    
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 999 : 0;
    const avgReturnPerTrade = totalTrades > 0 ? totalPnL / totalTrades : 0;
    
    // Validity score (0-1) based on having sufficient trades and reasonable metrics
    let validityScore = 0;
    if (totalTrades >= this.config.minTrades) validityScore += 0.4;
    if (maxDrawdown <= this.config.maxDrawdown) validityScore += 0.3;
    if (sharpeRatio > 0) validityScore += 0.2;
    if (profitFactor > 1.0) validityScore += 0.1;

    return {
      total_return: totalReturn,
      sharpe_ratio: sharpeRatio,
      max_drawdown: maxDrawdown,
      profit_factor: profitFactor,
      win_rate: winRate,
      total_trades: totalTrades,
      avg_return_per_trade: avgReturnPerTrade,
      validity_score: validityScore,
      daily_pnl: dailyPnL,
      gross_wins: grossWins,
      gross_losses: grossLosses
    };
  }

  /**
   * Objective function for Optuna optimization
   */
  async objective(trial) {
    try {
      console.log(`\n🔬 OPTUNA Trial ${trial.number}:`);
      
      // Get parameter suggestions from Optuna
      const params = this.defineParameterSpaces(trial);
      console.log(`   Parameters: d_entry=${params.d_entry.toFixed(4)}, d_near=${params.d_near.toFixed(4)}, s_min=${params.s_min.toFixed(6)}`);
      console.log(`   Exits: Reversion PT=${params.profitTargetReversion.toFixed(2)}, SL=${params.stopLossReversion.toFixed(2)}, Time=${params.timeStopReversion}s`);
      
      // Get all weekdays in test period
      const weekdays = this.getWeekdays(this.config.startDate, this.config.endDate);
      console.log(`   Testing across ${weekdays.length} trading days`);
      
      const allResults = [];
      let totalBacktests = 0;
      let successfulBacktests = 0;
      
      // Test each symbol across all days
      for (const symbol of this.config.symbols) {
        for (const date of weekdays) {
          try {
            totalBacktests++;
            
            // Create strategy with trial parameters
            const strategy = new HAVWAPProperStrategy(params);
            
            // Create backtest engine
            const engine = new BacktestEngine(this.alpacaClient);
            
            // Run backtest for this day/symbol
            const result = await engine.runBacktest({
              strategy: strategy,
              symbol: symbol,
              startDate: date,
              endDate: date,
              initialCapital: this.config.initialCapital,
              maxPositions: this.config.maxPositions,
              contracts: this.config.contracts,
              mode: 'backtest'
            });
            
            if (result && result.success) {
              allResults.push(result);
              successfulBacktests++;
            }
            
          } catch (error) {
            console.log(`   ⚠️  Backtest failed for ${symbol} ${date}: ${error.message}`);
            // Continue with other tests
          }
        }
      }
      
      console.log(`   ✅ Completed ${successfulBacktests}/${totalBacktests} backtests`);
      
      // Calculate comprehensive metrics
      const metrics = this.calculateMetrics(allResults);
      
      console.log(`   📊 Results: Return=${(metrics.total_return*100).toFixed(2)}%, Sharpe=${metrics.sharpe_ratio.toFixed(3)}, Trades=${metrics.total_trades}`);
      console.log(`   📉 Risk: MaxDD=${(metrics.max_drawdown*100).toFixed(2)}%, PF=${metrics.profit_factor.toFixed(2)}, WinRate=${(metrics.win_rate*100).toFixed(1)}%`);
      
      // Store result for analysis
      this.results.push({
        trial_number: trial.number,
        parameters: params,
        metrics: metrics,
        successful_backtests: successfulBacktests,
        total_backtests: totalBacktests
      });
      
      // Optuna objective: Composite score
      let objectiveScore = 0;
      
      if (metrics.validity_score < 0.5) {
        // Penalize invalid parameter sets
        objectiveScore = -1000;
      } else {
        // Multi-objective optimization
        if (this.config.primaryMetric === 'sharpe_ratio') {
          objectiveScore = metrics.sharpe_ratio * 0.7 + metrics.total_return * 0.3;
        } else if (this.config.primaryMetric === 'total_return') {
          objectiveScore = metrics.total_return * 0.7 + metrics.sharpe_ratio * 0.3;
        } else if (this.config.primaryMetric === 'profit_factor') {
          objectiveScore = Math.log(metrics.profit_factor) * 0.6 + metrics.sharpe_ratio * 0.4;
        }
        
        // Penalty for excessive drawdown
        if (metrics.max_drawdown > this.config.maxDrawdown) {
          objectiveScore *= (1 - metrics.max_drawdown);
        }
      }
      
      console.log(`   🎯 Objective Score: ${objectiveScore.toFixed(4)}`);
      
      return objectiveScore;
      
    } catch (error) {
      console.error(`   ❌ Trial ${trial.number} failed: ${error.message}`);
      return -1000; // Return large penalty for failed trials
    }
  }

  /**
   * Run Optuna optimization study
   */
  async runOptimization() {
    console.log(`\n🚀 Starting HAVWAP Optuna Optimization:`);
    console.log(`   Study: ${this.config.studyName}`);
    console.log(`   Trials: ${this.config.nTrials}`);
    console.log(`   Period: ${this.config.startDate} to ${this.config.endDate}`);
    console.log(`   Symbols: ${this.config.symbols.join(', ')}`);
    console.log(`   Target: ${this.config.primaryMetric}`);
    
    try {
      // Create Optuna study
      this.study = optuna.create_study({
        study_name: this.config.studyName,
        direction: 'maximize', // Maximize objective score
        sampler: optuna.samplers.TPESampler({
          n_startup_trials: 50, // Random exploration first
          n_ei_candidates: 24,
          seed: 42
        }),
        pruner: optuna.pruners.MedianPruner({
          n_startup_trials: 25,
          n_warmup_steps: 5
        })
      });
      
      // Run optimization
      await this.study.optimize(this.objective.bind(this), {
        n_trials: this.config.nTrials,
        n_jobs: this.config.nJobs,
        timeout: 3600 * 24 // 24 hour timeout
      });
      
      console.log(`\n✅ Optimization completed!`);
      
      // Get best parameters
      const bestParams = this.study.best_params;
      const bestValue = this.study.best_value;
      
      console.log(`\n🏆 BEST PARAMETERS (Score: ${bestValue.toFixed(4)}):`);
      console.log(`   Distance: d_entry=${bestParams.d_entry.toFixed(4)}, d_near=${bestParams.d_near.toFixed(4)}`);
      console.log(`   Slope: s_min=${bestParams.s_min.toFixed(6)}`);
      console.log(`   Volatility: rv_cap=${bestParams.rv_cap.toFixed(4)}`);
      console.log(`   Reversion Exits: PT=${bestParams.profitTargetReversion.toFixed(2)}, SL=${bestParams.stopLossReversion.toFixed(2)}, Time=${bestParams.timeStopReversion}s`);
      console.log(`   Trend Exits: PT=${bestParams.profitTargetTrend.toFixed(2)}, SL=${bestParams.stopLossTrend.toFixed(2)}, Time=${bestParams.timeStopTrend}s`);
      
      // Save results
      await this.saveResults(bestParams, bestValue);
      
      return {
        best_parameters: bestParams,
        best_score: bestValue,
        study: this.study,
        all_results: this.results
      };
      
    } catch (error) {
      console.error(`❌ Optimization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Save optimization results
   */
  async saveResults(bestParams, bestScore) {
    const fs = require('fs').promises;
    
    const results = {
      optimization_config: this.config,
      best_parameters: bestParams,
      best_score: bestScore,
      all_trials: this.results,
      timestamp: new Date().toISOString(),
      study_stats: {
        n_trials: this.study.trials.length,
        best_trial: this.study.best_trial.number
      }
    };
    
    const filename = `/app/optimization/results/havwap_optimization_${Date.now()}.json`;
    await fs.writeFile(filename, JSON.stringify(results, null, 2));
    
    console.log(`\n💾 Results saved to: ${filename}`);
    
    // Also save best parameters as a new strategy file
    const optimizedStrategy = this.generateOptimizedStrategy(bestParams);
    const strategyFilename = `/app/strategies/havwap-optimized.js`;
    await fs.writeFile(strategyFilename, optimizedStrategy);
    
    console.log(`📄 Optimized strategy saved to: ${strategyFilename}`);
  }

  /**
   * Generate optimized strategy file with best parameters
   */
  generateOptimizedStrategy(params) {
    return `/**
 * HAVWAP Strategy - Optuna Optimized Parameters
 * Generated: ${new Date().toISOString()}
 * Optimization Period: ${this.config.startDate} to ${this.config.endDate}
 * Target Metric: ${this.config.primaryMetric}
 */

const HAVWAPProperStrategy = require('./havwap-proper');

class HAVWAPOptimizedStrategy extends HAVWAPProperStrategy {
  constructor(customParams = {}) {
    // Optuna-optimized parameters
    const optimizedParams = {
      d_entry: ${params.d_entry},
      d_near: ${params.d_near},
      s_min: ${params.s_min},
      rv_cap: ${params.rv_cap},
      iv_chg_cap: ${params.iv_chg_cap},
      theta_imb: ${params.theta_imb},
      deltaTargetReversion: ${params.deltaTargetReversion},
      deltaTargetTrend: ${params.deltaTargetTrend},
      profitTargetReversion: ${params.profitTargetReversion},
      stopLossReversion: ${params.stopLossReversion},
      timeStopReversion: ${params.timeStopReversion},
      profitTargetTrend: ${params.profitTargetTrend},
      stopLossTrend: ${params.stopLossTrend},
      timeStopTrend: ${params.timeStopTrend},
      maxSpreadPct: ${params.maxSpreadPct},
      minVolume: ${params.minVolume},
      zeroDTECloseTime: '${params.zeroDTECloseTime}',
      ...customParams
    };
    
    super(optimizedParams);
    this.name = 'HAVWAP Optimized';
  }
}

module.exports = HAVWAPOptimizedStrategy;`;
  }
}

module.exports = HAVWAPOptunaOptimizer;