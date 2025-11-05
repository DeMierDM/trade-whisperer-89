/**
 * PRICE EXTRACTOR UTILITY
 *
 * Centralized logic for extracting prices from option contracts
 * Handles OHLCV data, bid/ask, and fallbacks
 * Supports slippage modeling for realistic backtesting
 *
 * This replaces all duplicate price extraction logic in:
 * - Entry price calculation (backtesting-engine.js:388-412)
 * - Exit price calculation (backtesting-engine.js:666-680)
 * - Current price calculation (backtesting-engine.js:1209-1237)
 */

class PriceExtractor {
  /**
   * Get option price from contract data at specific timestamp
   *
   * Priority order:
   * 1. OHLCV data at exact timestamp
   * 2. OHLCV data (latest bar if no timestamp)
   * 3. Bid/Ask mid-price
   * 4. Mid-price field
   * 5. Close price field
   *
   * @param {Object} contract - Option contract with OHLCV or bid/ask data
   * @param {number|null} timestamp - Unix milliseconds timestamp (null for latest)
   * @param {string} priceType - 'open', 'high', 'low', 'close', 'vwap'
   * @param {number} slippage - Slippage percentage (0.001 = 0.1%)
   * @returns {number} Price with slippage applied
   */
  static getPrice(contract, timestamp = null, priceType = 'close', slippage = 0) {
    if (!contract) {
      console.warn('[PriceExtractor] No contract provided');
      return 0;
    }

    // Priority 1: OHLCV data
    const ohlcvPrice = this.getPriceFromOHLCV(contract, timestamp, priceType);
    if (ohlcvPrice !== null) {
      return this.applySlippage(ohlcvPrice, slippage);
    }

    // Priority 2: Bid/Ask
    const bidAskPrice = this.getPriceFromBidAsk(contract);
    if (bidAskPrice !== null) {
      return this.applySlippage(bidAskPrice, slippage);
    }

    // Priority 3: Mid-price field
    if (contract.midPrice !== undefined && contract.midPrice !== null) {
      return this.applySlippage(contract.midPrice, slippage);
    }

    // Priority 4: Close price field
    if (contract.close !== undefined && contract.close !== null) {
      return this.applySlippage(contract.close, slippage);
    }

    // Priority 5: Price field (last resort)
    if (contract.price !== undefined && contract.price !== null) {
      return this.applySlippage(contract.price, slippage);
    }

    console.warn('[PriceExtractor] No valid price found in contract:', contract.symbol || 'Unknown');
    return 0;
  }

  /**
   * Extract price from OHLCV data
   * @param {Object} contract - Contract with ohlcv array
   * @param {number|null} timestamp - Timestamp to match (null for latest)
   * @param {string} priceType - Which OHLCV price to use
   * @returns {number|null} Price or null if not found
   */
  static getPriceFromOHLCV(contract, timestamp, priceType) {
    if (!contract.ohlcv || !Array.isArray(contract.ohlcv) || contract.ohlcv.length === 0) {
      return null;
    }

    let bar;

    if (timestamp !== null) {
      // Find exact timestamp match
      bar = contract.ohlcv.find(b => b.timestamp === timestamp);

      if (!bar) {
        // If no exact match, use latest bar before timestamp
        const barsBefore = contract.ohlcv.filter(b => b.timestamp <= timestamp);
        if (barsBefore.length > 0) {
          bar = barsBefore[barsBefore.length - 1];
          console.debug(`[PriceExtractor] No exact timestamp match for ${contract.symbol}, using closest bar`);
        }
      }
    } else {
      // No timestamp specified, use latest bar
      bar = contract.ohlcv[contract.ohlcv.length - 1];
    }

    if (!bar) {
      return null;
    }

    // Extract price from bar (handle different property names)
    const price = bar[priceType] || bar.c || bar.close;

    if (price === undefined || price === null) {
      console.warn(`[PriceExtractor] No ${priceType} price in OHLCV bar for ${contract.symbol}`);
      return null;
    }

    return price;
  }

  /**
   * Extract mid-price from bid/ask
   * @param {Object} contract - Contract with bid/ask
   * @returns {number|null} Mid-price or null
   */
  static getPriceFromBidAsk(contract) {
    if (contract.bid !== undefined && contract.bid !== null &&
        contract.ask !== undefined && contract.ask !== null) {
      return (contract.bid + contract.ask) / 2;
    }
    return null;
  }

