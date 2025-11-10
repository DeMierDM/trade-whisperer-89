/**
 * Contract Selector
 * 
 * Intelligently selects best option contracts based on strategy criteria.
 * Supports dual modes:
 * - BACKTESTING: Uses OHLCV bars (close price as mid)
 * - LIVE TRADING: Uses bid/ask quotes with spread filtering
 */

const GreeksCalculator = require('./greeks-calculator');

class ContractSelector {
  constructor(greeksCalculator = null) {
    this.greeksCalculator = greeksCalculator || new GreeksCalculator();
    // Track recently selected contracts to encourage diversity
    this.recentSelections = new Map(); // contractSymbol -> timestamp
    this.recencyWindowMs = 30 * 60 * 1000; // 30 minutes
  }

  /**
   * Check if contract meets basic validity criteria
   * @param {Object} contract - Contract to validate
   * @returns {boolean} True if contract is valid for selection
   */
  isValidContract(contract) {
    const checks = {
      hasContract: !!contract,
      hasSymbol: !!contract?.symbol,
      hasStrike: !!contract?.strike,
      hasValidPrice: contract?.lastPrice > 0.01,
      hasVolume: contract?.volume >= 0,  // Accept contracts even with zero volume for 0DTE
      hasGreeks: !!contract?.greeks,
      hasDelta: !!(contract?.greeks?.delta !== undefined)
    };

    const isValid = checks.hasContract && 
                   checks.hasSymbol && 
                   checks.hasStrike && 
                   checks.hasValidPrice && 
                   checks.hasVolume && 
                   checks.hasGreeks && 
                   checks.hasDelta;

    if (!isValid) {
      console.log(`   🔍 [CONTRACT VALIDATION] ${contract?.symbol || 'Unknown'}: ${JSON.stringify(checks)}`);
    }

    return isValid;
  }

  /**
   * Enhanced contract validation with OHLCV quality scoring
   * @param {Object} contract - Contract to validate with OHLCV data
   * @returns {Object} Validation result with quality metrics
   */
  validateContractQuality(contract) {
    const validation = {
      isValid: false,
      qualityScore: 0,
      reasons: [],
      metrics: {}
    };

    // Basic validation
    if (!contract || !contract.bars || !Array.isArray(contract.bars)) {
      validation.reasons.push('No OHLCV bars data');
      return validation;
    }

    const bars = contract.bars;
    const metadata = contract.metadata || {};

    // Quality metrics from enhanced OHLCV data
    const avgQuality = metadata.avgQualityScore || 0;
    const totalVolume = metadata.totalVolume || 0;
    const avgVolume = metadata.avgVolume || 0;
    const dataPoints = bars.length;

    validation.metrics = {
      avgQualityScore: avgQuality,
      totalVolume,
      avgVolume,
      dataPoints,
      priceRange: metadata.priceRange
    };

    // Scoring criteria (0-100 scale)
    let score = 0;

    // Data coverage (25 points max)
    if (dataPoints >= 300) score += 25;      // Full day coverage
    else if (dataPoints >= 150) score += 20; // Half day
    else if (dataPoints >= 50) score += 15;  // Partial coverage
    else if (dataPoints >= 10) score += 10;  // Minimal coverage

    // Volume activity (25 points max)
    if (avgVolume >= 50) score += 25;
    else if (avgVolume >= 20) score += 20;
    else if (avgVolume >= 10) score += 15;
    else if (avgVolume >= 5) score += 10;

    // Data quality from bars (30 points max)
    score += Math.min(30, avgQuality * 0.3);

    // Price consistency (20 points max)
    if (metadata.priceRange && metadata.priceRange.min > 0.01) {
      const priceSpread = (metadata.priceRange.max - metadata.priceRange.min) / metadata.priceRange.avg;
      if (priceSpread <= 2.0) score += 20;      // Stable pricing
      else if (priceSpread <= 5.0) score += 15; // Moderate volatility
      else if (priceSpread <= 10.0) score += 10; // High volatility
    }

    validation.qualityScore = Math.round(score);
    validation.isValid = validation.qualityScore >= 40; // Minimum 40% quality

    if (!validation.isValid) {
      validation.reasons.push(`Quality score too low: ${validation.qualityScore}/100`);
    }

    return validation;
  }

