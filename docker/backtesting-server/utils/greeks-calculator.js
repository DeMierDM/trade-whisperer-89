/**
 * Black-Scholes Options Pricing and Greeks Calculator
 * 
 * Supports dual modes:
 * - BACKTESTING: Calculate Greeks from OHLCV bars (uses close price as mid)
 * - LIVE TRADING: Calculate Greeks from bid/ask quotes
 * 
 * Based on industry-standard Black-Scholes model with Newton-Raphson
 * method for implied volatility calculation.
 */

class GreeksCalculator {
  constructor(config = {}) {
    this.RISK_FREE_RATE = config.riskFreeRate || 0.05; // 5% annual
    this.TRADING_DAYS_PER_YEAR = 252;
    this.HOURS_PER_TRADING_DAY = 6.5; // 9:30 AM - 4:00 PM
  }

  /**
   * Standard normal cumulative distribution function (CDF)
   * Uses Hart's approximation for high accuracy
   * @param {number} x - Input value
   * @returns {number} Probability
   */
  normCDF(x) {
    if (x < -7) return 0;
    if (x > 7) return 1;
    
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob = d * t * (
      0.3193815 + 
      t * (-0.3565638 + 
      t * (1.781478 + 
      t * (-1.821256 + 
      t * 1.330274)))
    );
    
    return x > 0 ? 1 - prob : prob;
  }

  /**
   * Standard normal probability density function (PDF)
   * @param {number} x - Input value
   * @returns {number} Density
   */
  normPDF(x) {
    return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  }

  /**
   * Calculate time to expiry in years
   * Accounts for market hours and trading days
   * For 0DTE options: calculates remaining time from current bar to 4:00 PM ET
   * 
   * @param {Date|string} expiryDate - Option expiration date
   * @param {Date|string} currentDate - Current date/time (bar timestamp for backtesting)
   * @returns {number} Time to expiry in years (annualized)
   */
  /**
   * Determine if a given date is during daylight saving time for US Eastern Time
   * DST runs from 2nd Sunday in March to 1st Sunday in November
   */
  isDaylightSavingTime(date) {
    const year = date.getUTCFullYear();
    
    // Find 2nd Sunday in March
    const marchFirst = new Date(year, 2, 1); // March 1st
    const marchFirstDay = marchFirst.getDay(); // 0 = Sunday
    const dstStart = new Date(year, 2, 8 + (7 - marchFirstDay) % 7); // 2nd Sunday
    
    // Find 1st Sunday in November  
    const novFirst = new Date(year, 10, 1); // November 1st
    const novFirstDay = novFirst.getDay(); // 0 = Sunday
    const dstEnd = new Date(year, 10, 1 + (7 - novFirstDay) % 7); // 1st Sunday
    
    // Convert input date to local time for comparison
    const localDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    
    return localDate >= dstStart && localDate < dstEnd;
  }

