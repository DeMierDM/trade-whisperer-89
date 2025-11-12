/**
 * MockAlpacaClient - Simulates Alpaca trading for testing during after-hours
 * Provides realistic responses without requiring live API connection
 */

class MockAlpacaClient {
  constructor(config) {
    this.config = config;
    this.connected = false;
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
    
    console.log('🧪 [MockAlpacaClient] Initialized in mock mode - no real trades');
  }

  /**
   * Mock initialization - always succeeds
   */
  async initialize() {
    this.connected = true;
    console.log('✅ [MockAlpacaClient] Mock connection established');
    console.log(`💰 [MockAlpacaClient] Mock account equity: $${parseFloat(this.account.equity).toFixed(2)}`);
    return true;
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
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    // Check if it's a weekend
    const day = easternTime.getDay();
    if (day === 0 || day === 6) { // Sunday = 0, Saturday = 6
      return false;
    }
    
    // Check market hours (9:30 AM to 4:00 PM Eastern)
    const hour = easternTime.getHours();
    const minute = easternTime.getMinutes();
    const timeInMinutes = hour * 60 + minute;
    
    const marketOpen = 9 * 60 + 30; // 9:30 AM
    const marketClose = 16 * 60; // 4:00 PM
    
    const isOpen = timeInMinutes >= marketOpen && timeInMinutes < marketClose;
    
    console.log(`🕐 [MockAlpacaClient] Market status: ${isOpen ? 'OPEN' : 'CLOSED'} (${easternTime.toLocaleTimeString()} ET)`);
    
    return isOpen;
  }

  /**
   * Get mock account information
   */
  async getAccount() {
    if (!this.connected) {
      throw new Error('Mock Alpaca client not connected');
    }

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

  /**
   * Mock option contract finder
   */
  async findOptionContract(signal) {
    const { symbol, signal_type, underlying_price } = signal;
    
    // Generate realistic option contract
    const expiry = this.getNextFriday();
    const strike = Math.round(underlying_price / 5) * 5; // Round to nearest $5
    const optionType = signal_type === 'BUY_CALL' ? 'C' : 'P';
    
    const contractSymbol = `${symbol}${this.formatExpiryDate(expiry)}${optionType}${strike.toString().padStart(8, '0')}`;
    
    return {
      symbol: contractSymbol,
      underlying_symbol: symbol,
      type: signal_type === 'BUY_CALL' ? 'call' : 'put',
      strike_price: strike,
      expiration_date: expiry.toISOString().split('T')[0],
      bid: this.calculateOptionPrice(underlying_price, strike, optionType, 'bid'),
      ask: this.calculateOptionPrice(underlying_price, strike, optionType, 'ask'),
      mid: this.calculateOptionPrice(underlying_price, strike, optionType, 'mid')
    };
  }

  /**
   * Mock option order execution
   */
  async placeOptionOrder(contract, signal, quantity) {
    const orderId = `MOCK_ORDER_${this.orderId++}`;
    const price = contract.ask; // Use ask price for buys
    
    const order = {
      id: orderId,
      symbol: contract.symbol,
      qty: quantity,
      side: 'buy',
      order_type: 'market',
      status: 'filled',
      filled_qty: quantity,
      filled_avg_price: price,
      filled_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    this.orders.set(orderId, order);

    // Create position
    const positionKey = contract.symbol;
    if (this.positions.has(positionKey)) {
      const existingPosition = this.positions.get(positionKey);
      existingPosition.qty += quantity;
      existingPosition.avg_entry_price = ((existingPosition.avg_entry_price * existingPosition.qty) + (price * quantity)) / (existingPosition.qty + quantity);
    } else {
      this.positions.set(positionKey, {
        symbol: contract.symbol,
        qty: quantity,
        side: 'long',
        avg_entry_price: price,
        market_value: quantity * price * 100, // Options contract multiplier
        unrealized_pl: 0,
        created_at: new Date().toISOString()
      });
    }

    // Update account cash
    this.account.cash -= price * quantity * 100;
    this.account.portfolio_value = this.account.cash + this.calculateTotalPositionValue();

    console.log(`📋 [MockAlpacaClient] Mock order executed: ${quantity} x ${contract.symbol} @ $${price}`);
    
    return order;
  }

  /**
   * Mock position closing
   */
  async closePosition(symbol, reason = 'manual') {
    const position = this.positions.get(symbol);
    if (!position) {
      throw new Error(`No position found for ${symbol}`);
    }

    // Get current market price (mock)
    const currentPrice = position.avg_entry_price * (0.95 + Math.random() * 0.1); // +/- 5% random
    const pnl = (currentPrice - position.avg_entry_price) * position.qty * 100;

    // Create closing order
    const orderId = `MOCK_CLOSE_${this.orderId++}`;
    const order = {
      id: orderId,
      symbol: symbol,
      qty: position.qty,
      side: 'sell',
      order_type: 'market',
      status: 'filled',
      filled_qty: position.qty,
      filled_avg_price: currentPrice,
      filled_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      pnl: pnl
    };

    // Remove position and update account
    this.positions.delete(symbol);
    this.account.cash += currentPrice * position.qty * 100;
    this.account.portfolio_value = this.account.cash + this.calculateTotalPositionValue();

    console.log(`🔄 [MockAlpacaClient] Mock position closed: ${symbol} PnL: $${pnl.toFixed(2)} (${reason})`);
    
    return order;
  }

  /**
   * Get all positions
   */
  async getPositions() {
    return Array.from(this.positions.values()).map(position => ({
      symbol: position.symbol,
      qty: position.qty,
      side: position.side,
      avg_entry_price: position.avg_entry_price,
      market_value: this.updatePositionValue(position),
      unrealized_pl: this.calculateUnrealizedPnL(position),
      created_at: position.created_at
    }));
  }

  /**
   * Get orders
   */
  async getOrders() {
    return Array.from(this.orders.values());
  }

  /**
   * Helper methods
   */
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

  calculateOptionPrice(underlyingPrice, strike, optionType, priceType) {
    // Simple Black-Scholes approximation for mock data
    const timeToExpiry = 7 / 365; // Assume 7 days
    const volatility = 0.3; // 30% IV
    const riskFreeRate = 0.05;

    let intrinsic = 0;
    if (optionType === 'C') {
      intrinsic = Math.max(0, underlyingPrice - strike);
    } else {
      intrinsic = Math.max(0, strike - underlyingPrice);
    }

    const timeValue = Math.sqrt(timeToExpiry) * volatility * underlyingPrice * 0.4;
    let price = intrinsic + timeValue;

    // Add bid-ask spread
    if (priceType === 'bid') {
      price *= 0.95;
    } else if (priceType === 'ask') {
      price *= 1.05;
    }

    return Math.max(0.05, Number(price.toFixed(2))); // Minimum $0.05
  }

  calculateTotalPositionValue() {
    let total = 0;
    for (const position of this.positions.values()) {
      total += this.updatePositionValue(position);
    }
    return total;
  }

  updatePositionValue(position) {
    // Mock current price with some variation
    const currentPrice = position.avg_entry_price * (0.95 + Math.random() * 0.1);
    return currentPrice * position.qty * 100;
  }

  calculateUnrealizedPnL(position) {
    const currentValue = this.updatePositionValue(position);
    const costBasis = position.avg_entry_price * position.qty * 100;
    return currentValue - costBasis;
  }
}

module.exports = MockAlpacaClient;