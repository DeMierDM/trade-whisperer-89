# Greeks Calculation Analysis & Issues

## Critical Issues Identified

### 1. **0DTE Time-to-Expiry Problem**
**Problem:** When testing on expiry day (2025-01-15 for SPY250115), T ≈ 0
**Impact:** 
- Vega → 0 (no volatility sensitivity)
- Gamma → 0 (no curvature)
- Delta → 1.0 (deep ITM) or 0.0 (OTM) - becomes step function

**Test Output Evidence:**
```
Contract: SPY250115C00560000 (expires same day as test)
Underlying: $586.87, Strike: $560 (deep ITM)
Delta: 1.0000 ✅ CORRECT for 0DTE deep ITM
Gamma: 0.000000 ⚠️ Expected for 0DTE (no time value)
Vega: 0.0000 ⚠️ Expected for 0DTE (no vol sensitivity)
IV: 1.07% ⚠️ Suspicious but possible for deep ITM 0DTE
```

**Root Cause:** Testing with contracts expiring the same day they're being analyzed.

### 2. **No Contract Instance Tracking**
**Problem:** Using symbol as identifier, no unique instance IDs
**Impact:**
- Can't track individual position lifecycle
- Can't distinguish same contract opened at different times
- Risk of mixing data from different trading sessions

**Missing:**
- `contract_instance_id` (unique per position)
- `position_id` (links to specific trade)
- `entry_bar_id` and `exit_bar_id` references

### 3. **No Bar-Level Greeks**
**Problem:** Greeks calculated once per contract, not per bar
**Impact:**
- Can't see Greeks evolution over time
- Can't validate delta hedging calculations
- Missing critical data for analysis

**Should Have:**
```javascript
// Current: Greeks calculated once
greeks = calculator.estimateGreeksFromOHLCV(...);

// Should Be: Greeks for EVERY bar
bars.forEach(bar => {
  const greeks = calculator.estimateGreeksFromOHLCV(
    bar.underlying_price,
    contract.strike,
    contract.expiry,
    contract.type,
    bar
  );
  // Store greeks with bar_id + contract_instance_id
});
```

### 4. **Data Integrity Risks**
**Problem:** No validation to prevent data confusion
**Risks:**
- Mixing strikes (e.g., $560 vs $595)
- Mixing expirations (0DTE vs weekly)
- Timestamp discontinuities
- OHLCV data corruption

## Solutions Required

### Solution 1: Enhanced Time-to-Expiry Calculation
```javascript
timeToExpiry(expiryDate, currentDate = new Date(), currentTime = null) {
  const expiry = new Date(expiryDate);
  const current = currentTime ? new Date(currentTime) : new Date(currentDate);
  
  // For 0DTE, need PRECISE time
  // If testing at 2:00 PM on expiry day:
  // - Hours until 4:00 PM = 2 hours
  // - T = 2/24/365.25 = 0.000228 years
  
  expiry.setHours(16, 0, 0, 0); // 4:00 PM ET
  
  const timeMs = expiry - current;
  
  // For 0DTE intraday: use ACTUAL remaining time
  // Don't enforce minimum if we have valid time
  if (timeMs > 0) {
    return timeMs / (365.25 * 24 * 60 * 60 * 1000);
  }
  
  // Expired options: use 1 minute minimum
  return 1 / 60 / 24 / 365.25;
}
```

