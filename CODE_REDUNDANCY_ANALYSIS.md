# Code Redundancy Analysis - Trade Whisperer

**Date:** 2025-10-26
**Purpose:** Identify duplicate code that should be centralized

---

## Critical Redundancies Found

### 1. ❌ DUPLICATE: Indicator Calculations (MAJOR ISSUE)

**Problem:** Indicator calculations exist in TWO places:

**Location 1:** `/docker/backtesting-server/backtesting-engine.js` (lines 837-1082)
```javascript
calculateVWAP(data) { ... }
calculateRSI(data, period = 14) { ... }
calculateROC(data, period = 3) { ... }
calculateVWAPSlope(vwapValues, lookback = 5) { ... }
calculateMACD(data, params) { ... }
```

**Location 2:** `/docker/backtesting-server/technical-indicators.js` (lines 14-200+)
```javascript
static calculateRSI(prices, period = 14) { ... }
static calculateROC(prices, period = 10) { ... }
static calculateVWAP(bars) { ... }
static calculateVWAPSlope(vwapValues, lookback = 5) { ... }
```

**Impact:**
- If you fix a bug in RSI calculation, you have to fix it in TWO places
- Inconsistent results possible if implementations differ
- Harder to maintain and test

**Solution:**
```javascript
// backtesting-engine.js should ONLY call technical-indicators.js
calculateIndicators(stockData, strategy) {
  const indicators = {};
  const closePrices = stockData.map(bar => bar.close);

  // ✅ Call centralized calculation
  indicators.rsi2 = TechnicalIndicators.calculateRSI(closePrices, 2);
  indicators.rsi9 = TechnicalIndicators.calculateRSI(closePrices, 9);
  indicators.roc3 = TechnicalIndicators.calculateROC(closePrices, 3);
  indicators.vwap = TechnicalIndicators.calculateVWAP(stockData);

  return indicators;
}
```

---

### 2. ❌ DUPLICATE: Options Symbol Parsing (REPEATED 3+ TIMES)

**Location 1:** `backtesting-engine.js` lines 261-275
```javascript
const match = contract.symbol.match(/([A-Z]+)(\d{6})([CP])(\d{8})/);
const [, ticker, date, callPut, strikeStr] = match;
const strike = parseInt(strikeStr) / 1000;
const type = callPut === 'C' ? 'call' : 'put';
const year = '20' + date.slice(0, 2);
const month = date.slice(2, 4);
const day = date.slice(4, 6);
const expiration = `${year}-${month}-${day}`;
```

**Location 2:** `server.js` lines 306-309 (similar parsing)
**Location 3:** Likely in other files too

**Impact:**
- Same regex pattern repeated everywhere
- If Alpaca changes symbol format, many places to update
- Parsing logic not reusable

**Solution - Create Utility:**
```javascript
// /docker/backtesting-server/utils/option-symbol-parser.js
class OptionSymbolParser {
  static parse(symbol) {
    const match = symbol.match(/([A-Z]+)(\d{6})([CP])(\d{8})/);
    if (!match) return null;

    const [, ticker, date, callPut, strikeStr] = match;

    return {
      symbol,
      ticker,
      strike: parseInt(strikeStr) / 1000,
      type: callPut === 'C' ? 'call' : 'put',
      expiration: this.parseExpiryDate(date),
      expiryYYMMDD: date,
      callPut
    };
  }

  static parseExpiryDate(yymmdd) {
    const year = '20' + yymmdd.slice(0, 2);
    const month = yymmdd.slice(2, 4);
    const day = yymmdd.slice(4, 6);
    return `${year}-${month}-${day}`;
  }

  static format(ticker, expiryYYMMDD, type, strike) {
    const dollars = Math.floor(strike);
    const cents = Math.round((strike - dollars) * 100);
    const strikeFormatted = dollars.toString().padStart(5, '0') +
                           cents.toString().padStart(3, '0');
    const callPut = type === 'call' ? 'C' : 'P';
    return `${ticker}${expiryYYMMDD}${callPut}${strikeFormatted}`;
  }
}

// Usage everywhere:
const parsed = OptionSymbolParser.parse('SPY251010C00670000');
// { ticker: 'SPY', strike: 670.00, type: 'call', expiration: '2025-10-10', ... }
```

