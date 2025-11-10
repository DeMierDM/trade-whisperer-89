/**
 * IWM Optimal Strategy - Based on Analyzer Recommendations
 * 
 * Created from comprehensive December 2024 analysis showing:
 * - Expected Win Rate: 65% (target: 60-75%)
 * - Expected Sharpe: 1.8 (target: 1.5-2.0)
 * - Optimal RSI: 34/65 (moderate approach)
 * - VWAP Threshold: 0.20%
 * - Stop Loss: 20%, Profit Target: 15%
 * - Max Hold: 60 minutes
 */

const contractSelector = require('../utils/contract-selector');

class IWMOptimalAnalyzer {
    constructor(parameters = {}) {
        this.name = "IWM Optimal Analyzer";
        this.symbol = "IWM";
        this.timeframe = "1min";
        
        // Required strategy properties
        this.maxRiskPerTrade = 0.025; // 2.5% (moderate risk)
        this.preferredDTE = 0;        // 0DTE focus
        this.maxPositions = 100;      // HIGH CAPACITY: Allow many concurrent positions
        this.contractsPerTrade = 1;   // Single contracts for precision
        this.currentPositions = [];
        
        // ANALYZER-RECOMMENDED PARAMETERS (Dec 2024 analysis)
        // Expected: 65% win rate, 1.8 Sharpe ratio
        
        // RSI Parameters - Analyzer Optimal
        this.rsiPeriod = 14;
        this.rsiOversold = 34;    // From analyzer (vs our 35 conservative guess)
        this.rsiOverbought = 65;  // From analyzer (vs our 65 conservative guess)
        
        // VWAP Parameters - Analyzer Optimal  
        this.vwapThreshold = 0.002; // 0.20% (vs our 0.30% guess)
        this.vwapPeriod = 30;       // Standard VWAP period
        
        // Risk Management - Analyzer Optimal
        this.stopLossPercent = 0.20;  // 20% (vs 40% conservative, 25% aggressive)
        this.profitTargetPercent = 0.15; // 15% (quick profit taking)
        this.maxHoldMinutes = 60;     // 60min (balanced approach)
        
        // Volume and Liquidity
        this.minVolume = 1000;
        this.minOpenInterest = 100;
        this.maxSpreadPercent = 0.15; // 15% max spread
        this.minSignalStrength = 1.2; // Signal quality threshold
        
        // Market Conditions
        this.marketHoursOnly = true;
        this.avoidEarnings = true;
        this.minTimeToExpiry = 30;    // 30min minimum to expiry
        
        // Initialize history arrays
        this.priceHistory = [];
        this.volumeHistory = [];
        this.signalCount = 0;
        
        // Target deltas - HIGH DELTA for fast-moving contracts
        this.targetCallDelta = 0.85;
        this.targetPutDelta = -0.85;
        this.minDelta = 0.25;
        this.maxDelta = 0.75;
        this.maxBidAskSpread = 0.15;
    }

