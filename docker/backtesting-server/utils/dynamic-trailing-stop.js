/**
 * Dynamic Trailing Stop Loss System
 * 
 * Implements intelligent profit protection:
 * 1. Initial take profit at 3%
 * 2. Once exceeded, trails 3% below peak profit
 * 3. At 10%+ profit, trails 5% below peak
 * 4. Continues scaling for bigger winners
 * 
 * Usage:
 *   const trailingStop = new DynamicTrailingStop({ initialTP: 0.03 });
 *   const exitDecision = trailingStop.checkExit(position, currentPnLPct);
 */

class DynamicTrailingStop {
  constructor(config = {}) {
    // Configuration with sensible defaults
    this.initialTP = config.initialTP || 0.03;  // 3% initial take profit
    
    // Trailing stop tiers (profit level -> trailing distance)
    this.trailingTiers = config.trailingTiers || [
      { minProfit: 0.03, trailDistance: 0.03 },   // 3%+ profit: trail by 3%
      { minProfit: 0.10, trailDistance: 0.05 },   // 10%+ profit: trail by 5%
      { minProfit: 0.20, trailDistance: 0.07 },   // 20%+ profit: trail by 7%
      { minProfit: 0.35, trailDistance: 0.10 },   // 35%+ profit: trail by 10%
    ];
    
    // Sort tiers by profit level (highest first for proper lookup)
    this.trailingTiers.sort((a, b) => b.minProfit - a.minProfit);
    
    // Position tracking (stored per position ID)
    this.positionState = new Map();
  }

  /**
   * Check if position should exit based on dynamic trailing logic
   * @param {Object} position - Position object with instance_id
   * @param {number} currentPnLPct - Current P&L as percentage (0.05 = 5%)
   * @returns {Object} { shouldExit, reason, trailingStop, peakProfit }
   */
  checkExit(position, currentPnLPct) {
    const positionId = position.instance_id || position.id;
    
    // Get or initialize position state
    let state = this.positionState.get(positionId);
    if (!state) {
      state = {
        peakProfit: currentPnLPct,
        trailingStopLevel: null,
        isTrailing: false
      };
      this.positionState.set(positionId, state);
    }

    // Update peak profit if current is higher
    if (currentPnLPct > state.peakProfit) {
      state.peakProfit = currentPnLPct;
    }

    // PHASE 1: Initial take profit check
    if (!state.isTrailing && currentPnLPct >= this.initialTP) {
      // Hit initial TP - either exit or start trailing
      state.isTrailing = true;
      state.trailingStopLevel = this.calculateTrailingStop(state.peakProfit);
      
      // Decision: Take profit immediately or start trailing?
      // For now, start trailing to let winners run
      console.log(`   🎯 [DYNAMIC TP] Initial ${(this.initialTP * 100).toFixed(1)}% TP hit - Starting trailing mode`);
    }

    // PHASE 2: Trailing stop management
    if (state.isTrailing) {
      // Calculate current trailing stop level based on peak
      const newTrailingStop = this.calculateTrailingStop(state.peakProfit);
      
      // Only update trailing stop if it moves up (never lower it)
      if (newTrailingStop > (state.trailingStopLevel || 0)) {
        state.trailingStopLevel = newTrailingStop;
      }

      // Check if current P&L has fallen below trailing stop
      if (currentPnLPct <= state.trailingStopLevel) {
        // Clean up position state
        this.positionState.delete(positionId);
        
        return {
          shouldExit: true,
          reason: 'DYNAMIC_TRAILING_STOP',
          trailingStop: state.trailingStopLevel,
          peakProfit: state.peakProfit,
          details: `Profit dropped from ${(state.peakProfit * 100).toFixed(1)}% to ${(currentPnLPct * 100).toFixed(1)}%`
        };
      }

      // Log trailing status for monitoring
      if (Math.random() < 0.1) { // 10% chance to avoid log spam
        console.log(`   📈 [TRAILING] Peak: ${(state.peakProfit * 100).toFixed(1)}%, Current: ${(currentPnLPct * 100).toFixed(1)}%, Stop: ${(state.trailingStopLevel * 100).toFixed(1)}%`);
      }
    }

    // No exit triggered
    return {
      shouldExit: false,
      reason: null,
      trailingStop: state.trailingStopLevel,
      peakProfit: state.peakProfit,
      isTrailing: state.isTrailing
    };
  }

  /**
   * Calculate trailing stop level based on current peak profit
   * @param {number} peakProfit - Peak profit percentage
   * @returns {number} Trailing stop level
   */
  calculateTrailingStop(peakProfit) {
    // Find the appropriate tier for this profit level
    for (const tier of this.trailingTiers) {
      if (peakProfit >= tier.minProfit) {
        return peakProfit - tier.trailDistance;
      }
    }
    
    // Fallback: use the most conservative tier
    const defaultTier = this.trailingTiers[this.trailingTiers.length - 1];
    return peakProfit - defaultTier.trailDistance;
  }

  /**
   * Clean up position state when position is closed
   * @param {string} positionId - Position identifier
   */
  cleanupPosition(positionId) {
    this.positionState.delete(positionId);
  }

  /**
   * Get current trailing status for a position (for debugging)
   * @param {string} positionId - Position identifier
   * @returns {Object} Current state or null
   */
  getPositionState(positionId) {
    return this.positionState.get(positionId) || null;
  }

  /**
   * Get configuration summary
   * @returns {Object} Configuration details
   */
  getConfig() {
    return {
      initialTP: this.initialTP,
      trailingTiers: this.trailingTiers,
      activePositions: this.positionState.size
    };
  }
}

module.exports = DynamicTrailingStop;