  timeToExpiry(expiryDate, currentTime) {
    const expiry = new Date(expiryDate);
    const current = new Date(currentTime || Date.now());
    
    // Log the inputs for debugging
    console.log(`[GreeksCalculator] timeToExpiry called with:`);
    console.log(`  Expiry Date: ${expiry.toISOString()}`);
    console.log(`  Current Time: ${current.toISOString()}`);
    
    // Create expiry datetime at market close (4:00 PM ET)
    // CRITICAL FIX: Handle both backtesting (historical) and live trading properly
    // Market close is 4:00 PM ET = 21:00 UTC (during standard time) or 20:00 UTC (during daylight time)
    // For backtesting, we need to use the correct UTC offset for the historical date
    
    // Determine if the expiry date was during daylight saving time
    const year = expiry.getUTCFullYear();
    const isDST = this.isDaylightSavingTime(expiry);
    const utcHour = isDST ? 20 : 21; // 4 PM ET = 20 UTC (DST) or 21 UTC (Standard)
    
    const expiryAtClose = new Date(Date.UTC(
      expiry.getUTCFullYear(),
      expiry.getUTCMonth(),
      expiry.getUTCDate(),
      utcHour, 0, 0, 0
    ));
    
    const millisecondsPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const timeMs = expiryAtClose - current;
    
    // For 0DTE during market hours, we calculate exact time remaining
    // Example: If current time is 10:30 AM and expiry is 4:00 PM same day:
    //   timeMs = 5.5 hours = 5.5/24 = 0.229 days = 0.229/365.25 = 0.000627 years
    //   As we approach 4:00 PM, T decreases toward 0
    
    if (timeMs > 0) {
      const T = timeMs / millisecondsPerYear;
      const hoursRemaining = timeMs / (1000 * 60 * 60);
      console.log(`⏰ [TIME DEBUG] Current: ${current.toISOString()}, Expiry: ${expiryAtClose.toISOString()}, Hours: ${hoursRemaining.toFixed(2)}, T: ${T.toFixed(6)}`);
      return T;
    }
    
    // If already expired, contracts should have no theoretical value
    // Return 0 to indicate expiry - calling code should handle this case
    console.log(`⚠️ [EXPIRED CONTRACT] Current: ${current.toISOString()}, Expiry: ${expiryAtClose.toISOString()}, timeMs: ${timeMs} - CONTRACT EXPIRED`);
    return 0;
  }

  /**
   * Calculate implied volatility using Newton-Raphson method
   * @param {number} marketPrice - Observed option price
   * @param {number} S - Underlying stock price
   * @param {number} K - Strike price
   * @param {number} T - Time to expiry (years)
   * @param {string} optionType - 'call', 'CALL', 'C', 'put', 'PUT', or 'P'
   * @param {number} r - Risk-free rate
   * @returns {number} Implied volatility (as decimal, e.g., 0.25 = 25%)
   */
  impliedVolatility(marketPrice, S, K, T, optionType, r = this.RISK_FREE_RATE) {
    // Handle edge cases
    if (marketPrice <= 0.01) return 0.20; // Default 20% IV for very cheap options
    
    // For very short-dated options (0DTE), estimate IV from time decay
    if (T < 0.001) { // Less than ~9 hours
      const intrinsic = this.intrinsicValue(S, K, optionType);
      const timeValue = Math.max(0, marketPrice - intrinsic);
      
      // For 0DTE options, estimate IV based on time value relative to underlying
      // Time value represents acceleration risk and volatility expectations
      if (timeValue <= 0.01) {
        return 0.15; // Minimum 15% IV for 0DTE with no time value
      }
      
      // Estimate IV from time value: higher time value = higher IV
      // For 0DTE, typical IV ranges from 20% to 200%
      const timeValueRatio = timeValue / S;
      let estimatedIV = Math.max(0.20, Math.min(2.0, timeValueRatio * 100));
      
      console.log(`🔍 [0DTE IV] Intrinsic=${intrinsic.toFixed(2)}, TimeValue=${timeValue.toFixed(2)}, EstimatedIV=${(estimatedIV*100).toFixed(1)}%`);
      return estimatedIV;
    }
    
    let sigma = 0.5; // Initial guess: 50% volatility
    const maxIterations = 100;
    const tolerance = 0.0001;

    for (let i = 0; i < maxIterations; i++) {
      const price = this.blackScholesPrice(S, K, T, r, sigma, optionType);
      const vega = this.vega(S, K, T, r, sigma);

      const diff = marketPrice - price;
      
      // Check convergence
      if (Math.abs(diff) < tolerance) {
        return sigma;
      }

      // Prevent division by zero
      if (vega === 0 || !isFinite(vega)) {
        break;
      }
      
      // Newton-Raphson update
      sigma = sigma + diff / (vega * 100); // vega is per 1% move

      // Keep sigma within reasonable bounds
      sigma = Math.max(0.01, Math.min(5.0, sigma));
    }

    // If not converged, return best estimate
    return sigma;
  }

  /**
   * Calculate intrinsic value of option
   * @param {number} S - Underlying price
   * @param {number} K - Strike price
   * @param {string} optionType - 'call' or 'put'
   * @returns {number} Intrinsic value
   */
  intrinsicValue(S, K, optionType) {
    const type = optionType.toUpperCase();
    if (type === 'CALL' || type === 'C') {
      return Math.max(0, S - K);
    } else {
      return Math.max(0, K - S);
    }
  }

