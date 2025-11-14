/**
 * IWM Debug Strategy - Test Backtest Logic
 * 
 * PURPOSE: Diagnose why backtest shows 0 trades when frequency analysis shows 77/day
 * APPROACH: Use exact same parameters as frequency analysis that worked
 */

const contractSelector = require('../utils/contract-selector');

class IWMDebugStrategy {
    constructor(parameters = {}) {
        this.name = "IWM Debug Strategy";
        
        // Required strategy properties
        this.maxRiskPerTrade = 0.025;
        this.preferredDTE = 0;
        this.maxPositions = 100;     // HIGH CAPACITY: Allow many concurrent positions
        this.contractsPerTrade = 1;
        this.currentPositions = [];
        
        // USE EXACT FREQUENCY ANALYSIS PARAMETERS THAT FOUND 77 SIGNALS/DAY
        // From: RSI 40/60, VWAP 0.2% - this found 1,617 signals in December
        this.rsiPeriod = 14;
        this.rsiOversold = 40;       // Wider than analyzer (34)
        this.rsiOverbought = 60;     // Tighter than analyzer (65)
        this.vwapThreshold = 0.002;  // Same as analyzer (0.2%)
        this.vwapPeriod = 30;
        
        // RELAXED FILTERS - Remove potential blockers
        this.stopLossPercent = 0.20;
        this.profitTargetPercent = 0.15;
        this.maxHoldMinutes = 60;
        
        // MUCH LOWER THRESHOLDS - Don't filter out signals
        this.minVolume = 100;        // Much lower than 1000
        this.minOpenInterest = 10;   // Much lower than 100
        this.maxSpreadPercent = 0.25; // Higher than 0.15
        this.minSignalStrength = 0.5; // Much lower than 1.2
        
        // Initialize arrays
        this.priceHistory = [];
        this.volumeHistory = [];
        this.signalCount = 0;
        
        // Debug tracking
        this.debugInfo = {
            totalBarsProcessed: 0,
            rsiCalculated: 0,
            vwapCalculated: 0,
            volumeFiltered: 0,
            signalStrengthFiltered: 0,
            signalsGenerated: 0
        };
        
        console.log(`🐛 IWM DEBUG STRATEGY: RSI ${this.rsiOversold}/${this.rsiOverbought}, VWAP ${(this.vwapThreshold*100).toFixed(1)}%`);
        console.log(`   Min Volume: ${this.minVolume}, Min Signal Strength: ${this.minSignalStrength}`);
    }

