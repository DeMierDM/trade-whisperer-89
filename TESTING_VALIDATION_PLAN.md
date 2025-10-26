# Testing & Validation Plan for Trading System

## Overview
This document outlines comprehensive testing and validation procedures for the options trading system, including manual testing, automated testing with Playwright, and data flow validation.

**Last Updated:** 2025-10-26

---

## Test Environment Setup

### Prerequisites
```bash
# 1. Start Docker services
docker-compose up -d

# 2. Verify services are running
docker-compose ps
# Expected: trading_api (port 3001), trading_db (port 5433), trading_redis (port 6379)

# 3. Check API server logs
docker-compose logs -f trading_api

# 4. Start frontend development server
npm run dev
# Expected: Running on http://localhost:5173
```

### Environment Validation Checklist
- [ ] Docker services all showing "Up" status
- [ ] API server responding at http://localhost:3001/health
- [ ] Database accessible (check Docker logs for connection success)
- [ ] Frontend dev server running on port 5173
- [ ] No port conflicts

---

## Phase 1: API Endpoint Testing

### Manual API Testing with cURL

#### 1. Health Check
```bash
curl http://localhost:3001/health

# Expected Response:
# {
#   "status": "healthy",
#   "timestamp": "2025-10-26T..."
# }
```

#### 2. Test API Connection (Get Keys)
```bash
curl -X POST http://localhost:3001/api/test-connection \
  -H 'Content-Type: application/json' \
  -d '{"provider":"alpaca","getKeys":true}'

# Expected Response:
# {
#   "isConnected": true,
#   "message": "Live API keys retrieved for market data",
#   "keys": {
#     "api_key": "PK...",
#     "api_secret": "...",
#     "mode": "live"
#   }
# }
```

#### 3. Fetch Stock Quote
```bash
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H 'Content-Type: application/json' \
  -d '{
    "dataType": "quote",
    "symbol": "SPY"
  }'

# Expected Response:
# {
#   "data": {
#     "quote": {
#       "bp": 580.70,
#       "ap": 580.84,
#       ...
#     }
#   }
# }
```

#### 4. Fetch Historical Bars
```bash
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H 'Content-Type: application/json' \
  -d '{
    "dataType": "bars",
    "symbol": "SPY",
    "start": "2025-10-25T09:30:00Z",
    "end": "2025-10-25T16:00:00Z",
    "timeframe": "5Min"
  }' | python3 -m json.tool | head -50

# Expected: Array of bars with O, H, L, C, V data
```

#### 5. Fetch Options Chain
```bash
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H 'Content-Type: application/json' \
  -d '{
    "dataType": "options",
    "symbol": "SPY"
  }' | python3 -m json.tool | head -100

# Expected: Array of option contracts with bid, ask, strike, expiration
```

#### 6. Fetch Options Greeks
```bash
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H 'Content-Type: application/json' \
  -d '{
    "dataType": "options_greeks",
    "symbols": "SPY251026C00580000,SPY251026P00580000"
  }' | python3 -m json.tool

# Expected: Greeks data (delta, gamma, theta, vega, IV) for each symbol
```

#### 7. Fetch Historical Options Bars (for Backtesting)
```bash
curl -X POST http://localhost:3001/api/fetch-market-data \
  -H 'Content-Type: application/json' \
  -d '{
    "dataType": "options_bars_by_dte",
    "ticker": "SPY",
    "expiryDate": "251026",
    "start": "2025-10-26T09:30:00Z",
    "end": "2025-10-26T16:00:00Z",
    "timeframe": "1min",
    "strikeRange": 5,
    "strikeSpacing": 5
  }' | python3 -m json.tool | head -200

# Expected: OHLCV bars for multiple option symbols
```

### API Testing Checklist
- [ ] All endpoints return 200 status
- [ ] Response data structures match expected format
- [ ] Error handling works (try invalid symbols, dates, etc.)
- [ ] Timestamps are in correct format (ISO 8601)
- [ ] Numeric values are properly formatted
- [ ] Arrays contain expected number of items

---

## Phase 2: WebSocket Testing

### Manual WebSocket Testing

#### Test with wscat (install: `npm install -g wscat`)
```bash
# 1. Connect to WebSocket
wscat -c ws://localhost:3001

# 2. Wait for connection message
# Expected: {"type":"connected","message":"Connected to live OPRA data stream"}

# 3. Subscribe to symbols
> {"action":"subscribe","symbols":["SPY","SPY251026C00580000"]}

# 4. Monitor live messages
# Expected stream of:
# {"type":"stock_quote","data":{...}}
# {"type":"stock_trade","data":{...}}
# {"type":"option_quote","data":{...}}
```

