/**
 * OptionsDataChannel
 * Manages options data fetching and caching using indicative feed
 */

const fetch = require('node-fetch');

class OptionsDataChannel {
  constructor(busManager, apiKey, apiSecret) {
    this.bus = busManager;
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.contractCache = new Map();
    this.chainCache = new Map();
    this.marketDataBaseUrl = 'https://data.alpaca.markets';
    this.brokerBaseUrl = 'https://api.alpaca.markets';
    this.feed = 'indicative'; // Use free indicative feed

    console.log('✅ OptionsDataChannel initialized with indicative feed');
  }

  /**
   * Get option chain for a symbol and expiry
   */
  async getOptionChain(symbol, expiryDate, strikeRange = 5, strikeSpacing = 1) {
    const cacheKey = `${symbol}_${expiryDate}`;

    // Use request deduplicator to prevent duplicate fetches
    return this.bus.deduplicator.execute(cacheKey, async () => {
      console.log(`📊 Fetching option chain: ${symbol} expiry: ${expiryDate}`);

      try {
        // STEP 1: Get contracts from Broker API
        const contractsUrl = `${this.brokerBaseUrl}/v2/options/contracts?underlying_symbols=${symbol}&status=active&limit=1000`;

        const contractsResponse = await fetch(contractsUrl, {
          headers: {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.apiSecret,
          },
        });

        if (!contractsResponse.ok) {
          throw new Error(`Contracts API error: ${contractsResponse.status}`);
        }

        const contractsData = await contractsResponse.json();
        const contracts = contractsData.option_contracts || [];

        // STEP 2: Get current stock price
        const stockQuoteUrl = `${this.marketDataBaseUrl}/v2/stocks/${symbol}/quotes/latest`;
        const stockResponse = await fetch(stockQuoteUrl, {
          headers: {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.apiSecret,
          },
        });

        let currentPrice = null;
        if (stockResponse.ok) {
          const stockData = await stockResponse.json();
          const quote = stockData.quote;
          currentPrice = (quote.bp + quote.ap) / 2;
        }

        // STEP 3: Filter contracts
        const today = new Date();
        const todayStr = expiryDate || (today.getFullYear().toString().slice(-2) +
                       (today.getMonth() + 1).toString().padStart(2, '0') +
                       today.getDate().toString().padStart(2, '0'));

        let filteredContracts = contracts.filter(contract => {
          const expiry = contract.expiration_date?.replace(/-/g, '').slice(-6);
          return expiry === todayStr;
        });

        // Filter for ATM if we have current price
        if (currentPrice && filteredContracts.length > 0) {
          const atmContracts = filteredContracts.filter(contract => {
            const strikePrice = parseFloat(contract.strike_price);
            const priceDistance = Math.abs(strikePrice - currentPrice);
            return priceDistance <= (strikeSpacing * strikeRange);
          });

          if (atmContracts.length > 0) {
            filteredContracts = atmContracts;
          }
        }

        // Sort by distance from current price
        if (currentPrice) {
          filteredContracts.sort((a, b) => {
            const distanceA = Math.abs(parseFloat(a.strike_price) - currentPrice);
            const distanceB = Math.abs(parseFloat(b.strike_price) - currentPrice);
            return distanceA - distanceB;
          });
        }

        const selectedContracts = filteredContracts.slice(0, 20);

        // STEP 4: Get quotes for contracts using indicative feed
        if (selectedContracts.length > 0) {
          const contractSymbols = selectedContracts.map(c => c.symbol);
          const quotes = await this.getOptionQuotes(contractSymbols);

          // Merge contracts with quotes
          const enrichedContracts = selectedContracts.map(contract => {
            const quote = quotes[contract.symbol];

            if (quote) {
              return {
                ...contract,
                bid: quote.bp || null,
                ask: quote.ap || null,
                bid_size: quote.bs || null,
                ask_size: quote.as || null,
                last_price: quote.p || null,
                timestamp: quote.t || null,
                data_source: 'indicative_feed'
              };
            } else {
              return {
                ...contract,
                bid: null,
                ask: null,
                bid_size: null,
                ask_size: null,
                data_source: 'no_quote'
              };
            }
          });

          // Cache the result
          this.chainCache.set(cacheKey, {
            data: enrichedContracts,
            timestamp: Date.now()
          });

          // Publish to bus
          this.bus.publish(`options.${symbol}.chain`, enrichedContracts);

          console.log(`✅ Fetched ${enrichedContracts.length} option contracts for ${symbol}`);
          return enrichedContracts;
        }

        return [];
      } catch (error) {
        console.error(`❌ Failed to fetch option chain for ${symbol}:`, error.message);
        throw error;
      }
    });
  }

  /**
   * Get option quotes for multiple symbols
   */
  async getOptionQuotes(symbols) {
    const batchSize = 50;
    const allQuotes = {};

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const symbolsParam = batch.join(',');

      const quotesUrl = `${this.marketDataBaseUrl}/v1beta1/options/quotes/latest?symbols=${symbolsParam}&feed=${this.feed}`;

      try {
        const response = await fetch(quotesUrl, {
          headers: {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.apiSecret,
          },
        });

        if (!response.ok) {
          console.error(`❌ Options quotes API error: ${response.status}`);
          continue;
        }

        const data = await response.json();

        if (data.quotes) {
          Object.assign(allQuotes, data.quotes);
        }

        // Small delay between batches
        if (i + batchSize < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`❌ Failed to fetch option quotes batch:`, error.message);
      }
    }

    return allQuotes;
  }

  /**
   * Get historical options bars
   */
  async getHistoricalOptionsBars(symbols, startDate, endDate, timeframe = '1min') {
    const cacheKey = `bars_${symbols.join(',')}_${startDate}_${endDate}_${timeframe}`;

    return this.bus.deduplicator.execute(cacheKey, async () => {
      const batchSize = 50;
      const allBars = {};

      for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const symbolsParam = batch.join(',');

        const barsUrl = `${this.marketDataBaseUrl}/v1beta1/options/bars?symbols=${encodeURIComponent(symbolsParam)}&timeframe=${timeframe}&start=${encodeURIComponent(startDate)}&end=${encodeURIComponent(endDate)}&limit=1000&sort=asc`;

        console.log(`📊 Fetching options bars batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(symbols.length/batchSize)}`);

        try {
          const response = await fetch(barsUrl, {
            headers: {
              'APCA-API-KEY-ID': this.apiKey,
              'APCA-API-SECRET-KEY': this.apiSecret,
            },
          });

          if (!response.ok) {
            console.error(`❌ Options bars API error: ${response.status}`);
            continue;
          }

          const data = await response.json();

          if (data.bars) {
            Object.assign(allBars, data.bars);
          }

          // Small delay between batches
          if (i + batchSize < symbols.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`❌ Failed to fetch options bars batch:`, error.message);
        }
      }

      // Publish to bus
      this.bus.publish('options.bars.historical', allBars);

      console.log(`✅ Fetched historical bars for ${Object.keys(allBars).length} option contracts`);
      return allBars;
    });
  }

  /**
   * Get channel statistics
   */
  getStats() {
    return {
      cachedChains: this.chainCache.size,
      cachedContracts: this.contractCache.size,
      feed: this.feed
    };
  }

  /**
   * Clear caches
   */
  clearCache() {
    this.contractCache.clear();
    this.chainCache.clear();
    console.log('🧹 OptionsDataChannel cache cleared');
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    this.clearCache();
    console.log('🛑 OptionsDataChannel destroyed');
  }
}

module.exports = OptionsDataChannel;
