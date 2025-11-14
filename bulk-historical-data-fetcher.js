#!/usr/bin/env node

/**
 * Bulk Historical Data Fetcher
 * 
 * Fetches historical bars for multiple symbols simultaneously and saves them 
 * to the aggregate bar database that the chart system pulls from.
 * 
 * This ensures the charts have baseline historical data available for:
 * - SPY, QQQ, IWM (primary ETFs)
 * - Additional symbols as configured
 */

import fetch from 'node-fetch';
import { Pool } from 'pg';

// Database connection for saving bars to the same location charts pull from
const pool = new Pool({
  user: process.env.DB_USER || 'trader',
  host: process.env.DB_HOST || 'localhost', 
  database: process.env.DB_NAME || 'trading_system',
  password: process.env.DB_PASSWORD || 'trading123',
  port: process.env.DB_PORT || 5433,
});

// Primary symbols that need historical data for the multi-symbol chart system
const SYMBOLS = ['SPY', 'QQQ', 'IWM'];

// API endpoints
const API_SERVER_URL = 'http://localhost:3001'; // Main API server
const BACKTEST_SERVER_URL = 'http://localhost:3002'; // Backtesting server

/**
 * Fetch historical data from the API server's historical-bars endpoint
 */
async function fetchHistoricalBars(symbol, startDate, endDate, timeframe = '1m') {
  try {
    console.log(`📊 Fetching historical bars for ${symbol} (${startDate} to ${endDate})`);
    
    const response = await fetch(`${API_SERVER_URL}/api/historical-bars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        startDate,
        endDate,
        timeframe
      })
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Retrieved ${data.count || 0} bars for ${symbol}`);
    return data.data || [];
    
  } catch (error) {
    console.error(`❌ Error fetching bars for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Fetch historical data from Alpaca via backtest server for symbols not in database
 */
async function fetchFromAlpaca(symbol, startDate, endDate, timeframe = '1Min') {
  try {
    console.log(`📊 Fetching from Alpaca for ${symbol} (${startDate} to ${endDate})`);
    
    const response = await fetch(`${BACKTEST_SERVER_URL}/api/fetch-historical-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        startDate,
        endDate,
        timeframe,
        dataType: 'stock'
      })
    });

    if (!response.ok) {
      throw new Error(`Backtest API returned ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ Retrieved ${data.bars?.length || 0} bars from Alpaca for ${symbol}`);
    return data.bars || [];
    
  } catch (error) {
    console.error(`❌ Error fetching from Alpaca for ${symbol}:`, error.message);
    return [];
  }
}

/**
 * Save historical bars to the bus_stock_data table (same location charts pull from)
 */
async function saveBarsToDatabase(symbol, bars) {
  if (!bars || bars.length === 0) {
    console.log(`⚠️  No bars to save for ${symbol}`);
    return 0;
  }

  try {
    const client = await pool.connect();
    let savedCount = 0;

    console.log(`💾 Saving ${bars.length} bars to database for ${symbol}`);

    for (const bar of bars) {
      try {
        // Insert bar data as individual trade records (same format as WebSocket data)
        await client.query(`
          INSERT INTO bus_stock_data (
            symbol, 
            data_type, 
            timestamp, 
            price, 
            volume
          ) VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (symbol, data_type, timestamp, price) 
          DO UPDATE SET 
            volume = bus_stock_data.volume + EXCLUDED.volume
        `, [
          symbol,
          'trade',
          bar.bar_timestamp || bar.timestamp,
          bar.close || bar.c, // Use closing price as trade price
          bar.volume || bar.v || 0
        ]);
        
        savedCount++;
      } catch (insertError) {
        // Skip duplicate entries
        if (!insertError.message.includes('duplicate key')) {
          console.error(`❌ Error inserting bar for ${symbol}:`, insertError.message);
        }
      }
    }

    client.release();
    console.log(`✅ Saved ${savedCount} bars to database for ${symbol}`);
    return savedCount;
    
  } catch (error) {
    console.error(`❌ Database error for ${symbol}:`, error.message);
    return 0;
  }
}

/**
 * Check if symbol already has recent data in database
 */