### Solution 2: Contract Instance Schema
```sql
-- Add to option_contracts table
ALTER TABLE option_contracts ADD COLUMN contract_instance_id UUID PRIMARY KEY;
ALTER TABLE option_contracts ADD COLUMN position_id INTEGER REFERENCES positions(id);
ALTER TABLE option_contracts ADD COLUMN entry_timestamp TIMESTAMP NOT NULL;
ALTER TABLE option_contracts ADD COLUMN exit_timestamp TIMESTAMP;
ALTER TABLE option_contracts ADD COLUMN entry_bar_id VARCHAR;
ALTER TABLE option_contracts ADD COLUMN exit_bar_id VARCHAR;

-- New table: option_bars (stores EVERY bar with Greeks)
CREATE TABLE option_bars (
  id SERIAL PRIMARY KEY,
  contract_instance_id UUID REFERENCES option_contracts(contract_instance_id),
  bar_timestamp TIMESTAMP NOT NULL,
  underlying_price DECIMAL(10, 2) NOT NULL,
  
  -- OHLCV
  open DECIMAL(10, 2) NOT NULL,
  high DECIMAL(10, 2) NOT NULL,
  low DECIMAL(10, 2) NOT NULL,
  close DECIMAL(10, 2) NOT NULL,
  volume INTEGER,
  
  -- Greeks (calculated per bar)
  delta DECIMAL(8, 6),
  gamma DECIMAL(8, 6),
  theta DECIMAL(8, 6),
  vega DECIMAL(8, 6),
  rho DECIMAL(8, 6),
  implied_volatility DECIMAL(6, 4),
  
  -- Validation
  strike_price DECIMAL(10, 2) NOT NULL,
  expiry_date DATE NOT NULL,
  option_type VARCHAR(4) NOT NULL,
  
  UNIQUE(contract_instance_id, bar_timestamp)
);

CREATE INDEX idx_option_bars_contract ON option_bars(contract_instance_id);
CREATE INDEX idx_option_bars_timestamp ON option_bars(bar_timestamp);
```

