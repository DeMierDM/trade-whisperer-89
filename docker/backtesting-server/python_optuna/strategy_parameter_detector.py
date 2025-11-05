#!/usr/bin/env python3
"""
Universal Strategy Parameter Detection System
Automatically discovers and optimizes parameters for any trading strategy
"""

import json
import re
import os
from typing import Dict, List, Any, Tuple
import ast

class StrategyParameterDetector:
    def __init__(self, strategies_path: str = "/app/strategies"):
        self.strategies_path = strategies_path
        self.parameter_configs = self.load_parameter_configs()
    
    def load_parameter_configs(self) -> Dict:
        """Load parameter configuration templates for different parameter types"""
        return {
            # Price/percentage parameters (0.1% to 50%) - More aggressive ranges
            'percentage': {'min': 0.001, 'max': 0.5, 'type': 'float'},
            
            # Period parameters (2 to 100 bars) - Extended for more variety
            'period': {'min': 2, 'max': 100, 'type': 'int'},
            
            # Time parameters (5 seconds to 60 minutes) - Much wider range
            'time_seconds': {'min': 5, 'max': 3600, 'type': 'int'},
            'time_minutes': {'min': 1, 'max': 60, 'type': 'int'},
            
            # Delta parameters (0.05 to 0.95) - Wider range for more options
            'delta': {'min': 0.05, 'max': 0.95, 'type': 'float'},
            
            # Volatility parameters (0.01% to 20%) - Much wider for all market conditions
            'volatility': {'min': 0.0001, 'max': 0.2, 'type': 'float'},
            
            # RSI levels (5 to 95) - Extreme levels allowed
            'rsi_level': {'min': 5, 'max': 95, 'type': 'float'},
            
            # Standard deviation multipliers (0.1 to 6.0) - Wider range
            'std_multiplier': {'min': 0.1, 'max': 6.0, 'type': 'float'},
            
            # Volume thresholds (0.1 to 10.0) - Much wider range
            'volume_threshold': {'min': 0.1, 'max': 10.0, 'type': 'float'},
            
            # Spread percentages (0.5% to 75%) - Wider range
            'spread_pct': {'min': 0.5, 'max': 75.0, 'type': 'float'},
            
            # Count parameters (1 to 500) - MASSIVE increase for high frequency
            'count': {'min': 1, 'max': 500, 'type': 'int'},
            
            # Distance parameters (much smaller for high frequency entry)
            'distance': {'min': 0.00001, 'max': 0.05, 'type': 'float'},
            
            # Slope parameters (much smaller thresholds for frequent signals)
            'slope': {'min': 0.000001, 'max': 0.05, 'type': 'float'},
            
            # Position sizing parameters (1 to 350 contracts per trade)
            'position_size': {'min': 1, 'max': 350, 'type': 'int'},
            
            # Max positions (1 to 3 simultaneous positions) 
            'max_positions': {'min': 1, 'max': 3, 'type': 'int'},
            
            # Anchor strategies
            'anchor_strategy': {
                'values': ['hourly', 'half_hour', 'fifteen', 'key_times', 'volume_based'],
                'type': 'categorical'
            }
        }
    
    def analyze_strategy_file(self, strategy_path: str) -> Dict[str, Any]:
        """Analyze a strategy file to extract parameter information"""
        try:
            with open(strategy_path, 'r') as f:
                content = f.read()
            
            parameters = {}
            
            # Extract constructor parameters
            constructor_params = self.extract_constructor_parameters(content)
            parameters.update(constructor_params)
            
            # Extract this.property assignments
            property_params = self.extract_property_parameters(content)
            parameters.update(property_params)
            
            # Extract comments with parameter hints
            comment_params = self.extract_comment_parameters(content)
            parameters.update(comment_params)
            
            return {
                'strategy_name': os.path.basename(strategy_path).replace('.js', ''),
                'parameters': parameters,
                'file_path': strategy_path
            }
            
        except Exception as e:
            print(f"Error analyzing {strategy_path}: {e}")
            return {'strategy_name': 'unknown', 'parameters': {}, 'file_path': strategy_path}
    
    def extract_constructor_parameters(self, content: str) -> Dict[str, Dict]:
        """Extract parameters from constructor with params.paramName || defaultValue patterns"""
        parameters = {}
        
        # Pattern: this.paramName = params.paramName || defaultValue;
        pattern = r'this\.(\w+)\s*=\s*params\.(\w+)\s*\|\|\s*([^;]+);'
        matches = re.findall(pattern, content, re.MULTILINE)
        
        for prop_name, param_name, default_value in matches:
            param_config = self.classify_parameter(param_name, default_value.strip())
            if param_config:
                parameters[param_name] = param_config
        
        return parameters
    
    def extract_property_parameters(self, content: str) -> Dict[str, Dict]:
        """Extract direct property assignments that might be parameters"""
        parameters = {}
        
        # Pattern: this.paramName = value; (with comments)
        pattern = r'this\.(\w+)\s*=\s*([^;]+);\s*(?://\s*(.*))?'
        matches = re.findall(pattern, content, re.MULTILINE)
        
        for prop_name, value, comment in matches:
            # Skip if it's a function call or complex expression
            if '(' in value or '{' in value or 'new ' in value:
                continue
                
            param_config = self.classify_parameter(prop_name, value.strip(), comment)
            if param_config:
                parameters[prop_name] = param_config
        
        return parameters
    
    def extract_comment_parameters(self, content: str) -> Dict[str, Dict]:
        """Extract parameter hints from comments"""
        parameters = {}
        
        # Look for parameter documentation in comments
        comment_patterns = [
            r'@param\s+(\w+)\s+([^@\n]+)',  # JSDoc style
            r'//\s*(\w+):\s*([^,\n]+)',     # Simple comment style
            r'/\*\*?\s*(\w+)\s*([^*]+)\*/'  # Block comment style
        ]
        
        for pattern in comment_patterns:
            matches = re.findall(pattern, content, re.MULTILINE | re.DOTALL)
            for param_name, description in matches:
                param_config = self.classify_parameter_from_description(param_name, description)
                if param_config:
                    parameters[param_name] = param_config
        
        return parameters
    
    def classify_parameter(self, param_name: str, default_value: str, comment: str = "") -> Dict[str, Any]:
        """Classify a parameter based on its name, default value, and comment"""
        param_name_lower = param_name.lower()
        
        # Clean default value
        default_value = default_value.strip().strip('"\'')
        
        # Try to parse numeric default
        try:
            numeric_default = float(default_value)
        except:
            numeric_default = None
        
        # Categorical parameters
        if 'strategy' in param_name_lower:
            if 'anchor' in param_name_lower:
                return {**self.parameter_configs['anchor_strategy'], 'default': default_value}
        
        # Time-based parameters
        if any(word in param_name_lower for word in ['time', 'duration', 'period', 'interval']):
            if 'minute' in param_name_lower or 'min' in comment.lower():
                return {**self.parameter_configs['time_minutes'], 'default': numeric_default}
            elif any(word in param_name_lower for word in ['stop', 'timeout', 'hold']):
                return {**self.parameter_configs['time_seconds'], 'default': numeric_default}
            else:
                return {**self.parameter_configs['period'], 'default': numeric_default}
        
        # RSI parameters
        if 'rsi' in param_name_lower:
            if any(word in param_name_lower for word in ['period', 'length']):
                return {**self.parameter_configs['period'], 'default': numeric_default}
            elif any(word in param_name_lower for word in ['oversold', 'overbought', 'level']):
                return {**self.parameter_configs['rsi_level'], 'default': numeric_default}
        
        # Bollinger Band parameters
        if 'bb' in param_name_lower or 'bollinger' in param_name_lower:
            if 'period' in param_name_lower:
                return {**self.parameter_configs['period'], 'default': numeric_default}
            elif 'std' in param_name_lower or 'deviation' in param_name_lower:
                return {**self.parameter_configs['std_multiplier'], 'default': numeric_default}
        
        # Delta parameters
        if 'delta' in param_name_lower:
            return {**self.parameter_configs['delta'], 'default': numeric_default}
        
        # Volume parameters
        if 'volume' in param_name_lower:
            if 'threshold' in param_name_lower:
                return {**self.parameter_configs['volume_threshold'], 'default': numeric_default}
            elif 'period' in param_name_lower:
                return {**self.parameter_configs['period'], 'default': numeric_default}
            elif 'min' in param_name_lower:
                return {**self.parameter_configs['count'], 'default': numeric_default}
        
        # Spread parameters
        if 'spread' in param_name_lower and 'pct' in param_name_lower:
            return {**self.parameter_configs['spread_pct'], 'default': numeric_default}
        
        # Distance and entry parameters
        if any(word in param_name_lower for word in ['distance', 'd_entry', 'd_near', 'd_exit']):
            return {**self.parameter_configs['distance'], 'default': numeric_default}
        
        # Slope parameters
        if 'slope' in param_name_lower or 's_min' in param_name_lower:
            return {**self.parameter_configs['slope'], 'default': numeric_default}
        
        # Volatility parameters
        if any(word in param_name_lower for word in ['volatility', 'vol', 'rv_cap', 'iv_chg']):
            return {**self.parameter_configs['volatility'], 'default': numeric_default}
        
        # Profit/loss parameters
        if any(word in param_name_lower for word in ['profit', 'stop', 'loss', 'target']):
            return {**self.parameter_configs['percentage'], 'default': numeric_default}
        
        # Count parameters
        if any(word in param_name_lower for word in ['count', 'number', 'num', 'anchor_count']):
            return {**self.parameter_configs['count'], 'default': numeric_default}
        
        # Position sizing parameters
        if any(word in param_name_lower for word in ['contract', 'position', 'size', 'quantity']):
            if 'max' in param_name_lower:
                return {**self.parameter_configs['max_positions'], 'default': numeric_default}
            else:
                return {**self.parameter_configs['position_size'], 'default': numeric_default}
        
        # Max positions parameters
        if any(word in param_name_lower for word in ['maxpositions', 'max_positions', 'simultaneous']):
            return {**self.parameter_configs['max_positions'], 'default': numeric_default}
        
        # Generic numeric parameter based on default value
        if numeric_default is not None:
            if 0 <= numeric_default <= 1:
                return {**self.parameter_configs['percentage'], 'default': numeric_default}
            elif 1 <= numeric_default <= 100:
                return {**self.parameter_configs['period'], 'default': numeric_default}
            else:
                return {'min': numeric_default * 0.1, 'max': numeric_default * 10, 'type': 'float', 'default': numeric_default}
        
        return None
    
    def classify_parameter_from_description(self, param_name: str, description: str) -> Dict[str, Any]:
        """Classify parameter based on description text"""
        desc_lower = description.lower()
        
        # Look for range hints in description
        range_match = re.search(r'(\d+(?:\.\d+)?)\s*[-–to]\s*(\d+(?:\.\d+)?)', desc_lower)
        if range_match:
            min_val, max_val = float(range_match.group(1)), float(range_match.group(2))
            param_type = 'int' if '.' not in range_match.group(1) and '.' not in range_match.group(2) else 'float'
            return {'min': min_val, 'max': max_val, 'type': param_type}
        
        # Look for percentage indicators
        if '%' in desc_lower or 'percent' in desc_lower:
            return self.parameter_configs['percentage']
        
        # Look for time indicators
        if any(word in desc_lower for word in ['second', 'minute', 'hour', 'time']):
            if 'minute' in desc_lower:
                return self.parameter_configs['time_minutes']
            else:
                return self.parameter_configs['time_seconds']
        
        return None
    
    def discover_all_strategies(self) -> Dict[str, Dict]:
        """Discover all strategies and their parameters"""
        strategies = {}
        
        if not os.path.exists(self.strategies_path):
            print(f"Strategies path not found: {self.strategies_path}")
            return strategies
        
        for filename in os.listdir(self.strategies_path):
            if filename.endswith('.js'):
                strategy_path = os.path.join(self.strategies_path, filename)
                strategy_info = self.analyze_strategy_file(strategy_path)
                strategies[strategy_info['strategy_name']] = strategy_info
        
        return strategies
    
    def generate_optuna_parameters(self, strategy_name: str, trial) -> Dict[str, Any]:
        """Generate Optuna trial parameters for a specific strategy"""
        strategies = self.discover_all_strategies()
        
        if strategy_name not in strategies:
            raise ValueError(f"Strategy {strategy_name} not found. Available: {list(strategies.keys())}")
        
        strategy_params = strategies[strategy_name]['parameters']
        optuna_params = {}
        
        for param_name, param_config in strategy_params.items():
            if param_config['type'] == 'float':
                optuna_params[param_name] = trial.suggest_float(
                    param_name, 
                    param_config['min'], 
                    param_config['max']
                )
            elif param_config['type'] == 'int':
                optuna_params[param_name] = trial.suggest_int(
                    param_name, 
                    int(param_config['min']), 
                    int(param_config['max'])
                )
            elif param_config['type'] == 'categorical':
                optuna_params[param_name] = trial.suggest_categorical(
                    param_name, 
                    param_config['values']
                )
        
        return optuna_params
    
    def save_strategy_configs(self, output_path: str):
        """Save discovered strategy configurations to a file"""
        strategies = self.discover_all_strategies()
        
        with open(output_path, 'w') as f:
            json.dump(strategies, f, indent=2)
        
        print(f"Strategy configurations saved to: {output_path}")
        return strategies

def main():
    """Test the parameter detection system"""
    detector = StrategyParameterDetector()
    
    print("🔍 Discovering all strategies...")
    strategies = detector.discover_all_strategies()
    
    for strategy_name, strategy_info in strategies.items():
        print(f"\n📊 Strategy: {strategy_name}")
        print(f"   Parameters found: {len(strategy_info['parameters'])}")
        
        for param_name, param_config in strategy_info['parameters'].items():
            if param_config['type'] == 'categorical':
                print(f"   {param_name}: {param_config['values']} (categorical)")
            else:
                print(f"   {param_name}: {param_config['min']:.4f} - {param_config['max']:.4f} ({param_config['type']})")
    
    # Save configurations
    detector.save_strategy_configs('/app/strategy_configs.json')

if __name__ == "__main__":
    main()