# Strategy Development Guide
## How to Build Strategies That Work First Time

This guide ensures every new strategy works correctly with the backtesting engine without requiring debugging and tweaking.

---

## Table of Contents

1. [Quick Start Workflow](#quick-start-workflow)
2. [Using the Strategy Template](#using-the-strategy-template)
3. [Critical Rules (Must Follow)](#critical-rules-must-follow)
4. [Testing Your Strategy](#testing-your-strategy)
5. [Common Pitfalls to Avoid](#common-pitfalls-to-avoid)
6. [Working with AI Assistants](#working-with-ai-assistants)
7. [Advanced: Adding New Indicators](#advanced-adding-new-indicators)

---

## Quick Start Workflow

### Every New Strategy - Follow These Steps:

```bash
# 1. Copy the template
cd docker/backtesting-server/strategies
cp STRATEGY_TEMPLATE.js my-new-strategy.js

# 2. Edit your strategy (see sections below)
# - Add your indicator calculations
# - Define your signal logic
# - Set your parameters

# 3. Test it automatically
cd ..
node test-strategy.js my-new-strategy

# 4. Fix any errors shown by the validator

# 5. Run a small backtest (1-2 days)
curl -X POST http://localhost:3002/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "IWM",
    "strategy": "my-new-strategy",
    "startDate": "2024-03-04",
    "endDate": "2024-03-04",
    "initialCapital": 10000
  }'

# 6. Check results and logs for any issues

# 7. If all good, run full multi-day backtest
```

---

## Using the Strategy Template

### Step 1: Copy and Rename

```bash
cp docker/backtesting-server/strategies/STRATEGY_TEMPLATE.js \
   docker/backtesting-server/strategies/iwm-macd-strategy.js
```

**Naming Convention**: `[symbol]-[indicator]-strategy.js`
- Examples: `iwm-rsi-strategy.js`, `spy-momentum-strategy.js`, `qqq-vwap-strategy.js`

### Step 2: Update Basic Info

```javascript
constructor(parameters = {}) {
    this.name = 'IWM_MACD_Strategy';  // Update this
    this.version = '1.0.0';            // Start at 1.0.0
    this.description = 'IWM 0DTE strategy using MACD indicator'; // Describe it
```

### Step 3: Set Your Parameters

```javascript
this.parameters = {
    // Your indicator settings
    macdFastPeriod: 12,
    macdSlowPeriod: 26,
    macdSignalPeriod: 9,

    // Keep these standard settings (adjust if needed)
    minDelta: 0.50,
    maxDelta: 1.00,
    targetDelta: 0.75,
    stopLossPercent: 0.15,
    profitTargetPercent: 0.25,
    maxHoldTimeMinutes: 60,
    maxPositions: 100,
    tradingStartHour: 9,
    tradingEndHour: 16,
    positionSize: 1,
    maxPortfolioRisk: 0.02
};
```

### Step 4: Add Your Indicator Calculation

Replace the placeholder `calculateIndicator()` method:

```javascript
/**
 * Calculate MACD
 * @private
 */
calculateMACD(prices, fastPeriod, slowPeriod, signalPeriod) {
    if (prices.length < slowPeriod + signalPeriod) return null;

    // Calculate EMAs
    const fastEMA = this.calculateEMA(prices, fastPeriod);
    const slowEMA = this.calculateEMA(prices, slowPeriod);

    // MACD line
    const macdLine = fastEMA - slowEMA;

    // Signal line (EMA of MACD)
    // ... your implementation

    return {
        macd: macdLine,
        signal: signalLine,
        histogram: macdLine - signalLine
    };
}
```

### Step 5: Update Signal Logic

In `generateSignals()`, replace the indicator calculation and signal logic:

```javascript
// Calculate your indicator
const macd = this.calculateMACD(
    priceHistory,
    this.parameters.macdFastPeriod,
    this.parameters.macdSlowPeriod,
    this.parameters.macdSignalPeriod
);

if (!macd) return;

// Generate signals based on your logic
if (macd.histogram > 0 && previousHistogram <= 0) {
    // MACD bullish crossover - CALL signal
    signals.push({
        timestamp: bar.t,                    // CRITICAL: Use bar.t
        signal_type: 'BUY_CALL',
        underlying_price: currentPrice,
        signal_strength: Math.min(5, Math.abs(macd.histogram) * 10),
        position_size: 1,
        signal_reason: `MACD bullish crossover: histogram=${macd.histogram.toFixed(3)}`,
        target_delta: this.parameters.targetDelta,
        option_type: 'call'
    });
}
```

---

## Critical Rules (Must Follow)

These rules prevent 95% of strategy bugs:

### Rule 1: Timestamp Usage ⚠️ CRITICAL

```javascript
// ✅ CORRECT - Use bar.t directly
signals.push({
    timestamp: bar.t,  // This is already a UTC ISO string
    // ...
});

// ❌ WRONG - Don't create new Date objects
signals.push({
    timestamp: new Date().toISOString(),  // This won't match!
    // ...
});

// ❌ WRONG - Don't convert to different format
signals.push({
    timestamp: new Date(bar.t),  // Wrong type!
    // ...
});
```

**Why**: The engine matches signals to bars using exact timestamp comparison. Creating new Date objects breaks this.

### Rule 2: Signal Structure ⚠️ CRITICAL

```javascript
// ✅ CORRECT - All required fields, exact naming
{
    timestamp: bar.t,
    signal_type: 'BUY_CALL',      // Exact string: 'BUY_CALL' or 'BUY_PUT'
    underlying_price: 199.50,      // Must be number, not string
    signal_strength: 2.5,          // Number 0-5
    position_size: 1,              // Integer
    signal_reason: 'RSI oversold', // String description
    target_delta: 0.75,            // Number 0-1
    option_type: 'call'            // Lowercase: 'call' or 'put'
}

// ❌ WRONG - Incorrect signal_type
{ signal_type: 'CALL' }  // Must be 'BUY_CALL'

// ❌ WRONG - Incorrect option_type
{ option_type: 'CALL' }  // Must be lowercase 'call'

// ❌ WRONG - Missing fields
{
    timestamp: bar.t,
    signal_type: 'BUY_CALL'
    // Missing other required fields!
}
```

### Rule 3: Timezone Conversion ⚠️ CRITICAL

```javascript
// ✅ CORRECT - Convert to EST for trading hours check
const moment = require('moment-timezone');
const estTime = moment(new Date(bar.t)).tz('America/New_York');
const currentHour = estTime.hour();

if (currentHour < 9 || currentHour >= 16) {
    return; // Skip this bar (outside trading hours)
}

// Then use original bar.t for signal timestamp
signals.push({ timestamp: bar.t, ... });

// ❌ WRONG - Don't store EST timestamp in signal
const estTime = moment(bar.t).tz('America/New_York');
signals.push({ timestamp: estTime.toISOString(), ... }); // Wrong!
```

**Why**: Database stores UTC, engine works with UTC. Only convert for business logic (trading hours check), then use original UTC timestamp.

### Rule 4: Return Type

```javascript
// ✅ CORRECT - Always return array
generateSignals(underlyingBars) {
    if (no conditions met) {
        return [];  // Empty array
    }
    return signals;  // Array of signals
}

// ❌ WRONG - Don't return null/undefined
generateSignals(underlyingBars) {
    if (no conditions met) {
        return null;  // Will crash!
    }
}
```

### Rule 5: Number Types

```javascript
// ✅ CORRECT - All prices/values as numbers
const price = parseFloat(bar.c);  // Convert to number
signals.push({
    underlying_price: price,       // Number
    signal_strength: 2.5,          // Number
    target_delta: 0.75             // Number
});

// ❌ WRONG - String values
signals.push({
    underlying_price: bar.c,       // String "199.50"
    signal_strength: "2.5",        // String
    target_delta: "0.75"           // String
});
```

---

## Testing Your Strategy

### Automated Validation (Always Run This First)

```bash
cd docker/backtesting-server
node test-strategy.js your-strategy-name
```

**This checks**:
- ✅ File exists and loads correctly
- ✅ All required properties present
- ✅ All required methods implemented
- ✅ Parameter ranges valid
- ✅ Signal structure correct
- ✅ Generates signals without errors
- ✅ Position management works

**Example output:**
```
============================================================
VALIDATING STRATEGY: iwm-macd-strategy
============================================================

[TEST 1] Checking if strategy file exists...
✅ File exists: /app/strategies/iwm-macd-strategy.js

[TEST 2] Loading strategy class...
✅ Strategy loaded successfully

[TEST 3] Creating strategy instance...
✅ Strategy instantiated successfully

[TEST 4] Validating required properties...
✅ Has property: name
✅ Has property: version
...

[TEST 9] Validating signal structure...
✅ Returns array with 5 signals
✅ Signal has field: timestamp
✅ Signal has field: signal_type
...

============================================================
VALIDATION COMPLETE
============================================================

🎉 ALL TESTS PASSED! Strategy is ready for backtesting.
```

### Small Backtest (Run This Next)

Test with 1-2 days before running full backtests:

```bash
# Inside container
docker exec trading_backtest curl -X POST http://localhost:3002/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "IWM",
    "strategy": "your-strategy-name",
    "startDate": "2024-03-04",
    "endDate": "2024-03-04",
    "initialCapital": 10000
  }'
```

**Check for**:
- ✅ Backtest completes (status: completed)
- ✅ At least some trades executed (total_trades > 0)
- ✅ No errors in logs
- ✅ Signals generated and matched

### Check Logs

```bash
docker logs trading_backtest 2>&1 | grep "your-strategy-name" | tail -50
```

**Look for**:
- `Generated X signals` - Strategy created signals
- `Found X signals at timestamp` - Signals matched to bars
- `OPENED position` / `CLOSED position` - Trades executed
- Any ERROR messages

---

## Common Pitfalls to Avoid

### 1. Timestamp Mismatch (The #1 Bug)

**Problem**: Signals generated but no trades executed

**Cause**: Creating new timestamps instead of using `bar.t`

**Solution**:
```javascript
// ✅ ALWAYS use bar.t
signals.push({ timestamp: bar.t, ... });
```

### 2. String vs Number Types

**Problem**: Frontend crashes or calculations fail

**Cause**: Returning string values instead of numbers

**Solution**:
```javascript
// ✅ ALWAYS parse to numbers
const price = parseFloat(bar.c);
const delta = parseFloat(this.parameters.targetDelta);
```

### 3. After-Hours Signals

**Problem**: Trades execute outside market hours

**Cause**: Not filtering by trading hours

**Solution**:
```javascript
// ✅ ALWAYS check EST hours before generating signals
const moment = require('moment-timezone');
const estTime = moment(new Date(bar.t)).tz('America/New_York');
const currentHour = estTime.hour();

if (currentHour < 9 || currentHour >= 16) {
    return; // Skip this bar
}
```

### 4. Missing Required Fields

**Problem**: Strategy errors or engine can't process signals

**Cause**: Incomplete signal objects

**Solution**: Use the template structure exactly, all 8 fields required

### 5. Incorrect Signal Type Names

**Problem**: Engine doesn't recognize signals

**Cause**: Using wrong string values

**Solution**:
```javascript
// ✅ CORRECT
signal_type: 'BUY_CALL'  // or 'BUY_PUT'
option_type: 'call'       // or 'put' (lowercase!)

// ❌ WRONG
signal_type: 'CALL'
option_type: 'CALL'
```

### 6. Not Handling Empty Data

**Problem**: Strategy crashes with insufficient data

**Cause**: Not checking array lengths

**Solution**:
```javascript
// ✅ ALWAYS check data availability
if (priceHistory.length < this.parameters.indicatorPeriod) {
    return; // Not enough data yet
}
```

---

## Working with AI Assistants

### When Asking Claude or Copilot to Build a Strategy

**Provide This Context**:

```
I need a new options trading strategy. Please follow these rules exactly:

1. Copy the structure from: docker/backtesting-server/strategies/STRATEGY_TEMPLATE.js

2. CRITICAL RULES:
   - Use bar.t for timestamp (don't create new Date objects)
   - All signal fields required: timestamp, signal_type, underlying_price,
     signal_strength, position_size, signal_reason, target_delta, option_type
   - signal_type must be 'BUY_CALL' or 'BUY_PUT' (exact strings)
   - option_type must be 'call' or 'put' (lowercase)
   - Convert timezone for trading hours check but use original bar.t in signal
   - Always return array (never null)
   - Parse all prices to numbers with parseFloat()

3. My strategy should:
   [Describe your strategy logic]

4. Parameters I want to use:
   [List your indicator periods, thresholds, etc.]

5. After writing, I will validate it with:
   node test-strategy.js strategy-name
```

### Asking for Modifications

```
I need to add [X indicator] to my strategy. Please:

1. Keep the existing structure
2. Add indicator calculation method
3. Update generateSignals() to use it
4. Don't change the signal structure or timestamp handling
5. Follow the same critical rules (bar.t, exact field names, etc.)
```

---

## Advanced: Adding New Indicators

### Pattern for Any Indicator

```javascript
/**
 * Calculate [Your Indicator Name]
 * @param {Array} prices - Array of closing prices
 * @param {Number} period - Lookback period
 * @returns {Number|Object|null} Indicator value(s) or null if insufficient data
 * @private
 */
calculateYourIndicator(prices, period) {
    // 1. Check sufficient data
    if (prices.length < period) return null;

    // 2. Get relevant slice
    const recentPrices = prices.slice(-period);

    // 3. Calculate indicator
    // ... your math here

    // 4. Return value (number or object with multiple values)
    return indicatorValue;
}
```

### Example: Bollinger Bands

```javascript
calculateBollingerBands(prices, period, stdDevMultiplier = 2) {
    if (prices.length < period) return null;

    const recentPrices = prices.slice(-period);

    // Calculate middle band (SMA)
    const sum = recentPrices.reduce((acc, price) => acc + price, 0);
    const middle = sum / period;

    // Calculate standard deviation
    const squaredDiffs = recentPrices.map(price => Math.pow(price - middle, 2));
    const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
    const stdDev = Math.sqrt(variance);

    // Calculate bands
    return {
        upper: middle + (stdDevMultiplier * stdDev),
        middle: middle,
        lower: middle - (stdDevMultiplier * stdDev),
        stdDev: stdDev
    };
}
```

### Using in Signal Generation

```javascript
// In generateSignals()
const bb = this.calculateBollingerBands(priceHistory, 20, 2);
if (!bb) return;

const currentPrice = parseFloat(bar.c);

// Buy when price touches lower band
if (currentPrice <= bb.lower) {
    signals.push({
        timestamp: bar.t,
        signal_type: 'BUY_CALL',
        underlying_price: currentPrice,
        signal_strength: Math.min(5, (bb.middle - currentPrice) / bb.stdDev),
        position_size: 1,
        signal_reason: `Price ${currentPrice.toFixed(2)} at lower BB ${bb.lower.toFixed(2)}`,
        target_delta: this.parameters.targetDelta,
        option_type: 'call'
    });
}
```

---

## Checklist Before Running Full Backtest

Use this checklist for every new strategy:

### Pre-Flight Checklist

- [ ] **Copied from template** - Used STRATEGY_TEMPLATE.js as starting point
- [ ] **Updated metadata** - name, version, description
- [ ] **Set all parameters** - All required parameters configured
- [ ] **Indicator implemented** - Calculation method added
- [ ] **Signal logic correct** - Generates signals with all required fields
- [ ] **Timestamps use bar.t** - No new Date() creation
- [ ] **Trading hours filtered** - Timezone conversion for 9-16 EST check
- [ ] **Number types** - All prices/values are numbers not strings
- [ ] **Validation passed** - `node test-strategy.js` shows all green
- [ ] **Small backtest run** - 1-2 day test completed successfully
- [ ] **Logs checked** - No errors, signals generated and matched
- [ ] **Trades executed** - At least some trades showing in results

### Only Then...

✅ **Ready for full multi-day backtest!**

---

## Quick Reference Card

**Save this near your desk:**

```
═══════════════════════════════════════════════════════════
            STRATEGY DEVELOPMENT QUICK REFERENCE
═══════════════════════════════════════════════════════════

WORKFLOW:
1. cp STRATEGY_TEMPLATE.js new-strategy.js
2. Edit: name, parameters, indicator, signal logic
3. node test-strategy.js new-strategy
4. Fix any errors shown
5. Run 1-day backtest
6. Check logs for errors
7. Run full backtest if all good

CRITICAL RULES:
✅ timestamp: bar.t (use exactly as is)
✅ signal_type: 'BUY_CALL' or 'BUY_PUT' (exact strings)
✅ option_type: 'call' or 'put' (lowercase)
✅ underlying_price: parseFloat(bar.c) (number not string)
✅ Always return array [] (never null)
✅ Filter trading hours 9-16 EST (convert timezone in strategy)
✅ All 8 signal fields required (no missing fields)

TEST COMMAND:
node test-strategy.js strategy-name

BACKTEST COMMAND:
curl -X POST http://localhost:3002/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{"symbol":"IWM","strategy":"your-strategy",...}'

CHECK LOGS:
docker logs trading_backtest | grep "your-strategy"

═══════════════════════════════════════════════════════════
```

---

## Summary

Following this guide ensures:
- ✅ **No timestamp matching bugs** - Use bar.t correctly
- ✅ **No type errors** - Numbers stay numbers
- ✅ **No timezone confusion** - Single conversion point
- ✅ **No missing fields** - Template has everything
- ✅ **Automated validation** - Catches errors before backtest
- ✅ **AI-friendly** - Claude/Copilot can follow the template

**Result**: Build once, works first time, scales to any number of strategies.

---

## Need Help?

If you encounter issues not covered here:

1. **Check validation output**: `node test-strategy.js your-strategy`
2. **Check logs**: `docker logs trading_backtest | grep "your-strategy"`
3. **Compare to template**: Make sure you didn't skip any required parts
4. **Check signal structure**: Use exact field names and types
5. **Test with mock data**: The validator tests with 200 bars automatically

Most issues are caught by the validator before you even run a backtest!
