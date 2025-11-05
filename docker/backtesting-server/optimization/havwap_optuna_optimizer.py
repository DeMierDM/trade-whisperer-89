"""
HAVWAP Strategy Optuna Hyperparameter Optimization

Python-based optimization using Optuna to find optimal parameters for HAVWAP strategy.
Interfaces with Node.js backtesting engine via HTTP API.
"""

import optuna
import asyncio
import aiohttp
import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional
import logging
import argparse
import os

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class HAVWAPOptunaOptimizer:
    def __init__(self, config: Dict):
        self.config = config
        self.session = None
        self.results = []
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    def define_parameter_spaces(self, trial: optuna.Trial) -> Dict:
        """Define parameter search spaces for Optuna optimization."""
        return {
            # Distance thresholds (most critical parameters)
            'd_entry': trial.suggest_float('d_entry', 0.0005, 0.0050, step=0.0001),
            'd_near': trial.suggest_float('d_near', 0.0002, 0.0015, step=0.0001),
            's_min': trial.suggest_float('s_min', 0.00001, 0.0005, step=0.00001),
            
            # Volatility filters
            'rv_cap': trial.suggest_float('rv_cap', 0.002, 0.008, step=0.0005),
            'iv_chg_cap': trial.suggest_float('iv_chg_cap', 1.5, 5.0, step=0.25),
            
            # Order flow threshold
            'theta_imb': trial.suggest_float('theta_imb', 0.55, 0.80, step=0.05),
            
            # Delta targets
            'deltaTargetReversion': trial.suggest_float('deltaTargetReversion', 0.40, 0.60, step=0.02),
            'deltaTargetTrend': trial.suggest_float('deltaTargetTrend', 0.50, 0.65, step=0.02),
            
            # Exit parameters - REVERSION
            'profitTargetReversion': trial.suggest_float('profitTargetReversion', 0.10, 0.40, step=0.02),
            'stopLossReversion': trial.suggest_float('stopLossReversion', 0.05, 0.20, step=0.01),
            'timeStopReversion': trial.suggest_int('timeStopReversion', 60, 600, step=30),
            
            # Exit parameters - TREND
            'profitTargetTrend': trial.suggest_float('profitTargetTrend', 0.12, 0.45, step=0.02),
            'stopLossTrend': trial.suggest_float('stopLossTrend', 0.08, 0.25, step=0.01),
            'timeStopTrend': trial.suggest_int('timeStopTrend', 120, 900, step=30),
            
            # Option selection
            'maxSpreadPct': trial.suggest_int('maxSpreadPct', 8, 25, step=2),
            'minVolume': trial.suggest_int('minVolume', 0, 5, step=1),
            
            # All-day holding option
            'zeroDTECloseTime': trial.suggest_categorical('zeroDTECloseTime', ['15:30', '15:45', '15:50', '15:55'])
        }

    def get_weekdays(self, start_date: str, end_date: str) -> List[str]:
        """Get list of weekdays between start and end dates."""
        weekdays = []
        current = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
        
        while current <= end:
            # Monday=0, Sunday=6, so weekdays are 0-4
            if current.weekday() < 5:
                weekdays.append(current.strftime('%Y-%m-%d'))
            current += timedelta(days=1)
            
        return weekdays

    async def run_backtest(self, symbol: str, date: str, params: Dict) -> Optional[Dict]:
        """Run a single backtest via HTTP API."""
        backtest_config = {
            'symbol': symbol,
            'strategy': 'HAVWAP-Proper',
            'startDate': date,
            'endDate': date,
            'contracts': self.config['contracts'],
            'maxPositions': self.config['maxPositions'],
            'initialCapital': self.config['initialCapital'],
            'strategyParams': params
        }
        
        try:
            # Create a modified HAVWAP strategy with trial parameters
            strategy_endpoint = f"{self.config['api_base']}/api/backtest/run"
            
            async with self.session.post(strategy_endpoint, json=backtest_config) as response:
                if response.status == 200:
                    result = await response.json()
                    if result.get('success'):
                        backtest_id = result.get('backtestId')
                        
                        # Poll for completion
                        return await self.wait_for_completion(backtest_id)
                    else:
                        logger.warning(f"Backtest failed for {symbol} {date}: {result.get('message')}")
                        return None
                else:
                    logger.error(f"HTTP error {response.status} for {symbol} {date}")
                    return None
                    
        except Exception as e:
            logger.error(f"Backtest error for {symbol} {date}: {e}")
            return None

    async def wait_for_completion(self, backtest_id: int, timeout: int = 120) -> Optional[Dict]:
        """Wait for backtest completion and return results."""
        start_time = datetime.now()
        
        while (datetime.now() - start_time).seconds < timeout:
            try:
                status_endpoint = f"{self.config['api_base']}/api/backtest/status/{backtest_id}"
                async with self.session.get(status_endpoint) as response:
                    if response.status == 200:
                        status = await response.json()
                        
                        if status.get('status') == 'completed':
                            # Fetch results
                            results_endpoint = f"{self.config['api_base']}/api/backtest/results/{backtest_id}"
                            async with self.session.get(results_endpoint) as results_response:
                                if results_response.status == 200:
                                    return await results_response.json()
                                    
                        elif status.get('status') == 'failed':
                            logger.warning(f"Backtest {backtest_id} failed")
                            return None
                            
                # Wait before polling again
                await asyncio.sleep(2)
                
            except Exception as e:
                logger.error(f"Error polling backtest {backtest_id}: {e}")
                return None
                
        logger.warning(f"Backtest {backtest_id} timed out")
        return None

    def calculate_metrics(self, results: List[Dict]) -> Dict:
        """Calculate performance metrics from backtest results."""
        if not results:
            return {
                'total_return': 0,
                'sharpe_ratio': 0,
                'max_drawdown': 1,
                'profit_factor': 0,
                'win_rate': 0,
                'total_trades': 0,
                'validity_score': 0
            }

        returns = []
        total_pnl = 0
        total_trades = 0
        winning_trades = 0
        gross_wins = 0
        gross_losses = 0
        running_balance = self.config['initialCapital']
        peak = self.config['initialCapital']
        max_drawdown = 0

        for result in results:
            if result and result.get('trades'):
                day_pnl = 0
                
                for trade in result['trades']:
                    trade_pnl = trade.get('realized_pnl', 0)
                    total_pnl += trade_pnl
                    day_pnl += trade_pnl
                    total_trades += 1
                    
                    if trade_pnl > 0:
                        winning_trades += 1
                        gross_wins += trade_pnl
                    else:
                        gross_losses += abs(trade_pnl)
                
                running_balance += day_pnl
                
                # Track drawdown
                if running_balance > peak:
                    peak = running_balance
                else:
                    drawdown = (peak - running_balance) / peak
                    max_drawdown = max(max_drawdown, drawdown)
                
                # Daily return
                daily_return = day_pnl / self.config['initialCapital']
                returns.append(daily_return)
            else:
                returns.append(0)

        # Calculate metrics
        total_return = total_pnl / self.config['initialCapital']
        
        if len(returns) > 1:
            avg_return = np.mean(returns)
            volatility = np.std(returns) * np.sqrt(252)  # Annualized
            sharpe_ratio = avg_return * 252 / volatility if volatility > 0 else 0
        else:
            sharpe_ratio = 0

        win_rate = winning_trades / total_trades if total_trades > 0 else 0
        profit_factor = gross_wins / gross_losses if gross_losses > 0 else (999 if gross_wins > 0 else 0)

        # Validity score
        validity_score = 0
        if total_trades >= self.config['min_trades']:
            validity_score += 0.4
        if max_drawdown <= self.config['max_drawdown']:
            validity_score += 0.3
        if sharpe_ratio > 0:
            validity_score += 0.2
        if profit_factor > 1.0:
            validity_score += 0.1

        return {
            'total_return': total_return,
            'sharpe_ratio': sharpe_ratio,
            'max_drawdown': max_drawdown,
            'profit_factor': profit_factor,
            'win_rate': win_rate,
            'total_trades': total_trades,
            'validity_score': validity_score
        }

    async def objective(self, trial: optuna.Trial) -> float:
        """Objective function for Optuna optimization."""
        logger.info(f"\n🔬 OPTUNA Trial {trial.number}:")
        
        # Get parameter suggestions
        params = self.define_parameter_spaces(trial)
        logger.info(f"   Parameters: d_entry={params['d_entry']:.4f}, d_near={params['d_near']:.4f}, s_min={params['s_min']:.6f}")
        
        # Get test dates
        weekdays = self.get_weekdays(self.config['start_date'], self.config['end_date'])
        logger.info(f"   Testing across {len(weekdays)} trading days")
        
        all_results = []
        total_backtests = 0
        successful_backtests = 0
        
        # Test each symbol across all days
        for symbol in self.config['symbols']:
            for date in weekdays:
                total_backtests += 1
                result = await self.run_backtest(symbol, date, params)
                
                if result:
                    all_results.append(result)
                    successful_backtests += 1
        
        logger.info(f"   ✅ Completed {successful_backtests}/{total_backtests} backtests")
        
        # Calculate metrics
        metrics = self.calculate_metrics(all_results)
        
        logger.info(f"   📊 Results: Return={metrics['total_return']*100:.2f}%, Sharpe={metrics['sharpe_ratio']:.3f}, Trades={metrics['total_trades']}")
        
        # Store result
        self.results.append({
            'trial_number': trial.number,
            'parameters': params,
            'metrics': metrics,
            'successful_backtests': successful_backtests,
            'total_backtests': total_backtests
        })
        
        # Calculate objective score
        if metrics['validity_score'] < 0.5:
            objective_score = -1000
        else:
            if self.config['primary_metric'] == 'sharpe_ratio':
                objective_score = metrics['sharpe_ratio'] * 0.7 + metrics['total_return'] * 0.3
            elif self.config['primary_metric'] == 'total_return':
                objective_score = metrics['total_return'] * 0.7 + metrics['sharpe_ratio'] * 0.3
            else:
                objective_score = np.log(metrics['profit_factor']) * 0.6 + metrics['sharpe_ratio'] * 0.4
            
            # Penalty for excessive drawdown
            if metrics['max_drawdown'] > self.config['max_drawdown']:
                objective_score *= (1 - metrics['max_drawdown'])
        
        logger.info(f"   🎯 Objective Score: {objective_score:.4f}")
        return objective_score

    async def run_optimization(self) -> Dict:
        """Run the Optuna optimization study."""
        logger.info(f"\n🚀 Starting HAVWAP Optuna Optimization:")
        logger.info(f"   Study: {self.config['study_name']}")
        logger.info(f"   Trials: {self.config['n_trials']}")
        logger.info(f"   Period: {self.config['start_date']} to {self.config['end_date']}")
        logger.info(f"   Symbols: {', '.join(self.config['symbols'])}")
        
        # Create study
        study = optuna.create_study(
            study_name=self.config['study_name'],
            direction='maximize',
            sampler=optuna.samplers.TPESampler(
                n_startup_trials=50,
                n_ei_candidates=24,
                seed=42
            ),
            pruner=optuna.pruners.MedianPruner(
                n_startup_trials=25,
                n_warmup_steps=5
            )
        )
        
        # Run optimization
        await asyncio.get_event_loop().run_in_executor(
            None, 
            study.optimize, 
            self.objective, 
            self.config['n_trials']
        )
        
        logger.info(f"\n✅ Optimization completed!")
        
        # Get best parameters
        best_params = study.best_params
        best_value = study.best_value
        
        logger.info(f"\n🏆 BEST PARAMETERS (Score: {best_value:.4f}):")
        logger.info(f"   Distance: d_entry={best_params['d_entry']:.4f}, d_near={best_params['d_near']:.4f}")
        logger.info(f"   Slope: s_min={best_params['s_min']:.6f}")
        logger.info(f"   Volatility: rv_cap={best_params['rv_cap']:.4f}")
        
        # Save results
        self.save_results(best_params, best_value, study)
        
        return {
            'best_parameters': best_params,
            'best_score': best_value,
            'study': study,
            'all_results': self.results
        }

    def save_results(self, best_params: Dict, best_score: float, study: optuna.Study):
        """Save optimization results to file."""
        results = {
            'optimization_config': self.config,
            'best_parameters': best_params,
            'best_score': best_score,
            'all_trials': self.results,
            'timestamp': datetime.now().isoformat(),
            'study_stats': {
                'n_trials': len(study.trials),
                'best_trial': study.best_trial.number
            }
        }
        
        os.makedirs('optimization/results', exist_ok=True)
        filename = f"optimization/results/havwap_optimization_{int(datetime.now().timestamp())}.json"
        
        with open(filename, 'w') as f:
            json.dump(results, f, indent=2)
        
        logger.info(f"💾 Results saved to: {filename}")

