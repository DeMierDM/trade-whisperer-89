#!/usr/bin/env node

/**
 * Debug script to examine the exact message format from API server
 */

const WebSocket = require('ws');

console.log('🔍 Debugging API Server Message Format...\n');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
    console.log('✅ Connected to API server');
    console.log('📋 Capturing next 5 messages to analyze format...\n');
});

let messageCount = 0;
const maxMessages = 5;

ws.on('message', (data) => {
    if (messageCount >= maxMessages) {
        ws.close();
        return;
    }
    
    messageCount++;
    
    try {
        const message = JSON.parse(data.toString());
        console.log(`📨 Message ${messageCount}:`);
        console.log('Full message structure:');
        console.log(JSON.stringify(message, null, 2));
        console.log('---');
    } catch (err) {
        console.log(`📨 Message ${messageCount} (Raw text):`, data.toString().substring(0, 200));
        console.log('---');
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log('\n🔚 Analysis complete');
    console.log('💡 Check if message.data exists or if data is at root level');
});