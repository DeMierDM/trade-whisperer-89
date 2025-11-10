# Options Backtesting Research for 0DTE/1DTE Strategies

## Overview
This document outlines research findings from analyzing the lambdaclass/options_backtester and applies those learnings to our 0DTE/1DTE options trading system.

**Research Source:** https://github.com/lambdaclass/options_backtester  
**Date:** 2025-10-26

---

## Key Findings from Reference Implementation

### 1. Data Schema Requirements

#### Required Fields for Options Backtesting
```python
option_columns = [
    "underlying",        # Stock symbol (e.g., "SPY")
    "underlying_last",   # Stock's last price
    "date",             # Quote/bar date
    "contract",         # Option symbol (e.g., "SPY251026C00580000")
    "type",             # "call" or "put"
    "expiration",       # Expiration date
    "strike",           # Strike price
    "bid",              # Bid price
    "ask",              # Ask price
    "volume",           # Trading volume
    "open_interest"     # Open interest
]
```

**Our Current Implementation Status:**
- ✅ underlying - `symbol` from options chain
- ✅ underlying_last - fetched from stock quote
- ✅ date - `timestamp` field
- ✅ contract - `symbol` field (Alpaca format)
- ✅ type - `type` field ('call' or 'put')
- ✅ expiration - `expiration_date` field
- ✅ strike - `strike_price` field
- ✅ bid - from OPRA feed
- ✅ ask - from OPRA feed
- ✅ volume - from Alpaca data
- ⚠️ open_interest - **NOT CURRENTLY FETCHED** (need to add)

**Action Item:** Add open interest to our options data fetching.

---

### 2. OHLCV vs Bid/Ask for Backtesting

#### Why OHLCV is Critical

The reference implementation uses bid/ask for entry/exit pricing, but **our 0DTE/1DTE strategies require OHLCV bars** for accurate intraday backtesting:

**Traditional Backtesting (Multi-day holds):**
- Entry: Use ask price (buying)
- Exit: Use bid price (selling)
- Timeframe: Daily or weekly
- Slippage: Fixed percentage

**0DTE/1DTE Intraday Backtesting:**
- Entry: OHLC bar at entry time (realistic execution)
- Exit: OHLC bar at exit time (realistic execution)
- Timeframe: 1-minute or 5-minute bars
- Slippage: Based on bar high-low spread

**Example Scenario:**
```
Entry at 10:30 AM:
  Bar: O=2.40, H=2.50, L=2.38, C=2.45
  Realistic entry: Average of (ask from OPRA + bar open) = 2.42
  
Exit at 11:45 AM:
  Bar: O=3.10, H=3.20, L=3.05, C=3.15
  Realistic exit: Average of (bid from OPRA + bar close) = 3.12
```

**Our Current Implementation:**
- ✅ Fetches OHLCV bars via `options_bars_by_dte` endpoint
- ✅ 1-minute granularity available
- ✅ Proper bar structure: `{t, o, h, l, c, v, vw, n}`
- ✅ CSV storage for historical analysis

---

### 3. Strategy Leg Architecture

#### Reference Implementation Approach
```python
leg1 = StrategyLeg('leg_1', schema, option_type=Type.CALL, direction=Direction.BUY)
leg1.entry_filter = (schema.dte < 80) & (schema.dte > 52)
leg1.exit_filter = (schema.dte <= 52)
```

**Key Concepts:**
1. **Strategy Legs** - Each leg = one contract type/direction
2. **Entry Filters** - Conditions to enter position (DTE, delta, price, etc.)
3. **Exit Filters** - Conditions to exit position (DTE, P&L, time, etc.)
4. **Multi-leg Support** - Combine legs for spreads (straddles, strangles, etc.)

#### Adapted for Our 0DTE/1DTE System

