/**
 * Bar-Level Greeks Processor
 * 
 * Calculates Greeks for EVERY bar (every minute) to track evolution over time.
 * Ensures each bar is properly tracked with contract instance ID and timestamp.
 */

const { v4: uuidv4 } = require('uuid');
const GreeksCalculator = require('./greeks-calculator');

class BarGreeksProcessor {
  constructor() {
    this.greeksCalculator = new GreeksCalculator();
  }

  /**
   * Process all bars for a contract and calculate Greeks for each
   * @param {Object} contract - Contract details with instance_id
   * @param {Array} optionBars - Array of option OHLCV bars
   * @param {Array} underlyingBars - Corresponding underlying price bars
   * @returns {Array} Bars with calculated Greeks
   */
  processBarsWithGreeks(contract, optionBars, underlyingBars) {
    if (!contract.instance_id) {
      throw new Error('Contract must have instance_id for tracking');
    }

    if (optionBars.length !== underlyingBars.length) {
      throw new Error(`Bar count mismatch: options=${optionBars.length}, underlying=${underlyingBars.length}`);
    }

    const barsWithGreeks = [];

    for (let i = 0; i < optionBars.length; i++) {
      const optionBar = optionBars[i];
      const underlyingBar = underlyingBars[i];

      // Validate timestamps match (within 1 minute)
      const optionTime = new Date(optionBar.t);
      const underlyingTime = new Date(underlyingBar.t);
      const timeDiffMs = Math.abs(optionTime - underlyingTime);
      
      if (timeDiffMs > 60000) { // More than 1 minute difference
        console.warn(`Timestamp mismatch at index ${i}: option=${optionBar.t}, underlying=${underlyingBar.t}`);
      }

      // Calculate Greeks for THIS specific bar at THIS specific time
      const greeks = this.greeksCalculator.estimateGreeksFromOHLCV(
        parseFloat(underlyingBar.c), // Underlying price at this moment
        contract.strike_price,
        contract.expiry_date,
        contract.option_type,
        optionBar,
        optionBar.t // Use bar's exact timestamp for T calculation
      );

      // Create comprehensive bar record
      const barWithGreeks = {
        // Identity
        contract_instance_id: contract.instance_id,
        bar_timestamp: optionBar.t,
        bar_index: i,
        
        // Underlying data
        underlying_price: parseFloat(underlyingBar.c),
        underlying_volume: underlyingBar.v,
        
        // Option OHLCV
        open: parseFloat(optionBar.o),
        high: parseFloat(optionBar.h),
        low: parseFloat(optionBar.l),
        close: parseFloat(optionBar.c),
        volume: optionBar.v,
        trade_count: optionBar.n,
        vwap: optionBar.vw,
        
        // Greeks (time-specific)
        delta: greeks.delta,
        gamma: greeks.gamma,
        theta: greeks.theta,
        vega: greeks.vega,
        rho: greeks.rho,
        implied_volatility: greeks.impliedVolatility,
        
        // Derived values
        theoretical_price: greeks.theoreticalPrice,
        intrinsic_value: greeks.intrinsicValue,
        time_value: parseFloat(optionBar.c) - greeks.intrinsicValue,
        time_to_expiry: greeks.timeToExpiry,
        
        // Contract reference (for validation)
        strike_price: contract.strike_price,
        expiry_date: contract.expiry_date,
        option_type: contract.option_type,
        contract_symbol: contract.contract_symbol,
        
        // Metadata
        mode: greeks.mode,
        data_source: greeks.dataSource
      };

      barsWithGreeks.push(barWithGreeks);
    }

    return barsWithGreeks;
  }

  /**
   * Validate data integrity across all bars
   * @param {Array} bars - Array of bars with Greeks
   * @param {Object} contract - Contract details
   * @returns {Object} Validation result
   */
  validateBarIntegrity(bars, contract) {
    const errors = [];
    const warnings = [];

    if (!bars || bars.length === 0) {
      errors.push('No bars provided for validation');
      return { valid: false, errors, warnings };
    }

    // 1. Check contract consistency across all bars
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      
      // Strike price must be consistent
      if (bar.strike_price !== contract.strike_price) {
        errors.push(`Bar ${i}: Strike mismatch (${bar.strike_price} vs ${contract.strike_price})`);
      }
      
      // Expiry date must be consistent
      if (bar.expiry_date !== contract.expiry_date) {
        errors.push(`Bar ${i}: Expiry mismatch (${bar.expiry_date} vs ${contract.expiry_date})`);
      }
      
      // Option type must be consistent
      if (bar.option_type !== contract.option_type) {
        errors.push(`Bar ${i}: Option type mismatch (${bar.option_type} vs ${contract.option_type})`);
      }

      // Contract instance ID must match
      if (bar.contract_instance_id !== contract.instance_id) {
        errors.push(`Bar ${i}: Instance ID mismatch`);
      }
    }

    // 2. Validate OHLCV relationships
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      
      // High >= Low
      if (bar.high < bar.low) {
        errors.push(`Bar ${i} at ${bar.bar_timestamp}: High ($${bar.high}) < Low ($${bar.low})`);
      }
      
