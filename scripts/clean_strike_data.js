/**
 * Database cleanup script for irregular strike prices
 * This script will:
 * 1. Delete option contracts with irregular strike prices
 * 2. Keep only $5 increment strikes
 */

const { Pool } = require('pg');

async function cleanStrikeData() {
  const db = new Pool({
    host: 'trading_db',
    port: 5432,
    database: 'trading_system',
    user: 'trader',
    password: 'trading_system'
  });

  try {
    console.log('🧹 Starting strike data cleanup...');

    // Begin transaction
    await db.query('BEGIN');

    // Delete option contracts with irregular strikes
    const deleteQuery = `
      DELETE FROM option_contracts
      WHERE MOD(strike_price::numeric, 5) != 0
      AND symbol = 'SPY'
      AND created_at >= '2024-10-01'
      RETURNING id;
    `;

    const result = await db.query(deleteQuery);
    const deletedCount = result.rowCount;

    // Commit transaction
    await db.query('COMMIT');

    console.log(`✅ Cleanup complete! Removed ${deletedCount} irregular strike contracts`);

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    await db.query('ROLLBACK');
  } finally {
    await db.end();
  }
}

cleanStrikeData();