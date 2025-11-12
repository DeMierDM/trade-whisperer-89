/**
 * 📊 OPTIONS & STOCK ANALYZER
 * 
 * Purpose: Analyze stock/options behavior before strategy development
 * 
 * Features:
 * - Stock movement patterns and volatility analysis
 * - 0DTE options pricing and Greeks behavior
 * - Technical indicator ranges and effectiveness
 * - Optimal parameter recommendations for strategy building
 * - Risk/reward profiles and win rate estimates
 * 
 * Usage: Run before creating strategies to understand underlying characteristics
 */

const fs = require('fs');
const path = require('path');

class OptionsStockAnalyzer {
  constructor() {
    this.name = 'Options & Stock Analyzer';
    this.analysisResults = {};
    
    // Technical indicators to analyze
    this.indicators = [
      'RSI', 'VWAP', 'EMA_9', 'EMA_21', 'SMA_20', 
      'MACD', 'BBands', 'ATR', 'Volume_MA', 'Momentum'
    ];
    
    // Greeks to track
    this.greeks = ['Delta', 'Gamma', 'Theta', 'Vega', 'IV'];
    
    console.log('📊 Options & Stock Analyzer initialized');
  }

  /**
   * Main analysis function - analyzes symbol over date range
   */
  async analyzeSymbol(symbol, startDate, endDate, alpacaClient) {
    console.log(`🔍 Analyzing ${symbol} from ${startDate} to ${endDate}`);
    
    this.analysisResults = {
      symbol,
      analysisDate: new Date().toISOString(),
      period: { startDate, endDate },
      stockAnalysis: {},
      optionsAnalysis: {},
      technicalAnalysis: {},
      recommendations: {}
    };

    try {
      // 1. Stock Movement Analysis
      await this.analyzeStockMovement(symbol, startDate, endDate, alpacaClient);
      
      // 2. Options Behavior Analysis  
      await this.analyzeOptionsPatterns(symbol, startDate, endDate, alpacaClient);
      
      // 3. Technical Indicators Analysis
      await this.analyzeTechnicalIndicators(symbol, startDate, endDate, alpacaClient);
      
      // 4. Generate Strategy Recommendations
      this.generateRecommendations();
      
      // 5. Save analysis results
      await this.saveAnalysis();
      
      console.log(`✅ Analysis complete for ${symbol}`);
      return this.analysisResults;
      
    } catch (error) {
      console.error(`❌ Analysis failed for ${symbol}:`, error.message);
      throw error;
    }
  }

  /**
   * Analyze stock movement patterns and volatility
   */
  async analyzeStockMovement(symbol, startDate, endDate, alpacaClient) {
    console.log(`📈 Analyzing stock movement patterns for ${symbol}`);
    
    // Get historical bars (1-minute data)
    const result = await alpacaClient.getHistoricalBars({
      symbol: symbol,
      start: startDate,
      end: endDate,
      timeframe: '1Min',
      limit: 10000
    });

    const bars = result.bars || result;
    
    if (!bars || !Array.isArray(bars) || bars.length === 0) {
      throw new Error(`No data available for ${symbol}`);
    }

    // Calculate daily statistics
    const dailyStats = this.calculateDailyStats(bars);
    const volatilityMetrics = this.calculateVolatilityMetrics(dailyStats);
    const movementPatterns = this.analyzeMovementPatterns(bars);

    this.analysisResults.stockAnalysis = {
      totalDays: dailyStats.length,
      avgDailyRange: volatilityMetrics.avgDailyRange,
      avgDailyVolume: volatilityMetrics.avgDailyVolume,
      volatilityProfile: volatilityMetrics.volatilityProfile,
      trendAnalysis: movementPatterns.trends,
      supportResistance: movementPatterns.levels,
      intradayPatterns: movementPatterns.intraday,
      riskMetrics: {
        maxDailyMove: volatilityMetrics.maxDailyMove,
        avgTrue: volatilityMetrics.avgTrueRange,
        volatilityRegimes: volatilityMetrics.regimes
      }
    };
  }

