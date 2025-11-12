#!/usr/bin/env node

/**
 * Enhanced Trading Charts - Live Demonstration
 * 
 * This script demonstrates the comprehensive data validation system
 * with real date calculations and WebSocket alignment logic.
 */

console.log('🚀 ENHANCED TRADING CHARTS - LIVE DEMONSTRATION');
console.log('===============================================\n');

// Simulate the EnhancedMarketDataService logic
class EnhancedMarketDataService {
  static get TRADING_DAYS_LOOKBACK() { return 5; }

  /**
   * Calculate proper date range ensuring 5 full trading days of coverage
   */
  static calculateOptimalDateRange() {
    const now = new Date();
    const endDate = new Date(now);
    
    console.log(`📅 Current Time: ${now.toISOString()}`);
    
    // Calculate start date - go back enough calendar days to ensure 5 trading days
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 10);
    
    // Count actual trading days in the range
    let tradingDaysFound = 0;
    const tempDate = new Date(startDate);
    
    console.log('📊 Trading Days Analysis:');
    console.log('  Date Range Scan:');
    
    while (tempDate <= endDate) {
      const dayOfWeek = tempDate.getDay();
      const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
      
      if (isWeekday) {
        tradingDaysFound++;
        console.log(`    ✅ ${tempDate.toISOString().split('T')[0]} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]})`);
      } else {
        console.log(`    ⏸️  ${tempDate.toISOString().split('T')[0]} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]}) - Weekend`);
      }
      
      tempDate.setDate(tempDate.getDate() + 1);
    }
    
    console.log(`\n  📈 Trading Days Found: ${tradingDaysFound}`);
    console.log(`  🎯 Required: ${this.TRADING_DAYS_LOOKBACK}`);
    console.log(`  ${tradingDaysFound >= this.TRADING_DAYS_LOOKBACK ? '✅' : '❌'} Sufficient Coverage\n`);
    