---

### 3. ❌ DUPLICATE: OHLCV Price Extraction (3 PLACES)

**Location 1:** Entry price logic - `backtesting-engine.js` lines 388-412
```javascript
if (contract.ohlcv && contract.ohlcv.length > 0) {
  const matchingBar = contract.ohlcv.find(bar => bar.timestamp === signal.timestamp);
  if (matchingBar) {
    entryPrice = matchingBar.close;
  } else {
    entryPrice = contract.ohlcv[0].close;
  }
}
```

**Location 2:** Exit price logic - `backtesting-engine.js` lines 666-680
```javascript
if (position.contract.ohlcv && position.contract.ohlcv.length > 0) {
  const lastBar = position.contract.ohlcv[position.contract.ohlcv.length - 1];
  exitPrice = lastBar.close;
}
```

**Location 3:** Current price - `backtesting-engine.js` lines 1209-1237
```javascript
getCurrentOptionPrice(contract, currentData) {
  if (contract.ohlcv && contract.ohlcv.length > 0 && timestamp) {
    const matchingBar = contract.ohlcv.find(bar => bar.timestamp === timestamp);
    if (matchingBar) {
      return matchingBar.close;
    }
  }
}
```

**Impact:**
- Same OHLCV lookup logic repeated 3 times
- If you want to add slippage, you'd have to change 3 places
- Inconsistent fallback logic

**Solution - Create Utility:**
```javascript
// /docker/backtesting-server/utils/price-extractor.js
class PriceExtractor {
  /**
   * Get option price from OHLCV data at specific timestamp
   * Falls back to bid/ask/mid if OHLCV not available
   */
  static getPrice(contract, timestamp, priceType = 'close', slippage = 0) {
    // Priority 1: OHLCV data at exact timestamp
    if (contract.ohlcv && contract.ohlcv.length > 0) {
      const matchingBar = timestamp
        ? contract.ohlcv.find(bar => bar.timestamp === timestamp)
        : contract.ohlcv[contract.ohlcv.length - 1];

      if (matchingBar) {
        let price = matchingBar[priceType] || matchingBar.close;
        return this.applySlippage(price, slippage);
      }
    }

    // Priority 2: Bid/Ask
    if (contract.bid !== undefined && contract.ask !== undefined) {
      const mid = (contract.bid + contract.ask) / 2;
      return this.applySlippage(mid, slippage);
    }

    // Priority 3: Mid price
    if (contract.midPrice !== undefined) {
      return this.applySlippage(contract.midPrice, slippage);
    }

    // Fallback
    return contract.close || 0;
  }

  static applySlippage(price, slippagePct) {
    return price * (1 + slippagePct);
  }

  static getEntryPrice(contract, signal, slippage = 0.001) {
    // Buying: add slippage (pay more)
    return this.getPrice(contract, signal.timestamp, 'close', slippage);
  }

  static getExitPrice(contract, timestamp, slippage = -0.001) {
    // Selling: subtract slippage (get less)
    return this.getPrice(contract, timestamp, 'close', slippage);
  }
}

// Usage:
const entryPrice = PriceExtractor.getEntryPrice(contract, signal, 0.001);
const exitPrice = PriceExtractor.getExitPrice(contract, currentTime, -0.001);
const currentPrice = PriceExtractor.getPrice(contract, timestamp);
```

---

### 4. ❌ DUPLICATE: Options Data Fetching Logic (3 ENDPOINTS)

**Location 1:** `server.js` `/api/fetch-current-options` lines 199-361
**Location 2:** `server.js` `options_bars_by_dte` lines 384-534
**Location 3:** `server.js` `options_bars_by_date_range` lines 536-781

