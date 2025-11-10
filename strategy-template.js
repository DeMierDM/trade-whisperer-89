/**
 * COMPREHENSIVE STRATEGY TEMPLATE
 * 
 * This template defines the complete interface between strategies and the backtesting engine.
 * Use this as a base for creating new trading strategies.
 * 
 * CRITICAL SUCCESS FACTORS:
 * 1. All methods must be implemented (required methods marked with ⚠️)
 * 2. Signal format must match exactly what the engine expects
 * 3. Greeks calculation is handled by the backtester - strategies focus on signals
 * 4. Data flow: underlyingBars → generateSignals() → backtester processes signals → executeSignal()
 * 
 * DATA FLOW ARCHITECTURE:
 * ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
 * │ Underlying OHLC │───▶│ generateSignals()│───▶│ Backtester Engine   │
 * │ Bar Data        │    │ (Strategy Logic) │    │ - Greeks Calculator │
 * └─────────────────┘    └──────────────────┘    │ - Contract Selector │
 *                                                │ - Risk Management   │
 *                        ┌──────────────────┐    │ - Trade Execution   │
 *                        │ shouldExit()     │◀───│ - Position Monitor  │
 *                        │ (Exit Logic)     │    └─────────────────────┘
 *                        └──────────────────┘
 */

class StrategyTemplate {
  /**
   * ⚠️  REQUIRED: Constructor with strategy configuration
   * Sets up strategy parameters and initializes state
   * 
   * @param {Object} parameters - Strategy configuration parameters
   */
  constructor(parameters = {}) {
    // ═══════════════════════════════════════════════════════════════════════
    // REQUIRED PROPERTIES - These MUST be defined for backtester compatibility
    // ═══════════════════════════════════════════════════════════════════════
    
    this.name = 'Your Strategy Name';                    // Display name
    this.preferredDTE = 0;                              // 0 for 0DTE, 1 for 1DTE, etc.
    this.maxPositions = 5;                              // Max concurrent positions
    this.maxRiskPerTrade = 0.02;                        // 2% of capital per trade
    this.contractsPerTrade = 1;                         // Contracts per signal
    this.currentPositions = [];                         // Managed by backtester
    
    // ═══════════════════════════════════════════════════════════════════════
    // STRATEGY-SPECIFIC PARAMETERS - Customize these for your strategy
    // ═══════════════════════════════════════════════════════════════════════
    
    // Technical indicator periods
    this.rsiPeriod = parameters.rsiPeriod || 14;
    this.emaPeriod = parameters.emaPeriod || 21;
    this.vwapPeriod = parameters.vwapPeriod || 20;
    
    // Signal thresholds
    this.rsiOverbought = parameters.rsiOverbought || 70;
    this.rsiOversold = parameters.rsiOversold || 30;
    this.trendConfirmation = parameters.trendConfirmation || true;
    
    // Risk management
    this.stopLossPercent = parameters.stopLossPercent || 0.10;   // 10% stop loss
    this.profitTargetPercent = parameters.profitTargetPercent || 0.20; // 20% profit target
    this.maxHoldingMinutes = parameters.maxHoldingMinutes || 60;  // 1 hour max hold
    
    // State tracking
    this.signalCount = 0;
    this.barCount = 0;
    this.lastSignalBar = -1;
    
    // Technical indicator state
    this.priceHistory = [];
    this.volumeHistory = [];
    this.rsiValues = [];
    this.emaValues = [];
    this.vwapValues = [];
    
    console.log(`📊 [${this.name}] Initialized with parameters:`, parameters);
  }

