/**
 * ROBUST UI TEST WITH ERROR HANDLING
 * Takes screenshots even when React crashes to show exactly what's happening
 */

const { chromium } = require('playwright');

async function robustUITest() {
  console.log('\n🎯 ROBUST UI TEST - WITH ERROR RECOVERY\n');

  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000 // Extra slow to see everything
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();

  // Track errors but don't stop
  const errors = [];
  page.on('console', msg => {
    const text = msg.text();
    console.log(`[BROWSER ${msg.type()}]`, text);
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });

  page.on('pageerror', error => {
    console.log(`[PAGE ERROR]`, error.message);
    errors.push(`PAGE ERROR: ${error.message}`);
  });

  try {
    // Step 1: Load app
    console.log('1️⃣  Loading application...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 10000 });
    await page.screenshot({ path: 'audit-1-app-loaded.png', fullPage: true });
    console.log('   📸 audit-1-app-loaded.png');

    // Step 2: Navigate to Backtesting
    console.log('\n2️⃣  Clicking Backtesting tab...');
    await page.click('text=Backtesting');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'audit-2-backtest-tab.png', fullPage: true });
    console.log('   📸 audit-2-backtest-tab.png');

    // Step 3: Fill form with error recovery
    console.log('\n3️⃣  Filling form (with error recovery)...');
    try {
      await page.selectOption('select', 'HAVWAP-Rev-v2');
      await page.fill('input[name="symbol"]', 'SPY');
      await page.fill('input[name="startDate"]', '2024-10-10');
      await page.fill('input[name="endDate"]', '2024-10-10');
      await page.fill('input[name="initialCapital"]', '100000');
      console.log('   ✅ Form filled successfully');
    } catch (error) {
      console.log('   ⚠️  Form filling error:', error.message);
      errors.push(`Form filling: ${error.message}`);
    }
    await page.screenshot({ path: 'audit-3-form-filled.png', fullPage: true });
    console.log('   📸 audit-3-form-filled.png');

    // Step 4: Click Run Backtest
    console.log('\n4️⃣  Clicking Run Backtest...');
    try {
      await page.click('button:has-text("Run Backtest")');
      console.log('   ✅ Button clicked');
    } catch (error) {
      console.log('   ⚠️  Button click error:', error.message);
      errors.push(`Button click: ${error.message}`);
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'audit-4-after-button-click.png', fullPage: true });
    console.log('   📸 audit-4-after-button-click.png');

    // Step 5: Monitor for 30 seconds (take screenshots every 5 seconds)
    console.log('\n5️⃣  Monitoring for 30 seconds (5s intervals)...');
    for (let i = 1; i <= 6; i++) {
      await page.waitForTimeout(5000);
      
      const hasResults = await page.locator('text=/Total Return|Sharpe Ratio|Win Rate/').count();
      const hasTable = await page.locator('table').count();
      const hasError = await page.locator('text=/Error|Failed/').count();
      const isBlank = await page.locator('body').textContent().then(text => text.trim().length < 100);
      
      await page.screenshot({ path: `audit-5-monitor-${i}of6-${i*5}s.png`, fullPage: true });
      
      console.log(`   [${i*5}s] 📸 audit-5-monitor-${i}of6-${i*5}s.png`);
      console.log(`        Results: ${hasResults > 0 ? '✅' : '❌'}, Table: ${hasTable > 0 ? '✅' : '❌'}, Error: ${hasError > 0 ? '⚠️' : '✅'}, Blank: ${isBlank ? '❌' : '✅'}`);
      
      if (hasResults > 0) {
        console.log('   🎉 RESULTS DETECTED!');
        break;
      }
    }

    // Step 6: Final analysis
    console.log('\n6️⃣  Final state analysis...');
    
    const finalBody = await page.locator('body').textContent();
    const hasBacktestContent = finalBody.includes('Backtest') || finalBody.includes('Results');
    const pageLength = finalBody.trim().length;
    
    console.log(`   Page content length: ${pageLength} characters`);
    console.log(`   Contains backtest content: ${hasBacktestContent ? '✅' : '❌'}`);
    
    await page.screenshot({ path: 'audit-6-final-state.png', fullPage: true });
    console.log('   📸 audit-6-final-state.png');

    // Step 7: Get React component state via dev tools
    console.log('\n7️⃣  Checking React state...');
    try {
      const reactState = await page.evaluate(() => {
        // Try to get React fiber
        const root = document.getElementById('root');
        const reactFiber = root?._reactInternalFiber || root?._reactInternalInstance;
        
        return {
          hasRoot: !!root,
          hasFiber: !!reactFiber,
          bodyText: document.body.innerText.substring(0, 200),
          elementsCount: document.querySelectorAll('*').length,
          hasTable: document.querySelectorAll('table').length,
          hasCards: document.querySelectorAll('[class*="card"]').length
        };
      });
      
      console.log('   React State:', JSON.stringify(reactState, null, 2));
    } catch (error) {
      console.log('   ⚠️  React state check error:', error.message);
    }

    // Keep browser open for manual inspection
    console.log('\n8️⃣  Browser staying open for 60 seconds for manual inspection...');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('\n❌ Critical error:', error.message);
    await page.screenshot({ path: 'audit-critical-error.png', fullPage: true });
    console.log('   📸 audit-critical-error.png');
  } finally {
    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('AUDIT SUMMARY');
    console.log('='.repeat(80));
    console.log(`Errors detected: ${errors.length}`);
    errors.forEach((error, i) => console.log(`  ${i+1}. ${error}`));
    console.log(`Screenshots saved: audit-*.png`);
    console.log('='.repeat(80));
    
    await browser.close();
  }
}

robustUITest();