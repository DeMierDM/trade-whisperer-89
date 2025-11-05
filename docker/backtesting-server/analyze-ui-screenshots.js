/**
 * Visual Screenshot Analyzer
 * Uses Playwright to examine screenshots and understand why UI isn't displaying results
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function analyzeScreenshots() {
  console.log('\n' + '='.repeat(80));
  console.log('VISUAL SCREENSHOT ANALYSIS');
  console.log('='.repeat(80));

  const screenshotDir = path.join(__dirname, 'screenshots/debug-backtest-verification');
  
  if (!fs.existsSync(screenshotDir)) {
    console.error('❌ Screenshot directory not found:', screenshotDir);
    return;
  }

  const screenshots = [
    '01-form-filled.png',
    '02-after-click.png', 
    '03-final-results.png'
  ];

  console.log('\n📸 Found screenshots:');
  screenshots.forEach(s => {
    const exists = fs.existsSync(path.join(screenshotDir, s));
    console.log(`  ${exists ? '✅' : '❌'} ${s}`);
  });

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Load the application
  console.log('\n📍 Loading application to inspect actual state...');
  await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });

  // Navigate to backtesting tab
  console.log('📍 Navigating to Backtesting tab...');
  await page.click('button:has-text("Backtesting")');
  await page.waitForTimeout(1000);

  // Fill the form with same test data
  console.log('📍 Filling form with test data...');
  await page.selectOption('select[name="strategy"]', 'HAVWAP-Rev-v2');
  await page.fill('input[name="symbol"]', 'SPY');
  await page.fill('input[name="startDate"]', '2024-10-10');
  await page.fill('input[name="endDate"]', '2024-10-10');
  await page.fill('input[name="initialCapital"]', '100000');

  // Click run and wait
  console.log('📍 Clicking Run Backtest...');
  await page.click('button:has-text("Run Backtest")');

  // Wait for loading to finish (check for results or error)
  console.log('📍 Waiting for results or timeout (60s)...');
  
  let resultsFound = false;
  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts && !resultsFound) {
    await page.waitForTimeout(3000);
    attempts++;

    // Check for various result indicators
    const hasResultsHeading = await page.locator('h2:has-text("Backtest Results"), h3:has-text("Results")').count() > 0;
    const hasMetricsCards = await page.locator('[class*="card"], [class*="metric"]').count() > 0;
    const hasTable = await page.locator('table').count() > 0;
    const hasTradeData = await page.locator('text=/Total Return|Sharpe Ratio|Win Rate/').count() > 0;

    console.log(`\n[Attempt ${attempts}/${maxAttempts}]`);
    console.log(`  Results Heading: ${hasResultsHeading ? '✅' : '❌'}`);
    console.log(`  Metrics Cards: ${hasMetricsCards ? '✅' : '❌'}`);
    console.log(`  Table Present: ${hasTable ? '✅' : '❌'}`);
    console.log(`  Trade Data: ${hasTradeData ? '✅' : '❌'}`);

    if (hasResultsHeading || hasMetricsCards || hasTable || hasTradeData) {
      resultsFound = true;
      console.log('✅ RESULTS DETECTED');
    }
  }

  // Take detailed screenshots of current state
  console.log('\n📸 Taking detailed diagnostic screenshots...');
  await page.screenshot({ path: path.join(screenshotDir, 'diagnostic-full-page.png'), fullPage: true });
  
  // Get page content and console logs
  console.log('\n📄 ANALYZING PAGE CONTENT:');
  console.log('-'.repeat(80));

  // Check for loading states
  const loadingElements = await page.locator('[class*="loading"], [class*="spinner"], text=/Loading|Running/').count();
  console.log(`Loading indicators: ${loadingElements}`);

  // Check for error messages
  const errorElements = await page.locator('[class*="error"], [role="alert"], text=/Error|Failed/').count();
  console.log(`Error messages: ${errorElements}`);

  // Check for results container
  const resultsContainers = await page.locator('[class*="results"], [class*="backtest"]').count();
  console.log(`Results containers: ${resultsContainers}`);

  // Get all visible text to see what's actually on screen
  const bodyText = await page.locator('body').textContent();
  const hasBacktestText = bodyText.includes('Backtest') || bodyText.includes('Results');
  console.log(`Contains backtest/results text: ${hasBacktestText ? '✅' : '❌'}`);

  // Check React component state via console
  console.log('\n🔍 CHECKING REACT STATE:');
  console.log('-'.repeat(80));

  const reactState = await page.evaluate(() => {
    // Try to find React root
    const root = document.getElementById('root');
    if (!root) return { error: 'No root element found' };

    // Check for result data in DOM
    const resultsElements = Array.from(document.querySelectorAll('[class*="results"], [class*="backtest"], [class*="metric"]'));
    
    return {
      rootExists: !!root,
      resultsElements: resultsElements.length,
      visibleText: document.body.innerText.substring(0, 500),
      forms: document.querySelectorAll('form').length,
      tables: document.querySelectorAll('table').length,
      buttons: document.querySelectorAll('button').length
    };
  });

  console.log('React State:', JSON.stringify(reactState, null, 2));

  // Check network requests
  console.log('\n🌐 CHECKING NETWORK ACTIVITY:');
  console.log('-'.repeat(80));

  // Listen for API calls
  const apiCalls = [];
  page.on('response', response => {
    const url = response.url();
    if (url.includes('/api/backtest')) {
      apiCalls.push({
        url,
        status: response.status(),
        timestamp: new Date().toISOString()
      });
    }
  });

  // Trigger a fresh backtest to watch network
  console.log('🔄 Triggering fresh backtest to monitor network...');
  await page.fill('input[name="initialCapital"]', '50000');
  await page.click('button:has-text("Run Backtest")');
  await page.waitForTimeout(5000);

  console.log(`API Calls detected: ${apiCalls.length}`);
  apiCalls.forEach(call => {
    console.log(`  ${call.status} ${call.url}`);
  });

  // Final comprehensive screenshot
  await page.screenshot({ path: path.join(screenshotDir, 'diagnostic-after-fresh-run.png'), fullPage: true });

  console.log('\n' + '='.repeat(80));
  console.log('DIAGNOSIS COMPLETE');
  console.log('='.repeat(80));
  console.log(`\n📸 Screenshots saved to: ${screenshotDir}`);
  console.log('  - diagnostic-full-page.png');
  console.log('  - diagnostic-after-fresh-run.png');
  
  console.log('\n⏸️  Browser will remain open for 30 seconds for manual inspection...');
  await page.waitForTimeout(30000);

  await browser.close();
}

analyzeScreenshots().catch(console.error);
