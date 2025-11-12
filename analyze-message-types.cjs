#!/usr/bin/env node

/**
 * Check what message types we actually receive from API server
 */

const WebSocket = require('ws');

console.log('🔍 Analyzing Message Types from API Server...\n');

const messageTypes = new Map();
let sampleMessages = [];

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', () => {
    console.log('✅ Connected to API server');
    console.log('📊 Sampling message types for 5 seconds...\n');
    
    setTimeout(() => {
        ws.close();
        
        console.log('\n📋 MESSAGE TYPE ANALYSIS:');
        console.log('='.repeat(50));
        
        for (const [type, count] of messageTypes.entries()) {
            console.log(`${type.padEnd(20)}: ${count} messages`);
        }
        
        console.log('\n📨 SAMPLE MESSAGES:');
        console.log('='.repeat(50));
        
        sampleMessages.forEach((msg, i) => {
            console.log(`\n${i + 1}. Type: ${msg.type}`);
            if (msg.data) {
                const keys = Object.keys(msg.data);
                console.log(`   Data fields: ${keys.join(', ')}`);
                if (msg.data.symbol) console.log(`   Symbol: ${msg.data.symbol}`);
                if (msg.data.bid !== undefined) console.log(`   Bid: ${msg.data.bid}`);
                if (msg.data.ask !== undefined) console.log(`   Ask: ${msg.data.ask}`);
                if (msg.data.price !== undefined) console.log(`   Price: ${msg.data.price}`);
            }
        });
        
        // Analysis
        console.log('\n🎯 ANALYSIS:');
        console.log('='.repeat(50));
        
        const hasStockQuotes = messageTypes.has('stock_quote');
        const hasOptionQuotes = messageTypes.has('option_quote');
        const hasOptionTrades = messageTypes.has('option_trade');
        
        console.log(`Stock Quotes: ${hasStockQuotes ? '✅ Available' : '❌ Not found'}`);
        console.log(`Option Quotes: ${hasOptionQuotes ? '✅ Available' : '❌ Not found'}`);  
        console.log(`Option Trades: ${hasOptionTrades ? '✅ Available' : '❌ Not found'}`);
        
        if (hasOptionQuotes && hasOptionTrades) {
            console.log('\n💡 We receive BOTH option quotes and trades!');
            console.log('   → No estimation needed when we have real bid/ask');
            console.log('   → Estimation only used as fallback');
        } else if (hasOptionTrades && !hasOptionQuotes) {
            console.log('\n💡 We only receive option trades');
            console.log('   → Estimation (±$0.05) is necessary');
        }
    }, 5000);
});

ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        
        // Count message types
        const count = messageTypes.get(message.type) || 0;
        messageTypes.set(message.type, count + 1);
        
        // Collect samples (max 10)
        if (sampleMessages.length < 10 && 
            (message.type === 'stock_quote' || 
             message.type === 'option_quote' || 
             message.type === 'option_trade')) {
            sampleMessages.push(message);
        }
    } catch (err) {
        // Skip non-JSON
    }
});

ws.on('error', (error) => {
    console.error('❌ Connection error:', error.message);
});