  /**
   * ⚠️  REQUIRED: Generate trading signals from underlying price data
   * 
   * This is the CORE method where strategy logic lives. The backtester calls this
   * with OHLCV bars and expects an array of signal objects in return.
   * 
   * SIGNAL FORMAT (must match exactly):
   * {
   *   timestamp: bar.t,                    // Bar timestamp (required)
   *   signal_type: 'BUY_CALL'|'BUY_PUT',  // Signal type (required)
   *   underlying_price: number,            // Current underlying price (required)
   *   signal_strength: number,             // 0.1-2.0 (optional, default 1.0)
   *   position_size: number,               // Dollar amount or contract count (optional)
   *   signal_reason: string,               // Human readable reason (optional)
   *   target_delta: number,                // Desired option delta (optional, default ±0.50)
   *   option_type: 'call'|'put',          // Must match signal_type (required)
   *   target_expiry: string                // 'YYYY-MM-DD' or null for preferredDTE (optional)
   * }
   * 
   * @param {Array} underlyingBars - Array of OHLCV bars [{t, o, h, l, c, v}, ...]
   * @returns {Array} Array of signal objects
   */
  generateSignals(underlyingBars) {
    console.log(`📊 [${this.name}] generateSignals called with ${underlyingBars?.length || 0} bars`);
    
    if (!underlyingBars || underlyingBars.length === 0) {
      console.log(`⚠️  [${this.name}] No underlying bars provided!`);
      return [];
    }

    const signals = [];
    
    // Process each bar and update technical indicators
    underlyingBars.forEach((bar, index) => {
      this.barCount++;
      
      // Extract price data
      const price = parseFloat(bar.c || bar.close);
      const volume = parseInt(bar.v || bar.volume || 0);
      const high = parseFloat(bar.h || bar.high);
      const low = parseFloat(bar.l || bar.low);
      
      // Validate price data
      if (!isFinite(price) || price <= 0) {
        console.warn(`⚠️  [${this.name}] Invalid price data at bar ${index}: ${price}`);
        return;
      }
      
      // Update price history
      this.priceHistory.push(price);
      this.volumeHistory.push(volume);
      
      // Keep only necessary history (rolling window)
      const maxHistory = Math.max(this.rsiPeriod, this.emaPeriod, this.vwapPeriod) + 10;
      if (this.priceHistory.length > maxHistory) {
        this.priceHistory.shift();
        this.volumeHistory.shift();
      }
      
      // Need minimum bars for indicators
      if (this.priceHistory.length < this.rsiPeriod) return;
      
      // ═══════════════════════════════════════════════════════════════════════
      // TECHNICAL INDICATOR CALCULATIONS
      // ═══════════════════════════════════════════════════════════════════════
      
      // Calculate RSI
      const rsi = this.calculateRSI(this.priceHistory, this.rsiPeriod);
      this.rsiValues.push(rsi);
      
      // Calculate EMA
      const ema = this.calculateEMA(this.priceHistory, this.emaPeriod);
      this.emaValues.push(ema);
      
      // Calculate VWAP
      const vwap = this.calculateVWAP(this.priceHistory, this.volumeHistory, this.vwapPeriod);
      this.vwapValues.push(vwap);
      
      // Trim indicator arrays
      if (this.rsiValues.length > 50) this.rsiValues.shift();
      if (this.emaValues.length > 50) this.emaValues.shift();
      if (this.vwapValues.length > 50) this.vwapValues.shift();
      
      // ═══════════════════════════════════════════════════════════════════════
      // SIGNAL GENERATION LOGIC - Customize this section for your strategy
      // ═══════════════════════════════════════════════════════════════════════
      
      // Example: RSI + VWAP strategy
      let signalType = null;
      let signalReason = '';
      let signalStrength = 1.0;
      let targetDelta = 0.50;
      
      // CALL signals: RSI oversold + price above VWAP + uptrend
      if (rsi < this.rsiOversold && price > vwap) {
        const recentTrend = this.priceHistory.slice(-5);
        const trendUp = recentTrend[recentTrend.length - 1] > recentTrend[0];
        
        if (trendUp || !this.trendConfirmation) {
          signalType = 'BUY_CALL';
          signalReason = `RSI_OVERSOLD_REVERSAL (RSI: ${rsi.toFixed(1)}, Price: ${price.toFixed(2)} > VWAP: ${vwap.toFixed(2)})`;
          signalStrength = 1.0 + ((30 - rsi) / 30); // Stronger signal for lower RSI
          targetDelta = 0.40; // Slightly OTM for better risk/reward
        }
      }
      
      // PUT signals: RSI overbought + price below VWAP + downtrend  
      if (rsi > this.rsiOverbought && price < vwap) {
        const recentTrend = this.priceHistory.slice(-5);
        const trendDown = recentTrend[recentTrend.length - 1] < recentTrend[0];
        
        if (trendDown || !this.trendConfirmation) {
          signalType = 'BUY_PUT';
          signalReason = `RSI_OVERBOUGHT_REVERSAL (RSI: ${rsi.toFixed(1)}, Price: ${price.toFixed(2)} < VWAP: ${vwap.toFixed(2)})`;
          signalStrength = 1.0 + ((rsi - 70) / 30); // Stronger signal for higher RSI
          targetDelta = -0.40; // Slightly OTM puts
        }
      }
      
      // Generate signal if conditions met
      if (signalType && index - this.lastSignalBar >= 5) { // Minimum 5 bars between signals
        signals.push({
          timestamp: bar.t,
          signal_type: signalType,
          underlying_price: price,
          signal_strength: Math.min(2.0, signalStrength), // Cap at 2.0
          position_size: 100, // $100 per trade for small accounts
          signal_reason: signalReason,
          target_delta: targetDelta,
          option_type: signalType === 'BUY_CALL' ? 'call' : 'put'
        });
        
        this.signalCount++;
        this.lastSignalBar = index;
        
        console.log(`🎯 [${this.name}] Generated signal ${this.signalCount}: ${signalType} at $${price.toFixed(2)} (${signalReason})`);
      }
      
      // Debug logging for first few bars
      if (index < 3 && this.priceHistory.length >= this.rsiPeriod) {
        console.log(`📊 [${this.name}] Bar ${index}: Price=${price.toFixed(2)}, RSI=${rsi.toFixed(1)}, VWAP=${vwap.toFixed(2)}, EMA=${ema.toFixed(2)}`);
      }
    });
    
    console.log(`✅ [${this.name}] Processed ${this.barCount} total bars, generated ${signals.length} signals`);
    return signals;
  }