All three do the same steps:
1. Fetch underlying stock bars
2. Calculate price range and center strike
3. Generate option symbols
4. Fetch options bars from Alpaca
5. Format and return results

**Impact:**
- ~150 lines duplicated 3 times
- Strike generation logic repeated
- Symbol formatting repeated
- Hard to maintain

**Solution - Create Service Class:**
```javascript
// /docker/backtesting-server/services/options-data-service.js
class OptionsDataService {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://data.alpaca.markets';
  }

  /**
   * Fetch underlying stock data and calculate center strike
   */
  async getUnderlyingAnalysis(ticker, start, end, timeframe = '1min') {
    const url = `${this.baseUrl}/v2/stocks/${ticker}/bars?start=${start}&end=${end}&timeframe=${timeframe}&limit=10000&feed=iex&adjustment=all`;

    const response = await fetch(url, {
      headers: {
        'APCA-API-KEY-ID': this.apiKey,
        'APCA-API-SECRET-KEY': this.apiSecret,
      },
    });

    const data = await response.json();
    const bars = data.bars || [];

    const prices = bars.map(bar => bar.c);
    const currentPrice = prices[prices.length - 1];
    const minPrice = Math.min(...bars.map(bar => bar.l));
    const maxPrice = Math.max(...bars.map(bar => bar.h));
    const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;

    return {
      bars,
      currentPrice,
      minPrice,
      maxPrice,
      avgPrice,
      barCount: bars.length
    };
  }

  /**
   * Generate option symbols around center strike
   */
  generateOptionSymbols(ticker, expiryYYMMDD, centerStrike, strikeRange = 10, strikeSpacing = 5) {
    const symbols = [];

    for (let i = -strikeRange; i <= strikeRange; i++) {
      const strike = centerStrike + (i * strikeSpacing);
      if (strike > 0) {
        const dollars = Math.floor(strike);
        const cents = Math.round((strike - dollars) * 100);
        const strikeFormatted = dollars.toString().padStart(5, '0') +
                               cents.toString().padStart(3, '0');

        symbols.push(`${ticker}${expiryYYMMDD}C${strikeFormatted}`);
        symbols.push(`${ticker}${expiryYYMMDD}P${strikeFormatted}`);
      }
    }

    return symbols;
  }

  /**
   * Fetch options bars for given symbols with pagination
   */
  async fetchOptionsBars(symbols, start, end, timeframe = '1min', maxBarsPerContract = 50000) {
    const allBars = {};
    const batchSize = 50;

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const batchBars = await this.fetchBatch(batch, start, end, timeframe);
      Object.assign(allBars, batchBars);

      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return allBars;
  }

  async fetchBatch(symbols, start, end, timeframe) {
    const symbolsParam = encodeURIComponent(symbols.join(','));
    const url = `${this.baseUrl}/v1beta1/options/bars?symbols=${symbolsParam}&timeframe=${timeframe}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=1000&sort=asc`;

    // Pagination logic here...
    // (extracted from server.js lines 658-716)
  }

  /**
   * Complete workflow: fetch underlying + generate symbols + fetch options
   */
  async fetchOptionsForDTE(ticker, expiryYYMMDD, start, end, strikeRange = 10, strikeSpacing = 5) {
    // 1. Get underlying analysis
    const underlying = await this.getUnderlyingAnalysis(ticker, start, end);

    // 2. Calculate center strike
    const centerStrike = Math.round(underlying.avgPrice / strikeSpacing) * strikeSpacing;

    // 3. Generate symbols
    const symbols = this.generateOptionSymbols(ticker, expiryYYMMDD, centerStrike, strikeRange, strikeSpacing);

    // 4. Fetch options data
    const bars = await this.fetchOptionsBars(symbols, start, end);

    return {
      bars,
      underlying,
      centerStrike,
      symbols,
      metadata: {
        total_symbols_generated: symbols.length,
        symbols_with_data: Object.keys(bars).length
      }
    };
  }
}

// Usage in server.js endpoints:
const optionsService = new OptionsDataService(apiKey, apiSecret);
const result = await optionsService.fetchOptionsForDTE('SPY', '241220', start, end);
```

