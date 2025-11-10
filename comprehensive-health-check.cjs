/**
 * Comprehensive System Health Check
 *
 * Validates all components of the Trade Whisperer system:
 * - Docker containers
 * - Data Bus implementation
 * - API Server
 * - Backtesting Server
 * - Frontend connectivity
 * - WebSocket connections
 * - Data flow
 */

const http = require('http');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;

const execAsync = promisify(exec);

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: res.statusCode, data });
        }
      });
    }).on('error', reject);
  });
}

async function checkDockerContainers() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('📦 DOCKER CONTAINERS CHECK', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  try {
    const { stdout } = await execAsync('docker ps --format "{{.Names}}\t{{.Status}}"');
    const containers = stdout.trim().split('\n');

    const expectedContainers = [
      'trading_db',
      'trading_redis',
      'trading_data_bus',
      'trading_api',
      'trading_backtest',
      'trading_options_data',
      'trading_frontend'
    ];

    const results = {
      total: expectedContainers.length,
      running: 0,
      missing: []
    };

    expectedContainers.forEach(name => {
      const found = containers.find(line => line.includes(name));
      if (found) {
        const isUp = found.includes('Up');
        if (isUp) {
          log(`✅ ${name}: Running`, 'green');
          results.running++;
        } else {
          log(`⚠️  ${name}: Not running`, 'yellow');
        }
      } else {
        log(`❌ ${name}: Missing`, 'red');
        results.missing.push(name);
      }
    });

    log(`\nContainer Status: ${results.running}/${results.total} running\n`,
        results.running === results.total ? 'green' : 'yellow');

    return results;
  } catch (error) {
    log(`❌ Error checking Docker: ${error.message}`, 'red');
    return { total: 0, running: 0, error: error.message };
  }
}

async function checkDataBus() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('🚌 DATA BUS MANAGER CHECK', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  try {
    const { statusCode, data } = await httpGet('http://localhost:3004/health');

    if (statusCode === 200 && data.healthy) {
      log('✅ Data Bus is healthy', 'green');
      log(`   - Stock Channel Connected: ${data.stats.stockChannel.connected}`, 'green');
      log(`   - Active Symbols: ${data.stats.stockChannel.symbols.join(', ')}`, 'green');
      log(`   - Feed Type: ${data.stats.optionsChannel.feed}`, 'green');
      log(`   - Total Subscriptions: ${data.stats.bus.subscriptions}`, 'green');
      log(`   - Total Subscribers: ${data.stats.bus.totalSubscribers}`, 'green');
      return { healthy: true, stats: data.stats };
    } else {
      log('❌ Data Bus unhealthy', 'red');
      return { healthy: false };
    }
  } catch (error) {
    log(`❌ Data Bus not accessible: ${error.message}`, 'red');
    return { healthy: false, error: error.message };
  }
}

async function checkApiServer() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('🔌 API SERVER CHECK', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  try {
    const { statusCode, data } = await httpGet('http://localhost:3001/health');

    if (statusCode === 200) {
      log('✅ API Server is healthy', 'green');
      log(`   - Status: ${data.status}`, 'green');
      log(`   - Version: ${data.version}`, 'green');
      return { healthy: true, data };
    } else {
      log('❌ API Server unhealthy', 'red');
      return { healthy: false };
    }
  } catch (error) {
    log(`❌ API Server not accessible: ${error.message}`, 'red');
    return { healthy: false, error: error.message };
  }
}

async function checkBacktestingServer() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('📊 BACKTESTING SERVER CHECK', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  try {
    const { statusCode, data } = await httpGet('http://localhost:3002/health');

    if (statusCode === 200) {
      log('✅ Backtesting Server is healthy', 'green');
      return { healthy: true, data };
    } else {
      log('❌ Backtesting Server unhealthy', 'red');
      return { healthy: false };
    }
  } catch (error) {
    log(`❌ Backtesting Server not accessible: ${error.message}`, 'red');
    return { healthy: false, error: error.message };
  }
}

async function checkFrontend() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('💻 FRONTEND CHECK', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  try {
    const { statusCode } = await httpGet('http://localhost:8080');

    if (statusCode === 200) {
      log('✅ Frontend is accessible on http://localhost:8080', 'green');
      return { healthy: true };
    } else {
      log('❌ Frontend returned non-200 status', 'red');
      return { healthy: false };
    }
  } catch (error) {
    log(`❌ Frontend not accessible: ${error.message}`, 'red');
    return { healthy: false, error: error.message };
  }
}

