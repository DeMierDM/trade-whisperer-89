#!/usr/bin/env node

/**
 * SMALL ACCOUNT STRATEGY LONGEVITY BACKTESTING FRAMEWORK
 * 
 * This script runs comprehensive backtests for all three small account strategies
 * across multiple time periods to assess longevity and consistent performance.
 * 
 * Testing periods:
 * - Different weeks in 2024 (various market conditions)
 * - Bull market periods vs Bear market periods 
 * - High volatility vs Low volatility periods
 * - Trending vs Sideways market conditions
 * 
 * Performance metrics tracked:
 * - Win Rate consistency across periods
 * - Profit Factor stability
 * - Maximum Drawdown in different conditions
 * - Strategy longevity and adaptation
 */

const BacktestEngine = require('./engine/backtest-engine');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Import small account strategies
const SmallAccountRSIVWAPStrategy = require('./strategies/small-account-rsi-vwap');
const SmallAccountMomentumStrategy = require('./strategies/small-account-momentum');
const SmallAccountIVMeanReversionStrategy = require('./strategies/small-account-iv-mean-reversion');

class SmallAccountLongevityTester {
  constructor() {
    // Database connection
    this.db = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5433,
      database: process.env.DB_NAME || 'trading_system',
      user: process.env.DB_USER || 'trader',
      password: process.env.DB_PASSWORD || 'trader_password'
    });

    // Initialize backtest engine
    this.engine = new BacktestEngine(this.db);
    
    // Test configuration
    this.testConfig = {
      symbol: 'SPY',
      initialCapital: 1000,
      testPeriods: [
        // Q1 2024 - Mixed conditions
        { name: 'Q1_2024_Mixed', start: '2024-01-02', end: '2024-03-29', description: 'Q1 Mixed Market Conditions' },
        
        // Bull run periods
        { name: 'Feb_2024_Bull', start: '2024-02-01', end: '2024-02-29', description: 'February Bull Run' },
        { name: 'May_2024_Bull', start: '2024-05-01', end: '2024-05-31', description: 'May Bullish Period' },
        
        // Volatile periods  
        { name: 'Mar_2024_Volatile', start: '2024-03-01', end: '2024-03-29', description: 'March High Volatility' },
        { name: 'Jul_2024_Volatile', start: '2024-07-01', end: '2024-07-31', description: 'July Volatility Spike' },
        
        // Sideways/Consolidation periods
        { name: 'Jun_2024_Sideways', start: '2024-06-01', end: '2024-06-28', description: 'June Sideways Market' },
        { name: 'Aug_2024_Consolidation', start: '2024-08-01', end: '2024-08-30', description: 'August Consolidation' },
        
        // Bear/Correction periods
        { name: 'Apr_2024_Correction', start: '2024-04-01', end: '2024-04-30', description: 'April Correction' },
        { name: 'Sep_2024_Pullback', start: '2024-09-01', end: '2024-09-30', description: 'September Pullback' },
        
        // Recent periods for validation
        { name: 'Oct_2024_Recent', start: '2024-10-01', end: '2024-10-31', description: 'October Recent Performance' },
        { name: 'Nov_2024_Current', start: '2024-11-01', end: '2024-11-08', description: 'November Current Week' }
      ]
    };

    // Strategy configurations
    this.strategies = {
      'conservative-rsi-vwap': {
        class: SmallAccountRSIVWAPStrategy,
        name: 'Conservative RSI-VWAP Growth',
        expectedWinRate: 0.70,
        expectedReturn: 0.35,
        riskLevel: 'Low'
      },
      'aggressive-momentum': {
        class: SmallAccountMomentumStrategy,  
        name: 'Aggressive Momentum Breakout',
        expectedWinRate: 0.50,
        expectedReturn: 0.60,
        riskLevel: 'Medium-High'
      },
      'selective-iv-reversion': {
        class: SmallAccountIVMeanReversionStrategy,
        name: 'Selective IV Mean Reversion',
        expectedWinRate: 0.80,
        expectedReturn: 0.25,
        riskLevel: 'Low-Medium'
      }
    };

    // Results storage
    this.results = {
      summary: {},
      detailed: [],
      longevityAnalysis: {},
      recommendations: []
    };
  }

  /**
   * Run comprehensive longevity tests for all strategies
   */
  async runLongevityTests() {
    console.log('\n🚀 SMALL ACCOUNT STRATEGY LONGEVITY TESTING');
    console.log('============================================\n');

    try {
      // Test each strategy across all periods
      for (const [strategyKey, strategyInfo] of Object.entries(this.strategies)) {
        console.log(`\n📊 Testing Strategy: ${strategyInfo.name}`);
        console.log(`   Expected Win Rate: ${(strategyInfo.expectedWinRate * 100).toFixed(0)}%`);
        console.log(`   Expected Return: ${(strategyInfo.expectedReturn * 100).toFixed(0)}%`);
        console.log(`   Risk Level: ${strategyInfo.riskLevel}\n`);

        const strategyResults = await this.testStrategyLongevity(strategyKey, strategyInfo);
        this.results.detailed.push(strategyResults);
      }

      // Analyze longevity patterns
      await this.analyzeLongevity();

      // Generate comprehensive report
      await this.generateLongevityReport();

    } catch (error) {
      console.error('❌ Error in longevity testing:', error);
      throw error;
    }
  }

  /**
   * Test a single strategy across all time periods
   */
  async testStrategyLongevity(strategyKey, strategyInfo) {
    const results = {
      strategy: strategyKey,
      name: strategyInfo.name,
      periods: [],
      averageMetrics: {},
      consistencyScore: 0,
      longevityGrade: 'F'
    };

    for (const period of this.testConfig.testPeriods) {
      console.log(`   🗓️ Testing period: ${period.description} (${period.start} to ${period.end})`);
      
      try {
        // Create strategy instance
        const strategy = new strategyInfo.class({
          accountSize: this.testConfig.initialCapital,
          settledCash: this.testConfig.initialCapital
        });

        // Run backtest for this period
        const backtestResult = await this.engine.runBacktest({
          strategy: strategy,
          symbol: this.testConfig.symbol,
          startDate: period.start,
          endDate: period.end,
          initialCapital: this.testConfig.initialCapital,
          userId: 'longevity_test'
        });

        // Calculate period-specific metrics
        const periodMetrics = await this.calculatePeriodMetrics(backtestResult, strategyInfo);
        
        results.periods.push({
          period: period.name,
          description: period.description,
          dateRange: `${period.start} to ${period.end}`,
          metrics: periodMetrics,
          marketCondition: this.classifyMarketCondition(period)
        });

        console.log(`      Win Rate: ${periodMetrics.winRate.toFixed(1)}% | P&L: ${periodMetrics.totalReturn >= 0 ? '+' : ''}${periodMetrics.totalReturn.toFixed(1)}% | Trades: ${periodMetrics.totalTrades}`);

      } catch (error) {
        console.error(`      ❌ Error testing period ${period.name}:`, error.message);
        results.periods.push({
          period: period.name,
          description: period.description,
          dateRange: `${period.start} to ${period.end}`,
          error: error.message,
          marketCondition: this.classifyMarketCondition(period)
        });
      }

      // Add delay to avoid overwhelming the system
      await this.sleep(1000);
    }

    // Calculate average metrics across all successful periods
    results.averageMetrics = this.calculateAverageMetrics(results.periods);
    results.consistencyScore = this.calculateConsistencyScore(results.periods, strategyInfo);
    results.longevityGrade = this.assignLongevityGrade(results.consistencyScore, results.averageMetrics);

    return results;
  }

  /**
   * Calculate metrics for a single backtest period
   */
  async calculatePeriodMetrics(backtestResult, strategyInfo) {
    const trades = backtestResult.trades || [];
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    
    const totalPnL = trades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winRate = trades.length > 0 ? (winningTrades.length / trades.length) : 0;
    
    const totalReturn = (backtestResult.finalValue - backtestResult.initialValue) / backtestResult.initialValue;
    
    const profitFactor = losingTrades.length > 0 ? 
      winningTrades.reduce((sum, t) => sum + t.pnl, 0) / Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0)) : 
      winningTrades.length > 0 ? 999 : 0;

    // Calculate max drawdown (simplified)
    let maxDrawdown = 0;
    let peak = backtestResult.initialValue;
    if (backtestResult.equityCurve) {
      for (const point of backtestResult.equityCurve) {
        peak = Math.max(peak, point.value);
        const drawdown = (peak - point.value) / peak;
        maxDrawdown = Math.max(maxDrawdown, drawdown);
      }
    }

    return {
      totalTrades: trades.length,
      winRate: winRate * 100,
      totalReturn: totalReturn * 100,
      profitFactor: profitFactor,
      maxDrawdown: maxDrawdown * 100,
      avgWin: winningTrades.length > 0 ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length : 0,
      avgLoss: losingTrades.length > 0 ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length : 0,
      finalValue: backtestResult.finalValue || backtestResult.initialValue,
      expectancyDeviation: Math.abs(winRate - strategyInfo.expectedWinRate) * 100,
      returnDeviation: Math.abs(totalReturn - strategyInfo.expectedReturn) * 100
    };
  }

  /**
   * Classify market condition for a given period
   */
  classifyMarketCondition(period) {
    // Simple classification based on period names and dates
    if (period.name.includes('Bull') || period.name.includes('May')) return 'Bullish';
    if (period.name.includes('Volatile') || period.name.includes('Mar') || period.name.includes('Jul')) return 'High Volatility';
    if (period.name.includes('Sideways') || period.name.includes('Consolidation')) return 'Sideways';
    if (period.name.includes('Correction') || period.name.includes('Pullback')) return 'Bearish';
    if (period.name.includes('Q1') || period.name.includes('Recent')) return 'Mixed';
    return 'Unknown';
  }

  /**
   * Calculate average metrics across all periods
   */
  calculateAverageMetrics(periods) {
    const validPeriods = periods.filter(p => p.metrics && !p.error);
    if (validPeriods.length === 0) return {};

    const metrics = {
      avgWinRate: 0,
      avgReturn: 0,
      avgProfitFactor: 0,
      avgMaxDrawdown: 0,
      totalTrades: 0,
      successfulPeriods: validPeriods.length,
      totalPeriods: periods.length
    };

    for (const period of validPeriods) {
      metrics.avgWinRate += period.metrics.winRate;
      metrics.avgReturn += period.metrics.totalReturn;
      metrics.avgProfitFactor += period.metrics.profitFactor;
      metrics.avgMaxDrawdown += period.metrics.maxDrawdown;
      metrics.totalTrades += period.metrics.totalTrades;
    }

    metrics.avgWinRate /= validPeriods.length;
    metrics.avgReturn /= validPeriods.length;
    metrics.avgProfitFactor /= validPeriods.length;
    metrics.avgMaxDrawdown /= validPeriods.length;

    return metrics;
  }

  /**
   * Calculate consistency score (0-100)
   */
  calculateConsistencyScore(periods, strategyInfo) {
    const validPeriods = periods.filter(p => p.metrics && !p.error);
    if (validPeriods.length === 0) return 0;

    let consistencyScore = 50; // Base score

    // Win rate consistency (30 points max)
    const winRates = validPeriods.map(p => p.metrics.winRate);
    const winRateStdDev = this.calculateStdDev(winRates);
    const winRateConsistency = Math.max(0, 30 - winRateStdDev);
    consistencyScore += winRateConsistency;

    // Return consistency (20 points max) 
    const returns = validPeriods.map(p => p.metrics.totalReturn);
    const returnStdDev = this.calculateStdDev(returns);
    const returnConsistency = Math.max(0, 20 - returnStdDev / 2);
    consistencyScore += returnConsistency;

    // Drawdown control (20 points max)
    const maxDrawdowns = validPeriods.map(p => p.metrics.maxDrawdown);
    const avgDrawdown = maxDrawdowns.reduce((sum, dd) => sum + dd, 0) / maxDrawdowns.length;
    const drawdownScore = Math.max(0, 20 - avgDrawdown);
    consistencyScore += drawdownScore;

    // Success rate across periods (30 points max)
    const successRate = validPeriods.length / periods.length;
    consistencyScore += successRate * 30;

    return Math.min(100, Math.max(0, consistencyScore));
  }

  /**
   * Assign longevity grade based on consistency score and metrics
   */
  assignLongevityGrade(consistencyScore, averageMetrics) {
    if (consistencyScore >= 90 && averageMetrics.avgWinRate >= 60) return 'A+';
    if (consistencyScore >= 80 && averageMetrics.avgWinRate >= 55) return 'A';
    if (consistencyScore >= 70 && averageMetrics.avgWinRate >= 50) return 'B+';
    if (consistencyScore >= 60 && averageMetrics.avgWinRate >= 45) return 'B';
    if (consistencyScore >= 50 && averageMetrics.avgWinRate >= 40) return 'C+';
    if (consistencyScore >= 40) return 'C';
    if (consistencyScore >= 30) return 'D';
    return 'F';
  }

  /**
   * Analyze longevity patterns across strategies and market conditions
   */
  async analyzeLongevity() {
    console.log('\n📈 ANALYZING LONGEVITY PATTERNS...\n');

    // Group results by market condition
    const conditionAnalysis = {};
    
    for (const strategyResult of this.results.detailed) {
      for (const period of strategyResult.periods) {
        if (!period.metrics) continue;
        
        const condition = period.marketCondition;
        if (!conditionAnalysis[condition]) {
          conditionAnalysis[condition] = {};
        }
        
        if (!conditionAnalysis[condition][strategyResult.strategy]) {
          conditionAnalysis[condition][strategyResult.strategy] = [];
        }
        
        conditionAnalysis[condition][strategyResult.strategy].push(period.metrics);
      }
    }

    // Calculate performance by market condition
    this.results.longevityAnalysis = {
      byCondition: {},
      strategyRankings: {},
      bestStrategy: null,
      mostConsistent: null
    };

    for (const [condition, strategies] of Object.entries(conditionAnalysis)) {
      this.results.longevityAnalysis.byCondition[condition] = {};
      
      for (const [strategy, metrics] of Object.entries(strategies)) {
        const avgWinRate = metrics.reduce((sum, m) => sum + m.winRate, 0) / metrics.length;
        const avgReturn = metrics.reduce((sum, m) => sum + m.totalReturn, 0) / metrics.length;
        const consistency = 100 - this.calculateStdDev(metrics.map(m => m.winRate));
        
        this.results.longevityAnalysis.byCondition[condition][strategy] = {
          avgWinRate,
          avgReturn,
          consistency,
          periods: metrics.length
        };
      }
    }

    // Rank strategies overall
    const overallRankings = this.results.detailed
      .map(s => ({
        strategy: s.strategy,
        name: s.name,
        score: s.consistencyScore,
        avgWinRate: s.averageMetrics.avgWinRate,
        avgReturn: s.averageMetrics.avgReturn,
        grade: s.longevityGrade
      }))
      .sort((a, b) => b.score - a.score);

    this.results.longevityAnalysis.strategyRankings = overallRankings;
    this.results.longevityAnalysis.bestStrategy = overallRankings[0];
    this.results.longevityAnalysis.mostConsistent = overallRankings
      .reduce((prev, curr) => prev.score > curr.score ? prev : curr);
  }

  /**
   * Generate comprehensive longevity report
   */
  async generateLongevityReport() {
    console.log('\n📝 GENERATING LONGEVITY REPORT...\n');

    const report = this.buildLongevityReport();
    
    // Save report to file
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const filename = `small-account-longevity-report-${timestamp}.md`;
    const filepath = path.join(__dirname, 'reports', filename);
    
    // Ensure reports directory exists
    const reportsDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, report);
    
    console.log(`✅ Longevity report saved to: ${filepath}`);
    console.log('\n' + report);
    
    return report;
  }

  /**
   * Build comprehensive longevity report
   */
  buildLongevityReport() {
    const bestStrategy = this.results.longevityAnalysis.bestStrategy;
    const rankings = this.results.longevityAnalysis.strategyRankings;
    
    return `# SMALL ACCOUNT STRATEGY LONGEVITY ANALYSIS REPORT
Generated: ${new Date().toISOString()}

## 🏆 EXECUTIVE SUMMARY

**Best Overall Strategy**: ${bestStrategy?.name || 'None'}
- **Longevity Grade**: ${bestStrategy?.grade || 'N/A'}
- **Consistency Score**: ${bestStrategy?.score?.toFixed(1) || 'N/A'}/100
- **Average Win Rate**: ${bestStrategy?.avgWinRate?.toFixed(1) || 'N/A'}%
- **Average Return**: ${bestStrategy?.avgReturn?.toFixed(1) || 'N/A'}%

## 📊 STRATEGY RANKINGS

${rankings.map((strategy, index) => 
  `${index + 1}. **${strategy.name}**
   - Grade: ${strategy.grade}
   - Consistency: ${strategy.score.toFixed(1)}/100
   - Win Rate: ${strategy.avgWinRate.toFixed(1)}%
   - Avg Return: ${strategy.avgReturn >= 0 ? '+' : ''}${strategy.avgReturn.toFixed(1)}%`
).join('\n\n')}

## 🎯 DETAILED STRATEGY ANALYSIS

${this.results.detailed.map(strategy => this.buildStrategySection(strategy)).join('\n\n')}

## 📈 MARKET CONDITION ANALYSIS

${Object.entries(this.results.longevityAnalysis.byCondition).map(([condition, strategies]) => 
  `### ${condition} Markets
${Object.entries(strategies).map(([name, data]) =>
  `- **${name}**: ${data.avgWinRate.toFixed(1)}% win rate, ${data.avgReturn >= 0 ? '+' : ''}${data.avgReturn.toFixed(1)}% return (${data.periods} periods)`
).join('\n')}`
).join('\n\n')}

## 🎯 LONGEVITY RECOMMENDATIONS

${this.generateRecommendations()}

## 📋 TESTING METHODOLOGY

**Test Periods**: ${this.testConfig.testPeriods.length} different market periods from 2024
**Market Conditions**: Bullish, Bearish, High Volatility, Sideways, Mixed
**Initial Capital**: $${this.testConfig.initialCapital.toLocaleString()}
**Consistency Scoring**: Based on win rate stability, return consistency, drawdown control, and success rate

## 💡 KEY INSIGHTS

${this.generateKeyInsights()}

---
*This report validates the longevity and consistency of small account growth strategies across various market conditions.*`;
  }

  /**
   * Build detailed section for each strategy
   */
  buildStrategySection(strategy) {
    const metrics = strategy.averageMetrics;
    const successRate = (metrics.successfulPeriods / metrics.totalPeriods * 100).toFixed(1);
    
    return `### ${strategy.name} (${strategy.longevityGrade} Grade)

**Consistency Score**: ${strategy.consistencyScore.toFixed(1)}/100
**Success Rate**: ${successRate}% (${metrics.successfulPeriods}/${metrics.totalPeriods} periods)

**Average Performance**:
- Win Rate: ${metrics.avgWinRate?.toFixed(1) || 'N/A'}%
- Return per Period: ${metrics.avgReturn >= 0 ? '+' : ''}${metrics.avgReturn?.toFixed(1) || 'N/A'}%
- Profit Factor: ${metrics.avgProfitFactor?.toFixed(2) || 'N/A'}
- Max Drawdown: ${metrics.avgMaxDrawdown?.toFixed(1) || 'N/A'}%
- Total Trades: ${metrics.totalTrades || 0}

**Period-by-Period Results**:
${strategy.periods.filter(p => p.metrics).map(period => 
  `- **${period.description}** (${period.marketCondition}): ${period.metrics.winRate.toFixed(1)}% WR, ${period.metrics.totalReturn >= 0 ? '+' : ''}${period.metrics.totalReturn.toFixed(1)}% return, ${period.metrics.totalTrades} trades`
).join('\n')}`;
  }

  /**
   * Generate strategic recommendations
   */
  generateRecommendations() {
    const recommendations = [];
    const rankings = this.results.longevityAnalysis.strategyRankings;
    
    if (rankings.length > 0) {
      const topStrategy = rankings[0];
      recommendations.push(`**Primary Recommendation**: Use **${topStrategy.name}** as your main strategy (Grade ${topStrategy.grade}, ${topStrategy.score.toFixed(1)}/100 consistency).`);
      
      if (rankings.length > 1) {
        const secondStrategy = rankings[1];
        recommendations.push(`**Secondary Option**: Consider **${secondStrategy.name}** as alternative (Grade ${secondStrategy.grade}, ${secondStrategy.score.toFixed(1)}/100 consistency).`);
      }
    }

    // Market condition recommendations
    const conditionAnalysis = this.results.longevityAnalysis.byCondition;
    for (const [condition, strategies] of Object.entries(conditionAnalysis)) {
      const bestInCondition = Object.entries(strategies)
        .sort(([,a], [,b]) => b.avgWinRate - a.avgWinRate)[0];
      
      if (bestInCondition) {
        recommendations.push(`**${condition} Markets**: ${bestInCondition[0]} performs best (${bestInCondition[1].avgWinRate.toFixed(1)}% win rate).`);
      }
    }

    return recommendations.join('\n\n');
  }

  /**
   * Generate key insights
   */
  generateKeyInsights() {
    const insights = [];
    const rankings = this.results.longevityAnalysis.strategyRankings;
    
    // Consistency analysis
    const highConsistency = rankings.filter(s => s.score >= 80);
    const mediumConsistency = rankings.filter(s => s.score >= 60 && s.score < 80);
    
    if (highConsistency.length > 0) {
      insights.push(`✅ **${highConsistency.length} strategy(ies)** demonstrate high consistency (80+ score) across different market conditions.`);
    }
    
    if (mediumConsistency.length > 0) {
      insights.push(`⚠️ **${mediumConsistency.length} strategy(ies)** show moderate consistency (60-80 score) - may require parameter optimization.`);
    }

    // Win rate analysis  
    const avgWinRates = rankings.map(s => s.avgWinRate);
    const bestWinRate = Math.max(...avgWinRates);
    const worstWinRate = Math.min(...avgWinRates);
    
    insights.push(`📊 Win rates range from ${worstWinRate.toFixed(1)}% to ${bestWinRate.toFixed(1)}% across strategies and periods.`);

    // Market adaptability
    const conditions = Object.keys(this.results.longevityAnalysis.byCondition);
    insights.push(`🔄 Strategies tested across ${conditions.length} different market conditions: ${conditions.join(', ')}.`);

    return insights.join('\n\n');
  }

  /**
   * Utility functions
   */
  calculateStdDev(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.db) {
      await this.db.end();
    }
  }
}

// Main execution
async function main() {
  const tester = new SmallAccountLongevityTester();
  
  try {
    await tester.runLongevityTests();
  } catch (error) {
    console.error('❌ Longevity testing failed:', error);
    process.exit(1);
  } finally {
    await tester.cleanup();
  }
  
  console.log('\n✅ Longevity testing completed successfully!');
  process.exit(0);
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = SmallAccountLongevityTester;