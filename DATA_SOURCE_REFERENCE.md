# Data Source Reference Guide

## Quick Reference: Backtesting vs Live Trading

### BACKTESTING MODE (Historical Analysis)

```javascript
// Data Source
const response = await fetch('http://localhost:3002/api/fetch-historical-data', {
  method: 'POST',
  body: JSON.stringify({
    dataType: 'options_bars_by_dte',
    ticker: 'SPY',
    start: '2024-01-15T09:30:00-05:00',
    end: '2024-01-15T16:00:00-05:00'
  })
});

// Response Format (OHLCV only)
{
  "bars": {
    "SPY251031C00450000": [
      {
        "t": "2024-01-15T09:30:00Z",
        "o": 2.45,   // Open
        "h": 2.50,   // High
        "l": 2.40,   // Low
        "c": 2.48,   // Close ← USE THIS AS MID PRICE
        "v": 1250    // Volume
      }
    ]
  }
}

// Greeks Calculation
const greeksCalculator = new GreeksCalculator();
const greeks = greeksCalculator.estimateGreeksFromOHLCV(
  underlyingPrice,
  strikePrice,
  expiryDate,
  optionType,
  ohlcvBar  // { o, h, l, c, v }
);

// Uses close price as mid
const midPrice = ohlcvBar.c;

// Fill Price Simulation
const entryPrice = midPrice; // Or add slippage model
const exitPrice = currentBar.c;
```

**Key Points:**
- ✅ No bid/ask spreads available in historical data
- ✅ Use `close` price as the mid price for all calculations
- ✅ Greeks calculated from close price via IV inversion
- ✅ Slippage can be modeled separately if needed
- ✅ Realistic volume constraints still apply

---

### LIVE PAPER TRADING MODE (Real-time Execution)

```javascript
// Data Source
const ws = new WebSocket('ws://localhost:3001/ws');

ws.on('message', (data) => {
  const quote = JSON.parse(data);
  // Real-time bid/ask quotes
});

// Response Format (Bid/Ask quotes)
{
  "symbol": "SPY251031C00450000",
  "bid": 2.45,      // ← Use for SELLS
  "ask": 2.52,      // ← Use for BUYS
  "last": 2.48,
  "bidSize": 50,
  "askSize": 75,
  "volume": 1250,
  "timestamp": "2024-01-15T09:30:15Z"
}

// Greeks Calculation
const greeksCalculator = new GreeksCalculator();
const greeks = greeksCalculator.estimateGreeksFromMarket(
  underlyingPrice,
  strikePrice,
  expiryDate,
  optionType,
  quote.bid,   // Real bid
  quote.ask,   // Real ask
  quote.last   // Last trade
);

// Uses bid/ask mid
const midPrice = (quote.bid + quote.ask) / 2;

// Fill Price (Realistic)
const entryPrice = quote.ask;  // Pay the ask to buy
const exitPrice = quote.bid;   // Receive the bid to sell
const spread = quote.ask - quote.bid;
const spreadPct = spread / midPrice;

// Reject if spread too wide
if (spreadPct > 0.15) {
  console.log('Spread too wide, skipping trade');
}
```

**Key Points:**
- ✅ Real bid/ask spreads affect execution
- ✅ Buy at ask, sell at bid (realistic fills)
- ✅ Greeks calculated from bid/ask mid
- ✅ Filter out illiquid options (wide spreads)
- ✅ Market impact and slippage naturally included

---

## Code Implementation Examples

### Contract Selector (Dual Mode)

```javascript
class ContractSelector {
  selectBestContract(optionChain, criteria) {
    const { mode = 'backtest' } = criteria; // or 'live'
    
    if (mode === 'backtest') {
      // OHLCV bars only
      const validContracts = optionChain.filter(contract => {
        const closePrice = parseFloat(contract.c); // Close price
        return (
          closePrice > 0.05 &&
          contract.v >= criteria.minVolume
        );
      });
      
      // Calculate Greeks from close price
      const contractsWithGreeks = validContracts.map(contract => {
        const greeks = this.greeksCalculator.estimateGreeksFromOHLCV(
          criteria.underlyingPrice,
          contract.strike_price,
          contract.expiry_date,
          criteria.optionType,
          { o: contract.o, h: contract.h, l: contract.l, c: contract.c, v: contract.v }
        );
        return { ...contract, greeks };
      });
      
      return this.findBestDelta(contractsWithGreeks, criteria.targetDelta);
    }
    
    else { // mode === 'live'
      // Bid/Ask quotes
      const validContracts = optionChain.filter(contract => {
        const mid = (contract.bid + contract.ask) / 2;
        const spread = contract.ask - contract.bid;
        const spreadPct = spread / mid;
        return (
          spreadPct <= 0.15 && // Max 15% spread
          mid > 0.05 &&
          contract.volume >= criteria.minVolume
        );
      });
      
      // Calculate Greeks from bid/ask mid
      const contractsWithGreeks = validContracts.map(contract => {
        const greeks = this.greeksCalculator.estimateGreeksFromMarket(
          criteria.underlyingPrice,
          contract.strike_price,
          contract.expiry_date,
          criteria.optionType,
          contract.bid,
          contract.ask,
          contract.last
        );
        return { ...contract, greeks };
      });
      
      return this.findBestDelta(contractsWithGreeks, criteria.targetDelta);
    }
  }
}
```

### Position Entry/Exit

