/**
 * SQL Cache Population Script
 *
 * Fetches historical data and pre-calculates Greeks, storing them in SQL database
 * This eliminates the need for real-time API calls during backtesting
 *
 * Usage:
 *   node scripts/populate-sql-cache.js --symbol SPY --start 2024-10-01 --end 2024-10-31
 */

const { Pool } = require('pg');
const AlpacaClient = require('../utils/alpaca-client');
const GreeksCalculator = require('../utils/greeks-calculator');
const moment = require('moment-timezone');

class CachePopulator {
  constructor() {
    // Database connection
    this.db = new Pool({
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT) || 5433,
      database: process.env.POSTGRES_DB || 'trading_system',
      user: process.env.POSTGRES_USER || 'trader',
      password: process.env.POSTGRES_PASSWORD || 'trader123'
    });

    this.alpacaClient = new AlpacaClient();
    this.greeksCalculator = new GreeksCalculator();
  }

  /**
   * Populate underlying bars for date range
   */
  async populateUnderlyingBars(symbol, startDate, endDate) {
    console.log(`\n📊 Populating underlying bars for ${symbol}`);
    console.log(`   Range: ${startDate} to ${endDate}`);

    try {
      const bars = await this.alpacaClient.getHistoricalBars({
        symbol,
        start: `${startDate}T00:00:00Z`,
        end: `${endDate}T23:59:59Z`,
        timeframe: '1Min'
      });

      if (!bars || !bars.bars || bars.bars.length === 0) {
        console.log(`   ⚠️  No bars returned from API`);
        return 0;
      }

      console.log(`   📥 Fetched ${bars.bars.length} bars from API`);

      // Prepare bulk insert
      const values = [];
      const placeholders = [];
      let paramIndex = 1;

      bars.bars.forEach(bar => {
        placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`);
        values.push(
          symbol,
          bar.t,
          parseFloat(bar.o),
          parseFloat(bar.h),
          parseFloat(bar.l),
          parseFloat(bar.c),
          parseInt(bar.v)
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
      console.log(`   ✅ Saved ${bars.bars.length} underlying bars to database`);

      return bars.bars.length;

    } catch (error) {
      console.error(`   ❌ Error populating underlying bars:`, error.message);
      return 0;
    }
  }

  /**
   * Populate options data with pre-calculated Greeks
   */
  async populateOptionsData(symbol, date) {
    console.log(`\n🎯 Populating options data for ${symbol} on ${date}`);

    try {
      // Get underlying bars for the day to calculate ATM
      const underlyingBars = await this.getUnderlyingBarsFromDB(symbol, date);

      if (underlyingBars.length === 0) {
        console.log(`   ⚠️  No underlying data in database for ${date}`);
        console.log(`   💡 Run populateUnderlyingBars first`);
        return 0;
      }

      console.log(`   📊 Found ${underlyingBars.length} underlying bars`);

      // Get first bar to determine ATM strike
      const firstBar = underlyingBars[0];
      const atmPrice = parseFloat(firstBar.c);
      const atmStrike = Math.round(atmPrice / 5) * 5;

      console.log(`   💰 ATM Price: $${atmPrice.toFixed(2)}, ATM Strike: $${atmStrike}`);

      // Generate option symbols (±1 strike for tightest range = ATM ± $5)
      const optionSymbols = this.generateOptionSymbols(symbol, date, atmStrike, 1, 5);
      console.log(`   📋 Generated ${optionSymbols.length} option symbols`);

      // Fetch option bars from API
      const optionBars = await this.alpacaClient.getHistoricalOptionBars({
        symbols: optionSymbols,
        startDate: `${date}T09:30:00-04:00`,
        endDate: `${date}T16:00:00-04:00`
      });

      console.log(`   📥 Fetched option bars for ${Object.keys(optionBars).length} contracts`);

      let totalBars = 0;
      let contractsProcessed = 0;

      // Process each contract
      for (const [contractSymbol, bars] of Object.entries(optionBars)) {
        if (!bars || bars.length === 0) continue;

        const parsed = this.parseOptionSymbol(contractSymbol);
        if (!parsed) continue;

        // Create contract instance
        const instanceId = this.generateUUID();

        // Save contract metadata (without backtest_id since this is pre-caching)
        await this.saveContract(instanceId, contractSymbol, symbol, parsed, date);

        // Calculate and save Greeks for each bar
        for (let i = 0; i < bars.length; i++) {
          const optionBar = bars[i];
          const barTime = new Date(optionBar.t);

          // Find corresponding underlying bar
          const underlyingBar = this.findClosestBar(underlyingBars, barTime);
          if (!underlyingBar) continue;

          // Calculate Greeks
          const greeks = this.greeksCalculator.estimateGreeksFromOHLCV(
            parseFloat(underlyingBar.c),
            parsed.strike,
            parsed.expiry,
            parsed.type,
            optionBar,
            optionBar.t
          );

          // Save bar with Greeks
          await this.saveOptionBar(instanceId, optionBar, underlyingBar.c, greeks);
          totalBars++;
        }

        contractsProcessed++;
        if (contractsProcessed % 5 === 0) {
          console.log(`   ⏳ Processed ${contractsProcessed}/${Object.keys(optionBars).length} contracts...`);
        }
      }

      console.log(`   ✅ Saved ${totalBars} option bars with Greeks for ${contractsProcessed} contracts`);
      return totalBars;

    } catch (error) {
      console.error(`   ❌ Error populating options data:`, error.message);
      console.error(error.stack);
      return 0;
    }
  }

  /**
   * Helper: Get underlying bars from database
   */
  async getUnderlyingBarsFromDB(symbol, date) {
    const startUTC = moment.tz(date, 'America/New_York').utc().format();
    const endUTC = moment.tz(date + ' 23:59:59', 'America/New_York').utc().format();

    const result = await this.db.query(`
      SELECT timestamp as t, close as c
      FROM underlying_bars
      WHERE symbol = $1 AND timestamp >= $2 AND timestamp <= $3
      ORDER BY timestamp ASC
    `, [symbol, startUTC, endUTC]);

    return result.rows;
  }

  /**
   * Helper: Save contract metadata
   */
  async saveContract(instanceId, contractSymbol, underlyingSymbol, parsed, expiryDate) {
    await this.db.query(`
      INSERT INTO option_contracts (
        instance_id, contract_symbol, underlying_symbol,
        strike_price, expiry_date, option_type,
        entry_timestamp, entry_price, quantity, status, execution_mode
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), 0, 0, 'CACHED', 'pre-cache')
      ON CONFLICT (instance_id) DO NOTHING
    `, [
      instanceId,
      contractSymbol,
      underlyingSymbol,
      parsed.strike,
      expiryDate,
      parsed.type
    ]);
  }

  /**
   * Helper: Save option bar with Greeks
   */
  async saveOptionBar(instanceId, optionBar, underlyingPrice, greeks) {
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
        gamma = EXCLUDED.gamma
    `, [
      instanceId,
      optionBar.t,
      parseFloat(optionBar.o),
      parseFloat(optionBar.h),
      parseFloat(optionBar.l),
      parseFloat(optionBar.c),
      parseInt(optionBar.v),
      parseFloat(underlyingPrice),
      greeks.delta,
      greeks.gamma,
      greeks.theta,
      greeks.vega,
      greeks.rho,
      greeks.impliedVolatility,
      greeks.timeToExpiry
    ]);
  }

  /**
   * Helper: Generate option symbols
   */
  generateOptionSymbols(ticker, expiryDate, centerStrike, strikeRange, strikeSpacing) {
    const symbols = [];
    const expiry = moment(expiryDate);
    const yy = expiry.format('YY');
    const mm = expiry.format('MM');
    const dd = expiry.format('DD');

    for (let i = -strikeRange; i <= strikeRange; i++) {
      const strike = centerStrike + (i * strikeSpacing);
      const strikePadded = String(Math.floor(strike * 1000)).padStart(8, '0');

      symbols.push(`${ticker}${yy}${mm}${dd}C${strikePadded}`); // Call
      symbols.push(`${ticker}${yy}${mm}${dd}P${strikePadded}`); // Put
    }

    return symbols;
  }

  /**
   * Helper: Parse option symbol
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
   * Helper: Find closest bar by timestamp
   */
  findClosestBar(bars, targetTime) {
    let closest = null;
    let minDiff = Infinity;

    for (const bar of bars) {
      const barTime = new Date(bar.t);
      const diff = Math.abs(barTime - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = bar;
      }
    }

    return closest;
  }

  /**
   * Helper: Generate UUID
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Populate complete date range
   */
  async populateDateRange(symbol, startDate, endDate) {
    console.log(`\n🚀 Starting cache population for ${symbol}`);
    console.log(`   Date range: ${startDate} to ${endDate}\n`);

    // Step 1: Populate underlying bars
    console.log('Step 1: Populating underlying bars...');
    const underlyingBarsCount = await this.populateUnderlyingBars(symbol, startDate, endDate);

    if (underlyingBarsCount === 0) {
      console.log('\n❌ Failed to populate underlying bars. Aborting.');
      return;
    }

    // Step 2: Populate options data for each date
    console.log('\nStep 2: Populating options data with Greeks...');

    const start = moment(startDate);
    const end = moment(endDate);
    const dates = [];

    for (let date = start.clone(); date.isSameOrBefore(end); date.add(1, 'days')) {
      // Only process weekdays (Monday-Friday)
      if (date.day() !== 0 && date.day() !== 6) {
        dates.push(date.format('YYYY-MM-DD'));
      }
    }

    console.log(`   Processing ${dates.length} trading days...`);

    let totalOptionBars = 0;
    for (let i = 0; i < dates.length; i++) {
      console.log(`\n[${i + 1}/${dates.length}] Processing ${dates[i]}...`);
      const count = await this.populateOptionsData(symbol, dates[i]);
      totalOptionBars += count;
    }

    console.log(`\n✅ Cache population complete!`);
    console.log(`   Underlying bars: ${underlyingBarsCount}`);
    console.log(`   Option bars with Greeks: ${totalOptionBars}`);
    console.log(`   Trading days processed: ${dates.length}`);
  }

  async close() {
    await this.db.end();
  }
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const symbolArg = args.find(arg => arg.startsWith('--symbol='));
  const startArg = args.find(arg => arg.startsWith('--start='));
  const endArg = args.find(arg => arg.startsWith('--end='));

  const symbol = symbolArg ? symbolArg.split('=')[1] : 'SPY';
  const startDate = startArg ? startArg.split('=')[1] : '2024-10-01';
  const endDate = endArg ? endArg.split('=')[1] : '2024-10-31';

  const populator = new CachePopulator();

  populator.populateDateRange(symbol, startDate, endDate)
    .then(() => {
      console.log('\n✅ Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    })
    .finally(() => {
      populator.close();
    });
}

module.exports = CachePopulator;
