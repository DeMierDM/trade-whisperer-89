#!/usr/bin/env node

const WebSocket = require('ws');

console.log('🔍 DEBUGGING OPTIONS DATA STRUCTURE');
console.log('🖥️  Connecting to WebSocket to capture an option quote...');

const ws = new WebSocket('ws://localhost:3001/ws');

let captureCount = 0;

ws.on('open', function open() {
  console.log('✅ Connected to WebSocket');
});

ws.on('message', function message(data) {
  try {
    const msg = JSON.parse(data);
    
    if (msg.type === 'option_quote' && captureCount < 3) {
      captureCount++;
      console.log(`\n📈 OPTION QUOTE ${captureCount}:`);
      console.log('Raw WebSocket message:', JSON.stringify(msg, null, 2));
      
      if (captureCount === 3) {
        console.log('\n✅ Captured enough samples. The WebSocket data structure shows:');
        console.log('- symbol: Contract symbol (e.g., SPY251111P00683000)');
        console.log('- bid: Bid price (e.g., 0.48)'); 
        console.log('- ask: Ask price (e.g., 0.49)');
        console.log('- bid_size: Bid size');
        console.log('- ask_size: Ask size');
        console.log('- timestamp: Unix timestamp');
        console.log('- data_source: "indicative_feed"');
        console.log('\n🔍 This means the handleLiveOptionUpdate should receive proper bid/ask data.');
        console.log('The issue might be in how the frontend is processing or storing this data.');
        process.exit(0);
      }
    }
    
  } catch (e) {
    // Ignore parse errors
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err);
});

// Run for 10 seconds max
setTimeout(() => {
  console.log('\n⏰ Timeout reached. Exiting...');
  process.exit(0);
}, 10000);