### WebSocket Testing Checklist
- [ ] Connection established successfully
- [ ] Connection confirmation message received
- [ ] Subscription processed correctly
- [ ] Stock quotes arriving (during market hours)
- [ ] Stock trades arriving (during market hours)
- [ ] Option quotes arriving (during market hours)
- [ ] Messages properly formatted JSON
- [ ] No connection drops or errors
- [ ] Throttling working (max 10 quotes/symbol/second)
- [ ] Auto-reconnect on disconnect

### Browser DevTools WebSocket Testing
1. Open http://localhost:5173/trading
2. Open DevTools → Network → WS filter
3. Look for WebSocket connection to localhost:3001
4. Monitor messages tab
5. Verify data flow

---

## Phase 3: Frontend Component Testing

### Trading Page Tests

**URL:** http://localhost:5173/trading

#### Initial Load Tests
1. **Chart Initialization**
   - [ ] Chart container visible
   - [ ] Loading indicator shows while fetching data
   - [ ] Historical bars load (check console for "Received X bars")
   - [ ] Chart renders with proper timeframe (5Min default)
   - [ ] X-axis shows time labels
   - [ ] Y-axis shows price labels
   - [ ] Hover tooltip works

2. **Options Chain Display**
   - [ ] Options table renders
   - [ ] Contracts sorted by strike price
   - [ ] Bid/Ask columns populated
   - [ ] Delta, Gamma, Theta, Vega columns show (may take 5s)
   - [ ] ITM contracts highlighted differently
   - [ ] Strike column shows strike + type (e.g., "580C")

3. **Current Price Display**
   - [ ] Stock symbol shown (SPY)
   - [ ] Current price visible
   - [ ] Bid/Ask spread shown
   - [ ] Last update timestamp visible

#### Live Updates Tests
1. **Chart Live Updates** (During Market Hours)
   - [ ] New bars added every 5 minutes
   - [ ] Current bar updates in real-time
   - [ ] No lag or stuttering
   - [ ] Volume bars visible
   - [ ] Price changes reflected immediately

2. **Options Table Live Updates**
   - [ ] Bid/Ask prices update in real-time
   - [ ] Greeks refresh every 5 seconds
   - [ ] No UI freezing during updates
   - [ ] Table rows update without flickering

3. **WebSocket Connection Indicator**
   - [ ] Shows "🟢 Connected" when active
   - [ ] Shows "🔴 Disconnected" on connection loss
   - [ ] Auto-reconnects and shows "🟡 Reconnecting..."

#### Symbol Change Tests
1. Change from SPY to QQQ
   - [ ] Chart clears and reloads
   - [ ] Historical data fetches for new symbol
   - [ ] Options chain updates
   - [ ] WebSocket re-subscribes
   - [ ] All data matches new symbol

---

### Backtesting Page Tests

**URL:** http://localhost:5173/backtesting

#### Configuration Tests
1. **Strategy Selection**
   - [ ] Strategy dropdown populated
   - [ ] Strategy details shown on selection
   - [ ] Parameter inputs editable

2. **Date Range Selection**
   - [ ] Start date picker works
   - [ ] End date picker works
   - [ ] Validation prevents end < start
   - [ ] Historical data available for selected range

3. **Options Selection**
   - [ ] Ticker input accepts symbol
   - [ ] DTE selector (0DTE, 1DTE, weekly, monthly)
   - [ ] Strike range slider works
   - [ ] Timeframe selector (1min, 5min, etc.)

#### Execution Tests
1. **Run Backtest**
   - [ ] Loading indicator shows
   - [ ] Progress updates visible
   - [ ] No errors in console
   - [ ] Completes in reasonable time (<30s for 1 day)

2. **Results Display**
   - [ ] Equity curve chart renders
   - [ ] Metrics calculated correctly:
     - Total Return %
     - Sharpe Ratio
     - Max Drawdown
     - Win Rate
     - Total Trades
   - [ ] Trade log table shows all trades
   - [ ] Trade details expandable/clickable

3. **Data Validation**
   - [ ] Entry prices realistic (within bid/ask)
   - [ ] Exit prices realistic
   - [ ] P&L calculations accurate
   - [ ] Timestamps in correct order
   - [ ] All trades have entry AND exit

---

### Home Page Tests

**URL:** http://localhost:5173