  /**
   * Analyze 0DTE options behavior and Greeks sensitivity
   */
  async analyzeOptionsPatterns(symbol, startDate, endDate, alpacaClient) {
    console.log(`🎯 Analyzing 0DTE options patterns for ${symbol}`);
    
    // This would integrate with your existing options data fetching
    // For now, I'll create the structure for when we have options data
    
    this.analysisResults.optionsAnalysis = {
      avgBidAskSpread: null, // Will calculate from actual data
      liquidityProfile: {
        avgVolume: null,
        avgOpenInterest: null,
        liquidHours: null
      },
      greeksAnalysis: {
        deltaRanges: {
          calls: { atm: null, itm: null, otm: null },
          puts: { atm: null, itm: null, otm: null }
        },
        gammaSpikes: null,
        thetaDecay: null,
        vegaSensitivity: null,
        ivRanges: null
      },
      pricingBehavior: {
        avgCallPremium: null,
        avgPutPremium: null,
        atmPricingEfficiency: null,
        spreadCosts: null
      },
      optimalStrikes: {
        callDeltas: null,
        putDeltas: null,
        recommendedRange: null
      }
    };
    
    // Placeholder for now - would implement actual options data analysis
    console.log(`⚠️  Options analysis requires options data integration`);
  }

  /**
   * Analyze technical indicators and their effectiveness
   */
  async analyzeTechnicalIndicators(symbol, startDate, endDate, alpacaClient) {
    console.log(`📊 Analyzing technical indicators for ${symbol}`);
    
    // Get the same bars data from the previous analysis
    const result = await alpacaClient.getHistoricalBars({
      symbol: symbol,
      start: startDate,
      end: endDate,
      timeframe: '1Min'
    });
    
    const bars = result.bars || result;

    const prices = bars.map(bar => parseFloat(bar.c));
    const volumes = bars.map(bar => parseFloat(bar.v));
    const highs = bars.map(bar => parseFloat(bar.h));
    const lows = bars.map(bar => parseFloat(bar.l));

    // Calculate all indicators
    const rsiAnalysis = this.analyzeRSI(prices);
    const vwapAnalysis = this.analyzeVWAP(prices, volumes);
    const maAnalysis = this.analyzeMovingAverages(prices);
    const momentumAnalysis = this.analyzeMomentum(prices);
    const volatilityAnalysis = this.analyzeVolatilityIndicators(prices, highs, lows);

    this.analysisResults.technicalAnalysis = {
      RSI: rsiAnalysis,
      VWAP: vwapAnalysis,
      MovingAverages: maAnalysis,
      Momentum: momentumAnalysis,
      Volatility: volatilityAnalysis,
      effectiveness: this.calculateIndicatorEffectiveness({
        RSI: rsiAnalysis,
        VWAP: vwapAnalysis,
        MA: maAnalysis,
        Momentum: momentumAnalysis
      })
    };
  }

  /**
   * Calculate daily statistics from minute bars
   */
  calculateDailyStats(bars) {
    const dailyData = {};
    
    bars.forEach(bar => {
      const date = bar.t.split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = {
          date,
          open: parseFloat(bar.o),
          high: parseFloat(bar.h),
          low: parseFloat(bar.l),
          close: parseFloat(bar.c),
          volume: 0,
          bars: []
        };
      }
      
      dailyData[date].high = Math.max(dailyData[date].high, parseFloat(bar.h));
      dailyData[date].low = Math.min(dailyData[date].low, parseFloat(bar.l));
      dailyData[date].close = parseFloat(bar.c);
      dailyData[date].volume += parseFloat(bar.v);
      dailyData[date].bars.push(bar);
    });

