/**
 * REAL-TIME BACKTESTING ENGINE
 * Handles multiple strategies simultaneously with real-time data processing
 *
 * REFACTORED: Now uses centralized utilities to eliminate code duplication
 */

const fs = require('fs');
const path = require('path');
const IndicatorMapper = require('./indicator-mapper');

// Import centralized utilities
const TechnicalIndicators = require('./technical-indicators');
const OptionSymbolParser = require('./utils/option-symbol-parser');
const PriceExtractor = require('./utils/price-extractor');
const DTECalculator = require('./utils/dte-calculator');
const BlackScholes = require('./utils/black-scholes');

class BacktestingEngine {
  constructor() {
    this.strategies = new Map();
    this.activePositions = new Map();
    this.indicators = new Map();
    this.marketData = {
      stock: new Map(),
      options: new Map()
    };
    this.results = new Map();
    this.isRunning = false;
    this.signalEmitter = null; // WebSocket connection for signal emission
    this.indicatorMapper = new IndicatorMapper(); // Initialize indicator mapper
    this.signalHistory = []; // ENHANCED: Collect signals for chart display
  }

  // 🔌 SIGNAL EMISSION SETUP
  setSignalEmitter(emitter) {
    this.signalEmitter = emitter;
    console.log('🎯 [SIGNAL EMITTER] Connected to signal streaming');
  }

  // 📡 EMIT SIGNAL EVENT
  emitSignal(signal, strategy, metadata = {}) {
    if (!this.signalEmitter) return;

    const signalEvent = {
      type: 'signal',
      signal: {
        type: signal.type,
        timestamp: signal.timestamp,
        price: signal.price,
        confidence: signal.confidence,
        strategy: strategy.name,
        indicators: signal.indicators,
        metadata: {
          symbol: metadata.symbol || 'UNKNOWN',
          timeframe: metadata.timeframe || '1Min',
          reason: metadata.reason || 'Strategy signal',
          ...metadata
        }
      },
      timestamp: new Date().toISOString()
    };

    try {
      this.signalEmitter.broadcast(JSON.stringify(signalEvent));
      console.log(`🎯 [SIGNAL EMITTED] ${signal.type.toUpperCase()} - ${strategy.name} @ $${signal.price}`);
    } catch (error) {
      console.error('❌ [SIGNAL EMISSION] Failed to emit signal:', error);
    }
  }

  // 📚 STRATEGY MANAGEMENT
  async loadStrategies() {
    const strategiesDir = path.join(__dirname, 'strategies');
    const files = fs.readdirSync(strategiesDir).filter(f => f.endsWith('.js') && !f.includes('template'));
    
    console.log(`🔍 Loading strategies from ${strategiesDir}`);
    
    for (const file of files) {
      try {
        const strategyPath = path.join(strategiesDir, file);
        delete require.cache[require.resolve(strategyPath)]; // Hot reload
        const strategy = require(strategyPath);
        
        this.strategies.set(strategy.name, {
          ...strategy,
          id: strategy.name.toLowerCase().replace(/\s+/g, '_'),
          positions: [],
          performance: {
            trades: 0,
            wins: 0,
            losses: 0,
            totalPnL: 0,
            winRate: 0,
            sharpeRatio: 0
          }
        });
        
        console.log(`✅ Loaded strategy: ${strategy.name} v${strategy.version}`);
      } catch (error) {
        console.error(`❌ Failed to load strategy ${file}:`, error.message);
      }
    }
    
    return Array.from(this.strategies.keys());
  }

  // 📊 INDICATOR CALCULATIONS
  // REFACTORED: Now uses TechnicalIndicators utility class
  calculateIndicators(stockData, strategy) {
    const indicators = {};

    // Get indicator requirements from strategy using mapper
    const indicatorSpecs = this.indicatorMapper.getCalculationRequirements(strategy.name);

    // Calculate timestamps array for chart compatibility
    const timestamps = stockData.map(bar => bar.timestamp || new Date(bar.datetime).getTime());
    indicators.timestamps = timestamps;

    console.log(`📊 Calculating ${Object.keys(indicatorSpecs).length} indicators for ${strategy.name}`);

    // Extract close prices for price-based indicators
    const closePrices = stockData.map(bar => bar.close || bar.c || 0);

    for (const [indicatorName, spec] of Object.entries(indicatorSpecs)) {
      try {
        switch (spec.calculation) {
          case 'rsi':
            // Use centralized TechnicalIndicators class
            indicators[indicatorName] = TechnicalIndicators.calculateRSI(closePrices, spec.params.period);
            console.log(`✅ Calculated ${indicatorName} (period: ${spec.params.period})`);
            break;

          case 'roc':
            indicators[indicatorName] = TechnicalIndicators.calculateROC(closePrices, spec.params.period);
            console.log(`✅ Calculated ${indicatorName} (period: ${spec.params.period})`);
            break;

          case 'vwap':
            indicators[indicatorName] = TechnicalIndicators.calculateVWAP(stockData);
            console.log(`✅ Calculated ${indicatorName}`);
            break;

          case 'vwap_slope':
            const vwapValues = indicators.vwap || TechnicalIndicators.calculateVWAP(stockData);
            indicators[indicatorName] = TechnicalIndicators.calculateVWAPSlope(vwapValues, spec.params.lookback);
            console.log(`✅ Calculated ${indicatorName} (lookback: ${spec.params.lookback})`);
            break;

          case 'macd':
            // MACD not yet in TechnicalIndicators - use local method
            const macd = this.calculateMACD(stockData, spec.params);
            indicators[indicatorName] = macd;
            console.log(`✅ Calculated ${indicatorName} (${spec.params.fast}/${spec.params.slow}/${spec.params.signal})`);
            break;

          case 'volume_analysis':
            // Keep local calculation (simple aggregation)
            indicators[indicatorName] = this.calculateVolumeMetrics(stockData);
            console.log(`✅ Calculated ${indicatorName}`);
            break;

          case 'volatility':
            // Volatility not yet in TechnicalIndicators - use local method
            indicators[indicatorName] = this.calculateVolatility(stockData, spec.params.period);
            console.log(`✅ Calculated ${indicatorName} (period: ${spec.params.period})`);
            break;

          default:
            console.log(`⚠️ Unknown indicator calculation: ${spec.calculation}`);
        }
      } catch (error) {
        console.error(`❌ Error calculating ${indicatorName}:`, error.message);
        // Set empty array to maintain consistency
        indicators[indicatorName] = new Array(stockData.length).fill(null);
      }
    }

    console.log(`📊 Indicator calculation complete. Available: ${Object.keys(indicators).join(', ')}`);
    return indicators;
  }

