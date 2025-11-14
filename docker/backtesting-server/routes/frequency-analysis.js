/**
 * Enhanced Analysis Endpoint - Add Signal Frequency Testing
 * 
 * This adds comprehensive parameter testing to find why we get zero trades
 */

const express = require('express');
const router = express.Router();
const alpacaClientManager = require('../utils/alpaca-client-manager');

class SignalFrequencyAnalyzer {
    constructor() {
        // AlpacaClient will be passed as parameter
    }

    /**
     * Test multiple parameter combinations to find realistic signal frequencies
     */
    async analyzeSignalFrequencies(symbol, startDate, endDate, alpacaClient) {
        try {
            console.log(`🔍 SIGNAL FREQUENCY ANALYSIS: ${symbol} from ${startDate} to ${endDate}`);
            
            // Get historical data using provided client
            const result = await alpacaClient.getHistoricalBars({
                symbol: symbol,
                start: startDate,
                end: endDate,
                timeframe: '1Min'
            });
            const bars = result.bars || result;
            
            if (!bars || bars.length === 0) {
                throw new Error('No historical data available');
            }

            console.log(`📊 Processing ${bars.length} bars`);

            // Calculate indicators for all bars
            const enrichedData = this.enrichDataWithIndicators(bars);
            
            // Test different parameter combinations
            const parameterTests = [
                // Wide thresholds (should generate more signals)
                { rsi: {oversold: 25, overbought: 75}, vwap: 0.005, name: 'Wide_0.5%' },
                { rsi: {oversold: 30, overbought: 70}, vwap: 0.004, name: 'Traditional_0.4%' },
                { rsi: {oversold: 30, overbought: 70}, vwap: 0.003, name: 'Traditional_0.3%' },
                
                // Medium thresholds  
                { rsi: {oversold: 35, overbought: 65}, vwap: 0.003, name: 'Conservative_0.3%' },
                { rsi: {oversold: 35, overbought: 65}, vwap: 0.002, name: 'Conservative_0.2%' },
                
                // Current analyzer recommendations
                { rsi: {oversold: 34, overbought: 65}, vwap: 0.002, name: 'Analyzer_0.2%' },
                
                // Tight thresholds
                { rsi: {oversold: 40, overbought: 60}, vwap: 0.002, name: 'Tight_0.2%' },
                { rsi: {oversold: 40, overbought: 60}, vwap: 0.001, name: 'Tight_0.1%' }
            ];

            const results = [];
            
            for (const params of parameterTests) {
                const signalCount = this.testParameterSet(enrichedData, params);
                results.push({
                    name: params.name,
                    parameters: params,
                    ...signalCount,
                    signalsPerDay: signalCount.total / this.getTradingDays(enrichedData),
                    quality: this.assessSignalQuality(signalCount.total / this.getTradingDays(enrichedData))
                });
            }
            
            // Sort by total signals
            results.sort((a, b) => b.total - a.total);
            
            return {
                symbol,
                period: { startDate, endDate },
                totalBars: bars.length,
                tradingDays: this.getTradingDays(enrichedData),
                parameterTests: results,
                recommendations: this.generateRecommendations(results),
                summary: this.generateSummary(results)
            };

        } catch (error) {
            console.error('Signal Frequency Analysis Error:', error);
            throw error;
        }
    }

    /**
     * Enrich bars with technical indicators
     */
    enrichDataWithIndicators(bars) {
        return bars.map((bar, index) => {
            const prices = bars.slice(0, index + 1).map(b => parseFloat(b.c));
            const volumes = bars.slice(0, index + 1).map(b => parseFloat(b.v) || 1);
            
            const rsi = this.calculateRSI(prices, 14);
            const vwap = this.calculateVWAP(prices.slice(-30), volumes.slice(-30));
            
            return {
                ...bar,
                close: parseFloat(bar.c),
                volume: parseFloat(bar.v) || 1,
                rsi,
                vwap,
                hour: new Date(bar.t).getHours()
            };
        }).filter(bar => bar.rsi !== null && bar.vwap !== null);
    }

