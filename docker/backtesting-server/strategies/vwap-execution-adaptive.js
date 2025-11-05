/**
 * STRATEGY 2: VWAP Execution with Adaptive Strategies
 * Real-time backtesting strategy for 0DTE option scalping
 */

module.exports = {
  // Strategy Metadata
  name: "VWAP Execution Adaptive",
  description: "VWAP deviation + momentum confirmation with adaptive volatility bands",
  version: "1.0.0",
  author: "Trade Whisperer",
  
  // 🧩 1️⃣ SIGNAL DETECTION: VWAP deviation + momentum confirmation
  signals: {
    // Technical indicators needed
    indicators: [
      { name: 'vwap', params: {} },
      { name: 'rsi', params: [{ period: 2 }, { period: 3 }, { period: 7 }, { period: 9 }] },
      { name: 'roc', params: [{ period: 3 }, { period: 5 }] },
      { name: 'macd', params: { fast: 6, slow: 13, signal: 5 } },
      { name: 'volume', params: {} },
      { name: 'volatility', params: { period: 20 } }
    ],
    
    // Entry signal logic
    entry: {
      long: {
        conditions: [
          "price > vwap + adaptiveBand", // VWAP Cross & Band Break
          "sustainedAboveBand >= sustainBars", // Sustain Filter (1-3 bars for 1min data)
          "buyVolumeRatio >= 0.60", // Volume Imbalance: Buy volume ≥ 60%
          "roc3 > 0 || roc5 > 0", // ROC momentum confirmation (3-5 minute periods)
          "macdHistogram > 0", // MACD histogram turning positive
          "vwapSlope > 0" // Context Filter: VWAP slope positive
        ],
        confirmation: {
          sustainBars: "adaptive", // 1-3 bars based on volatility (1min timeframe)
          volumeImbalance: 0.60,
          rsiTrigger: {
            micro: { rsi2: "turning_up", rsi3: "turning_up" },
            trend: { rsi7: "> 50", rsi9: "> 50" }
          }
        }
      },
      short: {
        conditions: [
          "price < vwap - adaptiveBand", // VWAP Cross & Band Break
          "sustainedBelowBand >= sustainBars", // Sustain Filter (1-3 bars for 1min data)
          "sellVolumeRatio >= 0.60", // Volume Imbalance: Sell volume ≥ 60%
          "roc3 < 0 || roc5 < 0", // ROC momentum confirmation (3-5 minute periods)
          "macdHistogram < 0", // MACD histogram turning negative
          "vwapSlope < 0" // Context Filter: VWAP slope negative
        ],
        confirmation: {
          sustainBars: "adaptive", // 1-3 bars based on volatility (1min timeframe)
          volumeImbalance: 0.60,
          rsiTrigger: {
            micro: { rsi2: "turning_down", rsi3: "turning_down" },
            trend: { rsi7: "< 50", rsi9: "< 50" }
          }
        }
      }
    }
  },

  // 💥 2️⃣ OPTION STRATEGY: Directional 0-DTE option scalp
  optionStrategy: {
    type: 'single_leg', // Buy near-ATM call/put
    direction: 'signal_based', // Aligned with VWAP break direction
    contracts: {
      calls: { 
        enabled: true,
        condition: "price > vwap + adaptiveBand && trendUp"
      },
      puts: { 
        enabled: true, 
        condition: "price < vwap - adaptiveBand && trendDown"
      }
    },
    hedgedVersion: {
      enabled: false, // Optional: 1-leg vertical when IV high
      trigger: "impliedVol > percentile_80"
    }
  },

  // 🎯 3️⃣ STRIKE & EXPIRATION: ATM ± $1-3, 0DTE preferred
  contractSelection: {
    expiration: {
      dte: [0, 1], // 0DTE for scalps; 1DTE if post-2PM
      preferredDTE: 0,
      timeRule: "if time > 14:00 then allow 1DTE"
    },
    strike: {
      method: 'atm_offset',
      offset: { min: -3, max: 3 }, // ATM ± $1-3
      deltaRange: { min: 0.45, max: 0.55 }, // Δ 0.45-0.55
      preference: 'atm_closest' // Choose closest to spot price
    },
    liquidity: {
      minOpenInterest: 200,
      maxBidAskSpread: 0.05,
      greeksPreference: {
        highGamma: true, // High Gamma for quick premium response
        lowTheta: true   // Low Theta to minimize decay
      }
    }
  },

  // ⏱ 4️⃣ RISK MANAGEMENT: Quick scalps with tight controls
  riskManagement: {
    entry: {
      maxPositions: 100, // Allow up to 100 positions
      positionSizing: 'adaptive',
      contractsPerSignal: 10, // Select multiple contracts per signal // Larger when deviation > 1σ and volume ≥ 65%
      contractsPerSignal: {
        base: 1,
        adaptive: {
          condition: "vwapDeviation > oneSigma && volumeImbalance >= 0.65",
          multiplier: 2
        }
      },
      confirmationStack: [
        "vwapBandBreak", "sustainFilter", "volumeImbalance", "rocAgrees", "rsiAgrees"
      ]
    },
    exit: {
      takeProfit: {
        percentage: { min: 10, max: 15 }, // +10-15% option gain
        rsiReversal: { 
          calls: { rsi2: 80 }, // Exit calls when RSI(2) > 80
          puts: { rsi2: 20 }   // Exit puts when RSI(2) < 20
        },
        priority: "first_trigger" // Exit on first condition met
      },
      stopLoss: {
        percentage: { min: 8, max: 10 }, // -8% to -10% option loss
        technical: 'return_to_vwap',     // Exit if price returns to VWAP
        priority: "first_trigger"
      },
      timeStop: {
        maxHoldMinutes: 10 // Max hold ≈ 2-3 candles post-signal
      }
    },
    reEntry: {
      enabled: true,
      conditions: [
        "vwapSlope_intact", // VWAP slope still in original direction
        "volume_trend_intact", // Volume trend still in direction
        "fresh_roc_burst" // Fresh ROC burst appears
      ],
      cooldownMinutes: 2,
      maxReEntries: 2 // Avoid over-trading chop
    }
  },

  // ⚙️ VOLATILITY-ADAPTIVE TUNING (Minute-level timeframe)
  adaptiveSettings: {
    volatility: {
      low: { 
        vwapBand: 0.05,    // 0.05% tight band
        sustainBars: 1,    // 1 minute requirement
        description: "Keeps strategy active in calm markets"
      },
      medium: { 
        vwapBand: 0.10,    // 0.10% balanced
        sustainBars: 2,    // 2 minute requirement
        description: "Balanced response"
      },
      high: { 
        vwapBand: 0.15,    // 0.15% wide band
        sustainBars: 3,    // 3 minute requirement
        description: "Avoids false signals during chop"
      }
    },
    marketState: {
      optimal: "trend_days_with_vwap_as_pivot",
      avoid: "choppy_sideways_action"
    }
  },

  // 📊 PERFORMANCE TARGETS
  expectedMetrics: {
    winRate: { target: 65, acceptable: 55 },
    avgWin: { target: 12, acceptable: 8 }, // % gain
    avgLoss: { target: -9, acceptable: -12 }, // % loss
    sharpeRatio: { target: 2.0, acceptable: 1.5 },
    maxDrawdown: { target: 15, acceptable: 25 }, // %
    tradesPerDay: { target: 8, acceptable: 4 }
  },

  // 🔬 OPTUNA OPTIMIZATION PARAMETERS
  optimizationParams: {
    vwapWindow: { type: 'int', low: 60, high: 780 },
    rocPeriod3: { type: 'int', low: 1, high: 10 },
    rocPeriod5: { type: 'int', low: 2, high: 15 },
    rsiPeriod2: { type: 'int', low: 2, high: 5 },
    rsiPeriod9: { type: 'int', low: 7, high: 14 },
    volumeImbalanceThreshold: { type: 'float', low: 0.55, high: 0.75 },
    vwapBandLow: { type: 'float', low: 0.03, high: 0.08 },
    vwapBandMedium: { type: 'float', low: 0.08, high: 0.15 },
    vwapBandHigh: { type: 'float', low: 0.12, high: 0.20 }
  },

  // 🎯 OPTIMIZATION OBJECTIVE
  optimization: {
    objective: 'maximize',
    metric: 'sharpe_ratio',
    trials: 100,
    timeout: 1800 // 30 minutes
  }
};