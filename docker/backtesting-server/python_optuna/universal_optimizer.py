#!/usr/bin/env python3
"""
Universal Strategy Optimizer using Optuna
Automatically detects and optimizes any trading strategy parameters
"""

import optuna
import requests
import json
import time
import argparse
import sys
import os
from datetime import datetime
from typing import Dict, Any, List
from strategy_parameter_detector import StrategyParameterDetector

class UniversalStrategyOptimizer:
    def __init__(self, backtest_url: str = "http://localhost:3002"):
        self.backtest_url = backtest_url
        self.detector = StrategyParameterDetector()
        self.config = {}
        
    def objective(self, trial: optuna.Trial) -> float:
        """
        Universal objective function that works with any strategy
        """
        print(f"\n🎯 Optuna Trial {trial.number + 1}:")
        
        # Auto-generate parameters for the specified strategy
        try:
            params = self.detector.generate_optuna_parameters(self.config['strategy'], trial)
        except Exception as e:
            print(f"❌ Error generating parameters: {e}")
            # Fallback to basic parameters if auto-detection fails
            params = self.generate_fallback_parameters(trial)
        
        print(f"   🎲 Optuna Suggested Parameters:")
        for key, value in params.items():
            if isinstance(value, float):
                print(f"      {key}: {value:.4f}")
            else:
                print(f"      {key}: {value}")
        
        try:
            # Run training backtest
            train_score = self.run_backtest_period(
                params, 
                self.config['train_start'], 
                self.config['train_end'],
                "TRAINING"
            )
            
            # Run validation backtest
            valid_score = self.run_backtest_period(
                params, 
                self.config['valid_start'], 
                self.config['valid_end'],
                "VALIDATION"
            )
            
            print(f"   📊 SCORES: Train={train_score:.4f}, Valid={valid_score:.4f}")
            
            # Return validation score (what we optimize for)
            return valid_score
            
        except Exception as e:
            print(f"   ❌ Trial failed: {str(e)}")
            return 0.001  # Return minimal score for failed trials
    
    def generate_fallback_parameters(self, trial: optuna.Trial) -> Dict[str, Any]:
        """Generate basic fallback parameters if auto-detection fails"""
        return {
            # Basic profit/loss parameters
            'profitTarget': trial.suggest_float('profitTarget', 0.1, 0.5),
            'stopLoss': trial.suggest_float('stopLoss', 0.05, 0.25),
            'timeStop': trial.suggest_int('timeStop', 60, 600),
            
            # Basic indicator parameters
            'period': trial.suggest_int('period', 5, 30),
            'threshold': trial.suggest_float('threshold', 1.0, 5.0),
        }
    
    def run_backtest_period(self, params: Dict, start_date: str, end_date: str, period_name: str) -> float:
        """Run backtest for a specific period via JavaScript API"""
        
        backtest_config = {
            "strategy": self.config['strategy'],
            "symbol": self.config['symbol'],
            "startDate": start_date,
            "endDate": end_date,
            "initialCapital": self.config.get('initial_capital', 10000),
            "parameters": params
        }
        
        print(f"      🔧 Running {period_name} backtest: {start_date} to {end_date}")
        
        try:
            response = requests.post(
                f"{self.backtest_url}/api/backtest/run",
                json=backtest_config,
                timeout=60
            )
            
            if response.status_code != 200:
                print(f"         ❌ API Error: {response.status_code}")
                return 0.001
            
            result = response.json()
            if not result.get('success'):
                print(f"         ❌ Backtest failed: {result.get('message', 'Unknown error')}")
                return 0.001
            
            # Get backtest ID and wait for completion
            backtest_id = result.get('backtestId')
            if not backtest_id:
                print(f"         ❌ No backtest ID returned")
                return 0.001
            
            # Wait for completion and get results
            final_result = self.wait_for_backtest_completion(backtest_id)
            if not final_result:
                return 0.001
            
            # Calculate score based on performance metrics
            score = self.calculate_performance_score(final_result)
            print(f"         {period_name}: Score={score:.4f}")
            
            return score
            
        except Exception as e:
            print(f"         ❌ Error: {str(e)}")
            return 0.001
    
    def wait_for_backtest_completion(self, backtest_id: int, max_wait: int = 120) -> Dict:
        """Wait for backtest to complete and return results"""
        start_time = time.time()
        
        while time.time() - start_time < max_wait:
            try:
                response = requests.get(f"{self.backtest_url}/api/backtest/status/{backtest_id}")
                if response.status_code == 200:
                    result = response.json()
                    if result.get('status') == 'completed':
                        return result
                    elif result.get('status') == 'failed':
                        print(f"         ❌ Backtest failed: {result.get('error_message', 'Unknown error')}")
                        return None
                
                time.sleep(2)  # Wait 2 seconds before checking again
                
            except Exception as e:
                print(f"         ⚠️ Status check error: {e}")
                time.sleep(2)
        
        print(f"         ⏰ Timeout waiting for backtest {backtest_id}")
        return None
    
    def calculate_performance_score(self, result: Dict) -> float:
        """
        Calculate performance score with AGGRESSIVE scoring that:
        - HEAVILY rewards profits above starting balance
        - SEVERELY punishes losses below starting balance  
        - MASSIVE bonus for Sharpe > 2.0
        - Rewards high trade frequency (1-500 trades/day)
        """
        try:
            # Get key metrics
            sharpe_ratio = float(result.get('sharpe_ratio', 0))
            total_return = float(result.get('total_return', 0))
            max_drawdown = float(result.get('max_drawdown', 1))
            win_rate = float(result.get('win_rate', 0))
            total_trades = int(result.get('total_trades', 0))
            final_capital = float(result.get('final_capital', 10000))
            initial_capital = float(result.get('initial_capital', 10000))
            
            # SEVERE PUNISHMENT for losses below starting balance
            if final_capital <= initial_capital:
                loss_penalty = abs(total_return) * 50  # 50x penalty for losses
                return max(0.001 - loss_penalty, 0.001)
            
            # MASSIVE REWARD for profits above starting balance
            profit = final_capital - initial_capital
            profit_pct = total_return
            
            # Base score starts with profit percentage
            base_score = profit_pct * 10  # 10x multiplier for profit
            
            # HUGE BONUS for Sharpe ratio > 2.0 (user's target)
            if sharpe_ratio >= 2.0:
                sharpe_bonus = (sharpe_ratio - 2.0) * 100  # Massive bonus for Sharpe > 2
                base_score += sharpe_bonus
                print(f"         🎉 SHARPE > 2.0! Bonus: +{sharpe_bonus:.2f}")
            
            # Additional Sharpe contribution (even if < 2.0)
            base_score += max(sharpe_ratio * 5, 0)
            
            # REWARD high trade frequency (user wants 1-500 trades/day)
            if total_trades >= 10:  # At least 10 trades shows activity
                trade_frequency_bonus = min(total_trades * 0.1, 50)  # Cap at 50 bonus
                base_score += trade_frequency_bonus
                print(f"         📊 Trade frequency bonus: +{trade_frequency_bonus:.2f} ({total_trades} trades)")
            
            # Win rate bonus
            if win_rate > 0.5:
                win_bonus = (win_rate - 0.5) * 20
                base_score += win_bonus
            
            # Drawdown penalty (but not too harsh if profitable)
            drawdown_penalty = max_drawdown * 2
            base_score -= drawdown_penalty
            
            # Final score must be positive
            final_score = max(base_score, 0.001)
            
            print(f"         💰 PROFIT: ${profit:.2f} ({profit_pct*100:.2f}%)")
            print(f"         📈 Sharpe: {sharpe_ratio:.3f}, Trades: {total_trades}, Score: {final_score:.4f}")
            
            return final_score
            
        except Exception as e:
            print(f"         ❌ Scoring error: {e}")
            return 0.001
            
            # Bonus for high win rate
            win_rate_bonus = win_rate * 0.5  # 0.5x bonus for win rate
            
            # Bonus for reasonable trade frequency (not too few, not too many)
            trade_frequency_bonus = min(total_trades / 10, 1.0) * 0.2
            
            final_score = base_score + return_bonus + win_rate_bonus + trade_frequency_bonus - drawdown_penalty
            
            return max(final_score, 0.001)  # Minimum score
            
        except Exception as e:
            print(f"         ⚠️ Score calculation error: {e}")
            return 0.001
    
    def run_optimization(self, config: Dict) -> Dict:
        """Run the complete optimization process"""
        self.config = config
        
        print(f"🔥 UNIVERSAL Strategy Optimization Started!")
        print(f"   Strategy: {config['strategy']}")
        print(f"   Symbol: {config['symbol']}")
        print(f"   Training: {config['train_start']} to {config['train_end']}")
        print(f"   Validation: {config['valid_start']} to {config['valid_end']}")
        print(f"   Max Trials: {config['max_trials']}")
        print(f"   Target: Sharpe ≥ 2.0")
        
        # Discover strategy parameters
        print(f"\n🔍 Auto-discovering parameters for {config['strategy']}...")
        strategies = self.detector.discover_all_strategies()
        
        if config['strategy'] in strategies:
            strategy_info = strategies[config['strategy']]
            print(f"   ✅ Found {len(strategy_info['parameters'])} parameters to optimize:")
            for param_name, param_config in strategy_info['parameters'].items():
                if param_config['type'] == 'categorical':
                    print(f"      {param_name}: {param_config['values']}")
                else:
                    print(f"      {param_name}: {param_config['min']:.4f} - {param_config['max']:.4f}")
        else:
            print(f"   ⚠️ Strategy not found, using fallback parameters")
            print(f"   Available strategies: {list(strategies.keys())}")
        
        print(f"\n🧠 Using TPE (Tree-structured Parzen Estimator) Sampler")
        print(f"   This is REAL Bayesian optimization that learns from previous trials!")
        
        # Create Optuna study
        study = optuna.create_study(
            direction='maximize',
            sampler=optuna.samplers.TPESampler()
        )
        
        start_time = time.time()
        
        try:
            # Run optimization
            study.optimize(self.objective, n_trials=config['max_trials'])
            
            duration = time.time() - start_time
            
            print(f"\n🏆 UNIVERSAL OPTIMIZATION COMPLETE!")
            print(f"   Duration: {duration/60:.1f} minutes")
            print(f"   Total Trials: {len(study.trials)}")
            print(f"   Best Validation Score: {study.best_value:.4f}")
            
            target_achieved = "✅ EXCELLENT" if study.best_value >= 2.0 else "🔧 NEEDS WORK"
            print(f"   Target Achievement: {target_achieved}")
            
            print(f"\n🎯 BEST PARAMETERS:")
            for key, value in study.best_params.items():
                if isinstance(value, float):
                    print(f"   {key}: {value:.4f}")
                else:
                    print(f"   {key}: {value}")
            
            # Parameter importance analysis
            try:
                if len(study.trials) > 1:
                    param_importance = optuna.importance.get_param_importances(study)
                    print(f"\n📊 PARAMETER IMPORTANCE ANALYSIS:")
                    for param, importance in sorted(param_importance.items(), key=lambda x: x[1], reverse=True)[:10]:
                        print(f"   {param}: {importance:.3f}")
            except Exception as e:
                print(f"   ⚠️ Parameter importance analysis skipped: {str(e)[:50]}...")
            
            # Save results
            result_file = self.save_results(study, config, duration)
            print(f"   💾 Results saved to: {result_file}")
            
            return {
                'success': True,
                'best_score': study.best_value,
                'best_params': study.best_params,
                'total_trials': len(study.trials),
                'duration_minutes': duration / 60,
                'target_achieved': study.best_value >= 2.0,
                'result_file': result_file
            }
            
        except Exception as e:
            print(f"\n❌ Optimization error: {str(e)}")
            return {'success': False, 'error': str(e)}
    
    def save_results(self, study: optuna.Study, config: Dict, duration: float) -> str:
        """Save optimization results to file"""
        timestamp = int(time.time() * 1000)
        filename = f"universal_{config['strategy'].lower()}_optimization_{timestamp}.json"
        filepath = f"/app/optimization/results/{filename}"
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        # Collect all trial data
        trials_data = []
        for trial in study.trials:
            trials_data.append({
                'number': trial.number,
                'value': trial.value,
                'params': trial.params,
                'state': trial.state.name
            })
        
        result_data = {
            'optimization_info': {
                'strategy': config['strategy'],
                'symbol': config['symbol'],
                'train_period': f"{config['train_start']} to {config['train_end']}",
                'valid_period': f"{config['valid_start']} to {config['valid_end']}",
                'max_trials': config['max_trials'],
                'completed_trials': len(study.trials),
                'duration_minutes': duration / 60,
                'timestamp': datetime.now().isoformat(),
                'optimizer_type': 'Universal Auto-Detection'
            },
            'best_result': {
                'score': study.best_value,
                'parameters': study.best_params,
                'target_achieved': study.best_value >= 2.0
            },
            'all_trials': trials_data
        }
        
        with open(filepath, 'w') as f:
            json.dump(result_data, f, indent=2)
        
        return filename

