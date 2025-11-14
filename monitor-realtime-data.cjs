#!/usr/bin/env node

/**
 * Real-Time Data Flow Monitor
 * Monitors WebSocket updates and validates they reach the frontend
 */

const WebSocket = require('ws');

console.log('🔍 Real-Time Data Flow Monitor - Starting...');

const ws = new WebSocket('ws://localhost:3001/ws?symbols=SPY,QQQ');

let priceUpdates = {};
let updateCount = 0;

ws.on('open', function open() {
  console.log('✅ WebSocket connected to trading system');
  console.log('📡 Monitoring live price updates...\n');
  
  // Subscribe to multiple symbols
  ws.send(JSON.stringify({
    action: 'subscribe',
    symbols: ['SPY', 'QQQ'],
    quotes: ['SPY', 'QQQ'],
    trades: ['SPY', 'QQQ']
  }));
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data.toString());
    
    if (parsed.type === 'stock_quote' || parsed.type === 'stock_trade') {
      const symbol = parsed.data.symbol;
      const price = parsed.data.price || parsed.data.ask || parsed.data.mid;
      const timestamp = new Date().toLocaleTimeString();
      
      if (!priceUpdates[symbol]) {
        priceUpdates[symbol] = { count: 0, lastPrice: 0, lastUpdate: '' };
      }
      
      priceUpdates[symbol].count++;
      priceUpdates[symbol].lastPrice = price;
      priceUpdates[symbol].lastUpdate = timestamp;
      updateCount++;
      
      // Show live updates with color coding
      const changeSymbol = priceUpdates[symbol].lastPrice > price ? '📉' : 
                          priceUpdates[symbol].lastPrice < price ? '📈' : '➡️';
      
      console.log(`${changeSymbol} ${symbol}: $${price.toFixed(2)} | ${timestamp} | Updates: ${priceUpdates[symbol].count}`);
      
      // Summary every 20 updates
      if (updateCount % 20 === 0) {
        console.log('\n📊 LIVE DATA SUMMARY:');
        Object.keys(priceUpdates).forEach(sym => {
          const data = priceUpdates[sym];
          console.log(`   ${sym}: $${data.lastPrice.toFixed(2)} (${data.count} updates)`);
        });
        console.log(`   Total Updates: ${updateCount}\n`);
      }
    }
  } catch (error) {
    console.log('📦 Raw message:', data.toString().slice(0, 100) + '...');
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
  console.log('\n🔌 WebSocket connection closed');
  console.log('📊 Final Summary:');
  Object.keys(priceUpdates).forEach(symbol => {
    const data = priceUpdates[symbol];
    console.log(`   ${symbol}: $${data.lastPrice.toFixed(2)} (${data.count} total updates)`);
  });
  console.log(`   Total Updates Received: ${updateCount}`);
  process.exit(0);
});

// Status report every 30 seconds
setInterval(() => {
  console.log(`\n⏰ Status Update - Total: ${updateCount} price updates`);
  if (Object.keys(priceUpdates).length === 0) {
    console.log('⚠️  No price updates received yet - check data feed');
  }
}, 30000);

// Auto-close after 2 minutes
setTimeout(() => {
  console.log('\n⏰ 2 minute monitoring complete, closing...');
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
}, 120000);