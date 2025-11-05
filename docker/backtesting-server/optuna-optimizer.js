/**
 * OPTUNA OPTIMIZATION INTEGRATION
 * Handles hyperparameter optimization for trading strategies
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

class OptunaOptimizer {
  constructor(backtestingEngine) {
    this.engine = backtestingEngine;
    this.currentStudy = null;
    this.optimizationResults = new Map();
  }

  // 🔬 START OPTIMIZATION STUDY
  async startOptimization(strategyName, datasetParams, customConfig = {}) {
    console.log(`🔍 Looking for strategy: ${strategyName}`);
    console.log(`📋 Available strategies:`, this.engine.getAvailableStrategies());
    
    const strategy = this.engine.getStrategyDetails(strategyName);
    if (!strategy) {
      throw new Error(`Strategy ${strategyName} not found`);
    }

    if (!strategy.optimizationParams) {
      throw new Error(`Strategy ${strategyName} does not have optimization parameters defined`);
    }

    const studyId = `${strategyName}_${Date.now()}`;
    console.log(`🔬 Starting Optuna optimization study: ${studyId}`);

    const config = {
      ...strategy.optimization,
      ...customConfig,
      studyId: studyId,
      strategyName: strategyName,
      datasetParams: datasetParams
    };

    this.currentStudy = {
      id: studyId,
      strategy: strategyName,
      config: config,
      startTime: Date.now(),
      status: 'running',
      trials: [],
      bestParams: null,
      bestValue: null
    };

    // Generate Optuna study configuration
    await this.generateOptunaStudy(strategy, config);
    
    return {
      studyId: studyId,
      status: 'started',
      config: config
    };
  }

  // 📊 GENERATE OPTUNA STUDY SCRIPT
  async generateOptunaStudy(strategy, config) {
    const pythonScript = this.generatePythonScript(strategy, config);
    const scriptPath = path.join(__dirname, 'optuna_studies', `${config.studyId}.py`);
    
    // Create directory if it doesn't exist
    const studiesDir = path.dirname(scriptPath);
    if (!fs.existsSync(studiesDir)) {
      fs.mkdirSync(studiesDir, { recursive: true });
    }
    
    fs.writeFileSync(scriptPath, pythonScript);
    console.log(`📝 Generated Optuna script: ${scriptPath}`);
    
    return scriptPath;
  }

  // 🐍 GENERATE PYTHON OPTIMIZATION SCRIPT
  generatePythonScript(strategy, config) {
    const parameterSampling = this.generateParameterSampling(strategy.optimizationParams);
    const objectiveFunction = this.generateObjectiveFunction(config);
    
    return `#!/usr/bin/env python3
"""
Optuna Optimization Study for ${strategy.name}
Generated automatically by Trade Whisperer backtesting engine
"""

import optuna
import pandas as pd
import numpy as np
import talib
import json
import os
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class StrategyOptimizer:
    def __init__(self):
        self.data_dir = "/app/data"
        self.study_id = "${config.studyId}"
        self.strategy_name = "${config.strategyName}"
        self.dataset_params = ${JSON.stringify(config.datasetParams)}
        
        # Load data directly from container files
        self.stock_data = self.load_stock_data()
        self.options_data = self.load_options_data()
        
    def load_stock_data(self):
        """Load stock data from CSV files in container"""
        ticker = self.dataset_params.get('ticker', 'SPY')
        start_date = self.dataset_params.get('startDate', '2025-10-10')
        end_date = self.dataset_params.get('endDate', '2025-10-11')
        
        # Look for stock files in the data directory
        stock_files = []
        for filename in os.listdir(self.data_dir):
            if f'stock_quotes_{start_date}' in filename or f'stock_trades_{start_date}' in filename:
                stock_files.append(os.path.join(self.data_dir, filename))
        
        if not stock_files:
            logger.warning(f"No stock data files found for {ticker} {start_date}")
            return pd.DataFrame()
            
        # Load and combine data
        dfs = []
        for file_path in stock_files:
            try:
                df = pd.read_csv(file_path)
                dfs.append(df)
            except Exception as e:
                logger.error(f"Error loading {file_path}: {e}")
                
        if dfs:
            combined_df = pd.concat(dfs, ignore_index=True)
            # Ensure proper datetime parsing
            if 'timestamp' in combined_df.columns:
                combined_df['datetime'] = pd.to_datetime(combined_df['timestamp'], unit='ms')
            elif 'datetime' in combined_df.columns:
                combined_df['datetime'] = pd.to_datetime(combined_df['datetime'])
            return combined_df.sort_values('datetime')
        
        return pd.DataFrame()
    
    def load_options_data(self):
        """Load options data from CSV files in container"""
        ticker = self.dataset_params.get('ticker', 'SPY')
        start_date = self.dataset_params.get('startDate', '2025-10-10')
        
        # Look for options files
        options_files = []
        for filename in os.listdir(self.data_dir):
            if f'option_quotes_{start_date}' in filename:
                options_files.append(os.path.join(self.data_dir, filename))
                
        if not options_files:
            logger.warning(f"No options data files found for {ticker} {start_date}")
            return pd.DataFrame()
            
        # Load and combine options data
        dfs = []
        for file_path in options_files:
            try:
                df = pd.read_csv(file_path)
                dfs.append(df)
            except Exception as e:
                logger.error(f"Error loading options {file_path}: {e}")
                
        if dfs:
            return pd.concat(dfs, ignore_index=True)
        
        return pd.DataFrame()
        
    def objective(self, trial):
        """Optuna objective function - runs backtest directly with container data"""
        try:
            if self.stock_data.empty:
                logger.error("No stock data available for optimization")
                return float('-inf')
                
            # Sample parameters
            params = {}
            ${parameterSampling}
            
            # Run backtest simulation directly
            results = self.run_backtest_simulation(params)
            
            if not results:
                return float('-inf')
            
            # Extract objective value
            ${objectiveFunction}
            
            # Apply constraints
            constraints_passed = self.check_constraints(results, trial)
            if not constraints_passed:
                return float('-inf')
                
            logger.info(f"Trial {trial.number}: Sharpe Ratio = {objective_value:.4f}")
            return objective_value
            
        except Exception as e:
            logger.error(f"Trial {trial.number} failed: {str(e)}")
            return float('-inf')
    
    def run_backtest_simulation(self, params):
        """Run backtest simulation directly using loaded data and TA-Lib"""
        try:
            if len(self.stock_data) < 100:
                logger.warning("Insufficient data for backtest")
                return None
                
            # Calculate technical indicators using TA-Lib
            data = self.stock_data.copy()
            
            # VWAP calculation
            data['vwap'] = self.calculate_vwap(data)
            
            # RSI indicators
            data['rsi_2'] = talib.RSI(data['close'].values, timeperiod=params.get('rsiPeriod2', 2))
            data['rsi_9'] = talib.RSI(data['close'].values, timeperiod=params.get('rsiPeriod9', 9))
            data['rsi_14'] = talib.RSI(data['close'].values, timeperiod=14)
            
            # ROC indicators  
            data['roc_3'] = talib.ROC(data['close'].values, timeperiod=params.get('rocPeriod3', 3))
            data['roc_5'] = talib.ROC(data['close'].values, timeperiod=params.get('rocPeriod5', 5))
            
            # MACD
            macd, signal, hist = talib.MACD(data['close'].values)
            data['macd'] = macd
            data['macd_signal'] = signal
            data['macd_histogram'] = hist
            
            # Volume indicators
            data['volume_sma'] = talib.SMA(data['volume'].values, timeperiod=20)
            data['volume_ratio'] = data['volume'] / data['volume_sma']
            
            # Run strategy simulation
            trades = self.simulate_strategy(data, params)
            
            # Calculate performance metrics
            if not trades:
                return {'sharpe_ratio': -999, 'total_return': 0, 'max_drawdown': 100, 'trade_count': 0}
                
            returns = [trade['pnl_pct'] for trade in trades]
            
            metrics = {
                'sharpe_ratio': self.calculate_sharpe_ratio(returns),
                'total_return': sum(returns),
                'max_drawdown': self.calculate_max_drawdown(returns),
                'trade_count': len(trades),
                'win_rate': len([r for r in returns if r > 0]) / len(returns) if returns else 0,
                'avg_return': np.mean(returns) if returns else 0
            }
            
            return metrics
            
        except Exception as e:
            logger.error(f"Backtest simulation failed: {str(e)}")
            return None
    
    def calculate_vwap(self, data):
        """Calculate VWAP indicator"""
        typical_price = (data['high'] + data['low'] + data['close']) / 3
        cumulative_tpv = (typical_price * data['volume']).cumsum()
        cumulative_volume = data['volume'].cumsum()
        return cumulative_tpv / cumulative_volume
    
    def simulate_strategy(self, data, params):
        """Simulate strategy trading logic"""
        trades = []
        position = None
        
        vwap_band = params.get('vwapBandMedium', 0.10) / 100  # Convert to decimal
        
        for i in range(50, len(data)):  # Skip first 50 bars for indicators to settle
            current = data.iloc[i]
            
            # Entry logic (simplified VWAP strategy)
            if position is None:
                price_above_vwap = current['close'] > current['vwap'] * (1 + vwap_band)
                rsi_condition = current['rsi_2'] > 30 and current['rsi_9'] > 50
                roc_condition = current['roc_3'] > 0 or current['roc_5'] > 0
                volume_condition = current['volume_ratio'] >= params.get('volumeImbalanceThreshold', 0.60)
                
                if price_above_vwap and rsi_condition and roc_condition and volume_condition:
                    position = {
                        'entry_price': current['close'],
                        'entry_time': i,
                        'type': 'call'  # Simplified - assume call options
                    }
            
            # Exit logic
            elif position is not None:
                bars_held = i - position['entry_time']
                price_change = (current['close'] - position['entry_price']) / position['entry_price']
                
                # Exit conditions
                take_profit = price_change > 0.12  # 12% gain target
                stop_loss = price_change < -0.09   # -9% stop loss
                time_exit = bars_held > 30         # 30 minute max hold
                rsi_exit = current['rsi_2'] > 80   # RSI overbought exit
                
                if take_profit or stop_loss or time_exit or rsi_exit:
                    # Simulate option P&L (simplified)
                    option_pnl_pct = price_change * 5  # Assume ~5x leverage for ATM options
                    option_pnl_pct = max(option_pnl_pct, -95)  # Cap losses at -95%
                    
                    trades.append({
                        'entry_time': position['entry_time'],
                        'exit_time': i,
                        'entry_price': position['entry_price'],
                        'exit_price': current['close'],
                        'pnl_pct': option_pnl_pct,
                        'bars_held': bars_held
                    })
                    
                    position = None
        
        return trades
    
    def calculate_sharpe_ratio(self, returns):
        """Calculate Sharpe ratio"""
        if not returns or len(returns) < 2:
            return -999
        
        mean_return = np.mean(returns)
        std_return = np.std(returns)
        
        if std_return == 0:
            return 0
            
        # Annualized Sharpe (assuming daily returns)
        sharpe = (mean_return / std_return) * np.sqrt(252)
        return min(sharpe, 10)  # Cap at 10 to avoid extreme values
    
    def calculate_max_drawdown(self, returns):
        """Calculate maximum drawdown"""
        if not returns:
            return 100
            
        cumulative = np.cumprod([1 + r/100 for r in returns])
        running_max = np.maximum.accumulate(cumulative)
        drawdown = (cumulative - running_max) / running_max * 100
        return abs(min(drawdown)) if len(drawdown) > 0 else 0
    
    def check_constraints(self, results, trial):
        """Check if trial meets constraints"""
        strategy_results = results.get('backtest', {}).get('results', {}).get('strategies', {})
        strategy_data = strategy_results.get(self.strategy_name, {})
        performance = strategy_data.get('performance', {})
        
        # Minimum trades constraint
        if performance.get('trades', 0) < ${config.constraints.min_trades}:
            trial.set_user_attr('constraint_violation', 'min_trades')
            return False
            
        # Maximum drawdown constraint
        max_drawdown = abs(performance.get('maxDrawdown', 0))
        if max_drawdown > ${config.constraints.max_drawdown}:
            trial.set_user_attr('constraint_violation', 'max_drawdown')
            return False
            
        # Minimum win rate constraint
        win_rate = performance.get('winRate', 0) / 100.0
        if win_rate < ${config.constraints.min_win_rate}:
            trial.set_user_attr('constraint_violation', 'min_win_rate')
            return False
            
        return True
    
    def run_study(self):
        """Run the optimization study"""
        study = optuna.create_study(
            direction="${config.direction}",
            study_name=self.study_id,
            storage=f"sqlite:///optuna_studies/{config.studyId}.db"
        )
        
        # Add early stopping callback if enabled
        callbacks = []
        ${config.early_stopping.enabled ? `
        callbacks.append(
            optuna.study.MaxTrialsCallback(${config.n_trials})
        )` : ''}
        
        try:
            study.optimize(
                self.objective,
                n_trials=${config.n_trials},
                timeout=${config.timeout},
                callbacks=callbacks,
                n_jobs=1  # Keep single-threaded for API stability
            )
            
            # Save results
            self.save_results(study)
            
        except KeyboardInterrupt:
            logger.info("Optimization interrupted by user")
        except Exception as e:
            logger.error(f"Optimization failed: {str(e)}")
        
        return study
    
    def save_results(self, study):
        """Save optimization results"""
        results = {
            'study_id': self.study_id,
            'strategy_name': self.strategy_name,
            'best_params': study.best_params,
            'best_value': study.best_value,
            'n_trials': len(study.trials),
            'completed_at': datetime.now().isoformat(),
            'trials': []
        }
        
        for trial in study.trials:
            trial_data = {
                'number': trial.number,
                'value': trial.value,
                'params': trial.params,
                'state': trial.state.name,
                'user_attrs': trial.user_attrs
            }
            results['trials'].append(trial_data)
        
        # Save to file
        results_path = f"optuna_studies/{config.studyId}_results.json"
        with open(results_path, 'w') as f:
            json.dump(results, f, indent=2)
        
        # Notify backtesting engine
        try:
            requests.post(
                f"{self.base_url}/api/optimization-completed",
                json=results,
                timeout=30
            )
        except Exception as e:
            logger.error(f"Failed to notify completion: {str(e)}")

if __name__ == "__main__":
    optimizer = StrategyOptimizer()
    study = optimizer.run_study()
    
    print(f"\\nOptimization completed!")
    print(f"Best value: {study.best_value:.4f}")
    print(f"Best parameters: {study.best_params}")
`;
  }

  // 🎛️ GENERATE PARAMETER SAMPLING CODE
  generateParameterSampling(optimizationParams) {
    let samplingCode = '';
    
    for (const [category, params] of Object.entries(optimizationParams)) {
      samplingCode += `            # ${category}\n`;
      
      for (const [paramName, config] of Object.entries(params)) {
        switch (config.type) {
          case 'int':
            samplingCode += `            params['${paramName}'] = trial.suggest_int('${paramName}', ${config.range[0]}, ${config.range[1]})\n`;
            break;
          case 'float':
            samplingCode += `            params['${paramName}'] = trial.suggest_float('${paramName}', ${config.range[0]}, ${config.range[1]})\n`;
            break;
          case 'categorical':
            const choices = JSON.stringify(config.choices);
            samplingCode += `            params['${paramName}'] = trial.suggest_categorical('${paramName}', ${choices})\n`;
            break;
        }
      }
      samplingCode += '\n';
    }
    
    return samplingCode;
  }

  // 🎯 GENERATE OBJECTIVE FUNCTION CODE
  generateObjectiveFunction(config) {
    switch (config.objective) {
      case 'sharpe_ratio':
        return `            objective_value = results.get('sharpe_ratio', -999)`;
      case 'total_return':
        return `            objective_value = results.get('total_return', 0)`;
      case 'win_rate':
        return `            objective_value = results.get('win_rate', 0)`;
      case 'profit_factor':
        return `            
            total_return = results.get('total_return', 0)
            max_drawdown = results.get('max_drawdown', 100)
            objective_value = total_return / max(max_drawdown, 1) if max_drawdown > 0 else 0`;
      default:
        return `            objective_value = results.get('sharpe_ratio', -999)`;
    }
  }

  // 🏃‍♂️ RUN OPTIMIZATION
  async runOptimization(studyId) {
    const scriptPath = path.join(__dirname, 'optuna_studies', `${studyId}.py`);
    
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Optimization script not found: ${scriptPath}`);
    }

    console.log(`🚀 Starting Optuna optimization: ${studyId}`);
    
    try {
      const { stdout, stderr } = await execAsync(`/opt/venv/bin/python ${scriptPath}`);
      
      if (stderr) {
        console.warn('Optimization warnings:', stderr);
      }
      
      console.log('Optimization output:', stdout);
      
      // Load results
      const resultsPath = path.join(__dirname, 'optuna_studies', `${studyId}_results.json`);
      if (fs.existsSync(resultsPath)) {
        const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        this.optimizationResults.set(studyId, results);
        return results;
      }
      
    } catch (error) {
      console.error('Optimization failed:', error);
      throw error;
    }
  }

  // 📊 GET OPTIMIZATION RESULTS
  getOptimizationResults(studyId) {
    return this.optimizationResults.get(studyId);
  }

  // 📈 GET OPTIMIZATION STATUS
  getOptimizationStatus(studyId) {
    if (this.currentStudy && this.currentStudy.id === studyId) {
      return this.currentStudy;
    }
    return null;
  }

  // 🛑 STOP OPTIMIZATION
  stopOptimization(studyId) {
    // In a real implementation, this would send a signal to stop the Python process
    console.log(`🛑 Stopping optimization: ${studyId}`);
    if (this.currentStudy && this.currentStudy.id === studyId) {
      this.currentStudy.status = 'stopped';
    }
  }
}

module.exports = OptunaOptimizer;