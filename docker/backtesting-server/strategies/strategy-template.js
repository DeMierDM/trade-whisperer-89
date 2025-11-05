/**
 * STRATEGY TEMPLATE: 4-Component Architecture
 * 
 * This template provides the standard structure for all trading strategies.
 * Each strategy must implement these 4 core components:
 * 
 * 1️⃣ SIGNALS: Entry/exit logic and technical conditions
 * 2️⃣ OPTIONS: Contract selection and Greeks filtering  
 * 3️⃣ SELECTION: Strike/expiry selection rules
 * 4️⃣ RISK MANAGEMENT: Position sizing and risk controls
 * 
 * ⏰ TIMEFRAME: All strategies operate on 1-minute bars
 * - Use minute periods for indicators (RSI(14) = 14 minutes)
 * - Sustain conditions measured in bars (1 bar = 1 minute)
 * - Time-based exits use minutes (maxHoldMinutes)
 * 
 * Copy this template and customize each section for your strategy.
 */

module.exports = {
  // Strategy Metadata
  name: "Template Strategy",
  description: "Template for creating new strategies",
  version: "1.0.0",
  author: "Your Name",
  
  // 🧩 1️⃣ SIGNAL DETECTION: What signals trigger entries?
  signals: {
    // Technical indicators needed - ALL AVAILABLE INDICATORS
    indicators: [
      // VWAP & Volume Indicators
      { name: 'vwap', params: { adaptive_bands: true, sigma_levels: [1, 2, 3] } },
      { name: 'havwap', params: { anchors: ['09:30', '10:30', '12:00', '13:30', '15:00'] } },
      { name: 'volume', params: { imbalance: true, spike_detection: true } },
      
      // RSI Family (Multiple Timeframes)
      { name: 'rsi', params: [
        { period: 2, name: 'rsi2' },
        { name: 'rsi3', period: 3 },
        { name: 'rsi7', period: 7 },
        { name: 'rsi9', period: 9 },
        { name: 'rsi14', period: 14 }
      ]},
      
      // Momentum Indicators
      { name: 'roc', params: [
        { period: 3, name: 'roc3' },
        { period: 5, name: 'roc5' }
      ]},
      { name: 'cci', params: { period: 20 } },
      
      // MACD Family
      { name: 'macd', params: [
        { fast: 6, slow: 13, signal: 5, name: 'macd_6_13_5' },
        { fast: 12, slow: 26, signal: 9, name: 'macd_standard' }
      ]},
      
      // Moving Averages
      { name: 'ema', params: [
        { period: 8, name: 'ema8' },
        { period: 21, name: 'ema21' }
      ]},
      { name: 'sma', params: [
        { period: 20, name: 'sma20' },
        { period: 50, name: 'sma50' }
      ]},
      
      // Volatility & Range Indicators
      { name: 'atr', params: { period: 14 } },
      { name: 'volatility', params: { period: 20, method: 'close_to_close' } },
      { name: 'squeeze_momentum', params: { bb_period: 20, kc_period: 20 } },
      
      // Greeks & Options Specific
      { name: 'iv_rank', params: { lookback: 252 } },
      { name: 'gamma_exposure', params: { calculation: 'net_gamma' } },
      
      // Regression & Statistical
      { name: 'linear_regression', params: { period: 14, slope: true } },
      { name: 'correlation', params: { symbol_pairs: ['SPY-IWM', 'QQQ-SPY'] } },
      
      // Custom Composite Indicators
      { name: 'vwap_slope', params: { lookback: 5 } },
      { name: 'volume_spike_score', params: { lookback: 20, threshold: 2.0 } },
      { name: 'gamma_strength', params: { calculation_method: 'dealer_positioning' } }
    ],
    
    // Entry signal logic
    entry: {
      long: {
        conditions: [
          // Example: "price > vwap + 0.1%"
          // Example: "rsi < 30"
          // Example: "volume > avgVolume * 1.5"
        ],
        confirmation: {
          sustainTime: 30, // seconds
          volumeImbalance: 0.6 // 60% buy volume
        }
      },
      short: {
        conditions: [],
        confirmation: {
          sustainTime: 30,
          volumeImbalance: 0.4 // 40% buy volume (60% sell)
        }
      }
    }
  },

  // 💥 2️⃣ OPTION STRATEGY: What options to trade?
  optionStrategy: {
    type: 'single_leg', // 'single_leg', 'spread', 'straddle', etc.
    direction: 'signal_based', // 'long_only', 'short_only', 'signal_based'
    contracts: {
      calls: { enabled: true },
      puts: { enabled: true }
    }
  },

  // 🎯 3️⃣ STRIKE & EXPIRATION: How to select contracts?
  contractSelection: {
    expiration: {
      dte: [0, 1], // 0DTE and 1DTE allowed
      preferredDTE: 0
    },
    strike: {
      method: 'atm_offset', // 'atm', 'atm_offset', 'delta_target'
      offset: { min: -3, max: 3 }, // ATM ± $3
      deltaRange: { min: 0.45, max: 0.55 }
    },
    liquidity: {
      minOpenInterest: 200,
      maxBidAskSpread: 0.05
    }
  },

  // ⏱ 4️⃣ RISK MANAGEMENT: Entry/exit rules
  riskManagement: {
    entry: {
      maxPositions: 3,
      positionSizing: 'fixed', // 'fixed', 'adaptive', 'kelly'
      contractsPerSignal: 2
    },
    exit: {
      takeProfit: {
        percentage: 15, // +15%
        rsiReversal: { rsi: 80, direction: 'short' } // Exit calls when RSI > 80
      },
      stopLoss: {
        percentage: 10, // -10%
        technical: 'return_to_vwap' // Exit if price returns to VWAP
      },
      timeStop: {
        maxHoldMinutes: 10
      }
    },
    reEntry: {
      enabled: true,
      cooldownMinutes: 5,
      conditions: ['trend_intact', 'fresh_momentum']
    }
  },

  // ⚙️ ADAPTIVE PARAMETERS: Dynamic settings based on market conditions
  adaptiveSettings: {
    volatility: {
      low: { vwapBand: 0.05, sustainTime: 15 },
      medium: { vwapBand: 0.10, sustainTime: 30 },
      high: { vwapBand: 0.15, sustainTime: 45 }
    }
  },

  // 🔬 OPTUNA OPTIMIZATION PARAMETERS
  // Define parameter ranges for hyperparameter optimization
  optimizationParams: {
    // RSI Parameters
    rsi_periods: {
      rsi2_period: { type: 'int', range: [2, 5], default: 2 },
      rsi_short_period: { type: 'int', range: [3, 9], default: 7 },
      rsi_long_period: { type: 'int', range: [9, 21], default: 14 },
      rsi_overbought: { type: 'int', range: [70, 90], default: 80 },
      rsi_oversold: { type: 'int', range: [10, 30], default: 20 }
    },

    // VWAP Parameters
    vwap_bands: {
      sigma_multiplier: { type: 'float', range: [0.5, 3.0], default: 1.0 },
      band_width_low_vol: { type: 'float', range: [0.01, 0.10], default: 0.05 },
      band_width_high_vol: { type: 'float', range: [0.10, 0.30], default: 0.15 },
      sustain_time_min: { type: 'int', range: [5, 30], default: 15 },
      sustain_time_max: { type: 'int', range: [30, 120], default: 45 }
    },

    // ROC Parameters
    roc_params: {
      roc_short_period: { type: 'int', range: [1, 5], default: 3 },
      roc_long_period: { type: 'int', range: [3, 10], default: 5 },
      roc_threshold: { type: 'float', range: [0.1, 2.0], default: 0.5 }
    },

    // MACD Parameters
    macd_params: {
      fast_period: { type: 'int', range: [3, 12], default: 6 },
      slow_period: { type: 'int', range: [8, 26], default: 13 },
      signal_period: { type: 'int', range: [3, 15], default: 5 }
    },

    // Moving Average Parameters
    ma_params: {
      ema_fast: { type: 'int', range: [5, 15], default: 8 },
      ema_slow: { type: 'int', range: [15, 35], default: 21 },
      sma_period: { type: 'int', range: [10, 50], default: 20 }
    },

    // Volume Parameters
    volume_params: {
      imbalance_threshold: { type: 'float', range: [0.55, 0.80], default: 0.60 },
      spike_multiplier: { type: 'float', range: [1.5, 5.0], default: 2.0 },
      avg_volume_period: { type: 'int', range: [10, 50], default: 20 }
    },

    // Volatility Parameters
    volatility_params: {
      atr_period: { type: 'int', range: [7, 21], default: 14 },
      atr_multiplier: { type: 'float', range: [1.0, 4.0], default: 2.0 },
      vol_lookback: { type: 'int', range: [10, 50], default: 20 }
    },

    // Risk Management Parameters
    risk_params: {
      take_profit_min: { type: 'float', range: [5.0, 20.0], default: 10.0 },
      take_profit_max: { type: 'float', range: [10.0, 30.0], default: 15.0 },
      stop_loss_min: { type: 'float', range: [5.0, 15.0], default: 8.0 },
      stop_loss_max: { type: 'float', range: [8.0, 20.0], default: 10.0 },
      max_hold_minutes: { type: 'int', range: [5, 30], default: 10 },
      max_positions: { type: 'int', range: [1, 10], default: 3 }
    },

    // HAVWAP Specific Parameters
    havwap_params: {
      anchor_times: { 
        type: 'categorical', 
        choices: [
          ['09:30', '10:30', '12:00', '13:30', '15:00'],
          ['09:30', '11:00', '13:00', '15:00'],
          ['10:00', '12:00', '14:00'],
          ['09:30', '12:00', '15:00']
        ],
        default: ['09:30', '10:30', '12:00', '13:30', '15:00']
      },
      slope_threshold: { type: 'float', range: [0.01, 0.50], default: 0.10 }
    },

    // Greeks Parameters
    greeks_params: {
      gamma_threshold: { type: 'float', range: [0.01, 0.20], default: 0.05 },
      iv_rank_high: { type: 'int', range: [60, 95], default: 80 },
      iv_rank_low: { type: 'int', range: [5, 40], default: 20 }
    },

    // Correlation Parameters
    correlation_params: {
      lookback_period: { type: 'int', range: [10, 100], default: 50 },
      correlation_threshold: { type: 'float', range: [0.3, 0.9], default: 0.7 }
    },

    // CCI Parameters
    cci_params: {
      period: { type: 'int', range: [10, 50], default: 20 },
      overbought: { type: 'int', range: [80, 120], default: 100 },
      oversold: { type: 'int', range: [-120, -80], default: -100 }
    },

    // Squeeze Momentum Parameters
    squeeze_params: {
      bb_period: { type: 'int', range: [15, 30], default: 20 },
      bb_std: { type: 'float', range: [1.5, 2.5], default: 2.0 },
      kc_period: { type: 'int', range: [15, 30], default: 20 },
      kc_multiplier: { type: 'float', range: [1.0, 2.5], default: 1.5 }
    }
  },

  // 🎯 OPTUNA OBJECTIVE FUNCTION CONFIGURATION
  optimization: {
    objective: 'sharpe_ratio', // 'sharpe_ratio', 'total_return', 'win_rate', 'profit_factor'
    direction: 'maximize', // 'maximize' or 'minimize'
    n_trials: 100,
    timeout: 3600, // 1 hour
    constraints: {
      min_trades: 10, // Minimum trades required for valid backtest
      max_drawdown: 0.25, // Maximum acceptable drawdown (25%)
      min_win_rate: 0.40 // Minimum acceptable win rate (40%)
    },
    early_stopping: {
      enabled: true,
      patience: 20, // Stop if no improvement for 20 trials
      min_improvement: 0.01 // Minimum improvement threshold
    }
  }
};