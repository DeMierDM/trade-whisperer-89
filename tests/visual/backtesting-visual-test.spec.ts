import { test, expect } from '@playwright/test';

test.describe('Backtesting Page Visual Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the backtesting page
    await page.goto('http://localhost:8080/#/backtesting');
    await page.waitForLoadState('networkidle');
  });

  test('should display backtesting page initial state', async ({ page }) => {
    // Take screenshot of initial state
    await page.screenshot({ 
      path: 'screenshots/backtesting-initial-state.png',
      fullPage: true 
    });

    // Verify page title
    const title = await page.locator('h1').textContent();
    expect(title).toContain('Backtesting');

    // Check for configuration panel
    const configPanel = page.locator('text=Configuration');
    await expect(configPanel).toBeVisible();

    // Check for strategy dropdown
    const strategySelect = page.locator('select').first();
    await expect(strategySelect).toBeVisible();
  });

  test('should show WebSocket connection status', async ({ page }) => {
    // Wait for WebSocket to connect
    await page.waitForTimeout(2000);

    // Take screenshot showing connection state
    await page.screenshot({ 
      path: 'screenshots/backtesting-websocket-status.png',
      fullPage: true 
    });

    // Check console logs for WebSocket connection
    const logs: string[] = [];
    page.on('console', msg => {
      if (msg.text().includes('WebSocket') || msg.text().includes('Connected')) {
        logs.push(msg.text());
      }
    });

    await page.waitForTimeout(1000);
    
    console.log('WebSocket related logs:', logs);
  });

  test('should display historical backtest tab with chart area', async ({ page }) => {
    // Click on Historical Backtest tab (should be default)
    const historicalTab = page.locator('button[role="tab"]', { hasText: 'Historical Backtest' });
    await historicalTab.click();
    
    await page.waitForTimeout(1000);

    // Take screenshot of historical backtest view
    await page.screenshot({ 
      path: 'screenshots/backtesting-historical-tab.png',
      fullPage: true 
    });

    // Verify chart container exists
    const chartContainer = page.locator('.h-\\[500px\\]');
    await expect(chartContainer).toBeVisible();

    // Verify configuration inputs
    await expect(page.locator('input[placeholder="SPY"]')).toBeVisible();
    await expect(page.locator('input[type="date"]').first()).toBeVisible();
  });

  test('should display paper trading tab', async ({ page }) => {
    // Click on Paper Trading tab
    const paperTab = page.locator('button[role="tab"]', { hasText: 'Live Paper Trading' });
    await paperTab.click();
    
    await page.waitForTimeout(1000);

    // Take screenshot of paper trading view
    await page.screenshot({ 
      path: 'screenshots/backtesting-paper-trading-tab.png',
      fullPage: true 
    });

    // Verify paper trading specific elements
    const liveDataBadge = page.locator('text=LIVE DATA');
    const simulatedBadge = page.locator('text=Simulated Account');
    
    // At least one should be visible
    const badgeCount = await liveDataBadge.count() + await simulatedBadge.count();
    expect(badgeCount).toBeGreaterThan(0);

    // Verify bot controls
    await expect(page.locator('text=Bot Controls')).toBeVisible();
  });

  test('should attempt to fetch historical data', async ({ page }) => {
    // Fill in the form
    await page.locator('input[placeholder="SPY"]').fill('SPY');
    await page.locator('input[type="date"]').first().fill('2025-01-16');
    await page.locator('input[type="date"]').nth(1).fill('2025-01-17');

    // Click fetch data button
    const fetchButton = page.locator('button', { hasText: 'Fetch Data & Generate Options' });
    await fetchButton.click();

    // Wait for response
    await page.waitForTimeout(3000);

    // Take screenshot after fetch attempt
    await page.screenshot({ 
      path: 'screenshots/backtesting-after-fetch-attempt.png',
      fullPage: true 
    });

    // Check for any error messages or success indicators
    const errorMessage = page.locator('text=/Error|Failed/i');
    const successMessage = page.locator('text=/loaded|success/i');

    const hasError = await errorMessage.count() > 0;
    const hasSuccess = await successMessage.count() > 0;

    console.log('Fetch result - Has error:', hasError, 'Has success:', hasSuccess);
  });

  test('should capture browser console errors', async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      } else if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page error: ${error.message}`);
    });

    // Wait for page to fully load
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ 
      path: 'screenshots/backtesting-console-state.png',
      fullPage: true 
    });

    console.log('\n=== BROWSER ERRORS ===');
    errors.forEach(err => console.log('❌', err));
    
    console.log('\n=== BROWSER WARNINGS ===');
    warnings.forEach(warn => console.log('⚠️', warn));

    // Report critical errors
    const criticalErrors = errors.filter(e => 
      !e.includes('Content-Security-Policy') && 
      !e.includes('DevTools') &&
      !e.includes('Future Flag Warning')
    );

    if (criticalErrors.length > 0) {
      console.log('\n=== CRITICAL ERRORS FOUND ===');
      criticalErrors.forEach(err => console.log('🔴', err));
    }
  });
});
