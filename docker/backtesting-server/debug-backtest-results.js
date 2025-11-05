/**
 * COMPREHENSIVE BACKTEST RESULTS DEBUGGER
 * 
 * This script verifies:
 * 1. Backend properly calculates and stores results
 * 2. API returns complete data with Greeks
 * 3. Frontend data transformation works correctly
 * 4. HAVWAP indicators are calculated
 * 5. Architecture compliance with original plan
 */

const { chromium } = require('playwright');

async function debugBacktestResults() {
  console.log('\n' + '='.repeat(80));
  console.log('COMPREHENSIVE BACKTEST RESULTS DEBUGGER');
  console.log('='.repeat(80) + '\n');

  // Phase 1: Trigger a new backtest
  console.log('📊 PHASE 1: TRIGGER NEW BACKTEST');
  console.log('-'.repeat(80));
  
  const backtestConfig = {
    strategy: 'HAVWAP-Rev-v2',
    symbol: 'SPY',
    startDate: '2024-10-10',
    endDate: '2024-10-10',
    timeframe: '1Min',
    initialCapital: 10000
  };

  console.log('Config:', JSON.stringify(backtestConfig, null, 2));

  const response = await fetch('http://localhost:3002/api/backtest/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backtestConfig)
  });

  const initResponse = await response.json();
  console.log('✅ Backtest initiated:', initResponse);
  
  const backtestId = initResponse.backtestId;
  console.log(`\n🔑 Backtest ID: ${backtestId}\n`);

  // Phase 2: Poll for completion with detailed logging
  console.log('📊 PHASE 2: POLL FOR COMPLETION');
  console.log('-'.repeat(80));

  let attempts = 0;
  let maxAttempts = 20; // 60 seconds total
  let status = 'running';
  let finalResult = null;

  while (attempts < maxAttempts && status === 'running') {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 3000));

    const statusResponse = await fetch(`http://localhost:3002/api/backtest/status/${backtestId}`);
    const statusData = await statusResponse.json();
    
    console.log(`\n[Attempt ${attempts}/${maxAttempts}] Status: ${statusData.status}`);
    console.log(`  Total Trades: ${statusData.total_trades || 0}`);
    console.log(`  Total Return: ${statusData.total_return || 'N/A'}`);
    
    status = statusData.status;
    finalResult = statusData;

    if (status === 'completed' || status === 'failed') {
      break;
    }
  }

  if (status !== 'completed') {
    console.error('\n❌ BACKTEST DID NOT COMPLETE IN TIME');
    return;
  }

  console.log('\n✅ BACKTEST COMPLETED');
  console.log('Final Result:', JSON.stringify(finalResult, null, 2));

  // Phase 3: Fetch trades with Greeks
  console.log('\n📊 PHASE 3: FETCH TRADES WITH GREEKS');
  console.log('-'.repeat(80));

  const tradesResponse = await fetch(`http://localhost:3002/api/backtest/${backtestId}/trades`);
  const trades = await tradesResponse.json();

  console.log(`\n📈 Total Trades Fetched: ${trades.length}`);

  if (trades.length === 0) {
    console.warn('\n⚠️  WARNING: NO TRADES FOUND!');
    console.log('This could mean:');
    console.log('  1. Strategy generated no signals');
    console.log('  2. Signals generated but not executed');
    console.log('  3. Trades executed but not saved to database');
    console.log('  4. API endpoint not returning trade data');
  } else {
    trades.forEach((trade, index) => {
      console.log(`\n📊 Trade ${index + 1}/${trades.length}:`);
      console.log(`  Contract: ${trade.contract_symbol}`);
      console.log(`  Type: ${trade.option_type}`);
      console.log(`  Strike: $${trade.strike_price}`);
      console.log(`  Entry: $${trade.entry_price} @ ${trade.entry_timestamp}`);
      console.log(`  Exit: $${trade.exit_price} @ ${trade.exit_timestamp}`);
      console.log(`  Status: ${trade.status}`);
      
      console.log(`\n  📐 Entry Greeks:`);
      console.log(`    Delta: ${trade.entry_delta || 'N/A'}`);
      console.log(`    Gamma: ${trade.entry_gamma || 'N/A'}`);
      console.log(`    Theta: ${trade.entry_theta || 'N/A'}`);
      console.log(`    Vega: ${trade.entry_vega || 'N/A'}`);
      console.log(`    IV: ${trade.entry_iv || 'N/A'}`);

      if (trade.exit_delta) {
        console.log(`\n  📐 Exit Greeks:`);
        console.log(`    Delta: ${trade.exit_delta}`);
        console.log(`    Gamma: ${trade.exit_gamma}`);
        console.log(`    Theta: ${trade.exit_theta}`);
        console.log(`    Vega: ${trade.exit_vega}`);
        console.log(`    IV: ${trade.exit_iv}`);
      }
    });
  }

  // Phase 4: Check HAVWAP indicators in signals
  console.log('\n📊 PHASE 4: CHECK HAVWAP INDICATORS');
  console.log('-'.repeat(80));

  const signalsResponse = await fetch(`http://localhost:3002/api/backtest/${backtestId}/signals`);
  const signalsData = await signalsResponse.json();
  
  console.log(`\n🎯 Total Signals: ${signalsData.signals?.length || 0}`);

  if (signalsData.signals && signalsData.signals.length > 0) {
    signalsData.signals.slice(0, 3).forEach((signal, index) => {
      console.log(`\n📊 Signal ${index + 1}:`);
      console.log(`  Type: ${signal.signal_type}`);
      console.log(`  Timestamp: ${signal.timestamp}`);
      console.log(`  Underlying Price: $${signal.underlying_price}`);
      
      if (signal.indicator_values) {
        console.log(`  📈 HAVWAP Indicators:`);
        console.log(`    VWAP: $${signal.indicator_values.vwap || 'N/A'}`);
        console.log(`    Slope: ${signal.indicator_values.slope || 'N/A'}`);
        console.log(`    Price Distance: ${((signal.indicator_values.priceDistance || 0) * 100).toFixed(3)}%`);
      } else {
        console.warn(`  ⚠️  No indicator values found`);
      }
    });
  }

  // Phase 5: UI Screenshot Test
  console.log('\n📊 PHASE 5: UI SCREENSHOT VERIFICATION');
  console.log('-'.repeat(80));

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      console.log(`[BROWSER ${type}]`, msg.text());
    }
  });

  console.log('\n📍 Loading application...');
  await page.goto('http://localhost:8080');
  await page.waitForTimeout(2000);

  console.log('📍 Navigating to Backtest tab...');
  await page.click('button:has-text("Backtest")');
  await page.waitForTimeout(2000);

  console.log('📍 Filling form...');
  await page.fill('input[placeholder*="SPY"]', 'SPY');
  await page.fill('input[type="date"]', '2024-10-10');
  await page.waitForTimeout(500);

  await page.screenshot({ 
    path: 'screenshots/debug-backtest-verification/01-form-filled.png',
    fullPage: true 
  });

  console.log('📍 Clicking Run Backtest...');
  await page.click('button:has-text("Run Backtest")');
  await page.waitForTimeout(2000);

  await page.screenshot({ 
    path: 'screenshots/debug-backtest-verification/02-after-click.png',
    fullPage: true 
  });

  console.log('📍 Waiting for results (60 seconds)...');
  
  // Check every 5 seconds for results
  let resultsFound = false;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(5000);
    
    const pageContent = await page.content();
    const hasTrades = pageContent.includes('contract_symbol') || 
                     pageContent.includes('Contract Symbol') ||
                     pageContent.includes('SPY241010');
    
    console.log(`  [${(i+1)*5}s] Checking for results... ${hasTrades ? '✅ FOUND' : '⏳ waiting'}`);
    
    if (hasTrades) {
      resultsFound = true;
      break;
    }
  }

  await page.screenshot({ 
    path: 'screenshots/debug-backtest-verification/03-final-results.png',
    fullPage: true 
  });

  // Check what's actually on the page
  const resultElements = await page.locator('table, .trade, .result, .backtest-result').count();
  console.log(`\n📊 Result elements found: ${resultElements}`);

  const tableText = await page.locator('table').first().textContent().catch(() => 'No table found');
  console.log('\n📄 Table content preview:', tableText.substring(0, 500));

  // Phase 6: Architecture Compliance Check
  console.log('\n📊 PHASE 6: ARCHITECTURE COMPLIANCE');
  console.log('-'.repeat(80));

  const compliance = {
    'Contract Individualization': trades.length > 0 && trades[0].instance_id ? '✅' : '❌',
    'Greeks at Entry': trades.length > 0 && trades[0].entry_delta ? '✅' : '❌',
    'Greeks at Exit': trades.length > 0 && trades[0].exit_delta ? '✅' : '⚠️  Partial',
    'HAVWAP Indicators': signalsData.signals?.length > 0 && signalsData.signals[0].indicator_values ? '✅' : '❌',
    'Time Series Tracking': '⚠️  Not implemented',
    'P&L Attribution': trades.length > 0 ? '✅' : '❌',
    'Signal Storage': signalsData.signals?.length > 0 ? '✅' : '❌',
    'Live vs Backtest Separation': '⚠️  Needs verification'
  };

  console.log('\n📋 Architecture Compliance Report:');
  Object.entries(compliance).forEach(([feature, status]) => {
    console.log(`  ${status} ${feature}`);
  });

  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Backtest ID: ${backtestId}`);
  console.log(`Status: ${status}`);
  console.log(`Total Trades: ${trades.length}`);
  console.log(`Total Signals: ${signalsData.signals?.length || 0}`);
  console.log(`Greeks Calculated: ${trades.length > 0 && trades[0].entry_delta ? 'YES' : 'NO'}`);
  console.log(`UI Results Displayed: ${resultsFound ? 'YES' : 'NO'}`);
  console.log('\nScreenshots saved to: screenshots/debug-backtest-verification/');
  
  console.log('\n⏸️  Browser will remain open for 30 seconds for manual inspection...');
  await page.waitForTimeout(30000);

  await browser.close();
  console.log('\n✅ Debug session complete\n');
}

// Run the debugger
debugBacktestResults().catch(console.error);
