#!/usr/bin/env node

/**
 * Comprehensive Bot Validation Tool
 * 
 * Captures individual screenshots of each bot's trading space,
 * validates WebSocket connections, options matrices, and performance.
 * 
 * Based on research of Freqtrade multi-bot architecture and TradingView
 * lightweight charts best practices.
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
  url: 'http://localhost:8080',
  paperId: 'paper',
  screenshotDir: './bot-validation-screenshots',
  timeout: 30000,
  waitForChart: 5000,
  waitForOptions: 3000,
  
  // Expected bot configuration based on API data
  expectedBots: [
    { bot_id: 1, name: 'IWM Test Bot', symbol: 'IWM', status: 'running' },
    { bot_id: 5, name: 'Conservative Bot', symbol: 'SPY', status: 'stopped' },
    { bot_id: 6, name: 'Moderate Bot', symbol: 'QQQ', status: 'stopped' },
    { bot_id: 7, name: 'Aggressive Bot', symbol: 'IWM', status: 'stopped' },
    { bot_id: 8, name: 'Test Bot', symbol: 'SPY', status: 'stopped' },
    { bot_id: 9, name: 'Frontend Test Bot', symbol: 'QQQ', status: 'stopped' },
    { bot_id: 10, name: 'UI Test Bot', symbol: 'SPY', status: 'stopped' }
  ],
  
  // Symbols to validate
  symbols: ['SPY', 'QQQ', 'IWM'],
  
  // Options validation criteria
  optionsValidation: {
    minStrikes: 6, // ATM ± 3 strikes minimum
    requiredColumns: ['Strike', 'Bid', 'Ask', 'Delta', 'Gamma', 'Theta', 'Vega'],
    maxSpreadPercent: 25 // Max 25% spread
  }
};

class BotValidator {
  constructor() {
    this.browser = null;
    this.page = null;
    this.validationResults = {
      timestamp: new Date().toISOString(),
      bots: [],
      symbols: {},
      connections: {},
      performance: {},
      errors: [],
      summary: {}
    };
  }

  async initialize() {
    console.log('🚀 Initializing Comprehensive Bot Validator...');
    
    // Create screenshot directory
    await fs.mkdir(CONFIG.screenshotDir, { recursive: true });
    
    // Launch browser with optimizations for screenshot capture
    this.browser = await puppeteer.launch({
      headless: false, // Keep visible for debugging
      defaultViewport: { width: 1920, height: 1080 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--disable-extensions'
      ]
    });
    
    this.page = await this.browser.newPage();
    
    // Enhanced console monitoring
    this.page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Multi-WebSocket]') || 
          text.includes('[LIVE CHART]') || 
          text.includes('Adding symbol connection') ||
          text.includes('Connected to') ||
          text.includes('Connection error')) {
        console.log(`📊 [Browser Console] ${text}`);
        
        // Track connection events
        if (text.includes('Adding symbol connection')) {
          const symbol = text.match(/Adding symbol connection: (\w+)/)?.[1];
          if (symbol) {
            if (!this.validationResults.connections[symbol]) {
              this.validationResults.connections[symbol] = [];
            }
            this.validationResults.connections[symbol].push({
              type: 'connection_attempt',
              timestamp: new Date().toISOString(),
              message: text
            });
          }
        }
      }
    });
    
    // Track errors
    this.page.on('pageerror', error => {
      console.error(`❌ [Page Error] ${error.message}`);
      this.validationResults.errors.push({
        type: 'page_error',
        timestamp: new Date().toISOString(),
        message: error.message,
        stack: error.stack
      });
    });
    
    console.log('✅ Browser initialized successfully');
  }

  async navigateToLivePaperTrading() {
    console.log('🌐 Navigating to Live Paper Trading...');
    
    await this.page.goto(CONFIG.url, { 
      waitUntil: 'networkidle0',
      timeout: CONFIG.timeout 
    });
    
    // Wait for React to load
    await this.page.waitForSelector('[data-testid="backtesting-page"]', { 
      timeout: CONFIG.timeout 
    });
    
    // Click on Paper Trading tab
    const paperTab = await this.page.waitForSelector(`[value="${CONFIG.paperId}"]`, { 
      timeout: CONFIG.timeout 
    });
    await paperTab.click();
    
    // Wait for paper trading content to load
    await this.page.waitForSelector('[data-testid="chart-container"]', { 
      timeout: CONFIG.timeout 
    });
    
    // Wait for initial data load
    await this.page.waitForTimeout(CONFIG.waitForChart);
    
    console.log('✅ Successfully navigated to Live Paper Trading');
  }

  async validateBotAPI() {
    console.log('🤖 Validating Bot API...');
    
    try {
      const response = await this.page.evaluate(async () => {
        const response = await fetch('http://localhost:3005/api/bots');
        return await response.json();
      });
      
      console.log(`📊 Found ${response.length} bots via API`);
      
      // Analyze bot distribution by symbol
      const symbolCounts = {};
      const statusCounts = {};
      
      response.forEach(bot => {
        symbolCounts[bot.symbol] = (symbolCounts[bot.symbol] || 0) + 1;
        statusCounts[bot.status] = (statusCounts[bot.status] || 0) + 1;
        
        this.validationResults.bots.push({
          bot_id: bot.bot_id,
          name: bot.name,
          symbol: bot.symbol,
          status: bot.status,
          current_capital: bot.current_capital,
          max_positions: bot.max_positions,
          created_at: bot.created_at,
          started_at: bot.started_at,
          stopped_at: bot.stopped_at
        });
      });
      
      console.log('📈 Bot Distribution by Symbol:', symbolCounts);
      console.log('📊 Bot Status Distribution:', statusCounts);
      
      this.validationResults.summary.botApiValidation = {
        totalBots: response.length,
        symbolDistribution: symbolCounts,
        statusDistribution: statusCounts,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('❌ Error validating Bot API:', error);
      this.validationResults.errors.push({
        type: 'bot_api_error',
        timestamp: new Date().toISOString(),
        message: error.message
      });
    }
  }

  async captureSymbolScreenshots() {
    console.log('📸 Capturing screenshots for each symbol...');
    
    for (const symbol of CONFIG.symbols) {
      console.log(`\n📊 Processing symbol: ${symbol}`);
      
      try {
        // Check if symbol tab exists
        const symbolTab = await this.page.$(`button:contains("${symbol}")`);
        
        if (!symbolTab) {
          console.log(`⚠️  Symbol tab for ${symbol} not found - may not have active bots`);
          continue;
        }
        
        // Click on symbol tab
        await this.page.evaluate((sym) => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const symbolButton = buttons.find(btn => btn.textContent.trim() === sym);
          if (symbolButton) {
            symbolButton.click();
          }
        }, symbol);
        
        // Wait for symbol data to load
        await this.page.waitForTimeout(CONFIG.waitForChart);
        
        // Validate chart presence
        const chartExists = await this.page.$('[data-testid="chart-container"]');
        const hasChartData = await this.page.evaluate(() => {
          const elements = document.querySelectorAll('canvas');
          return elements.length > 0;
        });
        
        // Capture screenshot of full trading space
        const screenshotPath = path.join(CONFIG.screenshotDir, `${symbol}-trading-space.png`);
        await this.page.screenshot({
          path: screenshotPath,
          fullPage: true,
          quality: 90
        });
        
        // Validate live price display
        const livePrice = await this.page.evaluate(() => {
          const priceElement = document.querySelector('.text-lg.font-mono.text-primary');
          return priceElement ? priceElement.textContent : null;
        });
        
        // Check WebSocket connection indicator
        const isConnected = await this.page.evaluate(() => {
          const badge = document.querySelector('.animate-pulse');
          return badge && badge.textContent.includes('LIVE DATA');
        });
        
        console.log(`✅ Screenshot captured: ${screenshotPath}`);
        console.log(`📊 Chart exists: ${!!chartExists}, Has data: ${hasChartData}`);
        console.log(`💰 Live price: ${livePrice || 'Not displayed'}`);
        console.log(`🔌 Connection status: ${isConnected ? 'Connected' : 'Disconnected'}`);
        
        // Store symbol validation results
        this.validationResults.symbols[symbol] = {
          screenshotPath,
          chartExists: !!chartExists,
          hasChartData,
          livePrice,
          isConnected,
          timestamp: new Date().toISOString()
        };
        
        // Capture options matrix for this symbol
        await this.captureOptionsMatrix(symbol);
        
      } catch (error) {
        console.error(`❌ Error processing symbol ${symbol}:`, error);
        this.validationResults.errors.push({
          type: 'symbol_processing_error',
          symbol,
          timestamp: new Date().toISOString(),
          message: error.message
        });
      }
    }
  }

  async captureOptionsMatrix(symbol) {
    console.log(`📋 Capturing options matrix for ${symbol}...`);
    
    try {
      // Scroll down to options matrix if not visible
      await this.page.evaluate(() => {
        const optionsSection = document.querySelector('h3:contains("Options Matrix")');
        if (optionsSection) {
          optionsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      
      await this.page.waitForTimeout(CONFIG.waitForOptions);
      
      // Check if options data is loaded
      const optionsData = await this.page.evaluate(() => {
        const optionsRows = document.querySelectorAll('table tbody tr');
        const data = [];
        
        optionsRows.forEach(row => {
          const cells = row.querySelectorAll('td');
          if (cells.length >= 7) { // Strike, Bid, Ask, Delta, Gamma, Theta, Vega
            data.push({
              strike: cells[0]?.textContent?.trim(),
              bid: cells[1]?.textContent?.trim(),
              ask: cells[2]?.textContent?.trim(),
              delta: cells[3]?.textContent?.trim(),
              gamma: cells[4]?.textContent?.trim(),
              theta: cells[5]?.textContent?.trim(),
              vega: cells[6]?.textContent?.trim()
            });
          }
        });
        
        return data;
      });
      
      // Capture options matrix screenshot
      const optionsScreenshotPath = path.join(CONFIG.screenshotDir, `${symbol}-options-matrix.png`);
      await this.page.screenshot({
        path: optionsScreenshotPath,
        fullPage: false,
        clip: await this.getOptionsMatrixClip()
      });
      
      // Validate options data quality
      const optionsValidation = this.validateOptionsData(optionsData);
      
      console.log(`📋 Options Matrix - Rows: ${optionsData.length}, Valid: ${optionsValidation.isValid}`);
      
      // Store in results
      if (!this.validationResults.symbols[symbol]) {
        this.validationResults.symbols[symbol] = {};
      }
      
      this.validationResults.symbols[symbol].optionsMatrix = {
        screenshotPath: optionsScreenshotPath,
        rowCount: optionsData.length,
        validation: optionsValidation,
        sampleData: optionsData.slice(0, 3), // Store sample for debugging
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error(`❌ Error capturing options matrix for ${symbol}:`, error);
      this.validationResults.errors.push({
        type: 'options_matrix_error',
        symbol,
        timestamp: new Date().toISOString(),
        message: error.message
      });
    }
  }

  async getOptionsMatrixClip() {
    // Try to get the bounding box of the options matrix table
    try {
      const clip = await this.page.evaluate(() => {
        const table = document.querySelector('table');
        if (table) {
          const rect = table.getBoundingClientRect();
          return {
            x: Math.max(0, rect.x - 20),
            y: Math.max(0, rect.y - 20),
            width: Math.min(window.innerWidth - rect.x + 40, rect.width + 40),
            height: Math.min(window.innerHeight - rect.y + 40, rect.height + 40)
          };
        }
        return null;
      });
      
      return clip;
    } catch (error) {
      console.log('⚠️ Could not get options matrix clip, using default');
      return null;
    }
  }

  validateOptionsData(optionsData) {
    const validation = {
      isValid: true,
      issues: [],
      metrics: {
        totalRows: optionsData.length,
        validRows: 0,
        invalidSpreads: 0,
        missingData: 0
      }
    };

    if (optionsData.length < CONFIG.optionsValidation.minStrikes) {
      validation.isValid = false;
      validation.issues.push(`Insufficient strikes: ${optionsData.length} < ${CONFIG.optionsValidation.minStrikes}`);
    }

    optionsData.forEach((row, index) => {
      let rowValid = true;

      // Check for missing data
      if (!row.strike || !row.bid || !row.ask || !row.delta) {
        validation.metrics.missingData++;
        rowValid = false;
      }

      // Check spread percentage
      if (row.bid && row.ask) {
        const bid = parseFloat(row.bid.replace(/[^0-9.-]/g, ''));
        const ask = parseFloat(row.ask.replace(/[^0-9.-]/g, ''));
        
        if (!isNaN(bid) && !isNaN(ask) && bid > 0) {
          const spreadPercent = ((ask - bid) / bid) * 100;
          if (spreadPercent > CONFIG.optionsValidation.maxSpreadPercent) {
            validation.metrics.invalidSpreads++;
            rowValid = false;
          }
        }
      }

      if (rowValid) {
        validation.metrics.validRows++;
      }
    });

    // Overall validation
    const validRowPercentage = (validation.metrics.validRows / optionsData.length) * 100;
    if (validRowPercentage < 80) {
      validation.isValid = false;
      validation.issues.push(`Low valid row percentage: ${validRowPercentage.toFixed(1)}%`);
    }

    return validation;
  }

  async monitorPerformance() {
    console.log('📊 Monitoring performance metrics...');
    
    const startTime = Date.now();
    
    // Monitor for 30 seconds
    const performanceInterval = setInterval(async () => {
      try {
        const metrics = await this.page.metrics();
        const memory = await this.page.evaluate(() => {
          const perf = performance;
          return {
            usedJSHeapSize: perf.memory?.usedJSHeapSize,
            totalJSHeapSize: perf.memory?.totalJSHeapSize,
            jsHeapSizeLimit: perf.memory?.jsHeapSizeLimit
          };
        });
        
        const connectionCount = await this.page.evaluate(() => {
          // Count WebSocket connections by checking console messages or connection state
          return Object.keys(window).filter(key => key.includes('websocket') || key.includes('ws')).length;
        });
        
        if (!this.validationResults.performance.samples) {
          this.validationResults.performance.samples = [];
        }
        
        this.validationResults.performance.samples.push({
          timestamp: new Date().toISOString(),
          metrics: {
            ...metrics,
            memory,
            connectionCount,
            elapsedTime: Date.now() - startTime
          }
        });
        
      } catch (error) {
        console.error('⚠️ Error collecting performance metrics:', error);
      }
    }, 5000);
    
    // Stop monitoring after 30 seconds
    setTimeout(() => {
      clearInterval(performanceInterval);
      this.calculatePerformanceSummary();
      console.log('✅ Performance monitoring complete');
    }, 30000);
    
    return new Promise(resolve => {
      setTimeout(resolve, 30000);
    });
  }

  calculatePerformanceSummary() {
    const samples = this.validationResults.performance.samples || [];
    if (samples.length === 0) return;

    const summary = {
      duration: 30000, // 30 seconds
      sampleCount: samples.length,
      memory: {
        peak: Math.max(...samples.map(s => s.metrics.memory?.usedJSHeapSize || 0)),
        average: samples.reduce((sum, s) => sum + (s.metrics.memory?.usedJSHeapSize || 0), 0) / samples.length,
        growth: (samples[samples.length - 1].metrics.memory?.usedJSHeapSize || 0) - (samples[0].metrics.memory?.usedJSHeapSize || 0)
      },
      connections: {
        average: samples.reduce((sum, s) => sum + (s.metrics.connectionCount || 0), 0) / samples.length,
        max: Math.max(...samples.map(s => s.metrics.connectionCount || 0))
      }
    };

    this.validationResults.performance.summary = summary;
    
    console.log('📊 Performance Summary:');
    console.log(`   Memory Peak: ${(summary.memory.peak / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   Memory Growth: ${(summary.memory.growth / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   Avg Connections: ${summary.connections.average.toFixed(1)}`);
  }

  async generateReport() {
    console.log('📄 Generating comprehensive validation report...');
    
    // Calculate summary statistics
    const summary = {
      totalBots: this.validationResults.bots.length,
      totalSymbols: Object.keys(this.validationResults.symbols).length,
      connectedSymbols: Object.values(this.validationResults.symbols).filter(s => s.isConnected).length,
      validOptionsMatrices: Object.values(this.validationResults.symbols).filter(s => s.optionsMatrix?.validation?.isValid).length,
      totalErrors: this.validationResults.errors.length,
      performanceIssues: this.identifyPerformanceIssues()
    };
    
    const report = {
      ...this.validationResults,
      summary: {
        ...this.validationResults.summary,
        ...summary,
        timestamp: new Date().toISOString(),
        validationDuration: Date.now() - new Date(this.validationResults.timestamp).getTime()
      }
    };
    
    // Save detailed report
    const reportPath = path.join(CONFIG.screenshotDir, 'validation-report.json');
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Generate human-readable summary
    const summaryPath = path.join(CONFIG.screenshotDir, 'validation-summary.md');
    const summaryContent = this.generateMarkdownSummary(report);
    await fs.writeFile(summaryPath, summaryContent);
    
    console.log(`✅ Validation complete! Reports saved:`);
    console.log(`   📊 Detailed: ${reportPath}`);
    console.log(`   📝 Summary: ${summaryPath}`);
    console.log(`   📁 Screenshots: ${CONFIG.screenshotDir}`);
    
    return report;
  }

  identifyPerformanceIssues() {
    const issues = [];
    const perf = this.validationResults.performance.summary;
    
    if (!perf) return issues;
    
    if (perf.memory.growth > 50 * 1024 * 1024) { // 50MB growth
      issues.push(`High memory growth: ${(perf.memory.growth / 1024 / 1024).toFixed(1)}MB`);
    }
    
    if (perf.memory.peak > 500 * 1024 * 1024) { // 500MB peak
      issues.push(`High memory usage: ${(perf.memory.peak / 1024 / 1024).toFixed(1)}MB`);
    }
    
    if (perf.connections.max > 10) {
      issues.push(`High connection count: ${perf.connections.max}`);
    }
    
    return issues;
  }

  generateMarkdownSummary(report) {
    return `# Live Paper Trading Bot Validation Report

Generated: ${new Date(report.timestamp).toLocaleString()}

## 🎯 Executive Summary

- **Total Bots**: ${report.summary.totalBots}
- **Active Symbols**: ${report.summary.totalSymbols}
- **Connected Symbols**: ${report.summary.connectedSymbols}/${report.summary.totalSymbols}
- **Valid Options Matrices**: ${report.summary.validOptionsMatrices}/${report.summary.totalSymbols}
- **Total Errors**: ${report.summary.totalErrors}

## 🤖 Bot Analysis

${report.bots.map(bot => `
### ${bot.name} (ID: ${bot.bot_id})
- **Symbol**: ${bot.symbol}
- **Status**: ${bot.status}
- **Capital**: $${bot.current_capital}
- **Max Positions**: ${bot.max_positions}
`).join('')}

## 📊 Symbol Validation

${Object.entries(report.symbols).map(([symbol, data]) => `
### ${symbol}
- **Chart**: ${data.chartExists ? '✅' : '❌'} ${data.hasChartData ? '(Has Data)' : '(No Data)'}
- **Live Price**: ${data.livePrice || 'Not Available'}
- **Connection**: ${data.isConnected ? '🟢 Connected' : '🔴 Disconnected'}
- **Options Matrix**: ${data.optionsMatrix?.validation?.isValid ? '✅' : '❌'} (${data.optionsMatrix?.rowCount || 0} rows)
- **Screenshots**: 
  - [Trading Space](${symbol}-trading-space.png)
  - [Options Matrix](${symbol}-options-matrix.png)
`).join('')}

## 🔌 Connection Analysis

${Object.entries(report.connections).map(([symbol, events]) => `
### ${symbol} WebSocket Events
- **Total Events**: ${events.length}
- **Connection Attempts**: ${events.filter(e => e.type === 'connection_attempt').length}
${events.length > 5 ? '- **⚠️ High Activity Detected**' : ''}
`).join('')}

## 📈 Performance Metrics

${report.performance.summary ? `
- **Memory Peak**: ${(report.performance.summary.memory.peak / 1024 / 1024).toFixed(1)}MB
- **Memory Growth**: ${(report.performance.summary.memory.growth / 1024 / 1024).toFixed(1)}MB
- **Avg Connections**: ${report.performance.summary.connections.average.toFixed(1)}
- **Performance Issues**: ${report.summary.performanceIssues.length}
${report.summary.performanceIssues.map(issue => `  - ${issue}`).join('\n')}
` : 'Performance monitoring not completed'}

## ❌ Issues Found

${report.errors.length > 0 ? report.errors.map((error, i) => `
${i + 1}. **${error.type}** (${new Date(error.timestamp).toLocaleTime()})
   ${error.message}
`).join('') : 'No critical errors detected ✅'}

## 🎯 Recommendations

${this.generateRecommendations(report).map((rec, i) => `${i + 1}. ${rec}`).join('\n')}

---
*Generated by Comprehensive Bot Validator v1.0*
`;
  }

  generateRecommendations(report) {
    const recommendations = [];
    
    if (report.summary.connectedSymbols < report.summary.totalSymbols) {
      recommendations.push('Fix WebSocket connections for disconnected symbols');
    }
    
    if (report.summary.validOptionsMatrices < report.summary.totalSymbols) {
      recommendations.push('Improve options data loading for incomplete matrices');
    }
    
    if (report.summary.performanceIssues.length > 0) {
      recommendations.push('Address performance issues to prevent memory leaks');
    }
    
    // Check for infinite connection loops
    const highActivitySymbols = Object.entries(report.connections).filter(([symbol, events]) => events.length > 10);
    if (highActivitySymbols.length > 0) {
      recommendations.push(`Fix infinite connection loops for: ${highActivitySymbols.map(([s]) => s).join(', ')}`);
    }
    
    if (report.bots.filter(b => b.status === 'running').length > 3) {
      recommendations.push('Implement 3-bot limit to prevent resource exhaustion');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('System appears to be functioning well - continue monitoring');
    }
    
    return recommendations;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
    console.log('🧹 Cleanup complete');
  }
}

// Main execution
async function main() {
  const validator = new BotValidator();
  
  try {
    await validator.initialize();
    await validator.navigateToLivePaperTrading();
    await validator.validateBotAPI();
    
    // Start performance monitoring in background
    const performanceMonitoring = validator.monitorPerformance();
    
    await validator.captureSymbolScreenshots();
    
    // Wait for performance monitoring to complete
    await performanceMonitoring;
    
    const report = await validator.generateReport();
    
    console.log('\n🎉 Validation Complete!');
    console.log(`📊 Processed ${report.summary.totalSymbols} symbols with ${report.summary.totalBots} bots`);
    console.log(`✅ Success rate: ${Math.round((1 - report.summary.totalErrors / Math.max(1, report.summary.totalSymbols)) * 100)}%`);
    
  } catch (error) {
    console.error('❌ Validation failed:', error);
    process.exit(1);
  } finally {
    await validator.cleanup();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { BotValidator, CONFIG };