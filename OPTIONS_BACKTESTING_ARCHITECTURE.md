# Options Backtesting System - Complete Architecture

## Executive Summary

This document outlines the comprehensive architecture for building a professional-grade options backtesting system with proper contract individualization, Greeks calculations, and strategy integration.

## ⚠️ CRITICAL DATA SOURCE DISTINCTION

**BACKTESTING (Historical)**
- **Data Source**: REST API (`/api/fetch-historical-data`)
- **Data Format**: OHLCV bars only (Open, High, Low, Close, Volume)
- **Pricing**: Uses **CLOSE price as mid price** (no bid/ask available)
- **Greeks Calculation**: Calculated from close price using `estimateGreeksFromOHLCV()`
- **Fill Simulation**: Uses close price with optional slippage model
- **Use Case**: Historical performance analysis, strategy validation

**LIVE PAPER TRADING**
- **Data Source**: WebSocket (`ws://localhost:3001/ws`)
- **Data Format**: Real-time bid/ask quotes
- **Pricing**: Uses **actual bid/ask spreads** for realistic execution
- **Greeks Calculation**: Calculated from bid/ask mid using `estimateGreeksFromMarket()`
- **Fill Simulation**: Uses bid for sells, ask for buys (realistic market impact)
- **Use Case**: Real-time strategy execution, order management

## 1. Core Requirements

### 1.1 Contract Individualization
- **Unique Contract Tracking**: Each option contract must have a unique identifier
- **Complete Lifecycle Management**: Track from entry to exit with all intermediate Greeks
- **Position Aggregation**: Support multiple contracts of same strike/expiry
- **P&L Attribution**: Calculate P&L per contract and aggregate by strategy

### 1.2 Greeks Calculation
- **Black-Scholes Implementation**: Calculate theoretical Greeks from market prices
- **Implied Volatility**: Reverse-engineer IV from option mid prices
- **Time Decay**: Accurate theta calculations accounting for weekends/holidays
- **Risk Metrics**: Delta, Gamma, Vega, Theta, Rho at entry and throughout hold period

### 1.3 Data Flow Requirements
- **Historical Data (Backtesting)**: REST API with OHLCV bars only - uses MID PRICES (close price from bars)
- **Live Data (Paper Trading)**: WebSocket with BID/ASK quotes for realistic order execution
- **Data Validation**: For backtesting, ensure valid OHLCV; for live trading, check bid/ask spreads
- **Contract Chain Management**: Build accurate option chains with proper strikes

---

## 2. System Architecture

### 2.1 Database Schema

