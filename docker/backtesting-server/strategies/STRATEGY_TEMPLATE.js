/**
 * STRATEGY TEMPLATE - Copy this file to create new strategies
 *
 * This template ensures all strategies work correctly with the backtesting engine.
 * Follow the structure exactly to avoid integration issues.
 *
 * NAMING CONVENTION: [symbol]-[description]-strategy.js
 * Example: iwm-rsi-vwap-strategy.js, spy-momentum-strategy.js
 */

class StrategyTemplate {
    constructor(parameters = {}) {
        // ========================================
        // REQUIRED: Basic Strategy Metadata
        // ========================================
        this.name = 'StrategyTemplate';  // MUST: Unique strategy name
        this.version = '1.0.0';           // MUST: Semantic versioning
        this.description = 'Template strategy showing required structure';

        // ========================================
        // REQUIRED: Engine Integration Properties
        // ========================================
        this.maxRiskPerTrade = 0.025;     // MUST: Max 2.5% risk per trade
        this.preferredDTE = 0;            // MUST: Days to expiration (0 for 0DTE)
        this.contractsPerTrade = 1;       // MUST: Number of contracts per signal

        // ========================================
        // REQUIRED: Strategy Parameters
        // ========================================
        this.parameters = {
            // Market condition filters
            minDailyVolatility: 0.5,      // MUST: Minimum daily volatility %

            // Indicator periods (adjust based on your indicators)
            indicatorPeriod: 14,           // Example: RSI period

            // Signal thresholds
            buyThreshold: 30,              // Example: Oversold level
            sellThreshold: 70,             // Example: Overbought level

            // Option selection criteria
            minDelta: 0.40,                // MUST: Minimum option delta
            maxDelta: 1.00,                // MUST: Maximum option delta
            targetDelta: 0.70,             // MUST: Preferred delta

            // Risk management
            stopLossPercent: 0.15,         // MUST: Stop loss percentage
            profitTargetPercent: 0.25,     // MUST: Profit target percentage
            maxHoldTimeMinutes: 60,        // MUST: Maximum hold time
            maxPositions: 100,             // MUST: Max concurrent positions

            // Trading window (EST timezone)
            tradingStartHour: 9,           // MUST: Market open hour (9 = 9:00 AM)
            tradingEndHour: 16,            // MUST: Market close hour (16 = 4:00 PM)

            // Position sizing
            positionSize: 1,               // MUST: Default position size
            maxPortfolioRisk: 0.02         // MUST: Max portfolio risk
        };

        // ========================================
        // REQUIRED: Position Tracking
        // ========================================
        this.currentPositions = [];

        // ========================================
        // OPTIONAL: Performance Metrics
        // ========================================
        this.metrics = {
            totalTrades: 0,
            winners: 0,
            totalPnL: 0,
            maxDrawdown: 0,
            currentPeak: 0
        };

        console.log(`✅ [${this.name}] Initialized v${this.version}`);
    }