  /**
   * Select best contract based on strategy criteria
   * @param {Array} optionChain - Array of option contracts
   * @param {Object} criteria - Selection criteria
   * @returns {Object|null} Best matching contract with Greeks, or null if none found
   */
  selectBestContract(contracts, signalType, targetDelta, strategyCriteria = {}) {
    try {
      // Store current price for debugging
      this.currentPrice = contracts[0]?.underlying_price || 'unknown';
      
      console.log(`\n🔍 [CONTRACT SELECTION] Target: ${targetDelta} delta ${signalType === 'CALL' ? 'CALL' : 'PUT'}, Underlying: $${this.currentPrice}`);
      console.log(`   Available contracts: ${contracts.length}`);
      
      // Use strategy-specific delta ranges if provided, otherwise use defaults
      const minDelta = strategyCriteria.minDelta || 0.10;
      const maxDelta = strategyCriteria.maxDelta || 0.70;
      console.log(`   📊 [DELTA FILTER] Using range: [${minDelta}, ${maxDelta}] ${strategyCriteria.minDelta ? '(from strategy)' : '(default)'}`);

      // Show ALL available contracts before filtering
      console.log('   📋 ALL AVAILABLE CONTRACTS:');
      contracts.forEach(contract => {
        const underlyingPrice = contract.underlying_price || 'NULL';
        const strikeDistance = contract.underlying_price ? Math.abs(contract.strike - contract.underlying_price).toFixed(2) : 'N/A';
        console.log(`      ${contract.symbol} Strike=$${contract.strike} UnderlyingPrice=${underlyingPrice} Distance=$${strikeDistance} Delta=${contract.greeks?.delta?.toFixed(3) || 'N/A'} Price=$${contract.lastPrice} Vol=${contract.volume}`);
      });

      // Get valid contracts that meet filtering criteria
      let validContracts = contracts.filter(contract => this.isValidContract(contract));
      
      // 🔧 FIX: Additional delta validation - VERY RELAXED for 0DTE options
      validContracts = validContracts.filter(contract => {
        const delta = contract.greeks?.delta;
        
        // For 0DTE options, extreme deltas (0.00, 1.00, -1.00) are NORMAL and VALID
        const isValidDelta = (
          delta !== null && 
          delta !== undefined && 
          !isNaN(delta) && 
          isFinite(delta) &&
          delta >= -1.0 && delta <= 1.0  // Only reject truly impossible values outside [-1, 1]
        );
        
        if (!isValidDelta) {
          console.log(`   ⚠️ Filtered out ${contract.symbol}: Invalid delta ${delta} (NaN/null/infinite value)`);
          return false;
        }
        
        return true;
      });
      
      console.log(`   Valid contracts after delta validation: ${validContracts.length}`);

      if (validContracts.length === 0) {
        console.log('   ❌ No valid contracts found after filtering');
        return null;
      }

      console.log('   📋 CONTRACTS AFTER FILTERING:');
      validContracts.forEach(contract => {
        console.log(`      ${contract.symbol} Strike=$${contract.strike} Delta=${contract.greeks?.delta?.toFixed(3) || 'N/A'} Price=$${contract.lastPrice} Vol=${contract.volume}`);
      });

      // FILTER 1: Delta range filtering (reject far OTM and deep ITM)
      // Uses strategy-specific delta ranges passed from method parameters
      const deltaFilteredContracts = validContracts.filter(contract => {
        const delta = contract.greeks?.delta || 0;
        
        // 🔧 CRITICAL FIX: Don't use absolute delta - calls should be positive, puts negative
        const inDeltaRange = delta >= minDelta && delta <= maxDelta;
        
        // Debug logging for PUT contracts
        if (signalType && signalType.includes('PUT')) {
            console.log(`🎯 [PUT CONTRACT] ${contract.strike} delta=${delta.toFixed(3)} inRange=${inDeltaRange}`);
        }
        
        // Debug: Show ATM vs OTM Greeks relationship
        const moneyness = (contract.underlying_price / contract.strike).toFixed(4);
        const isATM = Math.abs(contract.underlying_price - contract.strike) <= 2;
        const status = inDeltaRange ? '✅ PASS' : '❌ FAIL';
        console.log(`   💰 [CONTRACT] ${contract.symbol}: S=${contract.underlying_price?.toFixed(2)}, K=${contract.strike}, M=${moneyness}, ${isATM ? '🎯ATM' : '📊OTM'}, Δ=${delta.toFixed(3)}, Γ=${contract.greeks?.gamma?.toFixed(4) || 'N/A'} ${status}`);
        
        if (!inDeltaRange) {
          console.log(`   ⚠️  Filtered out ${contract.symbol}: Delta ${delta.toFixed(3)} outside range [${minDelta}, ${maxDelta}]`);
        }
        return inDeltaRange;
      });
      console.log(`   Delta-filtered contracts: ${deltaFilteredContracts.length} (range: ${minDelta}-${maxDelta})`);

      if (deltaFilteredContracts.length === 0) {
        console.log('   ❌ No contracts found within acceptable delta range');
        return null;
      }

      // 🔍 DETAILED LOGGING: Show exactly why contracts pass or fail additional criteria
      console.log(`\n   🔍 [DETAILED FILTERING] Strategy Requirements:`);
      console.log(`      📊 Volume: >= ${strategyCriteria.minVolume || 'N/A'}`);
      console.log(`      📈 Spread: <= ${(strategyCriteria.maxSpreadPercent || 0) * 100}%`);
      console.log(`      📅 DTE: ${strategyCriteria.dteRange ? `${strategyCriteria.dteRange[0]}-${strategyCriteria.dteRange[1]} days` : 'Any'}`);
      
      deltaFilteredContracts.forEach(contract => {
        // Calculate bid/ask spread with proper zero handling
        const bid = contract.bid || 0;
        const ask = contract.ask || 0;
        const mid = (bid + ask) / 2;
        const spread = ask - bid;

        // 🔧 FIX: Handle zero bid/ask gracefully (BACKTESTING MODE)
        let spreadPercent;
        const isHistoricalData = (bid === 0 && ask === 0); // Historical OHLCV data

        if (isHistoricalData) {
          // Historical backtesting - no spread data, skip spread check
          spreadPercent = 0; // Pass spread check in backtesting mode
        } else if (mid > 0) {
          spreadPercent = spread / mid;
        } else {
          spreadPercent = 999; // Invalid spread
        }

        // Calculate DTE with proper date validation
        // 🔧 FIX: Use bar timestamp for backtesting, not current date
        // For DTE calculation, compare DATES only (not times) to avoid negative values
        const now = contract.timestamp ? new Date(contract.timestamp) : new Date();
        const expiryString = contract.expiry_date || contract.expiry || contract.expiration_date;
        let daysToExpiry = 999; // Default for invalid dates

        if (expiryString) {
          // Parse expiry date - handle both YYYY-MM-DD and full ISO formats
          const expiry = new Date(expiryString);
          if (!isNaN(expiry.getTime())) {
            // Normalize both dates to midnight UTC for date-only comparison
            // This ensures 0DTE options on expiry day always calculate as 0 days
            const nowDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const expiryDate = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate()));
            const diffMs = expiryDate - nowDate;
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            daysToExpiry = Math.round(diffDays); // Round instead of ceil for accuracy
          }
        }
        
        // Volume check
        const volumeCheck = contract.volume >= (strategyCriteria.minVolume || 0);
        const spreadCheck = spreadPercent <= (strategyCriteria.maxSpreadPercent || 999);
        const dteCheck = !strategyCriteria.dteRange || 
          (daysToExpiry >= strategyCriteria.dteRange[0] && daysToExpiry <= strategyCriteria.dteRange[1]);
        
        const allPass = volumeCheck && spreadCheck && dteCheck;
        const status = allPass ? '🟢 PASS ALL' : '🔴 FAIL';
        
        console.log(`\n      📋 [${contract.symbol}] ${status}`);
        console.log(`         💰 Price: $${contract.lastPrice} (bid=$${bid}, ask=$${ask})`);
        console.log(`         📊 Volume: ${contract.volume} ${volumeCheck ? '✅' : '❌'} (need >= ${strategyCriteria.minVolume || 0})`);
        console.log(`         📈 Spread: ${(spreadPercent * 100).toFixed(1)}% ${spreadCheck ? '✅' : '❌'} (need <= ${(strategyCriteria.maxSpreadPercent || 0) * 100}%)`);
        console.log(`         📅 DTE: ${daysToExpiry} days ${dteCheck ? '✅' : '❌'} (need ${strategyCriteria.dteRange ? `${strategyCriteria.dteRange[0]}-${strategyCriteria.dteRange[1]}` : 'Any'})`);
        console.log(`         📊 Greeks: Δ=${contract.greeks?.delta?.toFixed(3)}, Γ=${contract.greeks?.gamma?.toFixed(4)}, Θ=${contract.greeks?.theta?.toFixed(4)}`);
        
        if (!allPass) {
          const reasons = [];
          if (!volumeCheck) reasons.push(`Volume too low: ${contract.volume} < ${strategyCriteria.minVolume}`);
          if (!spreadCheck) reasons.push(`Spread too wide: ${(spreadPercent * 100).toFixed(1)}% > ${(strategyCriteria.maxSpreadPercent || 0) * 100}%`);
          if (!dteCheck) reasons.push(`DTE out of range: ${daysToExpiry} days not in [${strategyCriteria.dteRange[0]}-${strategyCriteria.dteRange[1]}]`);
          console.log(`         🚫 FAILURE REASONS: ${reasons.join(', ')}`);
        }
      });

