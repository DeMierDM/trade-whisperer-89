/**
 * Input Validation Middleware
 * Validates request data before processing
 */

const { ValidationError } = require('./errorHandler');

/**
 * Validate symbol format (e.g., SPY, QQQ, AAPL)
 */
const validateSymbol = (symbol) => {
  if (!symbol || typeof symbol !== 'string') {
    throw new ValidationError('Symbol is required and must be a string', 'symbol');
  }
  
  const symbolRegex = /^[A-Z]{1,5}$/;
  if (!symbolRegex.test(symbol)) {
    throw new ValidationError(
      'Invalid symbol format. Must be 1-5 uppercase letters',
      'symbol'
    );
  }
  
  return symbol.toUpperCase();
};

/**
 * Validate date format (ISO 8601)
 */
const validateDate = (date, fieldName = 'date') => {
  if (!date) {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }
  
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) {
    throw new ValidationError(
      `Invalid ${fieldName} format. Must be ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ)`,
      fieldName
    );
  }
  
  return parsed;
};

/**
 * Validate date range (start must be before end)
 */
const validateDateRange = (startDate, endDate) => {
  const start = validateDate(startDate, 'startDate');
  const end = validateDate(endDate, 'endDate');
  
  if (start >= end) {
    throw new ValidationError(
      'Start date must be before end date',
      'dateRange'
    );
  }
  
  // Prevent queries spanning more than 1 year (performance protection)
  const oneYear = 365 * 24 * 60 * 60 * 1000;
  if (end - start > oneYear) {
    throw new ValidationError(
      'Date range cannot exceed 1 year',
      'dateRange'
    );
  }
  
  return { start, end };
};

/**
 * Validate timeframe format
 */
const validateTimeframe = (timeframe) => {
  const validTimeframes = ['1Min', '5Min', '15Min', '30Min', '1Hour', '4Hour', '1Day'];
  
  if (!timeframe) {
    return '5Min'; // Default
  }
  
  if (!validTimeframes.includes(timeframe)) {
    throw new ValidationError(
      `Invalid timeframe. Must be one of: ${validTimeframes.join(', ')}`,
      'timeframe'
    );
  }
  
  return timeframe;
};

/**
 * Validate option symbol format (OCC format)
 * Example: SPY251220C00650000
 */
const validateOptionSymbol = (symbol) => {
  if (!symbol || typeof symbol !== 'string') {
    throw new ValidationError(
      'Option symbol is required and must be a string',
      'optionSymbol'
    );
  }
  
  // OCC format: TICKER(1-6) + YYMMDD(6) + C/P(1) + STRIKE_PRICE(8)
  const optionRegex = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;
  
  if (!optionRegex.test(symbol)) {
    throw new ValidationError(
      'Invalid option symbol format. Expected OCC format (e.g., SPY251220C00650000)',
      'optionSymbol'
    );
  }
  
  return symbol.toUpperCase();
};

/**
 * Validate array of symbols
 */
const validateSymbolArray = (symbols, maxLength = 100) => {
  if (!Array.isArray(symbols)) {
    throw new ValidationError('Symbols must be an array', 'symbols');
  }
  
  if (symbols.length === 0) {
    throw new ValidationError('Symbols array cannot be empty', 'symbols');
  }
  
  if (symbols.length > maxLength) {
    throw new ValidationError(
      `Too many symbols. Maximum ${maxLength} allowed`,
      'symbols'
    );
  }
  
  return symbols.map(symbol => validateSymbol(symbol));
};

/**
 * Validate option symbols array
 */
const validateOptionSymbolArray = (symbols, maxLength = 100) => {
  if (!Array.isArray(symbols)) {
    throw new ValidationError('Option symbols must be an array', 'symbols');
  }
  
  if (symbols.length === 0) {
    throw new ValidationError('Option symbols array cannot be empty', 'symbols');
  }
  
  if (symbols.length > maxLength) {
    throw new ValidationError(
      `Too many option symbols. Maximum ${maxLength} allowed`,
      'symbols'
    );
  }
  
  return symbols.map(symbol => validateOptionSymbol(symbol));
};

/**
 * Validate numeric value with range
 */
const validateNumber = (value, fieldName, min, max) => {
  if (value === undefined || value === null) {
    throw new ValidationError(`${fieldName} is required`, fieldName);
  }
  
  const num = Number(value);
  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a number`, fieldName);
  }
  
  if (min !== undefined && num < min) {
    throw new ValidationError(
      `${fieldName} must be at least ${min}`,
      fieldName
    );
  }
  
  if (max !== undefined && num > max) {
    throw new ValidationError(
      `${fieldName} must be at most ${max}`,
      fieldName
    );
  }
  
  return num;
};

/**
 * Validate data type parameter
 */
const validateDataType = (dataType) => {
  const validTypes = [
    'bars',
    'quote',
    'options',
    'options_greeks',
    'options_bars',
    'options_bars_by_dte',
    'account',
    'orders'
  ];
  
  if (!dataType) {
    throw new ValidationError('dataType is required', 'dataType');
  }
  
  if (!validTypes.includes(dataType)) {
    throw new ValidationError(
      `Invalid dataType. Must be one of: ${validTypes.join(', ')}`,
      'dataType'
    );
  }
  
  return dataType;
};

/**
 * Sanitize string input (prevent injection attacks)
 */
const sanitizeString = (str, maxLength = 255) => {
  if (typeof str !== 'string') {
    return str;
  }
  
  // Remove potentially dangerous characters
  let sanitized = str.trim()
    .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
    .replace(/<[^>]+>/g, '') // Remove HTML tags
    .replace(/[;&|`$(){}[\]\\]/g, ''); // Remove shell metacharacters
  
  // Truncate to max length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
};

/**
 * Validate API keys format
 */
const validateApiKeys = (apiKey, apiSecret) => {
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
    throw new ValidationError(
      'Invalid API key format',
      'apiKey'
    );
  }
  
  if (!apiSecret || typeof apiSecret !== 'string' || apiSecret.length < 10) {
    throw new ValidationError(
      'Invalid API secret format',
      'apiSecret'
    );
  }
  
  return { apiKey, apiSecret };
};

module.exports = {
  validateSymbol,
  validateDate,
  validateDateRange,
  validateTimeframe,
  validateOptionSymbol,
  validateSymbolArray,
  validateOptionSymbolArray,
  validateNumber,
  validateDataType,
  sanitizeString,
  validateApiKeys
};
