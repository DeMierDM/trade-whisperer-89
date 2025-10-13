const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const moment = require('moment-timezone');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3002;

// Database connection (shared with main server)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json());

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

    // STEP 3: Fetch options data
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

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Backtesting Server running on port ${PORT}`);
  console.log(`📊 Dedicated to historical data processing and backtesting operations`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Network access: http://0.0.0.0:${PORT}/health`);
});

module.exports = app;