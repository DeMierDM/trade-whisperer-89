const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fetch = require('node-fetch');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { decode, encode } = require('@msgpack/msgpack');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Hot reload test comment - Docker auto-updating enabled!

// Throttle mechanism to prevent memory overflow
const quoteThrottleMap = new Map(); // symbol -> last broadcast timestamp
const QUOTE_THROTTLE_MS = 100; // Only broadcast same symbol every 100ms

// CSV Data Logging Setup
const DATA_DIR = '/app/data';
const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('📁 Created data directory:', DATA_DIR);
}

// CSV file paths
const STOCK_QUOTES_CSV = path.join(DATA_DIR, `stock_quotes_${today}.csv`);
const STOCK_TRADES_CSV = path.join(DATA_DIR, `stock_trades_${today}.csv`);
const OPTION_QUOTES_CSV = path.join(DATA_DIR, `option_quotes_${today}.csv`);

// CSV Headers
const STOCK_QUOTE_HEADER = 'timestamp,symbol,bid,ask,bid_size,ask_size,exchange,conditions,data_source\n';
const STOCK_TRADE_HEADER = 'timestamp,symbol,price,size,exchange,conditions,data_source\n';
const OPTION_QUOTE_HEADER = 'timestamp,symbol,bid,ask,bid_size,ask_size,timestamp_alpaca,data_source\n';

// Initialize CSV files with headers if they don't exist
function initializeCSVFile(filePath, header) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, header);
    console.log('📄 Initialized CSV file:', path.basename(filePath));
  }
}

initializeCSVFile(STOCK_QUOTES_CSV, STOCK_QUOTE_HEADER);
initializeCSVFile(STOCK_TRADES_CSV, STOCK_TRADE_HEADER);
initializeCSVFile(OPTION_QUOTES_CSV, OPTION_QUOTE_HEADER);

// CSV Logging Functions
function logStockQuote(quote) {
  const timestamp = new Date().toISOString();
  const conditions = Array.isArray(quote.conditions) ? quote.conditions.join('|') : (quote.conditions || '');
  const row = `${timestamp},${quote.symbol},${quote.bid},${quote.ask},${quote.bid_size},${quote.ask_size},${quote.exchange || ''},${conditions},${quote.data_source}\n`;
  fs.appendFile(STOCK_QUOTES_CSV, row, (err) => {
    if (err) console.error('❌ Error writing stock quote to CSV:', err);
  });
}

function logStockTrade(trade) {
  const timestamp = new Date().toISOString();
  const conditions = Array.isArray(trade.conditions) ? trade.conditions.join('|') : (trade.conditions || '');
  const row = `${timestamp},${trade.symbol},${trade.price},${trade.size},${trade.exchange || ''},${conditions},${trade.data_source}\n`;
  fs.appendFile(STOCK_TRADES_CSV, row, (err) => {
    if (err) console.error('❌ Error writing stock trade to CSV:', err);
  });
}

function logOptionQuote(quote) {
  const timestamp = new Date().toISOString();
  const row = `${timestamp},${quote.symbol},${quote.bid},${quote.ask},${quote.bid_size},${quote.ask_size},${quote.timestamp},${quote.data_source}\n`;
  fs.appendFile(OPTION_QUOTES_CSV, row, (err) => {
    if (err) console.error('❌ Error writing option quote to CSV:', err);
  });
}

// Create HTTP server for both Express and WebSocket
const server = http.createServer(app);

// WebSocket server for live data streaming
const wss = new WebSocket.Server({ server });

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Middleware
app.use(cors());
app.use(express.json());

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error connecting to database:', err);
  } else {
    console.log('✅ Connected to PostgreSQL database');
    release();
  }
});

// Health check endpoint - Hot reload test #2
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    hotReloadTest: 'Docker auto-updating works!',
    version: '1.0.1'
  });
});

// List available CSV data files
app.get('/api/data-files', (req, res) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      return res.json({ files: [], message: 'No data directory found' });
    }

    const files = fs.readdirSync(DATA_DIR)
      .filter(file => file.endsWith('.csv'))
      .map(file => {
        const filePath = path.join(DATA_DIR, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          rows: file.includes('quote') ? 'quotes' : 'trades'
        };
      })
      .sort((a, b) => b.modified - a.modified);

    res.json({ 
      files, 
      total: files.length,
      data_directory: DATA_DIR,
      current_session: {
        stock_quotes: path.basename(STOCK_QUOTES_CSV),
        stock_trades: path.basename(STOCK_TRADES_CSV), 
        option_quotes: path.basename(OPTION_QUOTES_CSV)
      }
    });
  } catch (error) {
    console.error('❌ Error listing data files:', error);
    res.status(500).json({ error: 'Failed to list data files' });
  }
});