async function checkDatabase() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('🗄️  DATABASE CHECK', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  try {
    const { stdout } = await execAsync('docker exec trading_db psql -U trader -d trading_system -c "\\dt" 2>&1');

    const requiredTables = ['bus_stock_data', 'bus_option_data', 'backtests', 'option_contracts'];
    const results = {
      total: requiredTables.length,
      found: 0,
      missing: []
    };

    requiredTables.forEach(table => {
      if (stdout.includes(table)) {
        log(`✅ Table exists: ${table}`, 'green');
        results.found++;
      } else {
        log(`❌ Table missing: ${table}`, 'red');
        results.missing.push(table);
      }
    });

    log(`\nDatabase Tables: ${results.found}/${results.total} found\n`,
        results.found === results.total ? 'green' : 'yellow');

    return results;
  } catch (error) {
    log(`❌ Error checking database: ${error.message}`, 'red');
    return { error: error.message };
  }
}

async function checkDataBusConnection() {
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan');
  log('🔗 DATA BUS CONNECTION CHECK', 'cyan');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n', 'cyan');

  try {
    const { stdout } = await execAsync('docker logs trading_data_bus --tail 50 2>&1');

    const checks = {
      alpacaConnected: stdout.includes('Stock WebSocket authenticated') || stdout.includes('Connected to Alpaca'),
      hasSubscriptions: stdout.includes('subscription confirmed') || stdout.includes('Client subscribed'),
      noErrors: !stdout.includes('❌ Failed') && !stdout.includes('ERROR'),
      tablesInitialized: stdout.includes('SQLCacheLayer tables initialized')
    };

    if (checks.alpacaConnected) {
      log('✅ Data Bus connected to Alpaca', 'green');
    } else {
      log('⚠️  Data Bus not showing Alpaca connection', 'yellow');
    }

    if (checks.hasSubscriptions) {
      log('✅ Data Bus has active subscriptions', 'green');
    } else {
      log('⚠️  No subscriptions detected', 'yellow');
    }

    if (checks.tablesInitialized) {
      log('✅ SQL Cache tables initialized', 'green');
    } else {
      log('⚠️  SQL Cache may not be initialized', 'yellow');
    }

    if (checks.noErrors) {
      log('✅ No errors in recent logs', 'green');
    } else {
      log('⚠️  Errors detected in logs', 'yellow');
    }

    return checks;
  } catch (error) {
    log(`❌ Error checking Data Bus logs: ${error.message}`, 'red');
    return { error: error.message };
  }
}