  /**
   * ⚠️  REQUIRED: Determine if an open position should be exited
   * 
   * The backtester calls this for each open position on each bar to determine
   * if the position should be closed.
   * 
   * RETURN FORMAT (must match exactly):
   * {
   *   shouldExit: boolean,     // true to close position, false to hold
   *   reason: string,          // Human readable exit reason
   *   pnl: number,            // Current P&L in dollars (optional)
   *   pnlPercent: number      // Current P&L as percentage (optional)
   * }
   * 
   * @param {Object} position - Position object from backtester
   * @param {number} currentPrice - Current option price
   * @param {string|Date} currentTime - Current bar timestamp  
   * @returns {Object} Exit decision object
   */
  shouldExit(position, currentPrice, currentTime) {
    try {
      // Calculate position metrics
      const entryPrice = parseFloat(position.entry_price);
      const entryTime = new Date(position.entry_timestamp || position.entry_time);
      const current = new Date(currentTime);
      const holdingTime = (current - entryTime) / 1000; // seconds
      const quantity = parseInt(position.quantity || 1);
      
      // P&L calculation (standard options contract multiplier = 100)
      const currentValue = currentPrice * 100 * quantity;
      const entryValue = entryPrice * 100 * quantity;
      const pnl = currentValue - entryValue;
      const pnlPercent = entryValue > 0 ? pnl / entryValue : 0;
      
      const holdingMinutes = holdingTime / 60;
      
      // ═══════════════════════════════════════════════════════════════════════
      // EXIT LOGIC - Customize these rules for your strategy
      // ═══════════════════════════════════════════════════════════════════════
      
      // Profit target
      if (pnlPercent >= this.profitTargetPercent) {
        return {
          shouldExit: true,
          reason: 'PROFIT_TARGET',
          pnl: pnl,
          pnlPercent: pnlPercent
        };
      }
      
      // Stop loss
      if (pnlPercent <= -this.stopLossPercent) {
        return {
          shouldExit: true,
          reason: 'STOP_LOSS',
          pnl: pnl,
          pnlPercent: pnlPercent
        };
      }
      
      // Time-based exit
      if (holdingMinutes >= this.maxHoldingMinutes) {
        return {
          shouldExit: true,
          reason: 'TIME_STOP',
          pnl: pnl,
          pnlPercent: pnlPercent
        };
      }
      
      // 0DTE specific: Force close 30 minutes before market close (3:30 PM ET)
      if (this.preferredDTE === 0) {
        const marketClose = new Date(current);
        marketClose.setHours(15, 30, 0, 0); // 3:30 PM ET
        
        if (current >= marketClose) {
          return {
            shouldExit: true,
            reason: 'MARKET_CLOSE',
            pnl: pnl,
            pnlPercent: pnlPercent
          };
        }
      }
      
      // Hold position
      return { shouldExit: false };
      
    } catch (error) {
      console.error(`❌ [${this.name}] Error in shouldExit:`, error);
      // Exit on error to prevent issues
      return {
        shouldExit: true,
        reason: 'ERROR',
        pnl: 0,
        pnlPercent: 0
      };
    }
  }

