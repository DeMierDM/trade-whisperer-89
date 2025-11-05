/**
 * BLACK-SCHOLES OPTION PRICING AND GREEKS CALCULATOR
 *
 * Centralized implementation of Black-Scholes model
 * Used by both backtesting engine and options auditor
 *
 * Based on professional implementations:
 * - lambdaclass/options_backtester
 * - ayushsawant464/option-pricing-reliance
 *
 * This replaces duplicate Greeks calculations in options-backtest-auditor.js
 */

class BlackScholes {
  /**
   * Calculate all Greeks for an option
   *
   * @param {number} optionPrice - Market price of the option
   * @param {number} underlyingPrice - Current price of underlying
   * @param {number} strike - Strike price
   * @param {number} timeToExpiry - Time to expiration in years
   * @param {number} riskFreeRate - Risk-free interest rate (e.g., 0.05 for 5%)
   * @param {string} optionType - 'call' or 'put'
   * @returns {Object|null} Greeks {impliedVol, delta, gamma, vega, theta, rho} or null
   */
  static calculateGreeks(optionPrice, underlyingPrice, strike, timeToExpiry, riskFreeRate, optionType) {
    // Validate inputs
    if (!this.validateInputs(optionPrice, underlyingPrice, strike, timeToExpiry, riskFreeRate)) {
      return null;
    }

    // Calculate implied volatility
    const sigma = this.calculateImpliedVolatility(
      optionPrice,
      underlyingPrice,
      strike,
      timeToExpiry,
      riskFreeRate,
      optionType
    );

    if (!sigma || isNaN(sigma) || sigma <= 0) {
      console.warn('[BlackScholes] Failed to calculate implied volatility');
      return null;
    }

    // Calculate d1 and d2
    const d1 = this.calculateD1(underlyingPrice, strike, riskFreeRate, sigma, timeToExpiry);
    const d2 = d1 - sigma * Math.sqrt(timeToExpiry);

    // Calculate all Greeks
    return {
      impliedVol: sigma,
      delta: this.calculateDelta(d1, optionType),
      gamma: this.calculateGamma(d1, underlyingPrice, sigma, timeToExpiry),
      vega: this.calculateVega(d1, underlyingPrice, timeToExpiry),
      theta: this.calculateTheta(underlyingPrice, strike, timeToExpiry, riskFreeRate, sigma, d1, d2, optionType),
      rho: this.calculateRho(strike, timeToExpiry, riskFreeRate, d2, optionType)
    };
  }

  /**
   * Calculate d1 parameter
   */
  static calculateD1(S, K, r, sigma, T) {
    return (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  }

  /**
   * Calculate Delta
   * Call: N(d1)
   * Put: N(d1) - 1
   */
  static calculateDelta(d1, optionType) {
    const delta = this.normalCDF(d1);
    return optionType === 'call' ? delta : delta - 1;
  }

  /**
   * Calculate Gamma
   * Same for calls and puts: n(d1) / (S * σ * √T)
   */
  static calculateGamma(d1, S, sigma, T) {
    return this.normalPDF(d1) / (S * sigma * Math.sqrt(T));
  }

  /**
   * Calculate Vega
   * Same for calls and puts: S * n(d1) * √T / 100
   * (Divided by 100 to express per 1% change in IV)
   */
  static calculateVega(d1, S, T) {
    return (S * this.normalPDF(d1) * Math.sqrt(T)) / 100;
  }

  /**
   * Calculate Theta
   * Different for calls and puts
   * (Divided by 365 to express per day)
   */
  static calculateTheta(S, K, T, r, sigma, d1, d2, optionType) {
    const term1 = -(S * this.normalPDF(d1) * sigma) / (2 * Math.sqrt(T));

    if (optionType === 'call') {
      const term2 = r * K * Math.exp(-r * T) * this.normalCDF(d2);
      return (term1 - term2) / 365;
    } else {
      const term2 = r * K * Math.exp(-r * T) * this.normalCDF(-d2);
      return (term1 + term2) / 365;
    }
  }

  /**
   * Calculate Rho
   * Different for calls and puts
   * (Divided by 100 to express per 1% change in interest rate)
   */
  static calculateRho(K, T, r, d2, optionType) {
    if (optionType === 'call') {
      return (K * T * Math.exp(-r * T) * this.normalCDF(d2)) / 100;
    } else {
      return (-K * T * Math.exp(-r * T) * this.normalCDF(-d2)) / 100;
    }
  }

  /**
   * Calculate Implied Volatility using Brent's method
   * Industry-standard approach for IV calculation
   *
   * @param {number} marketPrice - Observed option price
   * @param {number} S - Underlying price
   * @param {number} K - Strike price
   * @param {number} T - Time to expiry in years
   * @param {number} r - Risk-free rate
   * @param {string} optionType - 'call' or 'put'
   * @param {number} tolerance - Convergence tolerance
   * @param {number} maxIterations - Maximum iterations
   * @returns {number|null} Implied volatility or null
   */
  static calculateImpliedVolatility(
    marketPrice,
    S,
    K,
    T,
    r,
    optionType,
    tolerance = 0.0001,
    maxIterations = 100
  ) {
    // Intrinsic value check
    const intrinsic = optionType === 'call' ? Math.max(0, S - K) : Math.max(0, K - S);
    if (marketPrice < intrinsic) {
      console.warn('[BlackScholes] Market price below intrinsic value');
      return null;
    }

    // Brent's method for root finding
    let sigmaLow = 0.01;   // 1% volatility
    let sigmaHigh = 5.0;   // 500% volatility

    for (let i = 0; i < maxIterations; i++) {
      const sigmaMid = (sigmaLow + sigmaHigh) / 2;

      const priceLow = this.calculateOptionPrice(S, K, T, r, sigmaLow, optionType);
      const priceMid = this.calculateOptionPrice(S, K, T, r, sigmaMid, optionType);
      const priceHigh = this.calculateOptionPrice(S, K, T, r, sigmaHigh, optionType);

      if (!priceLow || !priceMid || !priceHigh) {
        return null;
      }

      // Check convergence
      if (Math.abs(priceMid - marketPrice) < tolerance) {
        return sigmaMid;
      }

      // Bisection
      if ((priceMid - marketPrice) * (priceLow - marketPrice) < 0) {
        sigmaHigh = sigmaMid;
      } else {
        sigmaLow = sigmaMid;
      }
    }

    // Return best estimate if didn't converge
    return (sigmaLow + sigmaHigh) / 2;
  }

  /**
   * Calculate option price using Black-Scholes formula
   *
   * @param {number} S - Underlying price
   * @param {number} K - Strike price
   * @param {number} T - Time to expiry in years
   * @param {number} r - Risk-free rate
   * @param {number} sigma - Volatility
   * @param {string} optionType - 'call' or 'put'
   * @returns {number|null} Option price or null
   */
  static calculateOptionPrice(S, K, T, r, sigma, optionType) {
    if (T <= 0 || sigma <= 0) {
      return null;
    }

    const d1 = this.calculateD1(S, K, r, sigma, T);
    const d2 = d1 - sigma * Math.sqrt(T);

    if (optionType === 'call') {
      return S * this.normalCDF(d1) - K * Math.exp(-r * T) * this.normalCDF(d2);
    } else {
      return K * Math.exp(-r * T) * this.normalCDF(-d2) - S * this.normalCDF(-d1);
    }
  }

  /**
   * Standard Normal Cumulative Distribution Function (CDF)
   * Polynomial approximation method
   */
  static normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const probability = d * t * (
      0.3193815 +
      t * (-0.3565638 +
      t * (1.781478 +
      t * (-1.821256 +
      t * 1.330274)))
    );

    return x > 0 ? 1 - probability : probability;
  }

