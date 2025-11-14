/**
 * AUTOMATIC STRATEGY DISCOVERY & REGISTRY SYSTEM
 * 
 * This module provides automatic strategy discovery by scanning the strategies directory.
 * No more manual configuration required when adding new strategies!
 * 
 * Features:
 * - Automatic strategy file discovery
 * - Strategy metadata extraction
 * - Dynamic strategy instantiation
 * - Error handling for invalid strategies
 * - Hot-reload capability (future feature)
 */

const fs = require('fs');
const path = require('path');

class StrategyRegistry {
  constructor(strategiesDirectory = './strategies') {
    this.strategiesDirectory = strategiesDirectory;
    this.strategies = new Map();
    this.strategyMetadata = new Map();
    this.loadedStrategies = new Set();
    
    console.log(`🔍 [STRATEGY REGISTRY] Initializing automatic strategy discovery`);
    this.discoverStrategies();
  }

  /**
   * Automatically discover all strategy files in the strategies directory
   */
  discoverStrategies() {
    try {
      const strategiesPath = path.resolve(this.strategiesDirectory);
      
      if (!fs.existsSync(strategiesPath)) {
        console.warn(`⚠️ [STRATEGY REGISTRY] Strategies directory not found: ${strategiesPath}`);
        return;
      }

      const files = fs.readdirSync(strategiesPath);
      const strategyFiles = files.filter(file => 
        file.endsWith('.js') && 
        !file.startsWith('_') && // Ignore files starting with underscore
        file !== 'index.js' &&
        file !== 'strategy-registry.js' &&
        file !== 'small-account-strategy-factory.js' // Skip factory file
      );

      console.log(`📁 [STRATEGY REGISTRY] Found ${strategyFiles.length} strategy files`);

      for (const file of strategyFiles) {
        this.loadStrategy(file, strategiesPath);
      }

      console.log(`✅ [STRATEGY REGISTRY] Successfully registered ${this.strategies.size} strategies`);
      this.logRegisteredStrategies();

    } catch (error) {
      console.error(`❌ [STRATEGY REGISTRY] Error discovering strategies:`, error);
    }
  }

  /**
   * Load and register a single strategy
   */
  loadStrategy(filename, strategiesPath) {
    try {
      const filePath = path.join(strategiesPath, filename);
      const strategyName = this.extractStrategyName(filename);
      
      // Clear require cache for hot-reload capability
      delete require.cache[require.resolve(filePath)];
      
      // Load the strategy module
      const StrategyClass = require(filePath);
      
      // Validate strategy class
      if (!this.validateStrategyClass(StrategyClass, filename)) {
        return;
      }

      // Extract metadata from strategy
      const metadata = this.extractStrategyMetadata(StrategyClass, filename);
      
      // Register strategy
      this.strategies.set(strategyName, StrategyClass);
      this.strategyMetadata.set(strategyName, metadata);
      this.loadedStrategies.add(filename);

      console.log(`✅ [STRATEGY LOADED] ${strategyName}: ${metadata.description}`);

    } catch (error) {
      console.error(`❌ [STRATEGY LOAD ERROR] ${filename}:`, error.message);
    }
  }

  /**
   * Extract strategy name from filename
   */
  extractStrategyName(filename) {
    return filename.replace('.js', '').replace(/_/g, '-');
  }

  /**
   * Validate that the strategy class has required methods
   */
  validateStrategyClass(StrategyClass, filename) {
    if (typeof StrategyClass !== 'function') {
      console.warn(`⚠️ [STRATEGY VALIDATION] ${filename}: Not a valid class export`);
      return false;
    }

    // Create a temporary instance to check methods
    try {
      const tempInstance = new StrategyClass({ accountSize: 1000 });
      
      const requiredMethods = ['generateSignals'];
      const missingMethods = requiredMethods.filter(method => 
        typeof tempInstance[method] !== 'function'
      );

      if (missingMethods.length > 0) {
        console.warn(`⚠️ [STRATEGY VALIDATION] ${filename}: Missing required methods: ${missingMethods.join(', ')}`);
        return false;
      }

      return true;

    } catch (error) {
      console.warn(`⚠️ [STRATEGY VALIDATION] ${filename}: Cannot instantiate - ${error.message}`);
      return false;
    }
  }

