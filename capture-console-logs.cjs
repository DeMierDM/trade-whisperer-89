#!/usr/bin/env node

/**
 * Browser Console Log Capture
 * Check if auto-loading is working by monitoring console logs
 */

const { chromium } = require('playwright');

async function captureConsoleLogs() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('🔍 Monitoring console logs for auto-loading behavior...\n');

    // Capture console logs with timestamps
    page.on('console', msg => {
      const timestamp = new Date().toISOString().split('T')[1].slice(0,12);
      const text = msg.text();
      
      // Filter for auto-loading related logs
      if (text.includes('[TRADING]') || 
          text.includes('[FETCH]') || 
          text.includes('[BUS-FETCH]') ||
          text.includes('[DATA FLOW]') ||
          text.includes('AUTO-LOADING') ||
          text.includes('fetchHistoricalBars') ||
          text.includes('837 bars') ||
          text.includes('useEffect')) {
        console.log(`⏰ ${timestamp} ${text}`);
      }
    });

    // Capture network requests
    page.on('response', response => {
      const url = response.url();
      if (url.includes('historical-bars') || url.includes('fetch-market-data')) {
        const timestamp = new Date().toISOString().split('T')[1].slice(0,12);
        console.log(`🌐 ${timestamp} Network: ${response.status()} ${url}`);
      }
    });

    // Navigate to trading page
    console.log('📖 Navigating to http://localhost:8081/trading...');
    await page.goto('http://localhost:8081/trading');

    console.log('✅ Page loaded - waiting for auto-loading logs...');

    // Wait for auto-loading to happen (or timeout)
    await page.waitForTimeout(10000);

    // Check if chart has data
    const chartExists = await page.$('canvas');
    console.log(chartExists ? '✅ Chart canvas exists' : '❌ No chart canvas found');

    // Check for any error messages
    const errorElements = await page.$$('[role="alert"], .error, [class*="error"]');
    if (errorElements.length > 0) {
      console.log(`⚠️  Found ${errorElements.length} error elements`);
    }

    // Take a screenshot
    await page.screenshot({ 
      path: 'auto-loading-console-test.png',
      fullPage: true 
    });
    console.log('\n📸 Screenshot saved as auto-loading-console-test.png');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    console.log('\n🏁 Console capture completed');
    await browser.close();
  }
}

captureConsoleLogs().catch(console.error);