#### Dashboard Tests
1. **Account Summary**
   - [ ] Account balance shown
   - [ ] Today's P&L displayed
   - [ ] Win rate calculated
   - [ ] Open positions count

2. **Recent Activity**
   - [ ] Recent trades listed
   - [ ] Trade details visible (symbol, P&L, time)
   - [ ] Sorted by most recent first

3. **Quick Stats**
   - [ ] Total trades count
   - [ ] Best trade shown
   - [ ] Worst trade shown
   - [ ] Average trade P&L

---

### Settings Page Tests

**URL:** http://localhost:5173/settings

#### API Keys Tab
1. **Key Management**
   - [ ] API key input accepts paste
   - [ ] Secret input accepts paste
   - [ ] Save button enabled when both filled
   - [ ] Test Connection button works
   - [ ] Success/error message shown

2. **Diagnostics Tab**
   - [ ] Run All Tests button works
   - [ ] Each endpoint test shows result
   - [ ] Success indicators (✅) for working endpoints
   - [ ] Error indicators (❌) for failing endpoints
   - [ ] Detailed error messages shown

---

## Phase 4: End-to-End Data Flow Testing

### Test Scenario 1: Live Trading Chart
**Goal:** Verify complete data flow from Alpaca → Docker API → Frontend → Chart

**Steps:**
1. Open Trading page
2. Open browser DevTools → Console
3. Select SPY symbol
4. Verify console logs:
   ```
   [TRADING] 🎯 Symbol changed to: SPY
   [CHART] 📊 Fetching historical bars for SPY
   [CHART] ✅ Received 507 historical bars
   [OPTIONS] Fetching options chain for SPY
   [OPTIONS] ✓ Received 652 options contracts
   [OPTIONS] ✓ Formatted 20 options for display
   [GREEKS] 📊 Fetching real Greeks from Alpaca
   [GREEKS] ✅ Updated Greeks for 20 options
   [WS] 🚀 Starting WebSocket connection
   [WS] ✅ Connected
   [WS] 📡 Subscribing to 21 symbols
   [WS] 📊 QUOTE RECEIVED: SPY Bid: 580.70 Ask: 580.84
   [WS] 💰 TRADE RECEIVED: SPY Price: 580.75
   ```

5. Verify data flow:
   - [ ] Historical bars API call succeeded
   - [ ] Bars normalized correctly
   - [ ] Chart rendered with bars
   - [ ] Options chain API call succeeded
   - [ ] Greeks API call succeeded
   - [ ] WebSocket connected
   - [ ] Live quotes arriving
   - [ ] Chart updating in real-time

**Expected Time:** 2-5 seconds for complete initialization

---

### Test Scenario 2: Options Backtesting
**Goal:** Verify historical options data retrieval and backtest execution

**Steps:**
1. Open Backtesting page
2. Configure:
   - Ticker: SPY
   - Start: 2025-10-25 09:30 AM
   - End: 2025-10-25 04:00 PM
   - DTE: 0DTE
   - Timeframe: 1min
3. Click "Run Backtest"
4. Verify console logs:
   ```
   [BACKTESTING] Fetching historical options data
   [BACKTESTING] ✅ Received 15,680 option bars for 28 symbols
   [BACKTESTING] Running strategy simulation
   [BACKTESTING] ✅ Backtest complete: 12 trades executed
   [BACKTESTING] Total P&L: $450.00 (4.5% return)
   ```

5. Verify data flow:
   - [ ] Underlying stock bars fetched
   - [ ] Options bars fetched with OHLCV data
   - [ ] Backtest engine executed
   - [ ] Trades logged with realistic prices
   - [ ] Results calculated correctly
   - [ ] Equity curve plotted

**Expected Time:** 10-20 seconds for 1 day backtest

---

### Test Scenario 3: Weekend Data Display
**Goal:** Verify weekend/after-hours data handling

**Test on Weekend or After-Hours:**
1. Open Trading page
2. Select SPY
3. Verify:
   - [ ] Last available data shown
   - [ ] Timestamp indicates market closed
   - [ ] Message: "Market Closed - Showing last available data"
   - [ ] Chart shows last 7 days of data
   - [ ] Latest price from Friday 4:00 PM ET
   - [ ] Options show "No 0DTE contracts (Market Closed)"
   - [ ] Can view 1DTE contracts for next Monday

