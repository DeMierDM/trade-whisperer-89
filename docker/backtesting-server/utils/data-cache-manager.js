/**
 * Data Cache Manager
 * 
 * Priority system for data access:
 * 1. Use SQL database cache if available
 * 2. Fallback to API only if necessary
 * 3. Cache new data in SQL for future use
 * 
 * This eliminates redundant API calls and Greek calculations
 * during optimization runs.
 */

const moment = require('moment-timezone');
const MarketHours = require('./market-hours');

class DataCacheManager {
  constructor(db, alpacaClient, greeksCalculator) {
    this.db = db;
    this.alpacaClient = alpacaClient;
    this.memoryCache = new Map();
    this.greeksCalculator = greeksCalculator || new GreeksCalculator();
    this.marketHours = new MarketHours();
  }

  /**
   * Get underlying historical bars (prioritize SQL cache)
   */
  async getUnderlyingBars(symbol, startDate, endDate) {
    const cacheKey = `underlying_${symbol}_${startDate}_${endDate}`;
    
    // Check memory cache first
    if (this.memoryCache.has(cacheKey)) {
      console.log(`📦 [CACHE] Using memory cache for underlying ${symbol}`);
      return this.memoryCache.get(cacheKey);
    }

    try {
      // Convert dates to UTC for database query
      const startDateUTC = moment.tz(startDate, 'America/New_York').utc().format();
      const endDateUTC = moment.tz(endDate + ' 23:59:59', 'America/New_York').utc().format();
      
      console.log(`🔍 [SQL CACHE] Querying underlying data: ${startDate} EST (${startDateUTC} UTC) to ${endDate} EST (${endDateUTC} UTC)`);
      
      // Check SQL database for existing underlying data
      const query = `
        SELECT 
          timestamp as t,
          open as o,
          high as h,
          low as l,
          close as c,
          volume as v
        FROM underlying_bars 
        WHERE symbol = $1
          AND timestamp >= $2 
          AND timestamp <= $3
        ORDER BY timestamp ASC
      `;
      
      const result = await this.db.query(query, [symbol, startDateUTC, endDateUTC]);
      
      if (result.rows && result.rows.length > 100) { // Sufficient data in SQL
        console.log(`✅ [SQL CACHE] Found ${result.rows.length} underlying bars in dedicated table`);
        
        // Keep timestamps in UTC format for market hours filtering
        const bars = result.rows.map(row => ({
          t: row.t, // Keep as UTC for market hours filtering
          o: parseFloat(row.o),
          h: parseFloat(row.h),
          l: parseFloat(row.l),
          c: parseFloat(row.c),
          v: parseInt(row.v)
        }));
        
        // Filter to market hours only (9:30 AM - 4:00 PM ET)
        const filteredBars = this.marketHours.filterMarketHoursBars(bars);
        this.marketHours.logFilteringActivity(bars, filteredBars, symbol);
        
        this.memoryCache.set(cacheKey, filteredBars);
        return filteredBars;
      }
      
      console.log(`⚠️ [SQL CACHE] Insufficient data in SQL (${result.rows?.length || 0} bars), fetching from API`);
      
    } catch (error) {
      console.log(`⚠️ [SQL CACHE] SQL query failed: ${error.message}, using API`);
    }

    // Fallback to API
    console.log(`📡 [API] Fetching underlying data for ${symbol} from Alpaca`);
    const apiResponse = await this.fetchUnderlyingFromAPI(symbol, startDate, endDate);
    const bars = apiResponse || []; // API bars should be in UTC format
    
    // Filter to market hours only (9:30 AM - 4:00 PM ET)
    const filteredBars = this.marketHours.filterMarketHoursBars(bars);
    this.marketHours.logFilteringActivity(bars, filteredBars, symbol);
    
    // Cache in memory for current session
    this.memoryCache.set(cacheKey, filteredBars);
    
    return filteredBars;
  }

