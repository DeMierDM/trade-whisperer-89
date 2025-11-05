const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Database connection (shared with main server)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize Alpaca Client
const AlpacaClient = require('./utils/alpaca-client.js');
let alpacaClient = null;

try {
  alpacaClient = new AlpacaClient({
    apiKey: process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_LIVE_API_KEY,
    apiSecret: process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_LIVE_API_SECRET
  });
  console.log('✅ Alpaca client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Alpaca client:', error.message);
  console.error('   Backtesting functionality will be limited');
}

// Middleware
app.use(cors());
app.use(express.json());

// Data Bus Configuration
const DATA_BUS_URL = process.env.DATA_BUS_URL || 'http://data_bus_manager:3004';

/**
 * Helper function to fetch options data via Data Bus
 * This deduplicates requests and uses the indicative feed
 */
async function fetchOptionsViaDataBus(symbols, startDate, endDate, timeframe = '1min') {
  try {
    console.log(`📡 [DATA BUS] Fetching options bars for ${symbols.length} symbols via Data Bus`);

    const response = await fetch(`${DATA_BUS_URL}/api/options/bars`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbols,
        startDate,
        endDate,
        timeframe
      })
    });

    if (!response.ok) {
      throw new Error(`Data Bus API error: ${response.status}`);
    }

    const result = await response.json();
    console.log(`✅ [DATA BUS] Received data for ${result.count} option contracts from Data Bus`);

    return result.data;
  } catch (error) {
    console.error(`❌ [DATA BUS] Failed to fetch options via Data Bus:`, error.message);
    throw error;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'backtesting-server',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Backtesting Server: Error connecting to database:', err);
  } else {
    console.log('✅ Backtesting Server: Connected to PostgreSQL database');
    release();
  }
});

// ==================== INTELLIGENT DATE LOGIC ====================

/**
 * Determines the best DTE (Days to Expiration) based on current market conditions
 * - 0DTE if market is open and it's before 3:30 PM ET
 * - 1DTE if it's after hours on weekdays
 * - 2DTE if it's Friday after hours or weekend
 */
function getBestDTE() {
  const now = moment().tz('America/New_York');
  const dayOfWeek = now.day(); // 0 = Sunday, 1 = Monday, ..., 5 = Friday, 6 = Saturday
  const hour = now.hour();
  const minute = now.minute();
  const currentTime = hour * 100 + minute; // Convert to HHMM format

  // Market hours: 9:30 AM - 4:00 PM ET (930 - 1600)
  const marketOpen = 930;
  const marketClose = 1600;
  const nearClose = 1530; // 3:30 PM - stop 0DTE trading

  console.log(`📅 [DATE LOGIC] Current: ${now.format('dddd, YYYY-MM-DD HH:mm')} ET`);

  // Weekend (Saturday or Sunday)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    console.log('📅 [DATE LOGIC] Weekend detected - using 1DTE for Monday expiry');
    return { dte: '1DTE', reason: 'Weekend - target Monday expiry' };
  }

  // Weekday logic
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    // During market hours
    if (currentTime >= marketOpen && currentTime <= marketClose) {
      // Before 3:30 PM - safe for 0DTE
      if (currentTime < nearClose) {
        console.log('📅 [DATE LOGIC] Market open, before 3:30 PM - using 0DTE');
        return { dte: '0DTE', reason: 'Market open, safe for same-day expiry' };
      } else {
        console.log('📅 [DATE LOGIC] Market open but near close - using 1DTE');
        return { dte: '1DTE', reason: 'Near market close, next day safer' };
      }
    }
    
    // After hours on Friday
    if (dayOfWeek === 5 && currentTime > marketClose) {
      console.log('📅 [DATE LOGIC] Friday after hours - using 2DTE for Monday');
      return { dte: '2DTE', reason: 'Friday after hours, target Monday' };
    }
    
    // After hours on other weekdays
    if (currentTime > marketClose) {
      console.log('📅 [DATE LOGIC] After hours weekday - using 1DTE');
      return { dte: '1DTE', reason: 'After hours, next trading day' };
    }
    
    // Before market open
    if (currentTime < marketOpen) {
      console.log('📅 [DATE LOGIC] Before market open - using 0DTE');
      return { dte: '0DTE', reason: 'Pre-market, same day expiry' };
    }
  }

  // Default fallback
  console.log('📅 [DATE LOGIC] Fallback - using 1DTE');
  return { dte: '1DTE', reason: 'Default fallback' };
}

/**
 * Gets the optimal expiration date based on DTE strategy
 */
function getOptimalExpiryDate(dteStrategy) {
  const now = moment().tz('America/New_York');
  
  switch (dteStrategy) {
    case '0DTE':
      // Same day if it's a trading day
      if (now.day() >= 1 && now.day() <= 5) {
        return now.format('YYMMDD');
      }
      // If weekend, get next Monday
      const nextMonday = now.clone().day(8); // Next Monday
      return nextMonday.format('YYMMDD');
      
    case '1DTE':
      // Next trading day
      let nextDay = now.clone().add(1, 'day');
      while (nextDay.day() === 0 || nextDay.day() === 6) {
        nextDay.add(1, 'day');
      }
      return nextDay.format('YYMMDD');
      
    case '2DTE':
      // Two trading days out
      let targetDay = now.clone();
      let tradingDaysAdded = 0;
      
      while (tradingDaysAdded < 2) {
        targetDay.add(1, 'day');
        if (targetDay.day() >= 1 && targetDay.day() <= 5) {
          tradingDaysAdded++;
        }
      }
      return targetDay.format('YYMMDD');
      
    default:
      return now.format('YYMMDD');
  }
}

/**
 * Gets the appropriate date range for historical data
 */
function getHistoricalDateRange(dteStrategy) {
  const expiryDate = getOptimalExpiryDate(dteStrategy);
  const expiryMoment = moment.tz(expiryDate, 'YYMMDD', 'America/New_York');
  
  // For intraday data, get the same day or most recent trading day
  let dataDate = expiryMoment.clone();
  
  // If expiry is not today, get previous trading day's data
  const now = moment().tz('America/New_York');
  if (expiryMoment.isAfter(now, 'day')) {
    dataDate = now.clone();
    // If today is weekend, go back to Friday
    while (dataDate.day() === 0 || dataDate.day() === 6) {
      dataDate.subtract(1, 'day');
    }
  }
  
  const startTime = dataDate.clone().hour(9).minute(30).second(0); // 9:30 AM
  const endTime = dataDate.clone().hour(16).minute(0).second(0);   // 4:00 PM
  
  return {
    start: startTime.toISOString(),
    end: endTime.toISOString(),
    expiryDate: expiryDate,
    dataDate: dataDate.format('YYYY-MM-DD')
  };
}

// ==================== CURRENT OPTIONS DATA ENDPOINT ====================

