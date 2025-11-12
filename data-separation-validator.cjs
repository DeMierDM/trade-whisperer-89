#!/usr/bin/env node

/**
 * Critical Data Separation Validator
 * 
 * This tool will verify that each bot receives its own symbol data
 * and that switching between bots shows different chart bars.
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

class DataSeparationValidator {
    constructor() {
        this.screenshotDir = path.join(__dirname, 'screenshots', 'data-separation-test');
        this.browser = null;
        this.page = null;
        this.results = {
            symbolSwitching: false,
            chartDataSeparation: false,
            barCountDifferences: {},
            screenshots: []
        };
    }

    async init() {
        await fs.mkdir(this.screenshotDir, { recursive: true });
        
        this.browser = await puppeteer.launch({ 
            headless: false,
            defaultViewport: { width: 1920, height: 1080 },
            devtools: false
        });
        
        this.page = await this.browser.newPage();
        
        // Monitor console for chart data messages
        this.page.on('console', msg => {
            const text = msg.text();
            if (text.includes('LIVE CHART') && text.includes('bars')) {
                console.log('CHART DATA:', text);
                
                // Extract symbol and bar count
                const symbolMatch = text.match(/symbol:\s*(\w+)/);
                const barsMatch = text.match(/(\d+)\s+bars/);
                
                if (symbolMatch && barsMatch) {
                    const symbol = symbolMatch[1];
                    const barCount = parseInt(barsMatch[1]);
                    this.results.barCountDifferences[symbol] = barCount;
                    console.log(`📊 ${symbol}: ${barCount} bars detected`);
                }
            }
        });
    }

    async validateDataSeparation() {
        console.log('🔍 Starting Critical Data Separation Validation...\n');
        
        try {
            // Navigate to Live Paper Trading
            console.log('📍 Navigating to Live Paper Trading...');
            await this.page.goto('http://localhost:8080/backtesting', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Wait for React to load
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Click Live Paper Trading tab
            console.log('🎯 Clicking Live Paper Trading tab...');
            try {
                await this.page.waitForSelector('button', { timeout: 5000 });
                const tabs = await this.page.$$('button');
                
                for (let tab of tabs) {
                    const text = await this.page.evaluate(el => el.textContent, tab);
                    if (text && text.toLowerCase().includes('live') && text.toLowerCase().includes('paper')) {
                        await tab.click();
                        console.log('✅ Found and clicked Live Paper Trading tab');
                        break;
                    }
                }
            } catch (error) {
                console.log('❌ Could not find Live Paper Trading tab');
                return false;
            }
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            // Take initial screenshot
            const initialScreenshot = path.join(this.screenshotDir, '01-initial-state.png');
            await this.page.screenshot({ path: initialScreenshot, fullPage: true });
            this.results.screenshots.push('01-initial-state.png');
            console.log('📸 Captured initial state');
            
            // Test symbol switching and data separation
            const symbols = ['SPY', 'QQQ', 'IWM'];
            let previousBarCount = null;
            
            for (let i = 0; i < symbols.length; i++) {
                const symbol = symbols[i];
                console.log(`\n🔄 Testing ${symbol} data separation...`);
                
                // Clear previous bar count tracking
                this.results.barCountDifferences = {};
                
                // Look for symbol buttons/tabs
                try {
                    // Try to find buttons with symbol text
                    const buttons = await this.page.$$('button');
                    let symbolFound = false;
                    
                    for (let button of buttons) {
                        const text = await this.page.evaluate(el => el.textContent, button);
                        if (text && text.trim() === symbol) {
                            console.log(`📍 Found ${symbol} button, clicking...`);
                            await button.click();
                            symbolFound = true;
                            
                            // Wait for chart to update
                            await new Promise(resolve => setTimeout(resolve, 4000));
                            break;
                        }
                    }
                    
                    if (!symbolFound) {
                        // Try clicking on bot cards that might contain the symbol
                        const cards = await this.page.$$('div[class*="cursor-pointer"]');
                        for (let card of cards) {
                            const text = await this.page.evaluate(el => el.textContent, card);
                            if (text && text.includes(symbol)) {
                                console.log(`📍 Found ${symbol} card, clicking...`);
                                await card.click();
                                await new Promise(resolve => setTimeout(resolve, 4000));
                                symbolFound = true;
                                break;
                            }
                        }
                    }
                    
                    if (!symbolFound) {
                        console.log(`⚠️  Could not find clickable element for ${symbol}`);
                        continue;
                    }
                    
                } catch (error) {
                    console.log(`❌ Error clicking ${symbol}:`, error.message);
                    continue;
                }
                
                // Take screenshot after symbol switch
                const symbolScreenshot = path.join(this.screenshotDir, `0${i+2}-${symbol.toLowerCase()}-active.png`);
                await this.page.screenshot({ path: symbolScreenshot, fullPage: true });
                this.results.screenshots.push(`0${i+2}-${symbol.toLowerCase()}-active.png`);
                console.log(`📸 Captured ${symbol} state`);
                
                // Check chart title and active symbol display
                try {
                    const chartTitles = await this.page.$$eval('h3', els => 
                        els.map(el => el.textContent).filter(text => text && ['SPY', 'QQQ', 'IWM'].some(s => text.includes(s)))
                    );
                    
                    console.log(`📋 Chart titles found: ${chartTitles.join(', ')}`);
                    
                    // Verify chart title matches the selected symbol
                    const correctTitle = chartTitles.some(title => title.includes(symbol));
                    if (correctTitle) {
                        console.log(`✅ Chart title correctly shows ${symbol}`);
                        this.results.symbolSwitching = true;
                    } else {
                        console.log(`❌ Chart title does NOT show ${symbol} (found: ${chartTitles})`);
                        this.results.symbolSwitching = false;
                    }
                    
                } catch (error) {
                    console.log(`❌ Could not verify chart title for ${symbol}`);
                }
                
                // Wait for any console messages about bar counts
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Check if bar count is different from previous symbol
                const currentBarCount = this.results.barCountDifferences[symbol];
                if (currentBarCount && previousBarCount && currentBarCount !== previousBarCount) {
                    console.log(`✅ Bar count differs: ${symbol} has ${currentBarCount} vs previous ${previousBarCount}`);
                    this.results.chartDataSeparation = true;
                } else if (currentBarCount) {
                    console.log(`📊 ${symbol}: ${currentBarCount} bars (${previousBarCount ? 'same as previous' : 'first symbol'})`);
                }
                
                previousBarCount = currentBarCount;
            }
            
            // Generate validation report
            await this.generateReport();
            
        } catch (error) {
            console.error('❌ Critical validation error:', error.message);
            
            // Take error screenshot
            try {
                const errorScreenshot = path.join(this.screenshotDir, 'error-state.png');
                await this.page.screenshot({ path: errorScreenshot, fullPage: true });
                console.log('📸 Captured error state screenshot');
            } catch (screenshotError) {
                console.error('Failed to capture error screenshot');
            }
            
            return false;
        }
        
        return this.results.symbolSwitching && this.results.chartDataSeparation;
    }
    
    async generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            results: this.results,
            summary: {
                symbolSwitchingWorks: this.results.symbolSwitching,
                chartDataSeparated: this.results.chartDataSeparation,
                barCounts: this.results.barCountDifferences,
                screenshotsCaptured: this.results.screenshots.length
            },
            recommendations: []
        };
        
        // Add recommendations based on findings
        if (!this.results.symbolSwitching) {
            report.recommendations.push('CRITICAL: Chart titles not updating when switching symbols - investigate activeChartSymbol state management');
        }
        
        if (!this.results.chartDataSeparation) {
            report.recommendations.push('CRITICAL: Chart data not separated by symbol - all bots may be receiving same data');
        }
        
        // Check for identical bar counts (indicates data contamination)
        const barCounts = Object.values(this.results.barCountDifferences);
        const uniqueBarCounts = [...new Set(barCounts)];
        
        if (barCounts.length > 1 && uniqueBarCounts.length === 1) {
            report.recommendations.push(`WARNING: All symbols have identical bar counts (${uniqueBarCounts[0]}) - possible data contamination`);
        }
        
        // Save detailed report
        const reportPath = path.join(this.screenshotDir, 'data-separation-report.json');
        await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
        
        console.log('\n📋 VALIDATION REPORT SUMMARY:');
        console.log('================================');
        console.log(`Symbol Switching Works: ${report.summary.symbolSwitchingWorks ? '✅ YES' : '❌ NO'}`);
        console.log(`Chart Data Separated: ${report.summary.chartDataSeparated ? '✅ YES' : '❌ NO'}`);
        console.log(`Bar Counts:`, report.summary.barCounts);
        console.log(`Screenshots: ${report.summary.screenshotsCaptured} captured`);
        
        if (report.recommendations.length > 0) {
            console.log('\n🚨 CRITICAL ISSUES:');
            report.recommendations.forEach((rec, i) => {
                console.log(`${i + 1}. ${rec}`);
            });
        }
        
        console.log(`\n📂 Full report saved to: ${reportPath}`);
    }
    
    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

async function runDataSeparationValidation() {
    const validator = new DataSeparationValidator();
    
    try {
        await validator.init();
        const success = await validator.validateDataSeparation();
        
        console.log(`\n🎯 OVERALL RESULT: ${success ? '✅ PASSED' : '❌ FAILED'}`);
        
        return success;
        
    } catch (error) {
        console.error('❌ Validation failed:', error.message);
        return false;
    } finally {
        await validator.cleanup();
    }
}

// Run validation
runDataSeparationValidation();