/**
 * Comprehensive Week Data Analysis for Parameter Optimization
 *
 * Analyzes 1 week of historical stock + options data to determine:
 * 1. Realistic profit/loss percentages
 * 2. Theta decay patterns
 * 3. Optimal holding periods
 * 4. VWAP mean reversion characteristics
 * 5. Entry/exit threshold recommendations
 */

const moment = require('moment-timezone');
const GreeksCalculator = require('./utils/greeks-calculator');
const DataCacheManager = require('./utils/data-cache-manager');
const { Pool } = require('pg');

// Database connection
const pool = new Pool({
  host: process.env.DB_HOST || 'database',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'trading_system',
  user: process.env.DB_USER || 'trader',
  password: process.env.DB_PASSWORD || 'trading123'
});

const alpacaClient = require('./utils/alpaca-client');
const greeksCalculator = new GreeksCalculator();
const dataCacheManager = new DataCacheManager(pool, alpacaClient, greeksCalculator);

// Analysis parameters
const SYMBOL = 'SPY';
const ANALYSIS_DATES = [
  '2025-01-27',
  '2025-01-28',
  '2025-01-29',
  '2025-01-30',
  '2025-01-31'
];

/**
 * Calculate VWAP for bars
 */
function calculateVWAP(bars) {
  const hourlyVWAPs = [];
  let currentHour = null;
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  bars.forEach((bar, index) => {
    const barTime = new Date(bar.t);
    const barTimeET = moment(barTime).tz('America/New_York');
    const barHour = barTimeET.hours();

    if (barHour !== currentHour) {
      currentHour = barHour;
      cumulativePV = 0;
      cumulativeVolume = 0;
    }

    const typical = (parseFloat(bar.h) + parseFloat(bar.l) + parseFloat(bar.c)) / 3;
    const volume = parseFloat(bar.v);

    cumulativePV += typical * volume;
    cumulativeVolume += volume;

    const vwap = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : typical;

    hourlyVWAPs.push({
      timestamp: bar.t,
      price: parseFloat(bar.c),
      vwap: vwap,
      distance: (parseFloat(bar.c) - vwap) / vwap,
      distancePct: ((parseFloat(bar.c) - vwap) / vwap) * 100
    });
  });

  return hourlyVWAPs;
}

/**
 * Analyze mean reversion characteristics
 */
function analyzeMeanReversion(vwapData) {
  const reversions = [];
  const thresholds = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]; // % thresholds

  thresholds.forEach(threshold => {
    let crossings = 0;
    let reversionCount = 0;
    let reversionTime = [];
    let maxExcursion = [];

    for (let i = 1; i < vwapData.length; i++) {
      const prev = vwapData[i - 1];
      const curr = vwapData[i];

      // Detect crossing threshold
      if (Math.abs(prev.distancePct) < threshold && Math.abs(curr.distancePct) >= threshold) {
        crossings++;
        const direction = curr.distancePct > 0 ? 'above' : 'below';

        // Track how long until reversion
        let reverted = false;
        let barsToRevert = 0;
        let maxDist = Math.abs(curr.distancePct);

        for (let j = i + 1; j < Math.min(i + 60, vwapData.length); j++) {
          barsToRevert++;
          const dist = Math.abs(vwapData[j].distancePct);
          maxDist = Math.max(maxDist, dist);

          // Check if reverted back within threshold
          if (dist < threshold * 0.5) {
            reverted = true;
            reversionCount++;
            reversionTime.push(barsToRevert);
            maxExcursion.push(maxDist);
            break;
          }
        }
      }
    }

    const avgReversionTime = reversionTime.length > 0
      ? reversionTime.reduce((a, b) => a + b, 0) / reversionTime.length
      : 0;

    const avgMaxExcursion = maxExcursion.length > 0
      ? maxExcursion.reduce((a, b) => a + b, 0) / maxExcursion.length
      : 0;

    reversions.push({
      threshold: threshold,
      crossings: crossings,
      reversions: reversionCount,
      reversionRate: crossings > 0 ? (reversionCount / crossings) * 100 : 0,
      avgBarsToRevert: avgReversionTime,
      avgMaxExcursion: avgMaxExcursion
    });
  });

  return reversions;
}

