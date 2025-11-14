#!/usr/bin/env node
/**
 * Live Paper Trading Screenshot Validator
 * 
 * Comprehensive testing and screenshot capture for:
 * 1. Multi-symbol bot chart switching (SPY, QQQ, IWM)
 * 2. Stock data display and live prices
 * 3. Options matrix functionality
 * 4. Background bot operations
 * 5. Screenshot capture of each working bot
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class LivePaperTradingValidator {
    constructor() {
        this.screenshotDir = path.join(__dirname, 'screenshots', 'live-paper-trading');
        this.browser = null;
        this.page = null;
        this.results = {
            multiSymbolSwitching: false,
            stockDataDisplay: false,
            optionsMatrix: false,
            backgroundOperations: false,
            screenshots: [],
            errors: []
        };
    }

    async init() {
        console.log('🧪 [Live Paper Trading Validator] Initializing...');
        
        // Create screenshots directory
        try {
            await fs.mkdir(this.screenshotDir, { recursive: true });
        } catch (error) {
            console.log('Directory already exists or created');
        }

        // Launch browser
        this.browser = await puppeteer.launch({ 
            headless: false, 
            devtools: true,
            args: [
                '--disable-web-security', 
                '--allow-running-insecure-content',
                '--window-size=1920,1080'
            ]
        });
        
        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1920, height: 1080 });
        
        // Listen to console logs for WebSocket events
        this.page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[Multi-WebSocket]') || text.includes('[Live Paper Trading]')) {
                console.log(`📡 WebSocket Event: ${text}`);
            }
        });
    }

    async navigateToLivePaperTrading() {
        console.log('🌐 Navigating to Live Paper Trading...');
        
        await this.page.goto('http://localhost:8080/backtesting', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // Wait for page to load
        await this.page.waitForTimeout(3000);
        
        // Click on Live Paper Trading tab
        console.log('📑 Switching to Live Paper Trading tab...');
        await this.page.click('[value="paper"]');
        await this.page.waitForTimeout(2000);
        
        // Take initial screenshot
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const screenshotPath = path.join(this.screenshotDir, `01-initial-${timestamp}.png`);
        await this.page.screenshot({ 
            path: screenshotPath,
            fullPage: true 
        });
        
        this.results.screenshots.push({
            name: 'Initial Live Paper Trading View',
            path: screenshotPath,
            description: 'Initial state of Live Paper Trading tab'
        });
        
        console.log(`📸 Initial screenshot saved: ${screenshotPath}`);
    }

    async validateMultiSymbolSwitching() {
        console.log('🔄 Testing multi-symbol chart switching...');
        
        try {
            // Find symbol tabs
            const symbolTabs = await this.page.$$('button:has-text("SPY"), button:has-text("QQQ"), button:has-text("IWM")');
            
            if (symbolTabs.length === 0) {
                // Alternative selector for symbol buttons
                const buttons = await this.page.$$('button');
                const symbolButtons = [];
                
                for (let button of buttons) {
                    const text = await button.textContent();
                    if (text && (text.includes('SPY') || text.includes('QQQ') || text.includes('IWM'))) {
                        symbolButtons.push(button);
                    }
                }
                
                if (symbolButtons.length === 0) {
                    throw new Error('No symbol tabs found');
                }
                
                console.log(`Found ${symbolButtons.length} symbol buttons via alternative method`);
                
                // Test each symbol
                for (let i = 0; i < Math.min(symbolButtons.length, 3); i++) {
                    const button = symbolButtons[i];
                    const text = await button.textContent();
                    const symbol = text.match(/[A-Z]{3}/)?.[0] || 'UNKNOWN';
                    
                    console.log(`📌 Testing symbol: ${symbol}`);
                    await button.click();
                    await this.page.waitForTimeout(2000);
                    
                    // Take screenshot
                    const screenshotPath = path.join(this.screenshotDir, `02-symbol-${symbol}-${Date.now()}.png`);
                    await this.page.screenshot({ 
                        path: screenshotPath,
                        fullPage: true 
                    });
                    
                    this.results.screenshots.push({
                        name: `${symbol} Symbol View`,
                        path: screenshotPath,
                        description: `Chart and data for ${symbol} symbol`
                    });
                    
                    console.log(`📸 ${symbol} screenshot saved: ${screenshotPath}`);
                }
                
                this.results.multiSymbolSwitching = true;
            } else {
                console.log(`Found ${symbolTabs.length} symbol tabs via direct selection`);
                // Original method worked
                this.results.multiSymbolSwitching = true;
            }
            
        } catch (error) {
            console.error('❌ Error in multi-symbol switching:', error);
            this.results.errors.push(`Multi-symbol switching: ${error.message}`);
        }
    }

    async validateStockDataDisplay() {
        console.log('📊 Validating stock data display...');
        
        try {
            // Check for debug info that shows stock data
            const debugText = await this.page.$('[data-testid="debug-text"]');
            
            if (debugText) {
                const text = await debugText.textContent();
                console.log('📋 Debug Info:', text);
                
                // Check if bars data is present
                const barsMatch = text.match(/Bars: (\d+)/);
                if (barsMatch && parseInt(barsMatch[1]) > 0) {
                    console.log(`✅ Stock data found: ${barsMatch[1]} bars`);
                    this.results.stockDataDisplay = true;
                } else {
                    console.log('⚠️  No bars data found in debug info');
                }
            }
            
            // Check for live prices
            const livePricesInfo = await this.page.evaluate(() => {
                const debugEl = document.querySelector('[data-testid="debug-text"]');
                if (debugEl && debugEl.textContent.includes('Live Prices:')) {
                    return debugEl.textContent;
                }
                return null;
            });
            
            if (livePricesInfo && livePricesInfo.includes('$')) {
                console.log('✅ Live prices detected');
                this.results.stockDataDisplay = true;
            }
            
        } catch (error) {
            console.error('❌ Error validating stock data:', error);
            this.results.errors.push(`Stock data validation: ${error.message}`);
        }
    }

    async validateOptionsMatrix() {
        console.log('📈 Validating options matrix functionality...');
        
        try {
            // Look for options matrix section
            const optionsMatrix = await this.page.$('h2:has-text("Options Matrix")');
            
            if (optionsMatrix) {
                console.log('✅ Options Matrix section found');
                
                // Click refresh button to load options data
                const refreshButton = await this.page.$('button:has-text("🔄 Refresh")');
                if (refreshButton) {
                    console.log('🔄 Clicking options refresh...');
                    await refreshButton.click();
                    await this.page.waitForTimeout(3000);
                }
                
                // Check for options chain data
                const optionsData = await this.page.evaluate(() => {
                    const strikes = document.querySelectorAll('span:contains("$")');
                    const bids = document.querySelectorAll('span:contains("Bid")');
                    return {
                        strikeCount: strikes.length,
                        hasHeaders: bids.length > 0
                    };
                });
                
                if (optionsData.strikeCount > 0 || optionsData.hasHeaders) {
                    console.log('✅ Options data structure detected');
                    this.results.optionsMatrix = true;
                }
                
                // Take screenshot of options matrix
                const screenshotPath = path.join(this.screenshotDir, `03-options-matrix-${Date.now()}.png`);
                await this.page.screenshot({ 
                    path: screenshotPath,
                    fullPage: true 
                });
                
                this.results.screenshots.push({
                    name: 'Options Matrix View',
                    path: screenshotPath,
                    description: 'Options chain with strikes, bid/ask, and Greeks'
                });
                
            } else {
                console.log('⚠️  Options Matrix section not found');
            }
            
        } catch (error) {
            console.error('❌ Error validating options matrix:', error);
            this.results.errors.push(`Options matrix validation: ${error.message}`);
        }
    }

    async validateBackgroundOperations() {
        console.log('🔄 Validating background operations...');
        
        try {
            // Check WebSocket connection status
            const connectionStatus = await this.page.evaluate(() => {
                const statusElements = document.querySelectorAll('.bg-green-500\\/20, .bg-red-500\\/20');
                const connected = document.querySelectorAll('.bg-green-500\\/20').length;
                const disconnected = document.querySelectorAll('.bg-red-500\\/20').length;
                
                return {
                    total: statusElements.length,
                    connected,
                    disconnected
                };
            });
            
            console.log(`📊 Connection Status: ${connectionStatus.connected} connected, ${connectionStatus.disconnected} disconnected`);
            
            if (connectionStatus.connected > 0) {
                console.log('✅ Background operations active');
                this.results.backgroundOperations = true;
            }
            
            // Take final comprehensive screenshot
            const screenshotPath = path.join(this.screenshotDir, `04-final-validation-${Date.now()}.png`);
            await this.page.screenshot({ 
                path: screenshotPath,
                fullPage: true 
            });
            
            this.results.screenshots.push({
                name: 'Final Validation View',
                path: screenshotPath,
                description: 'Complete view with all features active'
            });
            
        } catch (error) {
            console.error('❌ Error validating background operations:', error);
            this.results.errors.push(`Background operations validation: ${error.message}`);
        }
    }

    async generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                multiSymbolSwitching: this.results.multiSymbolSwitching ? 'PASS' : 'FAIL',
                stockDataDisplay: this.results.stockDataDisplay ? 'PASS' : 'FAIL',
                optionsMatrix: this.results.optionsMatrix ? 'PASS' : 'FAIL',
                backgroundOperations: this.results.backgroundOperations ? 'PASS' : 'FAIL'
            },
            screenshots: this.results.screenshots,
            errors: this.results.errors
        };
        
        const reportPath = path.join(this.screenshotDir, 'validation-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log('\n📋 Validation Results:');
        console.log('='.repeat(50));
        console.log(`✅ Multi-Symbol Switching: ${report.summary.multiSymbolSwitching}`);
        console.log(`✅ Stock Data Display: ${report.summary.stockDataDisplay}`);
        console.log(`✅ Options Matrix: ${report.summary.optionsMatrix}`);
        console.log(`✅ Background Operations: ${report.summary.backgroundOperations}`);
        console.log(`📸 Screenshots Captured: ${report.screenshots.length}`);
        console.log(`❌ Errors Found: ${report.errors.length}`);
        
        if (report.errors.length > 0) {
            console.log('\n🚨 Errors:');
            report.errors.forEach(error => console.log(`  - ${error}`));
        }
        
        console.log(`\n📄 Full report saved: ${reportPath}`);
        console.log(`📁 Screenshots directory: ${this.screenshotDir}`);
        
        return report;
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }

    async run() {
        try {
            await this.init();
            await this.navigateToLivePaperTrading();
            await this.validateMultiSymbolSwitching();
            await this.validateStockDataDisplay();
            await this.validateOptionsMatrix();
            await this.validateBackgroundOperations();
            
            const report = await this.generateReport();
            
            const allPassed = Object.values(report.summary).every(result => result === 'PASS');
            console.log(`\n🏆 Overall Result: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
            
            return report;
            
        } catch (error) {
            console.error('❌ Validation failed:', error);
            throw error;
        } finally {
            await this.cleanup();
        }
    }
}

// Execute if run directly
if (require.main === module) {
    const validator = new LivePaperTradingValidator();
    validator.run()
        .then(report => {
            console.log('\n✅ Live Paper Trading validation completed');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Live Paper Trading validation failed:', error);
            process.exit(1);
        });
}

module.exports = LivePaperTradingValidator;