### Solution 3: Bar-Level Greeks Processor
```javascript
class BarGreeksProcessor {
  /**
   * Process all bars for a contract and calculate Greeks
   * @param {Object} contract - Contract details
   * @param {Array} bars - Array of OHLCV bars
   * @param {Array} underlyingBars - Corresponding underlying prices
   * @returns {Array} Bars with Greeks
   */
  processBarsWithGreeks(contract, bars, underlyingBars) {
    const greeksCalc = new GreeksCalculator();
    const barsWithGreeks = [];
    
    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const underlyingBar = underlyingBars[i];
      
      // Calculate Greeks for THIS specific bar
      const greeks = greeksCalc.estimateGreeksFromOHLCV(
        underlyingBar.c, // underlying price at this time
        contract.strike_price,
        contract.expiry_date,
        contract.option_type,
        bar,
        bar.t // Pass bar timestamp for precise T calculation
      );
      
      barsWithGreeks.push({
        contract_instance_id: contract.instance_id,
        bar_timestamp: bar.t,
        underlying_price: underlyingBar.c,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        ...greeks, // All Greeks
        
        // Validation data
        strike_price: contract.strike_price,
        expiry_date: contract.expiry_date,
        option_type: contract.option_type
      });
    }
    
    return barsWithGreeks;
  }
  
  /**
   * Validate data integrity across bars
   */
  validateBarIntegrity(bars, contract) {
    const errors = [];
    
    for (const bar of bars) {
      // Check strike consistency
      if (bar.strike_price !== contract.strike_price) {
        errors.push(`Strike mismatch at ${bar.bar_timestamp}: ${bar.strike_price} vs ${contract.strike_price}`);
      }
      
      // Check expiry consistency
      if (bar.expiry_date !== contract.expiry_date) {
        errors.push(`Expiry mismatch at ${bar.bar_timestamp}`);
      }
      
      // Check OHLCV validity
      if (bar.low > bar.high || bar.close > bar.high || bar.close < bar.low) {
        errors.push(`Invalid OHLCV at ${bar.bar_timestamp}`);
      }
      
      // Check Greeks bounds
      if (Math.abs(bar.delta) > 1.0) {
        errors.push(`Delta out of bounds at ${bar.bar_timestamp}: ${bar.delta}`);
      }
    }
    
    // Check timestamp continuity
    for (let i = 1; i < bars.length; i++) {
      const prev = new Date(bars[i-1].bar_timestamp);
      const curr = new Date(bars[i].bar_timestamp);
      const diffMinutes = (curr - prev) / 1000 / 60;
      
      if (diffMinutes > 5) { // More than 5 minutes gap
        errors.push(`Timestamp gap detected: ${diffMinutes} minutes between ${prev} and ${curr}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
}
```

### Solution 4: Data Integrity Validator
```javascript
class ContractDataValidator {
  /**
   * Validate contract data integrity
   */
  static validateContract(contract, bars) {
    const errors = [];
    const warnings = [];
    
    // 1. Contract symbol validation
    const symbolPattern = /^[A-Z]+\d{6}[CP]\d{8}$/;
    if (!symbolPattern.test(contract.contract_symbol)) {
      errors.push(`Invalid symbol format: ${contract.contract_symbol}`);
    }
    
    // 2. Parse and validate symbol components
    const parsed = this.parseSymbol(contract.contract_symbol);
    if (parsed.strike !== contract.strike_price) {
      errors.push(`Strike mismatch: symbol=${parsed.strike}, contract=${contract.strike_price}`);
    }
    
    // 3. Validate bars data
    if (!bars || bars.length === 0) {
      errors.push('No bars data provided');
      return { valid: false, errors, warnings };
    }
    
    // 4. Check for duplicate timestamps
    const timestamps = new Set();
    for (const bar of bars) {
      if (timestamps.has(bar.t)) {
        errors.push(`Duplicate timestamp: ${bar.t}`);
      }
      timestamps.add(bar.t);
    }
    
    // 5. Validate OHLCV relationships
    for (const bar of bars) {
      if (bar.h < bar.l) {
        errors.push(`High < Low at ${bar.t}: H=${bar.h}, L=${bar.l}`);
      }
      if (bar.c > bar.h || bar.c < bar.l) {
        errors.push(`Close outside H-L range at ${bar.t}`);
      }
      if (bar.o > bar.h || bar.o < bar.l) {
        warnings.push(`Open outside H-L range at ${bar.t} (possible gap)`);
      }
    }
    
    // 6. Check for zero volume bars
    const zeroVolBars = bars.filter(b => b.v === 0);
    if (zeroVolBars.length > bars.length * 0.3) {
      warnings.push(`High number of zero volume bars: ${zeroVolBars.length}/${bars.length}`);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  static parseSymbol(symbol) {
    // SPY250115C00560000
    const ticker = symbol.match(/^[A-Z]+/)[0];
    const dateStr = symbol.match(/\d{6}/)[0];
    const type = symbol.match(/[CP]/)[0];
    const strikeStr = symbol.match(/\d{8}$/)[0];
    
    const year = 2000 + parseInt(dateStr.substr(0, 2));
    const month = parseInt(dateStr.substr(2, 2));
    const day = parseInt(dateStr.substr(4, 2));
    const strike = parseInt(strikeStr) / 1000;
    
    return {
      ticker,
      expiry_date: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      option_type: type === 'C' ? 'CALL' : 'PUT',
      strike
    };
  }
}
```

## Testing Recommendations

### 1. Test with Non-0DTE Contracts
Use contracts with at least 7 DTE to see normal Greeks behavior:
```javascript
const TEST_DATE = '2025-01-08'; // 7 days before expiry
const TEST_CONTRACT = 'SPY250115C00585000'; // Near ATM
```

### 2. Test Greeks Evolution
Fetch multiple bars and watch Greeks change:
```javascript
// Should see:
// - Delta increasing as price rises
// - Gamma highest near ATM
// - Theta accelerating near expiry
// - Vega decreasing as expiry approaches
```

### 3. Validate Against Known Values
Use online calculators to verify:
- S=$587, K=$585, T=7/365, σ=20%, r=5%
- Should get: Δ≈0.55, Γ≈0.05, Θ≈-0.15, V≈0.30

## Implementation Priority

1. **HIGH**: Fix time-to-expiry to accept bar timestamp
2. **HIGH**: Add contract_instance_id to schema
3. **HIGH**: Implement bar-level Greeks processing
4. **MEDIUM**: Add data integrity validation
5. **MEDIUM**: Create bar storage and retrieval API
6. **LOW**: Add Greeks visualization and analysis tools