  /**
   * Extract metadata from strategy class
   */
  extractStrategyMetadata(StrategyClass, filename) {
    try {
      // Create temporary instance to get metadata
      const tempInstance = new StrategyClass({ accountSize: 1000 });
      
      return {
        name: tempInstance.name || this.extractStrategyName(filename),
        description: this.generateDescription(tempInstance, filename),
        riskLevel: this.determineRiskLevel(tempInstance),
        tradingStyle: this.determineTradingStyle(tempInstance),
        maxRiskPerTrade: tempInstance.maxRiskPerTrade || 0.05,
        expectedMethods: this.getAvailableMethods(tempInstance),
        filename: filename,
        lastLoaded: new Date().toISOString()
      };

    } catch (error) {
      console.warn(`⚠️ [METADATA EXTRACTION] ${filename}: ${error.message}`);
      return {
        name: this.extractStrategyName(filename),
        description: `Strategy from ${filename}`,
        riskLevel: 'Unknown',
        tradingStyle: 'Unknown',
        maxRiskPerTrade: 0.05,
        expectedMethods: ['generateSignals'],
        filename: filename,
        lastLoaded: new Date().toISOString()
      };
    }
  }

  /**
   * Generate description based on strategy characteristics
   */
  generateDescription(strategy, filename) {
    if (strategy.name) return strategy.name;
    
    const name = filename.replace('.js', '');
    
    if (name.includes('small-account')) {
      if (name.includes('rsi')) return 'Small Account RSI-VWAP Strategy';
      if (name.includes('momentum')) return 'Small Account Momentum Strategy'; 
      if (name.includes('iv')) return 'Small Account IV Mean Reversion Strategy';
      return 'Small Account Growth Strategy';
    }
    
    if (name.includes('rsi')) return 'RSI-based Trading Strategy';
    if (name.includes('vwap')) return 'VWAP-based Trading Strategy';
    if (name.includes('breakthrough')) return 'Breakthrough Trading Strategy';
    
    return `Strategy: ${name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}`;
  }

  /**
   * Determine risk level based on strategy parameters
   */
  determineRiskLevel(strategy) {
    const maxRisk = strategy.maxRiskPerTrade || 0.05;
    
    if (maxRisk <= 0.02) return 'Low';
    if (maxRisk <= 0.03) return 'Low-Medium';
    if (maxRisk <= 0.05) return 'Medium';
    if (maxRisk <= 0.08) return 'Medium-High';
    return 'High';
  }

  /**
   * Determine trading style based on strategy characteristics
   */
  determineTradingStyle(strategy) {
    const name = strategy.name || '';
    
    if (name.toLowerCase().includes('conservative')) return 'Conservative Growth';
    if (name.toLowerCase().includes('aggressive')) return 'Aggressive Growth';
    if (name.toLowerCase().includes('momentum')) return 'Momentum Trading';
    if (name.toLowerCase().includes('mean reversion')) return 'Mean Reversion';
    if (name.toLowerCase().includes('small account')) return 'Small Account Growth';
    if (name.toLowerCase().includes('breakthrough')) return 'Breakout Trading';
    
    return 'General Trading';
  }

  /**
   * Get available methods from strategy instance
   */
  getAvailableMethods(strategy) {
    const methods = [];
    const prototype = Object.getPrototypeOf(strategy);
    
    for (const method of Object.getOwnPropertyNames(prototype)) {
      if (typeof strategy[method] === 'function' && method !== 'constructor') {
        methods.push(method);
      }
    }
    
    return methods;
  }

  /**
   * Get strategy class by name
   */
  getStrategy(strategyName) {
    return this.strategies.get(strategyName);
  }