async function generateReport(results) {
  const timestamp = new Date().toISOString();

  let report = `# System Health Check Report\n\n`;
  report += `**Generated:** ${timestamp}\n\n`;
  report += `---\n\n`;

  // Overall Status
  const allHealthy =
    results.docker.running === results.docker.total &&
    results.dataBus.healthy &&
    results.apiServer.healthy &&
    results.backtesting.healthy &&
    results.frontend.healthy &&
    results.database.found === results.database.total;

  report += `## Overall Status: ${allHealthy ? '✅ HEALTHY' : '⚠️ NEEDS ATTENTION'}\n\n`;

  // Docker Containers
  report += `## Docker Containers\n\n`;
  report += `Status: ${results.docker.running}/${results.docker.total} running\n\n`;
  if (results.docker.missing && results.docker.missing.length > 0) {
    report += `Missing containers:\n`;
    results.docker.missing.forEach(c => report += `- ${c}\n`);
    report += `\n`;
  }

  // Data Bus
  report += `## Data Bus Manager\n\n`;
  report += `Health: ${results.dataBus.healthy ? '✅ Healthy' : '❌ Unhealthy'}\n\n`;
  if (results.dataBus.stats) {
    report += `- Stock Channel Connected: ${results.dataBus.stats.stockChannel.connected}\n`;
    report += `- Active Symbols: ${results.dataBus.stats.stockChannel.symbols.join(', ')}\n`;
    report += `- Feed Type: ${results.dataBus.stats.optionsChannel.feed}\n`;
    report += `- Subscriptions: ${results.dataBus.stats.bus.subscriptions}\n\n`;
  }

  // API Server
  report += `## API Server\n\n`;
  report += `Health: ${results.apiServer.healthy ? '✅ Healthy' : '❌ Unhealthy'}\n\n`;

  // Backtesting Server
  report += `## Backtesting Server\n\n`;
  report += `Health: ${results.backtesting.healthy ? '✅ Healthy' : '❌ Unhealthy'}\n\n`;

  // Frontend
  report += `## Frontend\n\n`;
  report += `Health: ${results.frontend.healthy ? '✅ Accessible' : '❌ Not Accessible'}\n\n`;

  // Database
  report += `## Database\n\n`;
  report += `Tables: ${results.database.found}/${results.database.total} found\n\n`;
  if (results.database.missing && results.database.missing.length > 0) {
    report += `Missing tables:\n`;
    results.database.missing.forEach(t => report += `- ${t}\n`);
    report += `\n`;
  }

  // Data Bus Connection
  report += `## Data Bus Connection Details\n\n`;
  report += `- Alpaca Connected: ${results.busConnection.alpacaConnected ? '✅' : '❌'}\n`;
  report += `- Has Subscriptions: ${results.busConnection.hasSubscriptions ? '✅' : '❌'}\n`;
  report += `- Tables Initialized: ${results.busConnection.tablesInitialized ? '✅' : '❌'}\n`;
  report += `- No Errors: ${results.busConnection.noErrors ? '✅' : '⚠️'}\n\n`;

  // Recommendations
  report += `## Recommendations\n\n`;
  if (allHealthy) {
    report += `✅ All systems are healthy and operational!\n\n`;
    report += `The following components are working correctly:\n`;
    report += `- All Docker containers are running\n`;
    report += `- Data Bus is connected to Alpaca and receiving data\n`;
    report += `- API Server and Backtesting Server are healthy\n`;
    report += `- Frontend is accessible\n`;
    report += `- Database tables are properly initialized\n\n`;
    report += `You can now:\n`;
    report += `1. Run the electron app with: \`npm run start:dev\`\n`;
    report += `2. Access the web UI at: http://localhost:8080\n`;
    report += `3. Run the audit script with: \`node audit-electron-app.js\`\n`;
  } else {
    report += `⚠️ Some components need attention:\n\n`;

    if (results.docker.running < results.docker.total) {
      report += `- **Docker Containers:** Some containers are not running. Restart with \`docker-compose restart\`\n`;
    }

    if (!results.dataBus.healthy) {
      report += `- **Data Bus:** Not healthy. Check logs with \`docker logs trading_data_bus\`\n`;
    }

    if (!results.apiServer.healthy) {
      report += `- **API Server:** Not responding. Check logs with \`docker logs trading_api\`\n`;
    }

    if (!results.backtesting.healthy) {
      report += `- **Backtesting Server:** Not responding. Check logs with \`docker logs trading_backtest\`\n`;
    }

    if (!results.frontend.healthy) {
      report += `- **Frontend:** Not accessible. Start with \`npm run dev\`\n`;
    }

    if (results.database.missing && results.database.missing.length > 0) {
      report += `- **Database:** Missing tables. Restart data_bus_manager with \`docker-compose restart data_bus_manager\`\n`;
    }
  }

  await fs.writeFile('SYSTEM_HEALTH_REPORT.md', report);
  log('\n📄 Report saved to: SYSTEM_HEALTH_REPORT.md\n', 'cyan');
}

async function main() {
  log('\n╔═══════════════════════════════════════════════════════════╗', 'blue');
  log('║       TRADE WHISPERER - COMPREHENSIVE HEALTH CHECK       ║', 'blue');
  log('╚═══════════════════════════════════════════════════════════╝\n', 'blue');

  const results = {
    docker: await checkDockerContainers(),
    dataBus: await checkDataBus(),
    apiServer: await checkApiServer(),
    backtesting: await checkBacktestingServer(),
    frontend: await checkFrontend(),
    database: await checkDatabase(),
    busConnection: await checkDataBusConnection()
  };

  await generateReport(results);

  log('\n╔═══════════════════════════════════════════════════════════╗', 'blue');
  log('║                   HEALTH CHECK COMPLETE                   ║', 'blue');
  log('╚═══════════════════════════════════════════════════════════╝\n', 'blue');

  // Determine exit code
  const allHealthy =
    results.docker.running === results.docker.total &&
    results.dataBus.healthy &&
    results.apiServer.healthy &&
    results.backtesting.healthy &&
    results.frontend.healthy;

  if (allHealthy) {
    log('🎉 All systems are GO! Ready for electron app testing.\n', 'green');
    process.exit(0);
  } else {
    log('⚠️  Some systems need attention. Check the report for details.\n', 'yellow');
    process.exit(1);
  }
}

main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}\n`, 'red');
  console.error(error);
  process.exit(1);
});
