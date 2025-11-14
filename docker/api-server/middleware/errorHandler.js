/**
 * Comprehensive Error Handling Middleware
 * Catches all errors and returns consistent, secure error responses
 */

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, field) {
    super(message, 400, true);
    this.field = field;
    this.name = 'ValidationError';
  }
}

class DatabaseError extends AppError {
  constructor(message, originalError) {
    super(message, 500, true);
    this.originalError = originalError;
    this.name = 'DatabaseError';
  }
}

class ExternalAPIError extends AppError {
  constructor(message, service, statusCode = 502) {
    super(message, statusCode, true);
    this.service = service;
    this.name = 'ExternalAPIError';
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429, true);
    this.name = 'RateLimitError';
  }
}

// Error handler middleware
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Log error details for debugging (never expose to client)
  console.error('❌ [ERROR]', {
    name: error.name,
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    path: req.path,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Convert unknown errors to AppError
  if (!(error instanceof AppError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal server error';
    error = new AppError(message, statusCode, false);
  }

  // Prepare response
  const response = {
    success: false,
    error: {
      message: error.message,
      statusCode: error.statusCode,
      timestamp: error.timestamp
    }
  };

  // Add field info for validation errors
  if (error instanceof ValidationError && error.field) {
    response.error.field = error.field;
  }

  // Add service info for external API errors
  if (error instanceof ExternalAPIError && error.service) {
    response.error.service = error.service;
  }

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development' && error.stack) {
    response.error.stack = error.stack;
  }

  // Send error response
  res.status(error.statusCode).json(response);
};

// Async error wrapper - automatically catches Promise rejections
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Not found handler
const notFoundHandler = (req, res, next) => {
  const error = new AppError(
    `Route not found: ${req.method} ${req.path}`,
    404,
    true
  );
  next(error);
};

// Unhandled rejection handler (for process-level errors)
const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ [UNHANDLED REJECTION]', {
      reason,
      promise,
      timestamp: new Date().toISOString()
    });
    
    // Don't crash in production, but log severely
    if (process.env.NODE_ENV === 'production') {
      // Send alert to monitoring service (e.g., Sentry, Datadog)
      // alertMonitoringService(reason);
    }
  });

  process.on('uncaughtException', (error) => {
    console.error('❌ [UNCAUGHT EXCEPTION]', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    // Graceful shutdown on uncaught exception
    console.error('⚠️ Uncaught exception detected. Shutting down gracefully...');
    process.exit(1);
  });
};

module.exports = {
  AppError,
  ValidationError,
  DatabaseError,
  ExternalAPIError,
  RateLimitError,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  handleUnhandledRejection
};