```sql
-- Backtests table
CREATE TABLE IF NOT EXISTS backtests (
    id SERIAL PRIMARY KEY,
    strategy_name VARCHAR(100) NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    initial_capital DECIMAL(15, 2) NOT NULL,
    final_capital DECIMAL(15, 2),
    total_return DECIMAL(10, 4),
    sharpe_ratio DECIMAL(10, 4),
    max_drawdown DECIMAL(10, 4),
    win_rate DECIMAL(10, 4),
    total_trades INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    parameters JSONB -- Strategy-specific parameters
);

-- Individual option contracts
CREATE TABLE IF NOT EXISTS option_contracts (
    id SERIAL PRIMARY KEY,
    backtest_id INTEGER REFERENCES backtests(id),
    contract_symbol VARCHAR(50) NOT NULL, -- e.g., SPY251031C00450000
    underlying_symbol VARCHAR(20) NOT NULL,
    strike_price DECIMAL(10, 2) NOT NULL,
    expiry_date DATE NOT NULL,
    option_type VARCHAR(4) NOT NULL, -- CALL or PUT
    entry_timestamp TIMESTAMP NOT NULL,
    entry_price DECIMAL(10, 4) NOT NULL,
    entry_bid DECIMAL(10, 4),
    entry_ask DECIMAL(10, 4),
    quantity INTEGER NOT NULL,
    
    -- Greeks at entry
    entry_delta DECIMAL(8, 6),
    entry_gamma DECIMAL(8, 6),
    entry_theta DECIMAL(8, 6),
    entry_vega DECIMAL(8, 6),
    entry_rho DECIMAL(8, 6),
    entry_iv DECIMAL(8, 6), -- Implied Volatility
    
    -- Exit details
    exit_timestamp TIMESTAMP,
    exit_price DECIMAL(10, 4),
    exit_bid DECIMAL(10, 4),
    exit_ask DECIMAL(10, 4),
    
    -- Greeks at exit
    exit_delta DECIMAL(8, 6),
    exit_gamma DECIMAL(8, 6),
    exit_theta DECIMAL(8, 6),
    exit_vega DECIMAL(8, 6),
    exit_rho DECIMAL(8, 6),
    exit_iv DECIMAL(8, 6),
    
    -- P&L tracking
    gross_pnl DECIMAL(15, 4),
    net_pnl DECIMAL(15, 4),
    fees DECIMAL(10, 4),
    slippage DECIMAL(10, 4),
    
    -- Risk metrics
    max_adverse_excursion DECIMAL(10, 4), -- MAE
    max_favorable_excursion DECIMAL(10, 4), -- MFE
    holding_period_minutes INTEGER,
    
    -- Status
    status VARCHAR(20) NOT NULL, -- OPEN, CLOSED, EXPIRED
    close_reason VARCHAR(50), -- STRATEGY_EXIT, STOP_LOSS, TIME_STOP, EXPIRY
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Strategy signals table
CREATE TABLE IF NOT EXISTS strategy_signals (
    id SERIAL PRIMARY KEY,
    backtest_id INTEGER REFERENCES backtests(id),
    timestamp TIMESTAMP NOT NULL,
    signal_type VARCHAR(20) NOT NULL, -- BUY_CALL, BUY_PUT, SELL, HOLD
    symbol VARCHAR(20) NOT NULL,
    underlying_price DECIMAL(10, 4),
    
    -- Indicator values at signal time
    indicator_values JSONB,
    
    -- Contract selection criteria
    target_delta DECIMAL(8, 6),
    target_strike DECIMAL(10, 2),
    target_expiry DATE,
    
    -- Was signal executed?
    executed BOOLEAN DEFAULT FALSE,
    contract_id INTEGER REFERENCES option_contracts(id),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Greeks time series (for analysis)
CREATE TABLE IF NOT EXISTS contract_greeks_history (
    id SERIAL PRIMARY KEY,
    contract_id INTEGER REFERENCES option_contracts(id),
    timestamp TIMESTAMP NOT NULL,
    underlying_price DECIMAL(10, 4),
    option_price DECIMAL(10, 4),
    delta DECIMAL(8, 6),
    gamma DECIMAL(8, 6),
    theta DECIMAL(8, 6),
    vega DECIMAL(8, 6),
    rho DECIMAL(8, 6),
    implied_volatility DECIMAL(8, 6),
    time_to_expiry_days DECIMAL(10, 6),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_backtests_symbol_dates ON backtests(symbol, start_date, end_date);
CREATE INDEX idx_contracts_backtest ON option_contracts(backtest_id);
CREATE INDEX idx_contracts_symbol ON option_contracts(contract_symbol);
CREATE INDEX idx_signals_backtest ON strategy_signals(backtest_id);
CREATE INDEX idx_greeks_contract ON contract_greeks_history(contract_id, timestamp);
```

### 2.2 Greeks Calculation Module

**File**: `/docker/backtesting-server/utils/greeks-calculator.js`

