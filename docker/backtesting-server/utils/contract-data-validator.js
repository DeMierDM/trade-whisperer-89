/**
 * Contract Data Integrity Validator
 * 
 * Ensures data consistency and prevents confusion between:
 * - Different strikes
 * - Different expirations
 * - Different timestamps
 * - Different OHLCV data
 */

class ContractDataValidator {
  /**
   * Validate complete contract data integrity
   * @param {Object} contract - Contract metadata
   * @param {Array} bars - OHLCV bars for this contract
   * @returns {Object} Validation result
   */
  static validateContract(contract, bars) {
    const errors = [];
    const warnings = [];

    // 1. Validate contract metadata
    const metadataValidation = this.validateContractMetadata(contract);
    errors.push(...metadataValidation.errors);
    warnings.push(...metadataValidation.warnings);

    // 2. Validate contract symbol format and consistency
    const symbolValidation = this.validateContractSymbol(contract);
    errors.push(...symbolValidation.errors);
    warnings.push(...symbolValidation.warnings);

    // 3. Validate bars data
    if (!bars || bars.length === 0) {
      errors.push('No bars data provided');
      return { valid: false, errors, warnings };
    }

    const barsValidation = this.validateBarsData(bars);
    errors.push(...barsValidation.errors);
    warnings.push(...barsValidation.warnings);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        total_bars: bars.length,
        ...barsValidation.stats
      }
    };
  }

  /**
   * Validate contract metadata
   */
  static validateContractMetadata(contract) {
    const errors = [];
    const warnings = [];

    // Required fields
    const requiredFields = ['contract_symbol', 'strike_price', 'expiry_date', 'option_type'];
    for (const field of requiredFields) {
      if (!contract[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Strike price validation
    if (contract.strike_price <= 0) {
      errors.push(`Invalid strike price: ${contract.strike_price}`);
    }

    // Option type validation
    const validTypes = ['CALL', 'PUT', 'C', 'P'];
    if (!validTypes.includes(contract.option_type?.toUpperCase())) {
      errors.push(`Invalid option type: ${contract.option_type}`);
    }

    // Expiry date validation
    try {
      const expiryDate = new Date(contract.expiry_date);
      if (isNaN(expiryDate.getTime())) {
        errors.push(`Invalid expiry date: ${contract.expiry_date}`);
      }
    } catch (e) {
      errors.push(`Error parsing expiry date: ${e.message}`);
    }

    return { errors, warnings };
  }

  /**
   * Validate contract symbol format and consistency with metadata
   */
  static validateContractSymbol(contract) {
    const errors = [];
    const warnings = [];

    // Alpaca symbol format: TICKER+YYMMDD+C/P+00000000
    // Example: SPY250115C00560000
    const symbolPattern = /^[A-Z]+\d{6}[CP]\d{8}$/;
    
    if (!symbolPattern.test(contract.contract_symbol)) {
      errors.push(`Invalid symbol format: ${contract.contract_symbol} (expected: TICKER+YYMMDD+C/P+00000000)`);
      return { errors, warnings }; // Can't parse if format is wrong
    }

    // Parse symbol components
    const parsed = this.parseOptionSymbol(contract.contract_symbol);
    
    // Validate parsed data matches contract metadata
    if (parsed.strike !== contract.strike_price) {
      errors.push(`Strike mismatch: symbol indicates $${parsed.strike}, but contract has $${contract.strike_price}`);
    }

    if (parsed.expiry_date !== contract.expiry_date) {
      errors.push(`Expiry mismatch: symbol indicates ${parsed.expiry_date}, but contract has ${contract.expiry_date}`);
    }

    const contractType = contract.option_type.toUpperCase();
    const parsedType = parsed.option_type;
    if (contractType !== parsedType && 
        !(contractType === 'C' && parsedType === 'CALL') &&
        !(contractType === 'P' && parsedType === 'PUT')) {
      errors.push(`Option type mismatch: symbol indicates ${parsedType}, but contract has ${contractType}`);
    }

    return { errors, warnings };
  }

  /**
   * Validate OHLCV bars data
   */
  static validateBarsData(bars) {
    const errors = [];
    const warnings = [];
    const stats = {};

    // 1. Check for duplicate timestamps
    const timestamps = new Set();
    for (let i = 0; i < bars.length; i++) {
      const ts = bars[i].t || bars[i].bar_timestamp;
      if (!ts) {
        errors.push(`Bar ${i}: Missing timestamp`);
        continue;
      }
      
      if (timestamps.has(ts.toString())) {
        errors.push(`Duplicate timestamp: ${ts}`);
      }
      timestamps.add(ts.toString());
    }

    // 2. Validate OHLCV relationships
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const barId = `Bar ${i} at ${bar.t || bar.bar_timestamp}`;
      
      // Extract OHLCV values
      const open = parseFloat(bar.o || bar.open);
      const high = parseFloat(bar.h || bar.high);
      const low = parseFloat(bar.l || bar.low);
      const close = parseFloat(bar.c || bar.close);
      const volume = parseInt(bar.v || bar.volume);

      // Validate all values present
      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
        errors.push(`${barId}: Missing or invalid OHLCV data`);
        continue;
      }

      // High must be >= Low
      if (high < low) {
        errors.push(`${barId}: High ($${high.toFixed(2)}) < Low ($${low.toFixed(2)})`);
      }

      // Close must be within [Low, High]
      if (close > high) {
        errors.push(`${barId}: Close ($${close.toFixed(2)}) > High ($${high.toFixed(2)})`);
      }
      if (close < low) {
        errors.push(`${barId}: Close ($${close.toFixed(2)}) < Low ($${low.toFixed(2)})`);
      }

      // Open should be within [Low, High] (warning only, gaps can occur)
      if (open > high || open < low) {
        warnings.push(`${barId}: Open ($${open.toFixed(2)}) outside H-L range [$${low.toFixed(2)}, $${high.toFixed(2)}] (possible gap)`);
      }

      // All prices must be positive
      if (open <= 0 || high <= 0 || low <= 0 || close <= 0) {
        errors.push(`${barId}: Non-positive price detected`);
      }

      // Volume validation
      if (volume < 0) {
        errors.push(`${barId}: Negative volume (${volume})`);
      }
    }

    // 3. Check timestamp ordering
    for (let i = 1; i < bars.length; i++) {
      const prevTime = new Date(bars[i-1].t || bars[i-1].bar_timestamp);
      const currTime = new Date(bars[i].t || bars[i].bar_timestamp);
      
      if (currTime <= prevTime) {
        errors.push(`Bars ${i-1} and ${i}: Non-increasing timestamps (${prevTime} -> ${currTime})`);
      }
    }

    // 4. Calculate statistics
    const volumes = bars.map(b => parseInt(b.v || b.volume || 0));
    const zeroVolumeBars = volumes.filter(v => v === 0).length;
    
    stats.zero_volume_bars = zeroVolumeBars;
    stats.zero_volume_pct = (zeroVolumeBars / bars.length) * 100;
    
    if (stats.zero_volume_pct > 30) {
      warnings.push(`High percentage of zero volume bars: ${stats.zero_volume_pct.toFixed(1)}% (${zeroVolumeBars}/${bars.length})`);
    }

    // 5. Check for price anomalies
    const closes = bars.map(b => parseFloat(b.c || b.close));
    const avgClose = closes.reduce((a, b) => a + b, 0) / closes.length;
    const stdDev = Math.sqrt(closes.reduce((sum, val) => sum + Math.pow(val - avgClose, 2), 0) / closes.length);
    
    for (let i = 0; i < bars.length; i++) {
      const close = closes[i];
      const zScore = Math.abs((close - avgClose) / stdDev);
      
      if (zScore > 5) { // More than 5 standard deviations
        warnings.push(`Bar ${i}: Potential price anomaly (${close.toFixed(2)}, z-score: ${zScore.toFixed(2)})`);
      }
    }

    stats.price_stats = {
      avg: avgClose,
      std_dev: stdDev,
      min: Math.min(...closes),
      max: Math.max(...closes)
    };

    return { errors, warnings, stats };
  }

  /**
   * Parse Alpaca option symbol into components
   * @param {string} symbol - Option symbol (e.g., SPY250115C00560000)
   * @returns {Object} Parsed components
   */
  static parseOptionSymbol(symbol) {
    // Alpaca format: TICKER+YYMMDD+C/P+00000000
    // Example: SPY250115C00560000
    
    const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    if (!match) {
      throw new Error(`Invalid option symbol format: ${symbol}`);
    }

    const [, ticker, dateStr, typeChar, strikeStr] = match;
    
    // Parse date: YYMMDD
    const year = 2000 + parseInt(dateStr.substr(0, 2));
    const month = parseInt(dateStr.substr(2, 2));
    const day = parseInt(dateStr.substr(4, 2));
    
    // Parse strike: 00000000 (divide by 1000)
    const strike = parseInt(strikeStr) / 1000;
    
    // Parse type
    const optionType = typeChar === 'C' ? 'CALL' : 'PUT';
    
    // Format expiry date as YYYY-MM-DD
    const expiryDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    
    return {
      ticker,
      expiry_date: expiryDate,
      option_type: optionType,
      strike,
      raw_symbol: symbol
    };
  }

  /**
   * Generate Alpaca option symbol from components
   * @param {string} ticker - Underlying ticker
   * @param {string} expiryDate - Expiry date (YYYY-MM-DD)
   * @param {string} optionType - 'CALL' or 'PUT'
   * @param {number} strike - Strike price
   * @returns {string} Alpaca option symbol
   */
  static generateOptionSymbol(ticker, expiryDate, optionType, strike) {
    const expiry = new Date(expiryDate);
    
    // Format date as YYMMDD
    const yy = expiry.getFullYear().toString().substr(2, 2);
    const mm = (expiry.getMonth() + 1).toString().padStart(2, '0');
    const dd = expiry.getDate().toString().padStart(2, '0');
    const dateStr = yy + mm + dd;
    
    // Format type
    const typeChar = optionType.toUpperCase().startsWith('C') ? 'C' : 'P';
    
    // Format strike (multiply by 1000 and pad to 8 digits)
    const strikeStr = (strike * 1000).toFixed(0).padStart(8, '0');
    
    return `${ticker}${dateStr}${typeChar}${strikeStr}`;
  }

  /**
   * Validate consistency between two contracts
   * @param {Object} contract1 - First contract
   * @param {Object} contract2 - Second contract
   * @returns {Object} Validation result
   */
  static validateContractConsistency(contract1, contract2) {
    const errors = [];
    
    if (contract1.contract_symbol !== contract2.contract_symbol) {
      errors.push(`Symbol mismatch: ${contract1.contract_symbol} vs ${contract2.contract_symbol}`);
    }
    
    if (contract1.strike_price !== contract2.strike_price) {
      errors.push(`Strike mismatch: ${contract1.strike_price} vs ${contract2.strike_price}`);
    }
    
    if (contract1.expiry_date !== contract2.expiry_date) {
      errors.push(`Expiry mismatch: ${contract1.expiry_date} vs ${contract2.expiry_date}`);
    }
    
    if (contract1.option_type !== contract2.option_type) {
      errors.push(`Type mismatch: ${contract1.option_type} vs ${contract2.option_type}`);
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}

module.exports = ContractDataValidator;
