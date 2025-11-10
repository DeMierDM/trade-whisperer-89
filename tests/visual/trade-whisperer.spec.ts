import { test, expect } from '@playwright/test';

/**
 * Trade Whisperer Visual Testing Suite
 * Tests critical user flows with screenshot validation
 */

test.describe('Trade Whisperer Critical User Flows', () => {
  
  test.beforeEach(async ({ page }) => {
    // Wait for both servers to be ready
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait for any initial API calls to complete
    await page.waitForTimeout(2000);
  });

  test('Landing Page Load and Navigation', async ({ page }) => {
    // Test home page loads correctly
    await expect(page).toHaveTitle(/Trade Whisperer/);
    
    // Take screenshot of initial state
    await expect(page).toHaveScreenshot('01-landing-page.png');
    
    // Test navigation menu
    const navigation = page.locator('nav');
    await expect(navigation).toBeVisible();
    
    // Test each navigation item
    const navItems = ['Trading', 'Backtesting', 'History', 'Diagnostics'];
    
    for (const item of navItems) {
      await page.click(`text=${item}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      // Take screenshot of each page
      const filename = `02-nav-${item.toLowerCase()}.png`;
      await expect(page).toHaveScreenshot(filename);
    }
  });

  test('API Diagnostics Functionality', async ({ page }) => {
    await page.goto('/diagnostics');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot before running diagnostics
    await expect(page).toHaveScreenshot('03-diagnostics-initial.png');
    
    // Look for API test buttons or run diagnostics
    const runButton = page.locator('button:has-text("Run"), button:has-text("Test"), button:has-text("Check")').first();
    
    if (await runButton.isVisible()) {
      await runButton.click();
      await page.waitForTimeout(5000); // Wait for API calls
      
      // Take screenshot after running diagnostics
      await expect(page).toHaveScreenshot('04-diagnostics-results.png');
    }
  });

  test('Trading Interface and WebSocket Connection', async ({ page }) => {
    await page.goto('/trading');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of trading interface
    await expect(page).toHaveScreenshot('05-trading-interface.png');
    
    // Test symbol input
    const symbolInput = page.locator('input[placeholder*="symbol"], input[placeholder*="Symbol"], input[type="text"]').first();
    
    if (await symbolInput.isVisible()) {
      await symbolInput.fill('SPY');
      await page.waitForTimeout(2000);
      
      // Look for data loading
      await expect(page).toHaveScreenshot('06-trading-with-symbol.png');
    }
    
    // Check for WebSocket connection indicators
    const connectionStatus = page.locator('text=Connected, text=Online, .connection-status, .ws-status').first();
    if (await connectionStatus.isVisible()) {
      await expect(page).toHaveScreenshot('07-websocket-status.png');
    }
  });

  test('Backtesting Interface and Historical Data', async ({ page }) => {
    await page.goto('/backtesting');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of backtesting interface
    await expect(page).toHaveScreenshot('08-backtesting-interface.png');
    
    // Test backtesting form inputs
    const inputs = page.locator('input[type="text"], input[type="date"], input[type="number"]');
    const inputCount = await inputs.count();
    
    if (inputCount > 0) {
      // Fill first few inputs with test data
      await inputs.nth(0).fill('SPY');
      if (inputCount > 1) {
        await inputs.nth(1).fill('2024-01-01');
      }
      
      await page.waitForTimeout(1000);
      await expect(page).toHaveScreenshot('09-backtesting-with-data.png');
    }
    
    // Look for run backtest button
    const runBacktestButton = page.locator('button:has-text("Run"), button:has-text("Start"), button:has-text("Backtest")').first();
    
    if (await runBacktestButton.isVisible()) {
      await runBacktestButton.click();
      await page.waitForTimeout(5000);
      
      // Take screenshot of backtest results
      await expect(page).toHaveScreenshot('10-backtesting-results.png');
    }
  });

  test('History and Trade Data Display', async ({ page }) => {
    await page.goto('/history');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of history interface
    await expect(page).toHaveScreenshot('11-history-interface.png');
    
    // Wait for potential data loading
    await page.waitForTimeout(3000);
    
    // Take screenshot after data loading
    await expect(page).toHaveScreenshot('12-history-with-data.png');
    
    // Test search/filter functionality
    const searchInput = page.locator('input[placeholder*="search"], input[placeholder*="filter"]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('SPY');
      await page.waitForTimeout(1000);
      
      await expect(page).toHaveScreenshot('13-history-filtered.png');
    }
  });

  test('Options Data and DTE Logic Verification', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to options-related functionality
    await page.goto('/trading');
    await page.waitForLoadState('networkidle');
    
    // Look for options-specific elements
    const optionsElements = page.locator('text=0DTE, text=1DTE, text=Option, text=Strike, text=Call, text=Put');
    const elementCount = await optionsElements.count();
    
    if (elementCount > 0) {
      await expect(page).toHaveScreenshot('14-options-interface.png');
      
      // Test options data loading
      await page.waitForTimeout(5000);
      await expect(page).toHaveScreenshot('15-options-with-data.png');
    }
  });

  test('Weekend Data Handling Verification', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for weekend data indicators
    const dataTimestamp = page.locator('text*="Last updated", text*="Data as of", .timestamp, .data-age').first();
    
    if (await dataTimestamp.isVisible()) {
      await expect(page).toHaveScreenshot('16-weekend-data-timestamp.png');
    }
    
    // Navigate through different sections to check data freshness
    const pages = ['/trading', '/backtesting', '/history'];
    
    for (const path of pages) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      const filename = `17-weekend-data-${path.replace('/', '')}.png`;
      await expect(page).toHaveScreenshot(filename);
    }
  });

  test('Mobile Responsiveness Check', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('18-mobile-home.png');
    
    // Test navigation on mobile
    const mobileNav = page.locator('button:has-text("Menu"), .mobile-menu, .hamburger').first();
    
    if (await mobileNav.isVisible()) {
      await mobileNav.click();
      await page.waitForTimeout(500);
      
      await expect(page).toHaveScreenshot('19-mobile-menu-open.png');
    }
    
    // Test key mobile interactions
    await page.goto('/trading');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('20-mobile-trading.png');
  });

  test('Error Handling and Edge Cases', async ({ page }) => {
    // Test error states
    await page.goto('/diagnostics');
    await page.waitForLoadState('networkidle');
    
    // Simulate offline state if possible
    await page.context().setOffline(true);
    await page.reload();
    await page.waitForTimeout(3000);
    
    await expect(page).toHaveScreenshot('21-offline-state.png');
    
    // Restore online state
    await page.context().setOffline(false);
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    await expect(page).toHaveScreenshot('22-online-restored.png');
  });
});