// Get current optimal options data based on market conditions
app.post('/api/fetch-current-options', async (req, res) => {
  try {
    const { ticker, strikeRange = 5, strikeSpacing = 5 } = req.body;
    
    if (!ticker) {
      return res.status(400).json({ error: 'ticker parameter required' });
    }

    // Get API keys
    const apiKey = process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_LIVE_API_KEY;
    const apiSecret = process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_LIVE_API_SECRET;
    
    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'API keys not configured' });
    }

    // Determine best DTE strategy
    const dteInfo = getBestDTE();
    const dateRange = getHistoricalDateRange(dteInfo.dte);
    
    console.log(`📊 [CURRENT OPTIONS] Fetching for ${ticker} using ${dteInfo.dte} strategy`);
    console.log(`📊 [CURRENT OPTIONS] Expiry: ${dateRange.expiryDate}, Data from: ${dateRange.dataDate}`);
    console.log(`📊 [CURRENT OPTIONS] Reason: ${dteInfo.reason}`);

    const marketDataBaseUrl = 'https://data.alpaca.markets';
    
    // STEP 1: Get underlying price for strike calculation
    const underlyingUrl = `${marketDataBaseUrl}/v2/stocks/${ticker}/bars?start=${dateRange.start}&end=${dateRange.end}&timeframe=1min&limit=1000&feed=iex&adjustment=all`;
    
    const underlyingResponse = await fetch(underlyingUrl, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    });

    if (!underlyingResponse.ok) {
      throw new Error(`Failed to fetch underlying data: ${underlyingResponse.status}`);
    }

    const underlyingData = await underlyingResponse.json();
    const underlyingBars = underlyingData.bars || [];

    if (underlyingBars.length === 0) {
      return res.status(404).json({ 
        error: 'No underlying data available',
        dteInfo: dteInfo,
        dateRange: dateRange
      });
    }

    // Calculate price range and center strike
    const prices = underlyingBars.map(bar => bar.c);
    const currentPrice = prices[prices.length - 1]; // Most recent price
    const centerStrike = Math.round(currentPrice / strikeSpacing) * strikeSpacing;

    console.log(`📊 [CURRENT OPTIONS] ${ticker} current price: $${currentPrice.toFixed(2)}, center strike: $${centerStrike}`);

    // STEP 2: Generate option symbols around current price
    const optionSymbols = [];
    for (let i = -strikeRange; i <= strikeRange; i++) {
      const strike = centerStrike + (i * strikeSpacing);
      if (strike > 0) {
        // Proper Alpaca format: 5 digits for dollars + 3 digits for cents
        const dollars = Math.floor(strike);
        const cents = Math.round((strike - dollars) * 100);
        const strikeFormatted = dollars.toString().padStart(5, '0') + cents.toString().padStart(3, '0');
        
        optionSymbols.push(`${ticker}${dateRange.expiryDate}C${strikeFormatted}`);
        optionSymbols.push(`${ticker}${dateRange.expiryDate}P${strikeFormatted}`);
      }
    }

    // STEP 3: Fetch options data (historical bars - no feed parameter needed)
    const symbolsParam = optionSymbols.join(',');
    const optionsBarsUrl = `${marketDataBaseUrl}/v1beta1/options/bars?symbols=${encodeURIComponent(symbolsParam)}&timeframe=1min&start=${encodeURIComponent(dateRange.start)}&end=${encodeURIComponent(dateRange.end)}&limit=1000&sort=desc`;

    console.log(`📊 [CURRENT OPTIONS] Fetching ${optionSymbols.length} option symbols for ${dateRange.expiryDate} expiry`);

    const optionsResponse = await fetch(optionsBarsUrl, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    });

    if (!optionsResponse.ok) {
      throw new Error(`Options data fetch failed: ${optionsResponse.status}`);
    }

    const optionsData = await optionsResponse.json();
    const bars = optionsData.bars || {};
    
    // STEP 4: Process and format options data
    const formattedOptions = [];
    let totalBars = 0;
    let symbolsWithData = 0;

    Object.entries(bars).forEach(([symbol, symbolBars]) => {
      if (Array.isArray(symbolBars) && symbolBars.length > 0) {
        symbolsWithData++;
        totalBars += symbolBars.length;
        
        // Get most recent bar for each symbol
        const latestBar = symbolBars[0]; // Sorted desc, so first is most recent
        
        // Parse symbol to extract strike and type
        const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
        if (match) {
          const [, , , optionType, strikeString] = match;
          const strike = parseInt(strikeString) / 1000; // Convert back to dollars
          
          formattedOptions.push({
            symbol: symbol,
            strike: `${strike}${optionType}`,
            bid: (latestBar.c * 0.95).toFixed(2), // Estimate bid as 95% of close
            ask: (latestBar.c * 1.05).toFixed(2), // Estimate ask as 105% of close
            last: latestBar.c.toFixed(2),
            vol: latestBar.v ? `${(latestBar.v / 1000).toFixed(1)}K` : "0K",
            oi: "N/A", // Not available in historical bars
            delta: optionType === 'C' ? "0.50" : "-0.50", // Simplified delta
            itm: optionType === 'C' ? strike < currentPrice : strike > currentPrice,
            timestamp: latestBar.t,
            expiry: dateRange.expiryDate
          });
        }
      }
    });

    // Sort by strike price
    formattedOptions.sort((a, b) => {
      const strikeA = parseFloat(a.strike);
      const strikeB = parseFloat(b.strike);
      return strikeA - strikeB;
    });

    console.log(`✅ [CURRENT OPTIONS] Processed ${symbolsWithData}/${optionSymbols.length} symbols, ${totalBars} total bars`);

    return res.json({
      data: formattedOptions,
      metadata: {
        ticker: ticker,
        strategy: dteInfo.dte,
        reason: dteInfo.reason,
        expiry_date: dateRange.expiryDate,
        data_date: dateRange.dataDate,
        current_price: currentPrice,
        center_strike: centerStrike,
        total_symbols_generated: optionSymbols.length,
        symbols_with_data: symbolsWithData,
        total_bars: totalBars,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ [CURRENT OPTIONS] Error:', error);
    return res.status(500).json({ 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== EXISTING ENDPOINTS ====================

// Main backtesting data endpoint - handles historical options data
app.post('/api/fetch-historical-data', async (req, res) => {
  try {
    const { dataType, start, end } = req.body;
    
    if (!dataType) {
      return res.status(400).json({ error: 'dataType parameter required' });
    }

    // Get API keys from environment (using paper trading keys for backtesting)
    const apiKey = process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_LIVE_API_KEY;
    const apiSecret = process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_LIVE_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'API keys not configured for backtesting server' });
    }

    console.log(`📊 [BACKTESTING] Processing ${dataType} request`);

    if (dataType === 'options_bars_by_dte') {
      // Fetch historical options bars for a specific DTE (Days to Expiration)
      const marketDataBaseUrl = 'https://data.alpaca.markets';
      
      // Required parameters
      const ticker = req.body.ticker;
      const expiryDate = req.body.expiryDate;
      const timeframe = req.body.timeframe || '1min';
      const limit = req.body.limit || 1000;
      const strikeRange = req.body.strikeRange || 10;
      const strikeSpacing = req.body.strikeSpacing || 5;
      
      if (!ticker || !expiryDate) {
        return res.status(400).json({ error: 'ticker and expiryDate parameters required for options_bars_by_dte' });
      }
      
      console.log('📊 [BACKTESTING] Fetching options data by DTE for:', ticker, 'expiry:', expiryDate);
      
      // STEP 1: Get underlying price range
      const underlyingUrl = `${marketDataBaseUrl}/v2/stocks/${ticker}/bars?start=${start}&end=${end}&timeframe=${timeframe}&limit=10000&feed=iex&adjustment=all`;
      
      const underlyingResponse = await fetch(underlyingUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });
      
      if (!underlyingResponse.ok) {
        const errorText = await underlyingResponse.text();
        return res.status(underlyingResponse.status).json({ error: `Failed to fetch underlying data: ${errorText}` });
      }
      
      const underlyingData = await underlyingResponse.json();
      const underlyingBars = underlyingData.bars || [];
      
      if (underlyingBars.length === 0) {
        return res.status(404).json({ error: 'No underlying price data found for the specified timeframe' });
      }
      
      // Calculate price range
      let minPrice = Math.min(...underlyingBars.map(bar => bar.l));
      let maxPrice = Math.max(...underlyingBars.map(bar => bar.h));
      const avgPrice = underlyingBars.reduce((sum, bar) => sum + bar.c, 0) / underlyingBars.length;
      
      console.log(`📊 [BACKTESTING] Underlying ${ticker} price analysis:`, {
        minPrice: minPrice.toFixed(2),
        maxPrice: maxPrice.toFixed(2), 
        avgPrice: avgPrice.toFixed(2),
        barsCount: underlyingBars.length
      });
      
      // STEP 2: Generate option symbols (Fixed format to match exact Alpaca requirements)
      const centerStrike = Math.round(avgPrice / strikeSpacing) * strikeSpacing;
      const optionSymbols = [];
      
      // Convert date from YYYY-MM-DD to YYMMDD format for Alpaca
      const dateObj = new Date(expiryDate);
      const year = dateObj.getFullYear().toString().slice(-2); // Last 2 digits of year
      const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
      const day = dateObj.getDate().toString().padStart(2, '0');
      const formattedDate = year + month + day;
      
      console.log(`📊 [BACKTESTING] Strike generation: centerStrike=${centerStrike}, strikeSpacing=${strikeSpacing}, strikeRange=${strikeRange}`);
      console.log(`📊 [BACKTESTING] Date conversion: ${expiryDate} -> ${formattedDate}`);
      
      for (let i = -strikeRange; i <= strikeRange; i++) {
        const strike = centerStrike + (i * strikeSpacing);
        if (strike > 0) {
          // Convert strike to proper Alpaca format: 5 digits for dollars + 3 digits for cents
          // Example: strike 300.00 becomes "00300000" (00300 dollars + 000 cents)
          // Example: strike 580.50 becomes "00580500" (00580 dollars + 500 cents)
          const dollars = Math.floor(strike);
          const cents = Math.round((strike - dollars) * 100);
          const strikeFormatted = dollars.toString().padStart(5, '0') + cents.toString().padStart(3, '0');
          
          if (i === 0) { // Log the center strike for debugging
            console.log(`📊 [BACKTESTING] Center strike example: ${strike} -> ${dollars}:${cents} -> ${strikeFormatted}`);
          }
          
          optionSymbols.push(`${ticker}${formattedDate}C${strikeFormatted}`);
          optionSymbols.push(`${ticker}${formattedDate}P${strikeFormatted}`);
        }
      }
      
      // STEP 3: Fetch options data using proper encoding like the user example
      const symbolsParam = optionSymbols.join(',');
      
      // Encode parameters properly like: start: '2024-03-03T00%3A00%3A00Z'
      const encodedStart = encodeURIComponent(start);
      const encodedEnd = encodeURIComponent(end);
      const encodedSymbols = encodeURIComponent(symbolsParam);

      const optionsBarsUrl = `${marketDataBaseUrl}/v1beta1/options/bars?symbols=${encodedSymbols}&timeframe=${timeframe}&start=${encodedStart}&end=${encodedEnd}&limit=${limit}&sort=asc`;

      console.log('📊 [BACKTESTING] Fetching options bars with URL:', optionsBarsUrl);
      console.log('📊 [BACKTESTING] Generated symbols:', optionSymbols.slice(0, 5), '... (showing first 5)');
      
      const optionsResponse = await fetch(optionsBarsUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });
      
      if (!optionsResponse.ok) {
        const errorText = await optionsResponse.text();
        return res.status(optionsResponse.status).json({ error: `Options data fetch failed: ${errorText}` });
      }
      
      const optionsData = await optionsResponse.json();
      const bars = optionsData.bars || {};
      
      let totalBars = 0;
      const symbolsWithData = [];
      
      Object.entries(bars).forEach(([symbol, symbolBars]) => {
        if (Array.isArray(symbolBars) && symbolBars.length > 0) {
          totalBars += symbolBars.length;
          symbolsWithData.push(symbol);
        }
      });
      
      console.log(`✅ [BACKTESTING] Received options data for ${symbolsWithData.length} out of ${optionSymbols.length} symbols, ${totalBars} total bars`);
      
      return res.json({ 
        data: {
          bars: bars,
          underlying_analysis: {
            ticker: ticker,
            price_range: { min: minPrice, max: maxPrice, average: avgPrice },
            center_strike: centerStrike,
            strike_spacing: strikeSpacing
          },
          symbol_generation: {
            total_generated: optionSymbols.length,
            symbols_with_data: symbolsWithData.length,
            generated_symbols: optionSymbols
          }
        },
        metadata: {
          ticker: ticker,
          expiry_date: expiryDate,
          total_symbols_generated: optionSymbols.length,
          symbols_with_data: symbolsWithData.length,
          total_bars: totalBars,
          timeframe: timeframe,
          date_range: { start: start, end: end }
        }
      });
    }

    if (dataType === 'options_bars_by_date_range') {
      // NEW: Multi-day options data with 0DTE and 1DTE for each trading day
      const marketDataBaseUrl = 'https://data.alpaca.markets';
      
      const ticker = req.body.ticker;
      const timeframe = req.body.timeframe || '1min';
      const strikeRange = req.body.strikeRange || 10;
      const strikeSpacing = req.body.strikeSpacing || 5;
      
      if (!ticker) {
        return res.status(400).json({ error: 'ticker parameter required for options_bars_by_date_range' });
      }
      
      console.log('📊 [BACKTESTING] Fetching multi-day options data with 0DTE and 1DTE for:', ticker);
      console.log('📅 [BACKTESTING] Date range:', start, 'to', end);
      
      // STEP 1: Get underlying price range for the entire period
      const underlyingUrl = `${marketDataBaseUrl}/v2/stocks/${ticker}/bars?start=${start}&end=${end}&timeframe=${timeframe}&limit=10000&feed=iex&adjustment=all`;
      
      const underlyingResponse = await fetch(underlyingUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });
      
      if (!underlyingResponse.ok) {
        const errorText = await underlyingResponse.text();
        return res.status(underlyingResponse.status).json({ error: `Failed to fetch underlying data: ${errorText}` });
      }
      
      const underlyingData = await underlyingResponse.json();
      const underlyingBars = underlyingData.bars || [];
      
      if (underlyingBars.length === 0) {
        return res.status(404).json({ error: 'No underlying price data found for the specified timeframe' });
      }
      
      // Calculate price range for strike generation
      let minPrice = Math.min(...underlyingBars.map(bar => bar.l));
      let maxPrice = Math.max(...underlyingBars.map(bar => bar.h));
      const avgPrice = underlyingBars.reduce((sum, bar) => sum + bar.c, 0) / underlyingBars.length;
      const centerStrike = Math.round(avgPrice / strikeSpacing) * strikeSpacing;
      
      console.log(`📊 [BACKTESTING] Underlying ${ticker} analysis:`, {
        minPrice: minPrice.toFixed(2),
        maxPrice: maxPrice.toFixed(2), 
        avgPrice: avgPrice.toFixed(2),
        centerStrike: centerStrike,
        barsCount: underlyingBars.length
      });
      
      // STEP 2: Generate trading days (exclude weekends)
      const tradingDays = [];
      const startDate = new Date(start);
      const endDate = new Date(end);
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        // Skip weekends (Saturday = 6, Sunday = 0)
        if (d.getDay() !== 0 && d.getDay() !== 6) {
          tradingDays.push(new Date(d).toISOString().split('T')[0]);
        }
      }
      
      console.log('📅 [BACKTESTING] Trading days:', tradingDays);
      
      // STEP 3: Generate all option symbols for all trading days (0DTE + 1DTE)
      const allOptionSymbols = [];
      const contractsByDay = {};
      
      tradingDays.forEach((currentDay, index) => {
        const daySymbols = [];
        
        // Convert date to YYMMDD format for Alpaca
        const dateObj = new Date(currentDay);
        const year = dateObj.getFullYear().toString().slice(-2);
        const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
        const day = dateObj.getDate().toString().padStart(2, '0');
        const formattedDate = year + month + day;
        
        // Generate strikes around center price
        for (let i = -strikeRange; i <= strikeRange; i++) {
          const strike = centerStrike + (i * strikeSpacing);
          if (strike > 0) {
            const dollars = Math.floor(strike);
            const cents = Math.round((strike - dollars) * 100);
            const strikeFormatted = dollars.toString().padStart(5, '0') + cents.toString().padStart(3, '0');
            
            // 0DTE contracts (expire same day)
            const call0DTE = `${ticker}${formattedDate}C${strikeFormatted}`;
            const put0DTE = `${ticker}${formattedDate}P${strikeFormatted}`;
            daySymbols.push(call0DTE, put0DTE);
            allOptionSymbols.push(call0DTE, put0DTE);
            
            // 1DTE contracts (expire next trading day)
            if (index < tradingDays.length - 1) {
              const nextDay = tradingDays[index + 1];
              const nextDateObj = new Date(nextDay);
              const nextYear = nextDateObj.getFullYear().toString().slice(-2);
              const nextMonth = (nextDateObj.getMonth() + 1).toString().padStart(2, '0');
              const nextDayFormatted = nextDateObj.getDate().toString().padStart(2, '0');
              const nextFormattedDate = nextYear + nextMonth + nextDayFormatted;
              
              const call1DTE = `${ticker}${nextFormattedDate}C${strikeFormatted}`;
              const put1DTE = `${ticker}${nextFormattedDate}P${strikeFormatted}`;
              daySymbols.push(call1DTE, put1DTE);
              allOptionSymbols.push(call1DTE, put1DTE);
            }
          }
        }
        
        contractsByDay[currentDay] = daySymbols;
      });
      
      console.log(`📊 [BACKTESTING] Generated ${allOptionSymbols.length} total option symbols across ${tradingDays.length} trading days`);
      
      // STEP 4: Fetch ALL bars for ALL contracts with pagination
      const allBars = {};
      let totalBarsAcrossAllContracts = 0;
      let contractsWithData = 0;
      
      // Function to fetch all pages for a batch of symbols
      async function fetchAllPagesForSymbols(symbols, maxBarsPerContract = 50000) {
        const symbolsParam = symbols.join(',');
        const encodedStart = encodeURIComponent(start);
        const encodedEnd = encodeURIComponent(end);
        const encodedSymbols = encodeURIComponent(symbolsParam);
        
        let allResults = {};
        let pageToken = null;
        let pageCount = 0;
        
        do {
          pageCount++;
          let url = `${marketDataBaseUrl}/v1beta1/options/bars?symbols=${encodedSymbols}&timeframe=${timeframe}&start=${encodedStart}&end=${encodedEnd}&limit=1000&sort=asc`;

          if (pageToken) {
            url += `&page_token=${encodeURIComponent(pageToken)}`;
          }

          console.log(`📄 [BACKTESTING] Fetching page ${pageCount} for ${symbols.length} symbols${pageToken ? ' (paginated)' : ''}`);
          
          const response = await fetch(url, {
            headers: {
              'APCA-API-KEY-ID': apiKey,
              'APCA-API-SECRET-KEY': apiSecret,
            },
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ [BACKTESTING] Page ${pageCount} failed:`, errorText);
            break;
          }
          
          const pageData = await response.json();
          const pageBars = pageData.bars || {};
          pageToken = pageData.next_page_token;
          
          // Merge this page's data
          Object.entries(pageBars).forEach(([symbol, symbolBars]) => {
            if (!allResults[symbol]) {
              allResults[symbol] = [];
            }
            if (Array.isArray(symbolBars)) {
              allResults[symbol] = allResults[symbol].concat(symbolBars);
              
              // Limit bars per contract to prevent memory issues
              if (allResults[symbol].length > maxBarsPerContract) {
                allResults[symbol] = allResults[symbol].slice(0, maxBarsPerContract);
                console.log(`⚠️ [BACKTESTING] Limited ${symbol} to ${maxBarsPerContract} bars`);
              }
            }
          });
          
          console.log(`✅ [BACKTESTING] Page ${pageCount}: +${Object.keys(pageBars).length} symbols with data`);
          
        } while (pageToken && pageCount < 100); // Safety limit on pages
        
        return allResults;
      }
      
      // Process contracts in batches to avoid URL length limits
      const batchSize = 50; // 50 symbols per batch
      for (let i = 0; i < allOptionSymbols.length; i += batchSize) {
        const batch = allOptionSymbols.slice(i, i + batchSize);
        console.log(`🔄 [BACKTESTING] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allOptionSymbols.length/batchSize)}: ${batch.length} symbols`);
        
        try {
          const batchResults = await fetchAllPagesForSymbols(batch);
          
          // Merge batch results into main results
          Object.entries(batchResults).forEach(([symbol, symbolBars]) => {
            if (symbolBars.length > 0) {
              allBars[symbol] = symbolBars;
              totalBarsAcrossAllContracts += symbolBars.length;
              contractsWithData++;
            }
          });
          
          // Add small delay between batches to avoid rate limits
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (error) {
          console.error(`❌ [BACKTESTING] Batch ${Math.floor(i/batchSize) + 1} failed:`, error);
        }
      }
      
      console.log(`✅ [BACKTESTING] FINAL RESULTS: ${contractsWithData} contracts with data, ${totalBarsAcrossAllContracts} total bars`);
      
      // STEP 5: Return comprehensive results
      return res.json({ 
        data: {
          bars: allBars,
          underlying_analysis: {
            ticker: ticker,
            price_range: { min: minPrice, max: maxPrice, average: avgPrice },
            center_strike: centerStrike,
            strike_spacing: strikeSpacing
          },
          trading_days: tradingDays,
          contracts_by_day: contractsByDay,
          symbol_generation: {
            total_generated: allOptionSymbols.length,
            symbols_with_data: contractsWithData,
            generated_symbols: allOptionSymbols.slice(0, 20), // First 20 for reference
            contracts_by_day_count: Object.keys(contractsByDay).reduce((acc, day) => {
              acc[day] = contractsByDay[day].length;
              return acc;
            }, {})
          }
        },
        metadata: {
          ticker: ticker,
          total_symbols_generated: allOptionSymbols.length,
          symbols_with_data: contractsWithData,
          total_bars: totalBarsAcrossAllContracts,
          timeframe: timeframe,
          date_range: { start: start, end: end },
          trading_days_count: tradingDays.length,
          includes_0dte: true,
          includes_1dte: true,
          pagination_used: true
        }
      });
    }

    if (dataType === 'options_bars_by_historical_dte') {
      // Historical DTE endpoint with automatic expiration calculation
      const marketDataBaseUrl = 'https://data.alpaca.markets';
      
      const ticker = req.body.ticker;
      const dteType = req.body.dteType;
      const timeframe = req.body.timeframe || '1min';
      const limit = req.body.limit || 1000;
      const strikeRange = req.body.strikeRange || 10;
      const strikeSpacing = req.body.strikeSpacing || 5;
      
      if (!ticker || !dteType) {
        return res.status(400).json({ error: 'ticker and dteType parameters required for options_bars_by_historical_dte' });
      }
      
      console.log('📊 [BACKTESTING] Fetching historical options data with automatic DTE calculation:', ticker, 'dteType:', dteType);
      
      // Helper functions for date calculations
      function getExpirationDate(tradingDate, dteType) {
        const date = new Date(tradingDate);
        switch (dteType) {
          case '0DTE':
            return date;
          case 'weekly':
            const daysUntilFriday = (5 - date.getDay()) % 7;
            const friday = new Date(date);
            friday.setDate(date.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday));
            return friday;
          case 'monthly':
            const year = date.getFullYear();
            const month = date.getMonth();
            const thirdFriday = new Date(year, month, 1);
            const firstFriday = 1 + (5 - thirdFriday.getDay() + 7) % 7;
            thirdFriday.setDate(firstFriday + 14);
            if (thirdFriday < date) {
              const nextMonth = new Date(year, month + 1, 1);
              const nextFirstFriday = 1 + (5 - nextMonth.getDay() + 7) % 7;
              nextMonth.setDate(nextFirstFriday + 14);
              return nextMonth;
            }
            return thirdFriday;
          default:
            throw new Error(`Invalid DTE type: ${dteType}`);
        }
      }
      
      function formatDateYYMMDD(date) {
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return year + month + day;
      }
      
      function isTradingDay(date) {
        const day = date.getDay();
        return day >= 1 && day <= 5;
      }
      
      // Generate trading days and expiration dates
      const startDate = new Date(start);
      const endDate = new Date(end);
      const tradingDays = [];
      const expirationDates = new Set();
      
      for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (isTradingDay(d)) {
          const tradingDay = new Date(d);
          const expiryDate = getExpirationDate(tradingDay, dteType);
          const expiryYYMMDD = formatDateYYMMDD(expiryDate);
          
          tradingDays.push({
            tradingDate: new Date(d),
            expiryDate: expiryDate,
            expiryYYMMDD: expiryYYMMDD
          });
          
          expirationDates.add(expiryYYMMDD);
        }
      }
      
      console.log(`📅 [BACKTESTING] Generated ${tradingDays.length} trading days with ${expirationDates.size} unique expiration dates`);
      
      // Get underlying data for strike calculation
      const underlyingBarsUrl = `${marketDataBaseUrl}/v2/stocks/bars?symbols=${ticker}&timeframe=${timeframe}&start=${start}&end=${end}&limit=${limit}&sort=asc`;
      
      const underlyingResponse = await fetch(underlyingBarsUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!underlyingResponse.ok) {
        throw new Error(`Failed to fetch underlying data: ${underlyingResponse.status}`);
      }

      const underlyingData = await underlyingResponse.json();
      const underlyingBars = underlyingData.bars?.[ticker] || [];
      
      if (underlyingBars.length === 0) {
        throw new Error(`No underlying data found for ${ticker}`);
      }
      
      // Calculate strikes
      const prices = underlyingBars.map(bar => (bar.h + bar.l) / 2);
      const minPrice = Math.min(...prices);
      const maxPrice = Math.max(...prices);
      const avgPrice = prices.reduce((a, b) => a + b) / prices.length;
      const centerStrike = Math.round(avgPrice / strikeSpacing) * strikeSpacing;
      const strikes = [];
      
      for (let i = -strikeRange; i <= strikeRange; i++) {
        const strike = centerStrike + (i * strikeSpacing);
        if (strike > 0) {
          strikes.push(strike);
        }
      }
      
      // Generate option symbols for all expiration dates
      const allOptionSymbols = [];
      Array.from(expirationDates).forEach(expiryYYMMDD => {
        strikes.forEach(strike => {
          // Proper Alpaca format: 5 digits for dollars + 3 digits for cents
          const dollars = Math.floor(strike);
          const cents = Math.round((strike - dollars) * 100);
          const strikeStr = dollars.toString().padStart(5, '0') + cents.toString().padStart(3, '0');
          allOptionSymbols.push(`${ticker}${expiryYYMMDD}C${strikeStr}`);
          allOptionSymbols.push(`${ticker}${expiryYYMMDD}P${strikeStr}`);
        });
      });
      
      console.log(`📋 [BACKTESTING] Generated ${allOptionSymbols.length} total option symbols across ${expirationDates.size} expiration dates`);
      
      // Fetch options data in batches
      const batchSize = 50;
      const allBars = {};
      let totalBars = 0;
      let symbolsWithData = 0;
      
      for (let i = 0; i < allOptionSymbols.length; i += batchSize) {
        const batch = allOptionSymbols.slice(i, i + batchSize);
        const symbolsParam = encodeURIComponent(batch.join(','));

        const optionsBarsUrl = `${marketDataBaseUrl}/v1beta1/options/bars?symbols=${symbolsParam}&timeframe=${timeframe}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=${limit}&sort=asc`;

        console.log(`📊 [BACKTESTING] Fetching batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(allOptionSymbols.length/batchSize)}: ${batch.length} symbols`);
        
        const response = await fetch(optionsBarsUrl, {
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
        });

        if (!response.ok) {
          console.log(`⚠️ [BACKTESTING] Batch ${Math.floor(i/batchSize) + 1} failed: ${response.status}`);
          continue;
        }

        const data = await response.json();
        
        if (data.bars) {
          Object.entries(data.bars).forEach(([symbol, bars]) => {
            if (bars && bars.length > 0) {
              allBars[symbol] = bars;
              totalBars += bars.length;
              symbolsWithData++;
            }
          });
        }
      }
      
      console.log(`✅ [BACKTESTING] Successfully fetched data for ${symbolsWithData} symbols with ${totalBars} total bars`);
      
      return res.json({
        data: {
          bars: allBars,
          underlying_analysis: {
            ticker: ticker,
            price_range: { min: minPrice, max: maxPrice, average: avgPrice },
            center_strike: centerStrike,
            strike_spacing: strikeSpacing
          },
          symbol_generation: {
            total_generated: allOptionSymbols.length,
            symbols_with_data: symbolsWithData,
            generated_symbols: allOptionSymbols
          }
        },
        metadata: {
          total_symbols_generated: allOptionSymbols.length,
          symbols_with_data: symbolsWithData,
          total_bars: totalBars,
          expiration_dates: Array.from(expirationDates),
          trading_days_analyzed: tradingDays.length,
          dte_type: dteType
        }
      });
    }

    if (dataType === 'bars') {
      // Fetch historical stock bars for backtesting underlying data
      const marketDataBaseUrl = 'https://data.alpaca.markets';
      
      const symbol = req.body.symbol;
      const timeframe = req.body.timeframe || '1min';
      const limit = req.body.limit || 10000;
      
      if (!symbol) {
        return res.status(400).json({ error: 'symbol parameter required for bars' });
      }
      
      console.log(`📊 [BACKTESTING] Fetching historical bars for ${symbol}`);
      
      // Convert timeframe format (1Min -> 1min)
      const alpacaTimeframe = timeframe.replace('Min', 'min').replace('Hour', 'hour').replace('Day', 'day');
      
      const barsUrl = `${marketDataBaseUrl}/v2/stocks/${symbol}/bars?start=${start}&end=${end}&timeframe=${alpacaTimeframe}&limit=${limit}&feed=iex&adjustment=all`;
      
      const response = await fetch(barsUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: `Failed to fetch stock bars: ${errorText}` });
      }
      
      const data = await response.json();
      const bars = data.bars || [];
      
      console.log(`✅ [BACKTESTING] Received ${bars.length} bars for ${symbol}`);
      
      return res.json({
        data: { bars: bars },
        metadata: {
          symbol: symbol,
          total_bars: bars.length,
          timeframe: alpacaTimeframe,
          date_range: { start: start, end: end }
        }
      });
    }

    // For other data types, return placeholder
    res.json({ 
      message: 'Backtesting server endpoint - add more dataTypes as needed',
      dataType: dataType,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ [BACKTESTING] Server Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== BACKTEST API ENDPOINTS ====================

/**
 * Run a complete backtest
 * POST /api/backtest/run
 */
app.post('/api/backtest/run', async (req, res) => {
  try {
    const {
      strategy = 'HAVWAP-Rev-v2',
      symbol = 'SPY',
      startDate,
      endDate,
      timeframe = '1Min',
      initialCapital = 10000,
      parameters = {}
    } = req.body;

    console.log(`\n🚀 [BACKTEST] Starting backtest:`);
    console.log(`   Strategy: ${strategy}`);
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Date Range: ${startDate} to ${endDate}`);
    console.log(`   Timeframe: ${timeframe}`);
    console.log(`   Initial Capital: $${initialCapital.toLocaleString()}`);
    if (Object.keys(parameters).length > 0) {
      console.log(`   🎛️  Optimization Parameters (${Object.keys(parameters).length}):`);
      Object.entries(parameters).forEach(([key, value]) => {
        if (typeof value === 'number') {
          console.log(`      ${key}: ${typeof value === 'number' && value < 1 ? value.toFixed(6) : value}`);
        } else {
          console.log(`      ${key}: ${value}`);
        }
      });
    }
    const backtestResult = await pool.query(`
      INSERT INTO backtests (
        strategy_name, symbol, start_date, end_date, 
        initial_capital, status, parameters, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING id
    `, [strategy, symbol, startDate, endDate, initialCapital, 'running', JSON.stringify(parameters)]);

    const backtestId = backtestResult.rows[0].id;

    console.log(`✅ [BACKTEST] Created backtest record ID: ${backtestId}`);

    // Calculate estimated completion time (rough estimate based on date range)
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();
    const daysDiff = Math.max(1, (endMs - startMs) / (1000 * 60 * 60 * 24));
    const estimatedSeconds = Math.ceil(daysDiff * 10 + 15); // ~10s per day + 15s base

    console.log(`⏱️  [BACKTEST] Estimated completion: ${estimatedSeconds}s`);

    // Return immediate response with backtest ID and ETA
    res.json({
      success: true,
      backtestId: backtestId,
      status: 'running',
      message: 'Backtest initiated successfully',
      estimatedSeconds: estimatedSeconds,
      estimatedCompletionTime: new Date(Date.now() + estimatedSeconds * 1000).toISOString(),
      config: {
        strategy,
        symbol,
        startDate,
        endDate,
        initialCapital
      }
    });

    // Run backtest asynchronously (don't await - let it run in background)
    (async () => {
      try {
        console.log(`\n📊 [BACKTEST ${backtestId}] Running backtest engine...`);
        
        // Load strategy class
        let StrategyClass;
        if (strategy === 'HAVWAP-Rev-v2' || strategy === 'HAVWAP') {
          const HAVWAPOptionsStrategy = require('./strategies/havwap-options.js');
          StrategyClass = HAVWAPOptionsStrategy;
        } else if (strategy === 'havwap-proper' || strategy === 'HAVWAP-Proper' || strategy === 'HAVWAP-Multi-Anchor') {
          const HAVWAPProperStrategy = require('./strategies/havwap-proper.js');
          StrategyClass = HAVWAPProperStrategy;
        } else if (strategy === 'havwap-options') {
          const HAVWAPOptionsStrategy = require('./strategies/havwap-options.js');
          StrategyClass = HAVWAPOptionsStrategy;
        } else if (strategy === 'rsi-roc-vwap-confluence') {
          const RSIROCVWAPStrategy = require('./strategies/rsi-roc-vwap-confluence.js');
          StrategyClass = RSIROCVWAPStrategy;
        } else if (strategy === 'havwap-optimized') {
          const HAVWAPOptimizedStrategy = require('./strategies/havwap-optimized.js');
          StrategyClass = HAVWAPOptimizedStrategy;
        } else if (strategy === 'vwap-execution-adaptive') {
          const VWAPExecutionStrategy = require('./strategies/vwap-execution-adaptive.js');
          StrategyClass = VWAPExecutionStrategy;
        } else {
          throw new Error(`Unknown strategy: ${strategy}`);
        }
        
        // Instantiate strategy with parameters - pass ALL parameters from optimization
        const strategyInstance = new StrategyClass({
          ...parameters, // Pass all optimization parameters
          // Legacy fallbacks for old parameters
          vwapPeriod: parameters.vwapPeriod || 60,
          priceVwapThreshold: parameters.priceVwapThreshold || 0.0005,
          slopeThreshold: parameters.slopeThreshold || 0.00001,
          threshold: parameters.threshold || 0.001,
          deltaTarget: parameters.deltaTarget || 0.30
        });
        
        const BacktestEngine = require('./engine/backtest-engine.js');
        const engine = new BacktestEngine(pool, alpacaClient);
        
        const result = await engine.runBacktest({
          backtestId,
          strategy: strategyInstance,
          symbol,
          startDate,
          endDate,
          timeframe,
          initialCapital
        });

        console.log(`✅ [BACKTEST ${backtestId}] Backtest completed successfully`);
        console.log(`   Total Trades: ${result.performance?.totalTrades || 0}`);
        console.log(`   Total Return: ${((result.performance?.totalReturn || 0) * 100).toFixed(2)}%`);
        console.log(`   Win Rate: ${((result.performance?.winRate || 0) * 100).toFixed(1)}%`);
        
      } catch (error) {
        console.error(`❌ [BACKTEST ${backtestId}] Error in background execution:`, error);
        console.error(error.stack);
        
        // Update backtest record with error
        await pool.query(`
          UPDATE backtests 
          SET status = 'failed', 
              error_message = $1,
              completed_at = NOW()
          WHERE id = $2
        `, [error.message, backtestId]);
      }
    })();
    
  } catch (error) {
    console.error('❌ [BACKTEST] Error running backtest:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get recent backtest results
 * GET /api/backtest/recent?limit=10
 */
app.get('/api/backtest/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const result = await pool.query(`
      SELECT 
        id, strategy_name, symbol, start_date, end_date,
        initial_capital, final_capital, total_return, 
        win_rate, sharpe_ratio, max_drawdown,
        total_trades, winning_trades, losing_trades,
        status, created_at, completed_at
      FROM backtests
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    res.json(result.rows);
  } catch (error) {
    console.error('❌ [BACKTEST] Error fetching recent backtests:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get backtest status and results
 * GET /api/backtest/status/:id
 */
app.get('/api/backtest/status/:id', async (req, res) => {
  try {
    const backtestId = req.params.id;

    const result = await pool.query(`
      SELECT 
        b.*,
        COUNT(oc.id) as contract_count
      FROM backtests b
      LEFT JOIN option_contracts oc ON b.id = oc.backtest_id
      WHERE b.id = $1
      GROUP BY b.id
    `, [backtestId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Backtest not found' });
    }

    res.json(result.rows[0]);

  } catch (error) {
    console.error('❌ [BACKTEST] Error fetching backtest status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get trades for a specific backtest
 * GET /api/backtest/:id/trades
 */
app.get('/api/backtest/:id/trades', async (req, res) => {
  try {
    const backtestId = req.params.id;

    const result = await pool.query(`
      SELECT 
        id, instance_id, contract_symbol, underlying_symbol,
        strike_price, expiry_date, option_type,
        entry_timestamp, entry_price, entry_delta, entry_gamma, entry_theta, entry_vega, entry_rho, entry_iv,
        exit_timestamp, exit_price, exit_delta, exit_gamma, exit_theta, exit_vega, exit_rho, exit_iv,
        quantity, gross_pnl, net_pnl, fees, return_pct,
        status, close_reason, created_at
      FROM option_contracts
      WHERE backtest_id = $1
      ORDER BY entry_timestamp
    `, [backtestId]);

    // Return array directly for frontend compatibility
    res.json(result.rows);

  } catch (error) {
    console.error('❌ [BACKTEST] Error fetching trades:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get signals for a specific backtest
 * GET /api/backtest/:id/signals
 */
app.get('/api/backtest/:id/signals', async (req, res) => {
  try {
    const backtestId = req.params.id;

    const result = await pool.query(`
      SELECT 
        id, timestamp, signal_type, symbol,
        underlying_price, indicator_values,
        target_delta, target_strike, target_expiry,
        executed, contract_id, created_at
      FROM strategy_signals
      WHERE backtest_id = $1
      ORDER BY timestamp
    `, [backtestId]);

    res.json({
      backtestId: parseInt(backtestId),
      signals: result.rows,
      totalSignals: result.rows.length
    });

  } catch (error) {
    console.error('❌ [BACKTEST] Error fetching signals:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * REAL Python Optuna Optimization (Engine-Level Optuna)
 * POST /api/optimize/optuna
 */
// Universal Strategy Optimization Endpoint
app.post('/api/optimize/universal', async (req, res) => {
  try {
    const { strategy, symbol, startDate, endDate, maxTrials = 50 } = req.body;
    
    if (!strategy || !symbol || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters: strategy, symbol, startDate, endDate'
      });
    }
    
    const optimizationId = Date.now();
    
    // Helper function to find next trading day (skip weekends)
    function getNextTradingDay(date) {
      const nextDay = new Date(date);
      while (nextDay.getDay() === 0 || nextDay.getDay() === 6) { // Sunday = 0, Saturday = 6
        nextDay.setDate(nextDay.getDate() + 1);
      }
      return nextDay;
    }
    
    // Helper function to find previous trading day (skip weekends)
    function getPreviousTradingDay(date) {
      const prevDay = new Date(date);
      while (prevDay.getDay() === 0 || prevDay.getDay() === 6) {
        prevDay.setDate(prevDay.getDate() - 1);
      }
      return prevDay;
    }
    
    // Split date range for train/validation using TRADING DAYS ONLY
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Ensure start and end are trading days
    const tradingStart = getNextTradingDay(start);
    const tradingEnd = getPreviousTradingDay(end);
    
    // Count trading days between start and end
    let tradingDays = 0;
    const countDate = new Date(tradingStart);
    while (countDate <= tradingEnd) {
      if (countDate.getDay() !== 0 && countDate.getDay() !== 6) { // Not weekend
        tradingDays++;
      }
      countDate.setDate(countDate.getDate() + 1);
    }
    
    // For very short periods (< 3 trading days), use different approach
    let trainEnd, validStart;
    if (tradingDays < 3) {
      // Use most trading days for training, last trading day for validation
      trainEnd = new Date(tradingEnd.getTime() - 24 * 60 * 60 * 1000);
      trainEnd = getPreviousTradingDay(trainEnd);
      validStart = tradingEnd;
    } else {
      // Use 70% of trading days for training
      const trainTradingDays = Math.ceil(tradingDays * 0.7);
      
      // Count forward to find training end
      let dayCount = 0;
      trainEnd = new Date(tradingStart);
      while (dayCount < trainTradingDays) {
        if (trainEnd.getDay() !== 0 && trainEnd.getDay() !== 6) {
          dayCount++;
        }
        if (dayCount < trainTradingDays) {
          trainEnd.setDate(trainEnd.getDate() + 1);
        }
      }
      
      // Validation starts on next trading day
      validStart = new Date(trainEnd.getTime() + 24 * 60 * 60 * 1000);
      validStart = getNextTradingDay(validStart);
    }
    
    const config = {
      strategy: strategy,
      symbol: symbol,
      train_start: tradingStart.toISOString().split('T')[0],
      train_end: trainEnd.toISOString().split('T')[0],
      valid_start: validStart.toISOString().split('T')[0],
      valid_end: tradingEnd.toISOString().split('T')[0],
      max_trials: maxTrials
    };
    
    console.log(`🚀 Starting UNIVERSAL optimization ${optimizationId}`, config);
    
    // Spawn Python universal optimizer
    const pythonArgs = [
      '/app/python_optuna/universal_optimizer.py',
      '--strategy', strategy,
      '--symbol', symbol,
      '--train-start', config.train_start,
      '--train-end', config.train_end,
      '--valid-start', config.valid_start,
      '--valid-end', config.valid_end,
      '--max-trials', maxTrials.toString(),
      '--backtest-url', 'http://localhost:3002'
    ];
    
    const pythonProcess = spawn('python3', pythonArgs);
    
    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Universal-${optimizationId}] ${data.toString()}`);
    });
    
    pythonProcess.stderr.on('data', (data) => {
      console.error(`[Universal-${optimizationId}] ERROR: ${data.toString()}`);
    });
    
    pythonProcess.on('close', (code) => {
      console.log(`[Universal-${optimizationId}] Process finished with code ${code}`);
    });
    
    res.json({
      success: true,
      optimizationId: optimizationId,
      status: 'running',
      message: 'UNIVERSAL strategy optimization started',
      config: config,
      method: 'Universal Auto-Detection with Optuna TPE',
      expected_duration: `${Math.ceil(maxTrials * 0.1)} minutes`
    });
    
  } catch (error) {
    console.error('Universal optimization error:', error);
    res.status(500).json({
      success: false,
      message: 'Universal optimization failed',
      error: error.message
    });
  }
});

// Get available strategies endpoint
app.get('/api/strategies', async (req, res) => {
  try {
    const strategies = [
      'havwap-proper',
      'HAVWAP-Rev-v2', 
      'rsi-roc-vwap-confluence',
      'havwap-optimized',
      'vwap-execution-adaptive',
      'havwap-options'
    ];
    
    res.json({
      success: true,
      strategies: strategies,
      message: 'Available strategies for optimization'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get strategies',
      error: error.message
    });
  }
});

app.post('/api/optimize/optuna', async (req, res) => {
  try {
    console.log('🔥 [OPTUNA] Starting REAL Python Optuna optimization');
    
    const {
      maxTrials = 100,
      startDate = '2024-09-01',
      endDate = '2024-10-25',
      symbol = 'SPY',
      strategyName = 'HAVWAP'
    } = req.body;
    
    // Calculate train/validation split
    const moment = require('moment');
    const totalDays = moment(endDate).diff(moment(startDate), 'days');
    const trainDays = Math.floor(totalDays * 0.7);
    
    const trainEnd = moment(startDate).add(trainDays, 'days').format('YYYY-MM-DD');
    const validStart = moment(trainEnd).add(1, 'day').format('YYYY-MM-DD');
    
    const config = {
      strategy: strategyName,
      symbol: symbol,
      train_start: startDate,
      train_end: trainEnd,
      valid_start: validStart,
      valid_end: endDate,
      max_trials: maxTrials
    };
    
    console.log(`📊 [OPTUNA] Configuration:`, config);
    
    const optimizationId = Date.now();
    
    // Return immediate response
    res.json({
      success: true,
      optimizationId: optimizationId,
      status: 'running',
      message: 'REAL Python Optuna optimization started',
      config: config,
      method: 'Optuna TPE (Bayesian)',
      expected_duration: `${Math.ceil(maxTrials / 10)} minutes`
    });
    
    // Run Python Optuna optimization in background
    setTimeout(async () => {
      try {
        console.log(`🚀 [OPTUNA ${optimizationId}] Starting Python Optuna optimization`);
        
        const { spawn } = require('child_process');
        
        // Run Python Optuna optimizer
        const pythonProcess = spawn('python3', [
          '/app/python_optuna/optuna_optimizer.py',
          '--symbol', config.symbol,
          '--train-start', config.train_start,
          '--train-end', config.train_end,
          '--valid-start', config.valid_start,
          '--valid-end', config.valid_end,
          '--max-trials', config.max_trials.toString(),
          '--backtest-url', 'http://localhost:3002'
        ], {
          cwd: '/app/python_optuna',
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let outputData = '';
        let errorData = '';
        
        pythonProcess.stdout.on('data', (data) => {
          const output = data.toString();
          outputData += output;
          console.log(`[OPTUNA ${optimizationId}] ${output.trim()}`);
        });
        
        pythonProcess.stderr.on('data', (data) => {
          const error = data.toString();
          errorData += error;
          console.error(`[OPTUNA ${optimizationId}] ERROR: ${error.trim()}`);
        });
        
        pythonProcess.on('close', (code) => {
          if (code === 0) {
            console.log(`✅ [OPTUNA ${optimizationId}] Python optimization completed successfully`);
            console.log(`   Check results in python_optuna/ directory`);
          } else {
            console.error(`❌ [OPTUNA ${optimizationId}] Python optimization failed with code ${code}`);
            if (errorData) {
              console.error(`   Error details: ${errorData}`);
            }
          }
        });
        
      } catch (error) {
        console.error(`❌ [OPTUNA ${optimizationId}] Error in Python optimization: ${error.message}`);
      }
    }, 100);
    
  } catch (error) {
    console.error('❌ [OPTUNA] Error setting up optimization:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Failed to start Python Optuna optimization'
    });
  }
});
app.post('/api/optimize/havwap', async (req, res) => {
  try {
    console.log('🎯 [OPTIMIZATION] Starting Engine-Level HAVWAP parameter optimization');
    
    const {
      maxIterations = 100,
      startDate = '2024-10-15',
      endDate = '2024-10-25',
      symbols = ['SPY'],
      primaryMetric = 'sharpe_ratio',
      earlyStopping = true,
      strategyName = 'HAVWAP'
    } = req.body;
    
    // Create optimization config for the engine
    const config = {
      strategyName,
      maxIterations,
      startDate,
      endDate,
      symbols,
      primaryMetric,
      earlyStopping,
      initialCapital: 10000,
      maxPositions: 1,
      contracts: 1
    };
    
    console.log(`📊 [OPTIMIZATION] Configuration:`, config);
    
    // Check if alpacaClient is properly initialized
    if (!alpacaClient) {
      return res.status(500).json({
        success: false,
        error: 'Alpaca client not initialized. Cannot run optimization.',
        message: 'Please check Alpaca API credentials in environment variables.'
      });
    }
    
    console.log(`✅ [OPTIMIZATION] Using configured Alpaca client`);
    
    // Create BacktestEngine with server resources
    const BacktestEngine = require('./engine/backtest-engine');
    const engine = new BacktestEngine(pool, alpacaClient);
    
    const optimizationId = Date.now();
    
    // Return immediate response
    res.json({
      success: true,
      optimizationId: optimizationId,
      status: 'running',
      message: 'Engine-level parameter optimization started',
      config: config
    });
    
    // Run optimization in background using engine methods
    setTimeout(async () => {
      try {
        console.log(`� [OPTIMIZATION ${optimizationId}] Starting engine-level optimization`);
        
        // Use the engine's optimization method
        const results = await engine.runOptimization(config);
        
        if (results.success) {
          console.log(`✅ [OPTIMIZATION ${optimizationId}] Completed successfully`);
          console.log(`   Best Score: ${results.bestScore.toFixed(4)}`);
          console.log(`   Total Tests: ${results.totalIterations}`);
          console.log(`   Duration: ${results.duration.toFixed(1)} minutes`);
          console.log(`   Best Parameters:`, results.bestParams);
          
          if (results.resultsFile) {
            console.log(`   📁 Results saved to: ${results.resultsFile}`);
          }
          if (results.strategyFile) {
            console.log(`   📄 Optimized strategy: ${results.strategyFile}`);
          }
          
        } else {
          console.error(`❌ [OPTIMIZATION ${optimizationId}] Failed: ${results.error}`);
        }
        
      } catch (error) {
        console.error(`❌ [OPTIMIZATION ${optimizationId}] Error in background execution: ${error.message}`);
        console.error(error.stack);
      }
    }, 100);
    
  } catch (error) {
    console.error('❌ [OPTIMIZATION] Error starting optimization:', error);
    res.status(500).json({ 
      error: error.message,
      stack: error.stack 
    });
  }
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backtesting Server running on port ${PORT}`);
  console.log(`📊 Dedicated to historical data processing and backtesting operations`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Network access: http://0.0.0.0:${PORT}/health`);
});

module.exports = app;