```javascript
class PositionManager {
  async enterPosition(contract, quantity, mode) {
    let entryPrice;
    
    if (mode === 'backtest') {
      // Use close price from OHLCV bar
      entryPrice = parseFloat(contract.c);
    } else {
      // Use ask price from live quote (realistic buy)
      entryPrice = parseFloat(contract.ask);
    }
    
    const position = {
      contract_symbol: contract.contract_symbol,
      entry_price: entryPrice,
      quantity: quantity,
      entry_timestamp: new Date(),
      mode: mode
    };
    
    return position;
  }
  
  async exitPosition(position, currentContract, mode) {
    let exitPrice;
    
    if (mode === 'backtest') {
      // Use close price from OHLCV bar
      exitPrice = parseFloat(currentContract.c);
    } else {
      // Use bid price from live quote (realistic sell)
      exitPrice = parseFloat(currentContract.bid);
    }
    
    const grossPnL = (exitPrice - position.entry_price) * position.quantity * 100;
    const fees = this.calculateFees(position.quantity, mode);
    const netPnL = grossPnL - fees;
    
    return {
      ...position,
      exit_price: exitPrice,
      exit_timestamp: new Date(),
      gross_pnl: grossPnL,
      fees: fees,
      net_pnl: netPnL
    };
  }
}
```

### Greeks Calculator (Dual Mode)

```javascript
class GreeksCalculator {
  /**
   * BACKTESTING: Calculate Greeks from OHLCV bar (uses close as mid)
   */
  estimateGreeksFromOHLCV(underlyingPrice, strikePrice, expiryDate, optionType, ohlcvBar) {
    const midPrice = parseFloat(ohlcvBar.c); // Close is mid
    const timeToExpiry = this.timeToExpiry(expiryDate);
    
    return this.calculateAllGreeks(
      underlyingPrice,
      strikePrice,
      timeToExpiry,
      this.RISK_FREE_RATE,
      null, // Calculate IV from close price
      optionType,
      midPrice
    );
  }
  
  /**
   * LIVE TRADING: Calculate Greeks from bid/ask quotes
   */
  estimateGreeksFromMarket(underlyingPrice, strikePrice, expiryDate, optionType, bid, ask, last) {
    const midPrice = (parseFloat(bid) + parseFloat(ask)) / 2;
    const timeToExpiry = this.timeToExpiry(expiryDate);
    
    return this.calculateAllGreeks(
      underlyingPrice,
      strikePrice,
      timeToExpiry,
      this.RISK_FREE_RATE,
      null, // Calculate IV from bid/ask mid
      optionType,
      midPrice
    );
  }
}
```

---

## Database Schema Considerations

### Contract Tracking

```sql
-- Store mode to know which pricing was used
CREATE TABLE option_contracts (
  id SERIAL PRIMARY KEY,
  contract_symbol VARCHAR(50) NOT NULL,
  
  -- Pricing (depends on mode)
  entry_price DECIMAL(10, 4) NOT NULL,
  entry_bid DECIMAL(10, 4),     -- NULL for backtesting
  entry_ask DECIMAL(10, 4),     -- NULL for backtesting
  entry_spread_pct DECIMAL(8, 6), -- NULL for backtesting
  
  -- Mode tracking
  execution_mode VARCHAR(10) NOT NULL, -- 'backtest' or 'live'
  
  -- Greeks (same calculation for both, just different input data)
  entry_delta DECIMAL(8, 6),
  entry_gamma DECIMAL(8, 6),
  entry_theta DECIMAL(8, 6),
  entry_vega DECIMAL(8, 6),
  entry_iv DECIMAL(8, 6)
);
```

---

## Testing Strategy

### Backtesting Tests

```javascript
describe('Backtesting with OHLCV data', () => {
  it('should use close price as mid', () => {
    const bar = { o: 2.40, h: 2.55, l: 2.35, c: 2.48, v: 1000 };
    const greeks = calculator.estimateGreeksFromOHLCV(450, 450, '2025-10-31', 'CALL', bar);
    
    expect(greeks.midPrice).toBe(2.48); // Close price
  });
  
  it('should not have bid/ask spread', () => {
    const contract = buildContractFromBar(ohlcvBar);
    expect(contract.bid).toBeUndefined();
    expect(contract.ask).toBeUndefined();
  });
});
```

### Live Trading Tests

```javascript
describe('Live trading with bid/ask', () => {
  it('should use bid/ask mid for Greeks', () => {
    const greeks = calculator.estimateGreeksFromMarket(450, 450, '2025-10-31', 'CALL', 2.45, 2.51, 2.48);
    
    expect(greeks.midPrice).toBe(2.48); // (2.45 + 2.51) / 2
  });
  
  it('should buy at ask, sell at bid', () => {
    const quote = { bid: 2.45, ask: 2.51 };
    const entryPrice = quote.ask; // 2.51
    const exitPrice = quote.bid;  // 2.45
    
    expect(entryPrice).toBeGreaterThan(exitPrice); // Realistic spread cost
  });
});
```

---

## Summary

| Aspect | Backtesting (OHLCV) | Live Trading (Bid/Ask) |
|--------|---------------------|------------------------|
| **Data Format** | `{ o, h, l, c, v }` | `{ bid, ask, last }` |
| **Mid Price** | `close` | `(bid + ask) / 2` |
| **Entry Fill** | `close` or + slippage | `ask` (pay spread) |
| **Exit Fill** | `close` or - slippage | `bid` (pay spread) |
| **Greeks Method** | `estimateGreeksFromOHLCV()` | `estimateGreeksFromMarket()` |
| **Spread Filtering** | N/A (no spread data) | Filter > 15% spreads |
| **Realism** | Historical accuracy | Real-time accuracy |
| **Use Case** | Strategy validation | Live execution |

**Critical Takeaway**: Never try to estimate bid/ask from OHLCV close prices in backtesting. The close IS your execution price. This keeps backtesting honest and prevents over-optimistic results.
