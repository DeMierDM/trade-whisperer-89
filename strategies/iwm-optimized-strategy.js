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

import { BaseStrategy } from './base-strategy.js';
import { GreeksCalculator } from '../utils/greeks-calculator.js';

export class IWMOptimizedStrategy extends BaseStrategy {
    constructor() {
        super();
        this.name = 'IWMOptimizedStrategy';
        this.version = '1.0.0';
        this.description = 'Optimized IWM 0DTE strategy based on successful Nov 27 patterns';
        
        // Optimized parameters based on analysis
        this.parameters = {
            // Market condition filters
            minDailyVolatility: 1.0,  // Require >1% daily range (Nov 27: 1.34% vs Nov 29: 0.72%)
            
            // RSI parameters (working well)
            rsiPeriod: 14,
            rsiOversold: 40,
            rsiOverbought: 60,
            
            // VWAP parameters (working well)  
            vwapSensitivity: 0.002, // 0.2%
            
            // Contract selection (high delta for fast movement)
            minDelta: 0.75,
            maxDelta: 1.00,
            targetDelta: 0.85,
            
            // Risk management (tighter controls)
            stopLossPercent: 0.15,    // Reduced from 20% to 15%
            profitTargetPercent: 0.25, // Increased from 15% to 25%
            maxHoldTimeMinutes: 60,
            maxPositions: 100,
            
            // Trading window (prime hours based on Nov 27 success)
            tradingStartHour: 15,     // 15:00 EST
            tradingEndHour: 17,       // 17:00 EST (avoid late day volatility)
            
            // Position sizing
            positionSize: 1,
            maxPortfolioRisk: 0.02
        };
        
        this.greeksCalculator = new GreeksCalculator();
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
     * Enhanced signal generation with market condition filters
     */
    generateSignals(underlyingBars) {
        if (!underlyingBars || underlyingBars.length < 50) {
            return { callSignal: false, putSignal: false, signalStrength: 0, reason: 'Insufficient data' };
        }

        // Check market conditions first
        if (!this.isMarketConditionFavorable(underlyingBars)) {
            return { 
                callSignal: false, 
                putSignal: false, 
                signalStrength: 0, 
                reason: `Low volatility: ${this.dailyStats.dailyVolatility.toFixed(2)}% < ${this.parameters.minDailyVolatility}%` 
            };
        }

        const currentBar = underlyingBars[underlyingBars.length - 1];
        
        // Check trading window
        if (!this.isInTradingWindow(currentBar.timestamp)) {
            const hour = new Date(currentBar.timestamp).getHours();
            return { 
                callSignal: false, 
                putSignal: false, 
                signalStrength: 0, 
                reason: `Outside trading window: ${hour}:xx (${this.parameters.tradingStartHour}:00-${this.parameters.tradingEndHour}:00)` 
            };
        }

        // Build price history for indicators (same as working debug strategy)
        const closes = [];
        const volumes = [];
        const timestamps = [];
        
        underlyingBars.forEach((bar, index) => {
            closes.push(bar.close);
            volumes.push(bar.volume);
            timestamps.push(bar.timestamp);
        });

        // Calculate RSI
        const rsi = this.calculateRSI(closes, this.parameters.rsiPeriod);
        if (rsi === null) {
            return { callSignal: false, putSignal: false, signalStrength: 0, reason: 'RSI calculation failed' };
        }

        // Calculate VWAP slope
        const vwapSlope = this.calculateVWAPSlope(underlyingBars);
        if (vwapSlope === null) {
            return { callSignal: false, putSignal: false, signalStrength: 0, reason: 'VWAP calculation failed' };
        }

        const currentPrice = closes[closes.length - 1];
        const currentVWAP = underlyingBars[underlyingBars.length - 1].vwap;
        
        // Enhanced signal logic with stronger thresholds
        const priceVsVWAP = (currentPrice - currentVWAP) / currentVWAP;
        const vwapThreshold = this.parameters.vwapSensitivity;
        
        let callSignal = false;
        let putSignal = false;
        let signalStrength = 0;
        let reason = '';

        // Bullish signals (more stringent)
        if (rsi < this.parameters.rsiOversold && 
            vwapSlope > 0 && 
            priceVsVWAP < -vwapThreshold) {
            callSignal = true;
            signalStrength = Math.min(1.0, (this.parameters.rsiOversold - rsi) / 10 + Math.abs(priceVsVWAP) * 100);
            reason = `BULLISH: RSI=${rsi.toFixed(1)}, VWAP_slope=${(vwapSlope * 1000).toFixed(2)}, Price vs VWAP=${(priceVsVWAP * 100).toFixed(2)}%`;
        }
        // Bearish signals (more stringent)  
        else if (rsi > this.parameters.rsiOverbought && 
                 vwapSlope < 0 && 
                 priceVsVWAP > vwapThreshold) {
            putSignal = true;
            signalStrength = Math.min(1.0, (rsi - this.parameters.rsiOverbought) / 10 + Math.abs(priceVsVWAP) * 100);
            reason = `BEARISH: RSI=${rsi.toFixed(1)}, VWAP_slope=${(vwapSlope * 1000).toFixed(2)}, Price vs VWAP=${(priceVsVWAP * 100).toFixed(2)}%`;
        } else {
            reason = `No signal: RSI=${rsi.toFixed(1)}, VWAP_slope=${(vwapSlope * 1000).toFixed(2)}, Price vs VWAP=${(priceVsVWAP * 100).toFixed(2)}%`;
        }

        const result = { callSignal, putSignal, signalStrength, reason };
        
        if (callSignal || putSignal) {
            console.log(`📈 [${this.name}] SIGNAL: ${reason} (Daily volatility: ${this.dailyStats.dailyVolatility.toFixed(2)}%)`);
        }

        return result;
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
        const entryTime = new Date(position.entryTime);
        const currentTimeObj = new Date(currentTime);
        const holdingTimeMinutes = (currentTimeObj - entryTime) / (1000 * 60);
        
        const currentValue = currentPrice * position.quantity * 100; // Options multiplier
        const entryValue = position.entryPrice * position.quantity * 100;
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
            
            console.log(`🚪 [${this.name}] EXIT: ${position.contractSymbol} | Entry: $${position.entryPrice} | Exit: $${currentPrice} | Hold: ${holdingTimeMinutes.toFixed(0)}min | Gross P&L: $${grossPnL.toFixed(2)} | Net P&L: $${netPnL.toFixed(2)} | Return: ${(pnlPercent * 100).toFixed(1)}% | Reason: ${reason}`);
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
     * Calculate VWAP slope (same as working debug strategy)
     */
    calculateVWAPSlope(underlyingBars) {
        if (underlyingBars.length < 10) return null;
        
        const recentBars = underlyingBars.slice(-10);
        const vwapValues = recentBars.map(bar => bar.vwap).filter(vwap => vwap && vwap > 0);
        
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
}