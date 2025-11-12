#!/usr/bin/env node

const https = require('https');
const http = require('http');

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

async function testOptionsMatrixAPI() {
  console.log('🔍 TESTING OPTIONS MATRIX API ENDPOINT');
  console.log('📡 Making API call to http://localhost:3001/api/options-matrix-data...');
  
  try {
    const postData = JSON.stringify({
      symbol: 'SPY',
      max_contracts: 20
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
    
    const data = await makeRequest(options, postData);
    
    console.log('\n📊 API Response structure:');
    console.log('Data keys:', Object.keys(data));
    
    if (data.contracts && data.contracts.length > 0) {
      console.log('\n📈 First contract structure:');
      const firstContract = data.contracts[0];
      console.log('Contract fields:', Object.keys(firstContract));
      console.log('Sample contract:', JSON.stringify(firstContract, null, 2));
      
      console.log('\n🔍 Checking bid/ask field names:');
      console.log('- bid:', firstContract.bid);
      console.log('- ask:', firstContract.ask);
      console.log('- bid_price:', firstContract.bid_price);
      console.log('- ask_price:', firstContract.ask_price);
      console.log('- midPrice:', firstContract.midPrice);
      console.log('- mid:', firstContract.mid);
    } else {
      console.log('❌ No contracts in response');
    }
    
  } catch (error) {
    console.error('❌ API call failed:', error.message);
  }
}

testOptionsMatrixAPI();