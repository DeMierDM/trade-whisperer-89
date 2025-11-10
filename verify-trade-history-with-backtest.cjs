const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function verifyTradeHistoryWithBacktest() {
  const screenshotDir = path.join(__dirname, 'trade-history-verification');

  // Ensure screenshot directory exists
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  console.log('🚀 Starting trade history verification with backtest...\n');

  try {
    // Step 1: Navigate to backtesting page
    console.log('📍 Step 1: Navigating to http://localhost:8080/backtesting');
    await page.goto('http://localhost:8080/backtesting', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    await page.waitForTimeout(2000);

    // Step 2: Take screenshot of initial page
    console.log('📸 Step 2: Taking screenshot of initial page (before backtest)');
    const beforeBacktest = path.join(screenshotDir, '01-before-backtest.png');
    await page.screenshot({ path: beforeBacktest, fullPage: true });
    console.log(`   ✅ Saved: ${beforeBacktest}\n`);

    // Check initial trade count
    const initialTradeCount = await page.locator('text=/\\d+ Trades/').textContent().catch(() => '0 Trades');
    console.log(`   Initial trade count: ${initialTradeCount}\n`);

    // Step 3: Click "Fetch Data & Generate Options" button
    console.log('🔘 Step 3: Clicking "Fetch Data & Generate Options" button');
    const fetchButton = page.locator('button:has-text("Fetch Data & Generate Options")');

    if (await fetchButton.isVisible({ timeout: 5000 })) {
      await fetchButton.click();
      console.log('   ✅ Clicked "Fetch Data & Generate Options"');
      console.log('   ⏳ Waiting for data to load...');

      // Wait for loading to complete (look for success indicators)
      await page.waitForTimeout(5000);

      const afterFetch = path.join(screenshotDir, '02-after-fetch-data.png');
      await page.screenshot({ path: afterFetch, fullPage: true });
      console.log(`   📸 Saved: ${afterFetch}\n`);
    } else {
      console.log('   ⚠️  Fetch button not found, may already have data loaded\n');
    }

    // Step 4: Look for "Run Backtest" button
    console.log('🔘 Step 4: Looking for "Run Backtest" button');

    // Try different possible button texts
    const possibleButtons = [
      'button:has-text("Run Backtest")',
      'button:has-text("Start Backtest")',
      'button:has-text("Execute Backtest")',
      '[data-testid="run-backtest"]'
    ];

    let runBacktestButton = null;
    for (const selector of possibleButtons) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 2000 })) {
          runBacktestButton = btn;
          console.log(`   ✅ Found backtest button: "${selector}"\n`);
          break;
        }
      } catch (e) {
        // Continue
      }
    }

    if (!runBacktestButton) {
      console.log('   ⚠️  Run Backtest button not found');
      console.log('   Looking for any buttons on the page...\n');

      const allButtons = await page.locator('button').all();
      console.log(`   Found ${allButtons.length} buttons total:`);
      for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
        const btnText = await allButtons[i].textContent();
        console.log(`   - Button ${i + 1}: "${btnText.trim()}"`);
      }
      console.log('');
    }

    // Step 5: Run the backtest
    if (runBacktestButton) {
      console.log('🚀 Step 5: Running backtest...');
      await runBacktestButton.click();
      console.log('   ✅ Clicked "Run Backtest" button');
      console.log('   ⏳ Waiting for backtest to complete...\n');

      // Wait for backtest to complete - look for indicators
      // This could take some time depending on the data size
      await page.waitForTimeout(10000); // Initial wait

      // Check if backtest is still running
      let iterations = 0;
      const maxIterations = 30; // 30 seconds max wait

      while (iterations < maxIterations) {
        const pageText = await page.textContent('body');

        // Check for completion indicators
        if (pageText.includes('Backtest Complete') ||
            pageText.includes('Total Trades:') ||
            !pageText.includes('Running...') &&
            !pageText.includes('Loading...')) {
          console.log('   ✅ Backtest appears to have completed\n');
          break;
        }

        await page.waitForTimeout(1000);
        iterations++;

        if (iterations % 5 === 0) {
          console.log(`   ⏳ Still waiting... (${iterations}s elapsed)`);
        }
      }

      // Take screenshot after backtest
      const afterBacktest = path.join(screenshotDir, '03-after-backtest.png');
      await page.screenshot({ path: afterBacktest, fullPage: true });
      console.log(`   📸 Saved: ${afterBacktest}\n`);
    }

    // Step 6: Scroll to trade history section
    console.log('📜 Step 6: Scrolling to "Options Trade History" section');

    const tradeHistoryHeading = page.locator('text=Options Trade History');
    if (await tradeHistoryHeading.isVisible({ timeout: 5000 })) {
      await tradeHistoryHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      console.log('   ✅ Scrolled to trade history section\n');
    }

    // Take screenshot of trade history area
    const tradeHistoryView = path.join(screenshotDir, '04-trade-history-section.png');
    await page.screenshot({ path: tradeHistoryView, fullPage: false });
    console.log(`📸 Saved: ${tradeHistoryView}\n`);

    // Step 7: Analyze trade history
    console.log('🔍 Step 7: Analyzing trade history display');

    // Check the trade count badge
    const tradeCountText = await page.locator('text=/\\d+ Trades/').textContent().catch(() => 'Not found');
    console.log(`   Trade count badge: ${tradeCountText}\n`);

    // Look for table element
    const tables = await page.locator('table').all();
    console.log(`   Found ${tables.length} table(s) on page\n`);

    let tradeHistoryTable = null;
    let tradeRowCount = 0;
    let hasData = false;

    if (tables.length > 0) {
      // Find the trade history table (look for one near "Options Trade History")
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const tableText = await table.textContent();

        // Check if this looks like a trade history table
        if (tableText.includes('Contract') ||
            tableText.includes('Symbol') ||
            tableText.includes('Entry') ||
            tableText.includes('Exit') ||
            tableText.includes('P&L') ||
            tableText.includes('Profit')) {
          tradeHistoryTable = table;
          console.log(`   ✅ Found trade history table (Table #${i + 1})\n`);
          break;
        }
      }

      if (tradeHistoryTable) {
        // Scroll to table
        await tradeHistoryTable.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);

        // Count rows
        const bodyRows = await tradeHistoryTable.locator('tbody tr').all();
        tradeRowCount = bodyRows.length;

        console.log(`📊 Trade History Table Analysis:`);
        console.log(`   Total data rows: ${tradeRowCount}\n`);

        // Check table content
        const tableContent = await tradeHistoryTable.textContent();

        if (tableContent.includes('No trades') ||
            tableContent.includes('No data') ||
            tableContent.includes('Run a backtest')) {
          hasData = false;
          console.log('   ℹ️  Message: Table shows "No trades" or similar\n');
        } else if (tradeRowCount > 0) {
          hasData = true;
          console.log('   ✅ Table contains trade data!\n');

          // Get table headers
          const headerRow = await tradeHistoryTable.locator('thead tr').first();
          const headers = await headerRow.locator('th, td').all();
          console.log(`📑 Table Headers (${headers.length} columns):`);
          for (const header of headers) {
            const headerText = await header.textContent();
            console.log(`   - ${headerText.trim()}`);
          }
          console.log('');

          // Get first few rows as samples
          const sampleSize = Math.min(5, bodyRows.length);
          console.log(`📋 Sample Trade Rows (showing first ${sampleSize} of ${tradeRowCount}):\n`);

          for (let i = 0; i < sampleSize; i++) {
            const row = bodyRows[i];
            const cells = await row.locator('td').all();
            console.log(`   Trade ${i + 1}:`);
            for (let j = 0; j < Math.min(cells.length, 8); j++) {
              const cellText = await cells[j].textContent();
              console.log(`      Col ${j + 1}: ${cellText.trim()}`);
            }
            console.log('');
          }

          // Take detailed screenshot of table
          const tableDetail = path.join(screenshotDir, '05-trade-table-detail.png');
          await tradeHistoryTable.screenshot({ path: tableDetail });
          console.log(`📸 Table detail screenshot: ${tableDetail}\n`);
        }
      } else {
        console.log('   ℹ️  Tables found but none appear to be trade history\n');
      }
    } else {
      console.log('   ⚠️  No tables found on page\n');

      // Check what's in the trade history section
      const tradeHistorySection = page.locator('text=Options Trade History').locator('..').locator('..');
      const sectionText = await tradeHistorySection.textContent().catch(() => 'Could not read section');
      console.log('   Trade History Section Content:');
      console.log(`   "${sectionText.slice(0, 300)}..."\n`);
    }

    // Step 8: Take final full page screenshot
    const finalScreenshot = path.join(screenshotDir, '06-final-full-page.png');
    await page.screenshot({ path: finalScreenshot, fullPage: true });
    console.log(`📸 Final screenshot: ${finalScreenshot}\n`);

    // Generate Summary Report
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 TRADE HISTORY VERIFICATION REPORT');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`\n🌐 Page: http://localhost:8080/backtesting`);
    console.log(`\n📈 Backtest Status:`);
    console.log(`   - Backtest executed: ${runBacktestButton ? 'YES' : 'NO'}`);
    console.log(`   - Trade count badge: ${tradeCountText}`);

    console.log(`\n📊 Trade History Table:`);
    console.log(`   - Table element found: ${tradeHistoryTable ? 'YES' : 'NO'}`);
    console.log(`   - Trade rows visible: ${tradeRowCount}`);
    console.log(`   - Contains trade data: ${hasData ? 'YES' : 'NO'}`);

    if (tradeRowCount === 0 && !hasData) {
      console.log(`\n⚠️  ISSUE DETECTED:`);
      console.log(`   Expected: 517 trades from backend`);
      console.log(`   Actual: ${tradeRowCount} rows displayed`);
      console.log(`\n   Possible causes:`);
      console.log(`   1. Backtest not executed or failed silently`);
      console.log(`   2. Trades not being fetched from backend API`);
      console.log(`   3. Frontend not rendering trade data from state`);
      console.log(`   4. Trade history component not receiving data`);
    } else if (hasData && tradeRowCount > 0) {
      console.log(`\n✅ SUCCESS: Trade history is displaying!`);
      console.log(`   - ${tradeRowCount} trade rows are visible`);
      if (tradeRowCount < 517) {
        console.log(`   - Note: Showing ${tradeRowCount} of expected 517 trades`);
        console.log(`   - This may be due to pagination, filtering, or date range selection`);
      } else {
        console.log(`   - All expected trades are visible! 🎉`);
      }
    }

    console.log(`\n📸 Screenshots saved to:`);
    console.log(`   ${screenshotDir}`);
    console.log(`\n   Files created:`);
    const files = fs.readdirSync(screenshotDir).filter(f => f.endsWith('.png'));
    files.sort();
    files.forEach(file => console.log(`   - ${file}`));

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Return structured data for further analysis
    return {
      success: hasData && tradeRowCount > 0,
      tradeRowCount,
      hasTable: tradeHistoryTable !== null,
      tradeCountBadge: tradeCountText,
      backtestExecuted: runBacktestButton !== null,
      screenshots: files.map(f => path.join(screenshotDir, f))
    };

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    console.error(error.stack);

    const errorScreenshot = path.join(screenshotDir, 'error-state.png');
    await page.screenshot({ path: errorScreenshot, fullPage: true });
    console.log(`📸 Error screenshot saved: ${errorScreenshot}`);

    return {
      success: false,
      error: error.message
    };
  } finally {
    await browser.close();
  }
}

verifyTradeHistoryWithBacktest()
  .then(result => {
    console.log('\n✅ Verification completed');
    console.log(JSON.stringify(result, null, 2));
  })
  .catch(error => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });
