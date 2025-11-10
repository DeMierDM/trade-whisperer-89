/**
 * E2E Test: Backtest Trade History Data Flow
 * 
 * Purpose: Verify that real trade data flows from backend to frontend
 * Tests:
 * 1. Backend generates real trades with actual prices/P&L
 * 2. API returns trades with complete data
 * 3. Frontend displays trades correctly in UI
 * 4. All trade fields are populated (no zeros/empty strings)
 */

import { test, expect } from '@playwright/test';

test.describe('Backtest Trade History - Data Flow Verification', () => {
  const BACKTESTING_API = 'http://localhost:3002/api';
  const FRONTEND_URL = 'http://localhost:8080';

  test('Backend API returns real trade data with proper field mapping', async ({ request }) => {
    // Step 1: Run backtest via API
    const backtestResponse = await request.post(`${BACKTESTING_API}/run-backtest`, {
      data: {
        strategies: ['RSI ROC VWAP Confluence'],
        startDate: '2025-10-10',
        endDate: '2025-10-10',
        ticker: 'SPY',
        initialCapital: 100000
      }
    });

    expect(backtestResponse.ok()).toBeTruthy();
    const backtestData = await backtestResponse.json();
    
    // Verify backtest succeeded
    expect(backtestData.success).toBe(true);
    expect(backtestData.backtestId).toBeTruthy();
    expect(backtestData.backtest.results.totalTrades).toBeGreaterThan(0);
    
    console.log(`✅ Backtest completed: ID=${backtestData.backtestId}, Trades=${backtestData.backtest.results.totalTrades}`);

    // Step 2: Fetch trades for this backtest
    const tradesResponse = await request.get(`${BACKTESTING_API}/backtest/${backtestData.backtestId}/trades`);
    expect(tradesResponse.ok()).toBeTruthy();
    
    const tradesData = await tradesResponse.json();
    expect(tradesData.success).toBe(true);
    expect(tradesData.trades).toBeInstanceOf(Array);
    expect(tradesData.trades.length).toBeGreaterThan(0);
    
    console.log(`✅ Retrieved ${tradesData.trades.length} trades from persistent storage`);

    // Step 3: Verify first trade has REAL data (not placeholder/mock)
    const firstTrade = tradesData.trades[0];
    
    // CRITICAL VALIDATIONS - These must all pass for real data
    expect(firstTrade.openPrice).not.toBe(0);  // Must have real entry price
    expect(firstTrade.closePrice).not.toBe(0); // Must have real exit price
    expect(firstTrade.openTime).not.toBe('');  // Must have real timestamp
    expect(firstTrade.closeTime).not.toBe(''); // Must have real exit time
    expect(firstTrade.contract).not.toContain('[object Object]'); // Must be actual symbol, not stringified object
    expect(firstTrade.contract).toMatch(/SPY\d{6}[CP]\d{8}/); // Must match options contract format
    
    console.log(`✅ First trade validation passed:`, {
      contract: firstTrade.contract,
      openPrice: firstTrade.openPrice,
      closePrice: firstTrade.closePrice,
      pnl: firstTrade.pnl,
      reason: firstTrade.reason
    });

    // Step 4: Verify data quality across multiple trades
    const tradesWithRealData = tradesData.trades.filter(t => 
      t.openPrice !== 0 && 
      t.closePrice !== 0 && 
      t.openTime !== '' &&
      !t.contract.includes('[object Object]')
    );

    const dataQualityPercentage = (tradesWithRealData.length / tradesData.trades.length) * 100;
    
    expect(dataQualityPercentage).toBeGreaterThan(95); // At least 95% of trades must have real data
    console.log(`✅ Data quality: ${dataQualityPercentage.toFixed(1)}% of trades have complete real data`);

    // Step 5: Verify P&L calculations are realistic
    const avgPnL = tradesData.trades.reduce((sum, t) => sum + t.pnl, 0) / tradesData.trades.length;
    const maxPnL = Math.max(...tradesData.trades.map(t => t.pnl));
    const minPnL = Math.min(...tradesData.trades.map(t => t.pnl));
    
    console.log(`✅ P&L statistics:`, {
      avgPnL: avgPnL.toFixed(2),
      maxPnL: maxPnL.toFixed(2),
      minPnL: minPnL.toFixed(2),
      range: (maxPnL - minPnL).toFixed(2)
    });

    // Verify P&L values are realistic (not all same value)
    expect(maxPnL).not.toBe(minPnL); // Should have variation in P&L
    expect(Math.abs(avgPnL)).toBeGreaterThan(0); // Average P&L should not be exactly 0
  });

  test('Frontend displays real trade data correctly', async ({ page }) => {
    // Step 1: Navigate to backtesting page
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');
    
    // Find and click Backtesting link
    await page.click('text=Backtesting');
    await page.waitForURL(/.*backtesting/);
    
    console.log('✅ Navigated to Backtesting page');

    // Step 2: Configure backtest
    await page.selectOption('select', 'RSI ROC VWAP Confluence');
    await page.fill('input[value="SPY"]', 'SPY');
    
    // Set dates
    const dateInputs = await page.locator('input[type="date"]').all();
    await dateInputs[0].fill('2025-10-10');
    await dateInputs[1].fill('2025-10-10');
    
    console.log('✅ Configured backtest parameters');

    // Step 3: Fetch data
    await page.click('button:has-text("Fetch Data")');
    
    // Wait for stock data to load
    await page.waitForSelector('text=Stock Data Ready', { timeout: 30000 });
    console.log('✅ Stock data loaded');

    // Step 4: Run backtest
    await page.click('button:has-text("Run Backtest")');
    
    // Wait for backtest completion (look for results)
    await page.waitForSelector('text=Total Trades', { timeout: 60000 });
    console.log('✅ Backtest completed');

    // Step 5: Verify trade history is displayed with real data
    const tradeRows = await page.locator('[class*="grid"][class*="cols-8"]:has-text("$")').all();
    
    expect(tradeRows.length).toBeGreaterThan(0);
    console.log(`✅ Found ${tradeRows.length} trade rows in UI`);

    // Step 6: Verify first trade has real data
    const firstTradeRow = tradeRows[0];
    const tradeText = await firstTradeRow.textContent();
    
    // Verify trade contains real contract symbol (SPY options format)
    expect(tradeText).toMatch(/SPY\d{6}[CP]/);
    
    // Verify trade contains real prices (dollar amounts with cents)
    expect(tradeText).toMatch(/\$\d+\.\d{2}/);
    
    // Verify trade contains real timestamps
    expect(tradeText).toMatch(/\d{1,2}:\d{2}/); // Time format
    
    console.log(`✅ First trade displays real data:`, tradeText?.substring(0, 100));

    // Step 7: Verify metrics are realistic
    const winRate = await page.locator('text=Win Rate').locator('..').locator('p').nth(1).textContent();
    const totalPnL = await page.locator('text=Total P&L').locator('..').locator('p').nth(1).textContent();
    
    console.log(`✅ Metrics displayed:`, { winRate, totalPnL });
    
    // Win rate should not be 0% or 100% for realistic data
    const winRateValue = parseFloat(winRate || '0');
    expect(winRateValue).toBeGreaterThan(0);
    expect(winRateValue).toBeLessThan(100);
  });

  test('Trade data roundtrip: Backend → API → Frontend consistency', async ({ page, request }) => {
    // Step 1: Run backtest via API and capture data
    const backtestResponse = await request.post(`${BACKTESTING_API}/run-backtest`, {
      data: {
        strategies: ['RSI ROC VWAP Confluence'],
        startDate: '2025-10-10',
        endDate: '2025-10-10',
        ticker: 'SPY',
        initialCapital: 100000
      }
    });

    const backtestData = await backtestResponse.json();
    const backtestId = backtestData.backtestId;

    // Fetch trades via API
    const tradesResponse = await request.get(`${BACKTESTING_API}/backtest/${backtestId}/trades`);
    const apiTrades = (await tradesResponse.json()).trades;
    
    console.log(`✅ API returned ${apiTrades.length} trades`);

    // Step 2: Load same backtest in frontend
    await page.goto(`${FRONTEND_URL}/backtesting`);
    await page.waitForLoadState('networkidle');

    // Manually load backtest by ID (if this endpoint exists)
    // For now, we'll run a fresh backtest and compare counts
    
    // Configure and run backtest in UI
    await page.selectOption('select', 'RSI ROC VWAP Confluence');
    const dateInputs = await page.locator('input[type="date"]').all();
    await dateInputs[0].fill('2025-10-10');
    await dateInputs[1].fill('2025-10-10');
    
    await page.click('button:has-text("Fetch Data")');
    await page.waitForSelector('text=Stock Data Ready', { timeout: 30000 });
    
    await page.click('button:has-text("Run Backtest")');
    await page.waitForSelector('text=Total Trades', { timeout: 60000 });

    // Step 3: Verify trade count matches between API and UI
    const uiTradeCount = await page.locator('text=Total Trades').locator('..').locator('p').nth(1).textContent();
    const uiCount = parseInt(uiTradeCount || '0');

    // Counts should be similar (exact match if deterministic)
    expect(Math.abs(uiCount - apiTrades.length)).toBeLessThan(10); // Allow small variance
    
    console.log(`✅ Trade count consistency: API=${apiTrades.length}, UI=${uiCount}`);
  });
});
