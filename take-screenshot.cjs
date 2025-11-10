const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  console.log('🚀 Starting screenshot capture...');
  
  // Ensure screenshots directory exists
  const screenshotsDir = path.join(__dirname, 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Capture console logs
  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    logs.push(text);
    if (text.includes('WebSocket') || text.includes('chart') || text.includes('ERROR')) {
      console.log(`[BROWSER] ${msg.type()}: ${text}`);
    }
  });

  page.on('pageerror', error => {
    console.error(`[PAGE ERROR] ${error.message}`);
  });

  try {
    console.log('📍 Navigating to Backtesting page...');
    await page.goto('http://localhost:8080/#/backtesting', { waitUntil: 'networkidle' });
    
    console.log('⏳ Waiting for page to settle...');
    await page.waitForTimeout(2000);

    // Screenshot 1: Initial state
    console.log('📸 Screenshot 1: Initial state');
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-backtesting-initial-state.png'),
      fullPage: true 
    });

    // Screenshot 2: Configuration panel closeup
    console.log('📸 Screenshot 2: Configuration panel');
    const configPanel = page.locator('text=Configuration').locator('..');
    if (await configPanel.count() > 0) {
      await configPanel.screenshot({ 
        path: path.join(screenshotsDir, '02-configuration-panel.png')
      });
    }

    // Screenshot 3: Paper Trading tab
    console.log('📸 Screenshot 3: Switching to Paper Trading tab');
    const paperTab = page.locator('button[role="tab"]', { hasText: 'Live Paper Trading' });
    if (await paperTab.count() > 0) {
      await paperTab.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ 
        path: path.join(screenshotsDir, '03-paper-trading-tab.png'),
        fullPage: true 
      });
    }

    // Screenshot 4: Back to Historical Backtest
    console.log('📸 Screenshot 4: Historical Backtest tab');
    const historicalTab = page.locator('button[role="tab"]', { hasText: 'Historical Backtest' });
    if (await historicalTab.count() > 0) {
      await historicalTab.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ 
        path: path.join(screenshotsDir, '04-historical-backtest-tab.png'),
        fullPage: true 
      });
    }

    // Screenshot 5: Chart area closeup
    console.log('📸 Screenshot 5: Chart area');
    const chartArea = page.locator('.h-\\[500px\\]').first();
    if (await chartArea.count() > 0) {
      await chartArea.screenshot({ 
        path: path.join(screenshotsDir, '05-chart-area.png')
      });
    }

    // Screenshot 6: Fill form and attempt fetch
    console.log('📸 Screenshot 6: Filling form...');
    await page.locator('input[placeholder="SPY"]').fill('SPY');
    await page.locator('input[type="date"]').first().fill('2025-01-16');
    await page.locator('input[type="date"]').nth(1).fill('2025-01-17');
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, '06-form-filled.png'),
      fullPage: true 
    });

    // Screenshot 7: After clicking fetch
    console.log('📸 Screenshot 7: Clicking fetch button...');
    const fetchButton = page.locator('button', { hasText: 'Fetch Data & Generate Options' });
    if (await fetchButton.count() > 0) {
      await fetchButton.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ 
        path: path.join(screenshotsDir, '07-after-fetch-attempt.png'),
        fullPage: true 
      });
    }

    console.log('\n✅ Screenshots saved to:', screenshotsDir);
    console.log('\n📊 Summary of browser logs:');
    console.log('  Total logs:', logs.length);
    console.log('  WebSocket logs:', logs.filter(l => l.includes('WebSocket')).length);
    console.log('  Chart logs:', logs.filter(l => l.includes('chart') || l.includes('CHART')).length);
    console.log('  Error logs:', logs.filter(l => l.includes('Error') || l.includes('ERROR')).length);

    // Check for critical issues
    const criticalErrors = logs.filter(l => 
      l.includes('is not a function') || 
      l.includes('Cannot read') ||
      l.includes('TypeError') ||
      l.includes('ReferenceError')
    );

    if (criticalErrors.length > 0) {
      console.log('\n🔴 CRITICAL ERRORS FOUND:');
      criticalErrors.forEach(err => console.log('  -', err));
    }

  } catch (error) {
    console.error('❌ Error during screenshot capture:', error);
  } finally {
    await browser.close();
    console.log('\n✨ Done!');
  }
})();