  /**
   * Get strategy metadata by name
   */
  getStrategyMetadata(strategyName) {
    return this.strategyMetadata.get(strategyName);
  }

  /**
   * Get all available strategy names
   */
  getAvailableStrategies() {
    return Array.from(this.strategies.keys());
  }

  /**
   * Get all strategies with metadata
   */
  getAllStrategiesWithMetadata() {
    const strategies = [];
    
    for (const [name, strategyClass] of this.strategies) {
      const metadata = this.strategyMetadata.get(name);
      strategies.push({
        name,
        class: strategyClass,
        ...metadata
      });
    }
    
    return strategies;
  }

  /**
   * Check if strategy exists
   */
  hasStrategy(strategyName) {
    return this.strategies.has(strategyName);
  }

  /**
   * Create strategy instance with parameters
   */
  createStrategy(strategyName, parameters = {}) {
    const StrategyClass = this.strategies.get(strategyName);
    
    if (!StrategyClass) {
      throw new Error(`Strategy '${strategyName}' not found. Available strategies: ${this.getAvailableStrategies().join(', ')}`);
    }

    try {
      const strategy = new StrategyClass(parameters);
      const metadata = this.strategyMetadata.get(strategyName);
      
      // Attach metadata to instance
      strategy._metadata = metadata;
      strategy._registryName = strategyName;
      
      console.log(`🎯 [STRATEGY CREATED] ${strategyName} with parameters:`, Object.keys(parameters));
      
      return strategy;

    } catch (error) {
      console.error(`❌ [STRATEGY CREATION ERROR] ${strategyName}:`, error);
      throw error;
    }
  }

  /**
   * Reload all strategies (for hot-reload)
   */
  reloadStrategies() {
    console.log(`🔄 [STRATEGY REGISTRY] Reloading all strategies...`);
    
    this.strategies.clear();
    this.strategyMetadata.clear();
    this.loadedStrategies.clear();
    
    this.discoverStrategies();
  }

  /**
   * Log all registered strategies
   */
  logRegisteredStrategies() {
    console.log(`\n📋 [REGISTERED STRATEGIES] Found ${this.strategies.size} strategies:`);
    
    for (const [name, metadata] of this.strategyMetadata) {
      console.log(`   • ${name}: ${metadata.description} (${metadata.riskLevel} Risk)`);
    }
    
    console.log(``);
  }

  /**
   * Get strategy statistics
   */
  getRegistryStats() {
    const riskLevels = {};
    const tradingStyles = {};
    
    for (const metadata of this.strategyMetadata.values()) {
      riskLevels[metadata.riskLevel] = (riskLevels[metadata.riskLevel] || 0) + 1;
      tradingStyles[metadata.tradingStyle] = (tradingStyles[metadata.tradingStyle] || 0) + 1;
    }
    
    return {
      totalStrategies: this.strategies.size,
      riskLevels,
      tradingStyles,
      lastDiscovery: new Date().toISOString()
    };
  }

  /**
   * Validate strategy for backtesting
   */
  validateStrategyForBacktest(strategyName) {
    if (!this.hasStrategy(strategyName)) {
      return {
        valid: false,
        error: `Strategy '${strategyName}' not found`,
        availableStrategies: this.getAvailableStrategies()
      };
    }

    const metadata = this.getStrategyMetadata(strategyName);
    const requiredMethods = ['generateSignals'];
    const availableMethods = metadata.expectedMethods || [];
    
    const missingMethods = requiredMethods.filter(method => 
      !availableMethods.includes(method)
    );

    if (missingMethods.length > 0) {
      return {
        valid: false,
        error: `Strategy missing required methods: ${missingMethods.join(', ')}`
      };
    }

    return {
      valid: true,
      metadata
    };
  }
}

// Create global registry instance
const globalRegistry = new StrategyRegistry();

module.exports = {
  StrategyRegistry,
  globalRegistry
};