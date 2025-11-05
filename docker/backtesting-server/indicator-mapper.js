/**
 * INDICATOR SPECIFICATION MAPPER
 * Extracts indicator requirements from strategy files and maps them to chart-compatible format
 */

const fs = require('fs');
const path = require('path');

class IndicatorMapper {
  constructor() {
    this.chartColorMapping = {
      // Existing LiveTradingViewChart color scheme
      'rsi2': '#ff6b6b',      // Red for RSI(2)
      'rsi9': '#4ecdc4',      // Teal for RSI(9)
      'roc3': '#45b7d1',      // Blue for ROC(3)
      'vwap': '#96ceb4',      // Green for VWAP
      'vwapslope': '#ffeaa7', // Yellow for VWAP Slope
      'macd': '#a29bfe',      // Purple for MACD
      'sma': '#fd79a8',       // Pink for SMA
      'ema': '#fdcb6e',       // Orange for EMA
    };

    this.chartScaleMapping = {
      'rsi2': { type: 'rsi', range: [0, 100], position: 'top' },
      'rsi9': { type: 'rsi', range: [0, 100], position: 'top' },
      'roc3': { type: 'roc', range: [-0.5, 0.5], position: 'middle' },
      'vwap': { type: 'price', position: 'right' },
      'vwapslope': { type: 'slope', range: [-0.01, 0.5], position: 'bottom' },
      'macd': { type: 'oscillator', position: 'bottom' },
      'sma': { type: 'price', position: 'right' },
      'ema': { type: 'price', position: 'right' }
    };
  }

  /**
   * Extract indicator specifications from a strategy file
   */
  extractIndicatorsFromStrategy(strategyPath) {
    try {
      // Clear require cache for hot reload
      delete require.cache[require.resolve(strategyPath)];
      const strategy = require(strategyPath);

      if (!strategy.signals || !strategy.signals.indicators) {
        console.log(`⚠️ No indicators found in strategy: ${strategy.name}`);
        return {};
      }

      const indicators = {};
      const strategyIndicators = strategy.signals.indicators;

      for (const indicator of strategyIndicators) {
        switch (indicator.name.toLowerCase()) {
          case 'rsi':
            this._extractRSIIndicators(indicator, indicators);
            break;
          case 'roc':
            this._extractROCIndicators(indicator, indicators);
            break;
          case 'vwap':
            this._extractVWAPIndicators(indicator, indicators);
            break;
          case 'vwap_slope':
            this._extractVWAPSlopeIndicators(indicator, indicators);
            break;
          case 'macd':
            this._extractMACDIndicators(indicator, indicators);
            break;
          case 'volume':
            this._extractVolumeIndicators(indicator, indicators);
            break;
          case 'volatility':
            this._extractVolatilityIndicators(indicator, indicators);
            break;
          default:
            console.log(`ℹ️ Unknown indicator type: ${indicator.name}`);
        }
      }

      console.log(`✅ Extracted ${Object.keys(indicators).length} indicators from ${strategy.name}`);
      return {
        strategyName: strategy.name,
        indicators: indicators,
        metadata: {
          version: strategy.version,
          author: strategy.author,
          description: strategy.description
        }
      };

    } catch (error) {
      console.error(`❌ Error extracting indicators from ${strategyPath}:`, error.message);
      return {};
    }
  }

  /**
   * Extract RSI indicator specifications
   */
  _extractRSIIndicators(indicator, indicators) {
    if (indicator.params && Array.isArray(indicator.params)) {
      indicator.params.forEach(param => {
        const period = param.period;
        const name = param.name || `rsi${period}`;
        
        indicators[name] = {
          type: 'rsi',
          period: period,
          color: this.chartColorMapping[name] || '#6c5ce7',
          scale: this.chartScaleMapping[name] || { type: 'rsi', range: [0, 100], position: 'top' },
          calculation: 'rsi',
          params: { period }
        };
      });
    }
  }

  /**
   * Extract ROC (Rate of Change) indicator specifications
   */
  _extractROCIndicators(indicator, indicators) {
    if (indicator.params && Array.isArray(indicator.params)) {
      indicator.params.forEach(param => {
        const period = param.period;
        const name = param.name || `roc${period}`;
        
        indicators[name] = {
          type: 'roc',
          period: period,
          color: this.chartColorMapping[name] || '#45b7d1',
          scale: this.chartScaleMapping[name] || { type: 'roc', range: [-0.5, 0.5], position: 'middle' },
          calculation: 'roc',
          params: { period }
        };
      });
    }
  }