  /**
   * Get options data with pre-calculated Greeks (prioritize SQL cache)
   */
  async getOptionsData(symbol, expiryDate, startTime, endTime) {
    const cacheKey = `options_${symbol}_${expiryDate}_${startTime}_${endTime}`;
    
    // Check memory cache first
    if (this.memoryCache.has(cacheKey)) {
      console.log(`📦 [CACHE] Using memory cache for options ${symbol} ${expiryDate}`);
      return this.memoryCache.get(cacheKey);
    }

    try {
      // Query SQL for pre-calculated options data with Greeks
      const query = `
        SELECT 
          ocb.contract_instance_id,
          oc.contract_symbol,
          oc.underlying_symbol,
          oc.strike_price,
          oc.option_type,
          oc.expiry_date,
          ocb.bar_timestamp as t,
          ocb.option_open as o,
          ocb.option_high as h,
          ocb.option_low as l,
          ocb.option_close as c,
          ocb.option_volume as v,
          ocb.underlying_price,
          -- Pre-calculated Greeks from SQL
          ocb.delta,
          ocb.gamma,
          ocb.theta,
          ocb.vega,
          ocb.rho,
          ocb.implied_volatility,
          ocb.time_to_expiry
        FROM option_contract_bars ocb
        JOIN option_contracts oc ON oc.instance_id = ocb.contract_instance_id
        WHERE oc.underlying_symbol = $1
          AND oc.expiry_date = $2
          AND ocb.bar_timestamp >= $3
          AND ocb.bar_timestamp <= $4
          AND ocb.option_close > 0
        ORDER BY oc.contract_symbol, ocb.bar_timestamp ASC
      `;
      
      const result = await this.db.query(query, [symbol, expiryDate, startTime, endTime]);
      
      if (result.rows && result.rows.length > 0) {
        console.log(`✅ [SQL CACHE] Found ${result.rows.length} option bars with pre-calculated Greeks`);
        
        // Group by contract symbol
        const contractsMap = new Map();
        
        result.rows.forEach(row => {
          const contractSymbol = row.contract_symbol;
          
          if (!contractsMap.has(contractSymbol)) {
            contractsMap.set(contractSymbol, {
              contract_symbol: contractSymbol,
              underlying_symbol: row.underlying_symbol,
              strike_price: parseFloat(row.strike_price),
              option_type: row.option_type,
              expiry_date: row.expiry_date,
              bars: []
            });
          }
          
          // Add bar with pre-calculated Greeks
          contractsMap.get(contractSymbol).bars.push({
            t: row.t,
            o: parseFloat(row.o),
            h: parseFloat(row.h),
            l: parseFloat(row.l),
            c: parseFloat(row.c),
            v: parseInt(row.v),
            underlying_price: parseFloat(row.underlying_price),
            // PRE-CALCULATED GREEKS - NO RECALCULATION NEEDED!
            greeks: {
              delta: parseFloat(row.delta),
              gamma: parseFloat(row.gamma),
              theta: parseFloat(row.theta),
              vega: parseFloat(row.vega),
              rho: parseFloat(row.rho),
              impliedVolatility: parseFloat(row.implied_volatility),
              timeToExpiry: parseFloat(row.time_to_expiry)
            }
          });
        });
        
        const optionsData = Array.from(contractsMap.values());
        
        // Cache in memory
        this.memoryCache.set(cacheKey, optionsData);
        
        return optionsData;
      }
      
      console.log(`⚠️ [SQL CACHE] No options data in SQL for ${symbol} ${expiryDate}, fetching from API`);
      
    } catch (error) {
      console.log(`⚠️ [SQL CACHE] SQL query failed: ${error.message}, using API`);
    }

    // Fallback to API (this should rarely happen in production)
    console.log(`📡 [API] Fetching options data for ${symbol} ${expiryDate} from Alpaca`);
    const optionsData = await this.fetchOptionsFromAPI(symbol, expiryDate, startTime, endTime);
    
    // Cache in memory
    this.memoryCache.set(cacheKey, optionsData);
    
    return optionsData;
  }

