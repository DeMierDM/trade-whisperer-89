/**
 * STRATEGY 1: RSI + ROC + VWAP Slope Confluence
 * Multi-timeframe RSI with momentum and VWAP trend confirmation
 */

module.exports = {
  // Strategy Metadata
  name: "RSI ROC VWAP Confluence",
  description: "RSI(2/9) + ROC(3) + VWAP slope confluence with volume imbalance filter",
  version: "1.0.0",
  author: "Trade Whisperer",
  
  // 🧩 1️⃣ SIGNAL DETECTION: RSI + ROC + VWAP Slope Confluence
  signals: {
    // Technical indicators needed
    indicators: [
      // RSI Multi-timeframe
      { name: 'rsi', params: [
        { period: 2, name: 'rsi2' },
        { period: 9, name: 'rsi9' }
      ]},
      
      // ROC Momentum
      { name: 'roc', params: [{ period: 3, name: 'roc3' }] },
      
      // VWAP with slope calculation
      { name: 'vwap', params: { adaptive_bands: true } },
      { name: 'vwap_slope', params: { lookback: 5 } },
      
      // Volume analysis
      { name: 'volume', params: { imbalance: true, spike_detection: true } }
    ],
    
    // Entry signal logic
    entry: {
      long: {
        conditions: [
          "rsi2 <= 30", // RSI(2) oversold
          "rsi9 > 40 && rsi9 < 60", // RSI(9) neutral zone (trend filter)
          "roc3 > 0.2", // Positive momentum (ROC > 0.2%)
          "vwapSlope > 0", // VWAP slope positive (upward trend)
          "price > vwap", // Price above VWAP
          "buyVolumeRatio >= 0.60" // Volume imbalance confirms direction
        ],
        confirmation: {
          sustainTime: 30, // 30 second confirmation
          volumeImbalance: 0.60,
          confluenceRequired: 4 // At least 4 out of 6 conditions must be true
        }
      },
      short: {
        conditions: [
          "rsi2 >= 70", // RSI(2) overbought
          "rsi9 > 40 && rsi9 < 60", // RSI(9) neutral zone
          "roc3 < -0.2", // Negative momentum
          "vwapSlope < 0", // VWAP slope negative
          "price < vwap", // Price below VWAP
          "buyVolumeRatio <= 0.40" // Volume imbalance confirms direction
        ],
        confirmation: {
          sustainTime: 30,
          volumeImbalance: 0.40,
          confluenceRequired: 4
        }
      }
    }
  },

  // 💥 2️⃣ OPTION STRATEGY: Directional single leg
  optionStrategy: {
    type: 'single_leg',
    direction: 'signal_based',
    contracts: {
      calls: { enabled: true, condition: "long_signal && vwapSlope > 0" },
      puts: { enabled: true, condition: "short_signal && vwapSlope < 0" }
    }
  },

  // 🎯 3️⃣ STRIKE & EXPIRATION: ATM preferred with liquidity filters
  contractSelection: {
    expiration: {
      dte: [0, 1],
      preferredDTE: 0
    },
    strike: {
      method: 'atm_offset',
      offset: { min: -2, max: 2 }, // ATM ± $2
      deltaRange: { min: 0.40, max: 0.60 }
    },
    liquidity: {
      minOpenInterest: 100,
      maxBidAskSpread: 0.08
    }
  },

  // ⏱ 4️⃣ RISK MANAGEMENT: Quick scalps with confluence-based exits
  riskManagement: {
    entry: {
      maxPositions: 100, // Allow up to 100 positions
      positionSizing: 'fixed',
      contractsPerSignal: 10, // Select multiple contracts per signal (multiple strikes)
      confluenceRequired: true // Must meet confluence threshold
    },
    exit: {
      takeProfit: {
        percentage: 12, // +12%
        rsiReversal: {
          calls: { rsi2: 75 }, // Exit calls when RSI(2) > 75
          puts: { rsi2: 25 }   // Exit puts when RSI(2) < 25
        }
      },
      stopLoss: {
        percentage: 8, // -8%
        technical: 'rsi_confluence_break' // Exit if RSI confluence breaks
      },
      timeStop: {
        maxHoldMinutes: 8 // Quick scalps
      }
    },
    reEntry: {
      enabled: true,
      cooldownMinutes: 3,
      conditions: ['fresh_confluence', 'vwap_slope_intact']
    }
  },

  // ⚙️ ADAPTIVE PARAMETERS
  adaptiveSettings: {
    volatility: {
      low: { rsiThreshold: { oversold: 25, overbought: 75 } },
      medium: { rsiThreshold: { oversold: 30, overbought: 70 } },
      high: { rsiThreshold: { oversold: 35, overbought: 65 } }
    }
  },

  // 🔬 OPTUNA OPTIMIZATION PARAMETERS
  optimizationParams: {
    rsi_periods: {
      rsi2_period: { type: 'int', range: [2, 5], default: 2 },
      rsi9_period: { type: 'int', range: [7, 14], default: 9 },
      rsi2_oversold: { type: 'int', range: [20, 35], default: 30 },
      rsi2_overbought: { type: 'int', range: [65, 80], default: 70 }
    },
    roc_params: {
      roc_period: { type: 'int', range: [2, 5], default: 3 },
      roc_threshold: { type: 'float', range: [0.1, 0.5], default: 0.2 }
    },
    vwap_params: {
      slope_lookback: { type: 'int', range: [3, 10], default: 5 },
      slope_threshold: { type: 'float', range: [0.01, 0.10], default: 0.02 }
    },
    volume_params: {
      imbalance_threshold: { type: 'float', range: [0.55, 0.70], default: 0.60 }
    },
    confluence_params: {
      required_conditions: { type: 'int', range: [3, 6], default: 4 },
      sustain_time: { type: 'int', range: [15, 60], default: 30 }
    },
    risk_params: {
      take_profit: { type: 'float', range: [8.0, 20.0], default: 12.0 },
      stop_loss: { type: 'float', range: [5.0, 12.0], default: 8.0 },
      max_hold_minutes: { type: 'int', range: [5, 15], default: 8 }
    }
  },

  // 🎯 OPTIMIZATION CONFIGURATION
  optimization: {
    objective: 'sharpe_ratio',
    direction: 'maximize',
    n_trials: 200,
    constraints: {
      min_trades: 15,
      max_drawdown: 0.20,
      min_win_rate: 0.45
    }
  },

  // 📊 EXPECTED PERFORMANCE TARGETS
  expectedMetrics: {
    winRate: { target: 60, acceptable: 50 },
    avgWin: { target: 12, acceptable: 8 },
    avgLoss: { target: -8, acceptable: -10 },
    sharpeRatio: { target: 2.5, acceptable: 1.8 },
    maxDrawdown: { target: 12, acceptable: 20 },
    tradesPerDay: { target: 6, acceptable: 3 }
  }
};