  /**
   * ⚠️  REQUIRED: Check if strategy can open a new position
   * 
   * The backtester calls this before executing a signal to ensure position limits
   * and risk management rules are respected.
   * 
   * @returns {boolean} true if new position can be opened, false otherwise
   */
  canOpenPosition() {
    // Check position limits
    if (this.currentPositions.length >= this.maxPositions) {
      return false;
    }
    
    // Add custom logic here (e.g., daily loss limits, correlation limits, etc.)
    
    return true;
  }

  /**
   * ⚠️  REQUIRED: Get contract selection criteria for backtester
   * 
   * The backtester uses these criteria to filter and select the best option contract
   * for each signal. Customize these based on your strategy's requirements.
   * 
   * @param {Object} signal - The signal object generated by generateSignals()
   * @returns {Object} Contract selection criteria
   */
  getContractCriteria(signal) {
    return {
      optionType: signal.option_type,                    // 'call' or 'put'
      minDelta: 0.20,                                   // Minimum delta threshold
      maxDelta: 0.80,                                   // Maximum delta threshold
      targetDelta: Math.abs(signal.target_delta || 0.50), // Preferred delta
      maxBidAskSpread: 0.25,                           // Maximum spread as % of mid
      minVolume: 5,                                    // Minimum daily volume
      maxPositionValue: signal.position_size || 100,   // Maximum position size
      preferLiquid: true                               // Prefer liquid contracts
    };
  }

  /**
   * ⚠️  REQUIRED: Get strategy parameters for display/optimization
   * 
   * @returns {Object} Current strategy parameters
   */
  getParameters() {
    return {
      strategy: this.name,
      preferredDTE: this.preferredDTE,
      maxPositions: this.maxPositions,
      maxRiskPerTrade: this.maxRiskPerTrade,
      rsiPeriod: this.rsiPeriod,
      emaPeriod: this.emaPeriod,
      vwapPeriod: this.vwapPeriod,
      rsiOverbought: this.rsiOverbought,
      rsiOversold: this.rsiOversold,
      stopLossPercent: this.stopLossPercent,
      profitTargetPercent: this.profitTargetPercent,
      maxHoldingMinutes: this.maxHoldingMinutes,
      signalCount: this.signalCount,
      barCount: this.barCount
    };
  }