```javascript
/**
 * Black-Scholes Options Pricing and Greeks Calculator
 * Based on industry-standard formulas
 */

class GreeksCalculator {
  constructor() {
    this.RISK_FREE_RATE = 0.05; // 5% annual risk-free rate
    this.TRADING_DAYS_PER_YEAR = 252;
  }

  /**
   * Standard normal cumulative distribution function
   */
  normCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const probability = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - probability : probability;
  }

  /**
   * Standard normal probability density function
   */
  normPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * Calculate time to expiry in years
   */
  timeToExpiry(expiryDate, currentDate = new Date()) {
    const millisecondsPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const timeMs = new Date(expiryDate) - currentDate;
    return Math.max(timeMs / millisecondsPerYear, 0.0001); // Prevent division by zero
  }

  /**
   * Calculate implied volatility using Newton-Raphson method
   * @param {number} marketPrice - Observed option price
   * @param {number} S - Stock price
   * @param {number} K - Strike price
   * @param {number} T - Time to expiry (years)
   * @param {string} optionType - 'call' or 'put'
   * @param {number} r - Risk-free rate
   */
  impliedVolatility(marketPrice, S, K, T, optionType, r = this.RISK_FREE_RATE) {
    let sigma = 0.5; // Initial guess
    const maxIterations = 100;
    const tolerance = 0.0001;

    for (let i = 0; i < maxIterations; i++) {
      const price = this.blackScholesPrice(S, K, T, r, sigma, optionType);
      const vega = this.vega(S, K, T, r, sigma);

      const diff = marketPrice - price;
      if (Math.abs(diff) < tolerance) {
        return sigma;
      }

      if (vega === 0) break;
      sigma = sigma + diff / vega;

      // Keep sigma positive and reasonable
      sigma = Math.max(0.01, Math.min(5.0, sigma));
    }

    return sigma; // Return best estimate even if not fully converged
  }

  /**
   * Black-Scholes option pricing formula
   */
  blackScholesPrice(S, K, T, r, sigma, optionType) {
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (optionType === 'call' || optionType === 'CALL' || optionType === 'C') {
      return S * this.normCDF(d1) - K * Math.exp(-r * T) * this.normCDF(d2);
    } else {
      return K * Math.exp(-r * T) * this.normCDF(-d2) - S * this.normCDF(-d1);
    }
  }

  /**
   * Calculate Delta (price sensitivity to underlying)
   */
  delta(S, K, T, r, sigma, optionType) {
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));

    if (optionType === 'call' || optionType === 'CALL' || optionType === 'C') {
      return this.normCDF(d1);
    } else {
      return this.normCDF(d1) - 1;
    }
  }

  /**
   * Calculate Gamma (rate of change of delta)
   */
  gamma(S, K, T, r, sigma) {
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    return this.normPDF(d1) / (S * sigma * Math.sqrt(T));
  }

  /**
   * Calculate Theta (time decay)
   */
  theta(S, K, T, r, sigma, optionType) {
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const term1 = -(S * this.normPDF(d1) * sigma) / (2 * Math.sqrt(T));

    if (optionType === 'call' || optionType === 'CALL' || optionType === 'C') {
      const term2 = r * K * Math.exp(-r * T) * this.normCDF(d2);
      return (term1 - term2) / 365; // Convert to daily theta
    } else {
      const term2 = r * K * Math.exp(-r * T) * this.normCDF(-d2);
      return (term1 + term2) / 365; // Convert to daily theta
    }
  }

  /**
   * Calculate Vega (sensitivity to volatility)
   */
  vega(S, K, T, r, sigma) {
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    return S * this.normPDF(d1) * Math.sqrt(T) / 100; // Divide by 100 for 1% move
  }

  /**
   * Calculate Rho (sensitivity to interest rate)
   */
  rho(S, K, T, r, sigma, optionType) {
    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    if (optionType === 'call' || optionType === 'CALL' || optionType === 'C') {
      return K * T * Math.exp(-r * T) * this.normCDF(d2) / 100; // Divide by 100 for 1% move
    } else {
      return -K * T * Math.exp(-r * T) * this.normCDF(-d2) / 100;
    }
  }

  /**
   * Calculate all Greeks at once
   * @param {number} S - Underlying stock price
   * @param {number} K - Strike price
   * @param {number} T - Time to expiry in years
   * @param {number} r - Risk-free rate
   * @param {number} sigma - Volatility (if null, will calculate from marketPrice)
   * @param {string} optionType - 'call' or 'put'
   * @param {number} marketPrice - Market price for IV calculation (CLOSE price from OHLCV bars for backtesting)
   */
  calculateAllGreeks(S, K, T, r, sigma, optionType, marketPrice = null) {
    // If market price provided, calculate IV first
    if (marketPrice) {
      sigma = this.impliedVolatility(marketPrice, S, K, T, optionType, r);
    }

    return {
      delta: this.delta(S, K, T, r, sigma, optionType),
      gamma: this.gamma(S, K, T, r, sigma),
      theta: this.theta(S, K, T, r, sigma, optionType),
      vega: this.vega(S, K, T, r, sigma),
      rho: this.rho(S, K, T, r, sigma, optionType),
      impliedVolatility: sigma,
      theoreticalPrice: this.blackScholesPrice(S, K, T, r, sigma, optionType)
    };
  }

  /**
   * BACKTESTING MODE: Estimate Greeks from OHLCV bar data (uses CLOSE price as mid)
   * This is used during backtesting where only historical OHLCV bars are available
   */
  estimateGreeksFromOHLCV(underlyingPrice, strikePrice, expiryDate, optionType, ohlcvBar) {
    const midPrice = parseFloat(ohlcvBar.c); // Use CLOSE as mid price for backtesting
    const timeToExpiry = this.timeToExpiry(expiryDate);

    return this.calculateAllGreeks(
      underlyingPrice,
      strikePrice,
      timeToExpiry,
      this.RISK_FREE_RATE,
      null, // Let it calculate IV from close price
      optionType,
      midPrice
    );
  }

  /**
   * LIVE TRADING MODE: Estimate Greeks from bid/ask quotes (WebSocket data)
   * This is used during live paper trading where real-time bid/ask is available
   */
  estimateGreeksFromMarket(underlyingPrice, strikePrice, expiryDate, optionType, bid, ask, last) {
    const midPrice = (parseFloat(bid) + parseFloat(ask)) / 2;
    const timeToExpiry = this.timeToExpiry(expiryDate);

    return this.calculateAllGreeks(
      underlyingPrice,
      strikePrice,
      timeToExpiry,
      this.RISK_FREE_RATE,
      null, // Let it calculate IV
      optionType,
      midPrice
    );
  }
}

module.exports = GreeksCalculator;
```