  /**
   * Standard Normal Probability Density Function (PDF)
   */
  static normalPDF(x) {
    return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
  }

  /**
   * Validate inputs for Black-Scholes calculations
   */
  static validateInputs(optionPrice, underlyingPrice, strike, timeToExpiry, riskFreeRate) {
    if (optionPrice <= 0) {
      console.warn('[BlackScholes] Invalid option price:', optionPrice);
      return false;
    }

    if (underlyingPrice <= 0) {
      console.warn('[BlackScholes] Invalid underlying price:', underlyingPrice);
      return false;
    }

    if (strike <= 0) {
      console.warn('[BlackScholes] Invalid strike:', strike);
      return false;
    }

    if (timeToExpiry <= 0) {
      console.warn('[BlackScholes] Invalid time to expiry:', timeToExpiry);
      return false;
    }

    if (riskFreeRate < 0) {
      console.warn('[BlackScholes] Invalid risk-free rate:', riskFreeRate);
      return false;
    }

    return true;
  }

  /**
   * Quick Greeks calculation without IV inversion
   * Uses historical volatility instead
   *
   * @param {number} S - Underlying price
   * @param {number} K - Strike price
   * @param {number} T - Time to expiry in years
   * @param {number} r - Risk-free rate
   * @param {number} sigma - Assumed volatility
   * @param {string} optionType - 'call' or 'put'
   * @returns {Object} Greeks without IV
   */
  static calculateQuickGreeks(S, K, T, r, sigma, optionType) {
    const d1 = this.calculateD1(S, K, r, sigma, T);
    const d2 = d1 - sigma * Math.sqrt(T);

    return {
      impliedVol: sigma,  // Using assumed sigma
      delta: this.calculateDelta(d1, optionType),
      gamma: this.calculateGamma(d1, S, sigma, T),
      vega: this.calculateVega(d1, S, T),
      theta: this.calculateTheta(S, K, T, r, sigma, d1, d2, optionType),
      rho: this.calculateRho(K, T, r, d2, optionType)
    };
  }

  /**
   * Calculate moneyness (S/K ratio)
   *
   * @param {number} S - Underlying price
   * @param {number} K - Strike price
   * @returns {Object} { moneyness, type }
   */
  static calculateMoneyness(S, K) {
    const ratio = S / K;

    let type;
    if (Math.abs(ratio - 1) < 0.02) {  // Within 2% of ATM
      type = 'ATM';
    } else if (ratio > 1) {
      type = 'ITM_call'; // or 'OTM_put'
    } else {
      type = 'OTM_call'; // or 'ITM_put'
    }

    return {
      moneyness: ratio,
      type,
      percentOTM: ((K - S) / S) * 100  // Positive if OTM for calls
    };
  }
}

module.exports = BlackScholes;