```typescript
interface StrategyLeg {
  name: string;
  contractType: 'call' | 'put';
  direction: 'buy' | 'sell';
  
  // Entry conditions
  entryRules: {
    dteMin?: number;        // e.g., 0 for 0DTE
    dteMax?: number;        // e.g., 1 for 1DTE
    deltaMin?: number;      // e.g., 0.30
    deltaMax?: number;      // e.g., 0.70
    strikeOffset?: number;  // e.g., ATM, +5, -5
    timeOfDay?: string;     // e.g., "09:45" (45 min after open)
    underlyingPrice?: {     // Stock price conditions
      above?: number;
      below?: number;
      sma?: number;         // Above/below SMA
    };
  };
  
  // Exit conditions
  exitRules: {
    profitTarget?: number;  // e.g., 0.50 (50% profit)
    stopLoss?: number;      // e.g., -0.30 (30% loss)
    timeExit?: string;      // e.g., "15:45" (15 min before close)
    dteExit?: number;       // e.g., 0 (expire worthless)
    trailingStop?: number;  // e.g., 0.20 (20% trailing stop)
  };
  
  // Position sizing
  sizing: {
    contracts: number;      // Number of contracts
    percentOfCapital?: number; // e.g., 0.05 (5% of capital)
    maxContracts?: number;  // Risk limit
  };
}

interface Strategy {
  name: string;
  description: string;
  legs: StrategyLeg[];
  riskManagement: {
    maxDailyLoss: number;
    maxPositionSize: number;
    requireConfirmation: boolean;
  };
}
```

**Example 0DTE Strategy:**
```typescript
const zeroDeCallStrategy: Strategy = {
  name: "0DTE ATM Call Breakout",
  description: "Buy ATM call when SPY breaks above 9:45 AM high",
  legs: [
    {
      name: "Long Call",
      contractType: "call",
      direction: "buy",
      entryRules: {
        dteMin: 0,
        dteMax: 0,
        deltaMin: 0.45,
        deltaMax: 0.55,
        timeOfDay: "09:45",
        underlyingPrice: {
          above: "9:45_high"  // Custom logic
        }
      },
      exitRules: {
        profitTarget: 0.50,
        stopLoss: -0.30,
        timeExit: "15:45"
      },
      sizing: {
        contracts: 1,
        percentOfCapital: 0.05
      }
    }
  ],
  riskManagement: {
    maxDailyLoss: -1000,
    maxPositionSize: 5,
    requireConfirmation: false
  }
};
```

---

### 4. Portfolio Allocation & Capital Management

#### Reference Implementation
```python
allocation = {
    'stocks': 0.5,   # 50% in stocks
    'options': 0.5,  # 50% in options
    'cash': 0.0      # 0% cash reserve
}

bt = Backtest(allocation, initial_capital=1_000_000)
```

**Key Insight:** Options backtesting requires **portfolio-level** capital allocation, not just trade-by-trade.

#### Our Implementation Needs

```typescript
interface BacktestConfig {
  initialCapital: number;  // e.g., 10000
  allocation: {
    stocks: number;        // e.g., 0.0 (we're options-only)
    options: number;       // e.g., 0.95 (95% in options)
    cash: number;          // e.g., 0.05 (5% cash reserve)
  };
  commissions: {
    perContract: number;   // e.g., 0.65
    perTrade: number;      // e.g., 0.00
    percentOfPremium: number; // e.g., 0.0
  };
  slippage: {
    type: 'percentage' | 'fixed' | 'spread';
    value: number;         // e.g., 0.01 (1%) or bar spread
  };
}
```

**Critical for 0DTE:**
- Options premium is typically $0.50 - $5.00 per contract
- Commission ($0.65) is significant relative to premium
- Slippage matters more on 1-minute bars than daily bars
- Need to track margin requirements (buying power)

---

### 5. Trade Execution Logic

#### Reference Implementation Pattern
```python
def _execute_trades(self, date, options_df):
    # Entry logic
    for leg in strategy.legs:
        matching_contracts = options_df.query(leg.entry_filter)
        if not matching_contracts.empty:
            selected = self._select_contract(matching_contracts, leg.selection_criteria)
            self._enter_position(selected, leg.direction, leg.quantity)
    
    # Exit logic
    for position in self._open_positions:
        if position.meets_exit_criteria():
            self._exit_position(position)
```

#### Our Adapted Pattern for 0DTE