---

## 3. Contract Selection Strategy

### 3.1 Selection Criteria

**Priority Order:**
1. **Delta Targeting**: Select contracts with delta closest to strategy target
2. **Bid/Ask Spread**: Filter out contracts with spread > 15% of mid price
3. **Volume/Open Interest**: Require minimum liquidity
4. **Expiry Management**: Prefer specific DTE based on strategy
5. **Strike Selection**: ITM, ATM, or OTM based on delta preference

### 3.2 Implementation

**File**: `/docker/backtesting-server/utils/contract-selector.js`

```javascript
class ContractSelector {
  constructor(greeksCalculator) {
    this.greeksCalculator = greeksCalculator;
  }

  /**
   * Select best contract based on strategy criteria
   * @param {Array} optionChain - Array of option contracts with OHLCV data
   * @param {Object} criteria - Selection criteria
   * @returns {Object} Best matching contract with calculated Greeks
   */
  selectBestContract(optionChain, criteria) {
    const {
      targetDelta = 0.30,       // Default to 30-delta for OTM
      optionType = 'CALL',      // CALL or PUT
      maxSpreadPct = 0.15,      // 15% max bid/ask spread (LIVE ONLY - ignored for backtesting)
      minVolume = 10,           // Minimum daily volume
      preferredDTE = 0,         // Days to expiration
      underlyingPrice,
      riskFreeRate = 0.05,
      mode = 'backtest'         // 'backtest' or 'live'
    } = criteria;

    // Filter valid contracts
    const validContracts = optionChain.filter(contract => {
      // For backtesting with OHLCV data
      if (mode === 'backtest') {
        const closePrice = parseFloat(contract.close || contract.c);
        return (
          contract.option_type === optionType &&
          parseFloat(contract.volume || contract.v || 0) >= minVolume &&
          closePrice > 0.05 // Minimum price to avoid near-zero options
        );
      }
      
      // For live trading with bid/ask data
      else {
        const bid = parseFloat(contract.bid);
        const ask = parseFloat(contract.ask);
        const mid = (bid + ask) / 2;
        const spread = ask - bid;
        const spreadPct = mid > 0 ? spread / mid : 1;

        return (
          contract.option_type === optionType &&
          spreadPct <= maxSpreadPct &&
          parseFloat(contract.volume || 0) >= minVolume &&
          mid > 0.05
        );
      }
    });

    if (validContracts.length === 0) {
      return null;
    }

    // Calculate Greeks for each valid contract
    const contractsWithGreeks = validContracts.map(contract => {
      let greeks;
      
      if (mode === 'backtest') {
        // Use OHLCV bar data for backtesting
        const ohlcvBar = {
          o: contract.open || contract.o,
          h: contract.high || contract.h,
          l: contract.low || contract.l,
          c: contract.close || contract.c,
          v: contract.volume || contract.v
        };
        greeks = this.greeksCalculator.estimateGreeksFromOHLCV(
          underlyingPrice,
          parseFloat(contract.strike_price),
          contract.expiry_date,
          optionType,
          ohlcvBar
        );
      } else {
        // Use bid/ask data for live trading
        greeks = this.greeksCalculator.estimateGreeksFromMarket(
          underlyingPrice,
          parseFloat(contract.strike_price),
          contract.expiry_date,
          optionType,
          contract.bid,
          contract.ask,
          contract.last
        );
      }

      return {
        ...contract,
        greeks,
        deltaDistance: Math.abs(greeks.delta - targetDelta)
      };
    });

    // Sort by delta distance (closest to target)
    contractsWithGreeks.sort((a, b) => a.deltaDistance - b.deltaDistance);

    return contractsWithGreeks[0];
  }

  /**
   * Build option chain from historical OHLCV bars (BACKTESTING MODE)
   * @param {string} symbol - Underlying symbol
   * @param {string} expiryDate - Option expiry date
   * @param {number} underlyingPrice - Current underlying price
   * @param {Object} historicalData - Alpaca options bars response
   * @returns {Array} Option chain with OHLCV data
   */
  async buildOptionChainFromBars(symbol, expiryDate, underlyingPrice, historicalData) {
    const optionChain = [];

    Object.entries(historicalData.bars || {}).forEach(([contractSymbol, bars]) => {
      if (!Array.isArray(bars) || bars.length === 0) return;

      // Parse option symbol: SPY251031C00450000
      const match = contractSymbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
      if (!match) return;

      const [, underlying, expiry, optType, strikeString] = match;
      const strike = parseInt(strikeString) / 1000;

      // Get latest bar (OHLCV)
      const latestBar = bars[0]; // Assumes sorted desc

      optionChain.push({
        contract_symbol: contractSymbol,
        underlying_symbol: underlying,
        strike_price: strike,
        expiry_date: expiryDate,
        option_type: optType === 'C' ? 'CALL' : 'PUT',
        // OHLCV data (no bid/ask in backtesting)
        open: latestBar.o,
        high: latestBar.h,
        low: latestBar.l,
        close: latestBar.c, // This is our "mid price" for backtesting
        volume: latestBar.v,
        timestamp: latestBar.t
      });
    });

    return optionChain;
  }

  /**
   * Build option chain from live quotes (LIVE TRADING MODE)
   * @param {string} symbol - Underlying symbol
   * @param {Array} quotes - Live WebSocket quotes with bid/ask
   * @returns {Array} Option chain with bid/ask data
   */
  async buildOptionChainFromQuotes(symbol, quotes) {
    return quotes.map(quote => ({
      contract_symbol: quote.symbol,
      underlying_symbol: symbol,
      strike_price: quote.strike,
      expiry_date: quote.expiry,
      option_type: quote.type,
      // Live bid/ask data
      bid: quote.bid,
      ask: quote.ask,
      last: quote.last,
      volume: quote.volume,
      timestamp: quote.timestamp
    }));
  }
}

module.exports = ContractSelector;
```