---

### 5. ❌ DUPLICATE: DTE Calculation (3 FUNCTIONS)

**Location 1:** `getBestDTE()` - server.js lines 59-121
**Location 2:** `getOptimalExpiryDate()` - server.js lines 126-163
**Location 3:** `getExpirationDate()` - server.js lines 801-827

All doing similar date calculations for DTE logic.

**Solution - Create Utility:**
```javascript
// /docker/backtesting-server/utils/dte-calculator.js
class DTECalculator {
  /**
   * Get best DTE based on current market conditions
   */
  static getBestDTE() {
    const now = moment().tz('America/New_York');
    const dayOfWeek = now.day();
    const hour = now.hour();
    const minute = now.minute();
    const currentTime = hour * 100 + minute;

    const marketOpen = 930;
    const marketClose = 1600;
    const nearClose = 1530;

    // Weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return { dte: '1DTE', reason: 'Weekend - target Monday expiry' };
    }

    // Weekday logic
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      if (currentTime >= marketOpen && currentTime <= marketClose) {
        if (currentTime < nearClose) {
          return { dte: '0DTE', reason: 'Market open, safe for same-day expiry' };
        } else {
          return { dte: '1DTE', reason: 'Near market close, next day safer' };
        }
      }

      if (dayOfWeek === 5 && currentTime > marketClose) {
        return { dte: '2DTE', reason: 'Friday after hours, target Monday' };
      }

      if (currentTime > marketClose) {
        return { dte: '1DTE', reason: 'After hours, next trading day' };
      }
    }

    return { dte: '1DTE', reason: 'Default fallback' };
  }

  /**
   * Calculate expiration date for given DTE
   */
  static getExpirationDate(dteStrategy, referenceDate = null) {
    const now = referenceDate ? moment(referenceDate) : moment().tz('America/New_York');

    switch (dteStrategy) {
      case '0DTE':
        return this.getSameDayExpiry(now);
      case '1DTE':
        return this.getNextTradingDay(now);
      case '2DTE':
        return this.getTradingDaysOut(now, 2);
      default:
        return now.format('YYMMDD');
    }
  }

  static getSameDayExpiry(date) {
    if (date.day() >= 1 && date.day() <= 5) {
      return date.format('YYMMDD');
    }
    return this.getNextTradingDay(date);
  }

  static getNextTradingDay(date) {
    let nextDay = date.clone().add(1, 'day');
    while (nextDay.day() === 0 || nextDay.day() === 6) {
      nextDay.add(1, 'day');
    }
    return nextDay.format('YYMMDD');
  }

  static getTradingDaysOut(date, count) {
    let targetDay = date.clone();
    let tradingDaysAdded = 0;

    while (tradingDaysAdded < count) {
      targetDay.add(1, 'day');
      if (targetDay.day() >= 1 && targetDay.day() <= 5) {
        tradingDaysAdded++;
      }
    }

    return targetDay.format('YYMMDD');
  }

  /**
   * Calculate days to expiration
   */
  static calculateDTE(currentDate, expirationDate) {
    const current = moment(currentDate);
    const expiry = moment(expirationDate);
    return Math.ceil(expiry.diff(current, 'days', true));
  }
}

// Usage:
const { dte, reason } = DTECalculator.getBestDTE();
const expiryYYMMDD = DTECalculator.getExpirationDate('0DTE');
const daysLeft = DTECalculator.calculateDTE(now, expiration);
```

---

### 6. ❌ DUPLICATE: Greeks Calculation

**Location 1:** Options Auditor - `options-backtest-auditor.js` lines 29-67
**Location 2:** Could be in other places too

