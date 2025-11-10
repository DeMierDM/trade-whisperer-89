const { test, expect } = require('@playwright/test');

const testDates = [
  { start: '2024-10-15', end: '2024-10-15', label: 'Single Day Oct 15' },
  { start: '2024-10-16', end: '2024-10-16', label: 'Single Day Oct 16' },
  { start: '2024-10-17', end: '2024-10-17', label: 'Single Day Oct 17' },
  { start: '2024-10-14', end: '2024-10-18', label: 'Multi Day Range' }
];

// Test across multiple browsers
['chromium', 'firefox', 'webkit'].forEach(browserName => {
  testDates.forEach((dateConfig, index) => {
    test.describe(`${browserName.toUpperCase()} - Data Flow for ${dateConfig.label}`, () => {
      test.use({ 
        browserName,
        viewport: { width: 1920, height: 1080 },
        video: 'on-first-retry',
        screenshot: 'only-on-failure'
      });

      test(`should complete comprehensive data flow validation`, async ({ page }) => {
        console.log(`🔄 Starting test for ${dateConfig.label} on ${browserName}`);
        
        // Navigate to the application
        await page.goto('http://localhost:8080');
        await page.waitForLoadState('networkidle');
        
        // Take initial screenshot
        await page.screenshot({ 
          path: `test-results/playwright-${browserName}-${index + 1}-01-initial.png`,
          fullPage: true 
        });

        // Navigate to backtesting
        const backestingSelector = 'a[href*="backtesting"], button:contains("Backtesting")';
        await page.locator(backestingSelector).first().click();
        await page.waitForSelector('h1:has-text("Backtesting")', { timeout: 10000 });
        
        await page.screenshot({ 
          path: `test-results/playwright-${browserName}-${index + 1}-02-backtesting-page.png`,
          fullPage: true 
        });

        // STEP 1: Configure backtest parameters
        console.log('🔧 Configuring backtest parameters');
        
        // Set strategy
        await page.selectOption('select', 'HAVWAP-Rev-v2');
        
        // Set symbol
        const symbolInput = page.locator('input[placeholder*="SPY"]');
        await symbolInput.clear();
        await symbolInput.fill('SPY');
        
        // Set dates
        const dateInputs = page.locator('input[type="date"]');
        await dateInputs.first().fill(dateConfig.start);
        await dateInputs.last().fill(dateConfig.end);
        
        // Set timeframe
        const selectElements = page.locator('select');
        await selectElements.nth(1).selectOption('1Min');
        
        await page.screenshot({ 
          path: `test-results/playwright-${browserName}-${index + 1}-03-configured.png`,
          fullPage: true 
        });

        // STEP 2: Fetch data with comprehensive validation
        console.log('📊 Fetching historical data');
        
        // Click fetch data
        await page.locator('button:has-text("Fetch Data")').click();
        
        // Wait for fetching state
        await expect(page.locator('button:has-text("Fetching")')).toBeVisible({ timeout: 5000 });
        
        await page.screenshot({ 
          path: `test-results/playwright-${browserName}-${index + 1}-04-fetching.png`,
          fullPage: true 
        });
        
        // Wait for stock data completion
        await expect(page.locator('div:has-text("Stock Data Ready")')).toBeVisible({ timeout: 45000 });
        
        await page.screenshot({ 
          path: `test-results/playwright-${browserName}-${index + 1}-05-stock-loaded.png`,
          fullPage: true 
        });
        
        // Validate stock data metrics
        await expect(page.locator('div:has-text("Total Bars")')).toBeVisible();
        await expect(page.locator('div:has-text("First Price")')).toBeVisible();
        await expect(page.locator('div:has-text("Last Price")')).toBeVisible();
        
        // Check that bars count is reasonable
        const barsText = await page.locator('div:has-text("Total Bars")').textContent();
        const barsMatch = barsText.match(/(\d+)/);
        if (barsMatch) {
          const barsCount = parseInt(barsMatch[1]);
          expect(barsCount).toBeGreaterThan(0);
          console.log(`📈 Stock data loaded: ${barsCount} bars`);
        }
        
        // Wait for options data completion
        await expect(page.locator('div:has-text("Options Ready")')).toBeVisible({ timeout: 90000 });
        
        await page.screenshot({ 
          path: `test-results/playwright-${browserName}-${index + 1}-06-options-loaded.png`,
          fullPage: true 
        });
        
        // Validate options data
        await expect(page.locator('div:has-text("Options Contracts")')).toBeVisible();
        
        // Check options count
        const optionsText = await page.locator('div:has-text("Total Contracts")').textContent();
        const optionsMatch = optionsText.match(/(\d+)/);
        if (optionsMatch) {
          const optionsCount = parseInt(optionsMatch[1]);
          expect(optionsCount).toBeGreaterThan(0);
          console.log(`📋 Options data loaded: ${optionsCount} contracts`);
        }

        // STEP 3: Verify chart initialization
        console.log('📈 Verifying chart visualization');
        
        await expect(page.locator('div:has-text("TradingView")')).toBeVisible();
        await expect(page.locator('div:has-text("Initialized: ✅")')).toBeVisible();
        
        await page.screenshot({ 
          path: `test-results/playwright-${browserName}-${index + 1}-07-chart-ready.png`,
          fullPage: true 
        });

        // STEP 4: Run backtest
        console.log('⚡ Running backtest');
        
        await page.locator('button:has-text("Run Backtest")').click();
        
        // Wait for running state
        await expect(page.locator('button:has-text("Running")')).toBeVisible({ timeout: 10000 });
        
        await page.screenshot({ 
          path: `test-results/playwright-${browserName}-${index + 1}-08-running.png`,
          fullPage: true 
        });
        
        // Wait for backtest completion (extended timeout)
        await expect(page.locator('div:has-text("Total Return")')).toBeVisible({ timeout: 180000 });
        
        await page.screenshot({ 
          path: `test-results/playwright-${browserName}-${index + 1}-09-complete.png`,
          fullPage: true 
        });

        // STEP 5: Comprehensive results validation
        console.log('✅ Validating backtest results');
        
        // Check all expected metrics are visible
        const requiredMetrics = [
          'Total Return',
          'Sharpe Ratio', 
          'Max Drawdown',
          'Win Rate',
          'Total Trades'
        ];
        
        for (const metric of requiredMetrics) {
          await expect(page.locator(`div:has-text("${metric}")`)).toBeVisible();
        }
        
        // Check equity curve
        await expect(page.locator('div:has-text("Equity Curve")')).toBeVisible();
        
        // Check trade history
        await expect(page.locator('h3:has-text("Trade History")')).toBeVisible();
        
        // Validate metric values are not NaN or empty
        const totalTradesText = await page.locator('div:has-text("Total Trades")').textContent();
        expect(totalTradesText).not.toContain('NaN');
        expect(totalTradesText).not.toContain('undefined');
        
        await page.screenshot({ 
          path: `test-results/playwright-${browserName}-${index + 1}-10-final.png`,
          fullPage: true 
        });

        // STEP 6: Performance validation
        console.log('⚡ Performance validation');
        
        // Check that page is responsive
        const startTime = Date.now();
        await page.locator('button:has-text("Run Backtest")').hover();
        const endTime = Date.now();
        expect(endTime - startTime).toBeLessThan(1000); // Should be responsive
        
        console.log(`✅ Complete data flow validated successfully for ${dateConfig.label} on ${browserName}`);
      });
    });
  });
});