  /**
   * ⚠️  REQUIRED: Reset strategy state for new trading day
   * 
   * The backtester calls this when starting a new trading day or session.
   */
  reset() {
    this.signalCount = 0;
    this.barCount = 0;
    this.lastSignalBar = -1;
    this.currentPositions = [];
    
    // Optionally clear technical indicator history
    // this.priceHistory = [];
    // this.volumeHistory = [];
    // this.rsiValues = [];
    // this.emaValues = [];
    // this.vwapValues = [];
    
    console.log(`🔄 [${this.name}] Reset for new trading day`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TECHNICAL INDICATOR HELPER METHODS
  // These are utility methods for calculating common technical indicators
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate RSI (Relative Strength Index)
   * @param {Array} prices - Array of price values
   * @param {number} period - RSI period (default 14)
   * @returns {number} RSI value (0-100)
   */
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50; // Neutral RSI if insufficient data
    
    const gains = [];
    const losses = [];
    
    // Calculate gains and losses
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);
    }
    
    // Use only the last 'period' values
    const recentGains = gains.slice(-period);
    const recentLosses = losses.slice(-period);
    
    const avgGain = recentGains.reduce((sum, g) => sum + g, 0) / period;
    const avgLoss = recentLosses.reduce((sum, l) => sum + l, 0) / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculate EMA (Exponential Moving Average)
   * @param {Array} prices - Array of price values
   * @param {number} period - EMA period
   * @returns {number} EMA value
   */
  calculateEMA(prices, period) {
    if (prices.length === 0) return 0;
    if (prices.length === 1) return prices[0];
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0];
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  /**
   * Calculate VWAP (Volume Weighted Average Price)
   * @param {Array} prices - Array of price values
   * @param {Array} volumes - Array of volume values
   * @param {number} period - VWAP period
   * @returns {number} VWAP value
   */
  calculateVWAP(prices, volumes, period) {
    if (prices.length < period || volumes.length < period) {
      return prices[prices.length - 1] || 0; // Return last price if insufficient data
    }
    
    const recentPrices = prices.slice(-period);
    const recentVolumes = volumes.slice(-period);
    
    let totalPV = 0; // Price * Volume
    let totalVolume = 0;
    
    for (let i = 0; i < recentPrices.length; i++) {
      totalPV += recentPrices[i] * recentVolumes[i];
      totalVolume += recentVolumes[i];
    }
    
    return totalVolume > 0 ? totalPV / totalVolume : recentPrices[recentPrices.length - 1];
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT AND USAGE INSTRUCTIONS
// ═════════════════════════════════════════════════════════════════════════════

module.exports = StrategyTemplate;

/*
USAGE INSTRUCTIONS:

1. COPY this template to create a new strategy:
   cp strategy-template.js strategies/my-new-strategy.js

2. CUSTOMIZE the strategy:
   - Change the class name: class MyNewStrategy extends StrategyTemplate
   - Update this.name in constructor
   - Modify generateSignals() logic for your strategy
   - Adjust shouldExit() rules as needed
   - Update getContractCriteria() for your requirements

3. REGISTER the strategy (automatic with strategy registry):
   - Save your strategy file in the strategies/ directory
   - The automatic registry will discover it on restart

4. TEST your strategy:
   curl -X POST http://localhost:3002/api/backtest/run \
     -H "Content-Type: application/json" \
     -d '{
       "strategy": "my-new-strategy",
       "symbol": "SPY", 
       "startDate": "2024-11-06",
       "endDate": "2024-11-06",
       "initialCapital": 10000
     }'

5. COMMON PITFALLS TO AVOID:
   - Don't calculate Greeks in your strategy (backtester handles this)
   - Always validate input data (check for NaN, null, undefined)
   - Return empty array [] from generateSignals() if no signals
   - Use exact signal format - typos will cause failures
   - Implement ALL required methods
   - Don't forget shouldExit return format: {shouldExit: boolean, reason: string}

6. DEBUGGING TIPS:
   - Use console.log() in your strategy methods
   - Check Docker logs: docker logs trading_backtest --tail 100
   - Start with debug-test-strategy as a working example
   - Test with single day first, then expand date range

7. PERFORMANCE OPTIMIZATION:
   - Limit history arrays to necessary size
   - Use rolling calculations instead of recalculating everything
   - Avoid expensive operations in tight loops
   - Consider using libraries like 'tulind' for complex indicators
*/