    /**
     * Test specific parameter set
     */
    testParameterSet(data, params) {
        let calls = 0, puts = 0;
        const signals = [];
        
        for (const bar of data) {
            // Skip lunch hours
            if (bar.hour >= 12 && bar.hour < 14) continue;
            
            const vwapDiff = Math.abs(bar.close - bar.vwap) / bar.vwap;
            
            // CALL signals: RSI oversold + price conditions
            if (bar.rsi <= params.rsi.oversold && 
                bar.close >= bar.vwap * (1 - params.vwap) &&
                vwapDiff >= params.vwap * 0.5) { // Half threshold for minimum movement
                calls++;
                if (signals.length < 5) { // Keep sample signals
                    signals.push({
                        type: 'CALL',
                        time: bar.t,
                        rsi: bar.rsi,
                        price: bar.close,
                        vwap: bar.vwap
                    });
                }
            }
            
            // PUT signals: RSI overbought + price conditions
            if (bar.rsi >= params.rsi.overbought && 
                bar.close <= bar.vwap * (1 + params.vwap) &&
                vwapDiff >= params.vwap * 0.5) {
                puts++;
                if (signals.length < 5) {
                    signals.push({
                        type: 'PUT',
                        time: bar.t,
                        rsi: bar.rsi,
                        price: bar.close,
                        vwap: bar.vwap
                    });
                }
            }
        }
        
        return {
            calls,
            puts,
            total: calls + puts,
            sampleSignals: signals
        };
    }

    /**
     * Assess signal quality based on frequency
     */
    assessSignalQuality(signalsPerDay) {
        if (signalsPerDay === 0) return 'NONE';
        if (signalsPerDay < 0.5) return 'TOO_FEW';
        if (signalsPerDay <= 2) return 'OPTIMAL';
        if (signalsPerDay <= 5) return 'ACCEPTABLE';
        return 'TOO_MANY';
    }

    /**
     * Generate recommendations based on results
     */
    generateRecommendations(results) {
        const optimal = results.find(r => r.quality === 'OPTIMAL');
        const acceptable = results.filter(r => r.quality === 'ACCEPTABLE');
        const best = results[0];
        
        if (optimal) {
            return {
                status: 'OPTIMAL_FOUND',
                recommended: optimal,
                reasoning: `Found parameters generating ${optimal.signalsPerDay.toFixed(1)} signals/day (optimal range)`
            };
        } else if (acceptable.length > 0) {
            return {
                status: 'ACCEPTABLE_FOUND',
                recommended: acceptable[0],
                reasoning: `Best acceptable option generates ${acceptable[0].signalsPerDay.toFixed(1)} signals/day`
            };
        } else if (best.total > 0) {
            return {
                status: 'SIGNALS_FOUND',
                recommended: best,
                reasoning: `Best option generates ${best.signalsPerDay.toFixed(1)} signals/day but may be too frequent`
            };
        } else {
            return {
                status: 'NO_SIGNALS',
                recommended: null,
                reasoning: 'All parameter combinations generated zero signals - need to widen thresholds significantly',
                suggestions: [
                    'Try RSI thresholds 20/80 (very wide)',
                    'Increase VWAP threshold to 1% or higher',
                    'Consider using different indicators (MACD, momentum)',
                    'Use longer timeframes (5min or 15min bars)'
                ]
            };
        }
    }

    /**
     * Generate summary of findings
     */
    generateSummary(results) {
        const totalSignals = results.map(r => r.total);
        const maxSignals = Math.max(...totalSignals);
        const avgSignals = totalSignals.reduce((a, b) => a + b, 0) / totalSignals.length;
        
        return {
            totalParametersCombinations: results.length,
            maxSignalsFound: maxSignals,
            averageSignals: avgSignals.toFixed(1),
            parametersWithSignals: results.filter(r => r.total > 0).length,
            optimalParameters: results.filter(r => r.quality === 'OPTIMAL').length,
            keyInsight: maxSignals === 0 ? 
                'All tested parameters are too restrictive for this timeframe' :
                `Wide parameters (RSI 25/75, VWAP 0.5%) generate most signals`
        };
    }

    // Helper methods
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

    calculateVWAP(prices, volumes) {
        if (!prices.length || prices.length !== volumes.length) return null;
        
        let sumPV = 0, sumV = 0;
        for (let i = 0; i < prices.length; i++) {
            sumPV += prices[i] * volumes[i];
            sumV += volumes[i];
        }
        
        return sumV > 0 ? sumPV / sumV : null;
    }

    getTradingDays(data) {
        const days = new Set();
        data.forEach(bar => {
            days.add(new Date(bar.t).toDateString());
        });
        return days.size;
    }
}

// Add new endpoint for signal frequency analysis
router.post('/frequency', async (req, res) => {
    try {
        const { symbol = 'IWM', startDate = '2024-12-01', endDate = '2024-12-31' } = req.body;
        
        const analyzer = new SignalFrequencyAnalyzer();
        const alpacaClient = alpacaClientManager.getClient('backtest');
        const results = await analyzer.analyzeSignalFrequencies(symbol, startDate, endDate, alpacaClient);
        
        res.json({
            success: true,
            ...results
        });
        
    } catch (error) {
        console.error('Frequency analysis error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;