    /**
     * REQUIRED METHOD: Generate trading signals from market data
     *
     * @param {Array} underlyingBars - Array of OHLCV bars with structure:
     *   {
     *     t: '2024-03-01T14:30:00.000Z',  // ISO 8601 timestamp (UTC)
     *     o: 199.50,                       // Open price
     *     h: 199.80,                       // High price
     *     l: 199.40,                       // Low price
     *     c: 199.75,                       // Close price
     *     v: 12345                         // Volume
     *   }
     *
     * @returns {Array} Array of signal objects with EXACT structure:
     *   {
     *     timestamp: bar.t,                 // MUST: Use bar.t exactly (UTC)
     *     signal_type: 'BUY_CALL' | 'BUY_PUT',  // MUST: Exact string match
     *     underlying_price: 199.75,         // MUST: Current price as number
     *     signal_strength: 2.5,             // MUST: Number 0-5
     *     position_size: 1,                 // MUST: Integer
     *     signal_reason: 'RSI oversold...',  // MUST: String description
     *     target_delta: 0.70,               // MUST: Desired delta (positive for CALL)
     *     option_type: 'call' | 'put'       // MUST: Lowercase string
     *   }
     *
     * CRITICAL RULES:
     * 1. ALWAYS use bar.t for timestamp (do NOT create new Date objects)
     * 2. MUST return empty array [] if no signals (never return null/undefined)
     * 3. Perform timezone conversion INSIDE this method if needed
     * 4. Filter out after-hours signals BEFORE returning
     * 5. Validate all required fields exist in each signal
     */
    generateSignals(underlyingBars) {
        const signals = [];

        // ========================================
        // VALIDATION: Check input data
        // ========================================
        if (!underlyingBars || underlyingBars.length === 0) {
            console.log(`⚠️  [${this.name}] No underlying bars provided`);
            return [];
        }

        console.log(`📊 [${this.name}] Processing ${underlyingBars.length} bars`);

        // ========================================
        // STEP 1: Check market conditions (optional but recommended)
        // ========================================
        const marketConditionOk = this.isMarketConditionFavorable(underlyingBars);
        if (!marketConditionOk) {
            console.log(`⏸️  [${this.name}] Market conditions unfavorable, skipping signals`);
            return [];
        }

        // ========================================
        // STEP 2: Calculate indicators
        // ========================================
        // Build price and volume history for indicator calculations
        const priceHistory = [];
        const volumeHistory = [];

        underlyingBars.forEach((bar, index) => {
            const price = parseFloat(bar.c);
            const volume = parseFloat(bar.v) || 1;

            priceHistory.push(price);
            volumeHistory.push(volume);

            // Need minimum bars for indicator calculation
            if (priceHistory.length < this.parameters.indicatorPeriod) return;

            // Calculate your indicators here
            const indicatorValue = this.calculateIndicator(priceHistory, this.parameters.indicatorPeriod);

            if (!indicatorValue) return;

            // ========================================
            // STEP 3: TIMEZONE CONVERSION (if needed)
            // ========================================
            // CRITICAL: Do timezone conversion HERE, not in engine
            const moment = require('moment-timezone');
            const timestamp = new Date(bar.t);
            const estTime = moment(timestamp).tz('America/New_York');
            const currentHour = estTime.hour();

            // CRITICAL: Filter out after-hours BEFORE creating signals
            if (currentHour < this.parameters.tradingStartHour ||
                currentHour >= this.parameters.tradingEndHour) {
                return; // Skip this bar (outside trading hours)
            }

            // ========================================
            // STEP 4: Signal logic
            // ========================================
            const currentPrice = parseFloat(bar.c);

            // Example: Bullish signal (CALL)
            if (indicatorValue <= this.parameters.buyThreshold) {
                signals.push({
                    timestamp: bar.t,                    // CRITICAL: Use bar.t exactly
                    signal_type: 'BUY_CALL',             // CRITICAL: Exact string
                    underlying_price: currentPrice,       // CRITICAL: Must be number
                    signal_strength: Math.min(5, (this.parameters.buyThreshold - indicatorValue) / 10),
                    position_size: 1,
                    signal_reason: `Indicator ${indicatorValue.toFixed(1)} <= ${this.parameters.buyThreshold}`,
                    target_delta: this.parameters.targetDelta,
                    option_type: 'call'                   // CRITICAL: Lowercase
                });
            }

            // Example: Bearish signal (PUT)
            if (indicatorValue >= this.parameters.sellThreshold) {
                signals.push({
                    timestamp: bar.t,                    // CRITICAL: Use bar.t exactly
                    signal_type: 'BUY_PUT',              // CRITICAL: Exact string
                    underlying_price: currentPrice,
                    signal_strength: Math.min(5, (indicatorValue - this.parameters.sellThreshold) / 10),
                    position_size: 1,
                    signal_reason: `Indicator ${indicatorValue.toFixed(1)} >= ${this.parameters.sellThreshold}`,
                    target_delta: -this.parameters.targetDelta, // CRITICAL: Negative for PUT
                    option_type: 'put'                   // CRITICAL: Lowercase
                });
            }
        });

        console.log(`🎯 [${this.name}] Generated ${signals.length} signals`);

        // ========================================
        // VALIDATION: Verify all signals are valid
        // ========================================
        const validSignals = signals.filter(signal => this.validateSignal(signal));
        if (validSignals.length !== signals.length) {
            console.log(`⚠️  [${this.name}] Filtered ${signals.length - validSignals.length} invalid signals`);
        }

        return validSignals;
    }

