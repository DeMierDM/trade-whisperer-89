/**
 * Verify Current State with Screenshots
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'current-state-screenshots');

async function verifyCurrent() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    console.log('\n🔍 VERIFYING CURRENT STATE\n');

    // Navigate to page
    console.log('Step 1: Loading backtesting page...');
    await page.goto('http://localhost:8080/backtesting', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '01-initial-load.png'),
      fullPage: true
    });
    console.log('   ✅ Initial page loaded\n');

    // Check for balance metrics
    const bodyText = await page.textContent('body');

    console.log('Step 2: Checking for balance metrics...');
    const hasStartingBalance = bodyText.includes('Starting Balance');
    const hasEndingBalance = bodyText.includes('Ending Balance');
    const hasTotalPnL = bodyText.includes('Total P&L') || bodyText.includes('+$82540');

    console.log(`   Starting Balance visible: ${hasStartingBalance ? '✅' : '❌'}`);
    console.log(`   Ending Balance visible: ${hasEndingBalance ? '✅' : '❌'}`);
    console.log(`   Total P&L visible: ${hasTotalPnL ? '✅' : '❌'}\n`);

    // Scroll to trade history
    console.log('Step 3: Scrolling to trade history...');
    const tradeHistoryHeading = page.locator('text=/Trade History/i').first();
    if (await tradeHistoryHeading.count() > 0) {
      await tradeHistoryHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, '02-trade-history-section.png'),
        fullPage: false
      });
      console.log('   ✅ Trade history section found\n');
    } else {
      console.log('   ⚠️  No trade history heading found\n');
    }

    // Check for table
    console.log('Step 4: Checking for trade table...');
    const tableCount = await page.locator('table').count();
    console.log(`   Tables found: ${tableCount}`);

    if (tableCount > 0) {
      const rowCount = await page.locator('table tbody tr').count();
      console.log(`   Table rows: ${rowCount}`);

      if (rowCount > 0) {
        console.log('   ✅ TRADES ARE DISPLAYING!\n');

        // Get first few rows
        for (let i = 0; i < Math.min(3, rowCount); i++) {
          const row = page.locator('table tbody tr').nth(i);
          const text = await row.textContent();
          console.log(`   Row ${i + 1}: ${text.substring(0, 100)}...`);
        }
      } else {
        console.log('   ❌ Table exists but has 0 rows\n');
      }
    } else {
      console.log('   ❌ No table found\n');
    }

    // Check for "No trades" message
    const noTradesMsg = bodyText.includes('No option trades') || bodyText.includes('0 Trades');
    console.log(`\nStep 5: "No trades" message present: ${noTradesMsg ? '❌ YES' : '✅ NO'}\n`);

    // Final full screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, '03-full-page.png'),
      fullPage: true
    });

    console.log('='.repeat(60));
    console.log('📊 VERIFICATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`Screenshots saved to: ${SCREENSHOT_DIR}\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await page.screenshot({
      path: path.join(SCREENSHOT_DIR, 'ERROR.png'),
      fullPage: true
    });
  } finally {
    await browser.close();
  }
}

verifyCurrent().catch(console.error);