      // Close within High-Low range
      if (bar.close > bar.high || bar.close < bar.low) {
        errors.push(`Bar ${i} at ${bar.bar_timestamp}: Close ($${bar.close}) outside H-L range [$${bar.low}, $${bar.high}]`);
      }
      
      // Open within High-Low range (warning only, gaps can occur)
      if (bar.open > bar.high || bar.open < bar.low) {
        warnings.push(`Bar ${i} at ${bar.bar_timestamp}: Open ($${bar.open}) outside H-L range (possible gap)`);
      }

      // Negative prices
      if (bar.open < 0 || bar.high < 0 || bar.low < 0 || bar.close < 0) {
        errors.push(`Bar ${i} at ${bar.bar_timestamp}: Negative price detected`);
      }
    }

    // 3. Check timestamp continuity
    for (let i = 1; i < bars.length; i++) {
      const prevTime = new Date(bars[i-1].bar_timestamp);
      const currTime = new Date(bars[i].bar_timestamp);
      const diffMinutes = (currTime - prevTime) / 1000 / 60;
      
      if (diffMinutes <= 0) {
        errors.push(`Bars ${i-1} and ${i}: Non-increasing timestamps`);
      } else if (diffMinutes > 5) {
        warnings.push(`Bars ${i-1} and ${i}: ${diffMinutes.toFixed(1)} minute gap detected`);
      }
    }

    // 4. Validate Greeks bounds
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      
      // Delta bounds: -1 to 1
      if (Math.abs(bar.delta) > 1.0) {
        errors.push(`Bar ${i}: Delta out of bounds (${bar.delta.toFixed(4)})`);
      }
      
      // Gamma should be non-negative
      if (bar.gamma < 0) {
        errors.push(`Bar ${i}: Negative gamma (${bar.gamma.toFixed(6)})`);
      }
      
      // Vega should be non-negative
      if (bar.vega < 0) {
        errors.push(`Bar ${i}: Negative vega (${bar.vega.toFixed(4)})`);
      }
      
      // IV should be reasonable (0.01% to 500%)
      if (bar.implied_volatility < 0.0001 || bar.implied_volatility > 5.0) {
        warnings.push(`Bar ${i}: Unusual IV (${(bar.implied_volatility * 100).toFixed(2)}%)`);
      }

      // Time to expiry should be decreasing
      if (i > 0 && bar.time_to_expiry > bars[i-1].time_to_expiry) {
        errors.push(`Bar ${i}: Time to expiry increased (time moving backwards)`);
      }
    }

    // 5. Check for duplicate timestamps
    const timestamps = new Set();
    for (let i = 0; i < bars.length; i++) {
      const ts = bars[i].bar_timestamp;
      if (timestamps.has(ts)) {
        errors.push(`Duplicate timestamp detected: ${ts}`);
      }
      timestamps.add(ts);
    }

    // 6. Volume analysis
    const zeroVolumeBars = bars.filter(b => b.volume === 0 || b.volume === null);
    if (zeroVolumeBars.length > bars.length * 0.3) {
      warnings.push(`High percentage of zero volume bars: ${zeroVolumeBars.length}/${bars.length} (${(zeroVolumeBars.length/bars.length*100).toFixed(1)}%)`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        total_bars: bars.length,
        zero_volume_bars: zeroVolumeBars.length,
        time_span: bars.length > 0 ? {
          start: bars[0].bar_timestamp,
          end: bars[bars.length - 1].bar_timestamp
        } : null
      }
    };
  }

  /**
   * Analyze Greeks evolution over time
   * @param {Array} bars - Bars with Greeks
   * @returns {Object} Analytics summary
   */
  analyzeGreeksEvolution(bars) {
    if (!bars || bars.length === 0) {
      return null;
    }

    // Calculate statistics for each Greek
    const deltas = bars.map(b => b.delta);
    const gammas = bars.map(b => b.gamma);
    const thetas = bars.map(b => b.theta);
    const vegas = bars.map(b => b.vega);
    const ivs = bars.map(b => b.implied_volatility);

    const stats = (values) => ({
      min: Math.min(...values),
      max: Math.max(...values),
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      first: values[0],
      last: values[values.length - 1],
      change: values[values.length - 1] - values[0]
    });

    return {
      delta: stats(deltas),
      gamma: stats(gammas),
      theta: stats(thetas),
      vega: stats(vegas),
      implied_volatility: stats(ivs),
      
      price_action: {
        entry_price: bars[0].close,
        exit_price: bars[bars.length - 1].close,
        pnl: bars[bars.length - 1].close - bars[0].close,
        pnl_pct: ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100
      },
      
      time_decay: {
        entry_time_value: bars[0].time_value,
        exit_time_value: bars[bars.length - 1].time_value,
        theta_realized: bars[0].time_value - bars[bars.length - 1].time_value
      }
    };
  }

  /**
   * Create contract instance with unique ID
   * @param {Object} contractData - Base contract data
   * @returns {Object} Contract with instance_id
   */
  createContractInstance(contractData) {
    return {
      ...contractData,
      instance_id: uuidv4(),
      created_at: new Date().toISOString()
    };
  }
}

module.exports = BarGreeksProcessor;
