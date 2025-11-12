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

class IWMOptimalAnalyzer {
    constructor() {
        this.name = "IWM Optimal Analyzer";
        this.symbol = "IWM";
        this.timeframe = "1min";
        
        // ANALYZER-RECOMMENDED PARAMETERS (Dec 2024 analysis)
        // Expected: 65% win rate, 1.8 Sharpe ratio
        this.parameters = {
            // RSI Parameters - Analyzer Optimal
            rsiPeriod: 14,
            rsiOversold: 34,    // From analyzer (vs our 35 conservative guess)
            rsiOverbought: 65,  // From analyzer (vs our 65 conservative guess)
            
            // VWAP Parameters - Analyzer Optimal  
            vwapThreshold: 0.002, // 0.20% (vs our 0.30% guess)
            
            // Risk Management - Analyzer Optimal
            stopLossPercent: 0.20,  // 20% (vs 40% conservative, 25% aggressive)
            profitTargetPercent: 0.15, // 15% (quick profit taking)
            maxHoldMinutes: 60,     // 60min (balanced approach)
            
            // Position Management
            maxRiskPerTrade: 0.025, // 2.5% (moderate risk)
            preferredDTE: 0,        // 0DTE focus
            maxPositions: 2,        // Conservative position count
            contractsPerTrade: 1,   // Single contracts for precision
            
            // Volume and Liquidity
            minVolume: 1000,
            minOpenInterest: 100,
            maxSpreadPercent: 0.15, // 15% max spread
            
            // Market Conditions
            marketHoursOnly: true,
            avoidEarnings: true,
            minTimeToExpiry: 30     // 30min minimum to expiry
        };
    }

    /**
     * Generate trading signals based on analyzer-optimized parameters
     */
    generateSignal(data) {
        try {
            const latest = data[data.length - 1];
            if (!latest || !latest.indicators) {
                return { signal: 'NONE', confidence: 0, reason: 'Missing data or indicators' };
            }

            const { rsi, vwap, price, volume } = latest.indicators;
            
            // Validation
            if (!rsi || !vwap || !price || !volume) {
                return { signal: 'NONE', confidence: 0, reason: 'Missing required indicators' };
            }

            // Volume filter
            if (volume < this.parameters.minVolume) {
                return { signal: 'NONE', confidence: 0, reason: 'Insufficient volume' };
            }

            // Calculate VWAP deviation
            const vwapDeviation = Math.abs(price - vwap) / vwap;
            
            // ANALYZER SIGNAL LOGIC - Optimized for 65% win rate
            
            // BULLISH: RSI oversold + price near/below VWAP
            if (rsi <= this.parameters.rsiOversold && 
                price <= vwap * (1 + this.parameters.vwapThreshold)) {
                
                const confidence = this.calculateConfidence({
                    rsiDistance: this.parameters.rsiOversold - rsi,
                    vwapDeviation: vwapDeviation,
                    volume: volume
                });
                
                return { 
                    signal: 'BUY_CALL', 
                    confidence: confidence,
                    reason: `RSI oversold (${rsi.toFixed(1)}) + price near VWAP (dev: ${(vwapDeviation*100).toFixed(2)}%)`
                };
            }
            
            // BEARISH: RSI overbought + price above VWAP
            if (rsi >= this.parameters.rsiOverbought && 
                price >= vwap * (1 - this.parameters.vwapThreshold)) {
                
                const confidence = this.calculateConfidence({
                    rsiDistance: rsi - this.parameters.rsiOverbought,
                    vwapDeviation: vwapDeviation,
                    volume: volume
                });
                
                return { 
                    signal: 'BUY_PUT', 
                    confidence: confidence,
                    reason: `RSI overbought (${rsi.toFixed(1)}) + price above VWAP (dev: ${(vwapDeviation*100).toFixed(2)}%)`
                };
            }

            return { 
                signal: 'NONE', 
                confidence: 0, 
                reason: `Neutral zone - RSI: ${rsi.toFixed(1)}, VWAP dev: ${(vwapDeviation*100).toFixed(2)}%`
            };

        } catch (error) {
            console.error('Signal generation error:', error);
            return { signal: 'NONE', confidence: 0, reason: 'Signal calculation error' };
        }
    }