  /**
   * Black-Scholes option pricing formula
   * @param {number} S - Underlying stock price
   * @param {number} K - Strike price
   * @param {number} T - Time to expiry (years)
   * @param {number} r - Risk-free rate
   * @param {number} sigma - Volatility (IV)
   * @param {string} optionType - 'call' or 'put'
   * @returns {number} Theoretical option price
   */
  blackScholesPrice(S, K, T, r, sigma, optionType) {
    if (T <= 0) {
      return this.intrinsicValue(S, K, optionType);
    }

    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const type = optionType.toUpperCase();
    if (type === 'CALL' || type === 'C') {
      return S * this.normCDF(d1) - K * Math.exp(-r * T) * this.normCDF(d2);
    } else {
      return K * Math.exp(-r * T) * this.normCDF(-d2) - S * this.normCDF(-d1);
    }
  }

  /**
   * Calculate Delta (∂V/∂S)
   * Measures option price change per $1 move in underlying
   * @returns {number} Delta (0 to 1 for calls, -1 to 0 for puts)
   */
  delta(S, K, T, r, sigma, optionType) {
    if (T <= 0) {
      const intrinsic = this.intrinsicValue(S, K, optionType);
      return intrinsic > 0 ? (optionType.toUpperCase()[0] === 'C' ? 1 : -1) : 0;
    }

    // DISABLED: Let Black-Scholes handle all cases for now to get dynamic Greeks
    // if (T < 0.000029) { ... }

    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));

    const type = optionType.toUpperCase();
    if (type === 'CALL' || type === 'C') {
      return this.normCDF(d1);
    } else {
      return this.normCDF(d1) - 1;
    }
  }

  /**
   * Calculate Gamma (∂²V/∂S²)
   * Measures rate of change of delta
   * @returns {number} Gamma (same for calls and puts)
   */
  gamma(S, K, T, r, sigma) {
    if (T <= 0) return 0;

    // DISABLED: Let Black-Scholes handle all cases for now to get dynamic Greeks
    // if (T < 0.000029) { ... }

    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    return this.normPDF(d1) / (S * sigma * Math.sqrt(T));
  }

  /**
   * Calculate Theta (∂V/∂t)
   * Measures time decay (converted to daily)
   * @returns {number} Theta (daily time decay)
   */
  theta(S, K, T, r, sigma, optionType) {
    if (T <= 0) return 0;

    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const term1 = -(S * this.normPDF(d1) * sigma) / (2 * Math.sqrt(T));

    const type = optionType.toUpperCase();
    if (type === 'CALL' || type === 'C') {
      const term2 = r * K * Math.exp(-r * T) * this.normCDF(d2);
      return (term1 - term2) / 365; // Convert to daily theta
    } else {
      const term2 = r * K * Math.exp(-r * T) * this.normCDF(-d2);
      return (term1 + term2) / 365; // Convert to daily theta
    }
  }

  /**
   * Calculate Vega (∂V/∂σ)
   * Measures sensitivity to 1% change in IV
   * @returns {number} Vega (per 1% IV change)
   */
  vega(S, K, T, r, sigma) {
    if (T <= 0) return 0;

    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    return S * this.normPDF(d1) * Math.sqrt(T) / 100; // Per 1% move
  }

  /**
   * Calculate Rho (∂V/∂r)
   * Measures sensitivity to 1% change in interest rate
   * @returns {number} Rho (per 1% rate change)
   */
  rho(S, K, T, r, sigma, optionType) {
    if (T <= 0) return 0;

    const d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / (sigma * Math.sqrt(T));
    const d2 = d1 - sigma * Math.sqrt(T);

    const type = optionType.toUpperCase();
    if (type === 'CALL' || type === 'C') {
      return K * T * Math.exp(-r * T) * this.normCDF(d2) / 100;
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
   * @param {number} marketPrice - Market price for IV calculation
   * @returns {Object} All Greeks and theoretical price
   */
  calculateAllGreeks(S, K, T, r, sigma, optionType, marketPrice = null) {
    // DEBUG: Log all inputs to Black-Scholes calculation
    console.log(`🧮 [BLACK-SCHOLES INPUT] S=${S?.toFixed(2)}, K=${K}, T=${T?.toFixed(6)} (${(T * 365.25 * 24 * 60)?.toFixed(1)} min), r=${r?.toFixed(3)}, marketPrice=${marketPrice?.toFixed(2)}, type=${optionType}`);
    
    // If market price provided but no sigma, calculate IV
    if (marketPrice && !sigma) {
      sigma = this.impliedVolatility(marketPrice, S, K, T, optionType, r);
    }
    
    // If still no sigma, use default
    if (!sigma) {
      sigma = 0.30; // Default 30% IV
    }

    const delta = this.delta(S, K, T, r, sigma, optionType);
    const gamma = this.gamma(S, K, T, r, sigma);
    const theta = this.theta(S, K, T, r, sigma, optionType);
    const vega = this.vega(S, K, T, r, sigma);
    const rho = this.rho(S, K, T, r, sigma, optionType);
    const theoreticalPrice = this.blackScholesPrice(S, K, T, r, sigma, optionType);
    
    // DEBUG: Log calculated Greeks
    console.log(`📊 [CALCULATED GREEKS] Delta=${delta?.toFixed(4)}, Gamma=${gamma?.toFixed(4)}, Theta=${theta?.toFixed(4)}, Vega=${vega?.toFixed(4)}, IV=${sigma?.toFixed(3)}, TheoPrice=${theoreticalPrice?.toFixed(2)}`);
    
    return {
      delta,
      gamma,
      theta,
      vega,
      rho,
      impliedVolatility: sigma,
      theoreticalPrice,
      timeToExpiry: T,
      intrinsicValue: this.intrinsicValue(S, K, optionType)
    };
  }

  /**
   * BACKTESTING MODE: Estimate Greeks from OHLCV bar data
   * Uses CLOSE price as mid price (no bid/ask available in historical data)
   * 
   * @param {number} underlyingPrice - Current underlying stock price
   * @param {number} strikePrice - Option strike price
   * @param {Date|string} expiryDate - Option expiration date
   * @param {string} optionType - 'CALL' or 'PUT'
   * @param {Object} ohlcvBar - Bar with {o, h, l, c, v, t} structure
   * @param {Date|string} barTimestamp - Optional: timestamp of this bar (defaults to bar.t or now)
   * @returns {Object} Greeks calculated from close price
   */
  estimateGreeksFromOHLCV(underlyingPrice, strikePrice, expiryDate, optionType, ohlcvBar, barTimestamp = null) {
    const midPrice = parseFloat(ohlcvBar.c); // CLOSE is our mid price
    
    // Validate input values
    if (!isFinite(underlyingPrice) || underlyingPrice <= 0) {
      console.warn(`🔍 [GREEKS DEBUG] Invalid underlying price: ${underlyingPrice}`);
      return this.getDefaultGreeks();
    }
    
    if (!isFinite(strikePrice) || strikePrice <= 0) {
      console.warn(`🔍 [GREEKS DEBUG] Invalid strike price: ${strikePrice}`);
      return this.getDefaultGreeks();
    }
    
    if (!isFinite(midPrice) || midPrice <= 0) {
      console.warn(`🔍 [GREEKS DEBUG] Invalid option price: ${midPrice} (from close: ${ohlcvBar.c})`);
      return this.getDefaultGreeks();
    }
    
    // Use bar timestamp if provided, otherwise use bar.t, otherwise use current time
    const currentTime = barTimestamp || ohlcvBar.t || new Date();
    const timeToExpiry = this.timeToExpiry(expiryDate, currentTime);
    
    if (!isFinite(timeToExpiry) || timeToExpiry <= 0) {
      console.warn(`🔍 [GREEKS DEBUG] Invalid time to expiry: ${timeToExpiry}`);
      return this.getDefaultGreeks();
    }

    // DEBUG: Log the key values for troubleshooting
    console.log(`🔍 [GREEKS DEBUG] S=${underlyingPrice.toFixed(2)}, K=${strikePrice}, T=${timeToExpiry.toFixed(6)}, Type=${optionType}, Price=${midPrice.toFixed(2)}`);

    const greeks = this.calculateAllGreeks(
      underlyingPrice,
      strikePrice,
      timeToExpiry,
      this.RISK_FREE_RATE,
      null, // Let it calculate IV from close
      optionType,
      midPrice
    );

    // DEBUG: Log calculated Greeks
    console.log(`🔍 [GREEKS DEBUG] Delta=${greeks.delta.toFixed(3)}, Gamma=${greeks.gamma.toFixed(3)}, IV=${greeks.impliedVolatility.toFixed(3)}, Theta=${greeks.theta.toFixed(3)}`);

    return {
      ...greeks,
      midPrice: midPrice,
      barTimestamp: currentTime,
      mode: 'backtest',
      dataSource: 'ohlcv'
    };
  }

  /**
   * Return default/safe Greeks when calculation fails
   */
  getDefaultGreeks() {
    return {
      delta: 0.0,
      gamma: 0.0,
      theta: 0.0,
      vega: 0.0,
      rho: 0.0,
      impliedVolatility: 0.3, // 30% default IV
      midPrice: 0.01,
      mode: 'backtest',
      dataSource: 'default'
    };
  }

  /**
   * LIVE TRADING MODE: Estimate Greeks from bid/ask quotes
   * Uses bid/ask mid price for Greeks calculation
   * 
   * @param {number} underlyingPrice - Current underlying stock price
   * @param {number} strikePrice - Option strike price
   * @param {Date|string} expiryDate - Option expiration date
   * @param {string} optionType - 'CALL' or 'PUT'
   * @param {number} bid - Current bid price
   * @param {number} ask - Current ask price
   * @param {number} last - Last trade price
   * @returns {Object} Greeks calculated from bid/ask mid
   */
  estimateGreeksFromMarket(underlyingPrice, strikePrice, expiryDate, optionType, bid, ask, last) {
    const bidPrice = parseFloat(bid);
    const askPrice = parseFloat(ask);
    const midPrice = (bidPrice + askPrice) / 2;
    const spread = askPrice - bidPrice;
    const spreadPct = midPrice > 0 ? (spread / midPrice) * 100 : 0;
    
    const timeToExpiry = this.timeToExpiry(expiryDate);

    const greeks = this.calculateAllGreeks(
      underlyingPrice,
      strikePrice,
      timeToExpiry,
      this.RISK_FREE_RATE,
      null, // Let it calculate IV from bid/ask mid
      optionType,
      midPrice
    );

    return {
      ...greeks,
      midPrice: midPrice,
      bid: bidPrice,
      ask: askPrice,
      last: parseFloat(last),
      spread: spread,
      spreadPct: spreadPct,
      mode: 'live',
      dataSource: 'bid_ask'
    };
  }

  /**
   * Validate Greeks are within reasonable bounds
   * @param {Object} greeks - Greeks object to validate
   * @returns {Object} Validation result with warnings
   */
  validateGreeks(greeks) {
    const warnings = [];

    // Delta bounds
    if (Math.abs(greeks.delta) > 1) {
      warnings.push(`Delta out of bounds: ${greeks.delta}`);
    }

    // Gamma should be positive
    if (greeks.gamma < 0) {
      warnings.push(`Negative gamma: ${greeks.gamma}`);
    }

    // Vega should be positive
    if (greeks.vega < 0) {
      warnings.push(`Negative vega: ${greeks.vega}`);
    }

    // IV bounds
    if (greeks.impliedVolatility < 0.01 || greeks.impliedVolatility > 5.0) {
      warnings.push(`IV out of typical range: ${greeks.impliedVolatility}`);
    }

    return {
      valid: warnings.length === 0,
      warnings: warnings
    };
  }
}

module.exports = GreeksCalculator;