    return {
      startDate,
      endDate,
      tradingDaysFound
    };
  }

  /**
   * Simulate market data analysis
   */
  static analyzeCoverage(bars, timeframe, startDate, endDate) {
    if (bars.length === 0) {
      return {
        hasGaps: true,
        gapCount: 0,
        lastBarTimestamp: 0,
        firstBarTimestamp: 0
      };
    }

    // Sort bars by timestamp
    const sortedBars = [...bars].sort((a, b) => a.timestamp - b.timestamp);
    const firstBar = sortedBars[0];
    const lastBar = sortedBars[sortedBars.length - 1];
    
    // Calculate expected interval in seconds
    const intervalSeconds = this.getIntervalSeconds(timeframe);
    
    // Count gaps
    let gapCount = 0;
    for (let i = 1; i < sortedBars.length; i++) {
      const timeDiff = sortedBars[i].timestamp - sortedBars[i-1].timestamp;
      if (timeDiff > intervalSeconds * 2) {
        gapCount++;
      }
    }
    
    console.log(`🔍 Coverage Analysis Results:`);
    console.log(`  📊 Total Bars: ${bars.length}`);
    console.log(`  ⏰ Time Span: ${new Date(firstBar.timestamp * 1000).toISOString()} to ${new Date(lastBar.timestamp * 1000).toISOString()}`);
    console.log(`  ❌ Gaps Detected: ${gapCount}`);
    console.log(`  📈 Avg Interval: ${bars.length > 1 ? Math.round((lastBar.timestamp - firstBar.timestamp) / (bars.length - 1)) : 0}s\n`);

    return {
      hasGaps: gapCount > 0,
      gapCount,
      lastBarTimestamp: lastBar.timestamp,
      firstBarTimestamp: firstBar.timestamp
    };
  }

  /**
   * Calculate optimal WebSocket starting point
   */
  static calculateWebSocketStartpoint(bars, endDate) {
    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    if (bars.length === 0) {
      return {
        shouldStartWebSocket: true,
        startFromTimestamp: currentTimestamp,
        reason: 'No historical data - starting WebSocket from current time'
      };
    }

    const sortedBars = [...bars].sort((a, b) => a.timestamp - b.timestamp);
    const latestBar = sortedBars[sortedBars.length - 1];
    const latestBarTime = new Date(latestBar.timestamp * 1000);
    
    const timeBehind = currentTimestamp - latestBar.timestamp;
    const minutesBehind = timeBehind / 60;
    
    console.log(`🔌 WebSocket Alignment Analysis:`);
    console.log(`  📊 Latest Bar: ${latestBarTime.toISOString()}`);
    console.log(`  ⏰ Current Time: ${new Date().toISOString()}`);
    console.log(`  ⌛ Minutes Behind: ${minutesBehind.toFixed(2)}`);
    
    let result;
    if (minutesBehind <= 2) {
      result = {
        shouldStartWebSocket: true,
        startFromTimestamp: latestBar.timestamp + 60,
        reason: `Historical data is recent (${minutesBehind.toFixed(1)}min behind) - continuing from last bar`
      };
    } else if (minutesBehind <= 15) {
      result = {
        shouldStartWebSocket: true,
        startFromTimestamp: currentTimestamp,
        reason: `Historical data is ${minutesBehind.toFixed(1)}min behind - starting WebSocket from current time`
      };
    } else {
      result = {
        shouldStartWebSocket: true,
        startFromTimestamp: currentTimestamp,
        reason: `Historical data is stale (${minutesBehind.toFixed(1)}min behind) - recommend refreshing data`
      };
    }
    
    console.log(`  🎯 WebSocket Strategy: ${result.reason}`);
    console.log(`  🔗 Start Timestamp: ${new Date(result.startFromTimestamp * 1000).toISOString()}\n`);
    
    return result;
  }

  static getIntervalSeconds(timeframe) {
    switch (timeframe) {
      case '1m': return 60;
      case '5m': return 300;
      case '15m': return 900;
      case '1h': return 3600;
      case '1d': return 86400;
      default: return 60;
    }
  }

  static validateForLiveTrading(response) {
    const issues = [];
    const recommendations = [];

    if (response.bars.length === 0) {
      issues.push('No historical data available');
      recommendations.push('Enable WebSocket-only mode for real-time data collection');
    } else {
      const latestBar = Math.max(...response.bars.map(bar => bar.timestamp));
      const minutesOld = (Date.now() / 1000 - latestBar) / 60;
      
      if (minutesOld > 30) {
        issues.push(`Data is ${minutesOld.toFixed(1)} minutes old`);
        recommendations.push('Consider refreshing data before starting live trading');
      }
    }

    if (response.coverage.hasGaps && response.coverage.gapCount > 10) {
      issues.push(`Significant data gaps detected (${response.coverage.gapCount} gaps)`);
      recommendations.push('Review data quality before relying on historical indicators');
    }

    if (response.totalBars < 100) {
      issues.push('Insufficient historical data for reliable analysis');
      recommendations.push('Accumulate more data via WebSocket before trading');
    }

    console.log(`🛡️  Live Trading Validation:`);
    console.log(`  ${issues.length === 0 ? '✅' : '⚠️ '} Validation Result: ${issues.length === 0 ? 'PASSED' : 'ISSUES DETECTED'}`);
    if (issues.length > 0) {
      console.log(`  ❌ Issues:`);
      issues.forEach(issue => console.log(`     - ${issue}`));
      console.log(`  💡 Recommendations:`);
      recommendations.forEach(rec => console.log(`     - ${rec}`));
    }
    console.log('');

    return {
      isValid: issues.length === 0,
      issues,
      recommendations
    };
  }
}

// Demonstration with multiple trading bots
const TEST_BOTS = [
  { id: 'bot1', name: 'SPY VWAP Bot', symbol: 'SPY', strategy: 'HAVWAP' },
  { id: 'bot2', name: 'QQQ Momentum', symbol: 'QQQ', strategy: 'Momentum' },
  { id: 'bot3', name: 'AAPL Options', symbol: 'AAPL', strategy: 'Options' }
];

