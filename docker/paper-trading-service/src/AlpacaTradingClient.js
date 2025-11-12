/**
 * AlpacaTradingClient - Paper trading integration with Alpaca
 * Handles order execution, position management, and market data
 */

const Alpaca = require('@alpacahq/alpaca-trade-api');

class AlpacaTradingClient {
  constructor(config) {
    this.config = config;
    this.alpaca = null;
    this.connected = false;
    this.account = null;
    
    console.log('🏗️ [AlpacaTradingClient] Initialized for paper trading');
  }

  /**
   * Initialize Alpaca client
   */
  async initialize() {
    try {
      this.alpaca = new Alpaca({
        keyId: this.config.apiKey,
        secretKey: this.config.apiSecret,
        paper: this.config.paper || true,
        usePolygon: this.config.usePolygon || false
      });

      // Test connection by getting account info
      this.account = await this.alpaca.getAccount();
      
      this.connected = true;
      console.log('✅ [AlpacaTradingClient] Connected to Alpaca paper trading');
      console.log(`💰 [AlpacaTradingClient] Account equity: $${parseFloat(this.account.equity).toFixed(2)}`);
      
    } catch (error) {
      console.error('❌ [AlpacaTradingClient] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Check connection status
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Check if market is currently open
   */
  async isMarketOpen() {
    if (!this.connected) {
      return false;
    }
    
    try {
      const calendar = await this.alpaca.getCalendar({
        start: new Date().toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
      });
      
      if (!calendar || calendar.length === 0) {
        return false; // No trading day
      }
      
      const todaySession = calendar[0];
      const now = new Date();
      const sessionStart = new Date(todaySession.open);
      const sessionEnd = new Date(todaySession.close);
      
      const isOpen = now >= sessionStart && now <= sessionEnd;
      
      console.log(`🕐 [AlpacaTradingClient] Market status: ${isOpen ? 'OPEN' : 'CLOSED'} (${now.toLocaleTimeString()} ET)`);
      
      return isOpen;
    } catch (error) {
      console.error('❌ [AlpacaTradingClient] Error checking market status:', error);
      return false;
    }
  }

  /**
   * Get account information
   */
  async getAccount() {
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
      console.error('❌ [AlpacaTradingClient] Error getting account:', error);
      throw error;
    }
  }

  /**
   * Find suitable option contracts based on signal
   */
  async findOptionContract(signal) {
    try {
      const { symbol, signal_type, target_delta, underlying_price } = signal;
      
      // Get options chain
      const optionsChain = await this.alpaca.getOptionContracts({
        underlying_symbol: symbol,
        status: 'active',
        expiration_date_gte: new Date().toISOString().split('T')[0], // Today or later
        expiration_date_lte: this.getExpirationDate(7), // Within 7 days
        limit: 100
      });

      if (!optionsChain || optionsChain.length === 0) {
        throw new Error(`No option contracts found for ${symbol}`);
      }

      // Filter by option type
      const optionType = signal_type === 'BUY_CALL' ? 'call' : 'put';
      const filteredContracts = optionsChain.filter(contract => 
        contract.type === optionType
      );

      if (filteredContracts.length === 0) {
        throw new Error(`No ${optionType} contracts found for ${symbol}`);
      }

      // Find contract closest to target delta
      let bestContract = null;
      let bestDeltaDiff = Infinity;

      for (const contract of filteredContracts) {
        // Calculate approximate delta based on strike vs underlying price
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

      console.log(`🎯 [AlpacaTradingClient] Found option: ${bestContract.symbol} (strike: $${bestContract.strike_price})`);
      
      return bestContract;
      
    } catch (error) {
      console.error('❌ [AlpacaTradingClient] Error finding option contract:', error);
      throw error;
    }
  }

  /**
   * Execute trade based on signal
   */
  async executeSignal(signal, quantity = 1) {
    try {
      console.log(`🚀 [AlpacaTradingClient] Executing signal: ${signal.signal_type} ${signal.symbol}`);
      
      // Find suitable option contract
      const optionContract = await this.findOptionContract(signal);
      
      // Get current option quote
      const quote = await this.getOptionQuote(optionContract.symbol);
      
      if (!quote || !quote.bid || !quote.ask) {
        throw new Error(`No valid quote for option ${optionContract.symbol}`);
      }

      // Calculate entry price (use ask for buying)
      const entryPrice = parseFloat(quote.ask);
      
      // Validate price is reasonable
      if (entryPrice <= 0 || entryPrice > 50) {
        throw new Error(`Option price out of reasonable range: $${entryPrice}`);
      }

      // Calculate total cost
      const totalCost = entryPrice * quantity * 100; // Options are in contracts of 100
      
      // Check buying power
      const account = await this.getAccount();
      if (totalCost > account.buying_power) {
        throw new Error(`Insufficient buying power: need $${totalCost}, have $${account.buying_power}`);
      }

      // Place order
      const order = await this.alpaca.createOrder({
        symbol: optionContract.symbol,
        qty: quantity,
        side: 'buy',
        type: 'limit',
        time_in_force: 'day',
        limit_price: entryPrice.toFixed(2),
        order_class: 'simple'
      });

      console.log(`✅ [AlpacaTradingClient] Order placed: ${order.id} for ${optionContract.symbol} @ $${entryPrice}`);

      return {
        orderId: order.id,
        optionSymbol: optionContract.symbol,
        quantity: quantity,
        entryPrice: entryPrice,
        totalCost: totalCost,
        orderStatus: order.status,
        strike: parseFloat(optionContract.strike_price),
        expiry: optionContract.expiration_date,
        optionType: optionContract.type
      };

    } catch (error) {
      console.error('❌ [AlpacaTradingClient] Error executing signal:', error);
      throw error;
    }
  }

  /**
   * Get option quote
   */
  async getOptionQuote(optionSymbol) {
    try {
      const quote = await this.alpaca.getLatestOptionTrade(optionSymbol);
      return quote;
    } catch (error) {
      console.error('❌ [AlpacaTradingClient] Error getting option quote:', error);
      return null;
    }
  }

  /**
   * Get current positions
   */
  async getPositions() {
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
      console.error('❌ [AlpacaTradingClient] Error getting positions:', error);
      return [];
    }
  }

  /**
   * Close position
   */
  async closePosition(symbol, reason = 'strategy_exit') {
    try {
      console.log(`🚪 [AlpacaTradingClient] Closing position: ${symbol} (${reason})`);
      
      // Get current position
      const position = await this.alpaca.getPosition(symbol);
      
      if (!position) {
        throw new Error(`Position not found: ${symbol}`);
      }

      // Close position (sell if long, buy if short)
      const side = position.side === 'long' ? 'sell' : 'buy';
      const quantity = Math.abs(parseInt(position.qty));

      const order = await this.alpaca.createOrder({
        symbol: symbol,
        qty: quantity,
        side: side,
        type: 'market',
        time_in_force: 'day'
      });

      console.log(`✅ [AlpacaTradingClient] Close order placed: ${order.id}`);

      return {
        orderId: order.id,
        quantity: quantity,
        side: side,
        reason: reason,
        orderStatus: order.status
      };

    } catch (error) {
      console.error('❌ [AlpacaTradingClient] Error closing position:', error);
      throw error;
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(orderId) {
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
      console.error('❌ [AlpacaTradingClient] Error getting order status:', error);
      return null;
    }
  }

  /**
   * Cancel order
   */
  async cancelOrder(orderId) {
    try {
      await this.alpaca.cancelOrder(orderId);
      console.log(`❌ [AlpacaTradingClient] Order canceled: ${orderId}`);
      return true;
    } catch (error) {
      console.error('❌ [AlpacaTradingClient] Error canceling order:', error);
      return false;
    }
  }

  /**
   * Get recent trades
   */
  async getRecentTrades(limit = 20) {
    try {
      const orders = await this.alpaca.getOrders({
        status: 'all',
        limit: limit,
        direction: 'desc'
      });

      return orders.map(order => ({
        id: order.id,
        symbol: order.symbol,
        qty: parseInt(order.qty),
        filled_qty: parseInt(order.filled_qty),
        side: order.side,
        order_type: order.order_type,
        status: order.status,
        limit_price: parseFloat(order.limit_price) || null,
        filled_avg_price: parseFloat(order.filled_avg_price) || null,
        submitted_at: order.submitted_at,
        filled_at: order.filled_at
      }));

    } catch (error) {
      console.error('❌ [AlpacaTradingClient] Error getting recent trades:', error);
      return [];
    }
  }

  /**
   * Estimate delta for option selection
   */
  estimateDelta(optionType, strike, underlyingPrice) {
    const moneyness = underlyingPrice / strike;
    
    if (optionType === 'call') {
      if (moneyness > 1.1) return 0.8;   // Deep ITM
      if (moneyness > 1.05) return 0.6;  // ITM
      if (moneyness > 0.95) return 0.4;  // ATM
      if (moneyness > 0.9) return 0.2;   // OTM
      return 0.1;                        // Deep OTM
    } else {
      if (moneyness < 0.9) return -0.8;  // Deep ITM
      if (moneyness < 0.95) return -0.6; // ITM
      if (moneyness < 1.05) return -0.4; // ATM
      if (moneyness < 1.1) return -0.2;  // OTM
      return -0.1;                       // Deep OTM
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

  /**
   * Check if market is open
   */
  async isMarketOpen() {
    try {
      const clock = await this.alpaca.getClock();
      return clock.is_open;
    } catch (error) {
      console.error('❌ [AlpacaTradingClient] Error checking market status:', error);
      return false;
    }
  }

  /**
   * Get market calendar
   */
  async getMarketCalendar() {
    try {
      const calendar = await this.alpaca.getCalendar({
        start: new Date().toISOString().split('T')[0],
        end: this.getExpirationDate(30)
      });
      
      return calendar;
    } catch (error) {
      console.error('❌ [AlpacaTradingClient] Error getting market calendar:', error);
      return [];
    }
  }

  /**
   * Check connection status
   */
  isConnected() {
    return this.connected;
  }

  /**
   * Get client statistics
   */
  getStats() {
    return {
      connected: this.connected,
      paper_trading: this.config.paper,
      account_equity: this.account ? parseFloat(this.account.equity) : 0,
      last_update: new Date()
    };
  }
}

module.exports = AlpacaTradingClient;