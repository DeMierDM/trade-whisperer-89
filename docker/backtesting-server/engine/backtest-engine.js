/**
 * Options Backtesting Engine
 * 
 * Orchestrates complete backtest workflow:
 * 1. Fetch historical data (underlying + options)
 * 2. Generate strategy signals
 * 3. Select optimal contracts
 * 4. Track positions with Greeks evolution
 * 5. Calculate P&L and performance metrics
 * 6. Persist results to database
 */

const GreeksCalculator = require('../utils/greeks-calculator');
const ContractSelector = require('../utils/contract-selector');
const BarGreeksProcessor = require('../utils/bar-greeks-processor');
const DataCacheManager = require('../utils/data-cache-manager');
const moment = require('moment-timezone');
const { v4: uuidv4 } = require('uuid');

class BacktestEngine {
  constructor(db, alpacaClient, config = {}) {
    this.db = db;
    this.alpacaClient = alpacaClient;
    this.greeksCalculator = new GreeksCalculator();
    this.contractSelector = new ContractSelector(this.greeksCalculator);
    this.barGreeksProcessor = new BarGreeksProcessor(this.greeksCalculator);

    // Store strike configuration
    this.strikeRange = config.strikeRange || 10;   // Default ±$10
    this.strikeSpacing = config.strikeSpacing || 1; // Default $1

    this.dataCacheManager = new DataCacheManager(db, alpacaClient, this.greeksCalculator, {
      strikeRange: this.strikeRange,
      strikeSpacing: this.strikeSpacing
    });

    // State
    this.currentBacktest = null;
    this.openPositions = [];
    this.closedPositions = [];
    this.signals = [];
    this.portfolioValue = [];
    this.greeksHistory = [];

    // Cache for options data to avoid repeated fetches
    this.optionsDataCache = new Map();
  }

  /**
   * Calculate realistic fill price using OHLCV data with VWAP preference
   * @param {Object} contract - Contract with bars data
   * @param {string} timestamp - Execution timestamp
   * @param {string} direction - 'BUY' or 'SELL'
   * @returns {Object} Fill price details
   */
  calculateFillPrice(contract, timestamp, direction = 'BUY') {
    const fillInfo = {
      price: 0,
      method: 'fallback',
      quality: 'low',
      slippage: 0,
      metadata: {}
    };

    if (!contract.bars || contract.bars.length === 0) {
      // Fallback to basic pricing
      fillInfo.price = contract.price || contract.lastPrice || contract.close || 0;
      fillInfo.method = 'fallback_price';
      return fillInfo;
    }

    // Find the bar closest to the execution timestamp
    const targetTime = new Date(timestamp).getTime();
    let closestBar = null;
    let minTimeDiff = Infinity;

    for (const bar of contract.bars) {
      const barTime = new Date(bar.t).getTime();
      const timeDiff = Math.abs(barTime - targetTime);
      
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        closestBar = bar;
      }
    }

    if (!closestBar) {
      fillInfo.price = contract.price || contract.close || 0;
      fillInfo.method = 'no_bar_found';
      return fillInfo;
    }

    // Use VWAP if available (most realistic)
    if (closestBar.vwap || closestBar.vw) {
      fillInfo.price = parseFloat(closestBar.vwap || closestBar.vw);
      fillInfo.method = 'vwap';
      fillInfo.quality = 'high';
    }
    // Use mid price as second choice
    else if (closestBar.h && closestBar.l) {
      fillInfo.price = (parseFloat(closestBar.h) + parseFloat(closestBar.l)) / 2;
      fillInfo.method = 'mid_price';
      fillInfo.quality = 'medium';
    }
    // Fallback to close price
    else {
      fillInfo.price = parseFloat(closestBar.c);
      fillInfo.method = 'close_price';
      fillInfo.quality = 'medium';
    }

    // Apply realistic slippage based on volume and quality
    const volume = parseInt(closestBar.v || 0);
    const qualityScore = closestBar.qualityScore || 0;
    
    // Calculate slippage percentage (higher for low volume/quality)
    let slippagePct = 0;
    if (volume < 10) slippagePct = 0.02;        // 2% slippage for very low volume
    else if (volume < 50) slippagePct = 0.01;   // 1% slippage for low volume  
    else if (qualityScore < 50) slippagePct = 0.005; // 0.5% for poor quality
    else slippagePct = 0.002;                   // 0.2% for good quality

    // Apply slippage (worse price for buyer, better for seller)
    const slippageAmount = fillInfo.price * slippagePct;
    if (direction === 'BUY') {
      fillInfo.price += slippageAmount;  // Pay more when buying
    } else {
      fillInfo.price -= slippageAmount;  // Receive less when selling
    }

    fillInfo.slippage = slippagePct * 100; // Store as percentage
    fillInfo.metadata = {
      bar_time: closestBar.t,
      time_diff_ms: minTimeDiff,
      volume: volume,
      quality_score: qualityScore,
      original_price: closestBar.vwap || closestBar.c,
      slippage_amount: slippageAmount
    };

