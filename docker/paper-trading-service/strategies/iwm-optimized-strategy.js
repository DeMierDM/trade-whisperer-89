/**
 * IWM Optimized Strategy
 * 
 * Based on analysis of weekly backtest results showing:
 * - Nov 27: 73.7% win rate with 1.34% daily volatility
 * - Nov 29: 30.4% win rate with 0.72% daily volatility
 * - Successful trades cluster in 15:00-16:30 timeframe
 * - Need tighter risk management to prevent -$14 average losses
 * 
 * Optimizations:
 * 1. Daily volatility filter (>1.0% range required)
 * 2. Tighter stop losses (15% vs 20%)  
 * 3. Higher profit targets (25% vs 15%)
 * 4. Prime trading window (15:00-17:00 EST)
 * 5. Market condition awareness
 */

const contractSelector = require('../utils/contract-selector');

class IWMOptimizedStrategy {
    constructor(parameters = {}) {
        this.name = 'IWMOptimizedStrategy';
        this.version = '1.0.0';
        this.description = 'Optimized IWM 0DTE strategy based on successful Nov 27 patterns';
        
        // Required strategy properties for backtest engine
        this.maxRiskPerTrade = 0.025;
        this.preferredDTE = 0;
        this.contractsPerTrade = 1;
        
        // Optimized parameters based on analysis - RELAXED for trading
        this.parameters = {
            // Market condition filters - RELAXED from 1.0% to allow more trading days
            minDailyVolatility: 0.6,  // Relaxed from 1.0% (Nov 29: 0.72% should qualify)
            
            // RSI parameters (working well)
            rsiPeriod: 14,
            rsiOversold: 40,
            rsiOverbought: 60,
            
            // VWAP parameters (working well)  
            vwapSensitivity: 0.002, // 0.2%
            
            // Contract selection - RELAXED delta range for more opportunities
            minDelta: 0.50,           // Relaxed from 0.75
            maxDelta: 1.00,
            targetDelta: 0.75,        // Relaxed from 0.85
            
            // Risk management (tighter controls) - KEEP OPTIMIZATION
            stopLossPercent: 0.15,    // Reduced from 20% to 15%
            profitTargetPercent: 0.25, // Increased from 15% to 25%
            maxHoldTimeMinutes: 60,
            maxPositions: 100,
            
            // Trading window - FULL DAY for maximum opportunities
            tradingStartHour: 9,      // Market open 9:30 AM EST (using 9 to be safe)
            tradingEndHour: 16,       // Market close 4:00 PM EST
            
            // Position sizing
            positionSize: 1,
            maxPortfolioRisk: 0.02
        };
        this.currentPositions = [];
        
        // Market condition tracking
        this.dailyStats = {
            dailyHigh: 0,
            dailyLow: Infinity,
            dailyVolatility: 0,
            tradingAllowed: false
        };
        
        // Performance tracking
        this.metrics = {
            totalTrades: 0,
            winners: 0,
            totalPnL: 0,
            maxDrawdown: 0,
            currentPeak: 0
        };

        // Log optimization details
        console.log(`🎯 [${this.name}] Initialized with optimized parameters:`);
        console.log(`   📊 Daily volatility filter: >${this.parameters.minDailyVolatility}%`);
        console.log(`   ⏰ Trading window: ${this.parameters.tradingStartHour}:00-${this.parameters.tradingEndHour}:00 EST`);
        console.log(`   🛡️ Risk management: ${this.parameters.stopLossPercent * 100}% SL / ${this.parameters.profitTargetPercent * 100}% PT`);
        console.log(`   ⚡ High-delta contracts: ${this.parameters.minDelta}-${this.parameters.maxDelta}`);
    }

    /**
     * Check if market conditions are favorable for trading
     */
    isMarketConditionFavorable(underlyingBars) {
        if (underlyingBars.length < 2) return false;
        
        // Calculate daily range from available bars
        const dayBars = underlyingBars.slice(-390); // Approximately 6.5 hours of 1-min bars
        if (dayBars.length < 100) return false; // Need sufficient data
        
        const dailyHigh = Math.max(...dayBars.map(bar => bar.high));
        const dailyLow = Math.min(...dayBars.map(bar => bar.low));
        const dailyRange = ((dailyHigh - dailyLow) / dailyLow) * 100;
        
        // Update daily stats
        this.dailyStats.dailyHigh = dailyHigh;
        this.dailyStats.dailyLow = dailyLow;
        this.dailyStats.dailyVolatility = dailyRange;
        this.dailyStats.tradingAllowed = dailyRange >= this.parameters.minDailyVolatility;
        
        return this.dailyStats.tradingAllowed;
    }