/**
 * Analyze theta decay for 0DTE options
 */
function analyzeTheta(optionsData, underlyingBars) {
  const thetaAnalysis = {
    byTimeToExpiry: {},
    byDelta: {},
    avgDecayPerMinute: 0,
    accelerationFactors: []
  };

  const decayRates = [];

  optionsData.forEach(contract => {
    if (!contract.bars || contract.bars.length < 2) return;

    for (let i = 1; i < contract.bars.length; i++) {
      const prevBar = contract.bars[i - 1];
      const currBar = contract.bars[i];

      const prevPrice = parseFloat(prevBar.c);
      const currPrice = parseFloat(currBar.c);

      if (prevPrice <= 0 || currPrice <= 0) continue;

      const priceChange = currPrice - prevPrice;
      const timeElapsedMin = 1; // 1-minute bars

      // Calculate theoretical theta contribution
      const expiryTime = new Date(contract.expiry_date + 'T16:00:00-05:00');
      const currTime = new Date(currBar.t);
      const hoursToExpiry = (expiryTime - currTime) / (1000 * 60 * 60);

      if (hoursToExpiry <= 0 || hoursToExpiry > 8) continue;

      // Find underlying price change
      const underlyingBar = underlyingBars.find(b => {
        const diff = Math.abs(new Date(b.t) - new Date(currBar.t));
        return diff < 60000; // Within 1 minute
      });

      if (!underlyingBar) continue;

      const underlyingPrice = parseFloat(underlyingBar.c);

      // Calculate Greeks for delta-neutral decay
      const greeks = greeksCalculator.estimateGreeksFromOHLCV(
        underlyingPrice,
        contract.strike_price,
        contract.expiry_date,
        contract.option_type,
        currBar,
        currBar.t
      );

      // Approximate theta decay (price change not explained by delta)
      const underlyingChange = parseFloat(underlyingBar.c) - parseFloat(prevBar.c || underlyingBar.c);
      const deltaExplainedChange = greeks.delta * underlyingChange;
      const unexplainedChange = priceChange - deltaExplainedChange;
      const thetaDecay = unexplainedChange / timeElapsedMin; // Per minute

      decayRates.push({
        hoursToExpiry: hoursToExpiry,
        delta: Math.abs(greeks.delta),
        decayPerMin: thetaDecay,
        percentDecay: (thetaDecay / prevPrice) * 100
      });

      // Group by hours to expiry
      const hourBucket = Math.floor(hoursToExpiry);
      if (!thetaAnalysis.byTimeToExpiry[hourBucket]) {
        thetaAnalysis.byTimeToExpiry[hourBucket] = [];
      }
      thetaAnalysis.byTimeToExpiry[hourBucket].push(thetaDecay);

      // Group by delta
      const deltaBucket = Math.floor(Math.abs(greeks.delta) * 10) / 10;
      if (!thetaAnalysis.byDelta[deltaBucket]) {
        thetaAnalysis.byDelta[deltaBucket] = [];
      }
      thetaAnalysis.byDelta[deltaBucket].push(thetaDecay);
    }
  });

  // Calculate averages
  if (decayRates.length > 0) {
    thetaAnalysis.avgDecayPerMinute = decayRates.reduce((sum, r) => sum + r.decayPerMin, 0) / decayRates.length;
    thetaAnalysis.avgPercentDecayPerMinute = decayRates.reduce((sum, r) => sum + r.percentDecay, 0) / decayRates.length;
  }

  // Calculate acceleration in final hours
  const finalHourDecay = thetaAnalysis.byTimeToExpiry[0] || [];
  const midDayDecay = thetaAnalysis.byTimeToExpiry[3] || [];

  if (finalHourDecay.length > 0 && midDayDecay.length > 0) {
    const avgFinal = finalHourDecay.reduce((a, b) => a + b, 0) / finalHourDecay.length;
    const avgMid = midDayDecay.reduce((a, b) => a + b, 0) / midDayDecay.length;
    thetaAnalysis.finalHourAcceleration = Math.abs(avgFinal / avgMid);
  }

  return { thetaAnalysis, decayRates };
}

