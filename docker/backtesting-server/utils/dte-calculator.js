/**
 * DTE (Days to Expiration) CALCULATOR UTILITY
 *
 * Centralized logic for DTE calculations and market-aware expiration selection
 * Handles 0DTE, 1DTE, 2DTE strategies with timezone awareness
 *
 * This replaces duplicate DTE logic in:
 * - getBestDTE() (server.js:59-121)
 * - getOptimalExpiryDate() (server.js:126-163)
 * - getExpirationDate() (server.js:801-827)
 * - calculateDTE() (backtesting-engine.js:1175-1179)
 */

const moment = require('moment-timezone');

class DTECalculator {
  /**
   * Get best DTE strategy based on current market conditions
   * Automatically adapts to market hours and day of week
   *
   * @param {Date|moment} referenceTime - Time to evaluate (defaults to now)
   * @returns {Object} { dte: '0DTE'|'1DTE'|'2DTE', reason: string }
   */
  static getBestDTE(referenceTime = null) {
    const now = referenceTime
      ? moment(referenceTime).tz('America/New_York')
      : moment().tz('America/New_York');

    const dayOfWeek = now.day(); // 0 = Sunday, 6 = Saturday
    const hour = now.hour();
    const minute = now.minute();
    const currentTime = hour * 100 + minute; // HHMM format

    // Market hours (Eastern Time)
    const marketOpen = 930;   // 9:30 AM
    const marketClose = 1600;  // 4:00 PM
    const nearClose = 1530;    // 3:30 PM - stop 0DTE trading

    console.log(`📅 [DTE CALC] Current: ${now.format('dddd, YYYY-MM-DD HH:mm')} ET`);

    // Weekend (Saturday or Sunday)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log('📅 [DTE CALC] Weekend detected - using 1DTE for Monday expiry');
      return { dte: '1DTE', reason: 'Weekend - target Monday expiry' };
    }

    // Weekday logic (Monday-Friday)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      // During market hours
      if (currentTime >= marketOpen && currentTime <= marketClose) {
        if (currentTime < nearClose) {
          console.log('📅 [DTE CALC] Market open, before 3:30 PM - using 0DTE');
          return { dte: '0DTE', reason: 'Market open, safe for same-day expiry' };
        } else {
          console.log('📅 [DTE CALC] Market open but near close - using 1DTE');
          return { dte: '1DTE', reason: 'Near market close, next day safer' };
        }
      }

      // After hours on Friday
      if (dayOfWeek === 5 && currentTime > marketClose) {
        console.log('📅 [DTE CALC] Friday after hours - using 2DTE for Monday');
        return { dte: '2DTE', reason: 'Friday after hours, target Monday' };
      }

      // After hours on other weekdays
      if (currentTime > marketClose) {
        console.log('📅 [DTE CALC] After hours weekday - using 1DTE');
        return { dte: '1DTE', reason: 'After hours, next trading day' };
      }

