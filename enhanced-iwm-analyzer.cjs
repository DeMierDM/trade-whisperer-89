/**
 * Enhanced IWM Options Analyzer with Signal Frequency Analysis
 * 
 * PURPOSE: Understand why parameters generate zero trades and find optimal settings
 * APPROACH: Test multiple parameter combinations and analyze signal frequencies
 */

// Mock AlpacaClient for testing - we'll use the API instead
class MockAlpacaClient {
    async getHistoricalBars(symbol, options) {
        // This will be replaced by API calls
        throw new Error('Use API endpoint instead');
    }
}

const AlpacaClient = MockAlpacaClient;

class EnhancedIWMAnalyzer {
    constructor() {
        this.alpacaClient = new AlpacaClient();
    }

    /**
     * COMPREHENSIVE MONTH-LONG ANALYSIS
     * Analyze December 2024 IWM data with signal frequency testing
     */
    async analyzeFullMonth(symbol = 'IWM', startDate = '2024-12-01', endDate = '2024-12-31') {
        console.log(`🔍 ENHANCED ANALYSIS: ${symbol} from ${startDate} to ${endDate}`);
        
        try {
            // Get historical data
            const result = await this.alpacaClient.getHistoricalBars(symbol, {
                start: startDate,
                end: endDate,
                timeframe: '1Min'
            });
            
            const bars = result.bars || result;
            if (!bars || bars.length === 0) {
                throw new Error('No data received from Alpaca');
            }

            console.log(`📊 Processing ${bars.length} 1-minute bars`);

            // Calculate all technical indicators
            const enrichedData = this.calculateAllIndicators(bars);
            
            // TEST MULTIPLE PARAMETER COMBINATIONS
            const parameterTests = this.testParameterCombinations(enrichedData);
            
            // SIGNAL FREQUENCY ANALYSIS
            const signalAnalysis = this.analyzeSignalFrequencies(enrichedData, parameterTests);
            
            // MARKET REGIME ANALYSIS
            const regimeAnalysis = this.analyzeMarketRegimes(enrichedData);
            
            return {
                symbol,
                period: { startDate, endDate },
                dataPoints: bars.length,
                tradingDays: this.countTradingDays(enrichedData),
                parameterTests,
                signalAnalysis,
                regimeAnalysis,
                recommendations: this.generateSmartRecommendations(parameterTests, signalAnalysis, regimeAnalysis),
                rawData: enrichedData.slice(-100) // Last 100 bars for inspection
            };

        } catch (error) {
            console.error('Enhanced Analysis Error:', error);
            throw error;
        }
    }

    /**
     * Calculate all technical indicators for the dataset
     */
    calculateAllIndicators(bars) {
        const enriched = bars.map((bar, index) => {
            const prices = bars.slice(0, index + 1).map(b => parseFloat(b.c));
            const volumes = bars.slice(0, index + 1).map(b => parseFloat(b.v) || 1);
            
            return {
                timestamp: bar.t,
                open: parseFloat(bar.o),
                high: parseFloat(bar.h),
                low: parseFloat(bar.l),
                close: parseFloat(bar.c),
                volume: parseFloat(bar.v) || 1,
                
                // Technical Indicators
                rsi14: this.calculateRSI(prices, 14),
                rsi21: this.calculateRSI(prices, 21),
                vwap: this.calculateVWAP(prices.slice(-30), volumes.slice(-30)),
                vwap20: this.calculateVWAP(prices.slice(-20), volumes.slice(-20)),
                ema9: this.calculateEMA(prices, 9),
                ema21: this.calculateEMA(prices, 21),
                
                // Price relationships
                priceVsVwap: prices.length > 0 ? ((parseFloat(bar.c) - this.calculateVWAP(prices.slice(-30), volumes.slice(-30))) / this.calculateVWAP(prices.slice(-30), volumes.slice(-30))) : 0,
                
                // Time of day
                hour: new Date(bar.t).getHours(),
                minute: new Date(bar.t).getMinutes()
            };
        });

        return enriched.filter(item => item.rsi14 !== null && item.vwap !== null);
    }

