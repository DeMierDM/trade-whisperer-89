/**
 * Alpaca API Client
 * 
 * Provides methods to fetch historical stock and options data from Alpaca Markets API
 */

const fetch = require('node-fetch');

class AlpacaClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_LIVE_API_KEY;
    this.apiSecret = config.apiSecret || process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_LIVE_API_SECRET;
    this.baseUrl = config.baseUrl || 'https://data.alpaca.markets';
    
    if (!this.apiKey || !this.apiSecret) {
      throw new Error('Alpaca API credentials not configured');
    }

    console.log('✅ AlpacaClient initialized');
  }

  /**
   * Fetch historical bars for underlying stock
   * @param {Object} params - Request parameters
   * @returns {Promise<Array>} Array of OHLCV bars
   */
  async getHistoricalBars(params) {
    const {
      symbol,
      start,      // ISO 8601 format or YYYY-MM-DD
      end,        // ISO 8601 format or YYYY-MM-DD
      startDate,  // Alternative parameter name
      endDate,    // Alternative parameter name
      timeframe = '1Min',
      limit = 10000
    } = params;

    // Support both parameter naming conventions
    const startParam = start || startDate;
    const endParam = end || endDate;

    console.log(`📊 [ALPACA] Fetching historical bars for ${symbol}`);
    console.log(`   Date range: ${startParam} to ${endParam}`);
    console.log(`   Timeframe: ${timeframe}`);

    const url = `${this.baseUrl}/v2/stocks/${symbol}/bars?` +
      `start=${startParam}&end=${endParam}&timeframe=${timeframe}&limit=${limit}&feed=iex&adjustment=all`;

    try {
      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecret,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Alpaca API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const bars = data.bars || [];

      console.log(`✅ [ALPACA] Received ${bars.length} bars for ${symbol}`);

      // Return in format expected by BacktestEngine
      return { bars };
    } catch (error) {
      console.error(`❌ [ALPACA] Error fetching bars for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch option chain for a given expiry date
   * @param {Object} params - Request parameters
   * @returns {Promise<Array>} Array of option symbols
   */
  async getOptionChain(params) {
    const {
      underlying,
      expiryDate,
      strikeRange = 1, // Changed from 10 to 1 for tightest strike selection (±$5 for SPY with $5 spacing)
      strikeSpacing = 5
    } = params;

    console.log(`📊 [ALPACA] Fetching option chain for ${underlying}`);
    console.log(`   Expiry: ${expiryDate}`);
    console.log(`   Strike range: ${strikeRange} strikes above/below ATM`);

    // For now, we'll need underlying price to generate option symbols
    // This is a simplified implementation - a full implementation would
    // use Alpaca's options chain endpoint when available

    const symbols = this.generateOptionSymbols({
      underlying,
      expiryDate,
      centerStrike: null, // Will be determined from price
      strikeRange,
      strikeSpacing
    });

    return symbols;
  }

  /**
   * Fetch historical option bars
   * @param {Object} params - Request parameters
   * @returns {Promise<Object>} Object with option symbol as key and bars as value
   */
  async getHistoricalOptionBars(params) {
    const {
      symbols,  // Array of option symbols
      startDate,
      endDate,
      timeframe = '1Min',
      limit = 10000
    } = params;

    console.log(`📊 [ALPACA] Fetching option bars for ${symbols.length} symbols`);
    console.log(`   Date range: ${startDate} to ${endDate}`);

    const results = {};
    
    // Alpaca supports multi-symbol request with comma-separated symbols
    // But we'll chunk them to avoid URL length limits
    const chunkSize = 20;
    
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);
      const symbolsParam = chunk.join(',');
      
      const url = `${this.baseUrl}/v1beta1/options/bars?` +
        `symbols=${symbolsParam}&start=${startDate}&end=${endDate}&timeframe=${timeframe}&limit=${limit}`;

      try {
        const response = await fetch(url, {
          headers: {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.apiSecret,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn(`⚠️ [ALPACA] Options bars request failed: ${errorText}`);
          continue; // Skip this chunk and try next
        }

        const data = await response.json();
        
        // Merge results
        if (data.bars) {
          Object.assign(results, data.bars);
        }

        console.log(`   ✓ Fetched chunk ${i / chunkSize + 1} (${chunk.length} symbols)`);
        
        // INCREASED delay to respect rate limits (Alpaca has 200 requests/minute limit)
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay instead of 100ms
        
      } catch (error) {
        console.error(`❌ [ALPACA] Error fetching option bars chunk:`, error.message);
      }
    }

    const totalBars = Object.values(results).reduce((sum, bars) => sum + (bars?.length || 0), 0);
    console.log(`✅ [ALPACA] Total option bars fetched: ${totalBars} across ${Object.keys(results).length} contracts`);

    return results;
  }

  /**
   * Generate option symbols in Alpaca format
   * @param {Object} params - Symbol generation parameters
   * @returns {Array<string>} Array of option symbols
   */
  generateOptionSymbols(params) {
    const {
      underlying,
      expiryDate,
      centerStrike,
      strikeRange = 1, // Changed from 10 to 1 for tightest strike selection (±$5 for SPY with $5 spacing)
      strikeSpacing = 5
    } = params;

    if (!centerStrike) {
      throw new Error('centerStrike is required for option symbol generation');
    }

    // Convert date from YYYY-MM-DD to YYMMDD format
    const dateObj = new Date(expiryDate);
    const year = dateObj.getFullYear().toString().slice(-2);
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    const formattedDate = year + month + day;

    const symbols = [];

    for (let i = -strikeRange; i <= strikeRange; i++) {
      const strike = centerStrike + (i * strikeSpacing);
      if (strike > 0) {
        // Convert strike to Alpaca format: 5 digits dollars + 3 digits cents
        const dollars = Math.floor(strike);
        const cents = Math.round((strike - dollars) * 100);
        const strikeFormatted = dollars.toString().padStart(5, '0') + 
                                cents.toString().padStart(3, '0');

        symbols.push(`${underlying}${formattedDate}C${strikeFormatted}`);
        symbols.push(`${underlying}${formattedDate}P${strikeFormatted}`);
      }
    }

    console.log(`✅ [ALPACA] Generated ${symbols.length} option symbols for ${underlying} ${expiryDate}`);

    return symbols;
  }

  /**
   * Test connection to Alpaca API
   * @returns {Promise<boolean>} True if connection successful
   */
  async testConnection() {
    try {
      const url = `${this.baseUrl}/v2/stocks/SPY/bars?start=2024-01-01&end=2024-01-02&timeframe=1Day&limit=1`;
      
      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecret,
        },
      });

      if (response.ok) {
        console.log('✅ [ALPACA] Connection test successful');
        return true;
      } else {
        console.error('❌ [ALPACA] Connection test failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ [ALPACA] Connection test error:', error.message);
      return false;
    }
  }
}

module.exports = AlpacaClient;
