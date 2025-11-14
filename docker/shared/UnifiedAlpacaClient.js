/**
 * UnifiedAlpacaClient - Consolidated Alpaca API client
 * 
 * TIER 0.3 FIX: Merges 3 duplicate Alpaca clients into single source of truth
 * 
 * Supports 3 modes:
 * - BACKTEST: Historical data fetching for backtesting
 * - LIVE: Real paper/live trading with order execution
 * - MOCK: Testing mode with simulated data (no API calls)
 * 
 * Consolidates:
 * - backtesting-server/utils/alpaca-client.js (data fetching)
 * - paper-trading-service/src/AlpacaTradingClient.js (trading)
 * - paper-trading-service/src/MockAlpacaClient.js (mock)
 */

const fetch = require('node-fetch');
const Alpaca = require('@alpacahq/alpaca-trade-api');

class UnifiedAlpacaClient {
  constructor(config = {}) {
    this.mode = config.mode || 'BACKTEST'; // BACKTEST, LIVE, or MOCK
    this.apiKey = config.apiKey || process.env.ALPACA_PAPER_API_KEY || process.env.ALPACA_LIVE_API_KEY;
    this.apiSecret = config.apiSecret || process.env.ALPACA_PAPER_API_SECRET || process.env.ALPACA_LIVE_API_SECRET;
    this.baseUrl = config.baseUrl || 'https://data.alpaca.markets';
    this.paper = config.paper !== undefined ? config.paper : true;
    this.usePolygon = config.usePolygon || false;
    
    this.alpaca = null; // For LIVE mode
    this.connected = false;
    this.account = null;

    // Mock mode state
    if (this.mode === 'MOCK') {
      this.initializeMockState();
    }

    // Validate config for non-mock modes
    if (this.mode !== 'MOCK' && (!this.apiKey || !this.apiSecret)) {
      throw new Error('Alpaca API credentials not configured');
    }

    console.log(`✅ UnifiedAlpacaClient initialized in ${this.mode} mode`);
  }

  // ============================================================================
  // INITIALIZATION & CONNECTION
  // ============================================================================

  /**
   * Initialize client (required for LIVE mode)
   */
  async initialize() {
    if (this.mode === 'MOCK') {
      this.connected = true;
      console.log('✅ [MOCK] Mock connection established');
      return true;
    }

    if (this.mode === 'LIVE') {
      try {
        this.alpaca = new Alpaca({
          keyId: this.apiKey,
          secretKey: this.apiSecret,
          paper: this.paper,
          usePolygon: this.usePolygon
        });

        // Test connection
        this.account = await this.alpaca.getAccount();
        this.connected = true;
        
        console.log(`✅ [LIVE] Connected to Alpaca ${this.paper ? 'paper' : 'live'} trading`);
        console.log(`💰 [LIVE] Account equity: $${parseFloat(this.account.equity).toFixed(2)}`);
        
        return true;
      } catch (error) {
        console.error('❌ [LIVE] Failed to initialize:', error);
        throw error;
      }
    }

    // BACKTEST mode doesn't need initialization
    this.connected = true;
    return true;
  }