/**
 * Analyze realistic profit/loss percentages
 */
function analyzeProfitLoss(optionsData, vwapData) {
  const trades = [];
  const holdingPeriods = [5, 10, 15, 30, 45, 60]; // minutes

  optionsData.forEach(contract => {
    if (!contract.bars || contract.bars.length < 10) return;

    // Simulate entries when price crosses VWAP threshold
    for (let i = 10; i < contract.bars.length - 60; i++) {
      const entryBar = contract.bars[i];
      const entryPrice = parseFloat(entryBar.c);

      if (entryPrice <= 0) continue;

      // Find corresponding underlying bar
      const underlyingBar = vwapData.find(v => {
        const diff = Math.abs(new Date(v.timestamp) - new Date(entryBar.t));
        return diff < 60000;
      });

      if (!underlyingBar) continue;

      // Only enter when price is away from VWAP
      if (Math.abs(underlyingBar.distancePct) < 0.1) continue;

      // Track P&L over different holding periods
      holdingPeriods.forEach(minutes => {
        const exitIndex = i + minutes;
        if (exitIndex >= contract.bars.length) return;

        const exitBar = contract.bars[exitIndex];
        const exitPrice = parseFloat(exitBar.c);

        if (exitPrice <= 0) return;

        const pnlPct = (exitPrice - entryPrice) / entryPrice;
        const direction = contract.option_type === 'CALL'
          ? (underlyingBar.distancePct < 0 ? 'reversion' : 'trend')
          : (underlyingBar.distancePct > 0 ? 'reversion' : 'trend');

        trades.push({
          holdingPeriod: minutes,
          entryPrice: entryPrice,
          exitPrice: exitPrice,
          pnlPct: pnlPct * 100,
          direction: direction,
          entryDistance: underlyingBar.distancePct
        });
      });
    }
  });

  // Analyze by holding period
  const byPeriod = {};
  holdingPeriods.forEach(period => {
    const periodTrades = trades.filter(t => t.holdingPeriod === period);

    if (periodTrades.length === 0) {
      byPeriod[period] = null;
      return;
    }

    const winners = periodTrades.filter(t => t.pnlPct > 0);
    const losers = periodTrades.filter(t => t.pnlPct < 0);

    byPeriod[period] = {
      totalTrades: periodTrades.length,
      winRate: (winners.length / periodTrades.length) * 100,
      avgWin: winners.length > 0 ? winners.reduce((sum, t) => sum + t.pnlPct, 0) / winners.length : 0,
      avgLoss: losers.length > 0 ? losers.reduce((sum, t) => sum + Math.abs(t.pnlPct), 0) / losers.length : 0,
      maxWin: periodTrades.reduce((max, t) => Math.max(max, t.pnlPct), 0),
      maxLoss: periodTrades.reduce((min, t) => Math.min(min, t.pnlPct), 0),
      medianPnl: calculateMedian(periodTrades.map(t => t.pnlPct))
    };

    if (byPeriod[period].avgLoss > 0) {
      byPeriod[period].profitFactor = byPeriod[period].avgWin / byPeriod[period].avgLoss;
    }
  });

  return { trades, byPeriod };
}

function calculateMedian(values) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Main analysis function
 */