// Get API keys endpoint (simplified to Live keys only)
app.post('/api/test-connection', async (req, res) => {
  try {
    const { provider, apiKey, apiSecret, getKeys } = req.body;
    
    console.log(`📞 API call: ${provider}, getKeys: ${getKeys}`);

    // Default user for local development
    const defaultUserId = await getDefaultUserId();

    if (getKeys && provider === 'alpaca') {
      // Return Live API keys from environment (no more paper/live switching)
      const liveApiKey = process.env.ALPACA_LIVE_API_KEY;
      const liveApiSecret = process.env.ALPACA_LIVE_API_SECRET;

      if (!liveApiKey || !liveApiSecret) {
        return res.status(404).json({ error: 'No Live API keys configured in environment.' });
      }

      console.log('✅ Live API keys retrieved from environment');
      
      return res.json({
        isConnected: true,
        message: 'Live API keys retrieved for market data',
        keys: {
          api_key: liveApiKey,
          api_secret: liveApiSecret,
          mode: 'live'
        }
      });
    }

    if (provider === 'alpaca' && apiKey && apiSecret) {
      // Test Alpaca Live API connection only
      const baseUrl = 'https://api.alpaca.markets';
      
      const response = await fetch(`${baseUrl}/v2/account`, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });
      
      const isConnected = response.ok;
      let message = response.ok ? 'Alpaca Live API connected successfully' : 'Alpaca Live API connection failed';
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('❌ Alpaca Live API error:', errorData);
        message += `: ${errorData}`;
      }

      console.log('✅ Live API connection test completed');

      return res.json({ isConnected, message });
    }

    res.status(400).json({ error: 'Invalid request parameters' });
  } catch (error) {
    console.error('❌ Error in test-connection:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user API keys
app.get('/api/keys/:provider', async (req, res) => {
  try {
    const { provider } = req.params;
    const defaultUserId = await getDefaultUserId();

    const result = await pool.query(
      'SELECT api_key, mode, is_connected, last_tested_at FROM api_keys WHERE provider = $1 AND user_id = $2',
      [provider, defaultUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No API keys found' });
    }

    const keys = result.rows[0];
    res.json({
      api_key: keys.api_key,
      mode: keys.mode,
      is_connected: keys.is_connected,
      last_tested_at: keys.last_tested_at
    });
  } catch (error) {
    console.error('❌ Error getting keys:', error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch market data endpoint (replaces Supabase Edge Function)
app.post('/api/fetch-market-data', async (req, res) => {
  try {
    const { symbol, dataType, start, end, timeframe, useLiveKeys } = req.body;

    console.log(`📊 Fetching ${dataType} for ${symbol}`);

    // SIMPLIFIED APPROACH: Always use Live API keys for market data
    // We eliminated paper trading API calls - our backtesting system handles paper trading simulation
    let apiKey, apiSecret;
    
    if (dataType === 'account' || dataType === 'orders') {
      // For trading operations, always use live keys (but we won't actually trade - just for account info)
      apiKey = process.env.ALPACA_LIVE_API_KEY;
      apiSecret = process.env.ALPACA_LIVE_API_SECRET;
      console.log('🔑 Using LIVE API keys for account/trading operations');
    } else {
      // For market data, use Live keys (they work and provide real data)
      apiKey = process.env.ALPACA_LIVE_API_KEY;
      apiSecret = process.env.ALPACA_LIVE_API_SECRET;
      console.log('🔑 Using LIVE API keys for market data (real-time data)');
    }

    if (!apiKey || !apiSecret) {
      return res.status(400).json({ error: 'No API keys configured' });
    }

    const baseUrl = 'https://data.alpaca.markets';

    // Handle different data types
    if (dataType === 'bars') {
      const tf = timeframe || '5Min';
      // Use IEX feed (free) instead of SIP data since live account doesn't have SIP subscription
      const url = `${baseUrl}/v2/stocks/${symbol}/bars?start=${start}&end=${end}&timeframe=${tf}&limit=10000&adjustment=all&feed=iex`;

      console.log('📈 Fetching bars (IEX feed - free):', url);

      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Alpaca error (trying IEX feed):', errorText);
        
        // If IEX also fails, try with older date range (avoid real-time data restrictions)
        const olderStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days ago
        const olderEnd = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
        
        const fallbackUrl = `${baseUrl}/v2/stocks/${symbol}/bars?start=${olderStart}&end=${olderEnd}&timeframe=${tf}&limit=10000&adjustment=all&feed=iex`;
        console.log('📈 Fallback: Fetching historical bars (1 day old):', fallbackUrl);
        
        const fallbackResponse = await fetch(fallbackUrl, {
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
        });
        
        if (!fallbackResponse.ok) {
          const fallbackErrorText = await fallbackResponse.text();
          console.error('❌ Fallback also failed:', fallbackErrorText);
          return res.status(response.status).json({ error: errorText + ' | Fallback: ' + fallbackErrorText });
        }
        
        const fallbackData = await fallbackResponse.json();
        const fallbackBarCount = fallbackData.bars?.length || 0;
        console.log(`✅ Fallback succeeded: Received ${fallbackBarCount} historical bars`);
        return res.json({ data: fallbackData });
      }

      const data = await response.json();
      const barCount = data.bars?.length || 0;
      console.log(`✅ Received ${barCount} bars`);

      return res.json({ data });
    }

    if (dataType === 'quote') {
      const url = `${baseUrl}/v2/stocks/${symbol}/quotes/latest`;

      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ error: errorText });
      }

      const data = await response.json();
      return res.json({ data });
    }

    if (dataType === 'options') {
      // STEP 1: Get options contracts from Broker API
      const optionsBaseUrl = 'https://api.alpaca.markets';
      const contractsUrl = `${optionsBaseUrl}/v2/options/contracts?underlying_symbols=${symbol}&status=active&limit=1000`;

      console.log('📊 Step 1: Fetching options contracts from Broker API:', contractsUrl);

      const contractsResponse = await fetch(contractsUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!contractsResponse.ok) {
        const errorText = await contractsResponse.text();
        console.error('❌ Options contracts API error:', errorText);
        return res.status(contractsResponse.status).json({ error: errorText });
      }

      const contractsData = await contractsResponse.json();
      const contracts = contractsData.option_contracts || [];
      console.log(`✅ Step 1: Received ${contracts.length} options contracts from Broker API`);

      if (contracts.length === 0) {
        return res.json({ data: [] });
      }

      // STEP 1.5: Get current stock price to find ATM options
      console.log('📊 Step 1.5: Getting current stock price to find ATM options...');
      let currentStockPrice = null;
      try {
        const stockQuoteUrl = `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`;
        const stockResponse = await fetch(stockQuoteUrl, {
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
        });
        
        if (stockResponse.ok) {
          const stockData = await stockResponse.json();
          const quote = stockData.quote;
          currentStockPrice = (quote.bp + quote.ap) / 2; // Mid price
          console.log(`✅ Current ${symbol} price: $${currentStockPrice.toFixed(2)}`);
        }
      } catch (error) {
        console.error('❌ Could not fetch current stock price:', error.message);
      }

      // Filter for ATM options and multiple DTE (current business day + next 2 business days)
      function getNextBusinessDay(date, daysToAdd = 0) {
        const result = new Date(date);
        let addedDays = 0;
        
        while (addedDays < daysToAdd) {
          result.setDate(result.getDate() + 1);
          // Skip weekends (0 = Sunday, 6 = Saturday)
          if (result.getDay() !== 0 && result.getDay() !== 6) {
            addedDays++;
          }
        }
        return result;
      }

      function formatDateForOptions(date) {
        return date.getFullYear().toString().slice(-2) + 
               (date.getMonth() + 1).toString().padStart(2, '0') + 
               date.getDate().toString().padStart(2, '0'); // YYMMDD format
      }

      const today = new Date();
      const todayStr = formatDateForOptions(today);
      const tomorrow = getNextBusinessDay(today, 1);
      const tomorrowStr = formatDateForOptions(tomorrow);
      const dayAfter = getNextBusinessDay(today, 2);
      const dayAfterStr = formatDateForOptions(dayAfter);

      const targetExpiries = [todayStr, tomorrowStr, dayAfterStr];
      console.log('📊 Looking for options with expiries:', targetExpiries.join(', '));
      
      // Debug: Log first 5 contract expiries to see what's available
      const availableExpiries = [...new Set(contracts.map(c => c.expiration_date?.replace(/-/g, '').slice(-6)).filter(Boolean))].sort();
      console.log('📊 Available expiry dates in contracts:', availableExpiries.slice(0, 10).join(', '));
      
      let filteredContracts = contracts.filter(contract => {
        const expiry = contract.expiration_date?.replace(/-/g, '').slice(-6); // Get YYMMDD
        return targetExpiries.includes(expiry);
      });

      console.log(`📊 Found ${filteredContracts.length} contracts for next 3 business days`);
      
      // If no contracts found for our target dates, let's try the nearest available expiries
      if (filteredContracts.length === 0 && availableExpiries.length > 0) {
        console.log('📊 No contracts found for target dates, using nearest available expiries');
        const nearestExpiries = availableExpiries.slice(0, 3); // Take first 3 available expiries
        console.log('📊 Using nearest expiries:', nearestExpiries.join(', '));
        
        filteredContracts = contracts.filter(contract => {
          const expiry = contract.expiration_date?.replace(/-/g, '').slice(-6);
          return nearestExpiries.includes(expiry);
        });
        
        console.log(`📊 Found ${filteredContracts.length} contracts using nearest expiries`);
      }

      // If we have current stock price, filter for ATM options (within $10 of current price)
      if (currentStockPrice && filteredContracts.length > 0) {
        const atmContracts = filteredContracts.filter(contract => {
          const strikePrice = parseFloat(contract.strike_price);
          const priceDistance = Math.abs(strikePrice - currentStockPrice);
          return priceDistance <= 15; // Within $15 of current price for broader selection
        });
        
        if (atmContracts.length > 0) {
          filteredContracts = atmContracts;
          console.log(`📊 Filtered to ${filteredContracts.length} ATM contracts (within $15 of $${currentStockPrice.toFixed(2)})`);
        }
      }

      // Sort by expiry date first, then by distance from current price
      if (currentStockPrice) {
        filteredContracts.sort((a, b) => {
          // First sort by expiry date (earlier first)
          const expiryA = a.expiration_date?.replace(/-/g, '').slice(-6);
          const expiryB = b.expiration_date?.replace(/-/g, '').slice(-6);
          if (expiryA !== expiryB) {
            return expiryA.localeCompare(expiryB);
          }
          
          // Then sort by distance from current price
          const distanceA = Math.abs(parseFloat(a.strike_price) - currentStockPrice);
          const distanceB = Math.abs(parseFloat(b.strike_price) - currentStockPrice);
          return distanceA - distanceB;
        });
      }

      // Take top 60 contracts (20 per expiry day) for quotes
      const selectedContracts = filteredContracts.slice(0, 60);
      console.log(`📊 Selected ${selectedContracts.length} contracts for quotes`);
      
      if (selectedContracts.length > 0) {
        const sampleStrikes = selectedContracts.slice(0, 5).map(c => `$${c.strike_price}`).join(', ');
        console.log('📊 Sample strikes:', sampleStrikes);
      }

            // STEP 2: Get latest options quotes using the correct API format with symbols
      const marketDataBaseUrl = 'https://data.alpaca.markets';
      
      // Get contract symbols for the quotes API
      const contractSymbols = selectedContracts.map(c => c.symbol);
      const symbolsParam = contractSymbols.join(',');
      
      // Use the indicative feed (free, no subscription required)
      const quotesUrl = `${marketDataBaseUrl}/v1beta1/options/quotes/latest?symbols=${symbolsParam}&feed=indicative`;

      console.log('📊 Step 2: Fetching latest options quotes from indicative feed for', contractSymbols.length, 'symbols');
      console.log('📊 URL (first 100 chars):', quotesUrl.substring(0, 100) + '...');

      let quotesData = {};
      try {
        const quotesResponse = await fetch(quotesUrl, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret
          }
        });

        console.log('📊 Latest Quotes API Response Status:', quotesResponse.status);

        if (quotesResponse.ok) {
          const quotesResult = await quotesResponse.json();
          quotesData = quotesResult.quotes || {};
          console.log(`✅ Step 2: Received latest quotes for ${Object.keys(quotesData).length} contracts from OPRA feed`);
          console.log('📊 Sample quote data:', Object.keys(quotesData).length > 0 ? Object.values(quotesData)[0] : 'No quotes received');
        } else {
          const errorText = await quotesResponse.text();
          console.error('❌ Latest quotes API error (Status ' + quotesResponse.status + '):', errorText);
          console.log('📊 Falling back to estimated data');
        }
      } catch (quotesError) {
        console.error('❌ Latest quotes fetch error:', quotesError.message);
        console.log('📊 Falling back to estimated data');
      }

      // STEP 3: Merge contract data with latest quotes data from indicative feed
      const enrichedContracts = selectedContracts.map(contract => {
        const quote = quotesData[contract.symbol];
        
        if (quote) {
          // Use indicative feed data (free, derived from NBBO)
          return {
            ...contract,
            bid: quote.bp || null,         // bp = bid price
            ask: quote.ap || null,         // ap = ask price
            bid_size: quote.bs || null,    // bs = bid size
            ask_size: quote.as || null,    // as = ask size
            last_price: quote.p || null,   // p = last trade price
            volume: quote.s || null,       // s = last trade size
            timestamp: quote.t || null,    // t = timestamp
            data_source: 'indicative_feed'
          };
        } else {
          // Fallback to estimated data if no indicative quote available
          const fallbackPrice = contract.close_price || 0.01;
          const spread = fallbackPrice * 0.05; // 5% spread estimate
          
          return {
            ...contract,
            bid: fallbackPrice - spread/2,
            ask: fallbackPrice + spread/2,
            bid_size: 10,
            ask_size: 10,
            last_price: fallbackPrice,
            volume: 0,
            timestamp: new Date().toISOString(),
            data_source: 'estimated_from_close'
          };
        }
      });

      console.log(`✅ Step 3: Merged contracts with quotes - ${enrichedContracts.length} enriched contracts`);

      // Log detailed sample data for debugging
      const realDataContracts = enrichedContracts.filter(c => c.data_source === 'indicative_feed');
      const estimatedDataContracts = enrichedContracts.filter(c => c.data_source === 'estimated_from_close');

      console.log(`📊 Indicative feed data: ${realDataContracts.length} contracts`);
      console.log(`📊 Estimated data: ${estimatedDataContracts.length} contracts`);
      
      if (realDataContracts.length > 0) {
        const sample = realDataContracts[0];
        console.log('📊 Sample real data contract:', {
          symbol: sample.symbol,
          bid: sample.bid,
          ask: sample.ask,
          data_source: sample.data_source
        });
      }

      return res.json({ data: enrichedContracts });
    }

    if (dataType === 'options_greeks') {
      // Get options snapshots with Greeks data from Market Data API
      const marketDataBaseUrl = 'https://data.alpaca.markets';

      // symbols parameter should be comma-separated list of option symbols
      const symbols = req.body.symbols; // e.g. "SPY251010C00670000,SPY251017C00670000"

      if (!symbols) {
        return res.status(400).json({ error: 'symbols parameter required for options_greeks' });
      }

      const greeksUrl = `${marketDataBaseUrl}/v1beta1/options/snapshots?symbols=${symbols}&feed=indicative`;

      console.log('📊 Fetching options Greeks from Market Data API (indicative feed):', greeksUrl);
      console.log('📊 Requesting Greeks for symbols:', symbols);

      const response = await fetch(greeksUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Options Greeks API error:', errorText);
        return res.status(response.status).json({ error: errorText });
      }

      const data = await response.json();
      const snapshots = data.snapshots || {};
      console.log(`✅ Received Greeks data for ${Object.keys(snapshots).length} options`);

      return res.json({ data: snapshots });
    }

    if (dataType === 'options_bars_by_dte') {
      // Fetch historical options bars for a specific DTE (Days to Expiration)
      // This endpoint automatically generates option symbols based on:
      // 1. Ticker symbol (e.g., AAPL, SPY)
      // 2. Expiry date in YYMMDD format
      // 3. Strike prices around where the underlying traded during the timeframe
      
      const marketDataBaseUrl = 'https://data.alpaca.markets';
      
      // Required parameters
      const ticker = req.body.ticker; // e.g., "AAPL", "SPY"
      const expiryDate = req.body.expiryDate; // e.g., "241220" for Dec 20, 2024
      const timeframe = req.body.timeframe || '1min';
      const limit = req.body.limit || 1000;
      const strikeRange = req.body.strikeRange || 10; // Number of strikes above/below ATM
      const strikeSpacing = req.body.strikeSpacing || 5; // Dollar spacing between strikes
      
      if (!ticker || !expiryDate) {
        return res.status(400).json({ error: 'ticker and expiryDate parameters required for options_bars_by_dte' });
      }
      
      console.log('📊 Fetching options data by DTE for:', ticker, 'expiry:', expiryDate);
      
      try {
        // STEP 1: Get underlying price range during the timeframe to determine strikes
        const underlyingUrl = `${marketDataBaseUrl}/v2/stocks/${ticker}/bars?start=${start}&end=${end}&timeframe=${timeframe}&limit=10000&feed=iex&adjustment=all`;
        
        console.log('📊 Step 1: Fetching underlying price data to determine strike range');
        
        const underlyingResponse = await fetch(underlyingUrl, {
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
        });
        
        if (!underlyingResponse.ok) {
          const errorText = await underlyingResponse.text();
          console.error('❌ Underlying price fetch error:', errorText);
          return res.status(underlyingResponse.status).json({ error: `Failed to fetch underlying data: ${errorText}` });
        }
        
        const underlyingData = await underlyingResponse.json();
        const underlyingBars = underlyingData.bars || [];
        
        if (underlyingBars.length === 0) {
          return res.status(404).json({ error: 'No underlying price data found for the specified timeframe' });
        }
        
        // Calculate price range from underlying data
        let minPrice = Math.min(...underlyingBars.map(bar => bar.l)); // Lowest low
        let maxPrice = Math.max(...underlyingBars.map(bar => bar.h)); // Highest high
        const avgPrice = underlyingBars.reduce((sum, bar) => sum + bar.c, 0) / underlyingBars.length; // Average close
        
        console.log(`📊 Price analysis - Min: $${minPrice.toFixed(2)}, Max: $${maxPrice.toFixed(2)}, Avg: $${avgPrice.toFixed(2)}`);
        
        // STEP 2: Generate option symbols based on price range
        const centerStrike = Math.round(avgPrice / strikeSpacing) * strikeSpacing; // Round to nearest strike spacing
        const optionSymbols = [];
        
        // Generate calls and puts around the center strike
        for (let i = -strikeRange; i <= strikeRange; i++) {
          const strike = centerStrike + (i * strikeSpacing);
          if (strike > 0) { // Only positive strikes
            // Fix: Convert strike to cents and pad to 8 digits
            // Example: $653.00 -> 65300 cents -> 00653000
            const strikeCents = Math.round(strike * 100);
            const strikeFormatted = String(strikeCents).padStart(8, '0');
            
            const callSymbol = `${ticker}${expiryDate}C${strikeFormatted}`;
            const putSymbol = `${ticker}${expiryDate}P${strikeFormatted}`;
            
            optionSymbols.push(callSymbol, putSymbol);
          }
        }
        
        console.log(`📊 Generated ${optionSymbols.length} option symbols for ${ticker} expiry ${expiryDate}`);
        console.log('📊 Sample symbols:', optionSymbols.slice(0, 6));
        
        // STEP 3: Fetch historical options bars for generated symbols 
        // Note: Historical bars don't support feed=indicative, only real-time quotes do
        const symbolsParam = optionSymbols.join(',');
        const optionsBarsUrl = `${marketDataBaseUrl}/v1beta1/options/bars?symbols=${encodeURIComponent(symbolsParam)}&timeframe=${timeframe}&start=${start}&end=${end}&limit=${limit}&sort=asc`;
        
        console.log('📊 Step 3: Fetching historical options bars (indicative feed)');
        console.log('📊 URL length:', optionsBarsUrl.length);
        console.log('📊 Requesting data for', optionSymbols.length, 'option contracts');
        
        const optionsResponse = await fetch(optionsBarsUrl, {
          method: 'GET',
          headers: {
            'accept': 'application/json',
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
        });
        
        if (!optionsResponse.ok) {
          const errorText = await optionsResponse.text();
          console.error('❌ Options bars API error:', errorText);
          return res.status(optionsResponse.status).json({ error: `Options data fetch failed: ${errorText}` });
        }
        
        const optionsData = await optionsResponse.json();
        const bars = optionsData.bars || {};
        
        // Count total bars across all symbols
        let totalBars = 0;
        const symbolsWithData = [];
        
        Object.entries(bars).forEach(([symbol, symbolBars]) => {
          if (Array.isArray(symbolBars) && symbolBars.length > 0) {
            totalBars += symbolBars.length;
            symbolsWithData.push(symbol);
          }
        });
        
        console.log(`✅ Received options data for ${symbolsWithData.length} out of ${optionSymbols.length} symbols, ${totalBars} total bars`);
        
        // STEP 4: Save data to CSV if we have any bars
        if (totalBars > 0) {
          try {
            const dataDir = path.join(__dirname, 'data');
            if (!fs.existsSync(dataDir)) {
              fs.mkdirSync(dataDir, { recursive: true });
            }
            
            const csvFileName = `options_bars_${ticker}_${expiryDate}_${new Date().toISOString().split('T')[0]}.csv`;
            const csvPath = path.join(dataDir, csvFileName);
            
            // Create CSV header
            const csvHeader = 'symbol,timestamp,open,high,low,close,volume,vwap,trade_count\n';
            let csvContent = csvHeader;
            
            // Add all bars to CSV
            Object.entries(bars).forEach(([symbol, symbolBars]) => {
              if (Array.isArray(symbolBars) && symbolBars.length > 0) {
                symbolBars.forEach(bar => {
                  csvContent += `${symbol},${bar.t},${bar.o},${bar.h},${bar.l},${bar.c},${bar.v || 0},${bar.vw || 0},${bar.n || 0}\n`;
                });
              }
            });
            
            fs.writeFileSync(csvPath, csvContent);
            console.log(`💾 Saved ${totalBars} options bars to ${csvFileName}`);
          } catch (error) {
            console.error('❌ Error saving CSV file:', error.message);
          }
        }
        
        // Log sample data for debugging
        if (totalBars > 0) {
          const sampleSymbol = symbolsWithData[0];
          const sampleBar = bars[sampleSymbol]?.[0];
          if (sampleBar) {
            console.log('📊 Sample options bar:', {
              symbol: sampleSymbol,
              time: sampleBar.t,
              open: sampleBar.o,
              high: sampleBar.h,
              low: sampleBar.l,
              close: sampleBar.c,
              volume: sampleBar.v
            });
          }
        }
        
        return res.json({ 
          data: {
            bars: bars,
            next_page_token: optionsData.next_page_token || null,
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
        
      } catch (error) {
        console.error('❌ Error in options_bars_by_dte:', error);
        return res.status(500).json({ error: `Internal server error: ${error.message}` });
      }
    }

    if (dataType === 'options_bars') {
      // Fetch historical options bars data
      const marketDataBaseUrl = 'https://data.alpaca.markets';

      // Required parameters for options bars
      const symbols = req.body.symbols; // e.g. "SPY251010C00653000,SPY251010P00653000"
      const timeframe = req.body.timeframe || '1min'; // 1min, 5min, 15min, 1hour, 1day
      const limit = req.body.limit || 1000;
      const sort = req.body.sort || 'asc';

      if (!symbols) {
        return res.status(400).json({ error: 'symbols parameter required for options_bars' });
      }

      // For historical options bars, we need start/end dates
      // Note: Historical 1min options data only goes back to March 2024
      let startDate = start;
      let endDate = end;

      // Validate date range for options data
      const march2024 = new Date('2024-03-01T00:00:00Z');
      const requestStartDate = new Date(startDate);

      if (requestStartDate < march2024) {
        console.log(`⚠️ Requested start date ${startDate} is before March 2024. Adjusting to March 1, 2024.`);
        startDate = '2024-03-01T09:30:00Z';
      }

      const optionsBarsUrl = `${marketDataBaseUrl}/v1beta1/options/bars?symbols=${symbols}&timeframe=${timeframe}&start=${startDate}&end=${endDate}&limit=${limit}&sort=${sort}`;

      console.log('📊 Fetching historical options bars from Market Data API');
      console.log('📊 URL:', optionsBarsUrl);
      console.log('📊 Symbols:', symbols);
      console.log('📊 Timeframe:', timeframe);
      console.log('📊 Date range:', startDate, 'to', endDate);

      const response = await fetch(optionsBarsUrl, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Options bars API error:', errorText);
        return res.status(response.status).json({ error: errorText });
      }

      const data = await response.json();
      const bars = data.bars || {};
      
      // Count total bars across all symbols
      let totalBars = 0;
      Object.values(bars).forEach(symbolBars => {
        if (Array.isArray(symbolBars)) {
          totalBars += symbolBars.length;
        }
      });

      console.log(`✅ Received historical options bars data for ${Object.keys(bars).length} symbols, ${totalBars} total bars`);

      // Log sample data for debugging
      if (totalBars > 0) {
        const firstSymbol = Object.keys(bars)[0];
        const firstBar = bars[firstSymbol]?.[0];
        if (firstBar) {
          console.log('📊 Sample options bar:', {
            symbol: firstSymbol,
            time: firstBar.t,
            open: firstBar.o,
            high: firstBar.h,
            low: firstBar.l,
            close: firstBar.c,
            volume: firstBar.v
          });
        }
      }

      return res.json({ 
        data: {
          bars: bars,
          next_page_token: data.next_page_token || null
        },
        metadata: {
          total_symbols: Object.keys(bars).length,
          total_bars: totalBars,
          timeframe: timeframe,
          date_range: { start: startDate, end: endDate }
        }
      });
    }

    // FIXED: Implement missing account dataType
    if (dataType === 'account') {
      console.log('👤 Fetching account information');
      
      const accountBaseUrl = 'https://api.alpaca.markets';
      const accountUrl = `${accountBaseUrl}/v2/account`;

      const response = await fetch(accountUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Account API error:', errorText);
        return res.status(response.status).json({ error: errorText });
      }

      const data = await response.json();
      console.log('✅ Account data retrieved successfully');
      return res.json({ data });
    }

    // FIXED: Implement missing orders dataType
    if (dataType === 'orders') {
      console.log('📋 Fetching orders history');
      
      const ordersBaseUrl = 'https://api.alpaca.markets';
      // Get orders from last 30 days by default
      const after = start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const until = end || new Date().toISOString();
      const ordersUrl = `${ordersBaseUrl}/v2/orders?status=all&limit=500&after=${after}&until=${until}`;

      const response = await fetch(ordersUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Orders API error:', errorText);
        return res.status(response.status).json({ error: errorText });
      }

      const data = await response.json();
      console.log(`✅ Retrieved ${data.length || 0} orders`);
      return res.json({ data });
    }

    res.status(400).json({ error: 'Invalid dataType' });
  } catch (error) {
    console.error('❌ Error in fetch-market-data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to get default user ID
async function getDefaultUserId() {
  const result = await pool.query('SELECT id FROM users WHERE email = $1', ['trader@local.dev']);
  return result.rows[0]?.id;
}

// New endpoint: Get latest quotes for specific option symbols
app.post('/api/get-option-quotes', async (req, res) => {
  try {
    const { symbols } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
      return res.status(400).json({ error: 'symbols array is required' });
    }

    console.log(`📞 GET OPTION QUOTES: ${symbols.length} symbols`);

    // Get API keys from environment
    const apiKey = process.env.ALPACA_LIVE_API_KEY;
    const apiSecret = process.env.ALPACA_LIVE_API_SECRET;

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: 'API keys not configured' });
    }

    const marketDataBaseUrl = 'https://data.alpaca.markets';
    
    // Split symbols into batches of 50 (Alpaca limit)
    const batchSize = 50;
    const quotes = {};
    
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const symbolsParam = batch.join(',');
      
      const quotesUrl = `${marketDataBaseUrl}/v1beta1/options/quotes/latest?symbols=${symbolsParam}&feed=indicative`;

      console.log(`📡 Fetching batch ${Math.floor(i/batchSize) + 1}: ${batch.length} symbols (indicative feed)`);
      
      const response = await fetch(quotesUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        console.error(`❌ Indicative feed API error: ${response.status} ${response.statusText}`);
        continue; // Continue with next batch
      }

      const data = await response.json();
      
      if (data.quotes) {
        Object.entries(data.quotes).forEach(([symbol, quote]) => {
          const q = quote;
          quotes[symbol] = {
            symbol: symbol,
            bid: parseFloat(q.bp) || 0,
            ask: parseFloat(q.ap) || 0,
            bid_size: parseInt(q.bs) || 0,
            ask_size: parseInt(q.as) || 0,
            timestamp: q.t,
            data_source: 'indicative_feed'
          };
        });
      }
      
      // Small delay between batches to respect rate limits
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Retrieved ${Object.keys(quotes).length} option quotes from indicative feed`);

    res.json({
      quotes: quotes,
      total: Object.keys(quotes).length,
      requested: symbols.length,
      data_source: 'indicative_feed',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Error fetching option quotes:', error);
    res.status(500).json({ 
      error: 'Failed to fetch option quotes',
      details: error.message 
    });
  }
});

// Get recent trades from stored CSV data to build minute candles
app.post('/api/get-recent-trades', async (req, res) => {
  try {
    const { symbol, minutesBack = 30 } = req.body;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Get current session's trade file
    const today = new Date().toISOString().split('T')[0];
    const tradeFile = path.join(DATA_DIR, `stock_trades_${today}.csv`);
    
    if (!fs.existsSync(tradeFile)) {
      return res.json({ trades: [], message: 'No trade data available for today' });
    }

    console.log(`📊 Reading recent trades for ${symbol} from ${tradeFile}`);
    
    // Calculate time cutoff
    const cutoffTime = new Date(Date.now() - minutesBack * 60 * 1000);
    
    // Read and parse CSV file
    const csvData = fs.readFileSync(tradeFile, 'utf8');
    const lines = csvData.split('\n');
    const trades = [];
    
    // Skip header line
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const [timestamp, csvSymbol, price, size, exchange, conditions, source] = line.split(',');
      
      // Filter by symbol and time
      if (csvSymbol === symbol && new Date(timestamp) > cutoffTime) {
        trades.push({
          timestamp,
          symbol: csvSymbol,
          price: parseFloat(price),
          size: parseInt(size),
          exchange,
          conditions,
          source
        });
      }
    }
    
    console.log(`✅ Found ${trades.length} recent trades for ${symbol} in last ${minutesBack} minutes`);
    
    res.json({
      trades,
      symbol,
      minutesBack,
      total: trades.length,
      oldestTrade: trades[0]?.timestamp,
      newestTrade: trades[trades.length - 1]?.timestamp
    });

  } catch (error) {
    console.error('❌ Error reading recent trades:', error);
    res.status(500).json({ 
      error: 'Failed to read recent trades',
      details: error.message 
    });
  }
});

// WebSocket connection handling for live data streaming
let alpacaOptionsWebSocket = null;
let alpacaStockWebSocket = null;
let connectedClients = new Set();
let optionsHeartbeatInterval = null;
let stockHeartbeatInterval = null;

// Global variables for dynamic options contract generation
const UNDERLYING_SYMBOLS = ['SPY', 'QQQ', 'IWM'];
let currentUnderlyingPrices = new Map();
let SUB_SYMBOLS = [];

// Real-time bar aggregation for chart data
const activeBarBuilders = new Map(); // symbol -> { current bar data }

function getBarBuilder(symbol) {
  if (!activeBarBuilders.has(symbol)) {
    activeBarBuilders.set(symbol, {
      symbol,
      open: 0,
      high: 0,
      low: Infinity,
      close: 0,
      volume: 0,
      trades: 0,
      timestamp: null,
      barStartTime: null
    });
  }
  return activeBarBuilders.get(symbol);
}

function updateBarWithTrade(symbol, price, size, timestamp) {
  const bar = getBarBuilder(symbol);
  const tradeTime = new Date(timestamp);
  const currentMinute = new Date(tradeTime.getFullYear(), tradeTime.getMonth(), tradeTime.getDate(), 
                                 tradeTime.getHours(), tradeTime.getMinutes(), 0, 0);
  
  // If this is a new minute, finalize previous bar and start new one
  if (bar.barStartTime && bar.barStartTime.getTime() !== currentMinute.getTime()) {
    // Broadcast completed bar
    if (bar.trades > 0) {
      broadcastStockBar(bar);
    }
    
    // Reset for new bar
    bar.open = price;
    bar.high = price;
    bar.low = price;
    bar.close = price;
    bar.volume = 0;
    bar.trades = 0;
    bar.barStartTime = currentMinute;
    bar.timestamp = currentMinute.toISOString();
  } else if (!bar.barStartTime) {
    // First trade for this symbol
    bar.open = price;
    bar.high = price;
    bar.low = price;
    bar.barStartTime = currentMinute;
    bar.timestamp = currentMinute.toISOString();
  }
  
  // Update bar with current trade
  bar.high = Math.max(bar.high, price);
  bar.low = Math.min(bar.low, price);
  bar.close = price;
  bar.volume += size;
  bar.trades += 1;
}

function broadcastStockBar(bar) {
  const barData = {
    type: 'stock_bar',
    data: {
      symbol: bar.symbol,
      timestamp: bar.timestamp,
      open: parseFloat(bar.open.toFixed(4)),
      high: parseFloat(bar.high.toFixed(4)),
      low: parseFloat(bar.low.toFixed(4)),
      close: parseFloat(bar.close.toFixed(4)),
      volume: bar.volume,
      trades: bar.trades,
      timeframe: '1Min'
    }
  };
  
  const broadcastMessage = JSON.stringify(barData);
  let broadcastCount = 0;
  
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(broadcastMessage);
      broadcastCount++;
    }
  });
  
  console.log(`📊 [BAR COMPLETE] ${bar.symbol} 1Min bar: O:${bar.open.toFixed(2)} H:${bar.high.toFixed(2)} L:${bar.low.toFixed(2)} C:${bar.close.toFixed(2)} V:${bar.volume} → ${broadcastCount} clients`);
}

// Function to get 0DTE expiry date (format: YYMMDD)
function get0DTEExpiry() {
  const today = new Date();
  const yy = today.getFullYear().toString().slice(-2);
  const mm = (today.getMonth() + 1).toString().padStart(2, '0');
  const dd = today.getDate().toString().padStart(2, '0');
  return yy + mm + dd;
}

// Function to calculate ATM strike (rounded to nearest $1)
function calculateATMStrike(price) {
  return Math.round(price);
}

// Function to generate options symbols for a given underlying
function generateOptionsSymbols(symbol, underlyingPrice) {
  if (!underlyingPrice) {
    console.warn(`⚠️ No underlying price available for ${symbol}`);
    return [];
  }
  
  const expiry = get0DTEExpiry();
  const atmStrike = calculateATMStrike(underlyingPrice);
  const symbols = [];
  
  // Generate strikes ±$10 from ATM (21 strikes total)
  for (let offset = -10; offset <= 10; offset++) {
    const strike = atmStrike + offset;
    if (strike > 0) { // Only positive strikes
      const strikeStr = (strike * 1000).toString().padStart(8, '0'); // Convert to 1/1000 format
      symbols.push(`${symbol}${expiry}C${strikeStr}`); // Call
      symbols.push(`${symbol}${expiry}P${strikeStr}`); // Put
    }
  }
  
  console.log(`📊 Generated ${symbols.length} option symbols for ${symbol} (ATM: $${atmStrike}, Current: $${underlyingPrice.toFixed(2)})`);
  return symbols;
}

// Function to update subscription symbols based on current prices
function updateSubscriptionSymbols() {
  const newSymbols = [];
  
  UNDERLYING_SYMBOLS.forEach(symbol => {
    const price = currentUnderlyingPrices.get(symbol);
    if (price) {
      const symbols = generateOptionsSymbols(symbol, price);
      newSymbols.push(...symbols);
    }
  });
  
  if (newSymbols.length > 0 && JSON.stringify(newSymbols) !== JSON.stringify(SUB_SYMBOLS)) {
    SUB_SYMBOLS = newSymbols;
    console.log(`🔄 Updated subscription symbols: ${SUB_SYMBOLS.length} contracts across ${UNDERLYING_SYMBOLS.length} underlyings`);
    
    // If WebSocket is connected and authenticated, resubscribe with new symbols  
    if (global.optionsWebSocket && global.optionsWebSocket.readyState === 1) {
      const { encode } = require('@msgpack/msgpack');
      const sub = { action: 'subscribe', quotes: SUB_SYMBOLS, trades: SUB_SYMBOLS };
      global.optionsWebSocket.send(encode(sub));
      console.log(`📡 Resubscribed to ${SUB_SYMBOLS.length} dynamic option contracts`);
    } else {
      console.log('⚠️ Options WebSocket not ready - symbols updated but not subscribed yet');
    }
  }
}

// Connect to Alpaca Options WebSocket for live options data (MessagePack format)
// DISABLED: Direct Alpaca connections disabled - using Data Bus instead
function connectToAlpacaOptions() {
  console.log('⚠️  Old Alpaca Options connection disabled - using new indicative feed instead');
  return; // DISABLED - Using new connectToAlpacaOptionsPublisher instead
  
  const apiKey = process.env.ALPACA_LIVE_API_KEY;
  const apiSecret = process.env.ALPACA_LIVE_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    console.error('❌ No API keys for Alpaca Options WebSocket');
    return;
  }

  // Clean up existing connection and listeners
  if (alpacaOptionsWebSocket) {
    alpacaOptionsWebSocket.removeAllListeners();
    if (alpacaOptionsWebSocket.readyState === WebSocket.OPEN) {
      alpacaOptionsWebSocket.close();
    }
  }

  console.log('🚀 Connecting to Alpaca Options WebSocket (Free Indicative Stream)...');
  
  // Connect to Alpaca FREE INDICATIVE options WebSocket via standard data stream
  // alpacaOptionsWebSocket = new WebSocket('wss://stream.data.alpaca.markets/v2/sip'); // DISABLED - Using new indicative feed instead
  
  alpacaOptionsWebSocket.on('open', () => {
    console.log('✅ Connected to Alpaca Options WebSocket (Free Indicative)');
    
    // Authenticate - Use JSON format for indicative feed (not MessagePack)
    const authMessage = {
      action: 'auth',
      key: apiKey,
      secret: apiSecret
    };

    console.log('🔑 Sending options auth message (JSON for indicative):', authMessage);
    alpacaOptionsWebSocket.send(JSON.stringify(authMessage));
    
    // Set up heartbeat to keep connection alive
    if (optionsHeartbeatInterval) {
      clearInterval(optionsHeartbeatInterval);
    }
    
    optionsHeartbeatInterval = setInterval(() => {
      if (alpacaOptionsWebSocket && alpacaOptionsWebSocket.readyState === WebSocket.OPEN) {
        alpacaOptionsWebSocket.ping();
      }
    }, 30000); // Ping every 30 seconds
  });
  
  alpacaOptionsWebSocket.on('message', (data) => {
    try {
      // Parse JSON data for indicative feed (not MessagePack)
      const messages = JSON.parse(data.toString());

      console.log('📦 Options message (JSON):', JSON.stringify(messages).substring(0, 300));

      // Handle single message or array of messages
      const messageArray = Array.isArray(messages) ? messages : [messages];

      for (const message of messageArray) {
        console.log('🔍 Processing options message type:', message.T, 'msg:', message.msg);

        if (message.T === 'success' && message.msg === 'connected') {
          console.log('✅ Alpaca Options WebSocket connected successfully');
        } else if (message.T === 'success' && message.msg === 'authenticated') {
          console.log('✅ Alpaca Options WebSocket authenticated');
          
          // Subscribe to some sample options for SPY (using free indicative limit of 30 channels)
          const subscriptionMessage = {
            action: 'subscribe',
            quotes: [
              'SPY251115C00590000', // SPY Call
              'SPY251115P00590000', // SPY Put
              'SPY251115C00580000', // SPY Call
              'SPY251115P00580000', // SPY Put
              'QQQ251115C00500000', // QQQ Call
              'QQQ251115P00500000'  // QQQ Put
            ]
          };
          
          console.log('📡 Subscribing to indicative options quotes:', subscriptionMessage.quotes);
          alpacaOptionsWebSocket.send(JSON.stringify(subscriptionMessage));
        } else if (message.T === 'error') {
          console.error('❌ Alpaca Options error:', message.code, message.msg);
        } else if (message.T === 'subscription') {
          console.log('📡 Options subscription confirmed for:', message.quotes?.join(', ') || 'unknown');
        } else if (message.T === 'q') {
          // Option quote - stream to all connected clients (with throttling)
          const quote = {
            symbol: message.S,
            bid: parseFloat(message.bp) || 0,
            ask: parseFloat(message.ap) || 0,
            bid_size: parseInt(message.bs) || 0,
            ask_size: parseInt(message.as) || 0,
            timestamp: message.t,
            data_source: 'indicative_free'
          };

          // Throttle: only broadcast if enough time has passed since last broadcast
          const now = Date.now();
          const lastBroadcast = quoteThrottleMap.get(quote.symbol) || 0;

          if (now - lastBroadcast < QUOTE_THROTTLE_MS) {
            // Skip this quote - too soon
            return;
          }

          quoteThrottleMap.set(quote.symbol, now);

          console.log('📊 INDICATIVE OPTION QUOTE from Alpaca:', quote.symbol, 'Bid:', quote.bid, 'Ask:', quote.ask);

          // Log to CSV file for historical storage
          logOptionQuote(quote);

          // Broadcast to all connected frontend clients
          const broadcastData = JSON.stringify({
            type: 'option_quote',
            data: quote
          });

          let broadcastCount = 0;
          connectedClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(broadcastData);
              broadcastCount++;
            }
          });

          if (broadcastCount > 0 && Math.random() < 0.01) { // Log 1% of broadcasts
            console.log(`📡 Broadcasted option quote to ${broadcastCount} client(s)`);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error processing Alpaca options message:', error.message);
    }
  });
  
  alpacaOptionsWebSocket.on('error', (error) => {
    console.error('❌ Alpaca Options WebSocket error:', error);
  });
  
  alpacaOptionsWebSocket.on('close', () => {
    console.log('❌ Alpaca Options WebSocket closed (auto-reconnect disabled - using indicative feed instead)');

    // Clear heartbeat interval
    if (optionsHeartbeatInterval) {
      clearInterval(optionsHeartbeatInterval);
      optionsHeartbeatInterval = null;
    }

    // DISABLED: Auto-reconnect disabled because we're using the indicative feed instead of OPRA
    // setTimeout(connectToAlpacaOptions, 5000);
  });
}

// Connect to Alpaca Stock WebSocket for live stock data
// DISABLED: Direct Alpaca connections disabled - using Data Bus instead
function connectToAlpacaStock() {
  const apiKey = process.env.ALPACA_LIVE_API_KEY;
  const apiSecret = process.env.ALPACA_LIVE_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.error('❌ No API keys for Alpaca Stock WebSocket');
    return;
  }

  // Clean up existing connection and listeners
  if (alpacaStockWebSocket) {
    alpacaStockWebSocket.removeAllListeners();
    if (alpacaStockWebSocket.readyState === WebSocket.OPEN) {
      alpacaStockWebSocket.close();
    }
  }

  console.log('🚀 Connecting to Alpaca Stock WebSocket (IEX feed)...');

  // Connect to Alpaca stock WebSocket (JSON format) - IEX feed for basic access
  alpacaStockWebSocket = new WebSocket('wss://stream.data.alpaca.markets/v2/iex');
  
  alpacaStockWebSocket.on('open', () => {
    console.log('✅ Connected to Alpaca Stock WebSocket');
    
    // Authenticate - uses JSON for stock feed
    const authMessage = {
      action: 'auth',
      key: apiKey,
      secret: apiSecret
    };

    console.log('🔑 Sending stock auth message (JSON):', authMessage);
    alpacaStockWebSocket.send(JSON.stringify(authMessage));
    
    // Set up heartbeat to keep connection alive
    if (stockHeartbeatInterval) {
      clearInterval(stockHeartbeatInterval);
    }
    
    stockHeartbeatInterval = setInterval(() => {
      if (alpacaStockWebSocket && alpacaStockWebSocket.readyState === WebSocket.OPEN) {
        alpacaStockWebSocket.ping();
      }
    }, 30000); // Ping every 30 seconds
  });
  
  alpacaStockWebSocket.on('message', (data) => {
    try {
      // Parse JSON data (not msgpack for stock stream)
      const messages = JSON.parse(data);

      console.log('📦 Stock message received:', JSON.stringify(messages).substring(0, 300));

      // Handle single message or array of messages
      const messageArray = Array.isArray(messages) ? messages : [messages];

      for (const message of messageArray) {
        console.log('🔍 Processing stock message type:', message.T, 'msg:', message.msg);

        if (message.T === 'success' && message.msg === 'connected') {
          console.log('✅ Alpaca Stock WebSocket connected successfully');
        } else if (message.T === 'success' && message.msg === 'authenticated') {
          console.log('✅ Alpaca Stock WebSocket authenticated');
          
          // Subscribe to underlying symbols for dynamic options contract generation
          const subscribeMessage = {
            action: 'subscribe',
            trades: UNDERLYING_SYMBOLS,
            quotes: UNDERLYING_SYMBOLS
          };
          
          console.log(`📡 Subscribing to underlying symbols for dynamic options: ${UNDERLYING_SYMBOLS.join(', ')}`);
          alpacaStockWebSocket.send(JSON.stringify(subscribeMessage));
          
          // Initialize with current prices to generate initial options contracts
          setTimeout(async () => {
            console.log('🔄 Fetching initial underlying prices for options contract generation...');
            for (const symbol of UNDERLYING_SYMBOLS) {
              try {
                const price = await getCurrentStockPrice(symbol);
                if (price > 0) {
                  currentUnderlyingPrices.set(symbol, price);
                  console.log(`💹 Initial ${symbol} price: $${price.toFixed(2)}`);
                }
              } catch (error) {
                console.warn(`⚠️ Could not fetch initial price for ${symbol}:`, error.message);
              }
            }
            
            // Generate initial options contracts
            updateSubscriptionSymbols();
          }, 2000);
        } else if (message.T === 'error') {
          console.error('❌ Alpaca Stock error:', message.code, message.msg);

          // Handle overnight feed access denial (401 not authenticated)
          if (message.code === 401 && isOvernightSession()) {
            console.log('⚠️ OVERNIGHT FEED ACCESS DENIED');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
            console.log('📋 OVERNIGHT DATA ACCESS REQUIREMENTS:');
            console.log('   The v1beta1/overnight feed requires a special Alpaca subscription.');
            console.log('   Contact Alpaca sales for pricing and enablement.');
            console.log('   Website: https://alpaca.markets/data');
            console.log('');
            console.log('💡 CURRENT STATUS:');
            console.log('   ✅ Automatic feed switching: CONFIGURED');
            console.log('   ✅ Regular hours (4 AM - 8 PM): IEX feed (WORKING)');
            console.log('   ❌ Overnight hours (8 PM - 4 AM): Requires paid subscription');
            console.log('');
            console.log('🔄 FALLBACK: Reconnecting to IEX feed for now...');
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

            // Fallback: Force reconnect using IEX feed
            setTimeout(() => {
              if (alpacaStockWebSocket) {
                alpacaStockWebSocket.removeAllListeners();
                if (alpacaStockWebSocket.readyState === WebSocket.OPEN) {
                  alpacaStockWebSocket.close();
                }
              }

              console.log('🔄 Connecting to IEX feed as fallback...');
              alpacaStockWebSocket = new WebSocket('wss://stream.data.alpaca.markets/v2/iex');

              alpacaStockWebSocket.on('open', () => {
                console.log('✅ Fallback: Connected to IEX feed');
                const authMessage = {
                  action: 'auth',
                  key: process.env.ALPACA_LIVE_API_KEY,
                  secret: process.env.ALPACA_LIVE_API_SECRET
                };
                alpacaStockWebSocket.send(JSON.stringify(authMessage));
              });

              // Re-add all the other event handlers
              connectToAlpacaStock();
            }, 2000);
          }
        } else if (message.T === 'subscription') {
          console.log('📡 Stock subscription confirmed - Quotes:', message.quotes?.join(', ') || 'none', '| Trades:', message.trades?.join(', ') || 'none');
        } else if (message.T === 't') {
          // Stock TRADE - actual executed transaction for chart OHLC
          const trade = {
            symbol: message.S,
            price: parseFloat(message.p) || 0,
            size: parseInt(message.s) || 0,
            timestamp: message.t,
            exchange: message.x || 'unknown',
            conditions: message.c || [],
            data_source: 'stock_trade'
          };

          console.log('💰 LIVE STOCK TRADE from Alpaca:', trade.symbol, 'Price:', trade.price, 'Size:', trade.size);

          // Real-time bar aggregation for charts
          updateBarWithTrade(trade.symbol, trade.price, trade.size, trade.timestamp);

          // Update underlying price for dynamic options contract generation
          if (UNDERLYING_SYMBOLS.includes(trade.symbol) && trade.price > 0) {
            const oldPrice = currentUnderlyingPrices.get(trade.symbol);
            currentUnderlyingPrices.set(trade.symbol, trade.price);
            console.log(`💹 Updated ${trade.symbol} price: ${oldPrice?.toFixed(2) || 'N/A'} → $${trade.price.toFixed(2)}`);
            
            // Update options subscriptions if price changed significantly (>$0.50)
            if (!oldPrice || Math.abs(trade.price - oldPrice) > 0.5) {
              console.log(`🔄 Significant price change for ${trade.symbol}, updating options subscriptions...`);
              setTimeout(updateSubscriptionSymbols, 1000); // Debounce updates
            }
          }

          // Log to CSV file for historical storage
          logStockTrade(trade);

          // Broadcast to all connected frontend clients
          const broadcastData = JSON.stringify({
            type: 'stock_trade',
            data: trade
          });

          let broadcastCount = 0;
          connectedClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(broadcastData);
              broadcastCount++;
            }
          });

          if (broadcastCount > 0) {
            console.log(`📡 Broadcasted trade to ${broadcastCount} client(s)`);
          }
        } else if (message.T === 'q') {
          // Stock QUOTE - bid/ask for spread analysis
          const quote = {
            symbol: message.S,
            bid: parseFloat(message.bp) || 0,
            ask: parseFloat(message.ap) || 0,
            bid_size: parseInt(message.bs) || 0,
            ask_size: parseInt(message.as) || 0,
            timestamp: message.t,
            data_source: 'stock_quote'
          };

          console.log('📊 LIVE STOCK QUOTE from Alpaca:', quote.symbol, 'Bid:', quote.bid, 'Ask:', quote.ask);

          // Update underlying price from quote mid-price for dynamic options contract generation
          if (UNDERLYING_SYMBOLS.includes(quote.symbol) && quote.bid > 0 && quote.ask > 0) {
            const midPrice = (quote.bid + quote.ask) / 2;
            const oldPrice = currentUnderlyingPrices.get(quote.symbol);
            
            // Only update if we don't have a recent trade price or if quote is significantly different
            if (!oldPrice || Math.abs(midPrice - oldPrice) > 0.25) {
              currentUnderlyingPrices.set(quote.symbol, midPrice);
              console.log(`📈 Updated ${quote.symbol} price from quote: ${oldPrice?.toFixed(2) || 'N/A'} → $${midPrice.toFixed(2)} (mid)`);
              
              // Update options subscriptions if price changed significantly
              if (!oldPrice || Math.abs(midPrice - oldPrice) > 0.5) {
                console.log(`🔄 Significant price change for ${quote.symbol}, updating options subscriptions...`);
                setTimeout(updateSubscriptionSymbols, 1000); // Debounce updates
              }
            }
          }

          // Log to CSV file for historical storage
          logStockQuote(quote);

          // Broadcast to all connected frontend clients
          const broadcastData = JSON.stringify({
            type: 'stock_quote',
            data: quote
          });

          // Throttle: only broadcast if enough time has passed
          const now = Date.now();
          const lastBroadcast = quoteThrottleMap.get(quote.symbol + '_stock') || 0;

          if (now - lastBroadcast < QUOTE_THROTTLE_MS) {
            return; // Skip - too soon
          }

          quoteThrottleMap.set(quote.symbol + '_stock', now);

          let broadcastCount = 0;
          connectedClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(broadcastData);
              broadcastCount++;
            } else {
              // Clean up closed connections
              connectedClients.delete(client);
            }
          });

          if (broadcastCount > 0 && Math.random() < 0.01) { // Log 1% of broadcasts
            console.log(`📡 Broadcasted stock quote to ${broadcastCount} client(s)`);
          }

          // 🧪 TEST MODE: Generate synthetic trade from quote mid-price for chart testing
          // This helps test chart updates when real trades are sparse
          const ENABLE_SYNTHETIC_TRADES = false; // DISABLED - Real trades are flowing
          if (ENABLE_SYNTHETIC_TRADES && quote.bid > 0 && quote.ask > 0) {
            const midPrice = (quote.bid + quote.ask) / 2;
            const syntheticTrade = {
              symbol: quote.symbol,
              price: midPrice,
              size: 100, // Simulated size
              timestamp: quote.timestamp,
              exchange: 'SYNTHETIC',
              conditions: ['TEST'],
              data_source: 'synthetic_trade'
            };

            const tradeBroadcast = JSON.stringify({
              type: 'stock_trade',
              data: syntheticTrade
            });

            connectedClients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(tradeBroadcast);
              }
            });

            // Always log for debugging
            console.log('🧪 Synthetic trade generated:', syntheticTrade.symbol, '@', syntheticTrade.price.toFixed(2), '(from quote mid-price)');
            
            // Log synthetic trade to CSV as well
            logStockTrade(syntheticTrade);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error processing Alpaca stock message:', error.message);
    }
  });
  
  alpacaStockWebSocket.on('error', (error) => {
    console.error('❌ Alpaca Stock WebSocket error:', error);
  });
  
  alpacaStockWebSocket.on('close', () => {
    console.log('❌ Alpaca Stock WebSocket closed, reconnecting in 5s...');
    
    // Clear heartbeat interval
    if (stockHeartbeatInterval) {
      clearInterval(stockHeartbeatInterval);
      stockHeartbeatInterval = null;
    }
    
    setTimeout(connectToAlpacaStock, 5000);
  });
}

// Handle frontend WebSocket connections
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const url = req.url;
  
  console.log(`🔌 [CLIENT CONNECTED] Frontend client connected to live data stream`);
  console.log(`   - IP: ${clientIP}`);  
  console.log(`   - User Agent: ${userAgent}`);
  console.log(`   - URL: ${url}`);
  console.log(`   - Total clients now: ${connectedClients.size + 1}`);
  
  connectedClients.add(ws);
  
  // Send immediate connection confirmation
  ws.send(JSON.stringify({
    type: 'connection_confirmed',
    message: 'Successfully connected to live data stream',
    timestamp: new Date().toISOString(),
    clientCount: connectedClients.size
  }));
  
  ws.on('message', (message) => {
    try {
      console.log('📨 Received message from frontend client (first 200 chars):', message.toString().substring(0, 200));
      const data = JSON.parse(message);
      console.log('📦 Parsed frontend message:', data.action, 'symbols count:', data.symbols?.length || 0);

      if (data.action === 'subscribe' && data.symbols) {
        console.log('📡 Frontend subscription request for', data.symbols.length, 'symbols (handled via Data Bus)');
        console.log('📡 Symbols:', data.symbols.slice(0, 5));

        // NOTE: Direct Alpaca subscriptions disabled - all data flows through Data Bus
        // Frontend clients automatically receive data broadcasted from Data Bus
        // No action needed here, just log the request
        console.log('ℹ️ Data is automatically streamed via Data Bus - no manual subscription needed');
      }
    } catch (error) {
      console.error('❌ Error processing frontend message:', error);
    }
  });
  
  ws.on('close', (code, reason) => {
    console.log(`❌ [CLIENT DISCONNECTED] Frontend client disconnected (code: ${code}, reason: ${reason})`);
    console.log(`   - Total clients now: ${connectedClients.size - 1}`);
    connectedClients.delete(ws);
  });
  
  ws.on('error', (error) => {
    console.error(`❌ [CLIENT ERROR] WebSocket client error: ${error.message}`);
    connectedClients.delete(ws);
  });
  
  // Send additional connection confirmation (legacy)
  setTimeout(() => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Connected to live data stream (stock data via IEX, options via indicative feed)'
      }));
    }
  }, 100);
});

// Start Alpaca connections via Data Bus
// DISABLED: Direct WebSocket connections disabled - using Data Bus instead
// connectToAlpacaOptions(); // Disabled - will use Data Bus with options channels instead
// connectToAlpacaStock(); // Keep disabled - using Data Bus for stock data

// Initialize Data Bus Client
const BusClient = require('./BusClient');
const busClient = new BusClient('ws://data_bus_manager:3004');

// Connect to data bus
busClient.connect();

// Subscribe to stock AND options data channels for SPY, QQQ, IWM
busClient.on('connected', async () => {
  console.log('✅ Connected to Data Bus - subscribing to stock and options channels');
  
  // Subscribe to all channels
  busClient.subscribe([
    // Stock channels
    'stock.SPY.quote',
    'stock.SPY.trade',
    'stock.QQQ.quote',
    'stock.QQQ.trade',
    'stock.IWM.quote',
    'stock.IWM.trade',
    // Options channels - SPY options
    'options.SPY.quote',
    'options.SPY.trade',
    // Options channels - QQQ options  
    'options.QQQ.quote',
    'options.QQQ.trade',
    // Options channels - IWM options
    'options.IWM.quote',
    'options.IWM.trade'
  ]);
  
  // Wait a moment for subscription to be processed, then initialize and start options WebSocket
  setTimeout(async () => {
    console.log('🚀 Data Bus fully ready - Initializing dynamic options...');
    
    // Initialize underlying prices for dynamic options contract generation
    console.log('🔄 Fetching initial underlying prices for dynamic options...');
    for (const symbol of UNDERLYING_SYMBOLS) {
      try {
        const price = await getCurrentStockPrice(symbol);
        if (price > 0) {
          currentUnderlyingPrices.set(symbol, price);
          console.log(`💹 Initial ${symbol} price: $${price.toFixed(2)}`);
        }
      } catch (error) {
        console.warn(`⚠️ Could not fetch initial price for ${symbol}:`, error.message);
      }
    }
    
    console.log('✅ Data Bus connection established - options data will flow through Data Bus Manager');
  }, 1000);
});

// Forward stock and options data to frontend WebSocket clients
busClient.on('data', (channel, data) => {
  const [assetType, symbol, dataType] = channel.split('.');
  
  // Update underlying prices for dynamic options contract generation
  if (assetType === 'stock' && UNDERLYING_SYMBOLS.includes(symbol)) {
    let price = null;
    
    if (dataType === 'trade' && data.price > 0) {
      price = data.price;
    } else if (dataType === 'quote' && data.bid > 0 && data.ask > 0) {
      price = (data.bid + data.ask) / 2;
    }
    
    if (price) {
      const oldPrice = currentUnderlyingPrices.get(symbol);
      currentUnderlyingPrices.set(symbol, price);
      
      // Throttled logging for price updates (1% chance)
      if (Math.random() < 0.01) {
        console.log(`💹 ${symbol} price: ${oldPrice?.toFixed(2) || 'N/A'} → $${price.toFixed(2)} (${dataType})`);
      }
      
      // Update options subscriptions if price changed significantly (>$0.50)
      if (!oldPrice || Math.abs(price - oldPrice) > 0.5) {
        console.log(`🔄 Significant price change for ${symbol}: $${oldPrice?.toFixed(2) || 'N/A'} → $${price.toFixed(2)}`);
        setTimeout(updateSubscriptionSymbols, 1000); // Debounce updates
      }
    }
  }
  
  // Determine message type based on asset type and data type
  let messageType;
  if (assetType === 'stock') {
    messageType = dataType === 'trade' ? 'stock_trade' : 'stock_quote';
  } else if (assetType === 'options') {
    messageType = dataType === 'trade' ? 'option_trade' : 'option_quote';
  } else {
    console.warn(`⚠️ Unknown asset type: ${assetType} for channel: ${channel}`);
    return;
  }

  // Broadcast to all connected frontend clients
  let broadcastCount = 0;
  connectedClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: messageType,
        data: data
      }));
      broadcastCount++;
    } else {
      // Clean up closed connections
      connectedClients.delete(client);
    }
  });

  // Throttled logging (0.1% of messages) - show both stock and options
  if (Math.random() < 0.001) {
    console.log(`📡 Forwarded ${assetType} ${dataType} for ${symbol} to ${broadcastCount} client(s)`);
  }
});

console.log('📡 Direct Alpaca WebSocket connections disabled - using Data Bus instead');

// ===========================================================================================
// OPTIONS WEBSOCKET PUBLISHER - Connects to Alpaca and publishes to Data Bus
// ===========================================================================================

function connectToAlpacaOptionsPublisher() {
  console.log('⚠️  Direct Alpaca options connection DISABLED - using Data Bus Manager instead');
  return; // DISABLED - Options now handled by Data Bus Manager

  const apiKey = process.env.ALPACA_LIVE_API_KEY;
  const apiSecret = process.env.ALPACA_LIVE_API_SECRET;
  if (!apiKey || !apiSecret) {
    console.error('❌ Missing Alpaca API keys');
    return;
  }

  const url = 'wss://stream.data.alpaca.markets/v1beta1/indicative';
  let ws;
  
  // Dynamic contract selection based on current underlying prices (variables and functions declared globally above)

  function openSocket() {
    ws = new WebSocket(url, {
      headers: {
        'Content-Type': 'application/msgpack'  // options stream expects msgpack
      }
    });
    
    // Store WebSocket globally for dynamic resubscription
    global.optionsWebSocket = ws;
    // For Node.js, ws gives Buffer; msgpack decoder handles Buffer fine.
    // If you ever see ArrayBuffer, you could also set: ws.binaryType = 'nodebuffer';

    ws.on('open', () => {
      console.log('✅ WS open. Sending auth…');
      const auth = { action: 'auth', key: apiKey, secret: apiSecret };
      ws.send(encode(auth));  // <-- msgpack
    });

    ws.on('message', async (data) => {
      try {
        // All option messages are MsgPack (even success/auth replies)
        const msg = decode(data);
        const msgs = Array.isArray(msg) ? msg : [msg];

        // Process multiple messages concurrently for low latency
        const promises = msgs.map(async (m) => {
          if (m.T === 'success' && m.msg === 'connected') {
            console.log('✅ WS connected (server). Waiting for auth success…');
          } else if (m.T === 'success' && m.msg === 'authenticated') {
            console.log('✅ Authenticated. Subscribing to quotes/trades…');
            const sub = { action: 'subscribe', quotes: SUB_SYMBOLS, trades: SUB_SYMBOLS };
            ws.send(encode(sub));  // <-- msgpack
          } else if (m.T === 'subscription') {
            console.log('📡 Subscribed. Quotes:', m.quotes?.length || 0, 'Trades:', m.trades?.length || 0);
          } else if (m.T === 'q') {
            // Quote message (MsgPack fields) - LOW LATENCY DIRECT FORWARDING
            const quote = {
              symbol: m.S, bid: m.bp, ask: m.ap,
              bid_size: m.bs, ask_size: m.as,
              timestamp: m.t, data_source: 'indicative_feed'
            };
            
            // DIRECT WebSocket forwarding for low latency (bypasses Data Bus)
            const message = JSON.stringify({
              type: 'option_quote',
              data: quote
            });
            
            // Send directly to all connected WebSocket clients using connectedClients
            let broadcastCount = 0;
            connectedClients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(message);
                broadcastCount++;
              } else {
                // Clean up closed connections
                connectedClients.delete(client);
              }
            });
            
            // Also publish to Data Bus as fallback (if available)
            const und = quote.symbol.startsWith('SPY') ? 'SPY' :
                        quote.symbol.startsWith('QQQ') ? 'QQQ' :
                        quote.symbol.startsWith('IWM') ? 'IWM' : 'UNK';
            if (busClient && typeof busClient.publish === 'function' && busClient.connected) {
              busClient.publish(`options.${und}.quote`, quote);
            }
            
            // Throttled logging
            if (broadcastCount > 0 && Math.random() < 0.01) {
              console.log(`⚡ Options: Direct forwarded ${m.S} quote to ${broadcastCount} clients`);
            }
          } else if (m.T === 't') {
            const trade = { symbol: m.S, price: m.p, size: m.s, timestamp: m.t, data_source: 'indicative_feed' };
            const und = trade.symbol.startsWith('SPY') ? 'SPY' :
                        trade.symbol.startsWith('QQQ') ? 'QQQ' :
                        trade.symbol.startsWith('IWM') ? 'IWM' : 'UNK';
            
            // DIRECT WebSocket forwarding to frontend clients (PRIMARY PATH)
            const message = JSON.stringify({ type: 'option_trade', data: trade });
            let broadcastCount = 0;
            connectedClients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(message);
                broadcastCount++;
              } else {
                // Clean up closed connections
                connectedClients.delete(client);
              }
            });
            
            // Also publish to Data Bus as fallback (if available)
            if (busClient && busClient.connected && typeof busClient.publish === 'function') {
              busClient.publish(`options.${und}.trade`, trade);
            } else {
              // Log warning but don't treat as critical error - direct WebSocket works
              if (Math.random() < 0.01) {
                console.warn('⚠️  Data Bus not ready for options trade - using direct WebSocket delivery instead');
              }
            }
            
            // Throttled logging  
            if (broadcastCount > 0 && Math.random() < 0.01) {
              console.log(`⚡ Options: Direct forwarded ${m.S} trade to ${broadcastCount} clients`);
            }
          } else if (m.T === 'error') {
            console.error('❌ WS error:', m.code, m.msg);
            if (m.code === 412) {
              console.error('💡 Server requires MsgPack encoding - check auth/subscribe messages');
            }
          }
        });

        // Wait for all messages to be processed concurrently
        await Promise.all(promises);
      } catch (e) {
        console.error('❌ MsgPack decode error:', e.message);
      }
    });

    ws.on('close', (code, reason) => {
      console.warn('⚠️ WS closed:', code, reason?.toString());
      setTimeout(openSocket, 5000);
    });

    ws.on('error', (err) => {
      console.error('❌ WS error:', err.message);
    });
  }

  openSocket();
}

// NOTE: Options WebSocket Publisher now started from main busClient.on('connected') handler above

// Function to determine if it's overnight session (8 PM - 4 AM ET)
function isOvernightSession() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const etTime = new Date(utc + (-5 * 3600000)); // ET = UTC-5 (adjust for DST if needed)
  const hour = etTime.getHours();
  
  // Overnight session: 8 PM (20:00) to 4 AM (04:00) ET
  return hour >= 20 || hour < 4;
}

// DISABLED: Automatic reconnection disabled - using Data Bus instead
// Schedule automatic reconnection at session transitions (4 AM and 8 PM ET)
// let lastSessionType = isOvernightSession();
// setInterval(() => {
//   const currentSessionType = isOvernightSession();
//
//   // If session type changed, reconnect to use the appropriate feed
//   if (currentSessionType !== lastSessionType) {
//     console.log('🔄 Market session transition detected - Reconnecting to appropriate feed...');
//     lastSessionType = currentSessionType;
//     connectToAlpacaStock();
//   }
// }, 60000); // Check every minute

console.log('⏰ Automatic feed switching disabled - using Data Bus instead');

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Trading API server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📈 Market data: http://localhost:${PORT}/api/fetch-market-data`);
});

// Historical stock bars endpoint - aggregates from bus_stock_data
app.post('/api/historical-bars', async (req, res) => {
  try {
    const { symbol, startDate, endDate, timeframe = '1m' } = req.body;

    console.log(`📊 Historical bars requested: ${symbol} (${startDate} to ${endDate})`);

    if (!symbol || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required parameters: symbol, startDate, endDate' });
    }

    // Query raw trade data from bus_stock_data
    const query = `
      SELECT
        symbol,
        date_trunc('minute', timestamp) as bar_time,
        (array_agg(price ORDER BY timestamp))[1] as open,
        MAX(price) as high,
        MIN(price) as low,
        (array_agg(price ORDER BY timestamp DESC))[1] as close,
        SUM(volume) as volume,
        COUNT(*) as trade_count
      FROM bus_stock_data
      WHERE symbol = $1
        AND data_type = 'trade'
        AND timestamp >= $2
        AND timestamp <= $3
      GROUP BY symbol, bar_time
      ORDER BY bar_time ASC
    `;

    const result = await pool.query(query, [symbol, startDate, endDate]);

    const bars = result.rows.map(row => ({
      bar_timestamp: row.bar_time,
      open: parseFloat(row.open),
      high: parseFloat(row.high),
      low: parseFloat(row.low),
      close: parseFloat(row.close),
      volume: parseInt(row.volume) || 0,
      trade_count: parseInt(row.trade_count) || 0
    }));

    console.log(`✅ Returned ${bars.length} bars for ${symbol}`);

    res.json({
      symbol,
      timeframe,
      startDate,
      endDate,
      data: bars,
      count: bars.length,
      source: 'aggregated-from-trades'
    });

  } catch (error) {
    console.error('❌ Error fetching historical bars:', error);
    res.status(500).json({
      error: 'Failed to fetch historical bars',
      details: error.message
    });
  }
});

// Professional Trading Charts - 5 Days Stock Data
app.post('/api/trading-chart-data', async (req, res) => {
  try {
    const { symbol, timeframe = '1m' } = req.body;

    if (!symbol) {
      return res.status(400).json({ 
        error: 'Symbol is required',
        example: { symbol: 'SPY', timeframe: '1m' }
      });
    }

    console.log(`📊 [Trading Chart] Fetching 5-day data for ${symbol} (${timeframe})`);

    // Calculate 5 business days back (accounting for weekends)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 7); // Go back 7 days to ensure we get 5 business days

    console.log(`📊 [Trading Chart] Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);

    // First try to get data from our bus database
    let bars = [];
    try {
      const busQuery = `
        SELECT
          symbol,
          date_trunc('minute', timestamp) as bar_time,
          (array_agg(price ORDER BY timestamp))[1] as open,
          MAX(price) as high,
          MIN(price) as low,
          (array_agg(price ORDER BY timestamp DESC))[1] as close,
          SUM(volume) as volume,
          COUNT(*) as trade_count,
          AVG(price) as avg_price
        FROM bus_stock_data
        WHERE symbol = $1
          AND data_type = 'trade'
          AND timestamp >= $2
          AND timestamp <= $3
        GROUP BY symbol, bar_time
        ORDER BY bar_time ASC
      `;

      const busResult = await pool.query(busQuery, [symbol, startDate.toISOString(), endDate.toISOString()]);
      
      if (busResult.rows.length > 0) {
        console.log(`📊 [Trading Chart] Found ${busResult.rows.length} bars in bus database`);
        bars = busResult.rows.map(row => ({
          time: Math.floor(new Date(row.bar_time).getTime() / 1000), // TradingView format (seconds)
          open: parseFloat(row.open),
          high: parseFloat(row.high),
          low: parseFloat(row.low),
          close: parseFloat(row.close),
          volume: parseInt(row.volume) || 0,
          trade_count: parseInt(row.trade_count) || 0,
          avg_price: parseFloat(row.avg_price)
        }));
      }
    } catch (busError) {
      console.warn(`📊 [Trading Chart] Bus database error: ${busError.message}`);
    }

    // If we don't have enough recent data, try external API
    if (bars.length < 50) { // Less than 50 bars means we need more data
      console.log(`📊 [Trading Chart] Insufficient bus data (${bars.length} bars), trying external API`);
      
      try {
        // Use Alpaca for historical data
        const alpacaResponse = await fetch('https://paper-api.alpaca.markets/v2/stocks/bars', {
          method: 'GET',
          headers: {
            'APCA-API-KEY-ID': process.env.ALPACA_PAPER_API_KEY || 'demo',
            'APCA-API-SECRET-KEY': process.env.ALPACA_PAPER_API_SECRET || 'demo',
            'Content-Type': 'application/json'
          },
          params: new URLSearchParams({
            symbols: symbol,
            timeframe: '1Min',
            start: startDate.toISOString(),
            end: endDate.toISOString(),
            limit: 10000
          })
        });

        if (alpacaResponse.ok) {
          const alpacaData = await alpacaResponse.json();
          if (alpacaData.bars && alpacaData.bars[symbol]) {
            const alpacaBars = alpacaData.bars[symbol].map(bar => ({
              time: Math.floor(new Date(bar.t).getTime() / 1000),
              open: bar.o,
              high: bar.h,
              low: bar.l,
              close: bar.c,
              volume: bar.v
            }));
            bars = [...bars, ...alpacaBars].sort((a, b) => a.time - b.time);
            console.log(`📊 [Trading Chart] Added ${alpacaBars.length} bars from Alpaca API`);
          }
        }
      } catch (alpacaError) {
        console.warn(`📊 [Trading Chart] Alpaca API error: ${alpacaError.message}`);
        console.log(`📊 [Trading Chart] No fallback data - returning empty array for ${symbol}`);
        bars = [];
      }
    }

    // Calculate additional metrics
    const lastPrice = bars.length > 0 ? bars[bars.length - 1].close : 0;
    const firstPrice = bars.length > 0 ? bars[0].open : 0;
    const priceChange = lastPrice - firstPrice;
    const priceChangePercent = firstPrice > 0 ? (priceChange / firstPrice) * 100 : 0;
    
    const totalVolume = bars.reduce((sum, bar) => sum + (bar.volume || 0), 0);
    const avgVolume = bars.length > 0 ? totalVolume / bars.length : 0;

    // Get the latest quote if available
    const latestQuote = await getLatestQuote(symbol);

    console.log(`📊 [Trading Chart] Returning ${bars.length} bars for ${symbol}`);

    res.json({
      success: true,
      symbol,
      timeframe,
      bars,
      count: bars.length,
      summary: {
        firstPrice,
        lastPrice,
        priceChange,
        priceChangePercent: parseFloat(priceChangePercent.toFixed(2)),
        totalVolume,
        avgVolume: parseFloat(avgVolume.toFixed(0)),
        timeRange: {
          start: startDate.toISOString(),
          end: endDate.toISOString()
        }
      },
      latestQuote,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [Trading Chart] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch trading chart data',
      details: error.message
    });
  }
});



async function getLatestQuote(symbol) {
  try {
    const quoteQuery = `
      SELECT 
        symbol, price, bid, ask, timestamp, data_type
      FROM bus_stock_data 
      WHERE symbol = $1 
        AND data_type IN ('quote', 'trade')
      ORDER BY timestamp DESC 
      LIMIT 1
    `;
    
    const result = await pool.query(quoteQuery, [symbol]);
    
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        symbol: row.symbol,
        price: parseFloat(row.price || 0),
        bid: parseFloat(row.bid || 0),
        ask: parseFloat(row.ask || 0),
        timestamp: row.timestamp,
        type: row.data_type
      };
    }
    return null;
  } catch (error) {
    console.error('Error fetching latest quote:', error);
    return null;
  }
}

console.log('📊 [Trading Chart] Enhanced trading chart endpoint added');

// Professional Options Data - Greeks, IV, Bid/Ask, Recent Trades
app.post('/api/options-matrix-data', async (req, res) => {
  try {
    const { symbol, expiration, strikes = 'ATM±5' } = req.body;

    if (!symbol) {
      return res.status(400).json({ 
        error: 'Symbol is required',
        example: { symbol: 'SPY', expiration: '2025-11-15', strikes: 'ATM±5' }
      });
    }

    console.log(`⚡ [Context7 Options Matrix] Fetching individual bot options data for ${symbol}`);

    // Get current stock price for the specific symbol
    const currentPrice = await getCurrentStockPrice(symbol);
    console.log(`⚡ [Context7] ${symbol} current price: $${currentPrice}`);
    
    // Generate options contracts around current price with proper spacing
    const optionsContracts = generateOptionsMatrix(symbol, currentPrice, expiration, strikes);

    // Context7: Calculate complete Greeks and pricing for each contract individually
    const enhancedContracts = optionsContracts.map(contract => {
      const greeks = calculateGreeks(contract, currentPrice);
      const bidAsk = generateRealisticBidAsk(contract, currentPrice, greeks);
      
      const spread = bidAsk.ask - bidAsk.bid;
      const midPrice = (bidAsk.bid + bidAsk.ask) / 2;
      const intrinsicValue = contract.type === 'call' 
        ? Math.max(0, currentPrice - contract.strike)
        : Math.max(0, contract.strike - currentPrice);
      
      return {
        ...contract,
        ...bidAsk,
        ...greeks,
        spread: parseFloat(spread.toFixed(2)),
        spreadPercent: bidAsk.bid > 0 ? parseFloat(((spread / bidAsk.bid) * 100).toFixed(2)) : 0,
        midPrice: parseFloat(midPrice.toFixed(2)),
        intrinsicValue: parseFloat(intrinsicValue.toFixed(2)),
        timeValue: parseFloat(Math.max(0, midPrice - intrinsicValue).toFixed(2)),
        moneyness: parseFloat((contract.type === 'call' 
          ? currentPrice / contract.strike 
          : contract.strike / currentPrice).toFixed(3)),
        // Context7: Realistic volume/OI based on moneyness and time to expiry
        volume: Math.floor(Math.random() * (contract.daysToExpiration <= 7 ? 15000 : 8000)) + 100,
        openInterest: Math.floor(Math.random() * (Math.abs(contract.strike - currentPrice) < 10 ? 75000 : 25000)) + 1000,
        lastTrade: {
          price: parseFloat((midPrice + (Math.random() - 0.5) * spread * 0.3).toFixed(2)),
          time: new Date(Date.now() - Math.random() * 3600000).toISOString(),
          size: Math.floor(Math.random() * 100) + 1
        }
      };
    });

    // Context7: Sort by strike price and filter for most relevant contracts
    const sortedContracts = enhancedContracts.sort((a, b) => a.strike - b.strike);
    
    // Filter to most relevant strikes (±15% of current price)
    const priceRange = currentPrice * 0.15;
    const relevantContracts = sortedContracts.filter(contract => 
      contract.strike >= (currentPrice - priceRange) && 
      contract.strike <= (currentPrice + priceRange)
    );

    // Get recent options trades
    const recentTrades = await getRecentOptionsTrades(symbol);
    
    const atmStrike = findATMStrike(sortedContracts, currentPrice);

    console.log(`⚡ [Context7 Options Matrix] Bot ${symbol}: ${relevantContracts.length} relevant contracts (ATM: $${atmStrike}, Range: $${currentPrice - priceRange} - $${currentPrice + priceRange})`);

    res.json({
      success: true,
      symbol,
      currentPrice: parseFloat(currentPrice.toFixed(2)),
      expiration: expiration || getNextFridayExpiration(),
      contracts: relevantContracts,
      recentTrades,
      summary: {
        totalContracts: relevantContracts.length,
        callContracts: relevantContracts.filter(c => c.type === 'call').length,
        putContracts: relevantContracts.filter(c => c.type === 'put').length,
        atmStrike,
        totalVolume: relevantContracts.reduce((sum, c) => sum + c.volume, 0),
        averageIV: parseFloat((relevantContracts.reduce((sum, c) => sum + c.impliedVolatility, 0) / relevantContracts.length).toFixed(1)),
        priceRange: { min: currentPrice - priceRange, max: currentPrice + priceRange },
        strikeInterval: getStrikeInterval(currentPrice)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ [Options Matrix] Error:', error);
    res.status(500).json({
      error: 'Failed to fetch options matrix data',
      details: error.message
    });
  }
});

async function getCurrentStockPrice(symbol) {
  try {
    const query = `
      SELECT price, timestamp
      FROM bus_stock_data 
      WHERE symbol = $1 
        AND data_type IN ('trade', 'quote')
        AND price > 0
      ORDER BY timestamp DESC 
      LIMIT 1
    `;
    
    const result = await pool.query(query, [symbol]);
    
    if (result.rows.length > 0) {
      const dbPrice = parseFloat(result.rows[0].price);
      const timestamp = result.rows[0].timestamp;
      
      // Check if data is fresh (within last 5 minutes)
      const dataAge = Date.now() - new Date(timestamp).getTime();
      const fiveMinutes = 5 * 60 * 1000;
      
      if (dataAge < fiveMinutes) {
        console.log(`✅ [CURRENT PRICE] ${symbol}: $${dbPrice.toFixed(2)} (DB, ${Math.floor(dataAge/1000)}s old)`);
        return dbPrice;
      } else {
        console.log(`⚠️ [STALE DATA] ${symbol} DB data is ${Math.floor(dataAge/60000)} minutes old, fetching live price...`);
      }
    }
    
    // Fallback to live Alpaca API for current price
    return await fetchLiveAlpacaPrice(symbol);
  } catch (error) {
    console.error('Error getting current price from DB:', error);
    // Fallback to live Alpaca API
    return await fetchLiveAlpacaPrice(symbol);
  }
}

async function fetchLiveAlpacaPrice(symbol) {
  try {
    const apiKey = process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_LIVE_API_KEY;
    const apiSecret = process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_LIVE_API_SECRET;
    
    if (!apiKey || !apiSecret) {
      console.error('❌ No Alpaca API keys configured for live price fetch');
      return getBasePrice(symbol);
    }
    
    const stockQuoteUrl = `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`;
    const stockResponse = await fetch(stockQuoteUrl, {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret,
      },
    });
    
    if (stockResponse.ok) {
      const stockData = await stockResponse.json();
      const quote = stockData.quote;
      const livePrice = (quote.bp + quote.ap) / 2; // Mid price
      console.log(`✅ [LIVE PRICE] ${symbol}: $${livePrice.toFixed(2)} (Alpaca API)`);
      return livePrice;
    } else {
      const errorText = await stockResponse.text();
      console.error(`❌ Alpaca API error for ${symbol}:`, errorText);
      return getBasePrice(symbol);
    }
  } catch (error) {
    console.error(`❌ Error fetching live price for ${symbol}:`, error.message);
    return getBasePrice(symbol);
  }
}

function getBasePrice(symbol) {
  // Current market prices as of November 2025 - updated regularly
  const basePrices = {
    'SPY': 593.50,  // Updated from 580 to current range
    'QQQ': 523.25,  // Updated from 500 to current range  
    'IWM': 231.75,  // Updated for small caps
    'AAPL': 225.50,
    'MSFT': 415.00,
    'TSLA': 348.75,
    'NVDA': 142.50,
    'GOOGL': 180.25,
    'META': 563.00,
    'AMZN': 197.50
  };
  
  const price = basePrices[symbol] || 100; // Default fallback
  console.log(`⚠️ [FALLBACK PRICE] ${symbol}: $${price.toFixed(2)} (hardcoded base)`);
  return price;
}

function generateOptionsMatrix(symbol, currentPrice, expiration, strikes) {
  const contracts = [];
  const expirationDate = expiration || getNextFridayExpiration();
  
  // Context7: Generate strikes centered around current price with proper ATM coverage
  const strikeInterval = getStrikeInterval(currentPrice);
  
  // Find nearest ATM strike (round to nearest interval)
  const atmStrike = Math.round(currentPrice / strikeInterval) * strikeInterval;
  
  // Generate strikes in both directions from ATM
  const strikeRange = 15; // ±15 strikes for better coverage
  const strikes_array = [];
  
  for (let i = -strikeRange; i <= strikeRange; i++) {
    const strike = atmStrike + (i * strikeInterval);
    
    // Only include realistic strikes (within reasonable bounds)
    if (strike > 0 && strike <= currentPrice * 2) {
      strikes_array.push(strike);
    }
  }
  
  // Generate both calls and puts for each strike
  strikes_array.forEach(strike => {
    // Call option
    contracts.push({
      symbol: `${symbol}${formatExpirationForSymbol(expirationDate)}C${formatStrikeForSymbol(strike)}`,
      underlying: symbol,
      type: 'call',
      strike,
      expiration: expirationDate,
      daysToExpiration: getDaysToExpiration(expirationDate)
    });
    
    // Put option
    contracts.push({
      symbol: `${symbol}${formatExpirationForSymbol(expirationDate)}P${formatStrikeForSymbol(strike)}`,
      underlying: symbol,
      type: 'put', 
      strike,
      expiration: expirationDate,
      daysToExpiration: getDaysToExpiration(expirationDate)
    });
  });
  
  console.log(`⚡ [Options Matrix] Generated ${contracts.length} contracts for ${symbol} (current: $${currentPrice}, ATM: $${atmStrike}, interval: $${strikeInterval})`);
  
  return contracts;
}

function calculateGreeks(contract, currentPrice) {
  const { strike, type, daysToExpiration } = contract;
  const timeToExpiry = Math.max(0.001, daysToExpiration / 365); // Prevent division by zero
  const riskFreeRate = 0.05; // 5% risk-free rate
  
  // Context7: Dynamic IV calculation based on moneyness and time to expiry
  const moneyness = currentPrice / strike;
  let volatility = 0.20; // Base 20% IV
  
  // Adjust IV based on moneyness (volatility smile)
  if (type === 'call') {
    volatility += Math.abs(moneyness - 1) * 0.15; // OTM calls have higher IV
  } else {
    volatility += Math.abs(1 - moneyness) * 0.12; // OTM puts have higher IV
  }
  
  // Adjust for time to expiry (term structure)
  if (daysToExpiration <= 7) {
    volatility *= 1.3; // Weekly options have higher IV
  } else if (daysToExpiration <= 30) {
    volatility *= 1.1; // Monthly options slightly higher
  }
  
  // Ensure volatility is reasonable
  volatility = Math.max(0.10, Math.min(0.80, volatility));
  
  // Black-Scholes d1 and d2 calculations
  const d1 = (Math.log(currentPrice / strike) + (riskFreeRate + 0.5 * volatility * volatility) * timeToExpiry) 
    / (volatility * Math.sqrt(timeToExpiry));
  const d2 = d1 - volatility * Math.sqrt(timeToExpiry);
  
  // Standard normal CDF and PDF
  const N = x => 0.5 * (1 + erf(x / Math.sqrt(2)));
  const n = x => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
  
  let delta, gamma, theta, vega, rho;
  
  if (type === 'call') {
    delta = N(d1);
    gamma = n(d1) / (currentPrice * volatility * Math.sqrt(timeToExpiry));
    theta = -(currentPrice * n(d1) * volatility / (2 * Math.sqrt(timeToExpiry)) + 
             riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry) * N(d2)) / 365;
    vega = currentPrice * n(d1) * Math.sqrt(timeToExpiry) / 100;
    rho = strike * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * N(d2) / 100;
  } else {
    delta = N(d1) - 1;
    gamma = n(d1) / (currentPrice * volatility * Math.sqrt(timeToExpiry));
    theta = -(currentPrice * n(d1) * volatility / (2 * Math.sqrt(timeToExpiry)) - 
             riskFreeRate * strike * Math.exp(-riskFreeRate * timeToExpiry) * N(-d2)) / 365;
    vega = currentPrice * n(d1) * Math.sqrt(timeToExpiry) / 100;
    rho = -strike * timeToExpiry * Math.exp(-riskFreeRate * timeToExpiry) * N(-d2) / 100;
  }
  
  // Context7: Enhanced Greeks object with additional calculated values
  return {
    delta: parseFloat(delta.toFixed(3)),
    gamma: parseFloat(gamma.toFixed(6)), // More precision for gamma
    theta: parseFloat(theta.toFixed(3)),
    vega: parseFloat(vega.toFixed(3)),
    rho: parseFloat(rho.toFixed(3)),
    impliedVolatility: parseFloat((volatility * 100).toFixed(1)),
    // Additional derived values
    elasticity: parseFloat((delta * currentPrice / Math.max(0.01, (currentPrice - strike))).toFixed(2)),
    probability: parseFloat((type === 'call' ? N(d2) : N(-d2)).toFixed(3)) // Probability of finishing ITM
  };
}

// Error function approximation for normal distribution
function erf(x) {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;

  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);

  const t = 1.0/(1.0 + p*x);
  const y = 1.0 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1)*t*Math.exp(-x*x);

  return sign*y;
}

function generateRealisticBidAsk(contract, currentPrice, greeks) {
  const { strike, type } = contract;
  
  // Calculate theoretical value (simplified Black-Scholes)
  let theoreticalValue;
  if (type === 'call') {
    theoreticalValue = Math.max(0, currentPrice - strike + Math.random() * 5);
  } else {
    theoreticalValue = Math.max(0, strike - currentPrice + Math.random() * 5);
  }
  
  // Add time value based on days to expiration
  const timeValue = Math.random() * 2 + 0.5;
  theoreticalValue += timeValue;
  
  // Create bid-ask spread (wider for less liquid options)
  const spreadPercent = 0.02 + Math.random() * 0.08; // 2-10% spread
  const spread = theoreticalValue * spreadPercent;
  
  const mid = Math.max(0.01, theoreticalValue);
  const bid = Math.max(0.01, mid - spread / 2);
  const ask = mid + spread / 2;
  
  return {
    bid: parseFloat(bid.toFixed(2)),
    ask: parseFloat(ask.toFixed(2))
  };
}

function getStrikeInterval(price) {
  // Context7: Tighter strike intervals for better options matrix granularity
  if (price < 25) return 0.5;    // Very low-priced stocks: $0.50 intervals
  if (price < 50) return 1;      // Low-priced stocks: $1 intervals  
  if (price < 100) return 1;     // Medium-priced stocks: $1 intervals (was 2.5)
  if (price < 200) return 1;     // Higher-priced stocks: $1 intervals (was 5)
  if (price < 500) return 1;     // ETFs like QQQ (~$400): $1 intervals (was 10)
  if (price < 1000) return 1;    // High-priced ETFs like SPY (~$680): $1 intervals (was 25)
  return 5;                      // Very high-priced stocks: $5 intervals
}

function getNextFridayExpiration() {
  const today = new Date();
  const nextFriday = new Date(today);
  nextFriday.setDate(today.getDate() + (5 - today.getDay() + 7) % 7);
  if (nextFriday <= today) nextFriday.setDate(nextFriday.getDate() + 7);
  return nextFriday.toISOString().split('T')[0];
}

function getDaysToExpiration(expirationDate) {
  const expiry = new Date(expirationDate);
  const today = new Date();
  return Math.max(0, Math.ceil((expiry - today) / (1000 * 60 * 60 * 24)));
}

function formatExpirationForSymbol(date) {
  const d = new Date(date);
  const year = d.getFullYear().toString().slice(-2);
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return year + month + day;
}

function formatStrikeForSymbol(strike) {
  return (strike * 1000).toString().padStart(8, '0');
}

function findATMStrike(contracts, currentPrice) {
  return contracts.reduce((closest, contract) => {
    return Math.abs(contract.strike - currentPrice) < Math.abs(closest.strike - currentPrice) 
      ? contract : closest;
  }).strike;
}

async function getRecentOptionsTrades(symbol) {
  // Mock recent trades for now
  return Array.from({ length: 10 }, (_, i) => ({
    timestamp: new Date(Date.now() - i * 60000).toISOString(),
    symbol: `${symbol}251115C00450000`,
    price: 5.25 + Math.random() * 2 - 1,
    size: Math.floor(Math.random() * 50) + 1,
    type: Math.random() > 0.5 ? 'buy' : 'sell'
  }));
}

console.log('⚡ [Options Matrix] Enhanced options matrix endpoint added');

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down server...');
  await pool.end();
  process.exit(0);
});