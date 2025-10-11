const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
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
      
      console.log(`📊 [BACKTESTING] Strike generation: centerStrike=${centerStrike}, strikeSpacing=${strikeSpacing}, strikeRange=${strikeRange}`);
      
      for (let i = -strikeRange; i <= strikeRange; i++) {
        const strike = centerStrike + (i * strikeSpacing);
        if (strike > 0) {
          // Convert strike to proper format: strike price in cents, then pad to 8 digits
          // Example: strike 200.00 becomes "00200000" (like IWM240304C00200000)
          // Example: strike 652.00 becomes "00652000" (like SPY251014C00652000)
          // The format is: dollars * 1000 (so 200.00 -> 200000, then pad to 8 digits)
          const strikeCents = Math.round(strike * 1000);
          const strikeFormatted = String(strikeCents).padStart(8, '0');
          
          if (i === 0) { // Log the center strike for debugging
            console.log(`📊 [BACKTESTING] Center strike example: ${strike} -> ${strikeCents} -> ${strikeFormatted}`);
          }
          
          optionSymbols.push(`${ticker}${expiryDate}C${strikeFormatted}`);
          optionSymbols.push(`${ticker}${expiryDate}P${strikeFormatted}`);
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
          const strikeStr = (strike * 1000).toString().padStart(8, '0');
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
app.listen(PORT, () => {
  console.log(`🚀 Backtesting Server running on port ${PORT}`);
  console.log(`📊 Dedicated to historical data processing and backtesting operations`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;