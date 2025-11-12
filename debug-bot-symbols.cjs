#!/usr/bin/env node

/**
 * Listen for specific message types needed by bots
 */

const WebSocket = require('ws');

console.log('🔍 Looking for stock_quote and option messages for IWM and QQQ...\n');

const ws = new WebSocket('ws://localhost:3001');
const targetSymbols = ['IWM', 'QQQ'];

ws.on('open', () => {
    console.log('✅ Connected to API server');
    console.log('🎯 Filtering for IWM and QQQ related messages...\n');
});

let messageCount = 0;
const maxMessages = 20;

ws.on('message', (data) => {
    if (messageCount >= maxMessages) {
        ws.close();
        return;
    }
    
    try {
        const message = JSON.parse(data.toString());
        
        // Only show messages relevant to bot symbols
        if (message.type === 'stock_quote' || message.type === 'stock_trade') {
            if (message.data && targetSymbols.includes(message.data.symbol)) {
                messageCount++;
                console.log(`📊 STOCK Message ${messageCount}:`);
                console.log(JSON.stringify(message, null, 2));
                console.log('---');
            }
        } else if (message.type === 'option_quote' || message.type === 'option_trade') {
            if (message.data && (
                message.data.symbol?.includes('IWM') || 
                message.data.symbol?.includes('QQQ') ||
                message.data.underlying === 'IWM' ||
                message.data.underlying === 'QQQ'
            )) {
                messageCount++;
                console.log(`📈 OPTION Message ${messageCount}:`);
                console.log(JSON.stringify(message, null, 2));
                console.log('---');
            }
        }
    } catch (err) {
        // Skip non-JSON messages
    }
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
    console.log(`\n🔚 Found ${messageCount} relevant messages for bot symbols`);
    console.log('💡 Now checking if bots are processing these messages...');
});