/**
 * SMALL ACCOUNT STRATEGY FACTORY & TESTING FRAMEWORK
 * 
 * This module provides:
 * 1. Strategy factory for easy strategy selection and switching
 * 2. Strategy comparison framework for backtesting
 * 3. Capital injection simulation for small account growth
 * 4. Performance analytics for strategy optimization
 * 
 * Designed for growing a small account from $250 bi-weekly deposits to $10,000 target
 */

const SmallAccountRSIVWAPStrategy = require('./small-account-rsi-vwap');
const SmallAccountMomentumStrategy = require('./small-account-momentum');
const SmallAccountIVMeanReversionStrategy = require('./small-account-iv-mean-reversion');

class SmallAccountStrategyFactory {
  constructor() {
    this.strategies = new Map();
    this.registerStrategies();
  }

  /**
   * Register all available strategies
   */
  registerStrategies() {
    this.strategies.set('conservative-rsi-vwap', {
      class: SmallAccountRSIVWAPStrategy,
      description: 'Conservative RSI-VWAP (70% win rate target)',
      riskLevel: 'Low',
      expectedWinRate: 0.70,
      expectedReturn: 0.30,
      maxRisk: 0.05,
      tradingStyle: 'Conservative Growth'
    });

    this.strategies.set('aggressive-momentum', {
      class: SmallAccountMomentumStrategy,
      description: 'Aggressive Momentum Breakout (50% win rate target)',
      riskLevel: 'Medium-High',
      expectedWinRate: 0.50,
      expectedReturn: 0.60,
      maxRisk: 0.03,
      tradingStyle: 'Rapid Growth'
    });

    this.strategies.set('selective-iv-reversion', {
      class: SmallAccountIVMeanReversionStrategy,
      description: 'Selective IV Mean Reversion (80% win rate target)',
      riskLevel: 'Low-Medium',
      expectedWinRate: 0.80,
      expectedReturn: 0.25,
      maxRisk: 0.025,
      tradingStyle: 'High Probability'
    });

    console.log(`🏭 [STRATEGY FACTORY] Registered ${this.strategies.size} small account strategies`);
  }

  /**
   * Create strategy instance
   */
  createStrategy(strategyName, parameters = {}) {
    const strategyInfo = this.strategies.get(strategyName);
    if (!strategyInfo) {
      throw new Error(`Unknown strategy: ${strategyName}. Available: ${Array.from(this.strategies.keys()).join(', ')}`);
    }

    const strategy = new strategyInfo.class(parameters);
    strategy.strategyInfo = strategyInfo;
    
    console.log(`✅ [STRATEGY CREATED] ${strategyInfo.description}`);
    console.log(`   Risk Level: ${strategyInfo.riskLevel}`);
    console.log(`   Expected Win Rate: ${(strategyInfo.expectedWinRate * 100).toFixed(0)}%`);
    console.log(`   Expected Return: ${(strategyInfo.expectedReturn * 100).toFixed(0)}%`);
    
    return strategy;
  }

  /**
   * Get all available strategies
   */
  getAvailableStrategies() {
    return Array.from(this.strategies.entries()).map(([name, info]) => ({
      name,
      ...info
    }));
  }

  /**
   * Get strategy recommendation based on account size and risk tolerance
   */
  getRecommendedStrategy(accountSize, riskTolerance = 'medium') {
    if (accountSize < 1000) {
      return riskTolerance === 'high' ? 'aggressive-momentum' : 'conservative-rsi-vwap';
    } else if (accountSize < 5000) {
      return riskTolerance === 'low' ? 'selective-iv-reversion' : 
             riskTolerance === 'high' ? 'aggressive-momentum' : 'conservative-rsi-vwap';
    } else {
      return 'selective-iv-reversion'; // More selective with larger accounts
    }
  }
}

/**
 * Strategy Performance Tracker
 */
class StrategyPerformanceTracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.trades = [];
    this.dailyPnL = [];
    this.accountHistory = [];
    this.capitalInjections = [];
    this.startDate = null;
    this.endDate = null;
    this.initialCapital = 0;
    this.currentCapital = 0;
  }

  /**
   * Record a trade
   */
  recordTrade(trade) {
    this.trades.push({
      ...trade,
      timestamp: new Date(trade.timestamp || Date.now())
    });
  }

  /**
   * Record capital injection (bi-weekly deposits)
   */
  recordCapitalInjection(amount, date) {
    this.capitalInjections.push({
      amount,
      date: new Date(date),
      accountValueBefore: this.currentCapital
    });
    this.currentCapital += amount;
    
    console.log(`💰 [CAPITAL INJECTION] Added $${amount}, Total: $${this.currentCapital.toFixed(2)}`);
  }

  /**
   * Update account value
   */
  updateAccountValue(newValue, date) {
    this.accountHistory.push({
      value: newValue,
      date: new Date(date)
    });
    this.currentCapital = newValue;
  }

  /**
   * Calculate comprehensive performance metrics
   */
  calculatePerformance() {
    if (this.trades.length === 0) {
      return {
        totalTrades: 0,
        winRate: 0,
        avgReturn: 0,
        totalReturn: 0,
        maxDrawdown: 0,
        profitFactor: 0,
        sharpeRatio: 0
      };
    }

    // Win rate calculation
    const winningTrades = this.trades.filter(trade => trade.pnl > 0);
    const losingTrades = this.trades.filter(trade => trade.pnl < 0);
    const winRate = winningTrades.length / this.trades.length;

    // Return calculations
    const totalPnL = this.trades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    const avgReturn = totalPnL / this.trades.length;
    const totalReturn = this.currentCapital / this.initialCapital - 1;

    // Profit factor
    const grossProfits = winningTrades.reduce((sum, trade) => sum + trade.pnl, 0);
    const grossLosses = Math.abs(losingTrades.reduce((sum, trade) => sum + trade.pnl, 0));
    const profitFactor = grossLosses > 0 ? grossProfits / grossLosses : 0;

    // Drawdown calculation
    let peak = this.initialCapital;
    let maxDrawdown = 0;
    
    this.accountHistory.forEach(record => {
      peak = Math.max(peak, record.value);
      const drawdown = (peak - record.value) / peak;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    });

    // Sharpe ratio (simplified)
    const returns = this.accountHistory.map((record, index) => {
      if (index === 0) return 0;
      return (record.value - this.accountHistory[index - 1].value) / this.accountHistory[index - 1].value;
    }).filter(ret => ret !== 0);

    const avgDailyReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const returnStdDev = Math.sqrt(returns.reduce((sum, ret) => sum + Math.pow(ret - avgDailyReturn, 2), 0) / returns.length);
    const sharpeRatio = returnStdDev > 0 ? avgDailyReturn / returnStdDev * Math.sqrt(252) : 0;

    // Time to target calculation
    const targetAmount = 10000;
    const monthsToTarget = this.estimateMonthsToTarget(targetAmount);

    return {
      totalTrades: this.trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: winRate,
      avgReturn: avgReturn,
      totalReturn: totalReturn,
      maxDrawdown: maxDrawdown,
      profitFactor: profitFactor,
      sharpeRatio: sharpeRatio,
      grossProfits: grossProfits,
      grossLosses: grossLosses,
      avgWinningTrade: winningTrades.length > 0 ? grossProfits / winningTrades.length : 0,
      avgLosingTrade: losingTrades.length > 0 ? grossLosses / losingTrades.length : 0,
      totalCapitalInjected: this.capitalInjections.reduce((sum, inj) => sum + inj.amount, 0),
      monthsToTarget: monthsToTarget,
      capitalEfficiency: this.calculateCapitalEfficiency()
    };
  }

  /**
   * Estimate months to reach $10K target
   */
  estimateMonthsToTarget(targetAmount) {
    if (this.accountHistory.length < 2) return 'Insufficient data';

    const recentGrowthRate = this.calculateRecentGrowthRate();
    const currentCapital = this.currentCapital;
    const monthlyInjection = 500; // $250 bi-weekly

    if (recentGrowthRate <= 0) return 'Growth rate insufficient';

    // Simple projection with compound growth + injections
    let projectedCapital = currentCapital;
    let months = 0;

    while (projectedCapital < targetAmount && months < 60) { // Max 5 years
      projectedCapital = projectedCapital * (1 + recentGrowthRate) + monthlyInjection;
      months++;
    }

    return months < 60 ? months : 'Target unreachable with current performance';
  }

  /**
   * Calculate recent growth rate (last 30 days or available data)
   */
  calculateRecentGrowthRate() {
    if (this.accountHistory.length < 2) return 0;

    const recent = this.accountHistory.slice(-30); // Last 30 data points
    const startValue = recent[0].value;
    const endValue = recent[recent.length - 1].value;
    const days = (recent[recent.length - 1].date - recent[0].date) / (1000 * 60 * 60 * 24);

    if (days <= 0) return 0;

    const totalReturn = (endValue - startValue) / startValue;
    return totalReturn / days * 30; // Monthly rate
  }

  /**
   * Calculate capital efficiency (returns per dollar injected)
   */
  calculateCapitalEfficiency() {
    const totalInjected = this.capitalInjections.reduce((sum, inj) => sum + inj.amount, 0);
    if (totalInjected === 0) return 0;

    const tradingProfits = this.currentCapital - this.initialCapital - totalInjected;
    return tradingProfits / totalInjected;
  }

  /**
   * Generate detailed performance report
   */
  generateReport() {
    const performance = this.calculatePerformance();
    
    const report = `
🚀 SMALL ACCOUNT STRATEGY PERFORMANCE REPORT
==============================================

📊 TRADING STATISTICS
• Total Trades: ${performance.totalTrades}
• Win Rate: ${(performance.winRate * 100).toFixed(1)}%
• Average Return per Trade: ${(performance.avgReturn * 100).toFixed(2)}%
• Profit Factor: ${performance.profitFactor.toFixed(2)}

💰 ACCOUNT PERFORMANCE
• Initial Capital: $${this.initialCapital.toFixed(2)}
• Current Capital: $${this.currentCapital.toFixed(2)}
• Total Return: ${(performance.totalReturn * 100).toFixed(1)}%
• Max Drawdown: ${(performance.maxDrawdown * 100).toFixed(1)}%
• Sharpe Ratio: ${performance.sharpeRatio.toFixed(2)}

💵 CAPITAL MANAGEMENT
• Total Capital Injected: $${performance.totalCapitalInjected.toFixed(2)}
• Capital Efficiency: ${(performance.capitalEfficiency * 100).toFixed(1)}%
• Months to $10K Target: ${performance.monthsToTarget}

🎯 RISK METRICS
• Average Winning Trade: $${performance.avgWinningTrade.toFixed(2)}
• Average Losing Trade: -$${performance.avgLosingTrade.toFixed(2)}
• Gross Profits: $${performance.grossProfits.toFixed(2)}
• Gross Losses: -$${performance.grossLosses.toFixed(2)}

📈 GROWTH PROJECTION
Based on current performance, your account should reach $10,000 in approximately ${performance.monthsToTarget} months with continued $250 bi-weekly deposits and similar trading performance.
    `;

    return report;
  }
}

