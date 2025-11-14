/**
 * StrategyManager - Loads and manages trading strategies
 * Adapts existing backtesting strategies for live streaming data
 */

const fs = require('fs').promises;
const path = require('path');

class StrategyManager {
  constructor() {
    this.strategies = new Map();
    this.strategyInstances = new Map();
    
    // Available strategies from backtesting system
    this.availableStrategies = [
      {
        name: 'iwm-optimized-strategy',
        displayName: 'IWM Optimized Strategy',
        description: 'RSI + VWAP strategy optimized for IWM with 40% target delta',
        file: 'iwm-optimized-strategy.js',
        symbols: ['IWM'],
        riskLevel: 'medium'
      },
      {
        name: 'iwm-optimized-v2-strategy',
        displayName: 'IWM Optimized V2 Strategy', 
        description: 'Enhanced version with improved signal strength calculation',
        file: 'iwm-optimized-v2-strategy.js',
        symbols: ['IWM'],
        riskLevel: 'medium'
      },
      {
        name: 'small-account-rsi-vwap',
        displayName: 'Small Account RSI VWAP',
        description: 'Multi-timeframe RSI with VWAP for small accounts',
        file: 'small-account-rsi-vwap.js',
        symbols: ['SPY', 'QQQ', 'IWM'],
        riskLevel: 'conservative'
      },
      {
        name: 'rsi-vwap-morning-session',
        displayName: 'Morning Session RSI VWAP',
        description: 'Morning session focused strategy with opening range breakouts',
        file: 'rsi-vwap-morning-session.js',
        symbols: ['SPY', 'QQQ'],
        riskLevel: 'aggressive'
      }
    ];
    
    console.log('📋 [StrategyManager] Initialized with', this.availableStrategies.length, 'available strategies');
  }

  /**
   * Load strategies from backtesting system
   */
  async loadStrategies() {
    const localStrategiesPath = path.join(__dirname, '../strategies');
    const backtesingStrategiesPath = path.join(__dirname, '../../../backtesting-server/strategies');
    
    console.log('📁 [StrategyManager] Loading strategies from local:', localStrategiesPath);
    console.log('📁 [StrategyManager] Loading strategies from backtesting:', backtesingStrategiesPath);
    
    for (const strategyConfig of this.availableStrategies) {
      try {
        let strategyPath = path.join(localStrategiesPath, strategyConfig.file);
        
        // Check local strategies first
        try {
          await fs.access(strategyPath);
        } catch (error) {
          // If not found locally, try backtesting server path
          strategyPath = path.join(backtesingStrategiesPath, strategyConfig.file);
          try {
            await fs.access(strategyPath);
          } catch (error2) {
            console.warn(`⚠️ [StrategyManager] Strategy file not found: ${strategyConfig.file}`);
            continue;
          }
        }

        // Load strategy class (we'll create an adapter wrapper)
        const StrategyClass = require(strategyPath);
        
        // Create streaming adapter wrapper
        const StreamingStrategyAdapter = this.createStreamingAdapter(StrategyClass);
        
        this.strategies.set(strategyConfig.name, {
          ...strategyConfig,
          StrategyClass: StreamingStrategyAdapter,
          loaded: true
        });
        
        console.log(`✅ [StrategyManager] Loaded strategy: ${strategyConfig.displayName}`);
        
      } catch (error) {
        console.error(`❌ [StrategyManager] Failed to load strategy ${strategyConfig.name}:`, error.message);
        
        // Add as unavailable
        this.strategies.set(strategyConfig.name, {
          ...strategyConfig,
          loaded: false,
          error: error.message
        });
      }
    }
    
    console.log(`🎯 [StrategyManager] Loaded ${Array.from(this.strategies.values()).filter(s => s.loaded).length} strategies successfully`);
  }