  /**
   * Extract VWAP indicator specifications
   */
  _extractVWAPIndicators(indicator, indicators) {
    indicators['vwap'] = {
      type: 'vwap',
      color: this.chartColorMapping['vwap'] || '#96ceb4',
      scale: this.chartScaleMapping['vwap'] || { type: 'price', position: 'right' },
      calculation: 'vwap',
      params: indicator.params || {}
    };
  }

  /**
   * Extract VWAP Slope indicator specifications
   */
  _extractVWAPSlopeIndicators(indicator, indicators) {
    const lookback = indicator.params?.lookback || 5;
    
    indicators['vwapslope'] = {
      type: 'vwap_slope',
      lookback: lookback,
      color: this.chartColorMapping['vwapslope'] || '#ffeaa7',
      scale: this.chartScaleMapping['vwapslope'] || { type: 'slope', range: [-0.01, 0.5], position: 'bottom' },
      calculation: 'vwap_slope',
      params: { lookback }
    };
  }

  /**
   * Extract MACD indicator specifications
   */
  _extractMACDIndicators(indicator, indicators) {
    const params = indicator.params || { fast: 12, slow: 26, signal: 9 };
    
    indicators['macd'] = {
      type: 'macd',
      color: this.chartColorMapping['macd'] || '#a29bfe',
      scale: this.chartScaleMapping['macd'] || { type: 'oscillator', position: 'bottom' },
      calculation: 'macd',
      params: params
    };
  }

  /**
   * Extract Volume indicator specifications
   */
  _extractVolumeIndicators(indicator, indicators) {
    // Volume indicators typically don't display on price chart but used for calculations
    indicators['volume'] = {
      type: 'volume',
      calculation: 'volume_analysis',
      params: indicator.params || { imbalance: true }
    };
  }

  /**
   * Extract Volatility indicator specifications
   */
  _extractVolatilityIndicators(indicator, indicators) {
    const period = indicator.params?.period || 20;
    
    indicators['volatility'] = {
      type: 'volatility',
      period: period,
      calculation: 'volatility',
      params: { period }
    };
  }

  /**
   * Get all strategy indicator specifications from strategies directory
   */
  getAllStrategyIndicators() {
    const strategiesDir = path.join(__dirname, 'strategies');
    const allIndicators = {};

    try {
      const files = fs.readdirSync(strategiesDir)
        .filter(f => f.endsWith('.js') && !f.includes('template'));

      for (const file of files) {
        const strategyPath = path.join(strategiesDir, file);
        const strategySpecs = this.extractIndicatorsFromStrategy(strategyPath);
        
        if (strategySpecs.indicators) {
          allIndicators[strategySpecs.strategyName] = strategySpecs;
        }
      }

      console.log(`📊 Processed ${files.length} strategy files, found ${Object.keys(allIndicators).length} with indicators`);
      return allIndicators;

    } catch (error) {
      console.error('❌ Error processing strategy directory:', error.message);
      return {};
    }
  }

  /**
   * Get chart-compatible indicator specifications for a specific strategy
   */
  getChartIndicatorSpecs(strategyName) {
    const allStrategies = this.getAllStrategyIndicators();
    const strategy = allStrategies[strategyName];

    if (!strategy) {
      console.log(`⚠️ Strategy not found: ${strategyName}`);
      return {};
    }

    // Format for LiveTradingViewChart component
    const chartSpecs = {};
    
    Object.entries(strategy.indicators).forEach(([name, spec]) => {
      if (spec.scale && spec.color) {
        chartSpecs[name] = {
          color: spec.color,
          scale: spec.scale,
          type: spec.type,
          params: spec.params || {}
        };
      }
    });

    console.log(`📈 Chart specs for ${strategyName}:`, Object.keys(chartSpecs));
    return chartSpecs;
  }

  /**
   * Get indicator calculation requirements for backtesting engine
   */
  getCalculationRequirements(strategyName) {
    const allStrategies = this.getAllStrategyIndicators();
    const strategy = allStrategies[strategyName];

    if (!strategy) {
      return {};
    }

    const requirements = {};
    
    Object.entries(strategy.indicators).forEach(([name, spec]) => {
      requirements[name] = {
        calculation: spec.calculation,
        params: spec.params,
        type: spec.type
      };
    });

    return requirements;
  }
}

module.exports = IndicatorMapper;