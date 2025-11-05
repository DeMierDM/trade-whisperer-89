# 📋 STRATEGY CREATION CHEAT SHEET

## 🚀 Quick Start: Creating a New Strategy

### 1. Copy the Template
```bash
cp strategies/strategy-template.js strategies/your-new-strategy.js
```

### 2. Fill in the 4 Core Components

#### 🧩 **Signals** - What triggers entries?
```javascript
entry: {
  long: {
    conditions: [
      "rsi2 <= 30",           // RSI oversold
      "price > vwap",         // Above VWAP
      "roc3 > 0.2",          // Positive momentum
      "buyVolumeRatio >= 0.60" // Volume confirmation
    ]
  }
}
```

#### 💥 **Option Strategy** - What to trade?
```javascript
optionStrategy: {
  type: 'single_leg',        // 'single_leg', 'spread', 'straddle'
  direction: 'signal_based', // Follow the signal direction
  contracts: {
    calls: { enabled: true },
    puts: { enabled: true }
  }
}
```

#### 🎯 **Contract Selection** - Which strikes/expiry?
```javascript
contractSelection: {
  expiration: { dte: [0, 1], preferredDTE: 0 },  // 0DTE preferred
  strike: { method: 'atm_offset', offset: { min: -2, max: 2 } }, // ATM ± $2
  liquidity: { minOpenInterest: 100, maxBidAskSpread: 0.08 }
}
```

#### ⏱ **Risk Management** - When to exit?
```javascript
exit: {
  takeProfit: { percentage: 12 },    // +12% profit target
  stopLoss: { percentage: 8 },       // -8% stop loss
  timeStop: { maxHoldMinutes: 10 }   // 10 minute time limit
}
```

### 3. Add Optuna Parameters (Optional)
```javascript
optimizationParams: {
  rsi_params: {
    rsi_period: { type: 'int', range: [2, 14], default: 7 },
    oversold_level: { type: 'int', range: [20, 35], default: 30 }
  }
}
```

## 📊 Available Indicators

### Core Technical Indicators
| Indicator | Usage | Parameters |
|-----------|-------|------------|
| `rsi` | RSI(2), RSI(9), RSI(14) | `[{period: 2}, {period: 9}]` |
| `roc` | Rate of Change | `[{period: 3}, {period: 5}]` |
| `vwap` | Volume Weighted Average Price | `{adaptive_bands: true}` |
| `macd` | MACD Histogram | `{fast: 6, slow: 13, signal: 5}` |
| `ema` | Exponential Moving Average | `[{period: 8}, {period: 21}]` |
| `atr` | Average True Range | `{period: 14}` |

### Volume & Flow Indicators
| Indicator | Usage | Parameters |
|-----------|-------|------------|
| `volume` | Volume imbalance, spikes | `{imbalance: true, spike_detection: true}` |
| `vwap_slope` | VWAP trend direction | `{lookback: 5}` |
| `volume_spike_score` | Volume spike detection | `{lookback: 20, threshold: 2.0}` |

### Options-Specific Indicators
| Indicator | Usage | Parameters |
|-----------|-------|------------|
| `iv_rank` | Implied Volatility Rank | `{lookback: 252}` |
| `gamma_exposure` | Net Gamma positioning | `{calculation: 'net_gamma'}` |
| `squeeze_momentum` | Volatility compression | `{bb_period: 20, kc_period: 20}` |

### Advanced Indicators
| Indicator | Usage | Parameters |
|-----------|-------|------------|
| `havwap` | Hourly Anchored VWAP | `{anchors: ['09:30', '12:00', '15:00']}` |
| `correlation` | Cross-asset correlation | `{symbol_pairs: ['SPY-IWM']}` |
| `linear_regression` | Trend slope analysis | `{period: 14, slope: true}` |

## 🎯 Signal Condition Examples

### RSI Conditions
```javascript
"rsi2 <= 30"              // RSI(2) oversold
"rsi2 >= 70"              // RSI(2) overbought  
"rsi9 > 40 && rsi9 < 60"  // RSI(9) neutral zone
```

### VWAP Conditions
```javascript
"price > vwap"            // Price above VWAP
"price > vwap + adaptiveBand" // Price above VWAP + band
"vwapSlope > 0"           // VWAP trending up
```

### Volume Conditions
```javascript
"buyVolumeRatio >= 0.60"  // 60%+ buy volume
"volumeSpikeCScore > 2.0" // Volume spike detected
"volume > avgVolume * 1.5" // Above average volume
```

### Momentum Conditions
```javascript
"roc3 > 0.2"              // 3-period ROC > 0.2%
"macdHistogram > 0"       // MACD histogram positive
"emaSlope8 > 0"           // EMA(8) trending up
```

## 🔧 Strategy Types by Use Case

### 📈 **Momentum Strategies**
- **Indicators**: RSI(2/7), ROC, VWAP slope, volume
- **Entry**: Oversold RSI + positive momentum + VWAP support
- **Best for**: Trending days, strong directional moves

### 🔄 **Mean Reversion Strategies**  
- **Indicators**: RSI(14), CCI, regression slope, ATR
- **Entry**: Extreme RSI + mean reversion setup
- **Best for**: Range-bound days, high volatility

### 🎯 **Breakout Strategies**
- **Indicators**: VWAP bands, volume spikes, squeeze momentum
- **Entry**: Band break + volume confirmation + momentum
- **Best for**: News days, high volume sessions

### ⚡ **Scalping Strategies**
- **Indicators**: RSI(2/3), ROC(3), VWAP micro-trends
- **Entry**: Quick mean reversion + volume confirmation
- **Best for**: High-frequency opportunities, tight risk

## 🎮 Testing Your Strategy

### 1. Add to Dropdown
Your strategy automatically appears in the UI dropdown after container restart.

### 2. Run Backtest
```bash
curl -X POST "http://localhost:3002/api/run-backtest" \
  -H "Content-Type: application/json" \
  -d '{
    "strategies": ["your_strategy_name"],
    "ticker": "SPY",
    "startDate": "2025-01-16",
    "endDate": "2025-01-17"
  }'
```

### 3. Optimize with Optuna
```bash
curl -X POST "http://localhost:3002/api/start-optimization" \
  -H "Content-Type: application/json" \
  -d '{
    "strategyName": "your_strategy_name",
    "ticker": "SPY"
  }'
```

## 🏆 Best Practices

### ✅ Do's
- **Start simple**: Use 3-4 core indicators max
- **Test confluence**: Require multiple signals to agree
- **Use volume confirmation**: Volume validates price moves
- **Set realistic targets**: 8-15% profit, 5-10% loss
- **Limit hold time**: 5-15 minutes for 0DTE scalps

### ❌ Don'ts
- **Avoid over-optimization**: Don't curve-fit to historical data
- **Don't ignore volume**: Price without volume = noise
- **Don't skip risk management**: Always define exits first
- **Don't over-complicate**: Complex ≠ better performance
- **Don't trade every signal**: Quality > quantity

## 🔍 Quick Debug Checklist

1. **Strategy loads?** Check syntax and file naming
2. **Signals trigger?** Verify condition logic
3. **Contracts selected?** Check liquidity filters  
4. **Exits working?** Test all exit scenarios
5. **Performance reasonable?** Compare to benchmarks

---

**💡 Pro Tip**: Start with proven patterns from the existing strategies, then modify one component at a time. This ensures you maintain a working baseline while experimenting with improvements.

**🎯 Next Steps**: Once you have a working strategy, use Optuna optimization to find the best parameters for your specific use case and dataset.