    /**
     * Calculate RSI - same as frequency analysis
     */
    calculateRSI(prices, period) {
        if (prices.length < period + 1) return null;
        
        let gains = 0, losses = 0;
        for (let i = 1; i <= period; i++) {
            const change = prices[prices.length - i] - prices[prices.length - i - 1];
            if (change > 0) gains += change;
            else losses -= change;
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return 100;
        return 100 - (100 / (1 + avgGain / avgLoss));
    }

    /**
     * Calculate VWAP - same as frequency analysis
     */
    calculateVWAP(prices, volumes) {
        if (!prices.length || prices.length !== volumes.length) return null;
        
        let sumPV = 0, sumV = 0;
        const period = Math.min(this.vwapPeriod, prices.length);
        
        for (let i = 0; i < period; i++) {
            const idx = prices.length - 1 - i;
            sumPV += prices[idx] * volumes[idx];
            sumV += volumes[idx];
        }
        
        return sumV > 0 ? sumPV / sumV : null;
    }

    /**
     * Generate signals - FIXED to process like SPY strategy 
     */
    generateSignals(underlyingBars) {
        const signals = [];
        
        console.log(`🐛 DEBUG START: Processing ${underlyingBars.length} underlying bars`);

        underlyingBars.forEach((bar, index) => {
            this.debugInfo.totalBarsProcessed++;
            
            // Skip first bar - need previous for indicator calculation
            if (index === 0) return;

            // Build price history from PREVIOUS bar (SPY pattern)
            const previousBar = underlyingBars[index - 1];
            this.priceHistory.push(parseFloat(previousBar.c));
            this.volumeHistory.push(parseFloat(previousBar.v) || 1);

            // Keep manageable history size
            if (this.priceHistory.length > 50) {
                this.priceHistory.shift();
                this.volumeHistory.shift();
            }

            // Need minimum data
            if (this.priceHistory.length < this.rsiPeriod) return;

            // Calculate indicators using price history
            const rsi = this.calculateRSI(this.priceHistory, this.rsiPeriod);
            const vwap = this.calculateVWAP(this.priceHistory, this.volumeHistory);

            if (!rsi || !vwap) return;

            this.debugInfo.rsiCalculated++;
            this.debugInfo.vwapCalculated++;

            // Current bar data for signal generation
            const currentPrice = parseFloat(bar.c);
            const currentVolume = parseFloat(bar.v) || 1;
            const timestamp = new Date(bar.t);
            const currentHour = timestamp.getUTCHours() - 5; // Convert to ET

            // Skip lunch hours 
            if (currentHour >= 12 && currentHour < 14) return;

            // Volume filter (lenient)
            if (currentVolume < this.minVolume) {
                this.debugInfo.volumeFiltered++;
                return;
            }

            const vwapDiff = Math.abs(currentPrice - vwap) / vwap;
            
            // CALL signals: RSI oversold + price conditions
            if (rsi <= this.rsiOversold && 
                currentPrice >= vwap * (1 - this.vwapThreshold) &&
                vwapDiff >= this.vwapThreshold * 0.5) { 
                
                const confidence = this.calculateSignalStrength(rsi, vwapDiff, currentVolume);
                
                if (confidence >= this.minSignalStrength) {
                    signals.push({
                        timestamp: bar.t,
                        signal_type: 'BUY_CALL',
                        underlying_price: currentPrice,
                        signal_strength: confidence,
                        position_size: 100,
                        signal_reason: `Debug: RSI ${rsi.toFixed(1)} <= ${this.rsiOversold}, VWAP diff ${(vwapDiff*100).toFixed(2)}%`,
                        target_delta: 0.85,     // HIGH DELTA for fast movement
                        option_type: 'call'
                    });
                    this.debugInfo.signalsGenerated++;
                    
                    // Debug log every signal
                    console.log(`🐛 CALL SIGNAL ${this.debugInfo.signalsGenerated}: RSI=${rsi.toFixed(1)}, VWAP diff=${(vwapDiff*100).toFixed(2)}%, Price=$${currentPrice}`);
                } else {
                    this.debugInfo.signalStrengthFiltered++;
                }
            }
            
            // PUT signals: RSI overbought + price conditions
            if (rsi >= this.rsiOverbought && 
                currentPrice <= vwap * (1 + this.vwapThreshold) &&
                vwapDiff >= this.vwapThreshold * 0.5) {
                
                const confidence = this.calculateSignalStrength(rsi, vwapDiff, currentVolume);
                
                if (confidence >= this.minSignalStrength) {
                    signals.push({
                        timestamp: bar.t,
                        signal_type: 'BUY_PUT',
                        underlying_price: currentPrice,
                        signal_strength: confidence,
                        position_size: 100,
                        signal_reason: `Debug: RSI ${rsi.toFixed(1)} >= ${this.rsiOverbought}, VWAP diff ${(vwapDiff*100).toFixed(2)}%`,
                        target_delta: -0.85,    // HIGH DELTA for fast movement
                        option_type: 'put'
                    });
                    this.debugInfo.signalsGenerated++;
                    
                    // Debug log every signal
                    console.log(`🐛 PUT SIGNAL ${this.debugInfo.signalsGenerated}: RSI=${rsi.toFixed(1)}, VWAP diff=${(vwapDiff*100).toFixed(2)}%, Price=$${currentPrice}`);
                } else {
                    this.debugInfo.signalStrengthFiltered++;
                }
            }

            // Debug logging every 200 bars (more frequent)
            if (this.debugInfo.totalBarsProcessed % 200 === 0) {
                console.log(`🐛 DEBUG (${this.debugInfo.totalBarsProcessed} bars):`, this.debugInfo);
            }
        });

        console.log(`🐛 DEBUG COMPLETE: Generated ${signals.length} total signals from ${underlyingBars.length} bars`);
        console.log(`🐛 FINAL STATS:`, this.debugInfo);
        
        return signals;
    }

    /**
     * Simple signal strength calculation
     */
    calculateSignalStrength(rsi, vwapDiff, volume) {
        let strength = 1.0; // Base strength
        
        // RSI distance from threshold
        const rsiDistance = rsi <= this.rsiOversold ? 
            (this.rsiOversold - rsi) : (rsi - this.rsiOverbought);
        strength += Math.min(rsiDistance / 10, 0.5);
        
        // VWAP deviation strength
        strength += Math.min(vwapDiff / 0.01, 0.5);
        
        return Math.min(strength, 3.0);
    }

    /**
     * Standard methods for backtesting system
     */
    canOpenPosition() {
        return this.currentPositions.length < this.maxPositions;
    }

    getContractCriteria(signal) {
        const isCall = signal.option_type === 'call';
        
        return {
            optionType: signal.option_type,
            // FIXED: Proper delta ranges for calls vs puts
            minDelta: isCall ? 0.40 : -1.00,        // Calls: ATM+ (0.40-1.00), Puts: All ITM (-1.00 to -0.40)
            maxDelta: isCall ? 1.00 : -0.40,        // Calls: Deep ITM, Puts: ATM+
            maxBidAskSpread: this.maxSpreadPercent,
            minVolume: this.minVolume,
            targetDelta: isCall ? 0.70 : -0.70,     // FIXED: Calls: +0.70, Puts: -0.70 (both moderately ITM)
            maxPositionValue: signal.position_size
        };
    }

    shouldExit(position, currentPrice, currentTime) {
        const entryPrice = position.entry_price;
        const entryTime = new Date(position.entry_timestamp || position.entry_time);
        const current = new Date(currentTime);
        const holdingTime = (current - entryTime) / (1000 * 60);
        
        const currentValue = currentPrice * 100 * position.quantity;
        const entryValue = entryPrice * 100 * position.quantity;
        const pnl = currentValue - entryValue;
        const pnlPercent = pnl / entryValue;
        
        // 🐛 DEBUG: Log all exit evaluations
        console.log(`🔍 [EXIT CHECK] ${position.contract_symbol}: Hold=${holdingTime.toFixed(1)}min (max=${this.maxHoldMinutes}), P&L=${(pnlPercent*100).toFixed(1)}% (target=+${(this.profitTargetPercent*100).toFixed(1)}%, stop=${-(this.stopLossPercent*100).toFixed(1)}%)`);
        
        if (holdingTime >= this.maxHoldMinutes) {
            console.log(`🚪 [TIME EXIT] ${position.contract_symbol}: ${holdingTime.toFixed(0)}min >= ${this.maxHoldMinutes}min limit`);
            return { shouldExit: true, reason: `Max hold time: ${holdingTime.toFixed(0)}min` };
        }
        
        if (pnlPercent >= this.profitTargetPercent) {
            console.log(`💰 [PROFIT EXIT] ${position.contract_symbol}: ${(pnlPercent*100).toFixed(1)}% >= ${(this.profitTargetPercent*100).toFixed(1)}% target`);
            return { shouldExit: true, reason: `Profit target: ${(pnlPercent*100).toFixed(1)}%` };
        }
        
        if (pnlPercent <= -this.stopLossPercent) {
            console.log(`🛑 [STOP EXIT] ${position.contract_symbol}: ${(pnlPercent*100).toFixed(1)}% <= ${-(this.stopLossPercent*100).toFixed(1)}% stop`);
            return { shouldExit: true, reason: `Stop loss: ${(pnlPercent*100).toFixed(1)}%` };
        }
        
        console.log(`✅ [HOLD] ${position.contract_symbol}: Position OK - continuing`);
        return { shouldExit: false, reason: 'Position OK' };
    }

    reset() {
        this.currentPositions = [];
        this.priceHistory = [];
        this.volumeHistory = [];
        this.signalCount = 0;
        this.debugInfo = {
            totalBarsProcessed: 0,
            rsiCalculated: 0,
            vwapCalculated: 0,
            volumeFiltered: 0,
            signalStrengthFiltered: 0,
            signalsGenerated: 0
        };
        console.log(`🐛 DEBUG STRATEGY RESET - Ready for new backtest`);
    }

    getTradingStyle() {
        return 'Debug Testing';
    }

    getRiskLevel() {
        return 'Low';
    }

    getDescription() {
        return 'IWM Debug Strategy - Test backtest logic with frequency analysis parameters';
    }
}

module.exports = IWMDebugStrategy;