      // FILTER 2: Strike distance filtering (reject strikes too far from underlying)
      const maxStrikeDistance = 8.00; // Max $8.00 away from underlying (expanded for full options chain)
      const strikeFilteredContracts = deltaFilteredContracts.filter(contract => {
        const strikeDistance = Math.abs(contract.strike - contract.underlying_price);
        const acceptable = strikeDistance <= maxStrikeDistance;
        if (!acceptable) {
          console.log(`   ⚠️  Filtered out ${contract.symbol}: Strike distance ${strikeDistance.toFixed(2)} exceeds max ${maxStrikeDistance}`);
        }
        return acceptable;
      });
      console.log(`   Strike-filtered contracts: ${strikeFilteredContracts.length} (max distance: $${maxStrikeDistance})`);

      if (strikeFilteredContracts.length === 0) {
        console.log('   ❌ No contracts found within acceptable strike distance');
        return null;
      }

      // 🔍 APPLY FINAL FILTERS: Volume, Spread, DTE requirements
      const finalFilteredContracts = strikeFilteredContracts.filter(contract => {
        // Calculate bid/ask spread with proper zero handling
        const bid = contract.bid || 0;
        const ask = contract.ask || 0;
        const mid = (bid + ask) / 2;
        const spread = ask - bid;

        // 🔧 FIX: Handle zero bid/ask gracefully (BACKTESTING MODE)
        let spreadPercent;
        const isHistoricalData = (bid === 0 && ask === 0); // Historical OHLCV data

        if (isHistoricalData) {
          // Historical backtesting - no spread data, skip spread check
          spreadPercent = 0; // Pass spread check in backtesting mode
        } else if (mid > 0) {
          spreadPercent = spread / mid;
        } else {
          spreadPercent = 999; // Invalid spread
        }

        // Calculate DTE with proper date validation
        // 🔧 FIX: Use bar timestamp for backtesting, not current date
        // For DTE calculation, compare DATES only (not times) to avoid negative values
        const now = contract.timestamp ? new Date(contract.timestamp) : new Date();
        const expiryString = contract.expiry_date || contract.expiry || contract.expiration_date;
        let daysToExpiry = 999; // Default for invalid dates

        if (expiryString) {
          // Parse expiry date - handle both YYYY-MM-DD and full ISO formats
          const expiry = new Date(expiryString);
          if (!isNaN(expiry.getTime())) {
            // Normalize both dates to midnight UTC for date-only comparison
            // This ensures 0DTE options on expiry day always calculate as 0 days
            const nowDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            const expiryDate = new Date(Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate()));
            const diffMs = expiryDate - nowDate;
            const diffDays = diffMs / (1000 * 60 * 60 * 24);
            daysToExpiry = Math.round(diffDays); // Round instead of ceil for accuracy
          }
        }
        
        // Apply strategy criteria
        const volumePass = contract.volume >= (strategyCriteria.minVolume || 0);
        const spreadPass = spreadPercent <= (strategyCriteria.maxSpreadPercent || 999);
        const dtePass = !strategyCriteria.dteRange || 
          (daysToExpiry >= strategyCriteria.dteRange[0] && daysToExpiry <= strategyCriteria.dteRange[1]);
        
        const allPass = volumePass && spreadPass && dtePass;
        
        if (!allPass) {
          console.log(`   🔴 [FINAL FILTER] ${contract.symbol} REJECTED - Volume:${volumePass?'✅':'❌'} Spread:${spreadPass?'✅':'❌'} DTE:${dtePass?'✅':'❌'}`);
        } else {
          console.log(`   🟢 [FINAL FILTER] ${contract.symbol} ACCEPTED - All criteria passed`);
        }
        
        return allPass;
      });

      console.log(`\n   📊 FILTER SUMMARY:`);
      console.log(`      Initial contracts: ${contracts.length}`);
      console.log(`      After basic validation: ${validContracts.length}`);
      console.log(`      After delta filtering: ${deltaFilteredContracts.length}`);
      console.log(`      After strike distance: ${strikeFilteredContracts.length}`);
      console.log(`      After final filters: ${finalFilteredContracts.length}`);

      if (finalFilteredContracts.length === 0) {
        console.log('   ❌ NO CONTRACTS PASSED ALL FILTERS');
        return null;
      }

      // Score all remaining contracts
      const scoredContracts = finalFilteredContracts.map(contract => {
        const score = this.scoreContract(contract, targetDelta);
        console.log(`   🎯 [SCORING] ${contract.symbol}: Score=${score.toFixed(3)} (Delta=${contract.greeks?.delta?.toFixed(3)}, Target=${targetDelta})`);
        contract.score = score;
        return contract;
      });

      // Apply recency penalty to encourage diversity
      const now = Date.now();
      scoredContracts.forEach(contract => {
        const lastSelected = this.recentSelections.get(contract.symbol);
        if (lastSelected) {
          const timeSinceMs = now - lastSelected;
          if (timeSinceMs < this.recencyWindowMs) {
            const originalScore = contract.score;
            const penalty = 0.5; // 50% score reduction for recently used contracts
            contract.score *= (1 - penalty);
            console.log(`   ♻️  Recency penalty applied to ${contract.symbol}: ${originalScore.toFixed(3)} -> ${contract.score.toFixed(3)} (last used ${Math.round(timeSinceMs / 60000)} min ago)`);
          }
        }
      });

      // Sort contracts by score for logging
      const sortedContracts = scoredContracts.sort((a, b) => b.score - a.score);
    
      // Check minimum score threshold
      const minAcceptableScore = 0.01; // Accept contracts scoring >= 1% (lowered for debugging)
      if (sortedContracts[0].score < minAcceptableScore) {
        console.log(`   ❌ Best contract score ${sortedContracts[0].score.toFixed(3)} below minimum threshold ${minAcceptableScore}`);
        return null;
      }

      // Log top 3 contract choices for debugging
      console.log('\nTop 3 Contract Choices:');
      sortedContracts.slice(0, 3).forEach((contract, idx) => {
        const delta = contract.greeks?.delta || contract.delta || 0;
        const score = contract.score || 0;
        const volume = contract.volume || 0;
        console.log(`   ${idx + 1}. Strike: $${contract.strike_price || contract.strike} | Score: ${score.toFixed(3)} | Delta: ${delta.toFixed(3)} | Volume: ${volume}`);
      });

      // Track this selection for future diversity
      const selectedContract = sortedContracts[0];
      this.recentSelections.set(selectedContract.symbol, now);

      console.log(`   ✅ Selected: ${selectedContract.symbol} (Score: ${selectedContract.score.toFixed(3)}, Delta: ${Math.abs(selectedContract.greeks.delta).toFixed(3)})`);
      
      return selectedContract;
      
    } catch (error) {
      console.error('❌ [CONTRACT SELECTOR] Error in selectBestContract:', error);
      return null;
    }
  }

  /**
   * Calculate overall contract score based on multiple factors
   * @param {Object} contract - Contract data
   * @param {Object} greeks - Calculated Greeks
   * @param {Object} criteria - Selection criteria
   * @returns {number} Score (higher is better)
   */
  calculateContractScore(contract, greeks, criteria) {
    let score = 100;

    // Delta proximity (most important factor)
    const deltaDiff = Math.abs(greeks.delta - criteria.targetDelta);
    score -= deltaDiff * 50; // Heavy penalty for delta mismatch

    // Liquidity bonus
    const volume = parseFloat(contract.volume || contract.v || 0);
    score += Math.log10(Math.max(1, volume)) * 2;

    // Spread penalty (live mode only)
    if (criteria.mode === 'live' && greeks.spreadPct) {
      score -= greeks.spreadPct * 0.5;
    }

    // Vega bonus (prefer higher vega for better IV sensitivity)
    score += greeks.vega * 0.1;

    // Avoid deep ITM/OTM
    const moneyness = Math.abs(Math.log(criteria.underlyingPrice / parseFloat(contract.strike_price)));
    if (moneyness > 0.1) {
      score -= moneyness * 10;
    }

    return score;
  }

  /**
   * Build option chain from historical OHLCV bars (BACKTESTING MODE)
   * @param {string} symbol - Underlying symbol
   * @param {string} expiryDate - Option expiry date
   * @param {number} underlyingPrice - Current underlying price
   * @param {Object} historicalData - Alpaca options bars response
   * @returns {Array} Option chain with OHLCV data
   */
  buildOptionChainFromBars(symbol, expiryDate, underlyingPrice, historicalData) {
    const optionChain = [];

    if (!historicalData || !historicalData.bars) {
      return optionChain;
    }

    // Store underlying price for debugging
    this.currentPrice = underlyingPrice;

    Object.entries(historicalData.bars).forEach(([contractSymbol, bars]) => {
      if (!Array.isArray(bars) || bars.length === 0) {
        return;
      }

      // Parse option symbol: SPY251031C00450000
      const parsed = this.parseOptionSymbol(contractSymbol);
      if (!parsed) {
        return;
      }

      // Get latest bar (assumes sorted desc by time)
      const latestBar = bars[bars.length - 1]; // Use last bar (most recent)

      // Ensure we have valid price data
      const closePrice = latestBar.c;
      if (!closePrice || closePrice <= 0) {
        console.log(`⚠️  [BAR SKIP] Contract ${contractSymbol}: Invalid price ${closePrice}, skipping`);
        return;
      }

      // Normalize field names for compatibility with selectBestContract
      const contract = {
        symbol: contractSymbol,
        contract_symbol: contractSymbol,
        underlying_symbol: parsed.underlying,
        strike: parsed.strike,
        strike_price: parsed.strike,
        expiry_date: expiryDate,
        option_type: parsed.optionType,
        underlying_price: underlyingPrice, // Add this for debugging
        // OHLCV data (no bid/ask in backtesting)
        open: latestBar.o,
        high: latestBar.h,
        low: latestBar.l,
        close: closePrice, // This is our "mid price"
        lastPrice: closePrice, // Normalized field name
        price: closePrice, // Expected by backtest engine
        volume: latestBar.v,
        timestamp: latestBar.t
      };

      // OPTIMIZED: Calculate Greeks once and cache in bar object
      // Check if Greeks already calculated for this bar
      if (!latestBar.greeks) {
        const timeToExpiry = this.calculateTimeToExpiry(expiryDate, latestBar.t);

        console.log(`🔍 [GREEKS DEBUG] Calculating Greeks for ${contractSymbol}:`);
        console.log(`   Strike: ${parsed.strike}, ExpDate: ${expiryDate}, TTExpr: ${timeToExpiry.toFixed(6)}`);
        console.log(`   UnderPrice: ${underlyingPrice}, OptionType: ${parsed.optionType}`);

        // Calculate and cache in bar object
        latestBar.greeks = this.greeksCalculator.calculateAllGreeks(
          underlyingPrice,
          parsed.strike,
          timeToExpiry,
          0.05,  // Risk free rate
          null,  // Let it calculate IV from close price
          parsed.optionType,
          closePrice  // Market price for IV calculation
        );

        console.log(`   📊 Calculated Greeks: Delta=${latestBar.greeks.delta?.toFixed(3)}, IV=${latestBar.greeks.impliedVolatility?.toFixed(3)}`);
      } else {
        console.log(`   📦 Using cached Greeks for ${contractSymbol}: Delta=${latestBar.greeks.delta?.toFixed(3)}`);
      }

      // Reference cached Greeks
      contract.greeks = latestBar.greeks;

      optionChain.push(contract);
    });

    return optionChain;
  }

  /**
   * Calculate time to expiry in years for 0DTE options
   * @param {string} expiryDate - Expiry date in YYYY-MM-DD format
   * @param {string|number|Date} currentTime - Current bar timestamp (for backtesting)
   * @returns {number} Time to expiry in years
   */
  calculateTimeToExpiry(expiryDate, currentTime = null) {
    // Use bar timestamp for backtesting, current time for live trading
    const now = currentTime ? new Date(currentTime) : new Date();
    const expiry = new Date(expiryDate + 'T16:00:00-04:00'); // 4 PM ET market close
    const timeToExpiryMs = expiry.getTime() - now.getTime();
    const timeToExpiryYears = timeToExpiryMs / (1000 * 60 * 60 * 24 * 365.25);
    
    console.log(`🕐 [TIME DEBUG] Expiry: ${expiryDate}, Current: ${now.toISOString()}, TTExpr: ${timeToExpiryYears}`);
    
    return Math.max(0.0001, timeToExpiryYears); // Minimum 1 hour equivalent
  }

  /**
   * Build option chain from live quotes (LIVE TRADING MODE)
   * @param {string} symbol - Underlying symbol
   * @param {Array} quotes - Live WebSocket quotes with bid/ask
   * @returns {Array} Option chain with bid/ask data
   */
  buildOptionChainFromQuotes(symbol, quotes) {
    return quotes.map(quote => {
      const parsed = this.parseOptionSymbol(quote.symbol);
      
      return {
        contract_symbol: quote.symbol,
        underlying_symbol: symbol,
        strike_price: parsed ? parsed.strike : quote.strike,
        expiry_date: quote.expiry,
        option_type: parsed ? parsed.optionType : quote.type,
        // Live bid/ask data
        bid: quote.bid,
        ask: quote.ask,
        last: quote.last,
        volume: quote.volume,
        open_interest: quote.open_interest,
        timestamp: quote.timestamp
      };
    });
  }

  /**
   * Parse Alpaca option symbol format
   * Format: TICKER + YYMMDD + C/P + 00000000
   * Example: SPY251031C00450000 = SPY $450 Call expiring 10/31/2025
   * 
   * @param {string} symbol - Option symbol to parse
   * @returns {Object|null} Parsed components or null if invalid
   */
  parseOptionSymbol(symbol) {
    // Match: Any letters + 6 digits + C/P + 8 digits
    const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    
    if (!match) {
      return null;
    }

    const [, underlying, dateStr, typeChar, strikeStr] = match;

    // Parse date: YYMMDD
    const year = 2000 + parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4));
    const day = parseInt(dateStr.substring(4, 6));

    // Parse strike: 5 digits dollars + 3 digits cents
    const dollars = parseInt(strikeStr.substring(0, 5));
    const cents = parseInt(strikeStr.substring(5, 8));
    const strike = dollars + (cents / 1000);

    return {
      underlying: underlying,
      expiry: new Date(year, month - 1, day),
      expiryString: `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
      optionType: typeChar === 'C' ? 'CALL' : 'PUT',
      strike: strike
    };
  }

  /**
   * Generate option symbol in Alpaca format
   * @param {string} ticker - Underlying ticker
   * @param {Date|string} expiryDate - Expiration date
   * @param {string} optionType - 'CALL' or 'PUT'
   * @param {number} strike - Strike price
   * @returns {string} Formatted option symbol
   */
  generateOptionSymbol(ticker, expiryDate, optionType, strike) {
    const expiry = new Date(expiryDate);
    
    // Format date as YYMMDD
    const yy = expiry.getFullYear().toString().substring(2);
    const mm = (expiry.getMonth() + 1).toString().padStart(2, '0');
    const dd = expiry.getDate().toString().padStart(2, '0');
    const dateStr = yy + mm + dd;

    // Format strike as 00000000 (5 digits dollars + 3 digits cents)
    const dollars = Math.floor(strike);
    const cents = Math.round((strike - dollars) * 1000);
    const strikeStr = dollars.toString().padStart(5, '0') + cents.toString().padStart(3, '0');

    // Option type
    const typeChar = optionType.toUpperCase()[0]; // 'C' or 'P'

    return `${ticker}${dateStr}${typeChar}${strikeStr}`;
  }

  /**
   * Find contracts within strike range of underlying price
   * @param {Array} optionChain - Full option chain
   * @param {number} underlyingPrice - Current underlying price
   * @param {number} numStrikes - Number of strikes on each side
   * @returns {Array} Filtered option chain
   */
  filterByStrikeRange(optionChain, underlyingPrice, numStrikes = 20) {
    // Calculate range bounds (using wider range for better selection)
    const atmStrike = Math.round(underlyingPrice);
    const range = numStrikes; // How many strikes above/below ATM to include
    
    const minStrike = atmStrike - range;
    const maxStrike = atmStrike + range;

    // Log available strikes for debugging
    console.log(`   🎯 Strike Range: $${minStrike} to $${maxStrike} around $${underlyingPrice}`);

    return optionChain.filter(contract => {
      const strike = parseFloat(contract.strike_price);
      return strike >= minStrike && strike <= maxStrike;
    });
  }

  /**
   * Select multiple contracts for spreads or hedging
   * @param {Array} optionChain - Option chain
   * @param {Object} criteria - Selection criteria with array of target deltas
   * @returns {Array} Array of selected contracts
   */
  selectMultipleContracts(optionChain, criteria) {
    const { targetDeltas, ...otherCriteria } = criteria;
    
    if (!Array.isArray(targetDeltas)) {
      throw new Error('targetDeltas must be an array for multiple contract selection');
    }

    const selectedContracts = [];

    for (const targetDelta of targetDeltas) {
      const contract = this.selectBestContract(optionChain, {
        ...otherCriteria,
        targetDelta
      });

      if (contract) {
        selectedContracts.push(contract);
        
        // Remove selected contract from chain to avoid duplicates
        const index = optionChain.findIndex(c => 
          c.contract_symbol === contract.contract_symbol
        );
        if (index > -1) {
          optionChain.splice(index, 1);
        }
      }
    }

    return selectedContracts;
  }

  /**
   * Score a contract based on multiple criteria
   * Prioritizes delta proximity over volume (as fixed from original issue)
   * @param {Object} contract - Contract to score
   * @param {number} targetDelta - Target delta value
   * @returns {number} Score (higher is better)
   */
  scoreContract(contract, targetDelta) {
    // 🔧 FIX: Robust NaN handling for all scoring inputs - PRESERVE SIGN FOR PUT/CALL DISTINCTION
    const rawDelta = contract.greeks?.delta;
    const delta = (rawDelta !== null && rawDelta !== undefined && !isNaN(rawDelta)) ? rawDelta : 0; // KEEP SIGN!
    const volume = Math.max(0, contract.volume || 0);
    const lastPrice = Math.max(0.01, contract.lastPrice || 0.01); // Minimum $0.01
    const strikeDistance = Math.abs((contract.strike || 0) - (contract.underlying_price || 0));
    
    // 🔧 FIX: Validate targetDelta - PRESERVE SIGN for put vs call distinction  
    const validTargetDelta = (targetDelta !== null && targetDelta !== undefined && !isNaN(targetDelta)) ? 
      targetDelta : 0.50; // Fallback to 50-delta call (positive)
    
    // Calculate delta proximity score (60% weight - prioritize delta matching)
    // 🔧 FIXED: Proper delta comparison respecting put/call signs
    let deltaScore = 0;
    if (delta !== 0 && validTargetDelta !== 0) {
      const deltaDiff = Math.abs(delta - validTargetDelta); // Now compares correctly: -0.85 vs -0.85 = 0 diff
      deltaScore = Math.max(0, 1 - deltaDiff * 2) * 0.6; // Reduced penalty multiplier from 5 to 2
    }
    
    // 🔧 DEBUG: Log scoring inputs for NaN detection
    if (isNaN(deltaScore)) {
      console.log(`   ⚠️ NaN deltaScore detected: delta=${delta}, targetDelta=${validTargetDelta}, rawDelta=${rawDelta}`);
      deltaScore = 0;
    }

    // Strike distance score (15% weight - favor ATM strikes)
    // Penalty for strikes more than $1.50 away from underlying (adjusted for $3.00 max range)
    const strikeScore = Math.max(0, 1 - strikeDistance * 0.67) * 0.15;

    // Volume score (10% weight - ensure liquidity)
    const volumeScore = Math.min(volume / 100, 1) * 0.10;

    // Price reasonableness score (15% weight - heavily prefer cheaper options)
    // FIXED: Previous formula (1/price) was backwards - rewarded expensive contracts!
    // New formula: Higher score for cheaper contracts, with reasonable price ceiling
    let priceScore = 0;
    if (lastPrice > 0.05) {
      // Penalize contracts over $2.00 progressively, reward under $1.00
      if (lastPrice <= 1.0) {
        priceScore = 1.0; // Perfect score for contracts under $1
      } else if (lastPrice <= 2.0) {
        priceScore = 1.0 - ((lastPrice - 1.0) * 0.5); // Linear penalty 1.0->2.0 maps to 1.0->0.5
      } else if (lastPrice <= 5.0) {
        priceScore = 0.5 - ((lastPrice - 2.0) * 0.15); // Steeper penalty 2.0->5.0 maps to 0.5->0.05
      } else {
        priceScore = 0.05; // Minimal score for very expensive (>$5) contracts
      }
    }
    priceScore *= 0.15; // Apply 15% weight (increased from 5%)

    const totalScore = deltaScore + strikeScore + volumeScore + priceScore;
    
    // 🔧 FIX: Final NaN check and fallback
    const validScore = (!isNaN(totalScore) && isFinite(totalScore)) ? totalScore : 0;
    
    // Debug logging for scoring breakdown
    console.log(`   📊 [SCORING] ${contract.symbol}: Delta=${deltaScore.toFixed(3)} Strike=${strikeScore.toFixed(3)} Vol=${volumeScore.toFixed(3)} Price=${priceScore.toFixed(3)} Total=${validScore.toFixed(3)} (TargetΔ=${validTargetDelta}, ActualΔ=${delta}, Price=$${lastPrice})`);

    return validScore;
  }
}

module.exports = ContractSelector;
