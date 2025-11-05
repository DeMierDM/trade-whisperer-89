/**
 * API RESPONSE FORMAT VERIFICATION
 * 
 * This script verifies that API endpoints return data in the format
 * expected by the frontend components.
 */

async function verifyAPIResponses() {
  console.log('\n' + '='.repeat(80));
  console.log('API RESPONSE FORMAT VERIFICATION');
  console.log('='.repeat(80) + '\n');

  // Use the most recent backtest
  const backtestId = 27; // Update this to test different backtests

  console.log(`Testing with Backtest ID: ${backtestId}\n`);

  // Test 1: Backtest Status Endpoint
  console.log('📊 TEST 1: GET /api/backtest/status/:id');
  console.log('-'.repeat(80));
  
  const statusResponse = await fetch(`http://localhost:3002/api/backtest/status/${backtestId}`);
  const statusData = await statusResponse.json();
  
  console.log('Response Status:', statusResponse.status);
  console.log('Response Data:', JSON.stringify(statusData, null, 2));
  
  console.log('\n✅ Required Fields Check:');
  const statusRequiredFields = ['id', 'status', 'total_trades', 'total_return', 'win_rate', 'sharpe_ratio'];
  statusRequiredFields.forEach(field => {
    const hasField = statusData.hasOwnProperty(field);
    console.log(`  ${hasField ? '✅' : '❌'} ${field}: ${statusData[field]}`);
  });

  // Test 2: Trades Endpoint
  console.log('\n📊 TEST 2: GET /api/backtest/:id/trades');
  console.log('-'.repeat(80));
  
  const tradesResponse = await fetch(`http://localhost:3002/api/backtest/${backtestId}/trades`);
  const tradesData = await tradesResponse.json();
  
  console.log('Response Status:', tradesResponse.status);
  console.log('Total Trades:', Array.isArray(tradesData) ? tradesData.length : 'NOT AN ARRAY');
  
  if (Array.isArray(tradesData) && tradesData.length > 0) {
    const trade = tradesData[0];
    console.log('\nFirst Trade Sample:', JSON.stringify(trade, null, 2));
    
    console.log('\n✅ Required Trade Fields Check:');
    const tradeRequiredFields = [
      'contract_symbol', 'option_type', 'strike_price', 'expiry_date',
      'entry_timestamp', 'entry_price', 'exit_timestamp', 'exit_price',
      'quantity', 'status', 'entry_delta', 'entry_gamma', 'entry_theta'
    ];
    tradeRequiredFields.forEach(field => {
      const hasField = trade.hasOwnProperty(field);
      const value = trade[field];
      console.log(`  ${hasField ? '✅' : '❌'} ${field}: ${value !== null && value !== undefined ? value : 'NULL/UNDEFINED'}`);
    });
  } else {
    console.warn('⚠️  No trades found or invalid response format');
  }

  // Test 3: Signals Endpoint
  console.log('\n📊 TEST 3: GET /api/backtest/:id/signals');
  console.log('-'.repeat(80));
  
  const signalsResponse = await fetch(`http://localhost:3002/api/backtest/${backtestId}/signals`);
  const signalsData = await signalsResponse.json();
  
  console.log('Response Status:', signalsResponse.status);
  console.log('Response Structure:', JSON.stringify(signalsData, null, 2).substring(0, 500));
  
  if (signalsData.signals && Array.isArray(signalsData.signals)) {
    console.log('\nTotal Signals:', signalsData.signals.length);
    
    if (signalsData.signals.length > 0) {
      const signal = signalsData.signals[0];
      console.log('\nFirst Signal Sample:', JSON.stringify(signal, null, 2));
      
      console.log('\n✅ Required Signal Fields Check:');
      const signalRequiredFields = [
        'timestamp', 'signal_type', 'underlying_price', 'indicator_values'
      ];
      signalRequiredFields.forEach(field => {
        const hasField = signal.hasOwnProperty(field);
        console.log(`  ${hasField ? '✅' : '❌'} ${field}`);
      });
    }
  } else {
    console.warn('⚠️  Signals not in expected format');
  }

  // Test 4: Frontend Data Transformation Check
  console.log('\n📊 TEST 4: FRONTEND DATA TRANSFORMATION SIMULATION');
  console.log('-'.repeat(80));
  
  console.log('\nSimulating useBacktest hook transformation...');
  
  // This mimics what the frontend does
  const transformedStatus = {
    id: statusData.id,
    totalReturn: parseFloat(statusData.total_return || 0),
    sharpeRatio: parseFloat(statusData.sharpe_ratio || 0),
    maxDrawdown: parseFloat(statusData.max_drawdown || 0),
    winRate: parseFloat(statusData.win_rate || 0),
    totalTrades: parseInt(statusData.total_trades || 0)
  };
  
  console.log('Transformed Status:', JSON.stringify(transformedStatus, null, 2));
  
  console.log('\n✅ Transformation Check:');
  console.log(`  Total Return: ${transformedStatus.totalReturn}% (original: ${statusData.total_return})`);
  console.log(`  Win Rate: ${transformedStatus.winRate}% (original: ${statusData.win_rate})`);
  console.log(`  Total Trades: ${transformedStatus.totalTrades} (original: ${statusData.total_trades})`);

  // Test 5: Check if data would render in UI
  console.log('\n📊 TEST 5: UI RENDERING READINESS');
  console.log('-'.repeat(80));
  
  const renderChecks = {
    'Status endpoint responds': statusResponse.ok,
    'Trades endpoint responds': tradesResponse.ok,
    'Has trades data': Array.isArray(tradesData) && tradesData.length > 0,
    'Trades have required fields': Array.isArray(tradesData) && tradesData.length > 0 && tradesData[0].contract_symbol,
    'Greeks are calculated': Array.isArray(tradesData) && tradesData.length > 0 && tradesData[0].entry_delta !== null,
    'Signals available': signalsData.signals && signalsData.signals.length > 0,
    'HAVWAP indicators present': signalsData.signals && signalsData.signals.length > 0 && signalsData.signals[0].indicator_values
  };
  
  console.log('\n📋 UI Rendering Readiness:');
  Object.entries(renderChecks).forEach(([check, passed]) => {
    console.log(`  ${passed ? '✅' : '❌'} ${check}`);
  });

  const allPassed = Object.values(renderChecks).every(v => v);
  console.log(`\n${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'READY FOR UI' : 'NOT READY - ISSUES DETECTED'}`);

  console.log('\n' + '='.repeat(80));
}

verifyAPIResponses().catch(console.error);
