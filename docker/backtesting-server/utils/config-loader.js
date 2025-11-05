/**
 * Configuration Loader
 * Loads backtesting configuration from .claude/backtesting-config.json
 */

const fs = require('fs');
const path = require('path');

class ConfigLoader {
  constructor() {
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      const configPath = path.join(__dirname, '../../../.claude/backtesting-config.json');

      if (fs.existsSync(configPath)) {
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);
        console.log('✅ [CONFIG] Loaded backtesting configuration from .claude/backtesting-config.json');
        return config;
      } else {
        console.log('⚠️ [CONFIG] Config file not found, using defaults');
        return this.getDefaultConfig();
      }
    } catch (error) {
      console.error('❌ [CONFIG] Error loading config:', error.message);
      return this.getDefaultConfig();
    }
  }

  getDefaultConfig() {
    return {
      strikeFiltering: {
        enabled: true,
        strategy: "distance_from_atm",
        maxDistanceDollars: 5,
        strikeSpacing: 5
      },
      greeksCalculation: {
        precision: 8,
        logDetailedDebug: false,
        validateInputs: true
      },
      dataCache: {
        useSQL: true,
        fallbackToAPI: true,
        preCacheHistoricalData: false
      },
      contractSelection: {
        minVolume: 1,
        maxSpreadPct: 15,
        preferredDTE: "0DTE"
      }
    };
  }

  // Getters for specific config sections
  getStrikeFiltering() {
    return this.config.strikeFiltering || this.getDefaultConfig().strikeFiltering;
  }

  getGreeksConfig() {
    return this.config.greeksCalculation || this.getDefaultConfig().greeksCalculation;
  }

  getDataCacheConfig() {
    return this.config.dataCache || this.getDefaultConfig().dataCache;
  }

  getContractSelection() {
    return this.config.contractSelection || this.getDefaultConfig().contractSelection;
  }

  // Calculate strike range based on config
  getStrikeRange() {
    const config = this.getStrikeFiltering();
    if (!config.enabled) {
      return 10; // Default wide range if filtering disabled
    }

    // Calculate how many strikes fit in maxDistanceDollars
    // For SPY: $5 max distance with $5 spacing = 1 strike each side
    const numStrikes = Math.ceil(config.maxDistanceDollars / config.strikeSpacing);
    return numStrikes;
  }

  getStrikeSpacing() {
    return this.getStrikeFiltering().strikeSpacing || 5;
  }
}

// Singleton instance
let instance = null;

module.exports = {
  getInstance: () => {
    if (!instance) {
      instance = new ConfigLoader();
    }
    return instance;
  },
  ConfigLoader
};
