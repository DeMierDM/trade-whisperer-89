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
      hasVolume: contract?.volume >= 1,
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
   * Select best contract based on strategy criteria
   * @param {Array} optionChain - Array of option contracts
   * @param {Object} criteria - Selection criteria
   * @returns {Object|null} Best matching contract with Greeks, or null if none found
   */
  selectBestContract(contracts, signalType, targetDelta) {
    try {
      // Store current price for debugging
      this.currentPrice = contracts[0]?.underlying_price || 'unknown';
      
      console.log(`\n🔍 [CONTRACT SELECTION] Target: ${targetDelta} delta ${signalType === 'CALL' ? 'CALL' : 'PUT'}, Underlying: $${this.currentPrice}`);
      console.log(`   Available contracts: ${contracts.length}`);

      // Show ALL available contracts before filtering
      console.log('   📋 ALL AVAILABLE CONTRACTS:');
      contracts.forEach(contract => {
        console.log(`      ${contract.symbol} Strike=$${contract.strike} Delta=${contract.greeks?.delta?.toFixed(3) || 'N/A'} Price=$${contract.lastPrice} Vol=${contract.volume}`);
      });

      // Get valid contracts that meet filtering criteria
      const validContracts = contracts.filter(contract => this.isValidContract(contract));
      console.log(`   Valid contracts after filtering: ${validContracts.length}`);

      if (validContracts.length === 0) {
        console.log('   ❌ No valid contracts found after filtering');
        return null;
      }

      console.log('   📋 CONTRACTS AFTER FILTERING:');
      validContracts.forEach(contract => {
        console.log(`      ${contract.symbol} Strike=$${contract.strike} Delta=${contract.greeks?.delta?.toFixed(3) || 'N/A'} Price=$${contract.lastPrice} Vol=${contract.volume}`);
      });

      // Score all contracts
      const scoredContracts = validContracts.map(contract => {
        contract.score = this.scoreContract(contract, targetDelta);
        return contract;
      });

      // Sort contracts by score for logging
      const sortedContracts = scoredContracts.sort((a, b) => b.score - a.score);
    
    // Log top 3 contract choices for debugging
    console.log('\nTop 3 Contract Choices:');
    sortedContracts.slice(0, 3).forEach((contract, idx) => {
      const delta = contract.greeks?.delta || contract.delta || 0;
      const score = contract.score || 0;
      const volume = contract.volume || 0;
      console.log(`   ${idx + 1}. Strike: $${contract.strike_price} | Score: ${score.toFixed(3)} | Delta: ${delta.toFixed(3)} | Volume: ${volume}`);
    });

    return sortedContracts[0]; // Return highest scoring contract

      // Sort by total score (higher is better)
      scoredContracts.sort((a, b) => b.scores.totalScore - a.scores.totalScore);

      // Show top 5 candidates for debugging
      const top5 = scoredContracts.slice(0, 5);
      console.log('   Top 5 contract options:');
      top5.forEach((contract, i) => {
        console.log(`   ${i+1}. ${contract.symbol} Strike=$${contract.strike} Delta=${contract.greeks.delta.toFixed(3)} Score=${contract.scores.totalScore.toFixed(1)}`);
      });

      const selectedContract = scoredContracts[0];
      console.log(`   ✅ Selected: ${selectedContract.symbol} (Score: ${selectedContract.scores.totalScore.toFixed(1)})`);
      
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
    const delta = Math.abs(contract.greeks?.delta || 0);
    const volume = contract.volume || 0;
    const lastPrice = contract.lastPrice || 0;

    // Calculate delta proximity score (90% weight - prioritize delta matching)
    const deltaProximity = 1 - Math.abs(delta - Math.abs(targetDelta));
    const deltaScore = Math.max(0, deltaProximity) * 0.9;

    // Volume score (5% weight - reduced from original heavy weighting)
    const volumeScore = Math.min(volume / 1000, 1) * 0.05;

    // Price reasonableness score (5% weight)
    const priceScore = lastPrice > 0.05 ? Math.min(1 / lastPrice, 1) * 0.05 : 0;

    return deltaScore + volumeScore + priceScore;
  }
}

module.exports = ContractSelector;