async function hasRecentData(symbol, hoursBack = 24) {
  try {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - hoursBack);
    
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM bus_stock_data 
      WHERE symbol = $1 
        AND data_type = 'trade'
        AND timestamp >= $2
    `, [symbol, cutoffTime.toISOString()]);
    
    const count = parseInt(result.rows[0].count) || 0;
    console.log(`📊 ${symbol} has ${count} recent bars in database`);
    return count > 0;
    
  } catch (error) {
    console.error(`❌ Error checking recent data for ${symbol}:`, error.message);
    return false;
  }
}

/**
 * Calculate appropriate date ranges for fetching historical data
 */
function getDateRanges() {
  const endDate = new Date();
  const startDate = new Date();
  
  // Fetch last 7 days to ensure we have recent trading days
  startDate.setDate(endDate.getDate() - 7);
  
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}

/**
 * Process a single symbol: check database, fetch if needed, save bars
 */
async function processSymbol(symbol) {
  const { startDate, endDate } = getDateRanges();
  
  try {
    // Check if we already have recent data
    const hasData = await hasRecentData(symbol);
    
    if (hasData) {
      console.log(`✅ ${symbol} already has recent data, skipping fetch`);
      return { symbol, status: 'skipped', reason: 'has_recent_data' };
    }

    // Try to get data from our aggregated database first
    let bars = await fetchHistoricalBars(symbol, startDate, endDate);
    
    // If no bars from database, fetch from Alpaca
    if (!bars || bars.length === 0) {
      console.log(`📊 No bars in database for ${symbol}, fetching from Alpaca`);
      bars = await fetchFromAlpaca(symbol, startDate, endDate);
    }

    // Save bars to database
    const savedCount = await saveBarsToDatabase(symbol, bars);
    
    return {
      symbol,
      status: savedCount > 0 ? 'success' : 'no_data',
      barsCount: bars.length,
      savedCount,
      dateRange: { startDate, endDate }
    };
    
  } catch (error) {
    console.error(`❌ Error processing ${symbol}:`, error.message);
    return {
      symbol,
      status: 'error',
      error: error.message
    };
  }
}

/**
 * Main function: Process all symbols concurrently
 */
async function bulkFetchHistoricalData() {
  console.log('🚀 Starting bulk historical data fetch for multi-symbol charts');
  console.log(`📋 Symbols to process: ${SYMBOLS.join(', ')}`);
  
  const startTime = Date.now();
  
  try {
    // Process all symbols concurrently for better performance
    const results = await Promise.allSettled(
      SYMBOLS.map(symbol => processSymbol(symbol))
    );
    
    // Process results
    const successCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'rejected' || r.value?.status === 'error').length;
    const skippedCount = results.filter(r => r.status === 'fulfilled' && r.value.status === 'skipped').length;
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n📊 Bulk Historical Data Fetch Summary:');
    console.log(`✅ Successfully processed: ${successCount} symbols`);
    console.log(`⏭️  Skipped (has recent data): ${skippedCount} symbols`);
    console.log(`❌ Errors: ${errorCount} symbols`);
    console.log(`⏱️  Total duration: ${duration} seconds`);
    
    // Log detailed results
    results.forEach((result, index) => {
      const symbol = SYMBOLS[index];
      if (result.status === 'fulfilled') {
        const { status, barsCount, savedCount, error, reason } = result.value;
        if (status === 'success') {
          console.log(`  📈 ${symbol}: ${savedCount} bars saved (${barsCount} fetched)`);
        } else if (status === 'skipped') {
          console.log(`  ⏭️  ${symbol}: ${reason}`);
        } else if (status === 'error') {
          console.log(`  ❌ ${symbol}: ${error}`);
        } else {
          console.log(`  ⚠️  ${symbol}: no data available`);
        }
      } else {
        console.log(`  ❌ ${symbol}: ${result.reason}`);
      }
    });
    
    return { successCount, errorCount, skippedCount, duration };
    
  } catch (error) {
    console.error('❌ Fatal error in bulk fetch:', error.message);
    return { successCount: 0, errorCount: SYMBOLS.length, skippedCount: 0 };
  } finally {
    await pool.end();
  }
}

/**
 * CLI interface
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📊 Bulk Historical Data Fetcher

Usage:
  node bulk-historical-data-fetcher.js [options]

Options:
  --symbols SPY,QQQ,IWM    Specify custom symbols (default: SPY,QQQ,IWM)
  --force                  Force fetch even if recent data exists
  --help, -h               Show this help message

Examples:
  node bulk-historical-data-fetcher.js
  node bulk-historical-data-fetcher.js --symbols SPY,QQQ,IWM,AAPL,TSLA
  node bulk-historical-data-fetcher.js --force

This tool fetches historical bars for multiple symbols and saves them to the
same database location that the chart system uses, ensuring charts have
baseline data available for display.
`);
    process.exit(0);
  }
  
  // Parse custom symbols if provided
  const symbolsArg = args.find(arg => arg.startsWith('--symbols='));
  if (symbolsArg) {
    const customSymbols = symbolsArg.split('=')[1].split(',').map(s => s.trim().toUpperCase());
    SYMBOLS.length = 0;  // Clear default symbols
    SYMBOLS.push(...customSymbols);
    console.log(`🎯 Using custom symbols: ${SYMBOLS.join(', ')}`);
  }
  
  // Handle force flag
  const force = args.includes('--force');
  if (force) {
    console.log('🔄 Force mode: will fetch data even if recent data exists');
    // Override hasRecentData to always return false
    global.forceMode = true;
  }
  
  // Run the bulk fetch
  bulkFetchHistoricalData()
    .then((results) => {
      if (results.successCount > 0) {
        console.log('\n🎉 Bulk fetch completed successfully!');
        console.log('📊 Charts should now have historical data available for display.');
        process.exit(0);
      } else {
        console.log('\n⚠️  Bulk fetch completed with issues.');
        console.log('🔍 Check the logs above for details.');
        process.exit(1);
      }
    })
    .catch((error) => {
      console.error('\n💥 Bulk fetch failed:', error.message);
      process.exit(1);
    });
}

export {
  bulkFetchHistoricalData,
  fetchHistoricalBars,
  saveBarsToDatabase,
  hasRecentData,
  processSymbol
};