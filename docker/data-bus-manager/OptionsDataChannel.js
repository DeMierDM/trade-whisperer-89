/**
 * OptionsDataChannel
 * Manages options data fetching and caching using indicative feed
 */

const fetch = require('node-fetch');
const WebSocket = require('ws');
const { encode, decode } = require('@msgpack/msgpack');

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

    // WebSocket connection for real-time options data
    this.optionsWebSocket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 5000; // 5 seconds
    
    // Subscription symbols - will be populated dynamically
    this.subscriptionSymbols = [];
    
    // Underlying symbols to monitor for dynamic contract generation
    this.underlyingSymbols = ['SPY', 'QQQ', 'IWM'];
    this.underlyingPrices = new Map(); // symbol -> current price
    
    console.log('✅ OptionsDataChannel initialized with indicative feed and WebSocket capability');
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
   * Get option snapshots with Greeks and IV from Alpaca
   * This provides real-time Greeks data calculated by Alpaca
   *
   * @param {Array<string>} symbols - Array of option contract symbols
   * @returns {Object} Snapshots with latest trade, quote, Greeks, and IV
   */
  async getOptionSnapshots(symbols) {
    if (!symbols || symbols.length === 0) {
      return {};
    }

    const batchSize = 50; // Alpaca recommends max 50 symbols per request
    const allSnapshots = {};

    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const symbolsParam = batch.join(',');

      const snapshotsUrl = `${this.marketDataBaseUrl}/v2/options/snapshots?symbols=${encodeURIComponent(symbolsParam)}&feed=${this.feed}`;

      console.log(`📊 Fetching option snapshots (Greeks + IV) for ${batch.length} contracts...`);

      try {
        const response = await fetch(snapshotsUrl, {
          headers: {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.apiSecret,
          },
        });

        if (!response.ok) {
          console.error(`❌ Options snapshots API error: ${response.status}`);
          const errorText = await response.text();
          console.error(`Response: ${errorText}`);
          continue;
        }

        const data = await response.json();

        if (data.snapshots) {
          // Process each snapshot
          for (const [symbol, snapshot] of Object.entries(data.snapshots)) {
            // Extract all available data
            const enrichedSnapshot = {
              symbol: symbol,
              timestamp: new Date().toISOString(),

              // Latest trade
              latestTrade: snapshot.latestTrade ? {
                price: snapshot.latestTrade.p,
                size: snapshot.latestTrade.s,
                exchange: snapshot.latestTrade.x,
                timestamp: snapshot.latestTrade.t,
                conditions: snapshot.latestTrade.c
              } : null,

              // Latest quote
              latestQuote: snapshot.latestQuote ? {
                bid: snapshot.latestQuote.bp,
                ask: snapshot.latestQuote.ap,
                bid_size: snapshot.latestQuote.bs,
                ask_size: snapshot.latestQuote.as,
                bid_exchange: snapshot.latestQuote.bx,
                ask_exchange: snapshot.latestQuote.ax,
                timestamp: snapshot.latestQuote.t,
                condition: snapshot.latestQuote.c
              } : null,

              // IMPLIED VOLATILITY - KEY FIELD
              impliedVolatility: snapshot.impliedVolatility || null,

              // GREEKS - KEY FIELDS
              greeks: snapshot.greeks ? {
                delta: snapshot.greeks.delta || null,
                gamma: snapshot.greeks.gamma || null,
                theta: snapshot.greeks.theta || null,
                vega: snapshot.greeks.vega || null,
                rho: snapshot.greeks.rho || null
              } : null,

              data_source: 'alpaca_snapshots'
            };

            allSnapshots[symbol] = enrichedSnapshot;

            // Publish to bus for real-time processing
            this.bus.publish(`options.${symbol}.snapshot`, enrichedSnapshot);
          }

          console.log(`✅ Fetched snapshots with Greeks for ${Object.keys(data.snapshots).length} contracts`);
        }

        // Small delay between batches to respect rate limits
        if (i + batchSize < symbols.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      } catch (error) {
        console.error(`❌ Failed to fetch option snapshots:`, error.message);
      }
    }

    return allSnapshots;
  }

  /**
   * Start periodic polling for Greeks data on active contracts
   * Call this method to continuously update Greeks for contracts you're monitoring
   *
   * @param {Array<string>} symbols - Array of option symbols to monitor
   * @param {number} intervalMs - Polling interval in milliseconds (default: 60000 = 1 min)
   */
  startGreeksPolling(symbols, intervalMs = 60000) {
    if (this.greeksPollingInterval) {
      clearInterval(this.greeksPollingInterval);
    }

    console.log(`📡 Starting Greeks polling for ${symbols.length} contracts every ${intervalMs/1000}s`);

    // Fetch immediately
    this.getOptionSnapshots(symbols);

    // Then poll periodically
    this.greeksPollingInterval = setInterval(async () => {
      try {
        await this.getOptionSnapshots(symbols);
      } catch (error) {
        console.error('❌ Error in Greeks polling:', error.message);
      }
    }, intervalMs);
  }

  /**
   * Stop Greeks polling
   */
  stopGreeksPolling() {
    if (this.greeksPollingInterval) {
      clearInterval(this.greeksPollingInterval);
      this.greeksPollingInterval = null;
      console.log('🛑 Greeks polling stopped');
    }
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
   * Initialize options WebSocket connection
   */
  async initializeWebSocket() {
    if (this.isConnected) {
      console.log('⚠️  Options WebSocket already connected');
      return;
    }

    console.log('🚀 Initializing options WebSocket connection to Alpaca indicative feed...');
    
    // Get initial underlying prices for dynamic contract generation
    await this.updateUnderlyingPrices();
    
    // Generate initial subscription symbols
    this.generateSubscriptionSymbols();
    
    // Connect to WebSocket
    this.connectOptionsWebSocket();
  }

  /**
   * Update current underlying prices for dynamic contract generation
   */
  async updateUnderlyingPrices() {
    for (const symbol of this.underlyingSymbols) {
      try {
        const response = await fetch(`${this.marketDataBaseUrl}/v2/stocks/${symbol}/quotes/latest`, {
          headers: {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.apiSecret,
          },
        });

        if (response.ok) {
          const data = await response.json();
          if (data.quote) {
            const midPrice = (data.quote.bp + data.quote.ap) / 2;
            this.underlyingPrices.set(symbol, midPrice);
            console.log(`📊 Updated ${symbol} price: $${midPrice.toFixed(2)}`);
          }
        }
      } catch (error) {
        console.error(`❌ Failed to update ${symbol} price:`, error.message);
      }
    }
  }

  /**
   * Generate dynamic options contract symbols based on current underlying prices
   */
  generateSubscriptionSymbols() {
    const today = new Date();
    const symbols = [];

    for (const [symbol, price] of this.underlyingPrices) {
      if (!price) continue;

      // Generate 0DTE contracts (if available) and weekly contracts
      const expiryDates = this.getTargetExpiryDates(today);
      
      for (const expiry of expiryDates) {
        // ATM and nearby strikes (±$10 range with $1 spacing)
        const strikes = this.generateStrikes(price, 10, 1);
        
        for (const strike of strikes) {
          // Call and Put contracts
          symbols.push(this.formatOptionSymbol(symbol, expiry, 'C', strike));
          symbols.push(this.formatOptionSymbol(symbol, expiry, 'P', strike));
        }
      }
    }

    this.subscriptionSymbols = symbols.slice(0, 200); // Limit to prevent overwhelming
    console.log(`📡 Generated ${this.subscriptionSymbols.length} options symbols for subscription`);
  }

  /**
   * Get target expiry dates (0DTE if available, next 2-3 weeklies)
   */
  getTargetExpiryDates(today) {
    const expiryDates = [];
    const dayOfWeek = today.getDay(); // 0 = Sunday, 5 = Friday
    
    // Check if today is Friday (0DTE opportunity)
    if (dayOfWeek === 5) {
      expiryDates.push(this.formatExpiryDate(today));
    }
    
    // Next 2 Fridays
    for (let weeks = 1; weeks <= 2; weeks++) {
      const nextFriday = new Date(today);
      nextFriday.setDate(today.getDate() + ((5 - dayOfWeek + 7) % 7) + (weeks - 1) * 7);
      expiryDates.push(this.formatExpiryDate(nextFriday));
    }
    
    return expiryDates;
  }

  /**
   * Generate strike prices around current price
   */
  generateStrikes(currentPrice, range, spacing) {
    const strikes = [];
    const baseStrike = Math.round(currentPrice / spacing) * spacing;
    
    for (let i = -range / spacing; i <= range / spacing; i++) {
      const strike = baseStrike + (i * spacing);
      if (strike > 0) {
        strikes.push(strike);
      }
    }
    
    return strikes;
  }

  /**
   * Format option symbol in Alpaca format: SYMBOL[YY][MM][DD][C/P][STRIKE*1000]
   */
  formatOptionSymbol(symbol, expiryDate, callPut, strike) {
    const strikeFormatted = String(Math.round(strike * 1000)).padStart(8, '0');
    return `${symbol}${expiryDate}${callPut}${strikeFormatted}`;
  }

  /**
   * Format expiry date as YYMMDD
   */
  formatExpiryDate(date) {
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
  }

  /**
   * Connect to Alpaca options WebSocket
   */
  connectOptionsWebSocket() {
    const url = 'wss://stream.data.alpaca.markets/v1beta1/indicative';
    
    this.optionsWebSocket = new WebSocket(url, {
      headers: {
        'Content-Type': 'application/msgpack'
      }
    });

    this.optionsWebSocket.on('open', () => {
      console.log('✅ Options WebSocket connected - sending auth...');
      const authMessage = {
        action: 'auth',
        key: this.apiKey,
        secret: this.apiSecret
      };
      this.optionsWebSocket.send(encode(authMessage));
    });

    this.optionsWebSocket.on('message', (data) => {
      try {
        const messages = decode(data);
        const msgArray = Array.isArray(messages) ? messages : [messages];
        
        msgArray.forEach(msg => this.handleOptionsMessage(msg));
      } catch (error) {
        console.error('❌ Error processing options message:', error.message);
      }
    });

    this.optionsWebSocket.on('close', () => {
      console.log('🔌 Options WebSocket disconnected');
      this.isConnected = false;
      this.scheduleReconnect();
    });

    this.optionsWebSocket.on('error', (error) => {
      console.error('❌ Options WebSocket error:', error.message);
    });
  }

  /**
   * Handle incoming options messages from Alpaca WebSocket
   */
  handleOptionsMessage(msg) {
    switch (msg.T) {
      case 'success':
        if (msg.msg === 'connected') {
          console.log('✅ Options WebSocket connected to server');
        } else if (msg.msg === 'authenticated') {
          console.log('✅ Options WebSocket authenticated - subscribing to symbols...');
          this.subscribeToOptions();
        }
        break;

      case 'subscription':
        console.log(`📡 Options subscription confirmed - Quotes: ${msg.quotes?.length || 0}, Trades: ${msg.trades?.length || 0}`);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        break;

      case 'q': // Quote message
        this.handleOptionsQuote(msg);
        break;

      case 't': // Trade message  
        this.handleOptionsTrade(msg);
        break;

      case 'error':
        console.error('❌ Options WebSocket error:', msg.code, msg.msg);
        break;

      default:
        console.log('📡 Options WebSocket message:', msg.T);
    }
  }

  /**
   * Handle options quote message with all Alpaca fields
   */
  handleOptionsQuote(msg) {
    const quote = {
      symbol: msg.S,
      bid_price: msg.bp,
      ask_price: msg.ap,
      bid_size: msg.bs,
      ask_size: msg.as,
      bid_exchange: msg.bx,
      ask_exchange: msg.ax,
      timestamp: msg.t,
      condition: msg.c,
      data_source: 'alpaca_indicative'
    };

    // Publish to Data Bus for real-time distribution
    const underlying = this.extractUnderlying(quote.symbol);
    if (underlying) {
      this.bus.publish(`options.${underlying}.quote`, quote);
    }

    // Store in database via SQL cache
    if (this.bus.sqlCache) {
      this.bus.sqlCache.handleOptionsQuoteUpdate('options.quote', quote);
    }

    // Log sample for monitoring
    if (Math.random() < 0.01) { // 1% sampling
      console.log(`📊 Options Quote: ${quote.symbol} Bid: $${quote.bid_price} Ask: $${quote.ask_price}`);
    }
  }

  /**
   * Handle options trade message with all Alpaca fields
   */
  handleOptionsTrade(msg) {
    const trade = {
      symbol: msg.S,
      price: msg.p,
      size: msg.s,
      exchange: msg.x,
      timestamp: msg.t,
      condition: msg.c,
      data_source: 'alpaca_indicative'
    };

    // Publish to Data Bus for real-time distribution
    const underlying = this.extractUnderlying(trade.symbol);
    if (underlying) {
      this.bus.publish(`options.${underlying}.trade`, trade);
    }

    // Store in database via SQL cache
    if (this.bus.sqlCache) {
      this.bus.sqlCache.handleOptionsTradeUpdate('options.trade', trade);
    }

    // Log sample for monitoring
    if (Math.random() < 0.01) { // 1% sampling
      console.log(`📊 Options Trade: ${trade.symbol} Price: $${trade.price} Size: ${trade.size}`);
    }
  }

  /**
   * Extract underlying symbol from options contract symbol
   */
  extractUnderlying(optionSymbol) {
    if (optionSymbol.startsWith('SPY')) return 'SPY';
    if (optionSymbol.startsWith('QQQ')) return 'QQQ';  
    if (optionSymbol.startsWith('IWM')) return 'IWM';
    return null;
  }

  /**
   * Subscribe to options quotes and trades
   */
  subscribeToOptions() {
    if (!this.optionsWebSocket || this.subscriptionSymbols.length === 0) {
      console.log('⚠️  No symbols to subscribe to');
      return;
    }

    const subscriptionMessage = {
      action: 'subscribe',
      quotes: this.subscriptionSymbols,
      trades: this.subscriptionSymbols
    };

    this.optionsWebSocket.send(encode(subscriptionMessage));
    console.log(`📡 Subscribed to ${this.subscriptionSymbols.length} options symbols`);
  }

  /**
   * Schedule WebSocket reconnection
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached for options WebSocket');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`🔄 Scheduling options WebSocket reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      console.log('🔄 Reconnecting options WebSocket...');
      this.connectOptionsWebSocket();
    }, delay);
  }

  /**
   * Update subscription symbols dynamically
   */
  async updateSubscriptionSymbols() {
    await this.updateUnderlyingPrices();
    this.generateSubscriptionSymbols();
    
    if (this.isConnected && this.optionsWebSocket) {
      this.subscribeToOptions();
    }
  }

  /**
   * Cleanup on shutdown
   */
  destroy() {
    this.stopGreeksPolling();
    this.clearCache();
    
    // Close WebSocket connection
    if (this.optionsWebSocket) {
      this.optionsWebSocket.close();
      this.optionsWebSocket = null;
    }
    
    console.log('🛑 OptionsDataChannel destroyed');
  }
}

module.exports = OptionsDataChannel;
