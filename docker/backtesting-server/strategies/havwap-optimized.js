/**
 * Auto-generated optimized HAVWAP strategy
 * Generated: 2025-10-27T01:10:34.540Z
 * 
 * OPTIMIZATION SUMMARY:
 * - Training Period: 2024-09-02 to 2024-10-09 (28 days)
 * - Validation Period: 2024-10-10 to 2024-10-25 (12 days)
 * - Best Validation Sharpe: 0.000
 * - Best Validation Return: 0.000
 * - Overfitting Risk: MINIMAL - Good generalization
 * - Total Iterations: 25
 * 
 * OPTIMIZED PARAMETERS:
 * - d_entry: 0.021348108727869963
 * - d_near: 5.017946817168086
 * - s_min: 4.84215972500623
 * - rv_cap: 1.3750384198570798
 * - profitTargetReversion: 2.935600435791863
 * - profitTargetTrend: 9.900769776631616
 * - stopLossReversion: 3.316709858979141
 * - stopLossTrend: 7.289683907296509
 * - timeStopReversion: 1391
 * - timeStopTrend: 820
 */

const HAVWAPStrategy = require('./havwap-proper');

class HAVWAPOptimizedStrategy extends HAVWAPStrategy {
  constructor(customParams = {}) {
    // Use optimized parameters as defaults (validated on out-of-sample data)
    const optimizedParams = {
    "d_entry": 0.021348108727869963,
    "d_near": 5.017946817168086,
    "s_min": 4.84215972500623,
    "rv_cap": 1.3750384198570798,
    "profitTargetReversion": 2.935600435791863,
    "profitTargetTrend": 9.900769776631616,
    "stopLossReversion": 3.316709858979141,
    "stopLossTrend": 7.289683907296509,
    "timeStopReversion": 1391,
    "timeStopTrend": 820
};
    
    // Override with any custom parameters
    const finalParams = { ...optimizedParams, ...customParams };
    
    super(finalParams);
    this.name = 'HAVWAP Optimized (Validated)';
    this.version = '1.0.0-optimized-validated';
    this.optimizationInfo = {
      periods: {
      "trainStart": "2024-09-02",
      "trainEnd": "2024-10-09",
      "trainDays": 28,
      "validStart": "2024-10-10",
      "validEnd": "2024-10-25",
      "validDays": 12,
      "totalDays": 40,
      "allWeekdays": [
            "2024-09-02",
            "2024-09-03",
            "2024-09-04",
            "2024-09-05",
            "2024-09-06",
            "2024-09-09",
            "2024-09-10",
            "2024-09-11",
            "2024-09-12",
            "2024-09-13",
            "2024-09-16",
            "2024-09-17",
            "2024-09-18",
            "2024-09-19",
            "2024-09-20",
            "2024-09-23",
            "2024-09-24",
            "2024-09-25",
            "2024-09-26",
            "2024-09-27",
            "2024-09-30",
            "2024-10-01",
            "2024-10-02",
            "2024-10-03",
            "2024-10-04",
            "2024-10-07",
            "2024-10-08",
            "2024-10-09",
            "2024-10-10",
            "2024-10-11",
            "2024-10-14",
            "2024-10-15",
            "2024-10-16",
            "2024-10-17",
            "2024-10-18",
            "2024-10-21",
            "2024-10-22",
            "2024-10-23",
            "2024-10-24",
            "2024-10-25"
      ]
},
      summary: {
      "total_iterations": 25,
      "training_days": 28,
      "validation_days": 12,
      "best_validation_sharpe": "0.000",
      "best_validation_return": "0.000",
      "overfitting_risk": "MINIMAL - Good generalization"
}
    };
  }
  
  getDescription() {
    return `Auto-optimized HAVWAP strategy with train/validation split - ${this.optimizationInfo.summary?.overfitting_risk || 'Unknown'} overfitting risk`;
  }
  
  getOptimizationInfo() {
    return this.optimizationInfo;
  }
}

module.exports = HAVWAPOptimizedStrategy;