**Test on Weekday After-Hours:**
1. Open Trading page at 6:00 PM ET
2. Verify:
   - [ ] Chart shows today's intraday data
   - [ ] Latest quote from 4:00 PM close
   - [ ] Message: "After Hours - Last update: 4:00 PM ET"
   - [ ] WebSocket not attempting connection
   - [ ] No error messages about failed connections

---

## Phase 5: Playwright Automated Testing

### Installation (Local Development)
```bash
# Install Playwright
npm install --save-dev @playwright/test

# Install browsers
npx playwright install chromium

# Initialize Playwright config
npx playwright init
```

### Test Suite Structure
```
tests/
├── api/
│   ├── health.spec.ts
│   ├── market-data.spec.ts
│   ├── options.spec.ts
│   └── websocket.spec.ts
├── e2e/
│   ├── trading-page.spec.ts
│   ├── backtesting.spec.ts
│   ├── home.spec.ts
│   └── settings.spec.ts
├── visual/
│   ├── chart-rendering.spec.ts
│   ├── options-table.spec.ts
│   └── results-display.spec.ts
└── integration/
    ├── live-data-flow.spec.ts
    ├── backtest-execution.spec.ts
    └── weekend-data.spec.ts
```

### Example Test: Trading Page Chart Rendering

```typescript
// tests/visual/chart-rendering.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Trading Page Chart Rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Start from trading page
    await page.goto('http://localhost:5173/trading');
  });

  test('should load and render historical chart data', async ({ page }) => {
    // Wait for page to load
    await page.waitForSelector('[data-testid="trading-chart"]');
    
    // Wait for chart to initialize (look for canvas element)
    const chart = page.locator('canvas.tv-lightweight-charts');
    await expect(chart).toBeVisible({ timeout: 10000 });
    
    // Take screenshot for visual regression
    await page.screenshot({ 
      path: 'test-results/trading-chart-initial.png',
      fullPage: true 
    });
    
    // Verify chart container has content
    const chartContainer = page.locator('[data-testid="trading-chart"]');
    const boundingBox = await chartContainer.boundingBox();
    expect(boundingBox).not.toBeNull();
    expect(boundingBox!.height).toBeGreaterThan(300);
  });

  test('should display options chain with data', async ({ page }) => {
    // Wait for options table
    await page.waitForSelector('[data-testid="options-table"]', { timeout: 10000 });
    
    // Check that at least 5 rows exist
    const rows = page.locator('[data-testid="options-table"] tbody tr');
    await expect(rows).toHaveCount(await rows.count(), { timeout: 5000 });
    const count = await rows.count();
    expect(count).toBeGreaterThan(5);
    
    // Verify bid/ask columns have values
    const firstRow = rows.first();
    const bidCell = firstRow.locator('td:nth-child(3)'); // Assuming bid is 3rd column
    const bidText = await bidCell.textContent();
    expect(bidText).not.toBe('0.00');
    expect(bidText).not.toBe('');
    
    // Take screenshot
    await page.screenshot({ 
      path: 'test-results/options-table.png',
      fullPage: true 
    });
  });

  test('should update chart with live data (during market hours)', async ({ page }) => {
    // Skip this test if market is closed
    const hour = new Date().getUTCHours();
    const isMarketHours = hour >= 13 && hour <= 21; // Approx 9:30 AM - 4:00 PM ET
    
    if (!isMarketHours) {
      test.skip();
      return;
    }
    
    // Wait for initial data
    await page.waitForSelector('canvas.tv-lightweight-charts', { timeout: 10000 });
    
    // Take screenshot before
    await page.screenshot({ path: 'test-results/chart-before-update.png' });
    
    // Wait 30 seconds for live updates
    await page.waitForTimeout(30000);
    
    // Take screenshot after
    await page.screenshot({ path: 'test-results/chart-after-update.png' });
    
    // Verify WebSocket connection indicator shows "Connected"
    const wsStatus = page.locator('[data-testid="ws-status"]');
    await expect(wsStatus).toContainText('Connected');
  });
});
```

### Example Test: Backtesting Execution