  /**
   * Create streaming adapter for backtesting strategy
   */
  createStreamingAdapter(OriginalStrategyClass) {
    const self = this;
    
    class StreamingStrategyAdapter extends OriginalStrategyClass {
      constructor(parameters = {}) {
        super(parameters);
        
        // Streaming-specific properties
        this.streamingMode = true;
        this.realtimeBars = [];
        this.maxBarHistory = 200; // Keep last 200 bars for indicators
        this.lastProcessedTime = null;
        
        // Real-time state
        this.currentPrice = null;
        this.currentVolume = null;
        this.currentBar = null;
        
        console.log(`🔄 [StreamingAdapter] ${this.constructor.name} initialized for streaming`);
      }

      /**
       * Process incoming real-time market data
       */
      processRealtimeData(marketData) {
        try {
          // Update current market state
          if (marketData.type === 'quote') {
            this.currentPrice = marketData.midpoint || (marketData.bid + marketData.ask) / 2;
          } else if (marketData.type === 'trade') {
            this.currentPrice = marketData.price;
            this.currentVolume = marketData.size;
            
            // Create/update current bar
            this.updateCurrentBar(marketData);
          }
          
          return this.checkForSignals();
          
        } catch (error) {
          console.error(`❌ [StreamingAdapter] Error processing realtime data:`, error);
          return [];
        }
      }

      /**
       * Update current OHLCV bar from trade data
       */
      updateCurrentBar(tradeData) {
        const timestamp = new Date(tradeData.timestamp);
        const barMinute = new Date(timestamp.getFullYear(), timestamp.getMonth(), 
                                   timestamp.getDate(), timestamp.getHours(), timestamp.getMinutes());
        
        // Check if we need a new bar (new minute)
        if (!this.currentBar || this.currentBar.t.getTime() !== barMinute.getTime()) {
          // Save previous bar to history
          if (this.currentBar) {
            this.realtimeBars.push(this.currentBar);
            
            // Maintain max history
            if (this.realtimeBars.length > this.maxBarHistory) {
              this.realtimeBars = this.realtimeBars.slice(-this.maxBarHistory);
            }
          }
          
          // Create new bar
          this.currentBar = {
            t: barMinute,
            o: tradeData.price,
            h: tradeData.price,
            l: tradeData.price,
            c: tradeData.price,
            v: tradeData.size || 0
          };
        } else {
          // Update existing bar
          this.currentBar.h = Math.max(this.currentBar.h, tradeData.price);
          this.currentBar.l = Math.min(this.currentBar.l, tradeData.price);
          this.currentBar.c = tradeData.price;
          this.currentBar.v += tradeData.size || 0;
        }
      }

      /**
       * Check for signals using current bar data
       */
      checkForSignals() {
        if (!this.currentBar || this.realtimeBars.length < 30) {
          return [];
        }

        // Create bars array for signal generation (history + current)
        const barsForAnalysis = [...this.realtimeBars, this.currentBar];
        
        // Call original generateSignals method
        const signals = this.generateSignals(barsForAnalysis);
        
        // Filter out duplicate signals (same minute)
        const currentMinute = this.currentBar.t.getTime();
        if (this.lastProcessedTime === currentMinute) {
          return [];
        }
        
        this.lastProcessedTime = currentMinute;
        
        // Enhance signals with streaming metadata
        return signals.map(signal => ({
          ...signal,
          streaming_mode: true,
          current_price: this.currentPrice,
          bar_timestamp: this.currentBar.t,
          signal_timestamp: new Date(),
          bars_analyzed: barsForAnalysis.length
        }));
      }

      /**
       * Get current market state
   */
      getCurrentState() {
        return {
          currentPrice: this.currentPrice,
          currentVolume: this.currentVolume,
          currentBar: this.currentBar,
          totalBars: this.realtimeBars.length,
          lastSignalTime: this.lastProcessedTime
        };
      }

      /**
       * Reset strategy state
       */
      resetStreaming() {
        this.realtimeBars = [];
        this.currentBar = null;
        this.currentPrice = null;
        this.currentVolume = null;
        this.lastProcessedTime = null;
        
        // Call parent reset if it exists
        if (super.reset) {
          super.reset();
        }
        
        console.log(`🔄 [StreamingAdapter] ${this.constructor.name} state reset`);
      }

      /**
       * Get strategy info for display
       */
      getStreamingInfo() {
        const baseInfo = super.getParameters ? super.getParameters() : {};
        
        return {
          ...baseInfo,
          streamingMode: true,
          barsProcessed: this.realtimeBars.length,
          currentPrice: this.currentPrice,
          lastUpdate: new Date()
        };
      }
    }
    
    return StreamingStrategyAdapter;
  }

