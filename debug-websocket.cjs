#!/usr/bin/env node

/**
 * Quick WebSocket Debug Test
 * Tests if the WebSocket connection is working and receiving live data
 */

const WebSocket = require('ws');

console.log('🔍 Testing WebSocket connection to ws://localhost:3001/ws...');

const ws = new WebSocket('ws://localhost:3001/ws?symbols=SPY');

let messageCount = 0;
const maxMessages = 10;

ws.on('open', function open() {
  console.log('✅ WebSocket connected!');
  console.log('📡 Subscribing to SPY data...');
  
  // Subscribe to SPY
  ws.send(JSON.stringify({
    action: 'subscribe',
    symbols: ['SPY'],
    quotes: ['SPY'],
    trades: ['SPY']
  }));
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data.toString());
    messageCount++;
    
    console.log(`📊 Message ${messageCount}:`, {
      type: parsed.type,
      symbol: parsed.data?.symbol,
      price: parsed.data?.price || parsed.data?.ask,
      timestamp: parsed.data?.timestamp || new Date().toISOString()
    });
    
    if (messageCount >= maxMessages) {
      console.log(`🛑 Received ${maxMessages} messages, closing connection...`);
      ws.close();
    }
  } catch (error) {
    console.log('📦 Raw message:', data.toString());
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err.message);
});

ws.on('close', function close() {
  console.log('🔌 WebSocket connection closed');
  process.exit(0);
});

// Auto-close after 30 seconds
setTimeout(() => {
  console.log('⏰ 30 second timeout reached, closing...');
  if (ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  process.exit(0);
}, 30000);