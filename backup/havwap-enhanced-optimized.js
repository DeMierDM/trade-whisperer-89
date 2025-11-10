/**
 * Auto-generated optimized HAVWAP-Enhanced strategy
 * Generated: 2025-11-08T03:18:41.116Z
 * 
 * OPTIMIZATION SUMMARY:
 * - Training Period: 2025-01-27 to 2025-02-18 (17 days)
 * - Validation Period: 2025-02-19 to 2025-02-28 (8 days)
 * - Best Validation Sharpe: 0.000
 * - Best Validation Return: 0.000
 * - Overfitting Risk: MINIMAL - Good generalization
 * - Total Iterations: 50
 * 
 * OPTIMIZED PARAMETERS:
 * - d_entry: 6.434984756961377
 * - d_near: 7.5323327535491575
 * - s_min: 6.714720500350506
 * - rv_cap: 2.350383895827064
 * - profitTargetReversion: 2.3357481427227755
 * - profitTargetTrend: 1.2988376832471071
 * - stopLossReversion: 9.066778358967136
 * - stopLossTrend: 7.492566660861653
 * - timeStopReversion: 1401
 * - timeStopTrend: 2094
 */

const HAVWAP-EnhancedStrategy = require('./havwap-enhanced-proper');

class HAVWAP-EnhancedOptimizedStrategy extends HAVWAP-EnhancedStrategy {
  constructor(customParams = {}) {
    // Use optimized parameters as defaults (validated on out-of-sample data)
    const optimizedParams = {
    "d_entry": 6.434984756961377,
    "d_near": 7.5323327535491575,
    "s_min": 6.714720500350506,
    "rv_cap": 2.350383895827064,
    "profitTargetReversion": 2.3357481427227755,
    "profitTargetTrend": 1.2988376832471071,
    "stopLossReversion": 9.066778358967136,
    "stopLossTrend": 7.492566660861653,
    "timeStopReversion": 1401,
    "timeStopTrend": 2094
};
    
    // Override with any custom parameters
    const finalParams = { ...optimizedParams, ...customParams };
    
    super(finalParams);
    this.name = 'HAVWAP-Enhanced Optimized (Validated)';
    this.version = '1.0.0-optimized-validated';
    this.optimizationInfo = {
      periods: {
      "trainStart": "2025-01-27",
      "trainEnd": "2025-02-18",
      "trainDays": 17,
      "validStart": "2025-02-19",
      "validEnd": "2025-02-28",
      "validDays": 8,
      "totalDays": 25,
      "allWeekdays": [
            "2025-01-27",
            "2025-01-28",
            "2025-01-29",
            "2025-01-30",
            "2025-01-31",
            "2025-02-03",
            "2025-02-04",
            "2025-02-05",
            "2025-02-06",
            "2025-02-07",
            "2025-02-10",
            "2025-02-11",
            "2025-02-12",
            "2025-02-13",
            "2025-02-14",
            "2025-02-17",
            "2025-02-18",
            "2025-02-19",
            "2025-02-20",
            "2025-02-21",
            "2025-02-24",
            "2025-02-25",
            "2025-02-26",
            "2025-02-27",
            "2025-02-28"
      ]
},
      summary: {
      "total_iterations": 50,
      "training_days": 17,
      "validation_days": 8,
      "best_validation_sharpe": "0.000",
      "best_validation_return": "0.000",
      "overfitting_risk": "MINIMAL - Good generalization"
}
    };
  }
  
  getDescription() {
    return `Auto-optimized HAVWAP-Enhanced strategy with train/validation split - ${this.optimizationInfo.summary?.overfitting_risk || 'Unknown'} overfitting risk`;
  }
  
  getOptimizationInfo() {
    return this.optimizationInfo;
  }
}

module.exports = HAVWAP-EnhancedOptimizedStrategy;
