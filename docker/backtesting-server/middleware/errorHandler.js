/**
 * Backtesting Server Error Handling
 * Comprehensive error handling for backtest execution
 */

class BacktestError extends Error {
  constructor(message, code = 'BACKTEST_ERROR', statusCode = 500) {
    super(message);
    this.name = 'BacktestError';
    this.code = code;
    this.statusCode = statusCode;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

class DataFetchError extends BacktestError {
  constructor(message, symbol) {
    super(message, 'DATA_FETCH_ERROR', 502);
    this.symbol = symbol;
  }
}

class StrategyError extends BacktestError {
  constructor(message, strategyName) {
    super(message, 'STRATEGY_ERROR', 400);
    this.strategyName = strategyName;
  }
}

class ValidationError extends BacktestError {
  constructor(message, field) {
    super(message, 'VALIDATION_ERROR', 400);
    this.field = field;
  }
}

class TimeoutError extends BacktestError {
  constructor(message) {
    super(message, 'TIMEOUT_ERROR', 408);
  }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  console.error('❌ [BACKTEST ERROR]', {
    name: err.name,
    code: err.code,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    path: req.path,
    timestamp: new Date().toISOString()
  });

  const statusCode = err.statusCode || 500;
  const response = {
    success: false,
    error: {
      message: err.message,
      code: err.code || 'INTERNAL_ERROR',
      timestamp: err.timestamp || new Date().toISOString()
    }
  };

  if (err.symbol) response.error.symbol = err.symbol;
  if (err.strategyName) response.error.strategyName = err.strategyName;
  if (err.field) response.error.field = err.field;

  if (process.env.NODE_ENV === 'development' && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
};

// Async handler
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Timeout wrapper for long-running backtests
const withTimeout = (fn, timeoutMs = 300000) => { // 5 minutes default
  return async (...args) => {
    return Promise.race([
      fn(...args),
      new Promise((_, reject) =>
        setTimeout(() => reject(new TimeoutError('Operation timed out')), timeoutMs)
      )
    ]);
  };
};

// Validate backtest parameters
const validateBacktestParams = (params) => {
  const errors = [];

  if (!params.symbol) {
    errors.push(new ValidationError('Symbol is required', 'symbol'));
  }

  if (!params.strategyName) {
    errors.push(new ValidationError('Strategy name is required', 'strategyName'));
  }

  if (!params.startDate) {
    errors.push(new ValidationError('Start date is required', 'startDate'));
  }

  if (!params.endDate) {
    errors.push(new ValidationError('End date is required', 'endDate'));
  }

  const start = new Date(params.startDate);
  const end = new Date(params.endDate);

  if (isNaN(start.getTime())) {
    errors.push(new ValidationError('Invalid start date format', 'startDate'));
  }

  if (isNaN(end.getTime())) {
    errors.push(new ValidationError('Invalid end date format', 'endDate'));
  }

  if (start >= end) {
    errors.push(new ValidationError('Start date must be before end date', 'dateRange'));
  }

  if (errors.length > 0) {
    throw errors[0]; // Throw first error
  }

  return true;
};

// Process-level error handlers
const handleUnhandledErrors = () => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [UNHANDLED REJECTION - Backtesting Server]', {
      reason,
      timestamp: new Date().toISOString()
    });
  });

  process.on('uncaughtException', (error) => {
    console.error('❌ [UNCAUGHT EXCEPTION - Backtesting Server]', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Graceful shutdown
    console.error('⚠️ Shutting down backtesting server...');
    process.exit(1);
  });
};

module.exports = {
  BacktestError,
  DataFetchError,
  StrategyError,
  ValidationError,
  TimeoutError,
  errorHandler,
  asyncHandler,
  withTimeout,
  validateBacktestParams,
  handleUnhandledErrors
};
