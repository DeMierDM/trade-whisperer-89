#!/usr/bin/env node
/**
 * Multi-Symbol WebSocket Validation Test
 * 
 * Validates that the Live Paper Trading tab properly:
 * 1. Connects to multiple symbol WebSockets simultaneously
 * 2. Maintains background connections for all bot symbols
 * 3. Updates live prices for each symbol independently
 * 4. Shows proper connection status for each symbol
 */

const puppeteer = require('puppeteer');

async function validateMultiSymbolWebSocket() {
    console.log('🧪 [Multi-Symbol WebSocket Validator] Starting comprehensive test...');
    
    let browser;
    try {
        // Launch browser and connect to Electron app
        browser = await puppeteer.launch({ 
            headless: false, 
            devtools: true,
            args: ['--disable-web-security', '--allow-running-insecure-content']
        });
        
        const page = await browser.newPage();
        
        // Listen to console logs to capture WebSocket events
        page.on('console', msg => {
            const text = msg.text();
            if (text.includes('[Multi-WebSocket]')) {
                console.log(`📡 WebSocket: ${text}`);
            }
        });
        
        console.log('🌐 Navigating to Electron app...');
        await page.goto('http://localhost:8081/backtesting');
        await page.waitForTimeout(3000);
        
        // Switch to Live Paper Trading tab
        console.log('📑 Switching to Live Paper Trading tab...');
        await page.click('[data-testid="paper-tab"]');
        await page.waitForTimeout(2000);
        
        // Check for connection status indicators
        console.log('🔍 Checking multi-symbol connection status...');
        const connectionStatus = await page.evaluate(() => {
            const statusDiv = document.querySelector('[data-testid="debug-text"]');
            return statusDiv ? statusDiv.textContent : null;
        });
        
        if (connectionStatus) {
            console.log('📊 Connection Status:', connectionStatus);
        }
        
        // Count symbol connection indicators
        const symbolConnections = await page.evaluate(() => {
            const connected = document.querySelectorAll('.bg-green-500\\/20').length;
            const disconnected = document.querySelectorAll('.bg-red-500\\/20').length;
            return { connected, disconnected, total: connected + disconnected };
        });
        
        console.log(`🔗 Symbol Connections: ${symbolConnections.connected} connected, ${symbolConnections.disconnected} disconnected, ${symbolConnections.total} total`);
        
        // Test symbol switching
        console.log('🔄 Testing symbol switching...');
        const symbolTabs = await page.$$('button:has-text("SPY"), button:has-text("QQQ"), button:has-text("IWM")');
        
        for (let i = 0; i < Math.min(symbolTabs.length, 3); i++) {
            const symbolText = await symbolTabs[i].textContent();
            console.log(`📌 Clicking symbol tab: ${symbolText}`);
            await symbolTabs[i].click();
            await page.waitForTimeout(1500);
            
            // Check if chart data loads
            const chartData = await page.evaluate(() => {
                const debugText = document.querySelector('[data-testid="debug-text"]');
                if (debugText) {
                    const match = debugText.textContent.match(/Bars: (\d+)/);
                    return match ? parseInt(match[1]) : 0;
                }
                return 0;
            });
            
            console.log(`📈 Chart data for ${symbolText}: ${chartData} bars`);
        }
        
        // Wait for WebSocket connections to establish
        console.log('⏳ Waiting for WebSocket connections to stabilize...');
        await page.waitForTimeout(5000);
        
        // Final validation
        const finalStatus = await page.evaluate(() => {
            const debugDiv = document.querySelector('[data-testid="debug-text"]');
            const connectedSymbols = document.querySelectorAll('.bg-green-500\\/20');
            const livePrices = {};
            
            connectedSymbols.forEach(el => {
                const text = el.textContent;
                const match = text.match(/([A-Z]+)\$(\d+\.\d+)/);
                if (match) {
                    livePrices[match[1]] = parseFloat(match[2]);
                }
            });
            
            return {
                debugText: debugDiv ? debugDiv.textContent : '',
                connectedCount: connectedSymbols.length,
                livePrices
            };
        });
        
        console.log('\n📋 Final Validation Results:');
        console.log('='.repeat(50));
        console.log(`✅ Connected Symbols: ${finalStatus.connectedCount}`);
        console.log(`📊 Live Prices:`, finalStatus.livePrices);
        console.log(`🔍 Debug Info: ${finalStatus.debugText}`);
        
        // Validation criteria
        const validationResults = {
            multipleConnections: finalStatus.connectedCount >= 2,
            livePricesReceived: Object.keys(finalStatus.livePrices).length >= 1,
            backgroundOperations: finalStatus.debugText.includes('Background Operations'),
            symbolSwitching: finalStatus.debugText.includes('Active Chart')
        };
        
        console.log('\n🎯 Validation Criteria:');
        console.log('='.repeat(50));
        Object.entries(validationResults).forEach(([test, passed]) => {
            console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASS' : 'FAIL'}`);
        });
        
        const allPassed = Object.values(validationResults).every(v => v);
        console.log(`\n🏆 Overall Result: ${allPassed ? '✅ PASS' : '❌ FAIL'}`);
        
        // Keep browser open for manual inspection
        console.log('\n🔍 Browser kept open for manual inspection. Close manually when done.');
        
        return validationResults;
        
    } catch (error) {
        console.error('❌ Test failed:', error);
        if (browser) {
            await browser.close();
        }
        throw error;
    }
}

// Execute if run directly
if (require.main === module) {
    validateMultiSymbolWebSocket()
        .then(results => {
            console.log('\n✅ Multi-Symbol WebSocket validation completed');
        })
        .catch(error => {
            console.error('\n❌ Multi-Symbol WebSocket validation failed:', error);
            process.exit(1);
        });
}

module.exports = { validateMultiSymbolWebSocket };