```typescript
class BacktestEngine {
  private openPositions: Position[] = [];
  private closedPositions: Position[] = [];
  private capital: number;
  
  async runBacktest(
    strategy: Strategy,
    optionsBars: OptionsBars,
    stockBars: StockBars,
    startDate: string,
    endDate: string
  ): Promise<BacktestResults> {
    
    // Iterate through each bar (1-minute granularity)
    for (const bar of this.getBarIterator(startDate, endDate)) {
      const currentTime = bar.timestamp;
      const currentPrice = bar.underlyingPrice;
      
      // 1. CHECK EXITS (before entries to free capital)
      this.checkExits(currentTime, optionsBars, stockBars);
      
      // 2. CHECK ENTRIES (if capital available)
      if (this.hasAvailableCapital()) {
        this.checkEntries(strategy, currentTime, optionsBars, stockBars);
      }
      
      // 3. UPDATE POSITION VALUES
      this.updatePositionValues(currentTime, optionsBars);
      
      // 4. LOG ACCOUNT STATE
      this.logAccountSnapshot(currentTime);
    }
    
    return this.generateResults();
  }
  
  private checkEntries(
    strategy: Strategy,
    currentTime: Date,
    optionsBars: OptionsBars,
    stockBars: StockBars
  ): void {
    for (const leg of strategy.legs) {
      // Find contracts matching entry criteria
      const candidates = this.findMatchingContracts(
        leg.entryRules,
        currentTime,
        optionsBars,
        stockBars
      );
      
      if (candidates.length > 0) {
        // Select best contract (ATM, highest volume, etc.)
        const selected = this.selectBestContract(candidates, leg.entryRules);
        
        // Get realistic entry price
        const entryPrice = this.getEntryPrice(selected, currentTime, optionsBars);
        
        // Calculate position size
        const contracts = this.calculatePositionSize(leg.sizing, entryPrice);
        
        // Enter position
        this.enterPosition({
          contract: selected,
          entryTime: currentTime,
          entryPrice: entryPrice,
          contracts: contracts,
          leg: leg.name,
          direction: leg.direction
        });
      }
    }
  }
  
  private checkExits(
    currentTime: Date,
    optionsBars: OptionsBars,
    stockBars: StockBars
  ): void {
    for (const position of this.openPositions) {
      const currentBar = optionsBars.getBar(position.contract, currentTime);
      if (!currentBar) continue;
      
      const currentPrice = this.getExitPrice(position, currentTime, optionsBars);
      const pnl = (currentPrice - position.entryPrice) * position.contracts * 100;
      const pnlPercent = (currentPrice - position.entryPrice) / position.entryPrice;
      
      // Check exit conditions
      const shouldExit = 
        // Profit target
        (position.leg.exitRules.profitTarget && pnlPercent >= position.leg.exitRules.profitTarget) ||
        // Stop loss
        (position.leg.exitRules.stopLoss && pnlPercent <= position.leg.exitRules.stopLoss) ||
        // Time exit
        (position.leg.exitRules.timeExit && currentTime >= position.leg.exitRules.timeExit) ||
        // Expiration (0DTE specific)
        (position.leg.exitRules.dteExit === 0 && this.isExpiration(currentTime));
      
      if (shouldExit) {
        this.exitPosition(position, currentTime, currentPrice, this.determineExitReason());
      }
    }
  }
  
  private getEntryPrice(
    contract: OptionContract,
    time: Date,
    optionsBars: OptionsBars
  ): number {
    const bar = optionsBars.getBar(contract.symbol, time);
    
    // For BUY: Use ask (or average of open/high)
    // Realistic entry assumes we pay the ask or slightly above open
    return bar.ask || (bar.open + bar.high) / 2;
  }
  
  private getExitPrice(
    position: Position,
    time: Date,
    optionsBars: OptionsBars
  ): number {
    const bar = optionsBars.getBar(position.contract, time);
    
    // For SELL (closing long): Use bid (or average of close/low)
    // Realistic exit assumes we receive the bid or slightly below close
    return bar.bid || (bar.close + bar.low) / 2;
  }
}
```

**Key Differences for 0DTE:**
1. **Intraday timing** - Entry/exit at specific times, not just EOD
2. **Fast-moving prices** - 1-minute bars capture rapid moves
3. **Expiration handling** - All 0DTE positions expire at 4:00 PM
4. **Commission impact** - $0.65 per contract significant on small premiums

---

### 6. Performance Metrics

#### Reference Metrics
- Total Return
- Sharpe Ratio
- Maximum Drawdown
- Win Rate
- Average Win/Loss

#### Our 0DTE-Specific Metrics

