/**
 * ENHANCED INDICATOR CALCULATION SYSTEM
 * Proper technical indicator calculations for accurate backtesting
 */

class TechnicalIndicators {
  
  /**
   * Calculate RSI (Relative Strength Index)
   * @param {number[]} prices - Array of close prices
   * @param {number} period - RSI period (default: 14)
   * @returns {number[]} RSI values (0-100)
   */
  static calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period + 1) {
      console.warn(`RSI: Insufficient data. Need ${period + 1} points, got ${prices?.length || 0}`);
      return prices ? new Array(prices.length).fill(null) : [];
    }

    const rsi = new Array(prices.length).fill(null);
    let gains = [];
    let losses = [];

    // Calculate initial gains and losses
    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    // Calculate initial averages
    let avgGain = gains.reduce((sum, gain) => sum + gain, 0) / period;
    let avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / period;

    // Calculate first RSI
    if (avgLoss === 0) {
      rsi[period] = 100;
    } else {
      const rs = avgGain / avgLoss;
      rsi[period] = 100 - (100 / (1 + rs));
    }

    // Calculate subsequent RSI values using smoothed averages
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;

      // Smoothed averages (Wilder's method)
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;

      if (avgLoss === 0) {
        rsi[i] = 100;
      } else {
        const rs = avgGain / avgLoss;
        rsi[i] = 100 - (100 / (1 + rs));
      }
    }

    return rsi;
  }

  /**
   * Calculate ROC (Rate of Change)
   * @param {number[]} prices - Array of close prices
   * @param {number} period - ROC period
   * @returns {number[]} ROC values as percentages
   */
  static calculateROC(prices, period = 10) {
    if (!prices || prices.length < period + 1) {
      console.warn(`ROC: Insufficient data. Need ${period + 1} points, got ${prices?.length || 0}`);
      return prices ? new Array(prices.length).fill(null) : [];
    }

    const roc = new Array(prices.length).fill(null);

    for (let i = period; i < prices.length; i++) {
      const currentPrice = prices[i];
      const priorPrice = prices[i - period];
      
      if (priorPrice !== 0) {
        roc[i] = ((currentPrice - priorPrice) / priorPrice) * 100;
      }
    }

    return roc;
  }

  /**
   * Calculate VWAP (Volume Weighted Average Price)
   * @param {Object[]} bars - Array of OHLCV bars
   * @returns {number[]} VWAP values
   */
  static calculateVWAP(bars) {
    if (!bars || bars.length === 0) {
      console.warn('VWAP: No bars provided');
      return [];
    }

    const vwap = new Array(bars.length).fill(null);
    let cumulativeVolume = 0;
    let cumulativePriceVolume = 0;

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const high = parseFloat(bar.high || bar.h) || 0;
      const low = parseFloat(bar.low || bar.l) || 0;
      const close = parseFloat(bar.close || bar.c) || 0;
      const volume = parseFloat(bar.volume || bar.v) || 1; // Default volume to 1 if missing

      // Typical price (HLC/3)
      const typicalPrice = (high + low + close) / 3;
      const priceVolume = typicalPrice * volume;

      cumulativeVolume += volume;
      cumulativePriceVolume += priceVolume;

      if (cumulativeVolume > 0) {
        vwap[i] = cumulativePriceVolume / cumulativeVolume;
      }
    }

    return vwap;
  }

  /**
   * Calculate VWAP Slope
   * @param {number[]} vwapValues - Array of VWAP values
   * @param {number} lookback - Lookback period for slope calculation
   * @returns {number[]} VWAP slope values
   */
  static calculateVWAPSlope(vwapValues, lookback = 5) {
    if (!vwapValues || vwapValues.length < lookback + 1) {
      console.warn(`VWAP Slope: Insufficient data. Need ${lookback + 1} points, got ${vwapValues?.length || 0}`);
      return vwapValues ? new Array(vwapValues.length).fill(null) : [];
    }

    const slopes = new Array(vwapValues.length).fill(null);

    for (let i = lookback; i < vwapValues.length; i++) {
      const currentVWAP = vwapValues[i];
      const priorVWAP = vwapValues[i - lookback];

      if (currentVWAP !== null && priorVWAP !== null) {
        // Simple slope calculation
        slopes[i] = (currentVWAP - priorVWAP) / lookback;
      }
    }

    return slopes;
  }

  /**
   * Calculate all indicators for a strategy
   * @param {Object[]} stockData - Array of OHLCV bars
   * @param {Object} strategy - Strategy configuration
   * @returns {Object} Calculated indicators
   */
  static calculateStrategyIndicators(stockData, strategy) {
    if (!stockData || stockData.length === 0) {
      console.error('No stock data provided for indicator calculation');
      return {};
    }

    console.log(`📊 Calculating indicators for ${strategy.name} with ${stockData.length} bars`);

    const indicators = {};
    
    // Extract close prices
    const closePrices = stockData.map(bar => parseFloat(bar.close || bar.c) || 0);

    // Calculate indicators based on strategy specification
    if (strategy.signals && strategy.signals.indicators) {
      for (const indicatorSpec of strategy.signals.indicators) {
        switch (indicatorSpec.name.toLowerCase()) {
          case 'rsi':
            if (indicatorSpec.params && Array.isArray(indicatorSpec.params)) {
              indicatorSpec.params.forEach(param => {
                const period = param.period;
                const name = param.name || `rsi${period}`;
                console.log(`📈 Calculating ${name} with period ${period}`);
                indicators[name] = this.calculateRSI(closePrices, period);
              });
            }
            break;

          case 'roc':
            if (indicatorSpec.params && Array.isArray(indicatorSpec.params)) {
              indicatorSpec.params.forEach(param => {
                const period = param.period;
                const name = param.name || `roc${period}`;
                console.log(`📈 Calculating ${name} with period ${period}`);
                indicators[name] = this.calculateROC(closePrices, period);
              });
            }
            break;

          case 'vwap':
            console.log('📈 Calculating VWAP');
            indicators['vwap'] = this.calculateVWAP(stockData);
            break;

          case 'vwap_slope':
            const lookback = indicatorSpec.params?.lookback || 5;
            console.log(`📈 Calculating VWAP Slope with lookback ${lookback}`);
            // First ensure VWAP is calculated
            if (!indicators['vwap']) {
              indicators['vwap'] = this.calculateVWAP(stockData);
            }
            indicators['vwapSlope'] = this.calculateVWAPSlope(indicators['vwap'], lookback);
            break;
        }
      }
    }

    // Add timestamps
    indicators['timestamps'] = stockData.map((bar, index) => {
      let timestamp = null;
      
      if (bar.timestamp) {
        timestamp = bar.timestamp;
      } else if (bar.time) {
        timestamp = Math.floor(new Date(bar.time).getTime() / 1000);
      } else if (bar.t) {
        if (typeof bar.t === 'string') {
          timestamp = Math.floor(new Date(bar.t).getTime() / 1000);
        } else {
          timestamp = bar.t;
        }
      } else {
        timestamp = Math.floor(Date.now() / 1000) + index * 60;
      }
      
      return timestamp;
    });

    // Log results
    Object.entries(indicators).forEach(([name, values]) => {
      if (name !== 'timestamps' && Array.isArray(values)) {
        const validValues = values.filter(v => v !== null && !isNaN(v));
        if (validValues.length > 0) {
          const min = Math.min(...validValues);
          const max = Math.max(...validValues);
          const recent = values.slice(-5).filter(v => v !== null);
          console.log(`✅ ${name}: ${validValues.length}/${values.length} valid values, range [${min.toFixed(2)}, ${max.toFixed(2)}], recent: [${recent.map(v => v.toFixed(2)).join(', ')}]`);
        } else {
          console.warn(`⚠️ ${name}: No valid values calculated`);
        }
      }
    });

    return indicators;
  }
}

module.exports = TechnicalIndicators;