---

## 4. Strategy Enhancement

### 4.1 HAVWAP Strategy with Options

**File**: `/docker/backtesting-server/strategies/havwap-options.js`

```javascript
class HAVWAPOptionsStrategy {
  constructor(params = {}) {
    this.vwapPeriod = params.vwapPeriod || 60; // 1 hour
    this.slopeThreshold = params.slopeThreshold || 0.0001;
    this.deltaTarget = params.deltaTarget || 0.30; // 30-delta options
    this.maxHoldingPeriod = params.maxHoldingPeriod || 60; // minutes
    this.profitTarget = params.profitTarget || 0.30; // 30% profit
    this.stopLoss = params.stopLoss || 0.50; // 50% loss
  }

  /**
   * Calculate Hourly-Anchored VWAP
   */
  calculateHAVWAP(bars) {
    const hourlyVWAPs = [];
    let currentHour = null;
    let cumulativePV = 0;
    let cumulativeVolume = 0;

    bars.forEach((bar, index) => {
      const barTime = new Date(bar.t);
      const barHour = barTime.getHours();

      // Reset on new hour
      if (barHour !== currentHour) {
        currentHour = barHour;
        cumulativePV = 0;
        cumulativeVolume = 0;
      }

      const typical = (bar.h + bar.l + bar.c) / 3;
      cumulativePV += typical * bar.v;
      cumulativeVolume += bar.v;

      const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : typical;

      hourlyVWAPs.push({
        timestamp: bar.t,
        price: bar.c,
        vwap: vwap,
        volume: bar.v
      });
    });

    return hourlyVWAPs;
  }

  /**
   * Calculate VWAP slope
   */
  calculateSlope(vwapData, lookback = 10) {
    if (vwapData.length < lookback) return 0;

    const recent = vwapData.slice(-lookback);
    const sumX = recent.reduce((sum, _, i) => sum + i, 0);
    const sumY = recent.reduce((sum, d) => sum + d.vwap, 0);
    const sumXY = recent.reduce((sum, d, i) => sum + i * d.vwap, 0);
    const sumX2 = recent.reduce((sum, _, i) => sum + i * i, 0);

    const n = recent.length;
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

    return slope;
  }

  /**
   * Generate trading signals
   */
  generateSignals(underlyingBars) {
    const vwapData = this.calculateHAVWAP(underlyingBars);
    const signals = [];

    vwapData.forEach((data, index) => {
      if (index < this.vwapPeriod) return; // Need enough history

      const slope = this.calculateSlope(vwapData.slice(0, index + 1), 10);
      const priceVsVWAP = data.price - data.vwap;
      const priceVsVWAPPct = priceVsVWAP / data.vwap;

      // CALL signal: Price below VWAP with positive slope
      if (priceVsVWAPPct < -0.002 && slope > this.slopeThreshold) {
        signals.push({
          timestamp: data.timestamp,
          signal_type: 'BUY_CALL',
          underlying_price: data.price,
          vwap: data.vwap,
          slope: slope,
          priceVsVWAPPct: priceVsVWAPPct,
          indicator_values: {
            vwap: data.vwap,
            slope: slope,
            priceDistance: priceVsVWAPPct
          },
          target_delta: this.deltaTarget
        });
      }

      // PUT signal: Price above VWAP with negative slope
      if (priceVsVWAPPct > 0.002 && slope < -this.slopeThreshold) {
        signals.push({
          timestamp: data.timestamp,
          signal_type: 'BUY_PUT',
          underlying_price: data.price,
          vwap: data.vwap,
          slope: slope,
          priceVsVWAPPct: priceVsVWAPPct,
          indicator_values: {
            vwap: data.vwap,
            slope: slope,
            priceDistance: priceVsVWAPPct
          },
          target_delta: -this.deltaTarget // Negative for puts
        });
      }
    });

    return signals;
  }

  /**
   * Check exit conditions
   */
  shouldExit(position, currentPrice, currentTime) {
    const entryTime = new Date(position.entry_timestamp);
    const holdingMinutes = (new Date(currentTime) - entryTime) / (1000 * 60);

    const currentValue = currentPrice * position.quantity * 100; // Contract multiplier
    const entryValue = position.entry_price * position.quantity * 100;
    const pnlPct = (currentValue - entryValue) / entryValue;

    // Time stop
    if (holdingMinutes >= this.maxHoldingPeriod) {
      return { shouldExit: true, reason: 'TIME_STOP' };
    }

    // Profit target
    if (pnlPct >= this.profitTarget) {
      return { shouldExit: true, reason: 'PROFIT_TARGET' };
    }

    // Stop loss
    if (pnlPct <= -this.stopLoss) {
      return { shouldExit: true, reason: 'STOP_LOSS' };
    }

    return { shouldExit: false };
  }
}

module.exports = HAVWAPOptionsStrategy;
```