```typescript
interface BacktestResults {
  // Basic metrics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  
  // P&L metrics
  grossProfit: number;
  grossLoss: number;
  netProfit: number;
  netReturn: number;  // Percentage
  
  // Risk metrics
  sharpeRatio: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  calmarRatio: number;
  
  // Trade analysis
  averageWin: number;
  averageLoss: number;
  profitFactor: number;  // Gross profit / Gross loss
  expectancy: number;     // Average trade P&L
  
  // 0DTE-specific metrics
  avgHoldTime: number;         // In minutes
  avgEntryTime: string;        // e.g., "10:30 AM"
  avgExitTime: string;         // e.g., "15:45 PM"
  percentExpiryExits: number;  // How many held to expiration
  commissionsPaid: number;
  slippageCost: number;
  
  // Time series data
  equityCurve: {
    date: string;
    equity: number;
    drawdown: number;
  }[];
  
  tradeLog: {
    entryDate: string;
    entryTime: string;
    exitDate: string;
    exitTime: string;
    contract: string;
    strike: number;
    type: 'call' | 'put';
    direction: 'buy' | 'sell';
    contracts: number;
    entryPrice: number;
    exitPrice: number;
    pnl: number;
    pnlPercent: number;
    holdTime: number;  // Minutes
    exitReason: 'profit_target' | 'stop_loss' | 'time' | 'expiration';
  }[];
}
```

---

### 7. Realistic Slippage Modeling

#### Traditional Backtesting Slippage
```python
# Fixed percentage
slippage = entry_price * 0.01  # 1% slippage
```

#### 0DTE Bar-Based Slippage
```typescript
function calculateRealisticSlippage(
  bar: OptionBar,
  direction: 'entry' | 'exit',
  orderType: 'buy' | 'sell'
): number {
  const spread = bar.ask - bar.bid;
  const barRange = bar.high - bar.low;
  
  // Use wider of spread or bar range
  const effectiveSpread = Math.max(spread, barRange * 0.5);
  
  if (direction === 'entry' && orderType === 'buy') {
    // Pay half the spread above mid
    return bar.close + (effectiveSpread / 2);
  } else if (direction === 'exit' && orderType === 'sell') {
    // Receive half the spread below mid
    return bar.close - (effectiveSpread / 2);
  }
  
  return bar.close;
}
```

**Why This Matters for 0DTE:**
- Bid-ask spreads on 0DTE options can be 10-50% of premium
- Intraday volatility causes rapid price movements
- Market orders may execute at unfavorable prices
- 1-minute bars capture realistic fill prices better than EOD

---

## Implementation Recommendations

### Phase 1: Data Infrastructure ✅ (Already Complete)

Our current implementation already has:
- ✅ OHLCV bars for options via `options_bars_by_dte`
- ✅ Historical stock data for underlying
- ✅ 1-minute granularity
- ✅ Proper date range handling
- ✅ CSV storage for persistence

### Phase 2: Backtest Engine (To Implement)

Create new file: `src/lib/backtestEngine.ts`

```typescript
export class BacktestEngine {
  // Core methods
  async runBacktest(config: BacktestConfig): Promise<BacktestResults>
  
  // Position management
  private enterPosition(params: PositionParams): void
  private exitPosition(position: Position, ...): void
  private updatePositionValues(time: Date): void
  
  // Strategy evaluation
  private checkEntries(strategy: Strategy, ...): void
  private checkExits(time: Date): void
  private findMatchingContracts(...): OptionContract[]
  
  // Pricing
  private getEntryPrice(...): number
  private getExitPrice(...): number
  private calculateSlippage(...): number
  
  // Capital management
  private hasAvailableCapital(): boolean
  private calculatePositionSize(...): number
  private updateAccountState(): void
  
  // Metrics
  private calculateMetrics(): BacktestResults
  private generateEquityCurve(): any[]
}
```

### Phase 3: Strategy Builder UI

Create `src/components/StrategyBuilder.tsx`:
- Visual strategy configuration
- Drag-and-drop entry/exit conditions
- Real-time validation
- Template library (0DTE breakout, reversal, etc.)

### Phase 4: Results Visualization

Enhance `Backtesting.tsx`:
- Equity curve chart (already exists)
- Trade distribution histogram
- Entry/exit time heatmap
- Win/loss analysis by time of day
- Detailed trade log with filtering

### Phase 5: Forward Testing

Add paper trading with same logic:
- Use backtest engine in real-time
- Replace historical bars with live data
- Track performance vs backtest
- Alert on strategy deviations

---

## 0DTE-Specific Considerations