  /**
   * Create strategy instance for bot
   */
  createStrategyInstance(strategyName, parameters = {}) {
    const strategyConfig = this.strategies.get(strategyName);
    
    if (!strategyConfig) {
      throw new Error(`Strategy not found: ${strategyName}`);
    }
    
    if (!strategyConfig.loaded) {
      throw new Error(`Strategy not loaded: ${strategyName} - ${strategyConfig.error || 'Unknown error'}`);
    }
    
    try {
      const instance = new strategyConfig.StrategyClass(parameters);
      
      // Store instance reference
      const instanceId = `${strategyName}_${Date.now()}`;
      this.strategyInstances.set(instanceId, instance);
      
      console.log(`🎯 [StrategyManager] Created strategy instance: ${strategyName}`);
      
      return {
        instanceId,
        instance,
        strategyName,
        parameters
      };
      
    } catch (error) {
      console.error(`❌ [StrategyManager] Failed to create strategy instance:`, error);
      throw error;
    }
  }

  /**
   * Get strategy instance by ID
   */
  getStrategyInstance(instanceId) {
    return this.strategyInstances.get(instanceId);
  }

  /**
   * Remove strategy instance
   */
  removeStrategyInstance(instanceId) {
    const removed = this.strategyInstances.delete(instanceId);
    if (removed) {
      console.log(`🗑️ [StrategyManager] Removed strategy instance: ${instanceId}`);
    }
    return removed;
  }

  /**
   * Get available strategies for UI
   */
  getAvailableStrategies() {
    return Array.from(this.strategies.values()).map(strategy => ({
      name: strategy.name,
      displayName: strategy.displayName,
      description: strategy.description,
      symbols: strategy.symbols,
      riskLevel: strategy.riskLevel,
      loaded: strategy.loaded,
      error: strategy.error
    }));
  }

  /**
   * Get strategy configuration
   */
  getStrategyConfig(strategyName) {
    return this.strategies.get(strategyName);
  }

  /**
   * Validate strategy parameters
   */
  validateStrategyParameters(strategyName, parameters) {
    const strategyConfig = this.strategies.get(strategyName);
    
    if (!strategyConfig) {
      throw new Error(`Strategy not found: ${strategyName}`);
    }

    // Basic validation - can be enhanced per strategy
    const errors = [];
    
    // Check required parameters based on strategy type
    if (strategyName.includes('rsi') && !parameters.rsiPeriod) {
      errors.push('RSI period is required');
    }
    
    if (parameters.rsiOversold && (parameters.rsiOversold < 10 || parameters.rsiOversold > 40)) {
      errors.push('RSI oversold must be between 10 and 40');
    }
    
    if (parameters.rsiOverbought && (parameters.rsiOverbought < 60 || parameters.rsiOverbought > 90)) {
      errors.push('RSI overbought must be between 60 and 90');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get strategy statistics
   */
  getStrategyStats() {
    const totalStrategies = this.strategies.size;
    const loadedStrategies = Array.from(this.strategies.values()).filter(s => s.loaded).length;
    const activeInstances = this.strategyInstances.size;
    
    return {
      totalStrategies,
      loadedStrategies,
      activeInstances,
      availableStrategies: this.getAvailableStrategies()
    };
  }
}

module.exports = StrategyManager;