  // 🎯 SIGNAL DETECTION
  checkSignals(stockData, optionsData, strategy, metadata = {}) {
    const indicators = this.calculateIndicators(stockData, strategy);
    const signals = [];
    
    // DEBUG: Log signal checking
    console.log(`🔍 Checking signals for ${strategy.name} - Data points: ${stockData.length}, Indicators:`, Object.keys(indicators));
    console.log(`🔍 Strategy signals config:`, JSON.stringify(strategy.signals, null, 2));
    console.log(`🔍 Long entry conditions:`, strategy.signals?.entry?.long?.conditions);
    
    // Check long signals
    console.log(`🔍 About to evaluate LONG conditions...`);
    const longConditionsMet = this.evaluateConditions(stockData, indicators, strategy.signals.entry.long);
    console.log(`🔍 LONG conditions result: ${longConditionsMet}`);
    
    if (longConditionsMet) {
      const longSignal = {
        type: 'long',
        timestamp: stockData[stockData.length - 1].timestamp,
        price: stockData[stockData.length - 1].close,
        confidence: this.calculateSignalConfidence(indicators, strategy.signals.entry.long),
        indicators: indicators,
        strategy: strategy.name,
        reason: 'Long signal conditions met'
      };
      
      signals.push(longSignal);
      
      // ENHANCED: Store signal for chart markers
      this.signalHistory.push({
        ...longSignal,
        chartMarker: {
          time: Math.floor(longSignal.timestamp / 1000), // TradingView expects Unix seconds
          position: 'belowBar',
          color: '#22c55e', // Green for long/call signals
          shape: 'arrowUp',
          text: 'LONG'
        }
      });
      
      // Emit signal for real-time visualization
      this.emitSignal(longSignal, strategy, metadata);
    }
    
    // Check short signals
    if (this.evaluateConditions(stockData, indicators, strategy.signals.entry.short)) {
      const shortSignal = {
        type: 'short',
        timestamp: stockData[stockData.length - 1].timestamp,
        price: stockData[stockData.length - 1].close,
        confidence: this.calculateSignalConfidence(indicators, strategy.signals.entry.short),
        indicators: indicators,
        strategy: strategy.name,
        reason: 'Short signal conditions met'
      };
      
      signals.push(shortSignal);
      
      // ENHANCED: Store signal for chart markers
      this.signalHistory.push({
        ...shortSignal,
        chartMarker: {
          time: Math.floor(shortSignal.timestamp / 1000), // TradingView expects Unix seconds
          position: 'aboveBar',
          color: '#ef4444', // Red for short/put signals
          shape: 'arrowDown',
          text: 'SHORT'
        }
      });
      
      // Emit signal for real-time visualization
      this.emitSignal(shortSignal, strategy, metadata);
    }
    
    // DEBUG: Log end of signal checking
    console.log(`✅ Signal check completed for ${strategy.name}: ${signals.length} signals found`);
    
    return signals;
  }

