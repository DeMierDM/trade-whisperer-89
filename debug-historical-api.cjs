#!/usr/bin/env node

/**
 * Debug Historical Data API
 * Tests the historical data API with various date ranges and parameters
 */

const axios = require('axios');

async function debugHistoricalAPI() {
  console.log('🔍 Debugging Historical Data API...\n');

  const baseUrl = 'http://localhost:3005';
  const symbol = 'SPY';
  
  try {
    // Test 1: Default parameters
    console.log('1️⃣ Testing default parameters...');
    const response1 = await axios.get(`${baseUrl}/api/historical/${symbol}`);
    console.log(`Status: ${response1.status}, Data points: ${response1.data?.data?.length || 0}`);
    
    // Test 2: Specific recent date range
    console.log('\n2️⃣ Testing specific recent date range...');
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    
    console.log(`Date range: ${yesterday.toISOString()} to ${today.toISOString()}`);
    
    const response2 = await axios.get(`${baseUrl}/api/historical/${symbol}`, {
      params: {
        start_date: yesterday.toISOString(),
        end_date: today.toISOString(),
        timeframe: '1m'
      }
    });
    console.log(`Status: ${response2.status}, Data points: ${response2.data?.data?.length || 0}`);
    
    if (response2.data?.data?.length > 0) {
      const sample = response2.data.data[0];
      console.log('Sample data:', JSON.stringify(sample, null, 2));
    }
    
    // Test 3: Check last 7 days
    console.log('\n3️⃣ Testing last 7 days...');
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const response3 = await axios.get(`${baseUrl}/api/historical/${symbol}`, {
      params: {
        start_date: weekAgo.toISOString(),
        end_date: today.toISOString(),
        timeframe: '5m'
      }
    });
    console.log(`Status: ${response3.status}, Data points: ${response3.data?.data?.length || 0}`);
    
    // Test 4: Test with period parameter
    console.log('\n4️⃣ Testing with period=1d...');
    const response4 = await axios.get(`${baseUrl}/api/historical/${symbol}?period=1d&timeframe=1m`);
    console.log(`Status: ${response4.status}, Data points: ${response4.data?.data?.length || 0}`);
    
    // Test 5: Raw response structure
    if (response4.data) {
      console.log('\n5️⃣ Response structure:');
      console.log('Keys:', Object.keys(response4.data));
      console.log('Full response:', JSON.stringify(response4.data, null, 2).substring(0, 500) + '...');
    }

  } catch (error) {
    console.error('❌ API Error:', error.response ? {
      status: error.response.status,
      data: error.response.data
    } : error.message);
  }
}

// Run if called directly
if (require.main === module) {
  debugHistoricalAPI()
    .then(() => console.log('\n✅ Debug completed'))
    .catch(error => {
      console.error('\n❌ Debug failed:', error.message);
      process.exit(1);
    });
}

module.exports = { debugHistoricalAPI };