/**
 * Paper Trading Service Error Handling
 * Comprehensive error handling for paper trading operations
 */

class TradingError extends Error {
  constructor(message, code = 'TRADING_ERROR', statusCode = 500) {
    super(message);
    this.name = 'TradingError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

class OrderError extends TradingError {
  constructor(message, orderId) {
    super(message, 'ORDER_ERROR', 400);
    this.orderId = orderId;
  }
}

class PositionError extends TradingError {
  constructor(message, symbol) {
    super(message, 'POSITION_ERROR', 400);
    this.symbol = symbol;
  }
}

class RiskError extends TradingError {
  constructor(message, riskType) {
    super(message, 'RISK_ERROR', 403);
    this.riskType = riskType;
  }
}

class DatabaseError extends TradingError {
  constructor(message, operation) {
    super(message, 'DATABASE_ERROR', 500);
    this.operation = operation;
  }
}

class AlpacaAPIError extends TradingError {
  constructor(message, endpoint) {
    super(message, 'ALPACA_API_ERROR', 502);
    this.endpoint = endpoint;
  }
}

// Safe execution wrapper
const safeExecute = async (fn, errorMessage, context = {}) => {
  try {
    return await fn();
  } catch (error) {
    console.error(`❌ [Paper Trading Error] ${errorMessage}`, {
      error: error.message,
      stack: error.stack,
      context,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
};

// Validate order parameters
const validateOrderParams = (order) => {
  if (!order.symbol) {
    throw new OrderError('Symbol is required', null);
  }

  if (!order.quantity || order.quantity <= 0) {
    throw new OrderError('Quantity must be greater than 0', null);
  }

  if (!order.side || !['buy', 'sell'].includes(order.side.toLowerCase())) {
    throw new OrderError('Side must be "buy" or "sell"', null);
  }

  if (!order.type || !['market', 'limit', 'stop'].includes(order.type.toLowerCase())) {
    throw new OrderError('Invalid order type', null);
  }

  if (order.type === 'limit' && !order.limit_price) {
    throw new OrderError('Limit price required for limit orders', null);
  }

  if (order.type === 'stop' && !order.stop_price) {
    throw new OrderError('Stop price required for stop orders', null);
  }

  return true;
};

// Process-level error handlers
const handleUnhandledErrors = () => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [UNHANDLED REJECTION - Paper Trading]', {
      reason,
      promise,
      timestamp: new Date().toISOString()
    });
  });

  process.on('uncaughtException', (error) => {
    console.error('❌ [UNCAUGHT EXCEPTION - Paper Trading]', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    console.error('⚠️ Shutting down paper trading service...');
    process.exit(1);
  });
};

module.exports = {
  TradingError,
  OrderError,
  PositionError,
  RiskError,
  DatabaseError,
  AlpacaAPIError,
  safeExecute,
  validateOrderParams,
  handleUnhandledErrors
};