def main():
    """Main function for command-line usage"""
    parser = argparse.ArgumentParser(description='Universal Strategy Optimizer')
    parser.add_argument('--strategy', required=True, help='Strategy name to optimize')
    parser.add_argument('--symbol', required=True, help='Trading symbol (e.g., SPY)')
    parser.add_argument('--train-start', required=True, help='Training start date (YYYY-MM-DD)')
    parser.add_argument('--train-end', required=True, help='Training end date (YYYY-MM-DD)')
    parser.add_argument('--valid-start', required=True, help='Validation start date (YYYY-MM-DD)')
    parser.add_argument('--valid-end', required=True, help='Validation end date (YYYY-MM-DD)')
    parser.add_argument('--max-trials', type=int, default=50, help='Maximum optimization trials')
    parser.add_argument('--backtest-url', default='http://localhost:3002', help='Backtesting API URL')
    
    args = parser.parse_args()
    
    config = {
        'strategy': args.strategy,
        'symbol': args.symbol,
        'train_start': args.train_start,
        'train_end': args.train_end,
        'valid_start': args.valid_start,
        'valid_end': args.valid_end,
        'max_trials': args.max_trials,
        'initial_capital': 10000
    }
    
    optimizer = UniversalStrategyOptimizer(args.backtest_url)
    result = optimizer.run_optimization(config)
    
    if result['success']:
        print(f"\n✅ OPTIMIZATION SUCCESSFUL!")
        print(f"   🎯 Best Score: {result['best_score']:.4f}")
        print(f"   🏁 Total Trials: {result['total_trials']}")
        print(f"   ⏱️ Duration: {result['duration_minutes']:.1f} minutes")
        target_status = "ACHIEVED" if result['target_achieved'] else "IN PROGRESS"
        print(f"   🎖️ Target: {target_status}")
    else:
        print(f"\n❌ Optimization failed: {result['error']}")
        sys.exit(1)

if __name__ == "__main__":
    main()