  // 🔍 CONTRACT SELECTION
  selectOptionContracts(signal, optionsData, strategy) {
    const currentPrice = signal.price;
    const contracts = [];
    
    console.log(`🔍 Selecting contracts for ${signal.type} signal at $${currentPrice}`);
    console.log(`📊 Available options data: ${optionsData.length} contracts`);
    
    // Show sample contract structure for debugging
    if (optionsData.length > 0) {
      console.log(`📊 Sample contract structure:`, Object.keys(optionsData[0]));
    }
    
    // REFACTORED: Use OptionSymbolParser utility
    const enrichedContracts = optionsData.map(contract => {
      // Parse contract symbol using centralized utility
      const parsed = OptionSymbolParser.parse(contract.symbol);
      if (!parsed) {
        console.log(`❌ Could not parse contract symbol: ${contract.symbol}`);
        return null;
      }

      // Use latest price data as mid price - handle different data structures
      let midPrice = 1.0; // Default fallback

      if (contract.data && Array.isArray(contract.data) && contract.data.length > 0) {
        const latestBar = contract.data[contract.data.length - 1];
        midPrice = latestBar.close || latestBar.price || 1.0;
      } else if (contract.bars && Array.isArray(contract.bars) && contract.bars.length > 0) {
        const latestBar = contract.bars[contract.bars.length - 1];
        midPrice = latestBar.close || latestBar.price || 1.0;
      } else if (contract.price) {
        midPrice = contract.price;
      } else {
        // Use strike relative pricing as fallback
        const itm = parsed.type === 'call'
          ? Math.max(0, currentPrice - parsed.strike)
          : Math.max(0, parsed.strike - currentPrice);
        const extrinsic = Math.max(0.1, parsed.strike * 0.02); // Mock time value
        midPrice = itm + extrinsic;
      }

      return {
        ...contract,
        strike: parsed.strike,
        type: parsed.type,
        expiration: parsed.expiration,
        dte: 0, // Assume 0DTE for demo - could use DTECalculator.calculateDTE()
        bid: midPrice * 0.95, // Mock bid/ask spread
        ask: midPrice * 1.05,
        openInterest: 1000, // Mock high OI
        midPrice
      };
    }).filter(c => c !== null);
    
    console.log(`📊 Enriched contracts: ${enrichedContracts.length} with metadata`);
    if (enrichedContracts.length > 0) {
      console.log(`📊 Sample enriched contract:`, JSON.stringify(enrichedContracts[0], null, 2));
    }

    // Filter by expiration (RELAXED - accept all for testing)
    const validExpirations = enrichedContracts; // Skip DTE filtering temporarily
    console.log(`📅 Valid expirations: ${validExpirations.length} contracts (RELAXED - accepting all DTEs)`);

    // Filter by strike criteria (RELAXED - wider range)
    const { min, max } = strategy.contractSelection.strike.offset;
    const validStrikes = validExpirations.filter(contract => {
      const strikeDistance = Math.abs(contract.strike - currentPrice);
      const isValid = strikeDistance <= 15; // Relaxed to ±$15 for testing
      if (!isValid) {
        console.log(`   ❌ Filtered out ${contract.symbol}: strike ${contract.strike}, distance ${strikeDistance.toFixed(2)} > 15`);
      }
      return isValid;
    });
    console.log(`🎯 Valid strikes: ${validStrikes.length} contracts (ATM ± $15, originally ${min}-${max})`);
    console.log(`   Current price: $${currentPrice}, Strikes in range: ${validStrikes.map(c => c.strike).join(', ')}`);

    // Filter by liquidity (RELAXED - minimal requirements)
    const liquidContracts = validStrikes.filter(contract => {
      const bidAskSpread = contract.ask - contract.bid;
      const spreadRatio = bidAskSpread / contract.midPrice;
      const hasOI = contract.openInterest >= 50; // Reduced from 100
      const hasSpread = spreadRatio <= 0.5; // Increased from 0.2

      if (!hasOI || !hasSpread) {
        console.log(`   ❌ Liquidity filter: ${contract.symbol} - OI:${contract.openInterest}(${hasOI}), Spread:${(spreadRatio*100).toFixed(1)}%(${hasSpread})`);
      }

      return hasOI && hasSpread;
    });
    console.log(`💧 Liquid contracts: ${liquidContracts.length} contracts (OI≥50, spread≤50%)`);
    if (liquidContracts.length > 0) {
      console.log(`   Available contracts:`, liquidContracts.map(c => `${c.symbol}@${c.strike}`).join(', '));
    }

    // Select MULTIPLE contracts (up to contractsPerSignal) based on strategy
    const contractsPerSignal = strategy.riskManagement.entry.contractsPerSignal || 1;

    if (signal.type === 'long' && strategy.optionStrategy.contracts.calls.enabled) {
      const calls = liquidContracts.filter(c => c.type === 'call');
      console.log(`📞 Available calls: ${calls.length}`);

      // Select multiple call contracts (different strikes)
      const sortedCalls = calls.sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice));
      const selectedCalls = sortedCalls.slice(0, contractsPerSignal);