async def main():
    """Main optimization function."""
    parser = argparse.ArgumentParser(description='HAVWAP Strategy Optuna Optimization')
    parser.add_argument('--config', help='Configuration file path')
    parser.add_argument('--trials', type=int, default=200, help='Number of optimization trials')
    parser.add_argument('--api-base', default='http://localhost:3002', help='Backtesting API base URL')
    
    args = parser.parse_args()
    
    # Default configuration
    config = {
        'n_trials': args.trials,
        'study_name': f'havwap-opt-{int(datetime.now().timestamp())}',
        'start_date': '2024-10-01',
        'end_date': '2024-10-25',
        'symbols': ['SPY', 'QQQ'],
        'initialCapital': 10000,
        'maxPositions': 1,
        'contracts': 1,
        'primary_metric': 'sharpe_ratio',
        'max_drawdown': 0.15,
        'min_trades': 15,
        'api_base': args.api_base
    }
    
    # Load custom config if provided
    if args.config and os.path.exists(args.config):
        with open(args.config, 'r') as f:
            custom_config = json.load(f)
            config.update(custom_config)
        logger.info(f"✅ Loaded custom config from: {args.config}")
    
    # Run optimization
    async with HAVWAPOptunaOptimizer(config) as optimizer:
        results = await optimizer.run_optimization()
        return results

if __name__ == "__main__":
    asyncio.run(main())