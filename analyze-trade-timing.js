#!/usr/bin/env node

// Analyze trade timing and exit behavior for backtest 204

async function analyzeTradeTiming() {
  try {
    const response = await fetch('http://localhost:3002/api/backtest/204/trades');
    const trades = await response.json();

    const completedTrades = trades.filter(t => t.entry_timestamp && t.exit_timestamp);
    
    console.log(`\n📊 TRADE TIMING ANALYSIS - Backtest 204`);
    console.log(`Total trades: ${trades.length}`);
    console.log(`Completed trades: ${completedTrades.length}`);
    
    // Calculate holding periods and analyze exit reasons
    const holdingPeriods = [];
    const exitReasons = {};
    const callTrades = [];
    const putTrades = [];
    
    completedTrades.forEach(trade => {
      const entry = new Date(trade.entry_timestamp);
      const exit = new Date(trade.exit_timestamp);
      const holdingMinutes = Math.round((exit - entry) / (1000 * 60));
      
      holdingPeriods.push(holdingMinutes);
      
      // Count exit reasons
      const reason = trade.close_reason || 'UNKNOWN';
      exitReasons[reason] = (exitReasons[reason] || 0) + 1;
      
      // Separate calls and puts
      const tradeData = {
        contract: trade.contract_symbol,
        entry: trade.entry_timestamp,
        exit: trade.exit_timestamp,
        holding_minutes: holdingMinutes,
        entry_price: parseFloat(trade.entry_price),
        exit_price: parseFloat(trade.exit_price),
        pnl: parseFloat(trade.net_pnl),
        return_pct: parseFloat(trade.return_pct),
        close_reason: reason
      };
      
      if (trade.option_type === 'CALL') {
        callTrades.push(tradeData);
      } else {
        putTrades.push(tradeData);
      }
    });
    
    // Holding period statistics
    const avgHolding = holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length;
    const maxHolding = Math.max(...holdingPeriods);
    const minHolding = Math.min(...holdingPeriods);
    
    console.log(`\n⏱️  HOLDING PERIODS:`);
    console.log(`Average: ${avgHolding.toFixed(1)} minutes`);
    console.log(`Range: ${minHolding} - ${maxHolding} minutes`);
    
    // Exit reasons breakdown
    console.log(`\n🚪 EXIT REASONS:`);
    Object.entries(exitReasons)
      .sort(([,a], [,b]) => b - a)
      .forEach(([reason, count]) => {
        const pct = ((count / completedTrades.length) * 100).toFixed(1);
        console.log(`  ${reason}: ${count} trades (${pct}%)`);
      });
    
    // Call vs Put analysis
    console.log(`\n📞 CALL TRADES (${callTrades.length}):`);
    const callStats = analyzeTradeGroup(callTrades);
    printTradeStats(callStats);
    
    console.log(`\n📉 PUT TRADES (${putTrades.length}):`);
    const putStats = analyzeTradeGroup(putTrades);
    printTradeStats(putStats);
    
    // Time-based exit analysis
    console.log(`\n⏰ TIME-BASED EXIT ANALYSIS:`);
    const timeExits = completedTrades.filter(t => 
      t.close_reason && (
        t.close_reason.includes('TIME') || 
        t.close_reason.includes('MARKET_CLOSE') ||
        t.close_reason.includes('MAX_HOLDING')
      )
    );
    
    console.log(`Time-based exits: ${timeExits.length} / ${completedTrades.length} (${((timeExits.length / completedTrades.length) * 100).toFixed(1)}%)`);
    
    // Check for trades that should have hit time limits
    const expensiveTrades = completedTrades.filter(t => parseFloat(t.entry_price) >= 2.0);
    const cheapTrades = completedTrades.filter(t => parseFloat(t.entry_price) < 2.0);
    
    console.log(`\n💰 COST-AWARE ANALYSIS:`);
    console.log(`Expensive trades (≥$2.00): ${expensiveTrades.length}`);
    console.log(`Cheap trades (<$2.00): ${cheapTrades.length}`);
    
    const longExpensive = expensiveTrades.filter(t => {
      const entry = new Date(t.entry_timestamp);
      const exit = new Date(t.exit_timestamp);
      return (exit - entry) / (1000 * 60) > 45; // Should exit at 45min
    });
    
    const longCheap = cheapTrades.filter(t => {
      const entry = new Date(t.entry_timestamp);
      const exit = new Date(t.exit_timestamp);
      return (exit - entry) / (1000 * 60) > 90; // Should exit at 90min
    });
    
    console.log(`Expensive trades held >45min: ${longExpensive.length} (potential time limit issue)`);
    console.log(`Cheap trades held >90min: ${longCheap.length} (potential time limit issue)`);
    
  } catch (error) {
    console.error('Error analyzing trades:', error);
  }
}

function analyzeTradeGroup(trades) {
  if (trades.length === 0) return null;
  
  const winningTrades = trades.filter(t => t.pnl > 0);
  const totalPnL = trades.reduce((sum, t) => sum + t.pnl, 0);
  const avgReturn = trades.reduce((sum, t) => sum + t.return_pct, 0) / trades.length;
  const avgHolding = trades.reduce((sum, t) => sum + t.holding_minutes, 0) / trades.length;
  
  return {
    total: trades.length,
    winners: winningTrades.length,
    winRate: (winningTrades.length / trades.length) * 100,
    totalPnL,
    avgReturn,
    avgHolding,
    avgEntryPrice: trades.reduce((sum, t) => sum + t.entry_price, 0) / trades.length
  };
}

function printTradeStats(stats) {
  if (!stats) {
    console.log('  No trades');
    return;
  }
  
  console.log(`  Win Rate: ${stats.winRate.toFixed(1)}% (${stats.winners}/${stats.total})`);
  console.log(`  Total P&L: $${stats.totalPnL.toFixed(2)}`);
  console.log(`  Avg Return: ${stats.avgReturn.toFixed(1)}%`);
  console.log(`  Avg Holding: ${stats.avgHolding.toFixed(1)} minutes`);
  console.log(`  Avg Entry Price: $${stats.avgEntryPrice.toFixed(2)}`);
}

// Run the analysis
analyzeTradeTiming();