```typescript
// tests/e2e/backtesting.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Backtesting Page', () => {
  test('should run a complete backtest and display results', async ({ page }) => {
    await page.goto('http://localhost:5173/backtesting');
    
    // Configure backtest
    await page.fill('[data-testid="ticker-input"]', 'SPY');
    await page.selectOption('[data-testid="dte-select"]', '0DTE');
    await page.fill('[data-testid="start-date"]', '2025-10-25');
    await page.fill('[data-testid="end-date"]', '2025-10-25');
    
    // Click Run Backtest
    await page.click('[data-testid="run-backtest-btn"]');
    
    // Wait for results (max 30 seconds)
    await page.waitForSelector('[data-testid="backtest-results"]', { timeout: 30000 });
    
    // Verify results displayed
    const totalReturn = page.locator('[data-testid="total-return"]');
    await expect(totalReturn).toBeVisible();
    
    const winRate = page.locator('[data-testid="win-rate"]');
    await expect(winRate).toBeVisible();
    
    const totalTrades = page.locator('[data-testid="total-trades"]');
    await expect(totalTrades).toBeVisible();
    
    // Verify equity curve chart
    const equityCurve = page.locator('[data-testid="equity-curve"]');
    await expect(equityCurve).toBeVisible();
    
    // Take screenshot of results
    await page.screenshot({ 
      path: 'test-results/backtest-results.png',
      fullPage: true 
    });
    
    // Verify trade log has entries
    const tradeLog = page.locator('[data-testid="trade-log"] tbody tr');
    const tradeCount = await tradeLog.count();
    expect(tradeCount).toBeGreaterThan(0);
  });
});
```

### Running Playwright Tests

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/visual/chart-rendering.spec.ts

# Run with UI mode (interactive)
npx playwright test --ui

# Run and keep browser open
npx playwright test --headed

# Generate HTML report
npx playwright test --reporter=html

# View report
npx playwright show-report
```

---

## Phase 6: Performance Testing

### Chart Performance Metrics
```typescript
// Measure chart rendering time
test('chart should render in under 2 seconds', async ({ page }) => {
  const startTime = Date.now();
  
  await page.goto('http://localhost:5173/trading');
  await page.waitForSelector('canvas.tv-lightweight-charts');
  
  const endTime = Date.now();
  const renderTime = endTime - startTime;
  
  console.log(`Chart rendered in ${renderTime}ms`);
  expect(renderTime).toBeLessThan(2000);
});
```

### WebSocket Message Rate
```typescript
// Measure live update rate
test('should receive at least 1 message per second', async ({ page }) => {
  await page.goto('http://localhost:5173/trading');
  
  let messageCount = 0;
  
  page.on('websocket', ws => {
    ws.on('framereceived', event => {
      messageCount++;
    });
  });
  
  await page.waitForTimeout(10000); // Wait 10 seconds
  
  console.log(`Received ${messageCount} messages in 10 seconds`);
  expect(messageCount).toBeGreaterThan(10);
});
```

### Memory Leak Testing
```typescript
// Test for memory leaks during extended use
test('should not leak memory during 5 minutes of use', async ({ page }) => {
  await page.goto('http://localhost:5173/trading');
  
  // Get initial memory
  const initialMetrics = await page.evaluate(() => {
    return (performance as any).memory?.usedJSHeapSize;
  });
  
  // Wait 5 minutes
  await page.waitForTimeout(300000);
  
  // Get final memory
  const finalMetrics = await page.evaluate(() => {
    return (performance as any).memory?.usedJSHeapSize;
  });
  
  // Memory should not increase by more than 50MB
  const memoryIncrease = (finalMetrics - initialMetrics) / 1024 / 1024;
  console.log(`Memory increased by ${memoryIncrease.toFixed(2)} MB`);
  expect(memoryIncrease).toBeLessThan(50);
});
```

---

## Phase 7: Data Accuracy Validation

### Backtest Data Validation

#### Test Against Known Results
```typescript
// Use historical data with known outcome
test('backtest should match manual calculation', async () => {
  const backtest = new BacktestEngine();
  
  // Use specific historical date with known data
  const results = await backtest.run({
    symbol: 'SPY',
    date: '2025-10-25',
    strategy: 'simple-call-buy',
    initialCapital: 10000
  });
  
  // Manually calculated expected results
  const expected = {
    totalTrades: 3,
    netReturn: 0.045, // 4.5%
    winRate: 0.667,   // 2 wins, 1 loss
  };
  
  expect(results.totalTrades).toBe(expected.totalTrades);
  expect(results.netReturn).toBeCloseTo(expected.netReturn, 2);
  expect(results.winRate).toBeCloseTo(expected.winRate, 2);
});
```

#### Verify OHLCV Bars
```bash
# Check CSV file has correct format
head -20 /app/data/options_bars_SPY_251026_2025-10-26.csv

