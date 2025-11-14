/**
 * 🔍 Analysis API Endpoint
 * 
 * Provides endpoints to analyze stocks/options before strategy development
 */

const express = require('express');
const OptionsStockAnalyzer = require('../utils/options-stock-analyzer');
const alpacaClientManager = require('../utils/alpaca-client-manager');

const router = express.Router();

/**
 * POST /api/analyze/symbol
 * 
 * Analyze a symbol's stock/options behavior
 * Body: { symbol, startDate, endDate }
 */
router.post('/symbol', async (req, res) => {
  try {
    const { symbol, startDate, endDate } = req.body;
    
    if (!symbol || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: symbol, startDate, endDate'
      });
    }

    console.log(`🔍 Starting analysis for ${symbol} (${startDate} to ${endDate})`);

    // Initialize analyzer and get singleton Alpaca client (TIER 0 Fix #2)
    const analyzer = new OptionsStockAnalyzer();
    const alpacaClient = alpacaClientManager.getClient('backtest');
    
    // Run comprehensive analysis
    const analysisResults = await analyzer.analyzeSymbol(symbol, startDate, endDate, alpacaClient);
    
    // Generate readable report
    const report = analyzer.generateReport();
    
    res.json({
      success: true,
      symbol,
      analysisId: `${symbol}_${Date.now()}`,
      results: analysisResults,
      report,
      recommendations: analysisResults.recommendations,
      summary: {
        volatilityProfile: analysisResults.stockAnalysis.volatilityProfile,
        avgDailyRange: analysisResults.stockAnalysis.avgDailyRange,
        recommendedStrategy: analysisResults.recommendations.strategyType,
        riskParameters: analysisResults.recommendations.parameters.riskManagement,
        confidence: analysisResults.recommendations.confidence
      }
    });

  } catch (error) {
    console.error('Analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/analyze/quick
 * 
 * Quick analysis for immediate strategy parameter suggestions
 * Body: { symbol, days }  // Analyzes last N days
 */
router.post('/quick', async (req, res) => {
  try {
    const { symbol, days = 30 } = req.body;
    
    if (!symbol) {
      return res.status(400).json({
        success: false,
        error: 'Symbol is required'
      });
    }

    // Calculate date range
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - (days * 24 * 60 * 60 * 1000))
      .toISOString().split('T')[0];

    console.log(`⚡ Quick analysis for ${symbol} (last ${days} days)`);

    const analyzer = new OptionsStockAnalyzer();
    const alpacaClient = alpacaClientManager.getClient('backtest');
    
    const analysisResults = await analyzer.analyzeSymbol(symbol, startDate, endDate, alpacaClient);
    
    // Return condensed results for quick strategy setup
    res.json({
      success: true,
      symbol,
      quickRecommendations: {
        strategyType: analysisResults.recommendations.strategyType,
        rsiLevels: analysisResults.recommendations.parameters.RSI,
        vwapThreshold: analysisResults.recommendations.parameters.VWAP.threshold,
        riskManagement: analysisResults.recommendations.parameters.riskManagement,
        deltaTargets: analysisResults.recommendations.parameters.deltaTargets,
        confidence: analysisResults.recommendations.confidence,
        warnings: analysisResults.recommendations.warnings
      },
      keyMetrics: {
        avgDailyRange: analysisResults.stockAnalysis.avgDailyRange,
        volatility: analysisResults.stockAnalysis.volatilityProfile,
        maxMove: analysisResults.stockAnalysis.riskMetrics.maxDailyMove,
        rsiEffectiveness: analysisResults.technicalAnalysis.RSI.neutralZoneTime
      }
    });

  } catch (error) {
    console.error('Quick analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/analyze/history/:symbol
 * 
 * Get previous analysis results for a symbol
 */
router.get('/history/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    
    // Would load from saved analysis files
    // For now, return placeholder
    res.json({
      success: true,
      symbol,
      analyses: [], // Would contain historical analyses
      message: 'Analysis history feature coming soon'
    });
    
  } catch (error) {
    console.error('Failed to get analysis history:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/analyze/compare
 * 
 * Compare analysis results between multiple symbols
 * Body: { symbols: ['SPY', 'IWM'], startDate, endDate }
 */
router.post('/compare', async (req, res) => {
  try {
    const { symbols, startDate, endDate } = req.body;
    
    if (!symbols || !Array.isArray(symbols) || symbols.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'At least 2 symbols required for comparison'
      });
    }

    console.log(`🔄 Comparing analysis for ${symbols.join(', ')}`);

    const analyzer = new OptionsStockAnalyzer();
    const alpacaClient = alpacaClientManager.getClient('backtest');
    
    const comparisons = {};
    
    // Analyze each symbol
    for (const symbol of symbols) {
      try {
        comparisons[symbol] = await analyzer.analyzeSymbol(symbol, startDate, endDate, alpacaClient);
      } catch (error) {
        comparisons[symbol] = { error: error.message };
      }
    }

    // Generate comparison summary
    const comparison = generateComparisonSummary(comparisons);
    
    res.json({
      success: true,
      symbols,
      comparisons,
      summary: comparison,
      recommendations: generateComparisonRecommendations(comparisons)
    });

  } catch (error) {
    console.error('Comparison analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Helper function to generate comparison summary
 */
function generateComparisonSummary(comparisons) {
  const summary = {};
  
  Object.keys(comparisons).forEach(symbol => {
    const analysis = comparisons[symbol];
    if (analysis.error) {
      summary[symbol] = { error: analysis.error };
      return;
    }
    
    summary[symbol] = {
      volatility: analysis.stockAnalysis.volatilityProfile,
      avgDailyRange: analysis.stockAnalysis.avgDailyRange,
      strategyType: analysis.recommendations.strategyType,
      riskLevel: analysis.recommendations.expectedPerformance.riskLevel,
      confidence: analysis.recommendations.confidence
    };
  });
  
  return summary;
}

/**
 * Helper function to generate comparison recommendations
 */
function generateComparisonRecommendations(comparisons) {
  const recommendations = [];
  
  // Find most/least volatile
  const volatilities = Object.entries(comparisons)
    .filter(([_, analysis]) => !analysis.error)
    .map(([symbol, analysis]) => ({
      symbol,
      range: analysis.stockAnalysis.avgDailyRange
    }))
    .sort((a, b) => b.range - a.range);

  if (volatilities.length >= 2) {
    recommendations.push(`${volatilities[0].symbol} is most volatile (${volatilities[0].range.toFixed(2)}% daily range)`);
    recommendations.push(`${volatilities[volatilities.length-1].symbol} is least volatile (${volatilities[volatilities.length-1].range.toFixed(2)}% daily range)`);
  }

  return recommendations;
}

module.exports = router;