    /**
     * REQUIRED METHOD: Check if strategy can open new position
     * @returns {boolean}
     */
    canOpenPosition() {
        return this.currentPositions.length < this.parameters.maxPositions;
    }

    /**
     * REQUIRED METHOD: Add position to tracking
     */
    addPosition(position) {
        this.currentPositions.push(position);
    }

    /**
     * REQUIRED METHOD: Remove position from tracking
     */
    removePosition(positionId) {
        this.currentPositions = this.currentPositions.filter(p => p.id !== positionId);
    }

    /**
     * HELPER METHOD: Validate signal structure
     * @private
     */
    validateSignal(signal) {
        const requiredFields = [
            'timestamp',
            'signal_type',
            'underlying_price',
            'signal_strength',
            'position_size',
            'signal_reason',
            'target_delta',
            'option_type'
        ];

        for (const field of requiredFields) {
            if (signal[field] === undefined || signal[field] === null) {
                console.error(`❌ [${this.name}] Signal missing required field: ${field}`);
                return false;
            }
        }

        // Validate signal_type
        if (!['BUY_CALL', 'BUY_PUT'].includes(signal.signal_type)) {
            console.error(`❌ [${this.name}] Invalid signal_type: ${signal.signal_type}`);
            return false;
        }

        // Validate option_type
        if (!['call', 'put'].includes(signal.option_type)) {
            console.error(`❌ [${this.name}] Invalid option_type: ${signal.option_type}`);
            return false;
        }

        // Validate numeric fields
        if (typeof signal.underlying_price !== 'number' || signal.underlying_price <= 0) {
            console.error(`❌ [${this.name}] Invalid underlying_price: ${signal.underlying_price}`);
            return false;
        }

        return true;
    }

    /**
     * HELPER METHOD: Check market conditions
     * @private
     */
    isMarketConditionFavorable(underlyingBars) {
        if (underlyingBars.length < 100) return false;

        const recentBars = underlyingBars.slice(-390); // ~6.5 hours
        const prices = recentBars.map(bar => parseFloat(bar.c));
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        const range = (high - low) / low;

        return range >= this.parameters.minDailyVolatility / 100;
    }

    /**
     * HELPER METHOD: Calculate your indicator
     * @private
     * Replace this with your actual indicator (RSI, MACD, etc.)
     */
    calculateIndicator(prices, period) {
        // Example: Simple moving average
        const recentPrices = prices.slice(-period);
        const sum = recentPrices.reduce((acc, price) => acc + price, 0);
        return sum / period;
    }

    /**
     * HELPER METHOD: Calculate RSI (example indicator)
     * @private
     */
    calculateRSI(prices, period) {
        if (prices.length < period + 1) return null;

        const recentPrices = prices.slice(-(period + 1));
        let gains = 0;
        let losses = 0;

        for (let i = 1; i < recentPrices.length; i++) {
            const change = recentPrices[i] - recentPrices[i - 1];
            if (change > 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }
        }

        const avgGain = gains / period;
        const avgLoss = losses / period;

        if (avgLoss === 0) return 100;

        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));

        return rsi;
    }
}

module.exports = StrategyTemplate;