**Solution:**
The auditor's Greeks calculation is actually intentional (for independent validation), but it should be extracted to a shared utility that both the main system AND auditor use:

```javascript
// /docker/backtesting-server/utils/black-scholes.js
class BlackScholes {
  static calculateGreeks(optionPrice, underlyingPrice, strike, timeToExpiry, riskFreeRate, optionType) {
    const sigma = this.calculateImpliedVolatility(
      optionPrice, underlyingPrice, strike, timeToExpiry, riskFreeRate, optionType
    );

    if (!sigma || isNaN(sigma)) return null;

    const d1 = (Math.log(underlyingPrice / strike) +
                (riskFreeRate + 0.5 * sigma ** 2) * timeToExpiry) /
               (sigma * Math.sqrt(timeToExpiry));
    const d2 = d1 - sigma * Math.sqrt(timeToExpiry);

    return {
      impliedVol: sigma,
      delta: optionType === 'call' ? this.N(d1) : this.N(d1) - 1,
      gamma: this.n(d1) / (underlyingPrice * sigma * Math.sqrt(timeToExpiry)),
      vega: (underlyingPrice * this.n(d1) * Math.sqrt(timeToExpiry)) / 100,
      theta: this.calculateTheta(underlyingPrice, strike, timeToExpiry, riskFreeRate, sigma, d1, d2, optionType),
      rho: this.calculateRho(strike, timeToExpiry, riskFreeRate, d2, optionType)
    };
  }

  // All the helper methods here...
}

// Both backtesting engine AND auditor use this
```

---

## Summary of Recommended Refactoring

### High Priority (Do First)

1. **Centralize Indicator Calculations**
   - Delete duplicate code from `backtesting-engine.js`
   - Use `TechnicalIndicators` class everywhere
   - **Files affected:** 1 file, ~250 lines removed

2. **Create Price Extractor Utility**
   - Consolidate all OHLCV price extraction logic
   - Add slippage support in one place
   - **Files affected:** 1 file, ~100 lines removed

3. **Create Option Symbol Parser Utility**
   - Parse/format symbols in one place
   - **Files affected:** 3+ files, ~50 lines removed

### Medium Priority

4. **Create Options Data Service**
   - Consolidate fetching logic
   - Reduce server.js by ~400 lines
   - **Files affected:** 1 file, ~400 lines removed

5. **Create DTE Calculator Utility**
   - Consolidate date logic
   - **Files affected:** 1 file, ~100 lines removed

6. **Create Black-Scholes Utility**
   - Share Greeks calculation
   - **Files affected:** 2 files

### Benefits After Refactoring

✅ **Single Source of Truth:** Fix bugs in one place
✅ **Easier Testing:** Test utilities independently
✅ **Better Maintainability:** Less code to maintain
✅ **Consistent Behavior:** No discrepancies between duplicates
✅ **Faster Development:** Reuse existing utilities

---

## Proposed New Structure

```
/docker/backtesting-server/
├── server.js (MUCH smaller after refactoring)
├── backtesting-engine.js (MUCH smaller)
├── utils/
│   ├── option-symbol-parser.js ✨ NEW
│   ├── price-extractor.js ✨ NEW
│   ├── dte-calculator.js ✨ NEW
│   ├── black-scholes.js ✨ NEW
│   └── alpaca-client.js (existing)
├── services/
│   └── options-data-service.js ✨ NEW
├── indicators/
│   └── technical-indicators.js (existing, but now ONLY source)
└── strategies/
    └── ...
```

---

## Estimated Impact

**Before Refactoring:**
- Total lines of duplicated code: ~1,000 lines
- Places to update for a bug fix: 3-5 locations
- Risk of inconsistency: HIGH

**After Refactoring:**
- Lines removed: ~800-1,000
- Places to update for a bug fix: 1 location
- Risk of inconsistency: LOW
- Code reusability: HIGH

---

**Would you like me to start implementing these refactorings?** I can create the utility files and update the existing code to use them.