    /**
     * Calculate RSI for the given prices
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
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }

    /**
     * Calculate VWAP for the given prices and volumes
     */
    calculateVWAP(prices, volumes) {
        if (prices.length !== volumes.length || prices.length === 0) return null;
        
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
     * Generate trading signals based on analyzer-optimized parameters
     * FIXED: Process all bars like SPY strategy, not just the last one
     */
    generateSignals(underlyingBars) {
        const signals = [];
        
        underlyingBars.forEach((bar, index) => {
            // Skip first bar - need previous for indicator calculation
            if (index === 0) return;

            // Build price history from PREVIOUS bar (corrected pattern)
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

            // Calculate indicators using accumulated history
            const rsi = this.calculateRSI(this.priceHistory, this.rsiPeriod);
            const vwap = this.calculateVWAP(this.priceHistory, this.volumeHistory);

            if (!rsi || !vwap) return;

            // Process current bar for signals
            const currentPrice = parseFloat(bar.c);
            const currentVolume = parseFloat(bar.v) || 1;

            // Volume filter
            if (currentVolume < this.minVolume) return;
            
            // ANALYZER SIGNAL LOGIC - Optimized for 65% win rate
            
            // BULLISH: RSI oversold + price near/below VWAP
            if (rsi <= this.rsiOversold && 
                currentPrice <= vwap * (1 + this.vwapThreshold)) {
                
                const confidence = this.calculateConfidence({
                    rsiDistance: this.rsiOversold - rsi,
                    vwapDeviation: Math.abs(currentPrice - vwap) / vwap,
                    volume: currentVolume
                });
                
                if (confidence >= this.minSignalStrength) {
                    signals.push({
                        timestamp: bar.t,
                        signal_type: 'BUY_CALL',
                        underlying_price: currentPrice,
                        signal_strength: confidence,
                        position_size: 100,
                        signal_reason: `Analyzer: RSI ${rsi.toFixed(1)} oversold + price near VWAP`,
                        target_delta: 0.85,      // HIGH DELTA for fast movement
                        option_type: 'call'
                    });
                }
            }
            
            // BEARISH: RSI overbought + price above VWAP
            if (rsi >= this.rsiOverbought && 
                currentPrice >= vwap * (1 - this.vwapThreshold)) {
                
                const confidence = this.calculateConfidence({
                    rsiDistance: rsi - this.rsiOverbought,
                    vwapDeviation: Math.abs(currentPrice - vwap) / vwap,
                    volume: currentVolume
                });
                
                if (confidence >= this.minSignalStrength) {
                    signals.push({
                        timestamp: bar.t,
                        signal_type: 'BUY_PUT',
                        underlying_price: currentPrice,
                        signal_strength: confidence,
                        position_size: 100,
                        signal_reason: `Analyzer: RSI ${rsi.toFixed(1)} overbought + price above VWAP`,
                        target_delta: -0.85,     // HIGH DELTA for fast movement  
                        option_type: 'put'
                    });
                }
            }
        });

        return signals;
    }

    /**
     * Calculate confidence based on signal strength
     */
    calculateConfidence({ rsiDistance, vwapDeviation, volume }) {
        let confidence = 1.0; // Base confidence
        
        // RSI strength contribution (40%)
        const rsiStrength = Math.min(rsiDistance / 10, 1); // Normalize to 0-1
        confidence += rsiStrength * 0.4;
        
        // VWAP deviation contribution (40%) 
        const vwapStrength = Math.min(vwapDeviation / 0.01, 1); // Normalize to 0-1
        confidence += vwapStrength * 0.4;
        
        // Volume contribution (20%)
        const volumeStrength = Math.min(volume / (this.minVolume * 2), 1);
        confidence += volumeStrength * 0.2;
        
        return Math.min(Math.max(confidence, 0.5), 3.0);
    }

    /**
     * Risk management - analyzer-optimized exit rules
     */
    shouldExit(position, currentPrice, currentTime) {
        const entryPrice = position.entry_price;
        const entryTime = new Date(position.entry_timestamp || position.entry_time);
        const current = new Date(currentTime);
        const holdingTime = (current - entryTime) / (1000 * 60); // minutes
        
        const currentValue = currentPrice * 100 * position.quantity;
        const entryValue = entryPrice * 100 * position.quantity;
        const pnl = currentValue - entryValue;
        const pnlPercent = pnl / entryValue;
        
        // Time-based exit (analyzer recommended 60min max)
        if (holdingTime >= this.maxHoldMinutes) {
            return { shouldExit: true, reason: 'Max hold time reached (60min)' };
        }
        
        // Profit target (analyzer recommended 15%)
        if (pnlPercent >= this.profitTargetPercent) {
            return { shouldExit: true, reason: `Profit target hit: ${(pnlPercent*100).toFixed(1)}%` };
        }
        
        // Stop loss (analyzer recommended 20%)
        if (pnlPercent <= -this.stopLossPercent) {
            return { shouldExit: true, reason: `Stop loss hit: ${(pnlPercent*100).toFixed(1)}%` };
        }
        
        return { shouldExit: false, reason: 'Position within targets' };
    }

    /**
     * Position sizing based on analyzer risk recommendations
     */
    canOpenPosition() {
        return this.currentPositions.length < this.maxPositions;
    }

    /**
     * Get contract selection criteria
     */
    getContractCriteria(signal) {
        return {
            optionType: signal.option_type,
            minDelta: 0.75,          // HIGH DELTA: Fast-moving contracts
            maxDelta: 1.00,          // Allow near-ITM to deep-ITM
            maxBidAskSpread: this.maxSpreadPercent,
            minVolume: this.minVolume,
            targetDelta: Math.abs(signal.target_delta || 0.85),  // PREFERRED: 0.80-0.95
            maxPositionValue: signal.position_size
        };
    }

    /**
     * Contract selection using the contract selector
     */
    async selectContract(signal, marketData, symbol) {
        const contractCriteria = {
            dte: this.preferredDTE,
            minVolume: this.minVolume,
            minOpenInterest: this.minOpenInterest,
            maxSpread: this.maxSpreadPercent,
            deltaRange: [0.75, 1.00] // HIGH DELTA: Fast-moving contracts
        };
        
        return await contractSelector.selectOptimalContract(
            signal.type,
            marketData,
            symbol,
            contractCriteria
        );
    }

    /**
     * Get trading style metadata
     */
    getTradingStyle() {
        return 'Analyzer Optimized';
    }

    getRiskLevel() {
        return 'Medium';
    }

    /**
     * Reset strategy state for new backtest
     */
    reset() {
        this.currentPositions = [];
        this.priceHistory = [];
        this.volumeHistory = [];
        this.signalCount = 0;
    }

    /**
     * Strategy description
     */
    getDescription() {
        return 'IWM Optimal Strategy - Analyzer Based (Dec 2024) - Expected Win Rate: 65%, Sharpe: 1.8';
    }
}

module.exports = IWMOptimalAnalyzer;