// Cross-browser comparison test
test.describe('Cross-Browser Screenshot Comparison', () => {
  test('should produce consistent results across browsers', async ({ page }) => {
    // This test will be used to compare screenshots across browsers
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    // Navigate to backtesting
    await page.locator('a[href*="backtesting"], button:contains("Backtesting")').first().click();
    await page.waitForSelector('h1:has-text("Backtesting")');
    
    // Configure and run a simple test
    await page.selectOption('select', 'HAVWAP-Rev-v2');
    await page.locator('input[type="date"]').first().fill('2024-10-15');
    await page.locator('input[type="date"]').last().fill('2024-10-15');
    
    await page.locator('button:has-text("Fetch Data")').click();
    await expect(page.locator('div:has-text("Stock Data Ready")')).toBeVisible({ timeout: 45000 });
    
    // Take comparison screenshot
    await page.screenshot({ 
      path: 'test-results/cross-browser-comparison.png',
      fullPage: true 
    });
  });
});

// Error handling validation
test.describe('Error Handling Validation', () => {
  test('should handle invalid date ranges gracefully', async ({ page }) => {
    await page.goto('http://localhost:8080');
    await page.waitForLoadState('networkidle');
    
    await page.locator('a[href*="backtesting"], button:contains("Backtesting")').first().click();
    await page.waitForSelector('h1:has-text("Backtesting")');
    
    // Try invalid date range (weekend)
    await page.locator('input[type="date"]').first().fill('2024-01-06'); // Saturday
    await page.locator('input[type="date"]').last().fill('2024-01-07'); // Sunday
    
    await page.locator('button:has-text("Fetch Data")').click();
    
    // Should show error or no data message
    await expect(
      page.locator('div:has-text("error"), div:has-text("No data"), div:has-text("failed")')
    ).toBeVisible({ timeout: 30000 });
    
    await page.screenshot({ 
      path: 'test-results/error-handling-validation.png',
      fullPage: true 
    });
  });
});