### 1. **Expiration Handling**
All 0DTE contracts expire at market close (4:00 PM ET):
```typescript
function handleExpiration(position: Position, time: Date): void {
  if (time >= "16:00" && position.dte === 0) {
    const intrinsicValue = Math.max(0, 
      position.type === 'call' 
        ? underlyingPrice - position.strike
        : position.strike - underlyingPrice
    );
    
    if (intrinsicValue > 0) {
      // Exercise (auto-close at intrinsic value)
      this.exitPosition(position, time, intrinsicValue, 'expiration_itm');
    } else {
      // Expire worthless
      this.exitPosition(position, time, 0, 'expiration_otm');
    }
  }
}
```

### 2. **Time Decay (Theta)**
Theta decay accelerates on 0DTE:
```typescript
// Approximate theta for 0DTE (very aggressive)
function estimate0DTETheta(option: OptionContract, time: Date): number {
  const minutesToExpiry = this.getMinutesToExpiry(time);
  const hoursToExpiry = minutesToExpiry / 60;
  
  // Theta increases exponentially as expiration approaches
  const thetaMultiplier = 1 / Math.max(0.1, hoursToExpiry);
  
  return option.price * 0.01 * thetaMultiplier;  // Rough estimate
}
```

### 3. **Volatility Impact**
0DTE options highly sensitive to IV:
```typescript
function adjustForVolatility(
  basePrice: number,
  currentIV: number,
  historicalIV: number
): number {
  const ivRatio = currentIV / historicalIV;
  
  // 0DTE vega is high despite short DTE
  const vegaAdjustment = (ivRatio - 1) * 0.3;
  
  return basePrice * (1 + vegaAdjustment);
}
```

### 4. **Liquidity Filtering**
Only trade liquid contracts:
```typescript
function isLiquidContract(contract: OptionContract): boolean {
  return (
    contract.volume >= 100 &&           // Minimum volume
    contract.bid > 0.05 &&              // Avoid penny options
    contract.ask < 50 &&                // Avoid deep ITM
    (contract.ask - contract.bid) / contract.ask < 0.2  // Max 20% spread
  );
}
```

---

## Testing Strategy

### Unit Tests
```typescript
describe('BacktestEngine', () => {
  it('should handle 0DTE expiration correctly', () => {
    // Test expiration logic
  });
  
  it('should apply realistic slippage', () => {
    // Test slippage calculation
  });
  
  it('should respect capital limits', () => {
    // Test position sizing
  });
  
  it('should calculate metrics accurately', () => {
    // Test Sharpe, drawdown, etc.
  });
});
```

### Integration Tests
```typescript
describe('Full Backtest', () => {
  it('should run 0DTE strategy on historical data', async () => {
    const results = await engine.runBacktest({
      strategy: zeroDeCallStrategy,
      startDate: '2025-01-01',
      endDate: '2025-10-26',
      initialCapital: 10000
    });
    
    expect(results.totalTrades).toBeGreaterThan(0);
    expect(results.netReturn).toBeDefined();
  });
});
```

### Validation Tests
- Compare backtest to manual calculations
- Verify commissions/slippage math
- Check equity curve accuracy
- Validate trade log completeness

---

## Next Steps

1. ✅ **Data Infrastructure** - Already implemented
2. ⏭️ **Implement BacktestEngine** - Core backtesting logic
3. ⏭️ **Add Strategy Builder** - UI for strategy creation
4. ⏭️ **Enhance Results Display** - Comprehensive visualization
5. ⏭️ **Add Performance Metrics** - All calculated metrics
6. ⏭️ **Create Strategy Library** - Pre-built 0DTE/1DTE strategies
7. ⏭️ **Forward Testing Mode** - Paper trading integration

---

## References

- **lambdaclass/options_backtester** - Core concepts and architecture
- **QuantConnect** - Professional backtesting patterns
- **Backtrader** - Portfolio management approaches
- **OptionMetrics** - Industry-standard options data handling

---

## Conclusion

Our current implementation has a **strong data foundation** with proper OHLCV bars and 1-minute granularity. The next phase is to build the backtesting engine that:

1. ✅ Uses OHLCV data (not just bid/ask)
2. ✅ Handles intraday 0DTE/1DTE strategies
3. ✅ Applies realistic slippage
4. ✅ Manages capital properly
5. ✅ Tracks individual contracts
6. ✅ Provides comprehensive metrics

This will enable **realistic, actionable backtesting** for our 0DTE/1DTE options trading strategies.
