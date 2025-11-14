const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function verifyTradeHistory() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await context.newPage();

  const screenshotDir = '/Users/demierminor/Desktop/trade-whisperer-89/trade-fix-verification';

  const report = {
    timestamp: new Date().toISOString(),
    tradeRowsCount: 0,
    tradeDataSample: [],
    totalTradesText: '',
    success: false,
    screenshots: [],
    steps: []
  };

  try {
    console.log('Step 1: Navigate to backtesting page...');
    await page.goto('http://localhost:8080/backtesting', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const screenshot1 = path.join(screenshotDir, '01-initial-page.png');
    await page.screenshot({ path: screenshot1, fullPage: true });
    report.screenshots.push(screenshot1);
    report.steps.push('Page loaded successfully');
    console.log('✓ Page loaded');

    console.log('Step 2: Set dates to 10/10/2025...');
    const startDateInput = await page.locator('input[type="date"]').first();
    await startDateInput.fill('2025-10-10');

    const endDateInput = await page.locator('input[type="date"]').nth(1);
    await endDateInput.fill('2025-10-10');

    await page.waitForTimeout(1000);
    report.steps.push('Dates set to 10/10/2025');
    console.log('✓ Dates set');

    console.log('Step 3: Click "Fetch Data & Generate Options"...');
    const fetchButton = await page.getByRole('button', { name: /fetch data.*generate options/i });
    await fetchButton.click();
    console.log('Clicked fetch button, waiting for completion...');

    await page.waitForTimeout(5000);

    const screenshot2 = path.join(screenshotDir, '02-after-fetch.png');
    await page.screenshot({ path: screenshot2, fullPage: true });
    report.screenshots.push(screenshot2);
    report.steps.push('Data fetched successfully');
    console.log('✓ Data fetched');

    console.log('Step 4: Click "Run Backtest"...');
    const backtestButton = await page.getByRole('button', { name: /run backtest/i });
    await backtestButton.click();
    console.log('Clicked backtest button, waiting ~15 seconds...');

    await page.waitForTimeout(15000);

    const screenshot3 = path.join(screenshotDir, '03-after-backtest.png');
    await page.screenshot({ path: screenshot3, fullPage: true });
    report.screenshots.push(screenshot3);
    report.steps.push('Backtest completed');
    console.log('✓ Backtest completed');

    console.log('Step 5: Scroll to Trade History section...');
    const tradeHistoryHeading = await page.locator('text=/Options Trade History/i').first();
    await tradeHistoryHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(2000);

    const screenshot4 = path.join(screenshotDir, '04-trade-history-visible.png');
    await page.screenshot({ path: screenshot4, fullPage: true });
    report.screenshots.push(screenshot4);
    report.steps.push('Scrolled to Trade History section');
    console.log('✓ Scrolled to Trade History');

    console.log('Step 6: Analyzing trade history table...');

    const totalTradesElement = await page.locator('text=/\d+\s+trades/i').first();
    if (await totalTradesElement.isVisible().catch(() => false)) {
      report.totalTradesText = await totalTradesElement.textContent();
      console.log(`Found: ${report.totalTradesText}`);
    }

    const tableRows = await page.locator('table tbody tr').all();
    report.tradeRowsCount = tableRows.length;
    console.log(`Found ${report.tradeRowsCount} trade rows`);

    if (tableRows.length > 0) {
      const rowsToCapture = Math.min(3, tableRows.length);

      for (let i = 0; i < rowsToCapture; i++) {
        const row = tableRows[i];
        const cells = await row.locator('td').all();
        const rowData = [];

        for (const cell of cells) {
          const text = await cell.textContent();
          rowData.push(text.trim());
        }

        report.tradeDataSample.push({
          rowNumber: i + 1,
          cells: rowData
        });

        console.log(`Row ${i + 1}: ${rowData.join(' | ')}`);
      }

      report.success = true;
      report.steps.push(`Captured ${rowsToCapture} trade rows successfully`);
    } else {
      report.steps.push('WARNING: No trade rows found in table');
      console.log('⚠ No trade rows found');
    }

    const screenshot5 = path.join(screenshotDir, '05-trade-table-closeup.png');
    await page.screenshot({ path: screenshot5, fullPage: false });
    report.screenshots.push(screenshot5);

    const table = await page.locator('table').first();
    if (await table.isVisible().catch(() => false)) {
      const screenshot6 = path.join(screenshotDir, '06-table-only.png');
      await table.screenshot({ path: screenshot6 });
      report.screenshots.push(screenshot6);
    }

  } catch (error) {
    console.error('Error during verification:', error);
    report.error = error.message;
    report.steps.push(`Error: ${error.message}`);

    const errorScreenshot = path.join(screenshotDir, 'error-state.png');
    await page.screenshot({ path: errorScreenshot, fullPage: true });
    report.screenshots.push(errorScreenshot);
  } finally {
    const reportPath = path.join(screenshotDir, 'verification-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log('\n' + '='.repeat(80));
    console.log('TRADE HISTORY VERIFICATION REPORT');
    console.log('='.repeat(80));
    console.log(`Total Trades Text: ${report.totalTradesText || 'Not found'}`);
    console.log(`Trade Rows Visible: ${report.tradeRowsCount}`);
    console.log('\nFirst 3 Rows:');
    report.tradeDataSample.forEach(row => {
      console.log(`\nRow ${row.rowNumber}:`);
      console.log(`  ${row.cells.join(' | ')}`);
    });
    console.log('\nScreenshots saved to:', screenshotDir);
    console.log(`Report saved to: ${reportPath}`);
    console.log('='.repeat(80));

    await browser.close();
  }
}

verifyTradeHistory().catch(console.error);