  /**
   * Test connection to Alpaca API
   */
  async testConnection() {
    if (this.mode === 'MOCK') {
      return true;
    }

    try {
      const url = `${this.baseUrl}/v2/stocks/SPY/bars?start=2024-01-01&end=2024-01-02&timeframe=1Day&limit=1`;
      
      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecret,
        },
      });

      if (response.ok) {
        console.log('✅ Connection test successful');
        return true;
      } else {
        console.error('❌ Connection test failed:', response.status);
        return false;
      }
    } catch (error) {
      console.error('❌ Connection test error:', error.message);
      return false;
    }
  }

  /**
   * Check connection status
   */
  isConnected() {
    return this.connected;
  }

  // ============================================================================
  // DATA FETCHING (BACKTEST & LIVE modes)
  // ============================================================================

  /**
   * Fetch historical bars for underlying stock
   */
  async getHistoricalBars(params) {
    if (this.mode === 'MOCK') {
      return this.mockHistoricalBars(params);
    }

    const {
      symbol,
      start,
      end,
      startDate,
      endDate,
      timeframe = '1Min',
      limit = 10000
    } = params;

    const startParam = start || startDate;
    const endParam = end || endDate;

    console.log(`📊 Fetching historical bars for ${symbol}`);
    console.log(`   Date range: ${startParam} to ${endParam}, Timeframe: ${timeframe}`);

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

      console.log(`✅ Received ${bars.length} bars for ${symbol}`);
      return { bars };
    } catch (error) {
      console.error(`❌ Error fetching bars for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch option chain for a given expiry date
   */
  async getOptionChain(params) {
    if (this.mode === 'MOCK') {
      return this.mockOptionChain(params);
    }

    const {
      underlying,
      expiryDate,
      strikeRange = 10,
      strikeSpacing = 1
    } = params;

    console.log(`📊 Fetching option chain for ${underlying}, expiry: ${expiryDate}`);

    const symbols = this.generateOptionSymbols({
      underlying,
      expiryDate,
      centerStrike: params.centerStrike,
      strikeRange,
      strikeSpacing
    });

    return symbols;
  }

  /**
   * Fetch historical option bars with enhanced OHLCV
   */
  async getHistoricalOptionBars(params) {
    if (this.mode === 'MOCK') {
      return this.mockOptionBars(params);
    }

    const {
      symbols,
      startDate,
      endDate,
      timeframe = '1Min',
      limit = 10000,
      volumeFilter = true,
      minVolume = 10,
      minTradeCount = 1
    } = params;

    console.log(`📊 Fetching option bars for ${symbols.length} symbols (Enhanced OHLCV)`);
    console.log(`   Volume filtering: ${volumeFilter ? `enabled (min vol: ${minVolume})` : 'disabled'}`);

    const results = {};
    let totalBarsProcessed = 0;
    let totalBarsFiltered = 0;
    
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
          console.warn(`⚠️ Options bars request failed: ${errorText}`);
          continue;
        }

        const data = await response.json();
        
        if (data.bars) {
          for (const [symbol, bars] of Object.entries(data.bars)) {
            if (!Array.isArray(bars) || bars.length === 0) continue;
            
            totalBarsProcessed += bars.length;
            
            let filteredBars = bars;
            if (volumeFilter) {
              filteredBars = bars.filter(bar => {
                const volume = parseInt(bar.v || 0);
                const tradeCount = parseInt(bar.n || 0);
                const hasValidPrice = bar.o > 0 && bar.h > 0 && bar.l > 0 && bar.c > 0;
                
                return volume >= minVolume && 
                       tradeCount >= minTradeCount && 
                       hasValidPrice &&
                       bar.h >= bar.l &&
                       bar.o <= bar.h && bar.o >= bar.l &&
                       bar.c <= bar.h && bar.c >= bar.l;
              });
              
              totalBarsFiltered += (bars.length - filteredBars.length);
            }
            
            const enhancedBars = filteredBars.map(bar => ({
              ...bar,
              mid: (parseFloat(bar.h) + parseFloat(bar.l)) / 2,
              vwap: bar.vw || bar.c,
              o: parseFloat(bar.o),
              h: parseFloat(bar.h),
              l: parseFloat(bar.l),
              c: parseFloat(bar.c),
              v: parseInt(bar.v || 0),
              n: parseInt(bar.n || 0),
              qualityScore: this.calculateBarQualityScore(bar)
            }));
            
            if (enhancedBars.length > 0) {
              results[symbol] = enhancedBars;
            }
          }
        }

        console.log(`   ✓ Processed chunk ${Math.floor(i / chunkSize) + 1}/${Math.ceil(symbols.length / chunkSize)}`);
        await new Promise(resolve => setTimeout(resolve, 350));
        
      } catch (error) {
        console.error(`❌ Error fetching option bars chunk:`, error.message);
      }
    }

    const totalBars = Object.values(results).reduce((sum, bars) => sum + (bars?.length || 0), 0);
    console.log(`✅ Enhanced OHLCV complete: ${totalBars} bars across ${Object.keys(results).length} contracts`);
    console.log(`   🧹 Processed: ${totalBarsProcessed}, filtered: ${totalBarsFiltered}`);

    return results;
  }

  /**
   * Generate option symbols in Alpaca format
   */
  generateOptionSymbols(params) {
    const {
      underlying,
      expiryDate,
      centerStrike,
      strikeRange = 10,
      strikeSpacing = 1
    } = params;

    if (!centerStrike) {
      throw new Error('centerStrike is required for option symbol generation');
    }

    const dateObj = new Date(expiryDate);
    const year = dateObj.getFullYear().toString().slice(-2);
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    const formattedDate = year + month + day;

    const symbols = [];

    for (let i = -strikeRange; i <= strikeRange; i++) {
      const strike = centerStrike + (i * strikeSpacing);
      if (strike > 0) {
        const dollars = Math.floor(strike);
        const cents = Math.round((strike - dollars) * 100);
        const strikeFormatted = dollars.toString().padStart(5, '0') + 
                                cents.toString().padStart(3, '0');

        symbols.push(`${underlying}${formattedDate}C${strikeFormatted}`);
        symbols.push(`${underlying}${formattedDate}P${strikeFormatted}`);
      }
    }

    console.log(`✅ Generated ${symbols.length} option symbols for ${underlying} ${expiryDate}`);
    return symbols;
  }

  /**
   * Calculate quality score for an option bar (0-100)
   */
  calculateBarQualityScore(bar) {
    let score = 0;
    
    const volume = parseInt(bar.v || 0);
    const tradeCount = parseInt(bar.n || 0);
    const spread = parseFloat(bar.h) - parseFloat(bar.l);
    const price = parseFloat(bar.c);
    
    if (volume >= 100) score += 40;
    else if (volume >= 50) score += 30;
    else if (volume >= 20) score += 20;
    else if (volume >= 10) score += 10;
    
    if (tradeCount >= 10) score += 30;
    else if (tradeCount >= 5) score += 20;
    else if (tradeCount >= 2) score += 15;
    else if (tradeCount >= 1) score += 10;
    
    const spreadPercent = price > 0 ? (spread / price) * 100 : 0;
    if (spreadPercent <= 2) score += 20;
    else if (spreadPercent <= 5) score += 15;
    else if (spreadPercent <= 10) score += 10;
    else if (spreadPercent <= 20) score += 5;
    
    const hasVWAP = bar.vw && parseFloat(bar.vw) > 0;
    const priceConsistency = bar.o > 0 && bar.h >= bar.l && 
                            bar.o >= bar.l && bar.o <= bar.h &&
                            bar.c >= bar.l && bar.c <= bar.h;
    if (hasVWAP && priceConsistency) score += 10;
    else if (priceConsistency) score += 5;
    
    return Math.min(100, Math.max(0, score));
  }

  // ============================================================================
  // TRADING OPERATIONS (LIVE mode only)
  // ============================================================================

  /**
   * Check if market is currently open
   */
  async isMarketOpen() {
    if (this.mode === 'MOCK') {
      return this.mockIsMarketOpen();
    }

    if (this.mode === 'BACKTEST') {
      return false; // Backtesting doesn't need market hours
    }

    try {
      const clock = await this.alpaca.getClock();
      console.log(`🕐 Market status: ${clock.is_open ? 'OPEN' : 'CLOSED'}`);
      return clock.is_open;
    } catch (error) {
      console.error('❌ Error checking market status:', error);
      return false;
    }
  }

  /**
   * Get account information
   */
  async getAccount() {
    if (this.mode === 'MOCK') {
      return this.mockGetAccount();
    }

    if (this.mode === 'BACKTEST') {
      throw new Error('getAccount() not available in BACKTEST mode');
    }

    try {
      if (!this.connected) {
        throw new Error('Alpaca client not connected');
      }

      this.account = await this.alpaca.getAccount();
      return {
        equity: parseFloat(this.account.equity),
        cash: parseFloat(this.account.cash),
        buying_power: parseFloat(this.account.buying_power),
        portfolio_value: parseFloat(this.account.portfolio_value),
        pattern_day_trader: this.account.pattern_day_trader,
        daytrade_count: parseInt(this.account.daytrade_count) || 0,
        status: this.account.status
      };
      
    } catch (error) {
      console.error('❌ Error getting account:', error);
      throw error;
    }
  }

  /**
   * Find suitable option contracts
   */
  async findOptionContract(signal) {
    if (this.mode === 'MOCK') {
      return this.mockFindOptionContract(signal);
    }

    if (this.mode === 'BACKTEST') {
      throw new Error('findOptionContract() not available in BACKTEST mode');
    }

    try {
      const { symbol, signal_type, target_delta, underlying_price } = signal;
      
      const optionsChain = await this.alpaca.getOptionContracts({
        underlying_symbol: symbol,
        status: 'active',
        expiration_date_gte: new Date().toISOString().split('T')[0],
        expiration_date_lte: this.getExpirationDate(7),
        limit: 100
      });

      if (!optionsChain || optionsChain.length === 0) {
        throw new Error(`No option contracts found for ${symbol}`);
      }

      const optionType = signal_type === 'BUY_CALL' ? 'call' : 'put';
      const filteredContracts = optionsChain.filter(contract => 
        contract.type === optionType
      );

      if (filteredContracts.length === 0) {
        throw new Error(`No ${optionType} contracts found for ${symbol}`);
      }

      let bestContract = null;
      let bestDeltaDiff = Infinity;

      for (const contract of filteredContracts) {
        const approximateDelta = this.estimateDelta(
          contract.type,
          parseFloat(contract.strike_price),
          underlying_price
        );

        const deltaDiff = Math.abs(approximateDelta - Math.abs(target_delta));
        
        if (deltaDiff < bestDeltaDiff) {
          bestDeltaDiff = deltaDiff;
          bestContract = contract;
        }
      }

      if (!bestContract) {
        throw new Error(`No suitable option contract found for target delta ${target_delta}`);
      }

      console.log(`🎯 Found option: ${bestContract.symbol} (strike: $${bestContract.strike_price})`);
      return bestContract;
      
    } catch (error) {
      console.error('❌ Error finding option contract:', error);
      throw error;
    }
  }

  /**
   * Submit order to Alpaca
   */
  async submitOrder(orderParams) {
    if (this.mode === 'MOCK') {
      return this.mockSubmitOrder(orderParams);
    }

    if (this.mode === 'BACKTEST') {
      throw new Error('submitOrder() not available in BACKTEST mode');
    }

    try {
      const order = await this.alpaca.createOrder(orderParams);
      console.log(`✅ Order submitted: ${order.id} - ${orderParams.qty} x ${orderParams.symbol}`);
      return order;
    } catch (error) {
      console.error('❌ Error submitting order:', error);
      throw error;
    }
  }

  /**
   * Get current positions
   */
  async getPositions() {
    if (this.mode === 'MOCK') {
      return this.mockGetPositions();
    }

    if (this.mode === 'BACKTEST') {
      throw new Error('getPositions() not available in BACKTEST mode');
    }

    try {
      const positions = await this.alpaca.getPositions();
      
      return positions.map(position => ({
        symbol: position.symbol,
        quantity: parseInt(position.qty),
        market_value: parseFloat(position.market_value),
        cost_basis: parseFloat(position.cost_basis),
        unrealized_pl: parseFloat(position.unrealized_pl),
        unrealized_plpc: parseFloat(position.unrealized_plpc),
        current_price: parseFloat(position.current_price),
        avg_entry_price: parseFloat(position.avg_entry_price),
        side: position.side
      }));
      
    } catch (error) {
      console.error('❌ Error getting positions:', error);
      return [];
    }
  }

  /**
   * Close position
   */
  async closePosition(symbol, reason = 'strategy_exit') {
    if (this.mode === 'MOCK') {
      return this.mockClosePosition(symbol, reason);
    }

    if (this.mode === 'BACKTEST') {
      throw new Error('closePosition() not available in BACKTEST mode');
    }

    try {
      console.log(`🚪 Closing position: ${symbol} (${reason})`);
      
      const position = await this.alpaca.getPosition(symbol);
      
      if (!position) {
        throw new Error(`Position not found: ${symbol}`);
      }

      const side = position.side === 'long' ? 'sell' : 'buy';
      const quantity = Math.abs(parseInt(position.qty));

      const order = await this.alpaca.createOrder({
        symbol: symbol,
        qty: quantity,
        side: side,
        type: 'market',
        time_in_force: 'day'
      });

      console.log(`✅ Close order placed: ${order.id}`);

      return {
        orderId: order.id,
        quantity: quantity,
        side: side,
        reason: reason,
        orderStatus: order.status
      };

    } catch (error) {
      console.error('❌ Error closing position:', error);
      throw error;
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId) {
    if (this.mode === 'MOCK') {
      return this.mockGetOrderStatus(orderId);
    }

    if (this.mode === 'BACKTEST') {
      throw new Error('getOrderStatus() not available in BACKTEST mode');
    }

    try {
      const order = await this.alpaca.getOrder(orderId);
      
      return {
        id: order.id,
        status: order.status,
        filled_qty: parseInt(order.filled_qty),
        filled_avg_price: parseFloat(order.filled_avg_price) || null,
        submitted_at: order.submitted_at,
        filled_at: order.filled_at,
        canceled_at: order.canceled_at,
        rejected_at: order.rejected_at
      };
      
    } catch (error) {
      console.error('❌ Error getting order status:', error);
      return null;
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    if (this.mode === 'MOCK') {
      return this.mockCancelOrder(orderId);
    }

    if (this.mode === 'BACKTEST') {
      throw new Error('cancelOrder() not available in BACKTEST mode');
    }

    try {
      await this.alpaca.cancelOrder(orderId);
      console.log(`❌ Order canceled: ${orderId}`);
      return true;
    } catch (error) {
      console.error('❌ Error canceling order:', error);
      return false;
    }
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Estimate delta for option selection
   */
  estimateDelta(optionType, strike, underlyingPrice) {
    const moneyness = underlyingPrice / strike;
    
    if (optionType === 'call') {
      if (moneyness > 1.1) return 0.8;
      if (moneyness > 1.05) return 0.6;
      if (moneyness > 0.95) return 0.4;
      if (moneyness > 0.9) return 0.2;
      return 0.1;
    } else {
      if (moneyness < 0.9) return -0.8;
      if (moneyness < 0.95) return -0.6;
      if (moneyness < 1.05) return -0.4;
      if (moneyness < 1.1) return -0.2;
      return -0.1;
    }
  }

  /**
   * Get expiration date X days from now
   */
  getExpirationDate(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  // ============================================================================
  // MOCK MODE IMPLEMENTATIONS
  // ============================================================================

  initializeMockState() {
    this.account = {
      id: 'MOCK_ACCOUNT_123',
      equity: 100000,
      cash: 95000,
      buying_power: 200000,
      portfolio_value: 100000,
      pattern_day_trader: false,
      daytrade_count: 0,
      status: 'ACTIVE'
    };
    this.positions = new Map();
    this.orders = new Map();
    this.orderId = 1;
    console.log('🧪 Mock state initialized - no real trades');
  }

  mockIsMarketOpen() {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const day = easternTime.getDay();
    if (day === 0 || day === 6) return false;
    
    const hour = easternTime.getHours();
    const minute = easternTime.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    
    return timeInMinutes >= 570 && timeInMinutes < 960; // 9:30 AM - 4:00 PM
  }

  mockGetAccount() {
    return {
      equity: parseFloat(this.account.equity),
      cash: parseFloat(this.account.cash),
      buying_power: parseFloat(this.account.buying_power),
      portfolio_value: parseFloat(this.account.portfolio_value),
      pattern_day_trader: this.account.pattern_day_trader,
      daytrade_count: parseInt(this.account.daytrade_count) || 0,
      status: this.account.status
    };
  }

  mockFindOptionContract(signal) {
    const { symbol, signal_type, underlying_price } = signal;
    const expiry = this.getNextFriday();
    const strike = Math.round(underlying_price / 5) * 5;
    const optionType = signal_type === 'BUY_CALL' ? 'C' : 'P';
    
    return {
      symbol: `${symbol}${this.formatExpiryDate(expiry)}${optionType}${strike.toString().padStart(8, '0')}`,
      type: signal_type === 'BUY_CALL' ? 'call' : 'put',
      strike_price: strike,
      expiration_date: expiry.toISOString().split('T')[0],
      bid: this.calculateMockOptionPrice(underlying_price, strike, optionType, 'bid'),
      ask: this.calculateMockOptionPrice(underlying_price, strike, optionType, 'ask'),
      mid: this.calculateMockOptionPrice(underlying_price, strike, optionType, 'mid')
    };
  }

  mockSubmitOrder(orderParams) {
    const orderId = `MOCK_ORDER_${this.orderId++}`;
    const order = {
      id: orderId,
      symbol: orderParams.symbol,
      qty: orderParams.qty,
      side: orderParams.side,
      type: orderParams.type,
      status: 'filled',
      filled_qty: orderParams.qty,
      filled_avg_price: orderParams.limit_price || 1.0,
      filled_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    
    this.orders.set(orderId, order);
    console.log(`📋 [MOCK] Order executed: ${orderParams.qty} x ${orderParams.symbol}`);
    return order;
  }

  mockGetPositions() {
    return Array.from(this.positions.values());
  }

  mockClosePosition(symbol, reason) {
    const position = this.positions.get(symbol);
    if (!position) {
      throw new Error(`No position found for ${symbol}`);
    }
    
    const orderId = `MOCK_CLOSE_${this.orderId++}`;
    this.positions.delete(symbol);
    
    console.log(`🔄 [MOCK] Position closed: ${symbol} (${reason})`);
    
    return {
      orderId: orderId,
      quantity: position.quantity,
      side: 'sell',
      reason: reason,
      orderStatus: 'filled'
    };
  }

  mockGetOrderStatus(orderId) {
    const order = this.orders.get(orderId);
    return order || null;
  }

  mockCancelOrder(orderId) {
    this.orders.delete(orderId);
    return true;
  }

  mockHistoricalBars(params) {
    // Return empty bars for mock mode
    return { bars: [] };
  }

  mockOptionChain(params) {
    return [];
  }

  mockOptionBars(params) {
    return {};
  }

  getNextFriday() {
    const today = new Date();
    const daysUntilFriday = (5 - today.getDay() + 7) % 7;
    const friday = new Date(today);
    friday.setDate(today.getDate() + daysUntilFriday);
    return friday;
  }

  formatExpiryDate(date) {
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return year + month + day;
  }

  calculateMockOptionPrice(underlyingPrice, strike, optionType, priceType) {
    let intrinsic = 0;
    if (optionType === 'C') {
      intrinsic = Math.max(0, underlyingPrice - strike);
    } else {
      intrinsic = Math.max(0, strike - underlyingPrice);
    }

    const timeValue = Math.sqrt(7 / 365) * 0.3 * underlyingPrice * 0.4;
    let price = intrinsic + timeValue;

    if (priceType === 'bid') price *= 0.95;
    else if (priceType === 'ask') price *= 1.05;

    return Math.max(0.05, Number(price.toFixed(2)));
  }
}

module.exports = UnifiedAlpacaClient;