async function analyzeWeekData() {
  console.log('\n🔬 COMPREHENSIVE WEEK DATA ANALYSIS\n');
  console.log(`Symbol: ${SYMBOL}`);
  console.log(`Dates: ${ANALYSIS_DATES[0]} to ${ANALYSIS_DATES[ANALYSIS_DATES.length - 1]}\n`);

  const allResults = {
    dates: ANALYSIS_DATES,
    vwapAnalysis: [],
    thetaAnalysis: [],
    profitLossAnalysis: [],
    recommendations: {}
  };

  for (const date of ANALYSIS_DATES) {
    console.log(`\n📅 Analyzing ${date}...`);

    try {
      // Fetch underlying data
      const underlyingBars = await dataCacheManager.getUnderlyingBars(SYMBOL, date, date);
      console.log(`   ✅ Retrieved ${underlyingBars.length} underlying bars`);

      if (underlyingBars.length === 0) {
        console.log(`   ⚠️  No data for ${date}, skipping`);
        continue;
      }

      // Calculate VWAP
      const vwapData = calculateVWAP(underlyingBars);

      // Analyze mean reversion
      const meanReversionStats = analyzeMeanReversion(vwapData);
      allResults.vwapAnalysis.push({
        date: date,
        totalBars: vwapData.length,
        meanReversion: meanReversionStats
      });

      console.log(`   📊 Mean Reversion Analysis:`);
      meanReversionStats.slice(0, 3).forEach(stat => {
        console.log(`      ${stat.threshold}% threshold: ${stat.reversions}/${stat.crossings} reversions (${stat.reversionRate.toFixed(1)}%), avg ${stat.avgBarsToRevert.toFixed(1)} bars`);
      });

      // Fetch options data for 0DTE
      const dayStart = `${date}T09:30:00-05:00`;
      const dayEnd = `${date}T16:00:00-05:00`;

      const optionsData = await dataCacheManager.getOptionsData(SYMBOL, date, dayStart, dayEnd);
      console.log(`   ✅ Retrieved options data for ${optionsData.length} contracts`);

      if (optionsData.length === 0) {
        console.log(`   ⚠️  No options data for ${date}`);
        continue;
      }

      // Analyze theta
      const { thetaAnalysis, decayRates } = analyzeTheta(optionsData, underlyingBars);
      allResults.thetaAnalysis.push({
        date: date,
        ...thetaAnalysis
      });

      console.log(`   🔻 Theta Analysis:`);
      console.log(`      Avg decay per minute: $${thetaAnalysis.avgDecayPerMinute?.toFixed(4) || 'N/A'} (${thetaAnalysis.avgPercentDecayPerMinute?.toFixed(3) || 'N/A'}%)`);
      console.log(`      Final hour acceleration: ${thetaAnalysis.finalHourAcceleration?.toFixed(2) || 'N/A'}x`);

      // Analyze profit/loss
      const { trades, byPeriod } = analyzeProfitLoss(optionsData, vwapData);
      allResults.profitLossAnalysis.push({
        date: date,
        totalSimulatedTrades: trades.length,
        byPeriod: byPeriod
      });

      console.log(`   💰 P&L Analysis (${trades.length} simulated trades):`);
      [15, 30, 60].forEach(period => {
        const stats = byPeriod[period];
        if (stats) {
          console.log(`      ${period}min: WR ${stats.winRate.toFixed(1)}%, Avg Win ${stats.avgWin.toFixed(1)}%, Avg Loss ${stats.avgLoss.toFixed(1)}%, PF ${stats.profitFactor?.toFixed(2) || 'N/A'}`);
        }
      });

    } catch (error) {
      console.error(`   ❌ Error analyzing ${date}:`, error.message);
    }
  }

  // Calculate aggregate statistics and recommendations
  console.log(`\n\n📊 AGGREGATE ANALYSIS & RECOMMENDATIONS\n`);

  const recommendations = calculateRecommendations(allResults);
  allResults.recommendations = recommendations;

  console.log(`\n💡 RECOMMENDED PARAMETER SETTINGS:\n`);
  console.log(`   Entry Thresholds:`);
  console.log(`      priceVwapThreshold: ${recommendations.priceVwapThreshold?.toFixed(4) || 'N/A'} (${(recommendations.priceVwapThreshold * 100)?.toFixed(2) || 'N/A'}%)`);
  console.log(`      minVwapDistance: ${recommendations.minVwapDistance?.toFixed(4) || 'N/A'} (${(recommendations.minVwapDistance * 100)?.toFixed(2) || 'N/A'}%)`);

  console.log(`\n   Exit Parameters (Theta-Aware):`);
  console.log(`      profitTarget: ${recommendations.profitTarget?.toFixed(2) || 'N/A'} (${(recommendations.profitTarget * 100)?.toFixed(0) || 'N/A'}%)`);
  console.log(`      stopLoss: ${recommendations.stopLoss?.toFixed(2) || 'N/A'} (${(recommendations.stopLoss * 100)?.toFixed(0) || 'N/A'}%)`);
  console.log(`      maxHoldingPeriod: ${recommendations.maxHoldingPeriod || 'N/A'} minutes`);
  console.log(`      thetaAdjustedExit: ${recommendations.thetaAdjustedExit ? 'ENABLED' : 'DISABLED'}`);

  console.log(`\n   Position Management:`);
  console.log(`      maxPositions: ${recommendations.maxPositions || 'N/A'}`);
  console.log(`      capitalPerTrade: ${recommendations.capitalPerTrade?.toFixed(1) || 'N/A'}%`);
  console.log(`      contractsPerTrade: ${recommendations.contractsPerTrade || 'N/A'}`);

  console.log(`\n   Risk Management:`);
  console.log(`      dailyLossLimit: ${recommendations.dailyLossLimit?.toFixed(1) || 'N/A'}%`);
  console.log(`      dailyProfitTarget: ${recommendations.dailyProfitTarget?.toFixed(1) || 'N/A'}%`);

  console.log(`\n   Expected Performance:`);
  console.log(`      Estimated Win Rate: ${recommendations.estimatedWinRate?.toFixed(1) || 'N/A'}%`);
  console.log(`      Estimated Sharpe: ${recommendations.estimatedSharpe?.toFixed(2) || 'N/A'}`);
  console.log(`      Risk/Reward Ratio: 1:${recommendations.riskRewardRatio?.toFixed(2) || 'N/A'}`);

  // Save results
  const fs = require('fs').promises;
  const resultsPath = '/app/analysis-results.json';
  await fs.writeFile(resultsPath, JSON.stringify(allResults, null, 2));
  console.log(`\n💾 Full analysis saved to: ${resultsPath}`);

  await pool.end();

  return allResults;
}