# Verify:
# - Symbol format matches Alpaca standard
# - Timestamps are sequential
# - OHLC values: L <= O,C <= H
# - Volume > 0
# - No negative prices
```

#### Price Sanity Checks
```typescript
test('option prices should be within realistic ranges', async () => {
  const optionsData = await fetchOptionsChain('SPY');
  
  for (const option of optionsData) {
    // Bid should be less than ask
    expect(option.bid).toBeLessThan(option.ask);
    
    // Spread should be less than 50% of price
    const spread = option.ask - option.bid;
    const midPrice = (option.bid + option.ask) / 2;
    expect(spread / midPrice).toBeLessThan(0.5);
    
    // ATM options should have delta between 0.3 and 0.7
    if (Math.abs(option.strike - underlyingPrice) < 5) {
      expect(Math.abs(option.delta)).toBeGreaterThan(0.3);
      expect(Math.abs(option.delta)).toBeLessThan(0.7);
    }
  }
});
```

---

## Phase 8: Error Handling & Edge Cases

### Test Error Scenarios

1. **Invalid Symbol**
   ```typescript
   test('should handle invalid symbol gracefully', async ({ page }) => {
     await page.goto('http://localhost:5173/trading');
     await page.fill('[data-testid="symbol-input"]', 'INVALID123');
     await page.press('[data-testid="symbol-input"]', 'Enter');
     
     // Should show error message
     const error = page.locator('[data-testid="error-message"]');
     await expect(error).toContainText('Symbol not found');
   });
   ```

2. **Network Disconnection**
   ```typescript
   test('should show disconnection message', async ({ page }) => {
     await page.goto('http://localhost:5173/trading');
     
     // Simulate network offline
     await page.context().setOffline(true);
     
     // Wait for disconnection indicator
     const wsStatus = page.locator('[data-testid="ws-status"]');
     await expect(wsStatus).toContainText('Disconnected');
     
     // Reconnect
     await page.context().setOffline(false);
     
     // Should auto-reconnect
     await expect(wsStatus).toContainText('Connected', { timeout: 10000 });
   });
   ```

3. **Empty Data Response**
   ```typescript
   test('should handle empty options chain', async ({ page }) => {
     // Test with symbol that has no options
     await page.goto('http://localhost:5173/trading');
     await page.fill('[data-testid="symbol-input"]', 'BRK.A'); // No options
     await page.press('[data-testid="symbol-input"]', 'Enter');
     
     const message = page.locator('[data-testid="no-options-message"]');
     await expect(message).toContainText('No options available');
   });
   ```

---

## Validation Checklist

### Before Each Release
- [ ] All API endpoints tested and working
- [ ] WebSocket connections stable
- [ ] Frontend renders without errors
- [ ] Live data updates working (during market hours)
- [ ] Backtesting produces accurate results
- [ ] Weekend/after-hours data displays correctly
- [ ] All Playwright tests passing
- [ ] No console errors on any page
- [ ] Performance metrics within targets
- [ ] Data accuracy validated
- [ ] Error handling tested
- [ ] Screenshots taken for visual regression

### Performance Targets
- [ ] Page load < 3 seconds
- [ ] Chart render < 2 seconds
- [ ] API response < 1 second
- [ ] WebSocket latency < 100ms
- [ ] Memory usage < 200MB after 1 hour
- [ ] CPU usage < 10% idle, < 30% during backtest

### Browser Compatibility
- [ ] Chrome/Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest) - if on Mac

---

## Test Reports

### Generate Reports
```bash
# Playwright HTML report
npx playwright test --reporter=html
npx playwright show-report

# Test coverage (if configured)
npm run test:coverage

# Screenshot comparison
npx playwright test --update-snapshots  # Update baseline
npx playwright test  # Compare against baseline
```

### Report Contents
1. Test execution summary
2. Pass/fail status for each test
3. Screenshots of UI states
4. Console logs for debugging
5. Network activity logs
6. Performance metrics
7. Error messages and stack traces

---

## Continuous Testing

### GitHub Actions Workflow (Optional)
```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Start Docker services
        run: docker-compose up -d
      
      - name: Wait for services
        run: sleep 10
      
      - name: Run Playwright tests
        run: npx playwright test
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Conclusion

This comprehensive testing plan ensures:

✅ **API endpoints** function correctly  
✅ **WebSocket connections** are stable  
✅ **Frontend components** render properly  
✅ **Data flows** work end-to-end  
✅ **Backtesting** produces accurate results  
✅ **Edge cases** handled gracefully  
✅ **Performance** meets targets  
✅ **Visual regressions** caught early  

**Follow this plan** before each release to ensure high-quality, reliable software.