      // Before market open
      if (currentTime < marketOpen) {
        console.log('📅 [DTE CALC] Before market open - using 0DTE');
        return { dte: '0DTE', reason: 'Pre-market, same day expiry' };
      }
    }

    // Default fallback
    console.log('📅 [DTE CALC] Fallback - using 1DTE');
    return { dte: '1DTE', reason: 'Default fallback' };
  }

  /**
   * Get expiration date for given DTE strategy
   *
   * @param {string} dteStrategy - '0DTE', '1DTE', '2DTE', or number
   * @param {Date|moment} referenceDate - Starting date (defaults to now)
   * @returns {string} Expiration date in YYMMDD format
   */
  static getExpirationDate(dteStrategy, referenceDate = null) {
    const now = referenceDate
      ? moment(referenceDate).tz('America/New_York')
      : moment().tz('America/New_York');

    switch (dteStrategy) {
      case '0DTE':
      case 0:
        return this.getSameDayExpiry(now);

      case '1DTE':
      case 1:
        return this.getNextTradingDay(now);

      case '2DTE':
      case 2:
        return this.getTradingDaysOut(now, 2);

      case '3DTE':
      case 3:
        return this.getTradingDaysOut(now, 3);

      default:
        // If numeric, treat as number of trading days out
        if (typeof dteStrategy === 'number') {
          return this.getTradingDaysOut(now, dteStrategy);
        }
        // Fallback to same day
        return this.getSameDayExpiry(now);
    }
  }

  /**
   * Get same-day expiry (0DTE)
   * If weekend, returns next Monday
   *
   * @param {moment} date - Reference date
   * @returns {string} YYMMDD format
   */
  static getSameDayExpiry(date) {
    // If it's a trading day (Mon-Fri), return same day
    if (date.day() >= 1 && date.day() <= 5) {
      return date.format('YYMMDD');
    }

    // If weekend, get next Monday
    return this.getNextTradingDay(date);
  }

  /**
   * Get next trading day (1DTE)
   *
   * @param {moment} date - Reference date
   * @returns {string} YYMMDD format
   */
  static getNextTradingDay(date) {
    let nextDay = date.clone().add(1, 'day');

    // Skip weekends
    while (nextDay.day() === 0 || nextDay.day() === 6) {
      nextDay.add(1, 'day');
    }

    return nextDay.format('YYMMDD');
  }

  /**
   * Get trading day N days out
   *
   * @param {moment} date - Reference date
   * @param {number} count - Number of trading days
   * @returns {string} YYMMDD format
   */
  static getTradingDaysOut(date, count) {
    let targetDay = date.clone();
    let tradingDaysAdded = 0;

    while (tradingDaysAdded < count) {
      targetDay.add(1, 'day');
      // Count Monday-Friday as trading days
      if (targetDay.day() >= 1 && targetDay.day() <= 5) {
        tradingDaysAdded++;
      }
    }

    return targetDay.format('YYMMDD');
  }

  /**
   * Calculate days to expiration
   *
   * @param {Date|string|number} currentDate - Current date
   * @param {Date|string} expirationDate - Expiration date
   * @returns {number} Days to expiration (can be negative if expired)
   */
  static calculateDTE(currentDate, expirationDate) {
    const current = moment(currentDate);
    const expiry = moment(expirationDate);

    // Calculate difference in days (ceiling to count partial days)
    return Math.ceil(expiry.diff(current, 'days', true));
  }

  /**
   * Calculate time to expiry in years (for Greeks calculations)
   *
   * @param {Date|string} currentDate - Current date
   * @param {Date|string} expirationDate - Expiration date
   * @returns {number} Time to expiry in years
   */
  static calculateTimeToExpiry(currentDate, expirationDate) {
    const dte = this.calculateDTE(currentDate, expirationDate);
    return Math.max(0, dte / 365);
  }

  /**
   * Check if a date is a trading day
   *
   * @param {Date|moment} date - Date to check
   * @returns {boolean} True if Monday-Friday
   */
  static isTradingDay(date) {
    const day = moment(date).day();
    return day >= 1 && day <= 5;
  }

  /**
   * Get all trading days between two dates
   *
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   * @returns {string[]} Array of dates in YYYY-MM-DD format
   */
  static getTradingDaysBetween(startDate, endDate) {
    const start = moment(startDate);
    const end = moment(endDate);
    const tradingDays = [];

    for (let d = start.clone(); d.isSameOrBefore(end); d.add(1, 'day')) {
      if (this.isTradingDay(d)) {
        tradingDays.push(d.format('YYYY-MM-DD'));
      }
    }

    return tradingDays;
  }

  /**
   * Get market status at given time
   *
   * @param {Date|moment} referenceTime - Time to check
   * @returns {Object} { status: string, isOpen: boolean, nextOpen: moment, nextClose: moment }
   */
  static getMarketStatus(referenceTime = null) {
    const now = referenceTime
      ? moment(referenceTime).tz('America/New_York')
      : moment().tz('America/New_York');

    const dayOfWeek = now.day();
    const currentTime = now.hour() * 100 + now.minute();

    const marketOpen = 930;   // 9:30 AM
    const marketClose = 1600;  // 4:00 PM
    const preMarketStart = 400;  // 4:00 AM
    const afterHoursEnd = 2000;  // 8:00 PM

    let status;
    let isOpen = false;

    // Weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      status = 'closed';
    }
    // Regular market hours
    else if (currentTime >= marketOpen && currentTime < marketClose) {
      status = 'open';
      isOpen = true;
    }
    // Pre-market
    else if (currentTime >= preMarketStart && currentTime < marketOpen) {
      status = 'pre-market';
    }
    // After hours
    else if (currentTime >= marketClose && currentTime < afterHoursEnd) {
      status = 'after-hours';
    }
    // Overnight
    else {
      status = 'closed';
    }

    return {
      status,
      isOpen,
      time: now.format('YYYY-MM-DD HH:mm:ss'),
      dayOfWeek: now.format('dddd')
    };
  }

  /**
   * Convert YYMMDD to ISO date format
   *
   * @param {string} yymmdd - Date in YYMMDD format
   * @returns {string} Date in YYYY-MM-DD format
   */
  static yymmddToISO(yymmdd) {
    const year = '20' + yymmdd.slice(0, 2);
    const month = yymmdd.slice(2, 4);
    const day = yymmdd.slice(4, 6);
    return `${year}-${month}-${day}`;
  }

  /**
   * Convert ISO date to YYMMDD format
   *
   * @param {string} isoDate - Date in YYYY-MM-DD format
   * @returns {string} Date in YYMMDD format
   */
  static isoToYYMMDD(isoDate) {
    const date = moment(isoDate);
    return date.format('YYMMDD');
  }
}

module.exports = DTECalculator;