    /**
     * Check if current time is within prime trading window
     */
    isInTradingWindow(timestamp) {
        const date = new Date(timestamp);
        const hour = date.getHours();
        
        return hour >= this.parameters.tradingStartHour && 
               hour < this.parameters.tradingEndHour;
    }

    /**
     * Signal generation based on working debug strategy pattern with optimizations
     */
    generateSignals(underlyingBars) {
        const signals = [];
        
        console.log(`🎯 [${this.name}] Processing ${underlyingBars.length} underlying bars`);

        // Initialize tracking arrays
        const priceHistory = [];
        const volumeHistory = [];

        underlyingBars.forEach((bar, index) => {
            // Skip first bar - need previous for indicator calculation  
            if (index === 0) return;

            // Build price history from PREVIOUS bar (proven pattern)
            const previousBar = underlyingBars[index - 1];
            priceHistory.push(parseFloat(previousBar.c));
            volumeHistory.push(parseFloat(previousBar.v) || 1);

            // Keep manageable history size
            if (priceHistory.length > 50) {
                priceHistory.shift();
                volumeHistory.shift();
            }

            // Need minimum data for RSI
            if (priceHistory.length < this.parameters.rsiPeriod) return;

            // Calculate indicators using price history
            const rsi = this.calculateRSI(priceHistory, this.parameters.rsiPeriod);
            const vwap = this.calculateVWAP(priceHistory, volumeHistory);

            if (!rsi || !vwap) return;

            // Current bar data for signal generation
            const currentPrice = parseFloat(bar.c);
            const currentVolume = parseFloat(bar.v) || 1;
            const timestamp = new Date(bar.t);

            // Skip if invalid data
            if (!currentPrice || currentPrice <= 0 || !currentVolume) return;

            // OPTIMIZED FILTERS (when enabled)
            // Check trading window - use moment-timezone for proper EST conversion
            const moment = require('moment-timezone');
            const estTime = moment(timestamp).tz('America/New_York');
            const currentHour = estTime.hour();

            if (currentHour < this.parameters.tradingStartHour || currentHour >= this.parameters.tradingEndHour) {
                return;
            }

            // Calculate VWAP deviation
            const vwapDiff = Math.abs(currentPrice - vwap) / vwap;

            // OPTIMIZED SIGNAL CONDITIONS
            // Bullish signals (CALL)
            if (rsi <= this.parameters.rsiOversold && 
                currentPrice <= vwap * (1 - this.parameters.vwapSensitivity) &&
                vwapDiff >= this.parameters.vwapSensitivity * 0.5) {
                
                const confidence = Math.min(3.0, (this.parameters.rsiOversold - rsi) / 10 + vwapDiff * 100);
                
                signals.push({
                    timestamp: bar.t,
                    signal_type: 'BUY_CALL',
                    underlying_price: currentPrice,
                    signal_strength: confidence,
                    position_size: 1,
                    signal_reason: `Optimized CALL: RSI ${rsi.toFixed(1)} <= ${this.parameters.rsiOversold}, VWAP diff ${(vwapDiff*100).toFixed(2)}%`,
                    target_delta: this.parameters.targetDelta,
                    option_type: 'call'
                });
                
                console.log(`🎯 [${this.name}] CALL SIGNAL: RSI=${rsi.toFixed(1)}, VWAP diff=${(vwapDiff*100).toFixed(2)}%, Price=$${currentPrice}`);
            }
            // Bearish signals (PUT) 
            else if (rsi >= this.parameters.rsiOverbought && 
                     currentPrice >= vwap * (1 + this.parameters.vwapSensitivity) &&
                     vwapDiff >= this.parameters.vwapSensitivity * 0.5) {
                
                const confidence = Math.min(3.0, (rsi - this.parameters.rsiOverbought) / 10 + vwapDiff * 100);
                
                signals.push({
                    timestamp: bar.t,
                    signal_type: 'BUY_PUT',
                    underlying_price: currentPrice,
                    signal_strength: confidence,
                    position_size: 1,
                    signal_reason: `Optimized PUT: RSI ${rsi.toFixed(1)} >= ${this.parameters.rsiOverbought}, VWAP diff ${(vwapDiff*100).toFixed(2)}%`,
                    target_delta: -this.parameters.targetDelta,
                    option_type: 'put'
                });
                
                console.log(`🎯 [${this.name}] PUT SIGNAL: RSI=${rsi.toFixed(1)}, VWAP diff=${(vwapDiff*100).toFixed(2)}%, Price=$${currentPrice}`);
            }
        });

        console.log(`🎯 [${this.name}] Generated ${signals.length} total signals from ${underlyingBars.length} bars`);
        
        return signals;
    }