  /**
   * Build option chain using cached data with pre-calculated Greeks
   */
  async buildOptionChainFromCache(symbol, expiryDate, underlyingPrice, timestamp) {
    // Convert timestamp to UTC if it's not already
    let utcTimestamp;
    if (typeof timestamp === 'string') {
      // Check if it's already in UTC format
      if (timestamp.endsWith('Z') || timestamp.includes('+')) {
        utcTimestamp = timestamp;
      } else {
        // Assume it's EST and convert to UTC
        utcTimestamp = moment.tz(timestamp, 'America/New_York').utc().format();
      }
    } else {
      // It's a Date object, convert to UTC ISO string
      utcTimestamp = new Date(timestamp).toISOString();
    }
    
    const cacheKey = `chain_${symbol}_${expiryDate}_${utcTimestamp}`;
    
    // Check memory cache
    if (this.memoryCache.has(cacheKey)) {
      console.log(`📦 [CACHE] Using cached option chain for ${symbol} ${expiryDate} at ${utcTimestamp}`);
      return this.memoryCache.get(cacheKey);
    }

    try {
      console.log(`🔍 [SQL CACHE] Querying option chain for ${symbol} ${expiryDate} at ${utcTimestamp} (converted from ${timestamp})`);
      
      // Query for closest timestamp to build option chain (not exact match)
      const query = `
        SELECT 
          oc.contract_symbol,
          oc.underlying_symbol,
          oc.strike_price,
          oc.option_type,
          oc.expiry_date,
          ocb.option_close as price,
          ocb.option_volume as volume,
          ocb.underlying_price,
          -- Use pre-calculated Greeks - NO RECALCULATION!
          ocb.delta,
          ocb.gamma,
          ocb.theta,
          ocb.vega,
          ocb.rho,
          ocb.implied_volatility,
          ocb.bar_timestamp
        FROM option_contract_bars ocb
        JOIN option_contracts oc ON oc.instance_id = ocb.contract_instance_id
        WHERE oc.underlying_symbol = $1
          AND oc.expiry_date = $2
          AND ocb.bar_timestamp <= $3
          AND ocb.bar_timestamp >= $3::timestamp - interval '5 minutes'
          AND ocb.option_close > 0
          AND ocb.delta IS NOT NULL
        ORDER BY oc.strike_price ASC, ocb.bar_timestamp DESC
      `;
      
      const result = await this.db.query(query, [symbol, expiryDate, utcTimestamp]);
      
      if (result.rows && result.rows.length > 0) {
        console.log(`✅ [SQL CACHE] Found ${result.rows.length} contract bars using pre-calculated Greeks`);
        
        // Deduplicate to get most recent bar for each contract
        const contractMap = new Map();
        result.rows.forEach(row => {
          const contractKey = row.contract_symbol;
          if (!contractMap.has(contractKey) || 
              new Date(row.bar_timestamp) > new Date(contractMap.get(contractKey).bar_timestamp)) {
            contractMap.set(contractKey, row);
          }
        });
        
        console.log(`✅ [SQL CACHE] Built option chain with ${contractMap.size} unique contracts`);
        
        const optionChain = Array.from(contractMap.values()).map(row => ({
          symbol: row.contract_symbol,
          contract_symbol: row.contract_symbol,
          underlying_symbol: row.underlying_symbol,
          strike: parseFloat(row.strike_price),
          strike_price: parseFloat(row.strike_price),
          expiry_date: row.expiry_date,
          option_type: row.option_type,
          underlying_price: parseFloat(row.underlying_price),
          lastPrice: parseFloat(row.price),
          price: parseFloat(row.price),
          volume: parseInt(row.volume),
          timestamp: utcTimestamp,
          // CRITICAL: Use pre-calculated Greeks from SQL
          greeks: {
            delta: parseFloat(row.delta),
            gamma: parseFloat(row.gamma),
            theta: parseFloat(row.theta),
            vega: parseFloat(row.vega),
            rho: parseFloat(row.rho),
            impliedVolatility: parseFloat(row.implied_volatility)
          }
        }));
        
        // Cache result
        this.memoryCache.set(cacheKey, optionChain);
        
        return optionChain;
      }
      
      console.log(`⚠️ [SQL CACHE] No option chain data at timestamp ${utcTimestamp} (converted from ${timestamp})`);
      console.log(`   📡 Falling back to API to fetch option data...`);

    } catch (error) {
      console.log(`❌ [SQL CACHE] Failed to build option chain: ${error.message}`);
      console.log(`   📡 Falling back to API...`);
    }

    // Fallback to API when SQL cache doesn't have data
    try {
      // Fetch options from API for the entire trading day
      const startOfDay = `${expiryDate}T09:30:00-04:00`;
      const endOfDay = `${expiryDate}T16:00:00-04:00`;

      const optionsData = await this.fetchOptionsFromAPI(symbol, expiryDate, startOfDay, endOfDay, underlyingPrice);

      if (!optionsData || optionsData.length === 0) {
        console.log(`   ⚠️  No option data available from API for ${symbol} ${expiryDate}`);
        return [];
      }

      // Build option chain from API data at the specific timestamp
      const targetTime = new Date(utcTimestamp).getTime();
      const optionChain = [];

      for (const contract of optionsData) {
        // Find the closest bar to the target timestamp
        const closestBar = this.findClosestBar(contract.bars, targetTime);
        if (!closestBar) continue;

        // Calculate Greeks if not already present
        if (!closestBar.greeks && this.greeksCalculator) {
          closestBar.greeks = this.greeksCalculator.estimateGreeksFromOHLCV(
            underlyingPrice,
            contract.strike_price,
            contract.expiry_date,
            contract.option_type,
            closestBar,
            closestBar.t
          );
        }

        optionChain.push({
          symbol: contract.contract_symbol,
          contract_symbol: contract.contract_symbol,
          underlying_symbol: contract.underlying_symbol,
          strike: parseFloat(contract.strike_price),
          strike_price: parseFloat(contract.strike_price),
          expiry_date: contract.expiry_date,
          option_type: contract.option_type,
          underlying_price: underlyingPrice,
          lastPrice: parseFloat(closestBar.o), // Use OPEN price for realistic entry fill
          price: parseFloat(closestBar.o), // Use OPEN price for realistic entry fill
          volume: parseInt(closestBar.v),
          timestamp: utcTimestamp,
          greeks: closestBar.greeks || {
            delta: 0,
            gamma: 0,
            theta: 0,
            vega: 0,
            rho: 0,
            impliedVolatility: 0
          }
        });
      }

      console.log(`✅ [API FALLBACK] Built option chain with ${optionChain.length} contracts from API`);

      // Cache the option chain result
      if (optionChain.length > 0) {
        this.memoryCache.set(cacheKey, optionChain);
      }

      return optionChain;

    } catch (error) {
      console.error(`❌ [API FALLBACK] Failed to fetch and build option chain: ${error.message}`);
      return [];
    }
  }

