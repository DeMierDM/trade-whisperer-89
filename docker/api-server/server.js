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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
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
      // Try without feed parameter first, then fallback to iex if needed
      const url = `${baseUrl}/v2/stocks/${symbol}/bars?start=${start}&end=${end}&timeframe=${tf}&limit=10000&adjustment=all`;

      console.log('📈 Fetching bars (default feed):', url);

      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Alpaca error:', errorText);
        return res.status(response.status).json({ error: errorText });
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

      // Filter for ATM options and 0DTE expiry
      const today = new Date();
      const todayStr = today.getFullYear().toString().slice(-2) + 
                     (today.getMonth() + 1).toString().padStart(2, '0') + 
                     today.getDate().toString().padStart(2, '0'); // YYMMDD format
      
      console.log('📊 Looking for 0DTE options with expiry:', todayStr);
      
      let filteredContracts = contracts.filter(contract => {
        // Filter for 0DTE (today's expiry)
        const expiry = contract.expiration_date?.replace(/-/g, '').slice(-6); // Get YYMMDD
        return expiry === todayStr;
      });

      console.log(`📊 Found ${filteredContracts.length} 0DTE contracts`);

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

      // Sort by distance from current price and take top 20
      if (currentStockPrice) {
        filteredContracts.sort((a, b) => {
          const distanceA = Math.abs(parseFloat(a.strike_price) - currentStockPrice);
          const distanceB = Math.abs(parseFloat(b.strike_price) - currentStockPrice);
          return distanceA - distanceB;
        });
      }

      // Take top 20 contracts for quotes
      const selectedContracts = filteredContracts.slice(0, 20);
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
      
      // Use the EXACT format the user provided but with symbols parameter
      const quotesUrl = `${marketDataBaseUrl}/v1beta1/options/quotes/latest?symbols=${symbolsParam}&feed=opra`;

      console.log('📊 Step 2: Fetching latest options quotes from OPRA feed for', contractSymbols.length, 'symbols');
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

      // STEP 3: Merge contract data with latest quotes data from OPRA feed
      const enrichedContracts = selectedContracts.map(contract => {
        const quote = quotesData[contract.symbol];
        
        if (quote) {
          // Use real OPRA feed data
          return {
            ...contract,
            bid: quote.bp || null,         // bp = bid price
            ask: quote.ap || null,         // ap = ask price  
            bid_size: quote.bs || null,    // bs = bid size
            ask_size: quote.as || null,    // as = ask size
            last_price: quote.p || null,   // p = last trade price
            volume: quote.s || null,       // s = last trade size
            timestamp: quote.t || null,    // t = timestamp
            data_source: 'opra_feed'
          };
        } else {
          // Fallback to estimated data if no OPRA quote available
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
      const realDataContracts = enrichedContracts.filter(c => c.data_source === 'opra_feed');
      const estimatedDataContracts = enrichedContracts.filter(c => c.data_source === 'estimated_from_close');
      
      console.log(`📊 Real OPRA data: ${realDataContracts.length} contracts`);
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

      const greeksUrl = `${marketDataBaseUrl}/v1beta1/options/snapshots?symbols=${symbols}`;

      console.log('📊 Fetching options Greeks from Market Data API:', greeksUrl);
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
        const symbolsParam = optionSymbols.join(',');
        const optionsBarsUrl = `${marketDataBaseUrl}/v1beta1/options/bars?symbols=${encodeURIComponent(symbolsParam)}&timeframe=${timeframe}&start=${start}&end=${end}&limit=${limit}&sort=asc`;
        
        console.log('📊 Step 3: Fetching historical options bars');
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
      
      const quotesUrl = `${marketDataBaseUrl}/v1beta1/options/quotes/latest?symbols=${symbolsParam}&feed=opra`;
      
      console.log(`📡 Fetching batch ${Math.floor(i/batchSize) + 1}: ${batch.length} symbols`);
      
      const response = await fetch(quotesUrl, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret,
        },
      });

      if (!response.ok) {
        console.error(`❌ OPRA API error: ${response.status} ${response.statusText}`);
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
            data_source: 'opra_feed'
          };
        });
      }
      
      // Small delay between batches to respect rate limits
      if (i + batchSize < symbols.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`✅ Retrieved ${Object.keys(quotes).length} option quotes from OPRA feed`);
    
    res.json({
      quotes: quotes,
      total: Object.keys(quotes).length,
      requested: symbols.length,
      data_source: 'opra_feed',
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

// Connect to Alpaca Options WebSocket for live options data (MessagePack format)
function connectToAlpacaOptions() {
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

  console.log('🚀 Connecting to Alpaca Options WebSocket...');
  
  // Connect to Alpaca options WebSocket
  alpacaOptionsWebSocket = new WebSocket('wss://stream.data.alpaca.markets/v1beta1/opra');
  
  alpacaOptionsWebSocket.on('open', () => {
    console.log('✅ Connected to Alpaca Options WebSocket');
    
    // Authenticate - MUST use MessagePack for OPRA feed
    const authMessage = {
      action: 'auth',
      key: apiKey,
      secret: apiSecret
    };

    console.log('🔑 Sending options auth message (MessagePack encoded):', authMessage);
    alpacaOptionsWebSocket.send(encode(authMessage));
    
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
      // Decode MessagePack binary data
      const messages = decode(data);

      console.log('📦 Options decoded message:', JSON.stringify(messages).substring(0, 300));

      // Handle single message or array of messages
      const messageArray = Array.isArray(messages) ? messages : [messages];

      for (const message of messageArray) {
        console.log('🔍 Processing options message type:', message.T, 'msg:', message.msg);

        if (message.T === 'success' && message.msg === 'connected') {
          console.log('✅ Alpaca Options WebSocket connected successfully');
        } else if (message.T === 'success' && message.msg === 'authenticated') {
          console.log('✅ Alpaca Options WebSocket authenticated');
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
            data_source: 'opra_live'
          };

          // Throttle: only broadcast if enough time has passed since last broadcast
          const now = Date.now();
          const lastBroadcast = quoteThrottleMap.get(quote.symbol) || 0;

          if (now - lastBroadcast < QUOTE_THROTTLE_MS) {
            // Skip this quote - too soon
            return;
          }

          quoteThrottleMap.set(quote.symbol, now);

          console.log('📊 LIVE OPTION QUOTE from Alpaca:', quote.symbol, 'Bid:', quote.bid, 'Ask:', quote.ask);

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
    console.log('❌ Alpaca Options WebSocket closed, reconnecting in 5s...');
    
    // Clear heartbeat interval
    if (optionsHeartbeatInterval) {
      clearInterval(optionsHeartbeatInterval);
      optionsHeartbeatInterval = null;
    }
    
    setTimeout(connectToAlpacaOptions, 5000);
  });
}

// Connect to Alpaca Stock WebSocket for live stock data
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
wss.on('connection', (ws) => {
  console.log('🔌 Frontend client connected to live data stream');
  connectedClients.add(ws);
  
  ws.on('message', (message) => {
    try {
      console.log('📨 Received message from frontend client (first 200 chars):', message.toString().substring(0, 200));
      const data = JSON.parse(message);
      console.log('📦 Parsed frontend message:', data.action, 'symbols count:', data.symbols?.length || 0);

      if (data.action === 'subscribe' && data.symbols) {
        console.log('📡 Processing subscription for', data.symbols.length, 'symbols');
        console.log('📡 Symbols:', data.symbols.slice(0, 5));

        // Separate stock symbols from option symbols
        const stockSymbols = [];
        const optionSymbols = [];
        
        data.symbols.forEach(symbol => {
          // Option symbols have specific format: SPY251010C00662000 (has date + C/P + strike)
          if (symbol.match(/^[A-Z]+\d{6}[CP]\d{8}$/)) {
            optionSymbols.push(symbol);
          } else {
            stockSymbols.push(symbol);
          }
        });
        
        console.log('📊 Stock symbols:', stockSymbols.length, stockSymbols);
        console.log('📈 Option symbols:', optionSymbols.length, optionSymbols.slice(0, 3));

        // Subscribe to stock quotes AND trades (JSON format)
        if (stockSymbols.length > 0 && alpacaStockWebSocket && alpacaStockWebSocket.readyState === WebSocket.OPEN) {
          const stockSubscribeMessage = {
            action: 'subscribe',
            quotes: stockSymbols,
            trades: stockSymbols  // Subscribe to trades for chart updates
          };
          console.log('📡 Sending stock subscription (quotes + trades) to Alpaca for', stockSymbols.length, 'symbols');
          alpacaStockWebSocket.send(JSON.stringify(stockSubscribeMessage));
          console.log('✅ Stock subscription sent to Alpaca');
        } else if (stockSymbols.length > 0) {
          console.error('❌ Alpaca Stock WebSocket not ready! State:', alpacaStockWebSocket?.readyState);
        }

        // Subscribe to option quotes (MessagePack format)
        if (optionSymbols.length > 0 && alpacaOptionsWebSocket && alpacaOptionsWebSocket.readyState === WebSocket.OPEN) {
          const optionSubscribeMessage = {
            action: 'subscribe',
            quotes: optionSymbols
          };
          console.log('📡 Sending option subscription to Alpaca for', optionSymbols.length, 'symbols');
          alpacaOptionsWebSocket.send(encode(optionSubscribeMessage));
          console.log('✅ Option subscription sent to Alpaca');
        } else if (optionSymbols.length > 0) {
          console.error('❌ Alpaca Options WebSocket not ready! State:', alpacaOptionsWebSocket?.readyState);
        }
      }
    } catch (error) {
      console.error('❌ Error processing frontend message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('❌ Frontend client disconnected');
    connectedClients.delete(ws);
  });
  
  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to live OPRA data stream'
  }));
});

// Start Alpaca connections
connectToAlpacaOptions();
connectToAlpacaStock();

// Function to determine if it's overnight session (8 PM - 4 AM ET)
function isOvernightSession() {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const etTime = new Date(utc + (-5 * 3600000)); // ET = UTC-5 (adjust for DST if needed)
  const hour = etTime.getHours();
  
  // Overnight session: 8 PM (20:00) to 4 AM (04:00) ET
  return hour >= 20 || hour < 4;
}

// Schedule automatic reconnection at session transitions (4 AM and 8 PM ET)
let lastSessionType = isOvernightSession();
setInterval(() => {
  const currentSessionType = isOvernightSession();

  // If session type changed, reconnect to use the appropriate feed
  if (currentSessionType !== lastSessionType) {
    console.log('🔄 Market session transition detected - Reconnecting to appropriate feed...');
    lastSessionType = currentSessionType;
    connectToAlpacaStock();
  }
}, 60000); // Check every minute

console.log('⏰ Automatic feed switching enabled (checks every minute for session transitions)');

// Start server
server.listen(PORT, () => {
  console.log(`🚀 Trading API server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`📈 Market data: http://localhost:${PORT}/api/fetch-market-data`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🛑 Shutting down server...');
  await pool.end();
  process.exit(0);
});