    /**
     * TEST MULTIPLE PARAMETER COMBINATIONS
     */
    testParameterCombinations(data) {
        const parameterTests = [];
        
        // Different RSI threshold combinations
        const rsiCombinations = [
            { oversold: 30, overbought: 70, name: 'Traditional' },
            { oversold: 35, overbought: 65, name: 'Conservative' },
            { oversold: 40, overbought: 60, name: 'Tight' },
            { oversold: 25, overbought: 75, name: 'Wide' },
            { oversold: 34, overbought: 65, name: 'Analyzer Recommended' }
        ];
        
        // Different VWAP thresholds
        const vwapThresholds = [0.001, 0.002, 0.003, 0.005, 0.01]; // 0.1% to 1%
        
        for (const rsiCombo of rsiCombinations) {
            for (const vwapThreshold of vwapThresholds) {
                const testResult = this.testParameterSet(data, {
                    rsi: rsiCombo,
                    vwapThreshold,
                    name: `${rsiCombo.name}_VWAP${(vwapThreshold*100).toFixed(1)}%`
                });
                
                parameterTests.push(testResult);
            }
        }
        
        // Sort by signal frequency
        return parameterTests.sort((a, b) => b.totalSignals - a.totalSignals);
    }

    /**
     * Test specific parameter set and count signals
     */
    testParameterSet(data, params) {
        let callSignals = 0;
        let putSignals = 0;
        let signalTimes = [];
        
        for (const bar of data) {
            if (!bar.rsi14 || !bar.vwap) continue;
            
            const { rsi14, close, vwap, timestamp, hour } = bar;
            const priceVwapDiff = Math.abs(close - vwap) / vwap;
            
            // Skip lunch hours (11:30 AM - 2 PM ET)
            if (hour >= 11.5 && hour < 14) continue;
            
            // CALL signals: RSI oversold + price near/above VWAP
            if (rsi14 <= params.rsi.oversold && 
                close >= vwap * (1 - params.vwapThreshold) &&
                priceVwapDiff >= params.vwapThreshold) {
                callSignals++;
                signalTimes.push({ type: 'CALL', time: timestamp, rsi: rsi14, price: close, vwap });
            }
            
            // PUT signals: RSI overbought + price near/below VWAP  
            if (rsi14 >= params.rsi.overbought && 
                close <= vwap * (1 + params.vwapThreshold) &&
                priceVwapDiff >= params.vwapThreshold) {
                putSignals++;
                signalTimes.push({ type: 'PUT', time: timestamp, rsi: rsi14, price: close, vwap });
            }
        }
        
        return {
            name: params.name,
            parameters: params,
            callSignals,
            putSignals,
            totalSignals: callSignals + putSignals,
            signalsPerDay: (callSignals + putSignals) / 21, // 21 trading days in Dec 2024
            signalTimes: signalTimes.slice(0, 10) // First 10 signals for inspection
        };
    }

    /**
     * ANALYZE SIGNAL FREQUENCIES across different timeframes
     */
    analyzeSignalFrequencies(data, parameterTests) {
        // Find best performing parameter sets
        const topParameters = parameterTests.slice(0, 5);
        
        // Analyze signal distribution by hour
        const hourlyDistribution = {};
        for (let hour = 9; hour <= 16; hour++) {
            hourlyDistribution[hour] = 0;
        }
        
        // Count signals by hour for top parameter set
        if (topParameters.length > 0) {
            const bestParams = topParameters[0];
            for (const signal of bestParams.signalTimes) {
                const hour = new Date(signal.time).getHours();
                if (hourlyDistribution[hour] !== undefined) {
                    hourlyDistribution[hour]++;
                }
            }
        }
        
        return {
            bestParameterSets: topParameters,
            hourlySignalDistribution: hourlyDistribution,
            averageSignalsPerDay: topParameters.length > 0 ? topParameters[0].signalsPerDay : 0,
            signalQualityMetrics: {
                minimumDailySignals: 1, // Need at least 1 signal per day
                optimalDailySignals: 3, // Sweet spot for 0DTE
                maximumDailySignals: 10 // Too many signals = noise
            }
        };
    }

    /**
     * ANALYZE MARKET REGIMES (trending vs consolidating)
     */
    analyzeMarketRegimes(data) {
        const regimes = {
            trending: 0,
            consolidating: 0,
            volatile: 0
        };
        
        // Analyze 20-bar periods
        for (let i = 20; i < data.length; i += 20) {
            const period = data.slice(i - 20, i);
            const prices = period.map(bar => bar.close);
            
            const highest = Math.max(...prices);
            const lowest = Math.min(...prices);
            const range = (highest - lowest) / prices[0];
            
            if (range > 0.02) { // > 2% range
                regimes.volatile++;
            } else if (range > 0.01) { // 1-2% range
                regimes.trending++;
            } else { // < 1% range
                regimes.consolidating++;
            }
        }
        
        const totalPeriods = regimes.trending + regimes.consolidating + regimes.volatile;
        
        return {
            periods: regimes,
            percentages: {
                trending: (regimes.trending / totalPeriods * 100).toFixed(1),
                consolidating: (regimes.consolidating / totalPeriods * 100).toFixed(1),
                volatile: (regimes.volatile / totalPeriods * 100).toFixed(1)
            },
            dominantRegime: Object.keys(regimes).reduce((a, b) => regimes[a] > regimes[b] ? a : b)
        };
    }