/**
 * Calculate parameter recommendations from analysis
 */
function calculateRecommendations(results) {
  const recommendations = {};

  // Analyze VWAP mean reversion across all days
  const allReversionStats = results.vwapAnalysis.flatMap(day => day.meanReversion);

  // Find optimal threshold (best reversion rate with reasonable frequency)
  const viableThresholds = allReversionStats.filter(stat =>
    stat.crossings >= 20 && stat.reversionRate >= 60
  );

  if (viableThresholds.length > 0) {
    // Sort by reversion rate, take best
    const bestThreshold = viableThresholds.sort((a, b) => b.reversionRate - a.reversionRate)[0];
    recommendations.priceVwapThreshold = bestThreshold.threshold / 100; // Convert to decimal
    recommendations.minVwapDistance = (bestThreshold.threshold * 0.5) / 100; // Half threshold
    recommendations.avgBarsToRevert = bestThreshold.avgBarsToRevert;
  } else {
    // Fallback to conservative
    recommendations.priceVwapThreshold = 0.0015; // 0.15%
    recommendations.minVwapDistance = 0.0010; // 0.10%
  }

  // Analyze profit/loss across all days
  const allPeriodStats = results.profitLossAnalysis.flatMap(day =>
    Object.entries(day.byPeriod || {}).map(([period, stats]) => ({
      period: parseInt(period),
      ...stats
    }))
  ).filter(stat => stat.totalTrades >= 10);

  if (allPeriodStats.length > 0) {
    // Find period with best risk/reward
    const bestPeriod = allPeriodStats.reduce((best, current) => {
      const currentScore = (current.profitFactor || 0) * (current.winRate / 100);
      const bestScore = (best.profitFactor || 0) * (best.winRate / 100);
      return currentScore > bestScore ? current : best;
    });

    recommendations.maxHoldingPeriod = bestPeriod.period;
    recommendations.profitTarget = Math.min(bestPeriod.avgWin / 100, 0.25); // Cap at 25%
    recommendations.stopLoss = Math.min(Math.abs(bestPeriod.avgLoss) / 100, 0.30); // Cap at 30%
    recommendations.estimatedWinRate = bestPeriod.winRate;
    recommendations.riskRewardRatio = bestPeriod.profitFactor || 1.0;
  } else {
    // Conservative fallback
    recommendations.maxHoldingPeriod = 30;
    recommendations.profitTarget = 0.20;
    recommendations.stopLoss = 0.25;
    recommendations.estimatedWinRate = 55;
    recommendations.riskRewardRatio = 1.2;
  }

  // Theta analysis
  const avgThetaDecay = results.thetaAnalysis
    .filter(day => day.avgPercentDecayPerMinute)
    .reduce((sum, day, _, arr) => sum + (day.avgPercentDecayPerMinute || 0) / arr.length, 0);

  if (avgThetaDecay && !isNaN(avgThetaDecay)) {
    // Enable theta-adjusted exits if decay is significant
    recommendations.thetaDecayPerMinute = Math.abs(avgThetaDecay);
    recommendations.thetaAdjustedExit = Math.abs(avgThetaDecay) > 0.1; // If >0.1% per minute

    // Adjust holding period if theta is severe
    if (Math.abs(avgThetaDecay) > 0.3) {
      recommendations.maxHoldingPeriod = Math.min(recommendations.maxHoldingPeriod, 20);
    }
  } else {
    recommendations.thetaAdjustedExit = true; // Enable by default
    recommendations.thetaDecayPerMinute = 0.15; // Conservative estimate
  }

  // Position sizing (more aggressive for higher Sharpe target)
  recommendations.maxPositions = 3; // Run 3 concurrent positions
  recommendations.capitalPerTrade = 25; // 25% per trade
  recommendations.contractsPerTrade = 1; // Start with 1 contract

  // Risk management
  recommendations.dailyLossLimit = 3.0; // Stop trading if down 3%
  recommendations.dailyProfitTarget = 6.0; // Stop trading if up 6%

  // Estimate Sharpe ratio
  // Sharpe = (avg_return * sqrt(trades_per_day)) / std_dev
  // Simplified: Use win rate, profit factor, and trade frequency
  const tradesPerDay = Math.floor(390 / (recommendations.maxHoldingPeriod || 30)) * (recommendations.maxPositions || 3);
  const avgReturn = (recommendations.estimatedWinRate / 100) * recommendations.profitTarget -
                    ((100 - recommendations.estimatedWinRate) / 100) * recommendations.stopLoss;
  const returnStdDev = Math.sqrt(
    (recommendations.estimatedWinRate / 100) * Math.pow(recommendations.profitTarget, 2) +
    ((100 - recommendations.estimatedWinRate) / 100) * Math.pow(recommendations.stopLoss, 2)
  );

  if (returnStdDev > 0) {
    recommendations.estimatedSharpe = (avgReturn * Math.sqrt(tradesPerDay * 252)) / (returnStdDev * Math.sqrt(tradesPerDay * 252));
  } else {
    recommendations.estimatedSharpe = 0;
  }

  return recommendations;
}

// Run analysis
analyzeWeekData()
  .then(results => {
    console.log('\n✅ Analysis complete!\n');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Analysis failed:', error);
    process.exit(1);
  });