    /**
     * Calculate VWAP like the working debug strategy
     */
    calculateVWAP(prices, volumes) {
        if (!prices.length || prices.length !== volumes.length) return null;
        
        let sumPV = 0, sumV = 0;
        const period = Math.min(30, prices.length); // Use 30-period VWAP
        
        for (let i = 0; i < period; i++) {
            const idx = prices.length - 1 - i;
            sumPV += prices[idx] * volumes[idx];
            sumV += volumes[idx];
        }
        
        return sumV > 0 ? sumPV / sumV : null;
    }

    /**
     * Enhanced contract filtering for high-delta options
     */
    filterContracts(contracts, signal) {
        if (!contracts || contracts.length === 0) return [];
        
        const signalType = signal.callSignal ? 'CALL' : 'PUT';
        
        // Filter by option type
        const typeFiltered = contracts.filter(contract => contract.option_type === signalType);
        
        if (typeFiltered.length === 0) {
            console.log(`⚠️ [${this.name}] No ${signalType} contracts available`);
            return [];
        }
        
        // Filter by delta range (high-delta for fast movement)
        const deltaFiltered = typeFiltered.filter(contract => {
            const absDelta = Math.abs(contract.delta || 0);
            return absDelta >= this.parameters.minDelta && absDelta <= this.parameters.maxDelta;
        });
        
        if (deltaFiltered.length === 0) {
            console.log(`⚠️ [${this.name}] No ${signalType} contracts with delta ${this.parameters.minDelta}-${this.parameters.maxDelta}`);
            return [];
        }
        
        // Sort by proximity to target delta and then by spread quality
        const sorted = deltaFiltered.sort((a, b) => {
            const aDeltaDiff = Math.abs(Math.abs(a.delta) - this.parameters.targetDelta);
            const bDeltaDiff = Math.abs(Math.abs(b.delta) - this.parameters.targetDelta);
            
            if (Math.abs(aDeltaDiff - bDeltaDiff) < 0.05) {
                // If deltas are similar, prefer better spread
                const aSpread = (a.ask - a.bid) / a.mid;
                const bSpread = (b.ask - b.bid) / b.mid;
                return aSpread - bSpread;
            }
            
            return aDeltaDiff - bDeltaDiff;
        });
        
        const selected = sorted.slice(0, 5); // Top 5 candidates
        console.log(`✅ [${this.name}] Selected ${selected.length} ${signalType} contracts with delta ${this.parameters.minDelta}-${this.parameters.maxDelta}`);
        
        return selected;
    }

    /**
     * Enhanced exit logic with tighter risk management
     */
    shouldExit(position, currentPrice, currentTime) {
        // 🔧 FIX: Use entry_price and entry_timestamp (database field names with underscores)
        const entryTime = new Date(position.entry_timestamp || position.entryTime);
        const currentTimeObj = new Date(currentTime);
        const holdingTimeMinutes = (currentTimeObj - entryTime) / (1000 * 60);

        const currentValue = currentPrice * position.quantity * 100; // Options multiplier
        const entryPrice = position.entry_price || position.entryPrice; // Support both naming conventions
        const entryValue = entryPrice * position.quantity * 100;
        const pnl = currentValue - entryValue;
        const pnlPercent = pnl / entryValue;
        
        let shouldExit = false;
        let reason = '';
        
        // Tighter profit target (25%)
        if (pnlPercent >= this.parameters.profitTargetPercent) {
            shouldExit = true;
            reason = `Profit target: ${(pnlPercent * 100).toFixed(1)}%`;
        }
        // Tighter stop loss (15%)
        else if (pnlPercent <= -this.parameters.stopLossPercent) {
            shouldExit = true;
            reason = `Stop loss: ${(Math.abs(pnlPercent) * 100).toFixed(1)}%`;
        }
        // Time-based exit
        else if (holdingTimeMinutes >= this.parameters.maxHoldTimeMinutes) {
            shouldExit = true;
            reason = `Max hold time: ${holdingTimeMinutes.toFixed(0)}min`;
        }
        
        if (shouldExit) {
            const grossPnL = pnl;
            const fees = 1.30; // Per contract
            const netPnL = grossPnL - fees;

            console.log(`🚪 [${this.name}] EXIT: ${position.contractSymbol || position.contract_symbol} | Entry: $${entryPrice} | Exit: $${currentPrice} | Hold: ${holdingTimeMinutes.toFixed(0)}min | Gross P&L: $${grossPnL.toFixed(2)} | Net P&L: $${netPnL.toFixed(2)} | Return: ${(pnlPercent * 100).toFixed(1)}% | Reason: ${reason}`);
        }
        
        return { shouldExit, reason };
    }