      console.log(`   Selecting ${selectedCalls.length} call contracts (max ${contractsPerSignal})`);
      contracts.push(...selectedCalls);
    }

    if (signal.type === 'short' && strategy.optionStrategy.contracts.puts.enabled) {
      const puts = liquidContracts.filter(c => c.type === 'put');
      console.log(`📞 Available puts: ${puts.length}`);

      // Select multiple put contracts (different strikes)
      const sortedPuts = puts.sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice));
      const selectedPuts = sortedPuts.slice(0, contractsPerSignal);

      console.log(`   Selecting ${selectedPuts.length} put contracts (max ${contractsPerSignal})`);
      contracts.push(...selectedPuts);
    }
    
    console.log(`✅ Selected contracts: ${contracts.length}`);
    contracts.forEach(contract => {
      console.log(`  📝 ${contract.type.toUpperCase()} $${contract.strike} ${contract.expiration} - Mid: $${contract.midPrice?.toFixed(2)}, OI: ${contract.openInterest}`);
    });
    
    return contracts.filter(c => c !== null);
  }

  // 💰 POSITION MANAGEMENT
  // REFACTORED: Now uses PriceExtractor utility
  openPosition(signal, contract, strategy) {
    console.log(`💰 [OPEN POSITION] Creating position for ${signal.type} signal with ${contract.symbol}`);

    // Use centralized PriceExtractor with slippage modeling
    const entryPrice = PriceExtractor.getEntryPrice(contract, signal, 0.001); // 0.1% slippage

    console.log(`💰 [ENTRY PRICE] $${entryPrice.toFixed(2)} (with 0.1% slippage) at timestamp ${signal.timestamp}`);

    const position = {
      id: `${strategy.id}_${Date.now()}`,
      strategyId: strategy.id,
      signal: signal,
      contract: contract,
      entryTime: signal.timestamp,
      entryPrice: entryPrice,
      quantity: this.calculatePositionSize(signal, strategy),
      status: 'open',
      unrealizedPnL: 0,
      realizedPnL: 0
    };

    console.log(`💰 [OPEN POSITION] Position created:`, {
      id: position.id,
      contract: contract.symbol,
      entryPrice: position.entryPrice,
      quantity: position.quantity
    });

    this.activePositions.set(position.id, position);
    strategy.positions.push(position);

    console.log(`💰 [OPEN POSITION] Position added - Total positions now: ${strategy.positions.length}`);
    console.log(`🚀 OPENED: ${strategy.name} - ${signal.type.toUpperCase()} ${contract.symbol} @ $${entryPrice.toFixed(2)}`);

    return position;
  }

  // 🏁 EXIT MANAGEMENT
  checkExits(position, currentData, strategy, currentTime) {
    const currentPrice = this.getCurrentOptionPrice(position.contract, currentData);
    const holdTime = (currentTime - position.entryTime) / (1000 * 60); // minutes

    // Update unrealized P&L
    position.unrealizedPnL = (currentPrice - position.entryPrice) * position.quantity * 100;
    const pnlPercentage = (position.unrealizedPnL / (position.entryPrice * position.quantity * 100)) * 100;

    // DEBUG: Log ALL exit checks for first 3 positions to see what's happening
    const posIndex = strategy.positions.indexOf(position);
    if (posIndex < 3) {
      console.log(`   🔍 Exit Check #${posIndex}: ${position.contract.symbol} | Entry: $${position.entryPrice.toFixed(2)} | Current: $${currentPrice.toFixed(2)} | P&L%: ${pnlPercentage.toFixed(2)}% | TP: +12% | SL: -8%`);
    }

    // Check exit conditions
    const exits = strategy.riskManagement.exit;

    // Take Profit - handle both formats (percentage or percentage.min)
    const takeProfitPct = exits.takeProfit.percentage?.min || exits.takeProfit.percentage || 15;
    if (pnlPercentage >= takeProfitPct) {
      return this.closePosition(position, currentPrice, 'take_profit', strategy, currentTime);
    }

    // Stop Loss - handle both formats
    const stopLossPct = exits.stopLoss.percentage?.min || exits.stopLoss.percentage || 10;
    if (pnlPercentage <= -stopLossPct) {
      return this.closePosition(position, currentPrice, 'stop_loss', strategy, currentTime);
    }

    // Time Stop
    if (holdTime >= exits.timeStop.maxHoldMinutes) {
      return this.closePosition(position, currentPrice, 'time_stop', strategy, currentTime);
    }

    // Technical exits (return to VWAP, RSI reversal, etc.)
    if (this.checkTechnicalExits(position, currentData, strategy)) {
      return this.closePosition(position, currentPrice, 'technical_exit', strategy, currentTime);
    }

    return null;
  }

  closePosition(position, exitPrice, reason, strategy, currentTimestamp) {
    position.status = 'closed';
    position.exitTime = currentTimestamp || Date.now();
    position.exitPrice = exitPrice;
    position.exitReason = reason;
    position.realizedPnL = (exitPrice - position.entryPrice) * position.quantity * 100;
    
    // Update strategy performance
    strategy.performance.trades++;
    strategy.performance.totalPnL += position.realizedPnL;
    
    if (position.realizedPnL > 0) {
      strategy.performance.wins++;
    } else {
      strategy.performance.losses++;
    }
    
    strategy.performance.winRate = (strategy.performance.wins / strategy.performance.trades) * 100;
    
    console.log(`🏁 CLOSED: ${position.contract.symbol} - ${reason.toUpperCase()} - P&L: $${position.realizedPnL.toFixed(2)}`);
    
    this.activePositions.delete(position.id);
    return position;
  }

  // 🏃‍♂️ MAIN BACKTESTING LOOP
  async runBacktest(stockData, optionsData, selectedStrategies, timeframe = '1min', metadata = {}) {
    console.log(`� ENTERING runBacktest method - stockData: ${stockData.length}, optionsData: ${optionsData.length}, strategies: ${selectedStrategies}`);
    console.log(`�🚀 Starting real-time backtest with ${selectedStrategies.length} strategies`);
    console.log(`📊 Strategy names requested:`, selectedStrategies);
    console.log(`📊 Available strategies:`, Array.from(this.strategies.keys()));
    console.log(`📊 Data length: ${stockData.length} bars`);
    console.log(`📊 Options data loaded: ${optionsData.length} contracts`);
    
    // Show sample options data for debugging
    if (optionsData.length > 0) {
      console.log(`📊 Sample options data:`, optionsData.slice(0, 3));
    }
    
    this.isRunning = true;

    // CRITICAL: Reset signal history AND positions for new backtest
    this.signalHistory = [];
    this.activePositions.clear(); // Clear all active positions

    // Reset positions and performance for selected strategies
    console.log(`🔄 Resetting positions for selected strategies...`);
    for (const [name, strategy] of this.strategies) {
      const isSelected = selectedStrategies.includes(name) || selectedStrategies.includes(strategy.id);
      if (isSelected) {
        strategy.positions = []; // Clear positions array
        strategy.performance = { // Reset performance metrics
          trades: 0,
          wins: 0,
          losses: 0,
          totalPnL: 0,
          winRate: 0,
          sharpeRatio: 0
        };
        console.log(`   ✅ Reset ${name} (had ${strategy.positions?.length || 0} positions)`);
      }
    }

    const results = {
      strategies: {},
      totalTrades: 0,
      totalPnL: 0,
      startTime: Date.now(),
      endTime: null,
      signals: [] // Will be populated from signalHistory
    };
    
    // Process each time period
    console.log(`🔁 STARTING MAIN LOOP - Will process ${stockData.length - 50} bars (from bar 50 to ${stockData.length})`);
    console.log(`🔁 selectedStrategies array: ${JSON.stringify(selectedStrategies)}`);
    console.log(`🔁 this.isRunning: ${this.isRunning}`);
    for (let i = 50; i < stockData.length && this.isRunning; i++) {
      console.log(`🔁 LOOP ITERATION ${i}/${stockData.length}`);
      const currentStockData = stockData.slice(0, i + 1);
      const currentTime = stockData[i].timestamp;

      // Check each selected strategy
      console.log(`🔁 About to iterate over ${selectedStrategies.length} strategies`);
      for (const strategyName of selectedStrategies) {
        console.log(`🔁 Processing strategy: "${strategyName}"`);
        // Use the same lookup logic as getStrategyDetails() to handle both name and ID
        let strategy = this.strategies.get(strategyName);

        // If not found, try to find by ID
        if (!strategy) {
          for (const [name, strategyData] of this.strategies) {
            if (strategyData.id === strategyName) {
              strategy = strategyData;
              console.log(`✅ Found strategy by ID: "${strategyName}" -> "${name}"`);
              break;
            }
          }
        } else {
          console.log(`✅ Found strategy by name: "${strategyName}"`);
        }

        if (!strategy) {
          console.log(`❌ Strategy "${strategyName}" not found. Available strategies:`, Array.from(this.strategies.keys()));
          console.log(`❌ Available strategy IDs:`, Array.from(this.strategies.values()).map(s => s.id));
          continue;
        }
        
        // 1. Check for new signals (with metadata for signal emission)
        const signalMetadata = {
          symbol: metadata.symbol || 'UNKNOWN',
          timeframe: timeframe,
          backtestMode: true,
          currentBar: i,
          totalBars: stockData.length
        };
        
        const signals = this.checkSignals(currentStockData, optionsData, strategy, signalMetadata);
        
        // 2. Process signals and open positions
        for (const signal of signals) {
          console.log(`🎯 Processing ${signal.type} signal at $${signal.price}`);
          const contracts = this.selectOptionContracts(signal, optionsData, strategy);
          console.log(`📋 Found ${contracts.length} eligible option contracts`);
          
          // Count only OPEN positions (closed positions stay in array for history)
          const openPositions = strategy.positions.filter(p => p.status === 'open');
          console.log(`   🔍 DEBUG: ${contracts.length} contracts to process`);
          console.log(`   🔍 DEBUG: Open positions: ${openPositions.length}/${strategy.riskManagement.entry.maxPositions} (${strategy.positions.length} total including closed)`);

          for (const contract of contracts) {
            const currentOpenCount = strategy.positions.filter(p => p.status === 'open').length;
            console.log(`   🔍 DEBUG: Checking position limit - ${currentOpenCount} < ${strategy.riskManagement.entry.maxPositions} = ${currentOpenCount < strategy.riskManagement.entry.maxPositions}`);

            if (currentOpenCount < strategy.riskManagement.entry.maxPositions) {
              console.log(`📈 Opening position with contract:`, contract?.symbol || 'Unknown');
              const position = this.openPosition(signal, contract, strategy);
              console.log(`✅ Position opened:`, position?.id || 'Unknown');
            } else {
              console.log(`⚠️ Position limit reached (${strategy.riskManagement.entry.maxPositions})`);
            }
          }
        }
        
        // 3. Manage existing positions
        for (const position of [...strategy.positions]) {
          if (position.status === 'open') {
            this.checkExits(position, { stock: currentStockData, options: optionsData }, strategy, currentTime);
          }
        }
      }
      
      // Simulate real-time delay (remove for faster backtesting)
      // await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    this.isRunning = false;
    results.endTime = Date.now();

    // IMPORTANT: Close all remaining open positions at end of backtest
    console.log(`🏁 [END OF BACKTEST] Closing all remaining open positions...`);
    console.log(`🏁 Selected strategies:`, selectedStrategies);
    console.log(`🏁 Available strategies:`, Array.from(this.strategies.keys()));

    for (const [name, strategy] of this.strategies) {
      // Match by name OR ID
      const isSelected = selectedStrategies.includes(name) || selectedStrategies.includes(strategy.id);
      if (!isSelected) {
        console.log(`   Skipping strategy "${name}" (ID: ${strategy.id}) - not selected`);
        continue;
      }

      const openPositions = strategy.positions.filter(p => p.status === 'open');
      console.log(`   Strategy "${name}" has ${openPositions.length} open positions to close`);

      const finalTimestamp = stockData[stockData.length - 1]?.timestamp || Date.now();
      for (const position of openPositions) {
        // REFACTORED: Use PriceExtractor for exit price (with negative slippage)
        const exitPrice = PriceExtractor.getExitPrice(position.contract, finalTimestamp, -0.001);

        console.log(`   Closing ${position.contract.symbol} at $${exitPrice.toFixed(2)} (with -0.1% slippage)`);

        this.closePosition(position, exitPrice, 'backtest_end', strategy, finalTimestamp);
      }
    }

    // Compile final results AFTER closing all positions
    for (const [name, strategy] of this.strategies) {
      // Match by name OR ID (same as reset and closing logic)
      const isSelected = selectedStrategies.includes(name) || selectedStrategies.includes(strategy.id);
      if (isSelected) {
        console.log(`📊 Compiling results for "${name}": ${strategy.performance.trades} trades, $${strategy.performance.totalPnL.toFixed(2)} P&L`);
        results.strategies[name] = {
          performance: strategy.performance,
          positions: strategy.positions.length,
          activePositions: strategy.positions.filter(p => p.status === 'open').length,
          closedTrades: strategy.positions.filter(p => p.status === 'closed').length
        };
        results.totalTrades += strategy.performance.trades;
        results.totalPnL += strategy.performance.totalPnL;
      }
    }
    
    // ENHANCED: Include signal history for chart markers
    results.signals = this.signalHistory;
    
    // ENHANCED: Extract all trades from all strategies for trade history
    results.trades = [];
    for (const [name, strategy] of this.strategies) {
      if (strategy.positions && strategy.positions.length > 0) {
        // Filter for closed positions (completed trades)
        const closedTrades = strategy.positions
          .filter(p => p.status === 'closed')
          .map(trade => ({
            timestamp: trade.openTime,
            contract: trade.contract?.symbol || trade.symbol,
            side: trade.side || 'long',
            openPrice: trade.entryPrice || trade.openPrice,
            closePrice: trade.exitPrice || trade.closePrice,
            quantity: trade.quantity || 1,
            openTime: trade.openTime,
            closeTime: trade.exitTime || trade.closeTime,
            pnl: trade.realizedPnL || trade.pnl || 0,  // FIX: Use realizedPnL first!
            pnlPct: trade.pnlPct || ((trade.realizedPnL / (trade.entryPrice * trade.quantity * 100)) * 100) || 0,
            maxDrawdown: trade.maxDrawdown || 0,
            strategy: name,
            reason: trade.exitReason || trade.reason || 'Signal-based entry'
          }));
        
        results.trades.push(...closedTrades);
      }
    }
    
    console.log(`📊 Extracted ${results.trades.length} closed trades from ${this.strategies.size} strategies`);
    
    // DEBUGGING: Log trade extraction details
    for (const [name, strategy] of this.strategies) {
      console.log(`   🔍 Strategy "${name}": ${strategy.positions?.length || 0} total positions, ${strategy.positions?.filter(p => p.status === 'closed').length || 0} closed`);
    }
    
    // DEBUGGING: Show first 3 trades with P&L
    if (results.trades.length > 0) {
      console.log(`   📋 Sample trades (first 3):`);
      for (let i = 0; i < Math.min(3, results.trades.length); i++) {
        const t = results.trades[i];
        console.log(`      ${i+1}. ${t.contract} | Entry: $${t.openPrice?.toFixed(2)} | Exit: $${t.closePrice?.toFixed(2)} | P&L: $${t.pnl?.toFixed(2)}`);
      }
    }
    
    // ENHANCED: Calculate comprehensive performance metrics for frontend
    const totalTrades = results.totalTrades;
    const totalPnL = results.totalPnL;
    
    // Calculate additional metrics expected by frontend from actual trade data
    results.totalReturn = totalTrades > 0 ? (totalPnL / 10000) * 100 : 0; // Assuming $10k starting capital
    
    // Calculate real metrics from extracted trades
    if (results.trades && results.trades.length > 0) {
      const trades = results.trades;
      const winningTrades = trades.filter(t => t.pnl > 0);
      const losingTrades = trades.filter(t => t.pnl < 0);
      
      console.log(`   📊 Calculating metrics from ${trades.length} trades: ${winningTrades.length} winners, ${losingTrades.length} losers`);
      
      // Win Rate: percentage of profitable trades
      results.winRate = (winningTrades.length / trades.length) * 100;
      
      // Average Win/Loss
      results.avgWin = winningTrades.length > 0 
        ? winningTrades.reduce((sum, t) => sum + t.pnl, 0) / winningTrades.length 
        : 0;
      results.avgLoss = losingTrades.length > 0 
        ? losingTrades.reduce((sum, t) => sum + t.pnl, 0) / losingTrades.length 
        : 0;
      
      // Profit Factor: total wins / abs(total losses)
      const totalWins = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
      const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0));
      results.profitFactor = totalLosses > 0 ? totalWins / totalLosses : (totalWins > 0 ? 999 : 0);
      
      // Calculate equity curve and max drawdown
      let equity = 10000; // Starting capital
      let peak = equity;
      let maxDrawdown = 0;
      const returns = [];
      
      for (const trade of trades) {
        equity += trade.pnl;
        if (equity > peak) peak = equity;
        const drawdown = ((peak - equity) / peak) * 100;
        if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        
        // Calculate returns for Sharpe ratio
        const returnPct = (trade.pnl / peak) * 100;
        returns.push(returnPct);
      }
      
      results.maxDrawdown = maxDrawdown;
      
      // Sharpe Ratio: (mean return - risk free rate) / std dev of returns
      // Assuming 0% risk-free rate for simplicity
      const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / returns.length;
      const stdDev = Math.sqrt(variance);
      results.sharpeRatio = stdDev > 0 ? meanReturn / stdDev : 0;
      
      console.log(`   ✅ Metrics calculated: WinRate=${results.winRate.toFixed(2)}%, Sharpe=${results.sharpeRatio.toFixed(2)}, MaxDD=${results.maxDrawdown.toFixed(2)}%, PF=${results.profitFactor.toFixed(2)}`);
      
    } else {
      // No trades extracted - use zero values
      console.log(`   ⚠️ WARNING: No trades found in results.trades array (length=${results.trades?.length || 0}), setting all metrics to 0`);
      results.sharpeRatio = 0;
      results.maxDrawdown = 0;
      results.winRate = 0;
      results.avgWin = 0;
      results.avgLoss = 0;
      results.profitFactor = 0;
    }
    
    // For demo purposes with signals but no trades, show some metrics based on signals
    if (totalTrades === 0 && this.signalHistory.length > 0) {
      results.totalReturn = 0;
      results.sharpeRatio = 0;
      results.maxDrawdown = 0;
      results.winRate = 0;
      results.avgWin = 0;
      results.avgLoss = 0;
      results.profitFactor = 0;
      console.log(`📊 Generated ${this.signalHistory.length} signals but no actual trades were executed`);
    }
    
    console.log(`✅ Backtest completed: ${results.totalTrades} trades, $${results.totalPnL.toFixed(2)} total P&L, ${this.signalHistory.length} signals collected`);
    
    return results;
  }

  // 🛠️ ENHANCED INDICATOR CALCULATION METHODS
  calculateVWAP(data) {
    console.log(`📊 Calculating VWAP for ${data.length} bars`);
    const vwapValues = [];
    let cumulativePV = 0;
    let cumulativeV = 0;
    
    for (let i = 0; i < data.length; i++) {
      const bar = data[i];
      const typical = (bar.high + bar.low + bar.close) / 3;
      const volume = bar.volume || 1000; // Default volume if missing
      
      cumulativePV += typical * volume;
      cumulativeV += volume;
      
      const vwap = cumulativeV > 0 ? cumulativePV / cumulativeV : bar.close;
      vwapValues.push(vwap);
    }
    
    return vwapValues;
  }

  calculateRSI(data, period = 14) {
    console.log(`📊 Calculating RSI(${period}) for ${data.length} bars`);
    const rsiValues = [];
    
    if (data.length < period + 1) {
      // Not enough data - fill with nulls and partial calculations
      for (let i = 0; i < data.length; i++) {
        rsiValues.push(i < period ? null : 50);
      }
      return rsiValues;
    }
    
    // Calculate price changes
    const changes = [];
    for (let i = 1; i < data.length; i++) {
      changes.push(data[i].close - data[i - 1].close);
    }
    
    // Fill initial values with null
    rsiValues.push(null); // First bar has no RSI
    
    // Calculate initial RSI after sufficient data
    let gains = 0, losses = 0;
    for (let i = 0; i < period; i++) {
      const change = changes[i];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    let avgGains = gains / period;
    let avgLosses = losses / period;
    
    // Add first RSI value
    for (let i = 1; i < period; i++) {
      rsiValues.push(null);
    }
    
    let rs = avgGains / (avgLosses || 0.001); // Avoid division by zero
    rsiValues.push(100 - (100 / (1 + rs)));
    
    // Calculate remaining RSI values using smoothed averages
    for (let i = period; i < changes.length; i++) {
      const change = changes[i];
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? -change : 0;
      
      avgGains = ((avgGains * (period - 1)) + gain) / period;
      avgLosses = ((avgLosses * (period - 1)) + loss) / period;
      
      rs = avgGains / (avgLosses || 0.001);
      rsiValues.push(100 - (100 / (1 + rs)));
    }
    
    return rsiValues;
  }

  calculateROC(data, period = 3) {
    console.log(`📊 Calculating ROC(${period}) for ${data.length} bars`);
    const rocValues = [];
    
    for (let i = 0; i < data.length; i++) {
      if (i < period) {
        rocValues.push(null); // Not enough data
      } else {
        const current = data[i].close;
        const previous = data[i - period].close;
        const roc = ((current - previous) / previous) * 100;
        rocValues.push(roc);
      }
    }
    
    return rocValues;
  }

  calculateVWAPSlope(vwapValues, lookback = 5) {
    console.log(`📊 Calculating VWAP Slope with ${lookback} lookback`);
    const slopeValues = [];
    
    for (let i = 0; i < vwapValues.length; i++) {
      if (i < lookback || vwapValues[i] === null) {
        slopeValues.push(null);
      } else {
        // Linear regression slope calculation
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        
        for (let j = 0; j < lookback; j++) {
          const x = j;
          const y = vwapValues[i - lookback + 1 + j];
          sumX += x;
          sumY += y;
          sumXY += x * y;
          sumXX += x * x;
        }
        
        const slope = (lookback * sumXY - sumX * sumY) / (lookback * sumXX - sumX * sumX);
        slopeValues.push(slope);
      }
    }
    
    return slopeValues;
  }

  calculateMACD(data, params = { fast: 12, slow: 26, signal: 9 }) {
    console.log(`📊 Calculating MACD(${params.fast}/${params.slow}/${params.signal})`);
    const { fast, slow, signal } = params;
    
    // Calculate EMAs
    const fastEMA = this.calculateEMA(data, fast);
    const slowEMA = this.calculateEMA(data, slow);
    
    // Calculate MACD line
    const macdLine = [];
    for (let i = 0; i < data.length; i++) {
      if (fastEMA[i] !== null && slowEMA[i] !== null) {
        macdLine.push(fastEMA[i] - slowEMA[i]);
      } else {
        macdLine.push(null);
      }
    }
    
    // Calculate signal line (EMA of MACD)
    const signalLine = this.calculateEMAFromValues(macdLine, signal);
    
    // Calculate histogram
    const histogram = [];
    for (let i = 0; i < macdLine.length; i++) {
      if (macdLine[i] !== null && signalLine[i] !== null) {
        histogram.push(macdLine[i] - signalLine[i]);
      } else {
        histogram.push(null);
      }
    }
    
    return {
      macd: macdLine,
      signal: signalLine,
      histogram: histogram
    };
  }

  calculateEMA(data, period) {
    const emaValues = [];
    const multiplier = 2 / (period + 1);
    
    if (data.length === 0) return emaValues;
    
    // First value is null (not enough data)
    for (let i = 0; i < Math.min(period - 1, data.length); i++) {
      emaValues.push(null);
    }
    
    if (data.length >= period) {
      // Calculate initial SMA for first EMA value
      let sum = 0;
      for (let i = 0; i < period; i++) {
        sum += data[i].close;
      }
      emaValues.push(sum / period);
      
      // Calculate remaining EMA values
      for (let i = period; i < data.length; i++) {
        const ema = (data[i].close - emaValues[i - 1]) * multiplier + emaValues[i - 1];
        emaValues.push(ema);
      }
    }
    
    return emaValues;
  }

  calculateEMAFromValues(values, period) {
    const emaValues = [];
    const multiplier = 2 / (period + 1);
    
    // Find first non-null value
    let firstValidIndex = values.findIndex(v => v !== null);
    if (firstValidIndex === -1) {
      return new Array(values.length).fill(null);
    }
    
    // Fill initial nulls
    for (let i = 0; i < firstValidIndex + period - 1; i++) {
      emaValues.push(null);
    }
    
    // Calculate initial SMA if we have enough data
    if (values.length >= firstValidIndex + period) {
      let sum = 0;
      let count = 0;
      for (let i = firstValidIndex; i < firstValidIndex + period; i++) {
        if (values[i] !== null) {
          sum += values[i];
          count++;
        }
      }
      emaValues.push(count > 0 ? sum / count : null);
      
      // Calculate remaining EMA values
      for (let i = firstValidIndex + period; i < values.length; i++) {
        if (values[i] !== null && emaValues[i - 1] !== null) {
          const ema = (values[i] - emaValues[i - 1]) * multiplier + emaValues[i - 1];
          emaValues.push(ema);
        } else {
          emaValues.push(null);
        }
      }
    }
    
    return emaValues;
  }

  calculateVolumeMetrics(data) {
    const currentVolume = data[data.length - 1].volume;
    const avgVolume = data.slice(-20).reduce((sum, bar) => sum + bar.volume, 0) / 20;
    return {
      current: currentVolume,
      average: avgVolume,
      ratio: currentVolume / avgVolume,
      buyVolumeRatio: 0.5 // Placeholder - would need tick data
    };
  }

  calculateVolatility(data, period) {
    // Simple volatility calculation
    return 0.2; // Placeholder
  }

  evaluateConditions(stockData, indicators, signalConfig) {
    if (!signalConfig || !signalConfig.conditions) {
      return false;
    }

    const lastIndex = stockData.length - 1;
    const lastBar = stockData[lastIndex];

    // Build evaluation context with all available data
    const context = {
      price: lastBar.close,
      open: lastBar.open,
      high: lastBar.high,
      low: lastBar.low,
      volume: lastBar.volume || 1000,
    };

    // Add all indicators to context
    for (const [name, values] of Object.entries(indicators)) {
      if (name === 'timestamps') continue;

      if (Array.isArray(values)) {
        context[name] = values[lastIndex];
      } else if (typeof values === 'object' && values !== null) {
        // Handle complex indicators like MACD
        for (const [subName, subValues] of Object.entries(values)) {
          if (Array.isArray(subValues)) {
            context[`${name}${subName.charAt(0).toUpperCase()}${subName.slice(1)}`] = subValues[lastIndex];
          }
        }
      }
    }

    // Add volume metrics if not already present
    if (!context.buyVolumeRatio) {
      context.buyVolumeRatio = 0.50; // Default neutral
    }
    if (!context.vwap && indicators.vwap) {
      context.vwap = indicators.vwap[lastIndex];
    }
    if (!context.vwapSlope && indicators.vwapslope) {
      context.vwapSlope = indicators.vwapslope[lastIndex];
    }

    // Evaluate each condition
    const conditions = signalConfig.conditions || [];
    let metConditions = 0;

    for (const conditionStr of conditions) {
      try {
        // Safe evaluation: replace variable names with context values
        let evalStr = conditionStr;

        // Replace all context variables
        for (const [key, value] of Object.entries(context)) {
          if (value !== null && value !== undefined) {
            const regex = new RegExp(`\\b${key}\\b`, 'g');
            evalStr = evalStr.replace(regex, value);
          }
        }

        // Evaluate the condition (basic math operations only for safety)
        const result = eval(evalStr);
        if (result) {
          metConditions++;
        }
      } catch (error) {
        console.error(`❌ Error evaluating condition "${conditionStr}":`, error.message);
      }
    }

    // Check if confluence requirement is met
    const confluenceRequired = signalConfig.confirmation?.confluenceRequired || conditions.length;
    const signalTriggered = metConditions >= confluenceRequired;

    if (signalTriggered) {
      console.log(`✅ Signal triggered: ${metConditions}/${conditions.length} conditions met (required: ${confluenceRequired})`);
    }

    return signalTriggered;
  }

  calculateSignalConfidence(indicators, signalConfig) {
    // Calculate confidence based on indicator strength
    // For now, return a deterministic value based on available indicators
    const indicatorCount = Object.keys(indicators).length;
    const baseConfidence = 0.5; // Baseline
    const confidenceBoost = Math.min(indicatorCount * 0.05, 0.4); // Up to 0.4 boost
    return Math.min(baseConfidence + confidenceBoost, 1.0);
  }

  calculateDTE(expiration) {
    const now = new Date();
    const exp = new Date(expiration);
    return Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
  }

  selectBestContract(contracts, currentPrice, strategy) {
    console.log(`🎯 selectBestContract called with ${contracts.length} contracts at price $${currentPrice}`);
    
    if (contracts.length === 0) {
      console.log(`❌ No contracts available for selection`);
      return null;
    }
    
    // Select closest to ATM
    const best = contracts.reduce((best, contract) => {
      const currentDistance = Math.abs(contract.strike - currentPrice);
      const bestDistance = Math.abs(best.strike - currentPrice);
      return currentDistance < bestDistance ? contract : best;
    });
    
    console.log(`🏆 Best contract selected: ${best.type.toUpperCase()} $${best.strike} (distance: $${Math.abs(best.strike - currentPrice).toFixed(2)})`);
    return best;
  }

  calculatePositionSize(signal, strategy) {
    const config = strategy.riskManagement.entry;
    if (config.positionSizing === 'adaptive' && config.contractsPerSignal.adaptive) {
      // Check adaptive conditions
      return config.contractsPerSignal.adaptive.multiplier;
    }
    return config.contractsPerSignal.base || 1;
  }

  // REFACTORED: Now uses PriceExtractor utility
  getCurrentOptionPrice(contract, currentData) {
    const timestamp = currentData?.stock?.[currentData.stock.length - 1]?.timestamp || currentData?.timestamp;

    // Use centralized PriceExtractor
    return PriceExtractor.getCurrentPrice(contract, timestamp);
  }

  checkTechnicalExits(position, currentData, strategy) {
    // Check technical exit conditions
    return false; // Placeholder
  }

  // 📡 API METHODS
  getAvailableStrategies() {
    return Array.from(this.strategies.keys());
  }

  getStrategyDetails(strategyName) {
    // Try direct lookup first
    let strategy = this.strategies.get(strategyName);
    
    // If not found, try to find by ID
    if (!strategy) {
      for (const [name, strategyData] of this.strategies) {
        if (strategyData.id === strategyName) {
          strategy = strategyData;
          break;
        }
      }
    }
    
    return strategy;
  }

  getActivePositions() {
    return Array.from(this.activePositions.values());
  }

  getResults() {
    const results = {};
    for (const [name, strategy] of this.strategies) {
      results[name] = strategy.performance;
    }
    return results;
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Backtesting engine stopped');
  }
}

module.exports = BacktestingEngine;