/**
 * Small Account Growth Simulator
 */
class SmallAccountGrowthSimulator {
  constructor() {
    this.strategyFactory = new SmallAccountStrategyFactory();
    this.performanceTracker = new StrategyPerformanceTracker();
    this.biweeklyDeposit = 250;
    this.targetAmount = 10000;
  }

  /**
   * Simulate small account growth with strategy
   */
  async simulateGrowth(strategyName, initialCapital = 500, months = 12, parameters = {}) {
    console.log(`\n🎯 [GROWTH SIMULATION] Starting ${months}-month simulation`);
    console.log(`   Strategy: ${strategyName}`);
    console.log(`   Initial Capital: $${initialCapital}`);
    console.log(`   Bi-weekly Deposits: $${this.biweeklyDeposit}`);
    console.log(`   Target: $${this.targetAmount}`);

    // Initialize strategy
    const strategy = this.strategyFactory.createStrategy(strategyName, {
      accountSize: initialCapital,
      settledCash: initialCapital,
      ...parameters
    });

    // Initialize tracking
    this.performanceTracker.reset();
    this.performanceTracker.initialCapital = initialCapital;
    this.performanceTracker.currentCapital = initialCapital;
    this.performanceTracker.startDate = new Date();

    let currentCapital = initialCapital;
    let currentDate = new Date();

    // Simulate month by month
    for (let month = 0; month < months; month++) {
      console.log(`\n📅 Month ${month + 1}/${months}`);
      
      // Bi-weekly deposits (2 per month)
      for (let deposit = 0; deposit < 2; deposit++) {
        const depositDate = new Date(currentDate.getTime() + (deposit + 1) * 14 * 24 * 60 * 60 * 1000);
        this.performanceTracker.recordCapitalInjection(this.biweeklyDeposit, depositDate);
        currentCapital += this.biweeklyDeposit;
        strategy.updateAccountSize(currentCapital);
      }

      // Simulate trading performance (simplified)
      const monthlyTrades = this.simulateMonthlyTrading(strategy, currentCapital);
      
      // Calculate month-end capital
      const monthlyPnL = monthlyTrades.reduce((sum, trade) => sum + trade.pnl, 0);
      currentCapital += monthlyPnL;
      
      // Record performance
      monthlyTrades.forEach(trade => this.performanceTracker.recordTrade(trade));
      this.performanceTracker.updateAccountValue(currentCapital, currentDate);

      console.log(`   Month-end Capital: $${currentCapital.toFixed(2)}`);
      console.log(`   Monthly P&L: ${monthlyPnL >= 0 ? '+' : ''}$${monthlyPnL.toFixed(2)}`);
      console.log(`   Progress to Target: ${(currentCapital / this.targetAmount * 100).toFixed(1)}%`);

      // Check if target reached
      if (currentCapital >= this.targetAmount) {
        console.log(`\n🎉 TARGET REACHED! $${this.targetAmount} achieved in ${month + 1} months`);
        break;
      }

      // Move to next month
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    this.performanceTracker.endDate = new Date();
    return this.performanceTracker.generateReport();
  }

  /**
   * Simulate monthly trading activity (simplified)
   */
  simulateMonthlyTrading(strategy, accountSize) {
    const trades = [];
    const strategyInfo = strategy.strategyInfo;
    
    // Estimate monthly trades based on strategy
    const tradesPerMonth = strategy.maxDailyTrades ? strategy.maxDailyTrades * 20 * 0.3 : 15; // Conservative estimate
    
    for (let i = 0; i < tradesPerMonth; i++) {
      const isWinningTrade = Math.random() < strategyInfo.expectedWinRate;
      
      let pnl;
      if (isWinningTrade) {
        // Winning trade
        pnl = accountSize * strategy.maxRiskPerTrade * (strategyInfo.expectedReturn * (0.8 + Math.random() * 0.4));
      } else {
        // Losing trade
        pnl = -accountSize * strategy.maxRiskPerTrade * (0.5 + Math.random() * 0.5);
      }

      trades.push({
        timestamp: Date.now() + i * 86400000 / tradesPerMonth, // Spread across month
        pnl: pnl,
        isWin: isWinningTrade,
        strategy: strategy.name
      });
    }

    return trades;
  }

  /**
   * Compare multiple strategies
   */
  async compareStrategies(strategies, months = 6) {
    console.log(`\n🔄 [STRATEGY COMPARISON] Comparing ${strategies.length} strategies over ${months} months`);
    
    const results = [];
    
    for (const strategyName of strategies) {
      console.log(`\n--- Testing ${strategyName} ---`);
      const report = await this.simulateGrowth(strategyName, 500, months);
      const performance = this.performanceTracker.calculatePerformance();
      
      results.push({
        strategy: strategyName,
        finalCapital: this.performanceTracker.currentCapital,
        totalReturn: performance.totalReturn,
        winRate: performance.winRate,
        sharpeRatio: performance.sharpeRatio,
        maxDrawdown: performance.maxDrawdown,
        monthsToTarget: performance.monthsToTarget,
        capitalEfficiency: performance.capitalEfficiency
      });
    }

    // Sort by final capital
    results.sort((a, b) => b.finalCapital - a.finalCapital);

    console.log(`\n🏆 STRATEGY COMPARISON RESULTS`);
    console.log(`==============================`);
    results.forEach((result, index) => {
      console.log(`${index + 1}. ${result.strategy}`);
      console.log(`   Final Capital: $${result.finalCapital.toFixed(2)}`);
      console.log(`   Total Return: ${(result.totalReturn * 100).toFixed(1)}%`);
      console.log(`   Win Rate: ${(result.winRate * 100).toFixed(1)}%`);
      console.log(`   Months to $10K: ${result.monthsToTarget}`);
      console.log(`   Capital Efficiency: ${(result.capitalEfficiency * 100).toFixed(1)}%`);
      console.log(``);
    });

    return results;
  }
}

module.exports = {
  SmallAccountStrategyFactory,
  StrategyPerformanceTracker,
  SmallAccountGrowthSimulator
};