    /**
     * GENERATE SMART RECOMMENDATIONS based on analysis
     */
    generateSmartRecommendations(parameterTests, signalAnalysis, regimeAnalysis) {
        const bestParams = parameterTests[0];
        
        if (!bestParams || bestParams.totalSignals === 0) {
            return {
                issue: 'ZERO_SIGNALS',
                reason: 'Current parameters are too restrictive - no signals generated',
                suggestions: [
                    'Widen RSI thresholds (try 25/75 instead of 34/65)',
                    'Increase VWAP threshold (try 0.5% instead of 0.2%)',
                    'Consider using different timeframes (5min instead of 1min)',
                    'Add volume confirmation instead of strict price/VWAP rules'
                ]
            };
        }
        
        const recommendations = {
            optimalParameters: {
                rsi: bestParams.parameters.rsi,
                vwapThreshold: bestParams.parameters.vwapThreshold,
                expectedSignalsPerDay: bestParams.signalsPerDay
            },
            marketInsights: {
                dominantRegime: regimeAnalysis.dominantRegime,
                bestTradingHours: this.findBestTradingHours(signalAnalysis.hourlySignalDistribution),
                signalQuality: this.assessSignalQuality(bestParams.signalsPerDay)
            },
            strategyAdjustments: {
                riskManagement: this.adjustRiskForSignalFrequency(bestParams.signalsPerDay),
                positionSizing: this.recommendPositionSizing(bestParams.signalsPerDay),
                timeFilters: this.recommendTimeFilters(signalAnalysis.hourlySignalDistribution)
            }
        };
        
        return recommendations;
    }

    // Helper calculation methods
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
        if (!prices.length || !volumes.length || prices.length !== volumes.length) return null;
        
        let sumPV = 0, sumV = 0;
        for (let i = 0; i < prices.length; i++) {
            sumPV += prices[i] * volumes[i];
            sumV += volumes[i];
        }
        
        return sumV > 0 ? sumPV / sumV : null;
    }

    calculateEMA(prices, period) {
        if (prices.length < period) return null;
        const multiplier = 2 / (period + 1);
        let ema = prices[0];
        
        for (let i = 1; i < prices.length; i++) {
            ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
        }
        
        return ema;
    }

    countTradingDays(data) {
        const days = new Set();
        data.forEach(bar => {
            days.add(new Date(bar.timestamp).toDateString());
        });
        return days.size;
    }

    findBestTradingHours(hourlyDist) {
        return Object.entries(hourlyDist)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 3)
            .map(([hour,]) => `${hour}:00`);
    }

    assessSignalQuality(signalsPerDay) {
        if (signalsPerDay === 0) return 'NO_SIGNALS';
        if (signalsPerDay < 1) return 'TOO_FEW';
        if (signalsPerDay <= 3) return 'OPTIMAL';
        if (signalsPerDay <= 8) return 'ACCEPTABLE';
        return 'TOO_MANY';
    }

    adjustRiskForSignalFrequency(signalsPerDay) {
        if (signalsPerDay <= 1) return { maxRisk: 0.05, reasoning: 'Few signals = higher risk per trade' };
        if (signalsPerDay <= 3) return { maxRisk: 0.03, reasoning: 'Balanced signal frequency' };
        return { maxRisk: 0.02, reasoning: 'Many signals = lower risk per trade' };
    }

    recommendPositionSizing(signalsPerDay) {
        const baseSize = 1;
        if (signalsPerDay <= 1) return { contracts: baseSize * 2, reasoning: 'Concentrate on few signals' };
        if (signalsPerDay <= 3) return { contracts: baseSize, reasoning: 'Standard sizing' };
        return { contracts: Math.max(1, Math.floor(baseSize / 2)), reasoning: 'Scale down for frequent signals' };
    }

    recommendTimeFilters(hourlyDist) {
        const activeHours = Object.entries(hourlyDist)
            .filter(([, signals]) => signals > 0)
            .map(([hour,]) => hour);
        
        return {
            tradingHours: activeHours.length > 0 ? activeHours : ['10', '11', '14', '15'],
            avoidHours: ['11', '12', '13'], // Lunch doldrums
            reasoning: 'Focus on hours with historical signal activity'
        };
    }
}

module.exports = EnhancedIWMAnalyzer;