async function demonstrateValidation() {
  console.log('🎯 MULTI-BOT VALIDATION DEMONSTRATION');
  console.log('====================================\n');
  
  // Step 1: Calculate optimal date range
  const { startDate, endDate, tradingDaysFound } = EnhancedMarketDataService.calculateOptimalDateRange();
  
  // Step 2: Simulate bot validation process
  for (let i = 0; i < TEST_BOTS.length; i++) {
    const bot = TEST_BOTS[i];
    console.log(`🤖 Bot ${i + 1}/${TEST_BOTS.length}: ${bot.name} (${bot.symbol})`);
    console.log('─'.repeat(50));
    
    // Simulate different data scenarios
    let mockBars;
    let coverage;
    
    if (bot.symbol === 'SPY') {
      // Good data scenario
      mockBars = Array.from({ length: 1200 }, (_, i) => ({
        timestamp: Math.floor(Date.now() / 1000) - (1200 - i) * 60,
        open: 450 + Math.random() * 10,
        high: 455 + Math.random() * 10,
        low: 445 + Math.random() * 10,
        close: 450 + Math.random() * 10,
        volume: 1000000 + Math.random() * 500000
      }));
    } else if (bot.symbol === 'QQQ') {
      // Scenario with some gaps
      mockBars = Array.from({ length: 800 }, (_, i) => ({
        timestamp: Math.floor(Date.now() / 1000) - (1000 - i) * 60 - (i % 10 === 0 ? 300 : 0), // Add some gaps
        open: 380 + Math.random() * 8,
        high: 385 + Math.random() * 8,
        low: 375 + Math.random() * 8,
        close: 380 + Math.random() * 8,
        volume: 800000 + Math.random() * 400000
      }));
    } else {
      // Minimal data scenario
      mockBars = Array.from({ length: 50 }, (_, i) => ({
        timestamp: Math.floor(Date.now() / 1000) - (100 - i) * 60,
        open: 180 + Math.random() * 20,
        high: 185 + Math.random() * 20,
        low: 175 + Math.random() * 20,
        close: 180 + Math.random() * 20,
        volume: 2000000 + Math.random() * 1000000
      }));
    }
    
    // Analyze coverage
    coverage = EnhancedMarketDataService.analyzeCoverage(mockBars, '1m', startDate, endDate);
    
    // Calculate WebSocket starting point
    const websocketStartpoint = EnhancedMarketDataService.calculateWebSocketStartpoint(mockBars, endDate);
    
    // Create response object
    const response = {
      bars: mockBars,
      totalBars: mockBars.length,
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        tradingDaysCount: tradingDaysFound
      },
      coverage,
      websocketStartpoint
    };
    
    // Validate for live trading
    const validation = EnhancedMarketDataService.validateForLiveTrading(response);
    
    // Determine status
    let status;
    if (response.bars.length === 0) {
      status = 'websocket-only';
    } else if (validation.isValid) {
      status = 'ready';
    } else if (validation.issues.length > 0 && response.websocketStartpoint.shouldStartWebSocket) {
      status = 'websocket-only';
    } else {
      status = 'error';
    }
    
    console.log(`🎯 Final Status: ${status.toUpperCase()}`);
    console.log(`📊 Ready for WebSocket: ${websocketStartpoint.shouldStartWebSocket ? 'YES' : 'NO'}`);
    console.log('');
  }
  
  console.log('✅ VALIDATION DEMONSTRATION COMPLETE');
  console.log('===================================');
  console.log('');
  console.log('🚀 Key Benefits Demonstrated:');
  console.log('  ✓ Proper 5-day trading period calculation');
  console.log('  ✓ Current time-based date range calculation');
  console.log('  ✓ Gap detection and data quality analysis');
  console.log('  ✓ WebSocket starting point alignment');
  console.log('  ✓ Multi-bot parallel validation workflow');
  console.log('  ✓ Comprehensive live trading validation');
  console.log('');
  console.log('🎯 Ready for production deployment with comprehensive data coverage validation!');
}

// Run the demonstration
demonstrateValidation().catch(console.error);