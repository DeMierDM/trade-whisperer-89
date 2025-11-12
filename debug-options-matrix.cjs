#!/usr/bin/env node

// Debug Options Matrix Data Flow
// This script will test the complete data flow from backend to frontend

const WebSocket = require('ws');
const fetch = require('node-fetch');

console.log('🔍 DEBUGGING OPTIONS MATRIX DATA FLOW');
console.log('=====================================\n');

// Test 1: Check if API server is responding
async function testApiServer() {
  console.log('1️⃣ Testing API Server Connection...');
  
  try {
    const response = await fetch('http://localhost:3005/health');
    const data = await response.text();
    console.log('✅ API Server Response:', data);
    
    // Test options matrix endpoint
    const optionsResponse = await fetch('http://localhost:3005/api/fetch-options-matrix?symbol=SPY');
    if (optionsResponse.ok) {
      const optionsData = await optionsResponse.json();
      console.log('✅ Options Matrix Endpoint Working');
      console.log(`   Contracts returned: ${optionsData.contracts?.length || 0}`);
      if (optionsData.contracts?.length > 0) {
        console.log(`   Sample contract: ${optionsData.contracts[0].symbol || 'N/A'}`);
      }
    } else {
      console.log(`❌ Options Matrix Endpoint Error: ${optionsResponse.status}`);
    }
    
  } catch (error) {
    console.log('❌ API Server Error:', error.message);
  }
  console.log('');
}

// Test 2: Check Data Bus WebSocket connection
async function testDataBusConnection() {
  console.log('2️⃣ Testing Data Bus WebSocket Connection...');
  
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:3004');
    let messageCount = 0;
    
    const timeout = setTimeout(() => {
      ws.close();
      console.log('⚠️  Data Bus connection timeout (10 seconds)');
      resolve();
    }, 10000);
    
    ws.on('open', () => {
      console.log('✅ Data Bus WebSocket Connected');
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;
        
        if (messageCount <= 5) { // Show first 5 messages
          console.log(`📦 Message ${messageCount}:`, {
            type: message.type,
            channel: message.channel,
            symbol: message.data?.symbol || message.data?.S,
            price: message.data?.price || message.data?.p,
            bid: message.data?.bid || message.data?.bp,
            ask: message.data?.ask || message.data?.ap
          });
        }
        
        // Check for options data specifically
        if (message.type?.includes('option')) {
          console.log('🎯 OPTIONS DATA DETECTED:', message.type);
        }
        
        if (messageCount === 5) {
          console.log(`📊 Received ${messageCount} messages from Data Bus`);
        }
        
        if (messageCount >= 10) {
          clearTimeout(timeout);
          ws.close();
          console.log(`✅ Data Bus flowing normally (${messageCount} messages received)`);
          resolve();
        }
        
      } catch (error) {
        console.log('❌ Data parsing error:', error.message);
      }
    });
    
    ws.on('error', (error) => {
      console.log('❌ Data Bus WebSocket Error:', error.message);
      clearTimeout(timeout);
      resolve();
    });
    
    ws.on('close', () => {
      console.log('🔌 Data Bus WebSocket Closed');
      clearTimeout(timeout);
      resolve();
    });
  });
}

// Test 3: Check frontend API configuration
async function testFrontendConfig() {
  console.log('3️⃣ Checking Frontend API Configuration...');
  
  try {
    // Check if frontend files exist and are configured correctly
    const fs = require('fs');
    const path = require('path');
    
    const apiConfigPath = path.join(__dirname, 'src/lib/apiConfig.ts');
    if (fs.existsSync(apiConfigPath)) {
      const apiConfig = fs.readFileSync(apiConfigPath, 'utf8');
      
      if (apiConfig.includes('3005')) {
        console.log('✅ Frontend API config points to port 3005');
      } else if (apiConfig.includes('3001')) {
        console.log('❌ Frontend API config still points to old port 3001');
      } else {
        console.log('⚠️  Frontend API config port unclear');
      }
      
      // Check WebSocket configuration
      if (apiConfig.includes('3004')) {
        console.log('✅ Frontend WebSocket config points to port 3004');
      } else {
        console.log('❌ Frontend WebSocket config missing or incorrect');
      }
    } else {
      console.log('⚠️  API config file not found at expected location');
    }
    
  } catch (error) {
    console.log('❌ Frontend config check error:', error.message);
  }
  console.log('');
}

// Test 4: Direct options data check
async function testOptionsData() {
  console.log('4️⃣ Testing Direct Options Data Availability...');
  
  try {
    // Check multiple endpoints that might serve options data
    const endpoints = [
      'http://localhost:3005/api/fetch-options-matrix?symbol=SPY',
      'http://localhost:3005/api/get-option-quotes',
      'http://localhost:3005/api/fetch-market-data?symbol=SPY&timeframe=1d&limit=10'
    ];
    
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint);
        console.log(`📡 ${endpoint}: ${response.status} ${response.statusText}`);
        
        if (response.ok && endpoint.includes('options-matrix')) {
          const data = await response.json();
          console.log(`   Options contracts: ${data.contracts?.length || 0}`);
          console.log(`   Last updated: ${data.last_updated || 'N/A'}`);
        }
      } catch (err) {
        console.log(`❌ ${endpoint}: ${err.message}`);
      }
    }
    
  } catch (error) {
    console.log('❌ Options data test error:', error.message);
  }
  console.log('');
}

// Run all tests
async function runDiagnostics() {
  await testApiServer();
  await testFrontendConfig();
  await testOptionsData();
  await testDataBusConnection();
  
  console.log('🏁 Diagnostics Complete!');
  console.log('If options data is not showing in frontend:');
  console.log('- Check that frontend is connecting to correct WebSocket port (3004)');
  console.log('- Verify frontend options matrix component is processing received data');
  console.log('- Ensure frontend API calls are using port 3005');
  process.exit(0);
}

runDiagnostics().catch(console.error);