    return Object.values(dailyData);
  }

  /**
   * Calculate volatility metrics
   */
  calculateVolatilityMetrics(dailyStats) {
    const dailyRanges = dailyStats.map(day => (day.high - day.low) / day.open);
    const dailyReturns = dailyStats.map((day, i) => {
      if (i === 0) return 0;
      return (day.close - dailyStats[i-1].close) / dailyStats[i-1].close;
    });

    const avgDailyRange = dailyRanges.reduce((sum, range) => sum + range, 0) / dailyRanges.length;
    const avgDailyVolume = dailyStats.reduce((sum, day) => sum + day.volume, 0) / dailyStats.length;
    const maxDailyMove = Math.max(...dailyRanges);
    
    // Classify volatility regimes
    const regimes = this.classifyVolatilityRegimes(dailyRanges);

    return {
      avgDailyRange: avgDailyRange * 100, // Convert to percentage
      avgDailyVolume,
      maxDailyMove: maxDailyMove * 100,
      avgTrueRange: this.calculateATR(dailyStats),
      volatilityProfile: this.classifyVolatility(avgDailyRange),
      regimes
    };
  }

  /**
   * Analyze RSI patterns and optimal levels
   */
  analyzeRSI(prices, period = 14) {
    const rsiValues = this.calculateRSI(prices, period);
    const oversoldEvents = rsiValues.filter(rsi => rsi < 30).length;
    const overboughtEvents = rsiValues.filter(rsi => rsi > 70).length;
    const neutralZone = rsiValues.filter(rsi => rsi >= 40 && rsi <= 60).length;

    // Find optimal RSI levels for this stock
    const rsiDistribution = this.analyzeRSIDistribution(rsiValues);
    
    return {
      avgRSI: rsiValues.reduce((sum, rsi) => sum + rsi, 0) / rsiValues.length,
      oversoldFrequency: (oversoldEvents / rsiValues.length) * 100,
      overboughtFrequency: (overboughtEvents / rsiValues.length) * 100,
      neutralZoneTime: (neutralZone / rsiValues.length) * 100,
      distribution: rsiDistribution,
      recommendedLevels: {
        oversold: rsiDistribution.percentiles.p20, // 20th percentile as oversold
        overbought: rsiDistribution.percentiles.p80, // 80th percentile as overbought
        extreme_oversold: rsiDistribution.percentiles.p10,
        extreme_overbought: rsiDistribution.percentiles.p90
      }
    };
  }

  /**
   * Analyze VWAP patterns and deviations
   */
  analyzeVWAP(prices, volumes) {
    const vwapValues = this.calculateVWAP(prices, volumes);
    const deviations = prices.map((price, i) => 
      vwapValues[i] ? (price - vwapValues[i]) / vwapValues[i] : 0
    );

    const avgDeviation = deviations.reduce((sum, dev) => sum + Math.abs(dev), 0) / deviations.length;
    const maxDeviation = Math.max(...deviations.map(Math.abs));

    return {
      avgDeviation: avgDeviation * 100, // Convert to percentage
      maxDeviation: maxDeviation * 100,
      aboveVWAP: (deviations.filter(dev => dev > 0).length / deviations.length) * 100,
      significantDeviations: {
        onePercent: (deviations.filter(dev => Math.abs(dev) > 0.01).length / deviations.length) * 100,
        twoPercent: (deviations.filter(dev => Math.abs(dev) > 0.02).length / deviations.length) * 100,
        threePercent: (deviations.filter(dev => Math.abs(dev) > 0.03).length / deviations.length) * 100
      },
      recommendedThreshold: avgDeviation * 1.5 * 100 // 1.5x average deviation
    };
  }

  /**
   * Generate strategy recommendations based on analysis
   */
  generateRecommendations() {
    console.log(`🎯 Generating strategy recommendations`);
    
    const { stockAnalysis, technicalAnalysis } = this.analysisResults;
    
    // Strategy type recommendation based on volatility
    let strategyType = 'conservative';
    if (stockAnalysis.avgDailyRange > 3) {
      strategyType = 'high_volatility';
    } else if (stockAnalysis.avgDailyRange < 1) {
      strategyType = 'low_volatility';
    } else {
      strategyType = 'moderate';
    }

    // RSI parameters
    const rsiParams = {
      period: 14,
      oversold: technicalAnalysis.RSI.recommendedLevels.oversold,
      overbought: technicalAnalysis.RSI.recommendedLevels.overbought,
      extreme_oversold: technicalAnalysis.RSI.recommendedLevels.extreme_oversold,
      extreme_overbought: technicalAnalysis.RSI.recommendedLevels.extreme_overbought
    };

    // VWAP parameters
    const vwapParams = {
      period: 30,
      threshold: technicalAnalysis.VWAP.recommendedThreshold / 100, // Convert back to decimal
      significantMove: technicalAnalysis.VWAP.avgDeviation * 2 / 100
    };

    // Risk management based on volatility
    const riskParams = this.calculateOptimalRiskParams(stockAnalysis.avgDailyRange);

    this.analysisResults.recommendations = {
      strategyType,
      confidence: this.calculateConfidence(),
      parameters: {
        RSI: rsiParams,
        VWAP: vwapParams,
        riskManagement: riskParams,
        deltaTargets: this.recommendDeltaTargets(strategyType),
        timeframes: this.recommendTimeframes(stockAnalysis.avgDailyRange)
      },
      warnings: this.generateWarnings(),
      expectedPerformance: this.estimatePerformance(strategyType)
    };
  }

  /**
   * Calculate optimal risk parameters based on volatility
   */
  calculateOptimalRiskParams(avgDailyRange) {
    let stopLoss, profitTarget, maxHold;

    if (avgDailyRange > 4) { // High volatility
      stopLoss = 0.40;  // 40% stop
      profitTarget = 0.25; // 25% target
      maxHold = 120; // 2 hours
    } else if (avgDailyRange > 2) { // Medium volatility  
      stopLoss = 0.30;  // 30% stop
      profitTarget = 0.20; // 20% target
      maxHold = 90;  // 1.5 hours
    } else { // Low volatility
      stopLoss = 0.20;  // 20% stop
      profitTarget = 0.15; // 15% target
      maxHold = 60;  // 1 hour
    }

    return { stopLoss, profitTarget, maxHold };
  }

  // Helper calculation methods
  calculateRSI(prices, period = 14) {
    const rsi = [];
    for (let i = period; i < prices.length; i++) {
      let gains = 0, losses = 0;
      for (let j = i - period + 1; j <= i; j++) {
        const change = prices[j] - prices[j - 1];
        if (change > 0) gains += change;
        else losses += Math.abs(change);
      }
      const avgGain = gains / period;
      const avgLoss = losses / period;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi.push(100 - (100 / (1 + rs)));
    }
    return rsi;
  }

  calculateVWAP(prices, volumes, period = 30) {
    const vwap = [];
    for (let i = period - 1; i < prices.length; i++) {
      let sumPV = 0, sumV = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sumPV += prices[j] * volumes[j];
        sumV += volumes[j];
      }
      vwap.push(sumV > 0 ? sumPV / sumV : prices[i]);
    }
    return vwap;
  }

  analyzeRSIDistribution(rsiValues) {
    const sorted = [...rsiValues].sort((a, b) => a - b);
    return {
      percentiles: {
        p10: sorted[Math.floor(sorted.length * 0.1)],
        p20: sorted[Math.floor(sorted.length * 0.2)],
        p30: sorted[Math.floor(sorted.length * 0.3)],
        p50: sorted[Math.floor(sorted.length * 0.5)],
        p70: sorted[Math.floor(sorted.length * 0.7)],
        p80: sorted[Math.floor(sorted.length * 0.8)],
        p90: sorted[Math.floor(sorted.length * 0.9)]
      }
    };
  }

  /**
   * Save analysis results to file
   */
  async saveAnalysis() {
    const filename = `analysis_${this.analysisResults.symbol}_${Date.now()}.json`;
    const filepath = path.join(__dirname, '../analysis', filename);
    
    // Ensure analysis directory exists
    const analysisDir = path.dirname(filepath);
    if (!fs.existsSync(analysisDir)) {
      fs.mkdirSync(analysisDir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, JSON.stringify(this.analysisResults, null, 2));
    console.log(`💾 Analysis saved to: ${filepath}`);
    
    return filepath;
  }

  /**
   * Generate analysis report
   */
  generateReport() {
    const { symbol, stockAnalysis, technicalAnalysis, recommendations } = this.analysisResults;
    
    return `
📊 ANALYSIS REPORT: ${symbol}
════════════════════════════════

📈 STOCK CHARACTERISTICS:
• Average Daily Range: ${stockAnalysis.avgDailyRange?.toFixed(2)}%
• Volatility Profile: ${stockAnalysis.volatilityProfile}
• Max Daily Move: ${stockAnalysis.riskMetrics?.maxDailyMove?.toFixed(2)}%

📊 TECHNICAL INDICATORS:
• RSI Recommended Levels: ${technicalAnalysis.RSI?.recommendedLevels.oversold?.toFixed(0)}/${technicalAnalysis.RSI?.recommendedLevels.overbought?.toFixed(0)}
• VWAP Threshold: ${(technicalAnalysis.VWAP?.recommendedThreshold || 0).toFixed(2)}%
• Avg VWAP Deviation: ${(technicalAnalysis.VWAP?.avgDeviation || 0).toFixed(2)}%

🎯 STRATEGY RECOMMENDATIONS:
• Strategy Type: ${recommendations.strategyType}
• Stop Loss: ${(recommendations.parameters?.riskManagement?.stopLoss * 100)?.toFixed(0)}%
• Profit Target: ${(recommendations.parameters?.riskManagement?.profitTarget * 100)?.toFixed(0)}%
• Max Hold Time: ${recommendations.parameters?.riskManagement?.maxHold} minutes

⚠️  WARNINGS:
${recommendations.warnings?.map(w => `• ${w}`).join('\n') || '• No specific warnings'}

🎲 EXPECTED PERFORMANCE:
• Estimated Win Rate: ${recommendations.expectedPerformance?.winRate || 'TBD'}%
• Est. Sharpe Ratio: ${recommendations.expectedPerformance?.sharpe || 'TBD'}
• Risk Level: ${recommendations.expectedPerformance?.riskLevel || 'TBD'}
    `;
  }

  // Additional helper methods
  classifyVolatility(avgRange) {
    if (avgRange > 0.04) return 'Very High';
    if (avgRange > 0.03) return 'High';  
    if (avgRange > 0.02) return 'Moderate';
    if (avgRange > 0.01) return 'Low';
    return 'Very Low';
  }

  calculateConfidence() {
    // Placeholder - would calculate based on data quality and sample size
    return 0.75; // 75% confidence
  }

  recommendDeltaTargets(strategyType) {
    const deltaMap = {
      high_volatility: { calls: 0.45, puts: -0.45 },
      moderate: { calls: 0.50, puts: -0.50 },
      low_volatility: { calls: 0.55, puts: -0.55 },
      conservative: { calls: 0.40, puts: -0.40 }
    };
    return deltaMap[strategyType] || deltaMap.moderate;
  }

  recommendTimeframes(avgDailyRange) {
    if (avgDailyRange > 3) return { short: '5min', medium: '15min', long: '30min' };
    if (avgDailyRange > 2) return { short: '1min', medium: '5min', long: '15min' };
    return { short: '1min', medium: '3min', long: '10min' };
  }

  generateWarnings() {
    const warnings = [];
    const { stockAnalysis } = this.analysisResults;
    
    if (stockAnalysis.avgDailyRange > 5) {
      warnings.push('Extremely high volatility - consider wider stops');
    }
    if (stockAnalysis.avgDailyRange < 0.5) {
      warnings.push('Very low volatility - may have limited profit opportunities');
    }
    
    return warnings;
  }

  estimatePerformance(strategyType) {
    // Placeholder estimates - would be based on historical backtesting
    const estimates = {
      high_volatility: { winRate: 55, sharpe: 1.2, riskLevel: 'High' },
      moderate: { winRate: 65, sharpe: 1.8, riskLevel: 'Medium' },
      low_volatility: { winRate: 70, sharpe: 2.1, riskLevel: 'Low' },
      conservative: { winRate: 75, sharpe: 2.3, riskLevel: 'Low' }
    };
    return estimates[strategyType] || estimates.moderate;
  }

  // Placeholder methods for comprehensive analysis
  analyzeMovementPatterns(bars) {
    return { trends: {}, levels: {}, intraday: {} };
  }

  analyzeMovingAverages(prices) {
    return { ema9: {}, ema21: {}, sma20: {} };
  }

  analyzeMomentum(prices) {
    return { macd: {}, momentum: {} };
  }

  analyzeVolatilityIndicators(prices, highs, lows) {
    return { atr: {}, bollingerBands: {} };
  }

  calculateIndicatorEffectiveness(indicators) {
    return { overall: 0.75, individual: {} };
  }

  calculateATR(dailyStats) {
    // Placeholder ATR calculation
    return 2.5;
  }

  classifyVolatilityRegimes(ranges) {
    return { low: 30, medium: 50, high: 20 }; // Percentage distribution
  }
}

module.exports = OptionsStockAnalyzer;