---

## 5. Implementation Phases

### Phase 1: Database & Greeks Engine (Days 1-2)
1. Create database migration for new schema
2. Implement GreeksCalculator class with full testing
3. Validate Greeks calculations against known values

### Phase 2: Contract Selection & Management (Days 3-4)
4. Build ContractSelector class
5. Implement contract tracking and P&L calculation
6. Create API endpoints for contract queries

### Phase 3: Strategy Enhancement (Days 5-6)
7. Refactor HAVWAP strategy for options
8. Add signal generation with contract selection
9. Implement exit logic and risk management

### Phase 4: Backtesting Engine (Days 7-9)
10. Build backtesting orchestrator
11. Integrate with historical data fetching
12. Add position management and tracking

### Phase 5: Visualization & Validation (Days 10-12)
13. Integrate charts with strategy indicators
14. Add Greeks visualization overlays
15. Multi-day validation testing
16. Performance optimization

---

## 6. Testing Strategy

### 6.1 Unit Tests
- Greeks calculation accuracy (compare to known values)
- Contract selection logic
- P&L calculations
- Strategy signal generation

### 6.2 Integration Tests
- End-to-end backtest execution
- Database persistence
- API endpoint functionality

### 6.3 Multi-Day Validation
- Test across 10 different market conditions:
  - Trending up days
  - Trending down days
  - Ranging/choppy days
  - High volatility days
  - Low volatility days
  - Gap up/down days

### 6.4 Performance Benchmarks
- Backtest execution time < 30 seconds per day
- Greeks calculation < 5ms per contract
- Memory usage < 2GB for full day backtest

---

## 7. Success Metrics

1. **Accuracy**: Greeks within 5% of market-observed values
2. **Performance**: Can backtest 30 days of SPY 0DTE in < 15 minutes
3. **Contract Tracking**: 100% accurate P&L attribution per contract
4. **Strategy Validation**: Matches expected results across different market conditions
5. **Data Quality**: <1% data errors in historical fetching

---

## Next Steps

1. Review and approve this architecture
2. Create database migration scripts
3. Begin Phase 1 implementation
4. Set up continuous testing framework
5. Document API endpoints for frontend integration

