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
      strikeRange = 10, // Number of strikes above/below ATM
      strikeSpacing = 1 // Changed from 5 to 1 for SPY $1 strike increments
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
      limit = 10000,
      volumeFilter = true,  // NEW: Enable volume filtering by default
      minVolume = 10,       // NEW: Minimum volume threshold
      minTradeCount = 1     // NEW: Minimum trade count threshold
    } = params;

    console.log(`📊 [ALPACA] Fetching option bars for ${symbols.length} symbols (ENHANCED OHLCV)`);
    console.log(`   Date range: ${startDate} to ${endDate}`);
    console.log(`   Volume filtering: ${volumeFilter ? `enabled (min vol: ${minVolume}, min trades: ${minTradeCount})` : 'disabled'}`);

    const results = {};
    let totalBarsProcessed = 0;
    let totalBarsFiltered = 0;
    
    // Alpaca supports multi-symbol request with comma-separated symbols
    // But we'll chunk them to avoid URL length limits
    const chunkSize = 20;
    
    for (let i = 0; i < symbols.length; i += chunkSize) {
      const chunk = symbols.slice(i, i + chunkSize);
      const symbolsParam = chunk.join(',');
      
      // Historical options bars - NO feed parameter (feed only applies to latest quotes, not historical bars)
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
        
        // Process and filter OHLCV data
        if (data.bars) {
          for (const [symbol, bars] of Object.entries(data.bars)) {
            if (!Array.isArray(bars) || bars.length === 0) continue;
            
            totalBarsProcessed += bars.length;
            
            // Apply volume and quality filtering if enabled
            let filteredBars = bars;
            if (volumeFilter) {
              filteredBars = bars.filter(bar => {
                // Volume filter: Remove bars with insufficient activity
                const volume = parseInt(bar.v || 0);
                const tradeCount = parseInt(bar.n || 0);
                const hasValidPrice = bar.o > 0 && bar.h > 0 && bar.l > 0 && bar.c > 0;
                
                return volume >= minVolume && 
                       tradeCount >= minTradeCount && 
                       hasValidPrice &&
                       bar.h >= bar.l && // Sanity check: high >= low
                       bar.o <= bar.h && bar.o >= bar.l && // Open within range
                       bar.c <= bar.h && bar.c >= bar.l;   // Close within range
              });
              
              totalBarsFiltered += (bars.length - filteredBars.length);
            }
            
            // Enhance bars with calculated fields for backtesting
            const enhancedBars = filteredBars.map(bar => ({
              ...bar,
              // Add mid price for better fill simulation
              mid: (parseFloat(bar.h) + parseFloat(bar.l)) / 2,
              // Add VWAP if not present (fallback to close price)
              vwap: bar.vw || bar.c,
              // Normalize numeric fields
              o: parseFloat(bar.o),
              h: parseFloat(bar.h),
              l: parseFloat(bar.l),
              c: parseFloat(bar.c),
              v: parseInt(bar.v || 0),
              n: parseInt(bar.n || 0),
              // Add quality score based on volume and spread
              qualityScore: this.calculateBarQualityScore(bar)
            }));
            
            if (enhancedBars.length > 0) {
              results[symbol] = enhancedBars;
            }
          }
        }

        console.log(`   ✓ Processed chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(symbols.length / chunkSize)} (${chunk.length} symbols)`);
        
        // Respect rate limits (200 requests/minute for indicative feed)
        await new Promise(resolve => setTimeout(resolve, 350)); // 350ms delay for safety
        
      } catch (error) {
        console.error(`❌ [ALPACA] Error fetching option bars chunk:`, error.message);
      }
    }

    const totalBars = Object.values(results).reduce((sum, bars) => sum + (bars?.length || 0), 0);
    console.log(`✅ [ALPACA] Enhanced OHLCV processing complete:`);
    console.log(`   📊 Total bars fetched: ${totalBars} across ${Object.keys(results).length} contracts`);
    console.log(`   🧹 Bars processed: ${totalBarsProcessed}, filtered out: ${totalBarsFiltered}`);
    console.log(`   📈 Data quality: ${volumeFilter ? 'Volume filtering enabled' : 'No filtering'}`);

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
      strikeRange = 10, // Number of strikes above/below ATM
      strikeSpacing = 1 // Changed from 5 to 1 for SPY $1 strike increments
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
   * Calculate quality score for an option bar (0-100)
   * Higher scores indicate better data quality for backtesting
   * @param {Object} bar - OHLCV bar data
   * @returns {number} Quality score (0-100)
   */
  calculateBarQualityScore(bar) {
    let score = 0;
    
    const volume = parseInt(bar.v || 0);
    const tradeCount = parseInt(bar.n || 0);
    const spread = parseFloat(bar.h) - parseFloat(bar.l);
    const price = parseFloat(bar.c);
    
    // Volume component (40 points max)
    if (volume >= 100) score += 40;
    else if (volume >= 50) score += 30;
    else if (volume >= 20) score += 20;
    else if (volume >= 10) score += 10;
    
    // Trade count component (30 points max)
    if (tradeCount >= 10) score += 30;
    else if (tradeCount >= 5) score += 20;
    else if (tradeCount >= 2) score += 15;
    else if (tradeCount >= 1) score += 10;
    
    // Spread/volatility component (20 points max)
    const spreadPercent = price > 0 ? (spread / price) * 100 : 0;
    if (spreadPercent <= 2) score += 20;      // Tight spread
    else if (spreadPercent <= 5) score += 15;  // Reasonable spread
    else if (spreadPercent <= 10) score += 10; // Wide spread
    else if (spreadPercent <= 20) score += 5;  // Very wide spread
    
    // Data consistency component (10 points max)
    const hasVWAP = bar.vw && parseFloat(bar.vw) > 0;
    const priceConsistency = bar.o > 0 && bar.h >= bar.l && 
                            bar.o >= bar.l && bar.o <= bar.h &&
                            bar.c >= bar.l && bar.c <= bar.h;
    if (hasVWAP && priceConsistency) score += 10;
    else if (priceConsistency) score += 5;
    
    return Math.min(100, Math.max(0, score));
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