  /**
   * Apply slippage to price
   * @param {number} price - Base price
   * @param {number} slippagePct - Slippage percentage (0.001 = 0.1%)
   * @returns {number} Price with slippage
   */
  static applySlippage(price, slippagePct) {
    if (slippagePct === 0) {
      return price;
    }
    return price * (1 + slippagePct);
  }

  /**
   * Get entry price for opening a position
   * Applies positive slippage (pay more when buying)
   *
   * @param {Object} contract - Option contract
   * @param {Object} signal - Signal with timestamp
   * @param {number} slippage - Slippage percentage (default: 0.1%)
   * @returns {number} Entry price
   */
  static getEntryPrice(contract, signal, slippage = 0.001) {
    const timestamp = signal?.timestamp || null;
    return this.getPrice(contract, timestamp, 'close', slippage);
  }

  /**
   * Get exit price for closing a position
   * Applies negative slippage (receive less when selling)
   *
   * @param {Object} contract - Option contract
   * @param {number} timestamp - Exit timestamp
   * @param {number} slippage - Slippage percentage (default: -0.1%)
   * @returns {number} Exit price
   */
  static getExitPrice(contract, timestamp, slippage = -0.001) {
    return this.getPrice(contract, timestamp, 'close', slippage);
  }

  /**
   * Get current price (no slippage)
   *
   * @param {Object} contract - Option contract
   * @param {number|null} timestamp - Current timestamp
   * @returns {number} Current price
   */
  static getCurrentPrice(contract, timestamp = null) {
    return this.getPrice(contract, timestamp, 'close', 0);
  }

  /**
   * Get price range from OHLCV data (for stop loss/take profit analysis)
   *
   * @param {Object} contract - Contract with OHLCV data
   * @param {number} timestamp - Timestamp
   * @returns {Object} { high, low, close } or null
   */
  static getPriceRange(contract, timestamp) {
    if (!contract.ohlcv || !Array.isArray(contract.ohlcv)) {
      return null;
    }

    const bar = contract.ohlcv.find(b => b.timestamp === timestamp);
    if (!bar) {
      return null;
    }

    return {
      high: bar.high || bar.h,
      low: bar.low || bar.l,
      close: bar.close || bar.c,
      open: bar.open || bar.o,
      vwap: bar.vwap || bar.vw
    };
  }

  /**
   * Calculate bid/ask spread
   *
   * @param {Object} contract - Contract with bid/ask
   * @returns {number} Spread as percentage of mid-price
   */
  static getBidAskSpread(contract) {
    if (!contract.bid || !contract.ask) {
      return null;
    }

    const spread = contract.ask - contract.bid;
    const mid = (contract.bid + contract.ask) / 2;

    if (mid === 0) {
      return null;
    }

    return (spread / mid) * 100; // Return as percentage
  }

  /**
   * Check if contract has valid OHLCV data
   *
   * @param {Object} contract - Contract to check
   * @returns {boolean}
   */
  static hasOHLCV(contract) {
    return contract &&
           contract.ohlcv &&
           Array.isArray(contract.ohlcv) &&
           contract.ohlcv.length > 0;
  }

  /**
   * Check if contract has valid bid/ask
   *
   * @param {Object} contract - Contract to check
   * @returns {boolean}
   */
  static hasBidAsk(contract) {
    return contract &&
           contract.bid !== undefined &&
           contract.ask !== undefined &&
           contract.bid !== null &&
           contract.ask !== null;
  }

  /**
   * Get price with custom slippage model
   * Allows for more sophisticated slippage based on contract characteristics
   *
   * @param {Object} contract - Option contract
   * @param {number} timestamp - Timestamp
   * @param {Function} slippageModel - Function(contract, basePrice) => slippage
   * @returns {number} Price with custom slippage
   */
  static getPriceWithModel(contract, timestamp, slippageModel) {
    const basePrice = this.getPrice(contract, timestamp, 'close', 0);

    if (typeof slippageModel === 'function') {
      const slippage = slippageModel(contract, basePrice);
      return this.applySlippage(basePrice, slippage);
    }

    return basePrice;
  }
}

module.exports = PriceExtractor;
