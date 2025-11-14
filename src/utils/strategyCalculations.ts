// Strategy configuration and expected outcome calculation
interface StrategyParameters {
  rsi_overbought?: number;
  rsi_oversold?: number;
  vwap_threshold?: number;
  profit_target?: number;
  stop_loss?: number;
  max_hold_time_minutes?: number;
  position_size_pct?: number;
}

interface StrategyOutcome {
  profit_target_price: number;
  stop_loss_price: number;
  max_hold_minutes: number;
  expected_profit_dollars: number;
  expected_loss_dollars: number;
  risk_reward_ratio: number;
  success_probability: number;
  strategy_notes: string[];
}

export const STRATEGY_CONFIGS: Record<string, StrategyParameters> = {
  'iwm-optimized-strategy': {
    rsi_overbought: 60,
    rsi_oversold: 40,
    vwap_threshold: 0.002,
    profit_target: 0.25, // 25%
    stop_loss: 0.15, // 15%
    max_hold_time_minutes: 60,
    position_size_pct: 0.10, // 10% of capital per trade
  },
  'spy-momentum-strategy': {
    rsi_overbought: 70,
    rsi_oversold: 30,
    vwap_threshold: 0.003,
    profit_target: 0.30, // 30%
    stop_loss: 0.20, // 20%
    max_hold_time_minutes: 90,
    position_size_pct: 0.15,
  },
  'qqq-breakout-strategy': {
    rsi_overbought: 65,
    rsi_oversold: 35,
    vwap_threshold: 0.0025,
    profit_target: 0.40, // 40%
    stop_loss: 0.25, // 25%
    max_hold_time_minutes: 120,
    position_size_pct: 0.08,
  }
};

export function calculateStrategyOutcome(
  strategyName: string,
  entryPrice: number,
  quantity: number,
  optionType: 'call' | 'put',
  underlyingPrice: number,
  parameters?: any
): StrategyOutcome {
  // Get strategy config or use defaults
  const strategyConfig = STRATEGY_CONFIGS[strategyName] || STRATEGY_CONFIGS['iwm-optimized-strategy'];
  
  // Override with bot-specific parameters if provided
  const config = { ...strategyConfig, ...parameters };

  const profitTargetPrice = entryPrice * (1 + config.profit_target!);
  const stopLossPrice = entryPrice * (1 - config.stop_loss!);
  
  const contractValue = 100; // Options contract multiplier
  const totalContracts = quantity;
  
  const expectedProfitDollars = (profitTargetPrice - entryPrice) * totalContracts * contractValue;
  const expectedLossDollars = Math.abs((stopLossPrice - entryPrice) * totalContracts * contractValue);
  
  const riskRewardRatio = expectedProfitDollars / expectedLossDollars;

  // Calculate success probability based on historical strategy performance
  // This is a simplified model - in production you'd use backtest results
  let successProbability = 0.55; // Base 55% for a good strategy
  
  // Adjust based on strategy type and market conditions
  if (strategyName.includes('momentum')) {
    successProbability += 0.05; // Momentum strategies tend to be slightly more reliable
  }
  
  // Adjust based on risk-reward ratio
  if (riskRewardRatio > 2.0) {
    successProbability += 0.05;
  } else if (riskRewardRatio < 1.5) {
    successProbability -= 0.05;
  }

  // Generate strategy-specific notes
  const strategyNotes: string[] = [];
  
  if (config.profit_target! >= 0.30) {
    strategyNotes.push('⚡ High profit target - aggressive strategy');
  } else if (config.profit_target! <= 0.20) {
    strategyNotes.push('🛡️ Conservative profit target');
  }

  if (config.max_hold_time_minutes! <= 60) {
    strategyNotes.push('⏱️ Quick scalp - exit within 1 hour');
  } else if (config.max_hold_time_minutes! >= 120) {
    strategyNotes.push('📈 Swing trade - longer hold time');
  }

  if (riskRewardRatio > 2.0) {
    strategyNotes.push('💎 Excellent risk-reward ratio');
  } else if (riskRewardRatio < 1.5) {
    strategyNotes.push('⚠️ Low risk-reward - monitor closely');
  }

  return {
    profit_target_price: profitTargetPrice,
    stop_loss_price: stopLossPrice,
    max_hold_minutes: config.max_hold_time_minutes!,
    expected_profit_dollars: expectedProfitDollars,
    expected_loss_dollars: expectedLossDollars,
    risk_reward_ratio: riskRewardRatio,
    success_probability: Math.max(0.3, Math.min(0.8, successProbability)), // Cap between 30% and 80%
    strategy_notes: strategyNotes,
  };
}

export function getStrategyDescription(strategyName: string): string {
  const descriptions: Record<string, string> = {
    'iwm-optimized-strategy': 'IWM small-cap momentum strategy using RSI and VWAP signals with quick profit targets',
    'spy-momentum-strategy': 'SPY large-cap momentum strategy with higher profit targets and longer hold times',
    'qqq-breakout-strategy': 'QQQ tech breakout strategy targeting extended moves with wider stops',
  };
  
  return descriptions[strategyName] || 'Custom options trading strategy with algorithmic signal generation';
}

export function getStrategyRiskLevel(strategyName: string, parameters?: any): 'low' | 'moderate' | 'high' {
  const config = { ...STRATEGY_CONFIGS[strategyName], ...parameters };
  
  if (!config.profit_target || !config.stop_loss) return 'moderate';
  
  const riskRewardRatio = config.profit_target / config.stop_loss;
  
  if (riskRewardRatio >= 2.0 && config.stop_loss <= 0.15) {
    return 'low';
  } else if (riskRewardRatio >= 1.5 && config.stop_loss <= 0.25) {
    return 'moderate';
  } else {
    return 'high';
  }
}