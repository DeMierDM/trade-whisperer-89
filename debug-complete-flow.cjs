#!/usr/bin/env node

// Full debugging of the options matrix data flow
const WebSocket = require('ws');
const http = require('http');

let webSocketData = new Map(); // Track WebSocket updates
let apiData = null; // Track API response

// Function to make HTTP request
function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function testCompleteFlow() {
  console.log('🔍 COMPLETE OPTIONS DATA FLOW TEST');
  console.log('=' .repeat(60));
  
  // Step 1: Get initial API data
  console.log('📡 1. Testing initial API call...');
  try {
    const postData = JSON.stringify({
      symbol: 'SPY',
      max_contracts: 5
    });
    
    const options = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/options-matrix-data',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };
    
    apiData = await makeRequest(options, postData);
    console.log(`✅ API returned ${apiData.contracts?.length || 0} contracts`);
    
    if (apiData.contracts && apiData.contracts.length > 0) {
      const sample = apiData.contracts[0];
      console.log(`📊 Sample API contract: ${sample.symbol} - Bid: $${sample.bid} Ask: $${sample.ask}`);
    }
    
  } catch (error) {
    console.error('❌ API call failed:', error.message);
    return;
  }
  
  // Step 2: Listen to WebSocket updates
  console.log('\n📡 2. Connecting to WebSocket for live updates...');
  const ws = new WebSocket('ws://localhost:3001');
  
  let updateCount = 0;
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected');
    
    // Set timeout to collect data for 10 seconds
    setTimeout(() => {
      console.log('\n⏰ Test complete after 10 seconds');
      ws.close();
      
      // Step 3: Compare data
      compareDataSources();
    }, 10000);
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      if (message.type === 'option_quote') {
        updateCount++;
        const quote = message.data;
        webSocketData.set(quote.symbol, {
          symbol: quote.symbol,
          bid: quote.bid,
          ask: quote.ask,
          bid_size: quote.bid_size,
          ask_size: quote.ask_size,
          timestamp: quote.timestamp,
          updateNumber: updateCount
        });
        
        if (updateCount <= 3) {
          console.log(`📈 WebSocket update #${updateCount}: ${quote.symbol} - Bid: $${quote.bid} Ask: $${quote.ask}`);
        } else if (updateCount === 4) {
          console.log('📈 ... (more updates coming)');
        }
      }
    } catch (e) {
      // Ignore parsing errors
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
}

function compareDataSources() {
  console.log('\n🔍 3. COMPARING DATA SOURCES');
  console.log('=' .repeat(60));
  
  if (!apiData || !apiData.contracts) {
    console.log('❌ No API data to compare');
    return;
  }
  
  console.log(`📊 API contracts: ${apiData.contracts.length}`);
  console.log(`📈 WebSocket updates: ${webSocketData.size} symbols (${Array.from(webSocketData.values()).reduce((sum, item) => sum + item.updateNumber, 0)} total updates)`);
  
  // Find matching contracts
  let matches = 0;
  let mismatches = 0;
  
  for (const apiContract of apiData.contracts) {
    const wsUpdate = webSocketData.get(apiContract.symbol);
    
    if (wsUpdate) {
      matches++;
      console.log(`\n✅ MATCH: ${apiContract.symbol}`);
      console.log(`   API    - Bid: $${apiContract.bid} Ask: $${apiContract.ask}`);
      console.log(`   WS     - Bid: $${wsUpdate.bid} Ask: $${wsUpdate.ask}`);
      
      // Check if values are different (indicating live updates)
      if (Math.abs(apiContract.bid - wsUpdate.bid) > 0.01 || Math.abs(apiContract.ask - wsUpdate.ask) > 0.01) {
        console.log(`   📈 LIVE UPDATE detected (prices changed)`);
      } else {
        console.log(`   💤 No price change from API to WebSocket`);
      }
    } else {
      mismatches++;
      console.log(`\n❌ NO WS UPDATE: ${apiContract.symbol} (API: $${apiContract.bid}/$${apiContract.ask})`);
    }
  }
  
  console.log(`\n📊 SUMMARY:`);
  console.log(`   Matches: ${matches}`);
  console.log(`   Missing WS data: ${mismatches}`);
  console.log(`   Total WS updates received: ${Array.from(webSocketData.values()).reduce((sum, item) => sum + item.updateNumber, 0)}`);
  
  // Check for WebSocket symbols not in API
  const wsOnlySymbols = Array.from(webSocketData.keys()).filter(symbol => 
    !apiData.contracts.some(contract => contract.symbol === symbol)
  );
  
  if (wsOnlySymbols.length > 0) {
    console.log(`\n📈 WebSocket-only symbols: ${wsOnlySymbols.length}`);
    wsOnlySymbols.slice(0, 3).forEach(symbol => {
      const ws = webSocketData.get(symbol);
      console.log(`   ${symbol} - Bid: $${ws.bid} Ask: $${ws.ask}`);
    });
  }
}

testCompleteFlow();