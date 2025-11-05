/**
 * OPTION SYMBOL PARSER UTILITY
 *
 * Centralized parsing and formatting of Alpaca option symbols
 * Format: TICKER + YYMMDD + C/P + PRICE (8 digits)
 * Example: SPY251010C00670000 = SPY Call $670.00 expiring Oct 10, 2025
 *
 * This replaces all duplicate symbol parsing logic throughout the codebase
 */

class OptionSymbolParser {
  /**
   * Parse an option symbol into its components
   * @param {string} symbol - Option symbol (e.g., "SPY251010C00670000")
   * @returns {Object|null} Parsed components or null if invalid
   */
  static parse(symbol) {
    if (!symbol || typeof symbol !== 'string') {
      return null;
    }

    // Alpaca format: TICKER(1-5 chars) + YYMMDD(6 digits) + C/P(1 char) + PRICE(8 digits)
    const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);

    if (!match) {
      console.warn(`[OptionSymbolParser] Invalid symbol format: ${symbol}`);
      return null;
    }

    const [, ticker, dateStr, callPut, strikeStr] = match;

    return {
      symbol,                           // Original symbol
      ticker,                           // Underlying ticker (e.g., "SPY")
      strike: this.decodeStrike(strikeStr),  // Strike price as number (e.g., 670.00)
      strikeStr,                        // Strike as 8-digit string
      type: callPut === 'C' ? 'call' : 'put',  // Option type
      callPut,                          // 'C' or 'P'
      expiration: this.parseExpiryDate(dateStr),  // ISO date (e.g., "2025-10-10")
      expiryYYMMDD: dateStr,           // YYMMDD format (e.g., "251010")
      year: parseInt('20' + dateStr.slice(0, 2)),
      month: parseInt(dateStr.slice(2, 4)),
      day: parseInt(dateStr.slice(4, 6))
    };
  }

  /**
   * Parse expiry date from YYMMDD to ISO format
   * @param {string} yymmdd - Date string (e.g., "251010")
   * @returns {string} ISO date string (e.g., "2025-10-10")
   */
  static parseExpiryDate(yymmdd) {
    const year = '20' + yymmdd.slice(0, 2);
    const month = yymmdd.slice(2, 4);
    const day = yymmdd.slice(4, 6);
    return `${year}-${month}-${day}`;
  }

  /**
   * Decode strike price from 8-digit format to decimal
   * Format: 5 digits (dollars) + 3 digits (cents)
   * @param {string} strikeStr - Strike string (e.g., "00670000")
   * @returns {number} Strike price (e.g., 670.00)
   */
  static decodeStrike(strikeStr) {
    if (!strikeStr || strikeStr.length !== 8) {
      console.warn(`[OptionSymbolParser] Invalid strike format: ${strikeStr}`);
      return 0;
    }

    const dollars = parseInt(strikeStr.slice(0, 5));
    const cents = parseInt(strikeStr.slice(5, 8));
    return dollars + (cents / 1000);
  }

  /**
   * Encode strike price to 8-digit format
   * @param {number} strike - Strike price (e.g., 670.50)
   * @returns {string} Strike string (e.g., "00670500")
   */
  static encodeStrike(strike) {
    const dollars = Math.floor(strike);
    const cents = Math.round((strike - dollars) * 1000);
    return dollars.toString().padStart(5, '0') + cents.toString().padStart(3, '0');
  }

  /**
   * Format components into option symbol
   * @param {string} ticker - Underlying ticker
   * @param {string} expiryYYMMDD - Expiry in YYMMDD format
   * @param {string} type - 'call' or 'put'
   * @param {number} strike - Strike price
   * @returns {string} Formatted symbol
   */
  static format(ticker, expiryYYMMDD, type, strike) {
    const callPut = type.toLowerCase() === 'call' ? 'C' : 'P';
    const strikeStr = this.encodeStrike(strike);
    return `${ticker.toUpperCase()}${expiryYYMMDD}${callPut}${strikeStr}`;
  }

  /**
   * Extract just the ticker from an option symbol
   * @param {string} symbol - Option symbol
   * @returns {string|null} Ticker or null
   */
  static extractTicker(symbol) {
    const parsed = this.parse(symbol);
    return parsed ? parsed.ticker : null;
  }

  /**
   * Check if a symbol is a call option
   * @param {string} symbol - Option symbol
   * @returns {boolean}
   */
  static isCall(symbol) {
    const parsed = this.parse(symbol);
    return parsed ? parsed.type === 'call' : false;
  }

  /**
   * Check if a symbol is a put option
   * @param {string} symbol - Option symbol
   * @returns {boolean}
   */
  static isPut(symbol) {
    const parsed = this.parse(symbol);
    return parsed ? parsed.type === 'put' : false;
  }

  /**
   * Batch parse multiple symbols
   * @param {string[]} symbols - Array of option symbols
   * @returns {Object[]} Array of parsed components (nulls filtered out)
   */
  static parseMany(symbols) {
    if (!Array.isArray(symbols)) {
      return [];
    }

    return symbols
      .map(symbol => this.parse(symbol))
      .filter(parsed => parsed !== null);
  }

  /**
   * Validate symbol format
   * @param {string} symbol - Option symbol
   * @returns {boolean}
   */
  static isValid(symbol) {
    return this.parse(symbol) !== null;
  }
}

module.exports = OptionSymbolParser;