  /**
   * Find closest bar by timestamp
   */
  findClosestBar(bars, targetTime) {
    let closest = null;
    let minDiff = Infinity;

    for (const bar of bars) {
      const barTime = new Date(bar.t).getTime();
      const diff = Math.abs(barTime - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = bar;
      }
    }

    return closest;
  }

  /**
   * API fallback methods (when SQL cache doesn't have data)
   */
  async fetchUnderlyingFromAPI(symbol, startDate, endDate) {
    const start = new Date(startDate).toISOString();
    const end = new Date(endDate + 'T23:59:59').toISOString();

    const response = await this.alpacaClient.getHistoricalBars({
      symbol,
      start,
      end,
      timeframe: '1Min'
    });

    const bars = response.bars || [];
    
    // Save underlying data to database for future caching
    if (bars.length > 0) {
      await this.saveUnderlyingBarsToDatabase(symbol, bars);
    }

    return bars;
  }

  /**
   * Save underlying bars to database for efficient caching
   */
  async saveUnderlyingBarsToDatabase(symbol, bars) {
    try {
      console.log(`💾 [DB SAVE] Saving ${bars.length} underlying bars for ${symbol} to database`);
      
      const values = [];
      const placeholders = [];
      let paramIndex = 1;

      bars.forEach(bar => {
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`);
        values.push(
          symbol,
          bar.t, // timestamp
          parseFloat(bar.o), // open
          parseFloat(bar.h), // high
          parseFloat(bar.l), // low
          parseFloat(bar.c), // close
          parseInt(bar.v) // volume
        );
        paramIndex += 7;
      });

      const query = `
        INSERT INTO underlying_bars (symbol, timestamp, open, high, low, close, volume)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (symbol, timestamp) DO UPDATE SET
          open = EXCLUDED.open,
          high = EXCLUDED.high,
          low = EXCLUDED.low,
          close = EXCLUDED.close,
          volume = EXCLUDED.volume
      `;

      await this.db.query(query, values);
      console.log(`✅ [DB SAVE] Successfully saved ${bars.length} underlying bars for ${symbol}`);
      
    } catch (error) {
      console.error(`❌ [DB SAVE] Failed to save underlying bars for ${symbol}:`, error.message);
      // Don't throw error - continue with API data even if save fails
    }
  }

  async fetchOptionsFromAPI(symbol, expiryDate, startTime, endTime, underlyingPrice) {
    console.log(`📡 [API FALLBACK] Fetching options for ${symbol} ${expiryDate} from Alpaca API`);
    console.log(`   Current underlying price: $${underlyingPrice.toFixed(2)}`);

    try {
      // Use the CURRENT underlying price (from signal timestamp) to determine ATM strike
      // REDUCED RANGE: Use ±$5 from underlying price to prevent API rate limiting
      const atmStrike = Math.round(underlyingPrice);
      const dollarRange = 5; // ±$5 from underlying price (much more conservative)
      const minStrike = atmStrike - dollarRange;
      const maxStrike = atmStrike + dollarRange;
      
      // Generate strikes in $1 increments within the ±$5 range
      const strikes = [];
      for (let strike = minStrike; strike <= maxStrike; strike++) {
        strikes.push(strike);
      }

      console.log(`📋 [API FALLBACK] Generating strikes from $${minStrike} to $${maxStrike} (${strikes.length} strikes)`);

      // Calculate parameters for existing generateOptionSymbols method
      const strikeRangeParam = Math.ceil((maxStrike - minStrike) / 2);
      const optionSymbols = this.alpacaClient.generateOptionSymbols({
        underlying: symbol,
        expiryDate: expiryDate,
        centerStrike: atmStrike,
        strikeRange: strikeRangeParam,  // Dynamic range based on reduced strikes
        strikeSpacing: 1   // $1 increments as requested
      });

      console.log(`📋 [API FALLBACK] Generated ${optionSymbols.length} option symbols (ATM: $${atmStrike})`);
      console.log(`🔍 [API DEBUG] Sample symbols: ${optionSymbols.slice(0, 5).join(', ')}`);

      // Fetch option bars from Alpaca
      console.log(`📡 [API REQUEST] Calling Alpaca getHistoricalOptionBars with ${optionSymbols.length} symbols`);
      console.log(`📅 [API REQUEST] Time range: ${startTime} to ${endTime}`);
      
      let optionBars;
      try {
        optionBars = await this.alpacaClient.getHistoricalOptionBars({
          symbols: optionSymbols,
          startDate: startTime,
          endDate: endTime
        });
        console.log(`✅ [API RESPONSE] Received data for ${Object.keys(optionBars).length} symbols`);
      } catch (error) {
        console.log(`❌ [API ERROR] Failed to fetch option bars: ${error.message}`);
        if (error.response) {
          console.log(`📄 [API ERROR] Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
      }

      // Transform to contracts format
      const contracts = [];
      let totalBars = 0;
      for (const [contractSymbol, bars] of Object.entries(optionBars)) {
        if (!bars || bars.length === 0) {
          console.log(`⚠️ [API RESPONSE] No bars for ${contractSymbol}`);
          continue;
        }

        totalBars += bars.length;
        console.log(`📊 [API RESPONSE] ${contractSymbol}: ${bars.length} bars`);

        // Parse option symbol
        const parsed = this.parseOptionSymbol(contractSymbol);
        if (!parsed) {
          console.log(`❌ [PARSE ERROR] Failed to parse symbol: ${contractSymbol}`);
          continue;
        }

        contracts.push({
          contract_symbol: contractSymbol,
          underlying_symbol: symbol,
          strike_price: parsed.strike,
          option_type: parsed.type,
          expiry_date: expiryDate,
          bars: bars
        });
      }

      console.log(`✅ [API FALLBACK] Fetched ${contracts.length} option contracts with ${totalBars} total bars from API`);
      
      // 🔥 CRITICAL FIX: Save fetched options data to database for future backtests
      if (contracts.length > 0) {
        console.log(`💾 [DB SAVE] Attempting to save ${contracts.length} contracts to database`);
        await this.saveOptionsDataToSQL(contracts, underlyingPrice);
        console.log(`✅ [DB SAVE] Successfully saved options data to database`);
      } else {
        console.log(`⚠️ [DB SAVE] No contracts to save to database`);
      }
      
      return contracts;

    } catch (error) {
      console.error(`❌ [API FALLBACK] Failed to fetch options: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse option symbol (OCC format)
   */
  parseOptionSymbol(symbol) {
    const match = symbol.match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
    if (!match) return null;

    const [, ticker, dateStr, typeChar, strikeStr] = match;
    const year = 2000 + parseInt(dateStr.substring(0, 2));
    const month = parseInt(dateStr.substring(2, 4));
    const day = parseInt(dateStr.substring(4, 6));
    const strike = parseInt(strikeStr) / 1000;

    return {
      ticker,
      strike,
      type: typeChar === 'C' ? 'CALL' : 'PUT',
      expiry: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }

  /**
   * Save options data to SQL database (CRITICAL FOR BACKTESTING)
   */
  async saveOptionsDataToSQL(contracts, underlyingPrice) {
    if (!contracts || contracts.length === 0) return;
    
    try {
      console.log(`💾 [DB SAVE] Saving ${contracts.length} option contracts to database`);
      
      let totalBars = 0;
      for (const contract of contracts) {
        if (!contract.bars || contract.bars.length === 0) continue;
        
        // Generate UUID for this contract instance
        const instanceId = this.generateUUID();
        
        // Save contract metadata
        await this.db.query(`
          INSERT INTO option_contracts (
            instance_id, contract_symbol, underlying_symbol, 
            strike_price, option_type, expiry_date,
            execution_mode, status, entry_timestamp,
            entry_price, quantity, entry_underlying_price
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (instance_id) DO UPDATE SET
            contract_symbol = EXCLUDED.contract_symbol,
            status = EXCLUDED.status
        `, [
          instanceId,
          contract.contract_symbol,
          contract.underlying_symbol, 
          contract.strike_price,
          contract.option_type,
          contract.expiry_date,
          'pre-cache',
          'data-cached',
          new Date().toISOString(), // entry_timestamp - required field
          0.0, // entry_price - using 0 for pre-cache
          1, // quantity - using 1 for pre-cache  
          parseFloat(underlyingPrice) // entry_underlying_price
        ]);
        
        // Save all bars with calculated Greeks
        for (const bar of contract.bars) {
          // Calculate Greeks if not present
          let greeks = bar.greeks;
          if (!greeks && this.greeksCalculator) {
            greeks = this.greeksCalculator.estimateGreeksFromOHLCV(
              underlyingPrice,
              contract.strike_price,
              contract.expiry_date,
              contract.option_type,
              bar,
              bar.t
            );
          }
          
          if (!greeks) {
            greeks = { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0, impliedVolatility: 0, timeToExpiry: 0 };
          }
          
          // 🔥 FIX: Bounds checking to prevent numeric field overflow
          const boundedGreeks = {
            delta: Math.max(-99.999999, Math.min(99.999999, greeks.delta || 0)),
            gamma: Math.max(-99.999999, Math.min(99.999999, greeks.gamma || 0)),
            theta: Math.max(-99.999999, Math.min(99.999999, greeks.theta || 0)),
            vega: Math.max(-99.999999, Math.min(99.999999, greeks.vega || 0)),
            rho: Math.max(-99.999999, Math.min(99.999999, greeks.rho || 0)),
            impliedVolatility: Math.max(0, Math.min(99.999999, greeks.impliedVolatility || 0)),
            timeToExpiry: Math.max(0, Math.min(99.999999, greeks.timeToExpiry || 0))
          };
          
          // Bounds checking for price and underlying price
          const boundedPrice = {
            open: Math.max(0, Math.min(999999.9999, parseFloat(bar.o) || 0)),
            high: Math.max(0, Math.min(999999.9999, parseFloat(bar.h) || 0)),
            low: Math.max(0, Math.min(999999.9999, parseFloat(bar.l) || 0)),
            close: Math.max(0, Math.min(999999.9999, parseFloat(bar.c) || 0)),
            volume: Math.max(0, Math.min(2147483647, parseInt(bar.v) || 0)), // INT max
            underlying: Math.max(0, Math.min(999999.9999, parseFloat(underlyingPrice) || 0))
          };
          
          await this.db.query(`
            INSERT INTO option_contract_bars (
              contract_instance_id, bar_timestamp,
              option_open, option_high, option_low, option_close, option_volume,
              underlying_price, delta, gamma, theta, vega, rho,
              implied_volatility, time_to_expiry
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (contract_instance_id, bar_timestamp) DO UPDATE SET
              option_close = EXCLUDED.option_close,
              delta = EXCLUDED.delta,
              gamma = EXCLUDED.gamma,
              theta = EXCLUDED.theta,
              vega = EXCLUDED.vega
          `, [
            instanceId,
            bar.t,
            boundedPrice.open,
            boundedPrice.high,
            boundedPrice.low,
            boundedPrice.close,
            boundedPrice.volume,
            boundedPrice.underlying,
            boundedGreeks.delta,
            boundedGreeks.gamma,
            boundedGreeks.theta,
            boundedGreeks.vega,
            boundedGreeks.rho,
            boundedGreeks.impliedVolatility,
            boundedGreeks.timeToExpiry
          ]);
          
          totalBars++;
        }
      }
      
      console.log(`✅ [DB SAVE] Successfully saved ${totalBars} option bars across ${contracts.length} contracts`);
      
    } catch (error) {
      console.error(`❌ [DB SAVE] Failed to save options data:`, error.message);
      // Don't throw - continue with cached data even if save fails
    }
  }

  /**
   * Generate UUID v4
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Clear memory cache (useful between backtests)
   */
  clearCache() {
    this.memoryCache.clear();
    console.log(`🧹 [CACHE] Memory cache cleared`);
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      memoryCacheSize: this.memoryCache.size,
      cacheKeys: Array.from(this.memoryCache.keys())
    };
  }
}

module.exports = DataCacheManager;