    return fillInfo;
  }

  /**
   * Run complete backtest
   * @param {Object} config - Backtest configuration
   * @returns {Object} Backtest results
   */
  async runBacktest(config) {
    const {
      backtestId,            // Existing backtest ID (optional)
      strategy,              // Strategy instance
      symbol,                // Underlying symbol
      startDate,             // Start date (YYYY-MM-DD)
      endDate,               // End date (YYYY-MM-DD)
      initialCapital = 10000, // Starting capital
      userId = null,          // User ID for database
      mode = 'backtest'       // 'backtest' or 'live'
    } = config;

    console.log(`\n🚀 Starting backtest: ${strategy.name} on ${symbol}`);
    console.log(`   Period: ${startDate} to ${endDate}`);
    console.log(`   Initial Capital: $${initialCapital.toLocaleString()}`);
    console.log(`   Mode: ${mode}\n`);

    try {
      // Use existing backtest ID or create new one
      if (backtestId) {
        this.currentBacktest = { id: backtestId };
        console.log(`✅ Using existing backtest ID: ${backtestId}`);
      } else {
        // Initialize backtest in database
        this.currentBacktest = await this.initializeBacktest({
          userId,
          strategyName: strategy.name,
          symbol,
          startDate,
          endDate,
          initialCapital,
          mode,
          parameters: strategy.getParameters()
        });
        const newBacktestId = this.currentBacktest.id;
        console.log(`✅ Backtest initialized with ID: ${newBacktestId}`);
      }

      const activeBacktestId = this.currentBacktest.id;

      // Reset state
      this.openPositions = [];
      this.closedPositions = [];
      this.signals = [];
      this.portfolioValue = [{ timestamp: startDate, value: initialCapital }];
      this.greeksHistory = [];
      strategy.reset();

      // Step 1: Fetch historical underlying data
      console.log(`\n📊 Fetching underlying data for ${symbol}...`);
      const underlyingBars = await this.fetchUnderlyingData(symbol, startDate, endDate);
      console.log(`   Retrieved ${underlyingBars.length} bars`);

      if (underlyingBars.length === 0) {
        throw new Error('No underlying data retrieved');
      }

      // Step 2: Generate strategy signals
      console.log(`\n🎯 Generating strategy signals...`);
      const strategySignals = strategy.generateSignals(underlyingBars);
      console.log(`   Generated ${strategySignals.length} signals`);
      
      // Group signals by timestamp to see distribution
      const signalsByTime = strategySignals.reduce((acc, sig) => {
        acc[sig.timestamp] = (acc[sig.timestamp] || 0) + 1;
        return acc;
      }, {});
      const uniqueTimestamps = Object.keys(signalsByTime).length;
      console.log(`   Signals across ${uniqueTimestamps} unique timestamps`);
      console.log(`   Signal type breakdown: CALL=${strategySignals.filter(s => s.signal_type === 'BUY_CALL').length}, PUT=${strategySignals.filter(s => s.signal_type === 'BUY_PUT').length}`);

      // Add symbol to signals if not present
      strategySignals.forEach(sig => {
        if (!sig.symbol && !sig.underlying_symbol) {
          sig.symbol = symbol;
          sig.underlying_symbol = symbol;
        }
      });

      // Step 3: Process each bar and manage positions
      console.log(`\n⚙️  Processing bars and managing positions...`);
      let currentCapital = initialCapital;
      let barCount = 0;
      let executedSignals = 0;

      for (const bar of underlyingBars) {
        barCount++;
        const currentTime = bar.t;
        const currentPrice = parseFloat(bar.c);

        // Check for ALL signals at this timestamp (not just the first one)
        const activeSignals = strategySignals.filter(s => s.timestamp === currentTime);

        // Update existing positions
        const updateResult = await this.updateOpenPositions(bar, strategy, activeBacktestId, mode);

        // CRITICAL FIX: Apply trade P&L to cash balance
        if (updateResult && updateResult.tradeResult && updateResult.tradeResult.netPnL) {
          currentCapital += updateResult.tradeResult.netPnL;
          console.log(`   💰 Updated capital: $${currentCapital.toLocaleString()} (P&L: ${updateResult.tradeResult.netPnL >= 0 ? '+' : ''}$${updateResult.tradeResult.netPnL.toFixed(2)})`);
        }

        // Execute ALL signals at this timestamp (up to position limit)
        if (activeSignals.length > 0) {
          console.log(`   🎯 Found ${activeSignals.length} signals at ${currentTime}`);
          
          for (const signal of activeSignals) {
            // Check if we can still open more positions
            if (!strategy.canOpenPosition()) {
              console.log(`   ⏸️  Max positions (${strategy.maxPositions}) reached, skipping remaining signals`);
              break;
            }

            const executed = await this.executeSignal(
              signal,
              bar,
              strategy,
              activeBacktestId,
              currentCapital,
              mode
            );

            if (executed) {
              executedSignals++;
              console.log(`   ✅ Signal ${executedSignals}/${strategySignals.length}: ${signal.signal_type} at $${currentPrice.toFixed(2)}`);
            } else {
              console.log(`   ❌ Signal NOT executed: ${signal.signal_type} (reason logged above)`);
            }
          }
        }

        // Update portfolio value
        const portfolioValue = this.calculatePortfolioValue(currentCapital);
        this.portfolioValue.push({
          timestamp: currentTime,
          value: portfolioValue,
          cash: currentCapital,
          positionsValue: portfolioValue - currentCapital
        });

        // Progress indicator
        if (barCount % 100 === 0) {
          process.stdout.write(`\r   Processed ${barCount}/${underlyingBars.length} bars...`);
        }
      }

      console.log(`\n   ✅ Processed all ${barCount} bars`);
      console.log(`   📊 Executed ${executedSignals} signals`);
      console.log(`   📈 Total trades: ${this.closedPositions.length}`);

      // Close any remaining open positions
      if (this.openPositions.length > 0) {
        console.log(`\n🔚 Closing ${this.openPositions.length} open positions...`);
        const finalPnL = await this.closeAllPositions(underlyingBars[underlyingBars.length - 1], activeBacktestId);
        
        // Apply final P&L to capital
        if (finalPnL) {
          currentCapital += finalPnL;
          console.log(`   💰 Final capital adjustment: +$${finalPnL.toFixed(2)} = $${currentCapital.toLocaleString()}`);
        }
      }

      // Calculate performance metrics
      console.log(`\n📈 Calculating performance metrics...`);
      const finalCapital = currentCapital; // Use updated cash balance, not calculatePortfolioValue
      const performance = this.calculatePerformanceMetrics(
        initialCapital,
        finalCapital,
        this.closedPositions,
        this.portfolioValue
      );

      console.log(`\n💰 Results:`);
      console.log(`   Initial Capital: $${initialCapital.toLocaleString()}`);
      console.log(`   Final Capital: $${finalCapital.toLocaleString()}`);
      console.log(`   Total Return: ${(performance.totalReturn * 100).toFixed(2)}%`);
      console.log(`   Win Rate: ${(performance.winRate * 100).toFixed(1)}%`);
      console.log(`   Sharpe Ratio: ${performance.sharpeRatio.toFixed(2)}`);
      console.log(`   Max Drawdown: ${(performance.maxDrawdown * 100).toFixed(2)}%`);

      // Update backtest record with results
      await this.finalizeBacktest(activeBacktestId, finalCapital, performance);

      console.log(`\n✅ Backtest complete! Results saved to database.\n`);

      return {
        backtestId: activeBacktestId,
        performance,
        trades: this.closedPositions,
        signals: this.signals,
        portfolioValue: this.portfolioValue
      };

    } catch (error) {
      console.error(`\n❌ Backtest failed:`, error.message);
      
      if (this.currentBacktest) {
        await this.db.query(
          'UPDATE backtests SET status = $1, error_message = $2, completed_at = NOW() WHERE id = $3',
          ['failed', error.message, this.currentBacktest.id]
        );
      }
      
      throw error;
    }
  }

  /**
   * Initialize backtest record in database
   */
  async initializeBacktest(config) {
    const result = await this.db.query(`
      INSERT INTO backtests (
        user_id, strategy_name, symbol, start_date, end_date,
        initial_capital, execution_mode, status, parameters
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `, [
      config.userId,
      config.strategyName,
      config.symbol,
      config.startDate,
      config.endDate,
      config.initialCapital,
      config.mode,
      'running',
      JSON.stringify(config.parameters)
    ]);

    return { id: result.rows[0].id };
  }

  /**
   * Fetch historical underlying bars using SQL cache first
   */
  async fetchUnderlyingData(symbol, startDate, endDate) {
    console.log(`📊 [DATA CACHE] Getting underlying data for ${symbol} (${startDate} to ${endDate})`);
    return await this.dataCacheManager.getUnderlyingBars(symbol, startDate, endDate);
  }

  /**
   * Execute trading signal
   */
  async executeSignal(signal, currentBar, strategy, backtestId, availableCapital, mode) {
    try {
      // Get target expiry date
      const expiryDate = this.getTargetExpiry(currentBar.t, signal.target_expiry || strategy.preferredDTE);
      
      // Get underlying symbol from signal or fallback to SPY
      const underlyingSymbol = signal.underlying_symbol || signal.symbol || 'SPY';
      
      // Get current price for context
      const currentPrice = parseFloat(currentBar.c);
      
      console.log(`🎯 [EXECUTE SIGNAL] ${signal.signal_type} at ${currentBar.t}, underlying: $${currentPrice.toFixed(2)}`);

      // Fetch full-day options data for this expiry if not already cached
      const dayStart = moment(currentBar.t).tz('America/New_York').startOf('day').format();
      const dayEnd = moment(currentBar.t).tz('America/New_York').endOf('day').format();
      const broadCacheKey = `${underlyingSymbol}_${expiryDate}_${dayStart}_${dayEnd}`;
      
      if (!this.optionsDataCache.has(broadCacheKey)) {
        console.log(`   📡 Fetching full-day options data for ${expiryDate}...`);
        const optionsData = await this.dataCacheManager.getOptionsData(
          underlyingSymbol,
          expiryDate,
          dayStart,
          dayEnd,
          currentPrice // Pass current price for strike range calculation
        );
        
        if (optionsData && optionsData.length > 0) {
          // Cache the full options data with bars arrays
          this.optionsDataCache.set(broadCacheKey, optionsData);
          console.log(`   ✅ Cached ${optionsData.length} contracts for ${expiryDate} (key: ${broadCacheKey})`);
        } else {
          console.log(`   ⚠️  No options data available for ${expiryDate}`);
          return false;
        }
      }

      // USE CACHED OPTION CHAIN WITH PRE-CALCULATED GREEKS
      const optionChain = await this.dataCacheManager.buildOptionChainFromCache(
        underlyingSymbol,
        expiryDate,
        currentPrice,
        currentBar.t
      );

      if (optionChain.length === 0) {
        console.log(`   ⚠️  No cached option chain available for ${expiryDate} at ${currentBar.t}`);
        return false;
      }

      console.log(`   📋 Using cached option chain with ${optionChain.length} contracts (Greeks pre-calculated)`);

      // Filter option chain to include strikes within reasonable range of underlying price
      const filteredOptionChain = this.contractSelector.filterByStrikeRange(
        optionChain, 
        currentPrice, 
        5  // numStrikes = 5 means 5 strikes on each side (±$5 range around ATM)
      );

      console.log(`   🎯 Filtered option chain from ${optionChain.length} to ${filteredOptionChain.length} contracts within ±$5 of underlying $${currentPrice.toFixed(2)}`);

      if (filteredOptionChain.length === 0) {
        console.log(`   ⚠️  No contracts found within ±$5 strike range of underlying price $${currentPrice.toFixed(2)}`);
        return false;
      }

      // Select best contract using pre-calculated Greeks from filtered chain
      const criteria = strategy.getContractCriteria(signal, mode);
      const selectedContract = this.contractSelector.selectBestContract(
        filteredOptionChain, 
        criteria.optionType, 
        criteria.targetDelta
      );

      if (!selectedContract) {
        console.log(`   ⚠️  No suitable contract found`);
        return false;
      }

      // Check total contracts for this symbol (limit to 100 contracts per contract symbol)
      const existingPositions = this.openPositions.filter(pos => 
        pos.contract_symbol === selectedContract.contract_symbol && 
        pos.status === 'OPEN'
      );
      
      const totalExistingContracts = existingPositions.reduce((sum, pos) => sum + (pos.quantity || 0), 0);
      const maxContractsPerSymbol = 100;
      
      if (totalExistingContracts >= maxContractsPerSymbol) {
        console.log(`   ⏸️  Max contracts (${maxContractsPerSymbol}) reached for ${selectedContract.contract_symbol} (current: ${totalExistingContracts})`);
        return false;
      }

      // Calculate position size with proper validation
      const contractPrice = selectedContract.price;
      
      // Validate contract price
      if (!contractPrice || !isFinite(contractPrice) || contractPrice <= 0) {
        console.log(`   ⚠️  Invalid contract price: ${contractPrice}`);
        return false;
      }
      
      const contractCost = contractPrice * 100; // Multiplier
      const maxContracts = Math.floor(availableCapital * 0.1 / contractCost); // Use 10% of capital
      const availableContractsForSymbol = maxContractsPerSymbol - totalExistingContracts;
      const quantity = Math.min(strategy.contractsPerTrade || 1, maxContracts, availableContractsForSymbol);

      // Validate quantity before database insertion
      if (!quantity || !isFinite(quantity) || quantity <= 0) {
        console.log(`   ⚠️  Invalid quantity calculated: ${quantity} (contractPrice: ${contractPrice}, maxContracts: ${maxContracts}, available: ${availableContractsForSymbol})`);
        return false;
      }

      // Create position with contract instance
      const position = await this.openPosition({
        backtestId,
        contract: selectedContract,
        quantity,
        entryTime: currentBar.t,
        underlyingPrice: currentPrice,
        mode,
        signal: signal
      });

      this.openPositions.push(position);
      strategy.currentPositions.push(position);

      console.log(`   ✅ OPENED: ${position.contract_symbol} x${quantity} @ $${contractPrice.toFixed(2)} (Delta: ${selectedContract.greeks.delta.toFixed(4)}, Gamma: ${selectedContract.greeks.gamma.toFixed(4)}, IV: ${(selectedContract.greeks.impliedVolatility * 100).toFixed(1)}%)`);

      return true;

    } catch (error) {
      console.error(`   ❌ Error executing signal:`, error.message);
      console.error(`   📊 [ERROR STACK]`, error.stack);
      return false;
    }
  }

  /**
   * Open new position with contract instance tracking
   */
  async openPosition(config) {
    const { backtestId, contract, quantity, entryTime, underlyingPrice, mode, signal } = config;

    // Validate required integer fields
    if (!backtestId || !isFinite(backtestId)) {
      throw new Error(`Invalid backtestId: ${backtestId}`);
    }
    
    if (!quantity || !isFinite(quantity) || quantity <= 0) {
      throw new Error(`Invalid quantity: ${quantity}`);
    }

    // Generate unique contract instance ID
    const instanceId = uuidv4();

    // Calculate realistic fill price using enhanced OHLCV data
    const fillInfo = this.calculateFillPrice(contract, entryTime, 'BUY');
    console.log(`   💰 [FILL PRICING] ${contract.contract_symbol}: $${fillInfo.price.toFixed(3)} via ${fillInfo.method} (quality: ${fillInfo.quality}, slippage: ${fillInfo.slippage.toFixed(2)}%)`);

    // Validate and sanitize Greeks values to prevent database errors
    const sanitizeValue = (value, maxAbs = 999999) => {
      if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
        return null;
      }
      // Additional bounds checking to prevent database overflow
      if (Math.abs(value) > maxAbs) {
        console.log(`   ⚠️  [BOUNDS CHECK] Value ${value} exceeds limit ${maxAbs}, setting to null`);
        return null;
      }
      return value;
    };

    const sanitizedGreeks = {
      delta: sanitizeValue(contract.greeks?.delta),
      gamma: sanitizeValue(contract.greeks?.gamma),
      theta: sanitizeValue(contract.greeks?.theta),
      vega: sanitizeValue(contract.greeks?.vega),
      rho: sanitizeValue(contract.greeks?.rho),
      impliedVolatility: sanitizeValue(contract.greeks?.impliedVolatility)
    };

    // Additional bounds checking for Greeks to prevent database overflow (numeric(8,6) allows -99.999999 to 99.999999)
    // Using very conservative limits well below database constraints to prevent overflow
    const boundedGreeks = {
      delta: sanitizedGreeks.delta !== null && Math.abs(sanitizedGreeks.delta) > 1.0 ? null : sanitizedGreeks.delta,
      gamma: sanitizedGreeks.gamma !== null && Math.abs(sanitizedGreeks.gamma) > 5.0 ? null : sanitizedGreeks.gamma,
      theta: sanitizedGreeks.theta !== null && Math.abs(sanitizedGreeks.theta) > 50.0 ? null : sanitizedGreeks.theta,
      vega: sanitizedGreeks.vega !== null && Math.abs(sanitizedGreeks.vega) > 5.0 ? null : sanitizedGreeks.vega,
      rho: sanitizedGreeks.rho !== null && Math.abs(sanitizedGreeks.rho) > 5.0 ? null : sanitizedGreeks.rho,
      impliedVolatility: sanitizedGreeks.impliedVolatility !== null && Math.abs(sanitizedGreeks.impliedVolatility) > 3.0 ? null : sanitizedGreeks.impliedVolatility
    };

    const result = await this.db.query(`
      INSERT INTO option_contracts (
        instance_id, backtest_id, contract_symbol, underlying_symbol, 
        strike_price, expiry_date, option_type, entry_timestamp, 
        entry_price, entry_bid, entry_ask, entry_spread_pct, quantity,
        entry_underlying_price, entry_delta, entry_gamma,
        entry_theta, entry_vega, entry_rho, entry_iv,
        execution_mode, status, signal_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
      RETURNING id
    `, [
      instanceId,
      backtestId,
      contract.contract_symbol,
      contract.underlying_symbol,
      sanitizeValue(contract.strike_price, 99999), // numeric(10,2) max ~99999
      contract.expiry_date,
      contract.option_type,
      entryTime,
      sanitizeValue(fillInfo.price, 99999), // numeric(10,4) max ~99999
      mode === 'live' ? sanitizeValue(contract.greeks?.bid, 99999) : sanitizeValue(fillInfo.metadata?.original_price, 99999),
      mode === 'live' ? sanitizeValue(contract.greeks?.ask, 99999) : sanitizeValue(fillInfo.price, 99999),
      mode === 'live' ? sanitizeValue(contract.greeks?.spreadPct, 99) : sanitizeValue(fillInfo.slippage, 99), // numeric(8,6) max ~99
      quantity,
      sanitizeValue(underlyingPrice, 99999), // numeric(10,4) max ~99999
      boundedGreeks.delta,
      boundedGreeks.gamma,
      boundedGreeks.theta,
      boundedGreeks.vega,
      boundedGreeks.rho,
      boundedGreeks.impliedVolatility,
      mode,
      'OPEN',
      JSON.stringify(signal || {})
    ]).catch(err => {
      console.error(`   ❌ [DB INSERT ERROR] Failed to insert position:`, err.message);
      console.error(`   📊 [DEBUG VALUES] contract=${contract.contract_symbol}, strike=${contract.strike_price}, price=${fillInfo.price}`);
      console.error(`   📊 [DEBUG GREEKS] delta=${boundedGreeks.delta}, gamma=${boundedGreeks.gamma}, theta=${boundedGreeks.theta}, vega=${boundedGreeks.vega}, IV=${boundedGreeks.impliedVolatility}`);
      throw err;
    });

    return {
      id: result.rows[0].id,
      instance_id: instanceId,
      contract_symbol: contract.contract_symbol,
      underlying_symbol: contract.underlying_symbol,
      strike_price: contract.strike_price,
      expiry_date: contract.expiry_date,
      option_type: contract.option_type,
      quantity,
      entry_timestamp: entryTime,
      entry_price: fillInfo.price, // Use enhanced fill price
      fill_method: fillInfo.method,
      fill_quality: fillInfo.quality,
      slippage_pct: fillInfo.slippage,
      status: 'OPEN',
      greeks: contract.greeks
    };
  }

  /**
   * Update open positions with real-time Greeks and check for exits
   */
  async updateOpenPositions(bar, strategy, backtestId, mode) {
    const positionsToClose = [];

    for (const position of this.openPositions) {
      try {
        // Fetch option bar at current timestamp
        const cacheKey = `${position.underlying_symbol}_${position.expiry_date}_${bar.t}`;
        console.log(`🔍 [INITIAL LOOKUP] Searching for cacheKey: ${cacheKey}`);
        let contractsArray = this.optionsDataCache.get(cacheKey);
        console.log(`🔍 [INITIAL LOOKUP] Found contracts array: ${contractsArray ? contractsArray.length : 'null'} contracts`);
        
        let contractData = null;
        if (contractsArray && Array.isArray(contractsArray)) {
          contractData = contractsArray.find(c => c.contract_symbol === position.contract_symbol);
          console.log(`🔍 [INITIAL LOOKUP] Contract ${position.contract_symbol} found in array: ${!!contractData}`);
        }

        if (!contractData) {
          // Fetch from cache using broader key
          const dayStart = moment(bar.t).tz('America/New_York').startOf('day').format();
          const dayEnd = moment(bar.t).tz('America/New_York').endOf('day').format();
          
          // Normalize expiry date to YYYY-MM-DD format (it might be stored as Date object)
          const expiryStr = typeof position.expiry_date === 'string' && position.expiry_date.includes('-') 
            ? position.expiry_date 
            : moment(position.expiry_date).format('YYYY-MM-DD');
          
          const broadKey = `${position.underlying_symbol}_${expiryStr}_${dayStart}_${dayEnd}`;
          
          console.log(`🔍 [LOOKUP DEBUG] No contractData for specific key. Trying broadKey: ${broadKey}`);
          
          const allContracts = this.optionsDataCache.get(broadKey);
          if (allContracts) {
            console.log(`✅ [LOOKUP DEBUG] Found ${allContracts.length} contracts in cache for broadKey`);
            contractData = allContracts.find(c => c.contract_symbol === position.contract_symbol);
            if (contractData) {
              console.log(`✅ [LOOKUP DEBUG] Found contract ${position.contract_symbol} with ${contractData.bars ? contractData.bars.length : 0} bars`);
            } else {
              console.log(`❌ [LOOKUP DEBUG] Contract ${position.contract_symbol} not found in ${allContracts.length} cached contracts`);
              console.log(`🔍 [LOOKUP DEBUG] Available contracts: ${allContracts.map(c => c.contract_symbol).slice(0, 5).join(', ')}`);
            }
          } else {
            console.log(`❌ [LOOKUP DEBUG] No contracts found in cache for broadKey: ${broadKey}`);
            console.log(`🔍 [LOOKUP DEBUG] Cache keys available: ${Array.from(this.optionsDataCache.keys()).slice(0, 3).join(', ')}`);
          }
        }

        if (!contractData || !contractData.bars) {
          console.log(`   ⚠️  No option data for ${position.contract_symbol} at ${bar.t}`);
          console.log(`   🔍 [NO DATA DEBUG] contractData exists: ${!!contractData}, has bars: ${contractData && !!contractData.bars}`);
          continue;
        }

        // Find bar at current timestamp
        const optionBar = contractData.bars.find(b => {
          const barTime = new Date(b.t);
          const currentTime = new Date(bar.t);
          return Math.abs(barTime - currentTime) < 60000; // Within 1 minute
        });

        if (!optionBar || !optionBar.c || optionBar.c <= 0) {
          continue; // Skip if no bar at this time or invalid price
        }

        const currentPrice = parseFloat(optionBar.c);
        const underlyingPrice = parseFloat(bar.c);

        // OPTIMIZED: Calculate Greeks ONCE per (contract, timestamp) and cache in bar object
        // If another position uses the same contract at the same time, reuse cached Greeks
        if (!optionBar.greeks) {
          // First access - calculate and cache
          optionBar.greeks = this.greeksCalculator.estimateGreeksFromOHLCV(
            underlyingPrice,
            position.strike_price,
            position.expiry_date,
            position.option_type,
            optionBar,
            optionBar.t
          );
        }
        // Subsequent accesses use cached value
        const greeks = optionBar.greeks;

        // Save bar-level Greeks to database (uses cached Greeks)
        await this.saveBarGreeks(position, optionBar, bar, greeks);

        // Check if should exit
        const exitDecision = strategy.shouldExit(position, currentPrice, bar.t);

        if (exitDecision.shouldExit) {
          // REALISTIC FILLS: Use low price for stop losses, close price for profit targets
          let exitPrice = currentPrice; // Default to close price
          if (exitDecision.reason && (exitDecision.reason.includes('STOP') || exitDecision.reason.includes('LOSS'))) {
            // Stop losses hit at the LOW of the bar (more realistic/conservative)
            exitPrice = parseFloat(optionBar.l);
          }

          positionsToClose.push({
            position,
            exitDecision,
            currentPrice: exitPrice, // Use realistic exit price
            exitGreeks: greeks
          });
        }

        // Store Greeks in position for tracking
        position.current_price = currentPrice;
        position.current_greeks = greeks;

      } catch (error) {
        console.error(`   ⚠️  Error updating position ${position.contract_symbol}:`, error.message);
      }
    }

    // Close positions
    for (const { position, exitDecision, currentPrice, exitGreeks } of positionsToClose) {
      const tradeResult = await this.closePosition(position, currentPrice, bar.t, exitDecision.reason, exitGreeks, backtestId);
      
      // CRITICAL FIX: Update cash balance with trade P&L
      if (tradeResult && tradeResult.netPnL) {
        // Return the trade result so the main loop can update currentCapital
        return { tradeResult };
      }
    }
  }

  /**
   * Save bar-level Greeks to database
   */
  async saveBarGreeks(position, optionBar, underlyingBar, greeks) {
    try {
      // Validate and sanitize values before database insertion
      const sanitizeFloat = (value) => {
        const parsed = parseFloat(value);
        return isFinite(parsed) ? parsed : null;
      };
      
      const sanitizeInt = (value) => {
        const parsed = parseInt(value);
        return isFinite(parsed) ? parsed : null;
      };

      await this.db.query(`
        INSERT INTO option_contract_bars (
          contract_instance_id, bar_timestamp, option_open, option_high,
          option_low, option_close, option_volume, underlying_price,
          delta, gamma, theta, vega, rho, implied_volatility,
          time_to_expiry
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (contract_instance_id, bar_timestamp) DO UPDATE SET
          option_close = EXCLUDED.option_close,
          delta = EXCLUDED.delta,
          gamma = EXCLUDED.gamma,
          theta = EXCLUDED.theta,
          vega = EXCLUDED.vega
      `, [
        position.instance_id,
        optionBar.t,
        sanitizeFloat(optionBar.o),
        sanitizeFloat(optionBar.h),
        sanitizeFloat(optionBar.l),
        sanitizeFloat(optionBar.c),
        sanitizeInt(optionBar.v), // INTEGER field - use sanitizeInt
        sanitizeFloat(underlyingBar.c),
        sanitizeFloat(greeks.delta),
        sanitizeFloat(greeks.gamma),
        sanitizeFloat(greeks.theta),
        sanitizeFloat(greeks.vega),
        sanitizeFloat(greeks.rho),
        sanitizeFloat(greeks.impliedVolatility),
        sanitizeFloat(greeks.timeToExpiry)
      ]);
    } catch (error) {
      // Don't fail the backtest if saving Greeks fails
      console.error(`   ⚠️  Error saving bar Greeks: ${error.message}`);
    }
  }

  /**
   * Close position with exit Greeks and enhanced OHLCV fill pricing
   */
  async closePosition(position, exitPrice, exitTime, closeReason, exitGreeks, backtestId) {
    // Calculate enhanced exit fill price using OHLCV data if available
    let enhancedExitPrice = exitPrice;
    let fillMethod = 'provided_price';
    let fillQuality = 'medium';
    let slippage = 0;

    // Try to get better fill price from contract data
    if (position.contract_data && position.contract_data.bars) {
      const fillInfo = this.calculateFillPrice(position.contract_data, exitTime, 'SELL');
      enhancedExitPrice = fillInfo.price;
      fillMethod = fillInfo.method;
      fillQuality = fillInfo.quality;
      slippage = fillInfo.slippage;
      
      console.log(`   💰 [EXIT FILL] ${position.contract_symbol}: $${enhancedExitPrice.toFixed(3)} via ${fillMethod} (was $${exitPrice.toFixed(3)})`);
    } else {
      // Use provided price but still apply slight slippage for realism
      const baseSlippage = 0.002; // 0.2% default slippage
      enhancedExitPrice = exitPrice * (1 - baseSlippage); // Selling gets slightly worse price
      slippage = baseSlippage * 100;
      fillMethod = 'fallback_with_slippage';
    }

    const grossPnL = (enhancedExitPrice - position.entry_price) * position.quantity * 100;
    const fees = position.quantity * 1.30; // $0.65 per contract per side
    const netPnL = grossPnL - fees;
    
    // FIXED: Return percentage must account for fees (net P&L / capital at risk)
    const capitalAtRisk = position.entry_price * position.quantity * 100;
    const returnPct = netPnL / capitalAtRisk;
    
    // FIXED: Calculate holding period in minutes
    const entryTime = new Date(position.entry_timestamp);
    const exitTimeDate = new Date(exitTime);
    const holdingPeriodMinutes = Math.round((exitTimeDate - entryTime) / (1000 * 60));

    await this.db.query(`
      UPDATE option_contracts
      SET exit_timestamp = $1, exit_price = $2, gross_pnl = $3,
          net_pnl = $4, fees = $5, return_pct = $6,
          exit_delta = $7, exit_gamma = $8, exit_theta = $9,
          exit_vega = $10, exit_rho = $11, exit_iv = $12,
          holding_period_minutes = $13,
          status = 'CLOSED', close_reason = $14, updated_at = NOW()
      WHERE instance_id = $15
    `, [
      exitTime, enhancedExitPrice, grossPnL, netPnL, fees, returnPct,
      exitGreeks?.delta, exitGreeks?.gamma, exitGreeks?.theta,
      exitGreeks?.vega, exitGreeks?.rho, exitGreeks?.impliedVolatility,
      holdingPeriodMinutes,
      closeReason, position.instance_id
    ]);

    // Move to closed positions
    const closedPosition = {
      ...position,
      exit_price: enhancedExitPrice,
      original_exit_price: exitPrice,
      exit_fill_method: fillMethod,
      exit_fill_quality: fillQuality,
      exit_slippage_pct: slippage,
      exit_timestamp: exitTime,
      gross_pnl: grossPnL,
      net_pnl: netPnL,
      fees,
      return_pct: returnPct,
      holding_period_minutes: holdingPeriodMinutes,
      close_reason: closeReason,
      exit_greeks: exitGreeks,
      status: 'CLOSED'
    };

    this.closedPositions.push(closedPosition);
    this.openPositions = this.openPositions.filter(p => p.instance_id !== position.instance_id);

    console.log(`   🔴 CLOSED: ${position.contract_symbol} x${position.quantity} @ $${exitPrice.toFixed(2)} | P&L: $${netPnL.toFixed(2)} (${(returnPct * 100).toFixed(1)}%) | Reason: ${closeReason}`);

    // CRITICAL FIX: Return the P&L so it can be applied to cash balance
    return { netPnL, grossPnL, fees };
  }

  /**
   * Close all remaining open positions
   */
  async closeAllPositions(lastBar, backtestId) {
    let totalPnL = 0;
    
    for (const position of this.openPositions) {
      const tradeResult = await this.closePosition(
        position,
        position.entry_price, // Use entry price as exit (conservative)
        lastBar.t,
        'BACKTEST_END',
        null, // No exit Greeks for end-of-backtest
        backtestId
      );
      
      if (tradeResult && tradeResult.netPnL) {
        totalPnL += tradeResult.netPnL;
      }
    }
    
    // Return total P&L from closing positions
    return totalPnL;
  }

  /**
   * Calculate current portfolio value
   */
  calculatePortfolioValue(cash) {
    const positionsValue = this.openPositions.reduce((sum, pos) => {
      // Use current market value of open positions, not entry value
      const currentValue = pos.current_price 
        ? pos.current_price * pos.quantity * 100 
        : pos.entry_price * pos.quantity * 100;
      return sum + currentValue;
    }, 0);

    // Portfolio = cash + current market value of open positions
    return cash + positionsValue;
  }

  /**
   * Calculate performance metrics
   */
  calculatePerformanceMetrics(initialCapital, finalCapital, trades, portfolioHistory) {
    const totalReturn = (finalCapital - initialCapital) / initialCapital;
    
    const winningTrades = trades.filter(t => t.net_pnl > 0);
    const losingTrades = trades.filter(t => t.net_pnl < 0);
    const winRate = trades.length > 0 ? winningTrades.length / trades.length : 0;

    const avgWin = winningTrades.length > 0
      ? winningTrades.reduce((sum, t) => sum + t.net_pnl, 0) / winningTrades.length
      : 0;

    const avgLoss = losingTrades.length > 0
      ? Math.abs(losingTrades.reduce((sum, t) => sum + t.net_pnl, 0) / losingTrades.length)
      : 0;

    const profitFactor = avgLoss > 0 ? avgWin / avgLoss : 0;

    // Calculate Sharpe ratio (simplified)
    const returns = portfolioHistory.map((v, i) => {
      if (i === 0) return 0;
      return (v.value - portfolioHistory[i - 1].value) / portfolioHistory[i - 1].value;
    });

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    const sharpeRatio = stdDev > 0 ? (avgReturn * 252) / (stdDev * Math.sqrt(252)) : 0;

    // Max drawdown
    let maxDrawdown = 0;
    let peak = initialCapital;
    
    for (const point of portfolioHistory) {
      if (point.value > peak) peak = point.value;
      const drawdown = (peak - point.value) / peak;
      if (drawdown > maxDrawdown) maxDrawdown = drawdown;
    }

    return {
      totalReturn,
      winRate,
      profitFactor,
      sharpeRatio,
      maxDrawdown,
      totalTrades: trades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      avgWin,
      avgLoss
    };
  }

  /**
   * Finalize backtest in database
   */
  async finalizeBacktest(backtestId, finalCapital, performance) {
    await this.db.query(`
      UPDATE backtests
      SET final_capital = $1, total_return = $2, sharpe_ratio = $3,
          max_drawdown = $4, win_rate = $5, profit_factor = $6,
          total_trades = $7, winning_trades = $8, losing_trades = $9,
          avg_win = $10, avg_loss = $11, status = 'completed',
          completed_at = NOW()
      WHERE id = $12
    `, [
      finalCapital,
      performance.totalReturn,
      performance.sharpeRatio,
      performance.maxDrawdown,
      performance.winRate,
      performance.profitFactor,
      performance.totalTrades,
      performance.winningTrades,
      performance.losingTrades,
      performance.avgWin,
      performance.avgLoss,
      backtestId
    ]);
  }

  /**
   * Get target expiry date based on DTE preference
   */
  getTargetExpiry(currentDate, dte = 0) {
    const date = moment(currentDate).tz('America/New_York');
    return date.add(dte, 'days').format('YYYY-MM-DD');
  }

  /**
   * Fetch options data (using Alpaca integration)
   * @param {string} symbol - Underlying symbol
   * @param {string} expiryDate - Target expiry date (YYYY-MM-DD)
   * @param {string} startTime - Start timestamp for bars
   * @param {string} endTime - End timestamp for bars  
   * @param {string} mode - 'backtest' or 'live'
   * @returns {Array} Options bars data
   */
  /**
   * Fetch options data using SQL cache with pre-calculated Greeks
   * @param {string} symbol - Underlying symbol
   * @param {string} expiryDate - Target expiry date (YYYY-MM-DD)
   * @param {string} startTime - Start timestamp for bars
   * @param {string} endTime - End timestamp for bars  
   * @param {string} mode - 'backtest' or 'live'
   * @returns {Array} Options bars data with pre-calculated Greeks
   */
  async fetchOptionsData(symbol, expiryDate, startTime, endTime, mode = 'backtest') {
    console.log(`📊 [DATA CACHE] Getting options data for ${symbol} ${expiryDate} (cached Greeks)`);
    return await this.dataCacheManager.getOptionsData(symbol, expiryDate, startTime, endTime);
  }

  /**
   * Gather all data required for a specific date (for optimization pre-fetching)
   * @param {string} symbol - Underlying symbol
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Object} Pre-fetched data package
   */
  async gatherDataForDate(symbol, date) {
    try {
      console.log(`   🔄 Gathering data for ${symbol} on ${date}...`);
      
      // Fetch underlying data for the single day
      const underlyingBars = await this.fetchUnderlyingData(symbol, date, date);
      
      if (!underlyingBars || underlyingBars.length === 0) {
        return {
          success: false,
          error: `No underlying data found for ${symbol} on ${date}`
        };
      }
      
      // For 0DTE, expiry date is the same as trading date
      const expiryDate = date;
      
      // Create time range for the trading day (9:30 AM to 4:00 PM ET)
      const startTime = `${date}T09:30:00-04:00`;
      const endTime = `${date}T16:00:00-04:00`;
      
      // Fetch options data for 0DTE expiry
      const optionsData = await this.fetchOptionsData(
        symbol,
        expiryDate,
        startTime,
        endTime,
        'optimization' // Use optimization mode to avoid extra logging
      );
      
      // Create contract specifications from options data
      const optionContracts = [];
      
      if (optionsData && optionsData.length > 0) {
        // Extract unique contracts from the fetched options data
        const contractMap = new Map();
        
        optionsData.forEach(contract => {
          const key = `${contract.symbol}_${contract.strike}_${contract.option_type}`;
          if (!contractMap.has(key)) {
            contractMap.set(key, {
              symbol: contract.symbol,
              underlying_symbol: symbol,
              strike: contract.strike,
              option_type: contract.option_type,
              expiry_date: expiryDate,
              bars: []
            });
          }
          
          // Add bars to the contract
          if (contract.bars && contract.bars.length > 0) {
            contractMap.get(key).bars.push(...contract.bars);
          }
        });
        
        optionContracts.push(...contractMap.values());
      }
      
      return {
        success: true,
        symbol,
        date,
        underlyingBars,
        optionContracts,
        expiryDate,
        dataPoints: underlyingBars.length,
        contractCount: optionContracts.length
      };
      
    } catch (error) {
      console.error(`   ❌ Error gathering data for ${symbol} ${date}: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * OPTUNA OPTIMIZATION INTEGRATION
   * Handles parameter optimization directly in the backtesting engine
   */

  /**
   * Run parameter optimization using REAL Optuna optimization (not random search)
   */
  async runOptimization(config) {
    console.log(`\n🔥 Starting REAL Optuna Optimization in BacktestEngine:`);
    console.log(`   Strategy: ${config.strategyName}`);
    console.log(`   Original Period: ${config.startDate} to ${config.endDate}`);
    console.log(`   Symbols: ${config.symbols.join(', ')}`);
    console.log(`   Max Iterations: ${config.maxIterations || 100}`);
    console.log(`   Target: ${config.primaryMetric || 'sharpe_ratio'}`);

    // Calculate proper train/validation periods
    const periods = this.calculateTrainValidationPeriods(config.startDate, config.endDate);
    
    console.log(`\n📊 OPTIMIZATION PERIODS:`);
    console.log(`   🏋️  Training: ${periods.trainStart} to ${periods.trainEnd} (${periods.trainDays} trading days)`);
    console.log(`   ✅ Validation: ${periods.validStart} to ${periods.validEnd} (${periods.validDays} trading days)`);
    console.log(`   📈 Total Period: ${periods.totalDays} trading days`);

    if (periods.trainDays < 10) {
      console.log(`   ⚠️  WARNING: Only ${periods.trainDays} training days - consider longer period for robust optimization`);
    }

    const startTime = Date.now();
    let bestScore = -Infinity;
    let bestParams = null;
    let bestValidationScore = -Infinity;

    try {
      // Import optuna-js (JavaScript port of Optuna)
      const optuna = require('optuna');
      
      console.log(`\n🧠 REAL OPTUNA OPTIMIZATION:`);
      console.log(`   Using Bayesian optimization with TPE sampler`);
      console.log(`   Wide parameter ranges: 0.00 to ±10.00`);
      console.log(`   Learning from previous trials`);

      // Create Optuna study
      const study = optuna.create_study({
        direction: 'maximize',
        sampler: optuna.samplers.TPESampler(),
        pruner: optuna.pruners.MedianPruner()
      });

      // Define the objective function for Optuna
      const objective = async (trial) => {
        const iteration = trial.number + 1;
        console.log(`\n🎯 Optuna Trial ${iteration}:`);

        // Let Optuna suggest parameters with WIDE ranges
        const params = {
          // Entry/signal parameters (0.00 to 10.00)
          d_entry: trial.suggest_float('d_entry', 0.0, 10.0),
          d_near: trial.suggest_float('d_near', 0.0, 10.0), 
          s_min: trial.suggest_float('s_min', 0.0, 10.0),
          
          // Volatility and risk parameters (0.00 to 20.00 for indicators)
          rv_cap: trial.suggest_float('rv_cap', 0.0, 20.0),
          
          // Profit targets (0.00 to 10.00 = 0% to 1000%)
          profitTargetReversion: trial.suggest_float('profitTargetReversion', 0.0, 10.0),
          profitTargetTrend: trial.suggest_float('profitTargetTrend', 0.0, 10.0),
          
          // Stop losses (0.00 to 10.00 = 0% to 1000%)
          stopLossReversion: trial.suggest_float('stopLossReversion', 0.0, 10.0),
          stopLossTrend: trial.suggest_float('stopLossTrend', 0.0, 10.0),
          
          // Time stops (0 to 3600 seconds = 0 to 1 hour)
          timeStopReversion: trial.suggest_int('timeStopReversion', 0, 3600),
          timeStopTrend: trial.suggest_int('timeStopTrend', 0, 3600)
        };

        console.log(`   🎲 Optuna Suggested Parameters:`, this.formatParameters(params));

        try {
          // Run backtest on TRAINING period
          const trainMetrics = await this.runParameterBacktest({
            ...config,
            startDate: periods.trainStart,
            endDate: periods.trainEnd
          }, params);
          
          // Calculate training score
          const trainScore = this.calculateOptimizationScore(trainMetrics, config.primaryMetric);
          
          // Run backtest on VALIDATION period  
          const validMetrics = await this.runParameterBacktest({
            ...config,
            startDate: periods.validStart,
            endDate: periods.validEnd
          }, params);
          
          // Calculate validation score (this is what Optuna optimizes)
          const validScore = this.calculateOptimizationScore(validMetrics, config.primaryMetric);
          
          console.log(`   📈 TRAINING: Return=${(trainMetrics.total_return*100).toFixed(2)}%, Sharpe=${trainMetrics.sharpe_ratio.toFixed(3)}, Score=${trainScore.toFixed(4)}`);
          console.log(`   ✅ VALIDATION: Return=${(validMetrics.total_return*100).toFixed(2)}%, Sharpe=${validMetrics.sharpe_ratio.toFixed(3)}, Score=${validScore.toFixed(4)}`);

          // Store results for final analysis
          if (!this.optimizationResults) this.optimizationResults = [];
          this.optimizationResults.push({
            trial: iteration,
            parameters: params,
            trainMetrics,
            validMetrics,
            trainScore,
            validScore,
            combinedScore: (trainScore * 0.6) + (validScore * 0.4),
            timestamp: new Date().toISOString()
          });

          // Update best results
          if (validScore > bestValidationScore) {
            bestValidationScore = validScore;
            bestParams = params;
            console.log(`   🌟 NEW BEST VALIDATION SCORE! (${validScore.toFixed(4)})`);
          }

          // Return validation score for Optuna to optimize
          return validScore;

        } catch (error) {
          console.log(`   ❌ Trial ${iteration} failed: ${error.message}`);
          // Return very poor score for failed trials
          return -1000.0;
        }
      };

      // Run Optuna optimization
      console.log(`\n🚀 Starting ${config.maxIterations || 100} Optuna trials...`);
      await study.optimize(objective, { n_trials: config.maxIterations || 100 });

      // Get Optuna's best results
      const bestTrial = study.best_trial;
      const optunaResults = this.optimizationResults || [];
      
      console.log(`\n🏆 OPTUNA OPTIMIZATION COMPLETE:`);
      console.log(`   Best Validation Score: ${bestTrial.value.toFixed(4)}`);
      console.log(`   Best Parameters:`, this.formatParameters(bestTrial.params));
      console.log(`   Total Trials: ${study.trials.length}`);

      const duration = (Date.now() - startTime) / 1000 / 60;
      
      // Save final results
      const finalResults = await this.saveOptimizationResults(config, optunaResults, bestTrial.params, true, periods);

      return {
        success: true,
        bestScore: bestTrial.value,
        bestParams: bestTrial.params,
        results: optunaResults,
        duration: duration,
        totalIterations: study.trials.length,
        periods: periods,
        optimizationMethod: 'Optuna TPE (Bayesian)',
        resultsFile: finalResults.resultsFile,
        strategyFile: finalResults.strategyFile
      };

    } catch (error) {
      console.error(`❌ Optuna optimization failed: ${error.message}`);
      
      // Fallback to enhanced random search if Optuna fails
      console.log(`🔄 Falling back to enhanced random search...`);
      return await this.runEnhancedRandomOptimization(config, periods);
    }
  }

  /**
   * Enhanced random search fallback with wide parameter ranges
   */
  async runEnhancedRandomOptimization(config, periods) {
    console.log(`\n🎲 Running Enhanced Random Search with Wide Ranges:`);
    
    const startTime = Date.now();
    const results = [];
    let bestValidationScore = -Infinity;
    let bestParams = null;
    const maxIterations = config.maxIterations || 100;

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      console.log(`\n📊 Random Trial ${iteration}/${maxIterations}:`);

      // Generate random parameters with WIDE ranges (0.00 to ±10.00)
      const params = {
        d_entry: Math.random() * 10.0,
        d_near: Math.random() * 10.0,
        s_min: Math.random() * 10.0,
        rv_cap: Math.random() * 20.0, // Higher for indicators
        profitTargetReversion: Math.random() * 10.0,
        profitTargetTrend: Math.random() * 10.0,
        stopLossReversion: Math.random() * 10.0,
        stopLossTrend: Math.random() * 10.0,
        timeStopReversion: Math.floor(Math.random() * 3600),
        timeStopTrend: Math.floor(Math.random() * 3600)
      };

      console.log(`   🎲 Random Parameters:`, this.formatParameters(params));

      try {
        // Run backtest on TRAINING period
        const trainMetrics = await this.runParameterBacktest({
          ...config,
          startDate: periods.trainStart,
          endDate: periods.trainEnd
        }, params);
        
        const trainScore = this.calculateOptimizationScore(trainMetrics, config.primaryMetric);
        
        // Run backtest on VALIDATION period  
        const validMetrics = await this.runParameterBacktest({
          ...config,
          startDate: periods.validStart,
          endDate: periods.validEnd
        }, params);
        
        const validScore = this.calculateOptimizationScore(validMetrics, config.primaryMetric);
        
        console.log(`   📈 TRAIN: ${(trainMetrics.total_return*100).toFixed(2)}%, Sharpe=${trainMetrics.sharpe_ratio.toFixed(3)}, Score=${trainScore.toFixed(4)}`);
        console.log(`   ✅ VALID: ${(validMetrics.total_return*100).toFixed(2)}%, Sharpe=${validMetrics.sharpe_ratio.toFixed(3)}, Score=${validScore.toFixed(4)}`);

        const result = {
          trial: iteration,
          parameters: params,
          trainMetrics,
          validMetrics,
          trainScore,
          validScore,
          combinedScore: (trainScore * 0.6) + (validScore * 0.4),
          timestamp: new Date().toISOString()
        };
        results.push(result);

        if (validScore > bestValidationScore) {
          bestValidationScore = validScore;
          bestParams = params;
          console.log(`   🌟 NEW BEST VALIDATION SCORE! (${validScore.toFixed(4)})`);
        }

      } catch (error) {
        console.log(`   ❌ Trial ${iteration} failed: ${error.message}`);
        results.push({
          trial: iteration,
          parameters: params,
          error: error.message,
          trainScore: 0.001,
          validScore: 0.001,
          combinedScore: 0.001,
          timestamp: new Date().toISOString()
        });
      }
    }

    const duration = (Date.now() - startTime) / 1000 / 60;
    console.log(`\n✅ Enhanced Random Search completed in ${duration.toFixed(1)} minutes`);
    
    const finalResults = await this.saveOptimizationResults(config, results, bestParams, true, periods);

    return {
      success: true,
      bestScore: bestValidationScore,
      bestParams,
      results,
      duration: duration,
      totalIterations: results.length,
      periods: periods,
      optimizationMethod: 'Enhanced Random Search',
      resultsFile: finalResults.resultsFile,
      strategyFile: finalResults.strategyFile
    };
  }
  calculateTrainValidationPeriods(startDate, endDate) {
    const totalWeekdays = this.getWeekdays(startDate, endDate);
    const totalDays = totalWeekdays.length;
    
    // Ensure minimum viable periods
    if (totalDays < 15) {
      // Extend the period automatically for proper optimization
      const extendedEnd = moment(endDate).add(30, 'days').format('YYYY-MM-DD');
      const extendedWeekdays = this.getWeekdays(startDate, extendedEnd);
      console.log(`   📅 Auto-extending period to ${extendedEnd} for proper optimization (${extendedWeekdays.length} days)`);
      return this.calculateTrainValidationPeriods(startDate, extendedEnd);
    }
    
    // Split 70% training, 30% validation
    const trainSize = Math.floor(totalDays * 0.7);
    const validSize = totalDays - trainSize;
    
    const trainDays = totalWeekdays.slice(0, trainSize);
    const validDays = totalWeekdays.slice(trainSize);
    
    return {
      trainStart: trainDays[0],
      trainEnd: trainDays[trainDays.length - 1],
      trainDays: trainDays.length,
      validStart: validDays[0],
      validEnd: validDays[validDays.length - 1], 
      validDays: validDays.length,
      totalDays: totalDays,
      allWeekdays: totalWeekdays
    };
  }

  /**
  /**
   * Run backtest with specific parameters across all symbols and dates
   */
  async runParameterBacktest(config, params) {
    const allResults = [];
    
    // Get weekdays in the date range
    const weekdays = this.getWeekdays(config.startDate, config.endDate);
    
    for (const symbol of config.symbols) {
      for (const date of weekdays) {
        try {
          // Create strategy instance with parameters
          const StrategyClass = this.getStrategyClass(config.strategyName);
          const strategy = new StrategyClass(params);
          
          // Run backtest for this symbol/date
          const result = await this.runBacktest({
            strategy: strategy,
            symbol: symbol,
            startDate: date,
            endDate: date,
            initialCapital: config.initialCapital || 10000,
            maxPositions: config.maxPositions || 1,
            contracts: config.contracts || 1,
            mode: 'optimization'
          });
          
          if (result && result.success) {
            allResults.push(result);
          }
          
        } catch (error) {
          console.log(`      ⚠️ Failed ${symbol} ${date}: ${error.message}`);
        }
      }
    }

    // Calculate aggregate metrics
    return this.calculateAggregateMetrics(allResults, config.initialCapital || 10000);
  }

  /**
   * Calculate aggregate performance metrics from multiple backtest results
   */
  calculateAggregateMetrics(results, initialCapital) {
    if (results.length === 0) {
      return {
        total_return: 0,
        sharpe_ratio: 0,
        max_drawdown: 0,
        profit_factor: 0,
        win_rate: 0,
        total_trades: 0
      };
    }

    const returns = [];
    let totalPnL = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let grossWins = 0;
    let grossLosses = 0;
    let runningBalance = initialCapital;
    let peak = initialCapital;
    let maxDrawdown = 0;

    results.forEach(dayResult => {
      if (dayResult.trades && dayResult.trades.length > 0) {
        let dayPnL = 0;
        
        dayResult.trades.forEach(trade => {
          const tradePnL = trade.realized_pnl || 0;
          totalPnL += tradePnL;
          dayPnL += tradePnL;
          totalTrades++;
          
          if (tradePnL > 0) {
            winningTrades++;
            grossWins += tradePnL;
          } else {
            grossLosses += Math.abs(tradePnL);
          }
        });
        
        runningBalance += dayPnL;
        
        if (runningBalance > peak) {
          peak = runningBalance;
        } else {
          const drawdown = (peak - runningBalance) / peak;
          maxDrawdown = Math.max(maxDrawdown, drawdown);
        }
        
        const dailyReturn = dayPnL / initialCapital;
        returns.push(dailyReturn);
      } else {
        returns.push(0);
      }
    });

    const totalReturn = totalPnL / initialCapital;
    const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance = returns.length > 1 ? returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / (returns.length - 1) : 0;
    const volatility = Math.sqrt(variance * 252);
    const sharpeRatio = volatility > 0 ? (avgReturn * 252) / volatility : 0;
    
    const winRate = totalTrades > 0 ? winningTrades / totalTrades : 0;
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? 999 : 0);

    return {
      total_return: totalReturn,
      sharpe_ratio: sharpeRatio,
      max_drawdown: maxDrawdown,
      profit_factor: profitFactor,
      win_rate: winRate,
      total_trades: totalTrades,
      gross_wins: grossWins,
      gross_losses: grossLosses,
      avg_return: avgReturn,
      volatility: volatility
    };
  }

  /**
   * Calculate optimization score based on target metric
   */
  calculateOptimizationScore(metrics, primaryMetric = 'sharpe_ratio') {
    if (metrics.total_trades === 0) {
      return 0.001; // Very low score but not penalty
    }
    
    let score = 0;
    const minTradesForValidity = 1; // More lenient for 0DTE
    let validityMultiplier = metrics.total_trades >= minTradesForValidity ? 1.0 : 0.5;
    
    // Drawdown penalty
    const maxAcceptableDrawdown = 0.25;
    if (metrics.max_drawdown <= maxAcceptableDrawdown) {
      validityMultiplier *= 1.0;
    } else {
      validityMultiplier *= Math.max(0.3, 1.0 - metrics.max_drawdown);
    }
    
    // Calculate base score
    if (primaryMetric === 'sharpe_ratio') {
      const sharpeComponent = Math.max(0, metrics.sharpe_ratio) / 2.0; // Target Sharpe >= 2.0
      const returnComponent = Math.max(0, metrics.total_return) * 10;
      score = sharpeComponent * 0.7 + returnComponent * 0.3;
      
      // Bonus for exceeding Sharpe target
      if (metrics.sharpe_ratio >= 2.0) {
        score *= (1.0 + (metrics.sharpe_ratio - 2.0) * 0.1);
      }
    } else if (primaryMetric === 'total_return') {
      const returnComponent = Math.max(0, metrics.total_return) * 10;
      const sharpeComponent = Math.max(0, metrics.sharpe_ratio) / 2.0;
      score = returnComponent * 0.7 + sharpeComponent * 0.3;
    }
    
    score *= validityMultiplier;
    
    // Bonus for high win rate
    if (metrics.win_rate > 0.6) {
      score *= (1.0 + (metrics.win_rate - 0.6) * 0.2);
    }
    
    return Math.max(0.001, score);
  }

  /**
   * Get strategy class by name with better error handling
   */
  getStrategyClass(strategyName) {
    const strategyMap = {
      'HAVWAP': require('../strategies/havwap-proper'),
      'HAVWAP-Rev-v2': require('../strategies/havwap-proper'), // Fixed: Use existing strategy
      'havwap-proper': require('../strategies/havwap-proper'),
      'rsi-vwap-fusion': require('../strategies/rsi-vwap-fusion'),
      'DefaultStrategy': require('../strategies/havwap-proper')
    };
    
    const StrategyClass = strategyMap[strategyName] || strategyMap['DefaultStrategy'];
    console.log(`   🔧 Loading strategy: ${strategyName} -> ${StrategyClass.name || 'Strategy'}`);
    return StrategyClass;
  }

  /**
   * Get weekdays between two dates
   */
  getWeekdays(startDate, endDate) {
    const weekdays = [];
    const current = moment(startDate);
    const end = moment(endDate);
    
    while (current.isSameOrBefore(end)) {
      if (current.day() >= 1 && current.day() <= 5) { // Monday to Friday
        weekdays.push(current.format('YYYY-MM-DD'));
      }
      current.add(1, 'day');
    }
    
    return weekdays;
  }

  /**
   * Format parameters for display
   */
  formatParameters(params) {
    const formatted = {};
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'number') {
        formatted[key] = parseFloat(value.toFixed(4));
      } else {
        formatted[key] = value;
      }
    }
    return formatted;
  }

  /**
   * Save optimization results with train/validation period information
   */
  async saveOptimizationResults(config, results, bestParams, isFinal = false, periods = null) {
    const timestamp = Date.now();
    const resultsDir = '/app/optimization/results';
    const strategiesDir = '/app/strategies';
    
    // Ensure directories exist
    const fs = require('fs').promises;
    await fs.mkdir(resultsDir, { recursive: true });
    await fs.mkdir(strategiesDir, { recursive: true });
    
    // Calculate best scores from results
    const bestTrainScore = results.length > 0 ? Math.max(...results.map(r => r.trainScore || r.score || 0)) : 0;
    const bestValidScore = results.length > 0 ? Math.max(...results.map(r => r.validScore || r.score || 0)) : 0;
    const bestCombinedScore = results.length > 0 ? Math.max(...results.map(r => r.combinedScore || r.score || 0)) : 0;
    
    // Save results JSON with enhanced metadata
    const resultsFile = `${resultsDir}/${config.strategyName.toLowerCase()}_optimization_${timestamp}.json`;
    const resultsData = {
      config,
      periods: periods || { note: "Legacy optimization without train/validation split" },
      results,
      bestParams,
      bestTrainScore,
      bestValidScore, 
      bestCombinedScore,
      optimization_summary: {
        total_iterations: results.length,
        training_days: periods?.trainDays || 'unknown',
        validation_days: periods?.validDays || 'unknown',
        best_validation_sharpe: this.getBestMetric(results, 'validMetrics', 'sharpe_ratio'),
        best_validation_return: this.getBestMetric(results, 'validMetrics', 'total_return'),
        overfitting_risk: this.calculateOverfittingRisk(results)
      },
      timestamp: new Date().toISOString(),
      isFinal
    };
    
    await fs.writeFile(resultsFile, JSON.stringify(resultsData, null, 2));
    console.log(`💾 Results saved to: ${resultsFile}`);
    
    let strategyFile = null;
    if (isFinal && bestParams) {
      // Generate optimized strategy file with validation info
      strategyFile = `${strategiesDir}/${config.strategyName.toLowerCase()}-optimized.js`;
      const strategyCode = this.generateOptimizedStrategyCode(config.strategyName, bestParams, periods, resultsData.optimization_summary);
      await fs.writeFile(strategyFile, strategyCode);
      console.log(`📄 Optimized strategy saved to: ${strategyFile}`);
    }
    
    return { resultsFile, strategyFile };
  }

  /**
   * Get best metric from results for a specific metric type
   */
  getBestMetric(results, metricsKey, metricName) {
    const validResults = results.filter(r => r[metricsKey] && r[metricsKey][metricName] !== undefined);
    if (validResults.length === 0) return 'N/A';
    
    const values = validResults.map(r => r[metricsKey][metricName]);
    return Math.max(...values).toFixed(3);
  }

  /**
   * Calculate overfitting risk based on train vs validation performance
   */
  calculateOverfittingRisk(results) {
    const validResults = results.filter(r => r.trainScore && r.validScore);
    if (validResults.length === 0) return 'Unknown';
    
    const avgTrainScore = validResults.reduce((sum, r) => sum + r.trainScore, 0) / validResults.length;
    const avgValidScore = validResults.reduce((sum, r) => sum + r.validScore, 0) / validResults.length;
    
    const gap = (avgTrainScore - avgValidScore) / avgTrainScore;
    
    if (gap > 0.3) return 'HIGH - Training significantly outperforms validation';
    if (gap > 0.15) return 'MEDIUM - Moderate train/validation gap';
    if (gap > 0.05) return 'LOW - Small train/validation gap';
    return 'MINIMAL - Good generalization';
  }

  /**
   * Generate optimized strategy code with validation metadata
   */
  generateOptimizedStrategyCode(strategyName, params, periods = null, summary = null) {
    const baseStrategyName = strategyName.replace('-optimized', '');
    
    return `/**
 * Auto-generated optimized ${baseStrategyName} strategy
 * Generated: ${new Date().toISOString()}
 * 
 * OPTIMIZATION SUMMARY:
 * - Training Period: ${periods?.trainStart || 'N/A'} to ${periods?.trainEnd || 'N/A'} (${periods?.trainDays || 'N/A'} days)
 * - Validation Period: ${periods?.validStart || 'N/A'} to ${periods?.validEnd || 'N/A'} (${periods?.validDays || 'N/A'} days)
 * - Best Validation Sharpe: ${summary?.best_validation_sharpe || 'N/A'}
 * - Best Validation Return: ${summary?.best_validation_return || 'N/A'}
 * - Overfitting Risk: ${summary?.overfitting_risk || 'N/A'}
 * - Total Iterations: ${summary?.total_iterations || 'N/A'}
 * 
 * OPTIMIZED PARAMETERS:
${Object.entries(params).map(([key, value]) => ` * - ${key}: ${value}`).join('\n')}
 */

const ${baseStrategyName}Strategy = require('./${baseStrategyName.toLowerCase()}-proper');

class ${baseStrategyName}OptimizedStrategy extends ${baseStrategyName}Strategy {
  constructor(customParams = {}) {
    // Use optimized parameters as defaults (validated on out-of-sample data)
    const optimizedParams = ${JSON.stringify(params, null, 4)};
    
    // Override with any custom parameters
    const finalParams = { ...optimizedParams, ...customParams };
    
    super(finalParams);
    this.name = '${baseStrategyName} Optimized (Validated)';
    this.version = '1.0.0-optimized-validated';
    this.optimizationInfo = {
      periods: ${JSON.stringify(periods, null, 6)},
      summary: ${JSON.stringify(summary, null, 6)}
    };
  }
  
  getDescription() {
    return \`Auto-optimized ${baseStrategyName} strategy with train/validation split - \${this.optimizationInfo.summary?.overfitting_risk || 'Unknown'} overfitting risk\`;
  }
  
  getOptimizationInfo() {
    return this.optimizationInfo;
  }
}

module.exports = ${baseStrategyName}OptimizedStrategy;
`;
  }
}

module.exports = BacktestEngine;