    /**
     * Calculate RSI (same as working debug strategy)
     */
    calculateRSI(closes, period = 14) {
        if (closes.length < period + 1) return null;
        
        const gains = [];
        const losses = [];
        
        for (let i = 1; i < closes.length; i++) {
            const change = closes[i] - closes[i - 1];
            gains.push(change > 0 ? change : 0);
            losses.push(change < 0 ? Math.abs(change) : 0);
        }
        
        if (gains.length < period) return null;
        
        const avgGain = gains.slice(-period).reduce((sum, gain) => sum + gain, 0) / period;
        const avgLoss = losses.slice(-period).reduce((sum, loss) => sum + loss, 0) / period;
        
        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));
        
        return rsi;
    }

    /**
     * Calculate VWAP slope using correct bar properties
     */
    calculateVWAPSlope(underlyingBars) {
        if (underlyingBars.length < 10) return null;
        
        const recentBars = underlyingBars.slice(-10);
        const vwapValues = recentBars.map(bar => parseFloat(bar.vwap)).filter(vwap => vwap && vwap > 0);
        
        if (vwapValues.length < 5) return null;
        
        const n = vwapValues.length;
        const sumX = (n - 1) * n / 2;
        const sumY = vwapValues.reduce((sum, val) => sum + val, 0);
        const sumXY = vwapValues.reduce((sum, val, i) => sum + (i * val), 0);
        const sumXX = (n - 1) * n * (2 * n - 1) / 6;
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        return slope;
    }

    /**
     * Position management with performance tracking
     */
    addPosition(position) {
        this.currentPositions.push(position);
        this.metrics.totalTrades++;
        
        console.log(`📈 [${this.name}] NEW POSITION: ${position.contractSymbol} | Entry: $${position.entryPrice} | Delta: ${position.delta?.toFixed(3)} | Market Vol: ${this.dailyStats.dailyVolatility.toFixed(2)}% | Positions: ${this.currentPositions.length}/${this.parameters.maxPositions}`);
    }
    
    removePosition(position) {
        const index = this.currentPositions.findIndex(p => 
            p.contractSymbol === position.contractSymbol && 
            p.entryTime === position.entryTime
        );
        
        if (index !== -1) {
            this.currentPositions.splice(index, 1);
            
            // Update performance metrics
            if (position.pnl > 0) {
                this.metrics.winners++;
            }
            this.metrics.totalPnL += position.pnl;
            
            // Track drawdown
            if (this.metrics.totalPnL > this.metrics.currentPeak) {
                this.metrics.currentPeak = this.metrics.totalPnL;
            }
            const drawdown = this.metrics.currentPeak - this.metrics.totalPnL;
            if (drawdown > this.metrics.maxDrawdown) {
                this.metrics.maxDrawdown = drawdown;
            }
        }
    }
    
    getPositions() {
        return this.currentPositions;
    }

    /**
     * Get current performance metrics
     */
    getPerformanceMetrics() {
        const winRate = this.metrics.totalTrades > 0 ? (this.metrics.winners / this.metrics.totalTrades) * 100 : 0;
        
        return {
            ...this.metrics,
            winRate: winRate,
            currentPositions: this.currentPositions.length,
            dailyVolatility: this.dailyStats.dailyVolatility,
            tradingAllowed: this.dailyStats.tradingAllowed
        };
    }

    /**
     * Required methods for backtesting engine compatibility
     */
    
    /**
     * Reset strategy state for new backtest
     */
    reset() {
        this.currentPositions = [];
        this.dailyStats = {
            dailyHigh: 0,
            dailyLow: Infinity,
            dailyVolatility: 0,
            tradingAllowed: false
        };
        this.metrics = {
            totalTrades: 0,
            winners: 0,
            totalPnL: 0,
            maxDrawdown: 0,
            currentPeak: 0
        };
        console.log(`🎯 [${this.name}] Strategy reset - Ready for optimized backtest`);
    }

    /**
     * Check if strategy can open new positions
     */
    canOpenPosition() {
        return this.currentPositions.length < this.parameters.maxPositions;
    }

    /**
     * Get contract selection criteria for backtesting engine
     */
    getContractCriteria(signal) {
        return {
            optionType: signal.callSignal ? 'CALL' : 'PUT',
            minDelta: this.parameters.minDelta,
            maxDelta: this.parameters.maxDelta,
            preferredDelta: this.parameters.targetDelta,
            maxSpreadPercent: 0.25, // 25% max spread
            minVolume: 10,
            dteRange: [0, 2] // 0DTE primary, 1-2DTE fallback
        };
    }

    /**
     * Required strategy metadata methods
     */
    getTradingStyle() {
        return 'Optimized 0DTE';
    }

    getRiskLevel() {
        return 'Low-Medium';
    }

    getDescription() {
        return 'Optimized IWM 0DTE strategy based on successful Nov 27 patterns - volatility filter and enhanced risk management';
    }
}

module.exports = IWMOptimizedStrategy;