    /**
     * Calculate confidence based on signal strength
     */
    calculateConfidence({ rsiDistance, vwapDeviation, volume }) {
        let confidence = 0.5; // Base confidence
        
        // RSI strength contribution (30%)
        const rsiStrength = Math.min(rsiDistance / 10, 1); // Normalize to 0-1
        confidence += rsiStrength * 0.3;
        
        // VWAP deviation contribution (30%) 
        const vwapStrength = Math.min(vwapDeviation / 0.01, 1); // Normalize to 0-1
        confidence += vwapStrength * 0.3;
        
        // Volume contribution (20%)
        const volumeStrength = Math.min(volume / (this.parameters.minVolume * 2), 1);
        confidence += volumeStrength * 0.2;
        
        return Math.min(Math.max(confidence, 0), 1);
    }

    /**
     * Risk management - analyzer-optimized exit rules
     */
    shouldExit(position, currentPrice, timeHeld) {
        const entryPrice = position.entryPrice;
        const pnlPercent = (currentPrice - entryPrice) / entryPrice;
        
        // Time-based exit (analyzer recommended 60min max)
        if (timeHeld >= this.parameters.maxHoldMinutes) {
            return { shouldExit: true, reason: 'Max hold time reached (60min)' };
        }
        
        // Profit target (analyzer recommended 15%)
        if (pnlPercent >= this.parameters.profitTargetPercent) {
            return { shouldExit: true, reason: `Profit target hit: ${(pnlPercent*100).toFixed(1)}%` };
        }
        
        // Stop loss (analyzer recommended 20%)
        if (pnlPercent <= -this.parameters.stopLossPercent) {
            return { shouldExit: true, reason: `Stop loss hit: ${(pnlPercent*100).toFixed(1)}%` };
        }
        
        return { shouldExit: false, reason: 'Position within targets' };
    }

    /**
     * Position sizing based on analyzer risk recommendations
     */
    canOpenPosition(currentPositions, portfolioValue) {
        if (currentPositions >= this.parameters.maxPositions) {
            return false;
        }
        
        const riskAmount = portfolioValue * this.parameters.maxRiskPerTrade;
        return riskAmount > 100; // Minimum $100 position
    }

    /**
     * Contract selection criteria
     */
    getContractCriteria() {
        return {
            dte: this.parameters.preferredDTE,
            minVolume: this.parameters.minVolume,
            minOpenInterest: this.parameters.minOpenInterest,
            maxSpread: this.parameters.maxSpreadPercent,
            deltaRange: [0.3, 0.7] // Moderate delta for IWM
        };
    }

    /**
     * Get all strategy parameters
     */
    getParameters() {
        return this.parameters;
    }

    /**
     * Strategy description
     */
    getDescription() {
        return `
IWM Optimal Strategy - Analyzer Based (Dec 2024)

PERFORMANCE TARGETS:
• Win Rate: 65% (analyzed target)
• Sharpe Ratio: 1.8 (analyzed target)  
• Risk Level: Medium

SIGNAL LOGIC:
• RSI Oversold (≤34) + Price ≤ VWAP+0.2% → BUY CALL
• RSI Overbought (≥65) + Price ≥ VWAP-0.2% → BUY PUT

RISK MANAGEMENT:
• Stop Loss: 20% (tight control)
• Profit Target: 15% (quick scalping)
• Max Hold: 60 minutes (balanced)
• Max Risk: 2.5% per trade
• Max Positions: 2

BASED ON: Comprehensive December 2024 IWM analysis
        `;
    }
}

module.exports = IWMOptimalAnalyzer;