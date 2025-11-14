#!/usr/bin/env node

/**
 * Simple Small Account Strategy Backtesting Script
 * 
 * Tests individual strategies with various time periods to validate performance
 */

const axios = require('axios');

class SimpleStrategyTester {
  constructor() {
    this.baseUrl = 'http://localhost:3002/api';
    
    // Test configurations for different periods
    this.testPeriods = [
      // Recent short periods for quick validation
      { name: 'Recent_Week', start: '2024-11-01', end: '2024-11-08', description: 'Recent Week (Nov 1-8)' },
      { name: 'October_2024', start: '2024-10-01', end: '2024-10-31', description: 'October 2024' },
      { name: 'September_2024', start: '2024-09-01', end: '2024-09-30', description: 'September 2024' },
      
      // Different market conditions
      { name: 'August_Volatile', start: '2024-08-01', end: '2024-08-15', description: 'August Volatility Period' },
      { name: 'July_Summer', start: '2024-07-01', end: '2024-07-15', description: 'July Summer Trading' },
      { name: 'June_Sideways', start: '2024-06-01', end: '2024-06-14', description: 'June Sideways Market' }
    ];

    // Strategies to test (using strategy names that should be available)
    this.strategies = [
      'small-account-rsi-vwap',
      'small-account-momentum', 
      'small-account-iv-mean-reversion'
    ];
  }

  /**
   * Test all strategies across all periods
   */
  async runTests() {
    console.log('\n🚀 SMALL ACCOUNT STRATEGY TESTING');
    console.log('==================================\n');

    const results = [];

    for (const strategy of this.strategies) {
      console.log(`\n📊 Testing Strategy: ${strategy}`);
      console.log('================================');
      
      for (const period of this.testPeriods) {
        console.log(`\n🗓️ Period: ${period.description}`);
        
        try {
          const result = await this.runSingleBacktest(strategy, period);
          results.push({
            strategy,
            period: period.name,
            description: period.description,
            ...result
          });
          
          console.log(`   ✅ Completed: ${result.summary}`);
          
        } catch (error) {
          console.log(`   ❌ Failed: ${error.message}`);
          results.push({
            strategy,
            period: period.name,
            description: period.description,
            error: error.message
          });
        }

        // Wait between tests to avoid overwhelming the server
        await this.sleep(2000);
      }
    }

    // Generate summary report
    this.generateSummaryReport(results);
    return results;
  }

  /**
   * Run a single backtest
   */
  async runSingleBacktest(strategy, period) {
    const config = {
      strategy: strategy,
      symbol: 'SPY',
      startDate: period.start,
      endDate: period.end,
      timeframe: '1Min',
      initialCapital: 1000,
      parameters: {
        accountSize: 1000,
        settledCash: 1000
      }
    };

    console.log(`   🔄 Running backtest...`);
    
    const response = await axios.post(`${this.baseUrl}/backtest/run`, config, {
      timeout: 60000, // 60 second timeout
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.data || !response.data.success) {
      throw new Error('Backtest failed: ' + (response.data?.message || 'Unknown error'));
    }

    const data = response.data;
    
    // Extract key metrics
    const metrics = {
      totalTrades: data.totalTrades || 0,
      winRate: data.winRate || 0,
      totalReturn: data.totalReturn || 0,
      profitFactor: data.profitFactor || 0,
      maxDrawdown: data.maxDrawdown || 0,
      finalValue: data.finalValue || config.initialCapital,
      summary: `${data.totalTrades || 0} trades, ${(data.winRate || 0).toFixed(1)}% WR, ${(data.totalReturn || 0).toFixed(1)}% return`
    };

    return metrics;
  }

  /**
   * Generate summary report
   */
  generateSummaryReport(results) {
    console.log('\n📈 SUMMARY REPORT');
    console.log('==================\n');

    // Group by strategy
    const byStrategy = {};
    for (const result of results) {
      if (!byStrategy[result.strategy]) {
        byStrategy[result.strategy] = [];
      }
      byStrategy[result.strategy].push(result);
    }

    // Generate strategy summaries
    for (const [strategy, strategyResults] of Object.entries(byStrategy)) {
      console.log(`\n🎯 ${strategy.toUpperCase()}`);
      console.log('─'.repeat(50));
      
      const successful = strategyResults.filter(r => !r.error);
      const failed = strategyResults.filter(r => r.error);
      
      if (successful.length > 0) {
        const avgWinRate = successful.reduce((sum, r) => sum + (r.winRate || 0), 0) / successful.length;
        const avgReturn = successful.reduce((sum, r) => sum + (r.totalReturn || 0), 0) / successful.length;
        const totalTrades = successful.reduce((sum, r) => sum + (r.totalTrades || 0), 0);
        
        console.log(`✅ Successful Tests: ${successful.length}/${strategyResults.length}`);
        console.log(`📊 Average Win Rate: ${avgWinRate.toFixed(1)}%`);
        console.log(`💰 Average Return: ${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(1)}%`);
        console.log(`📈 Total Trades: ${totalTrades}`);
        
        console.log('\n📅 Period Breakdown:');
        for (const result of successful) {
          console.log(`   ${result.description}: ${result.summary}`);
        }
        
        if (failed.length > 0) {
          console.log('\n❌ Failed Tests:');
          for (const result of failed) {
            console.log(`   ${result.description}: ${result.error}`);
          }
        }
      } else {
        console.log(`❌ No successful tests for ${strategy}`);
        console.log('Errors encountered:');
        for (const result of failed) {
          console.log(`   ${result.description}: ${result.error}`);
        }
      }
    }

    // Overall insights
    console.log('\n💡 KEY INSIGHTS');
    console.log('================');
    
    const allSuccessful = results.filter(r => !r.error);
    if (allSuccessful.length > 0) {
      const bestPerformer = allSuccessful.reduce((best, current) => 
        (current.totalReturn || 0) > (best.totalReturn || 0) ? current : best
      );
      
      console.log(`🏆 Best Single Performance: ${bestPerformer.strategy} in ${bestPerformer.description}`);
      console.log(`   ${bestPerformer.summary}`);
      
      const winRates = allSuccessful.map(r => r.winRate || 0);
      const avgWinRate = winRates.reduce((sum, wr) => sum + wr, 0) / winRates.length;
      console.log(`📊 Overall Average Win Rate: ${avgWinRate.toFixed(1)}%`);
      
      const returns = allSuccessful.map(r => r.totalReturn || 0);
      const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
      console.log(`💰 Overall Average Return: ${avgReturn >= 0 ? '+' : ''}${avgReturn.toFixed(1)}%`);
    }
    
    const successRate = (allSuccessful.length / results.length * 100).toFixed(1);
    console.log(`✅ Success Rate: ${successRate}% (${allSuccessful.length}/${results.length} tests passed)`);
  }

  /**
   * Utility function
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Main execution
async function main() {
  console.log('🔍 Checking if backtesting server is accessible...');
  
  try {
    const response = await axios.get('http://localhost:3002/api/strategies');
    console.log('✅ Server is accessible');
    console.log('📋 Available strategies:', response.data.strategies?.slice(0, 3) || 'Unknown');
  } catch (error) {
    console.error('❌ Cannot connect to backtesting server:', error.message);
    console.log('💡 Make sure Docker containers are running: docker-compose up -d');
    return;
  }

  const tester = new SimpleStrategyTester();
  
  try {
    await tester.runTests();
    console.log('\n✅ Testing completed successfully!');
  } catch (error) {
    console.error('\n❌ Testing failed:', error.message);
  }
}

// Export for use as module
if (require.main === module) {
  main();
}

module.exports = SimpleStrategyTester;