#!/usr/bin/env node
/**
 * Simple Screenshot Capture Tool for Live Paper Trading
 * Uses simple selectors and manual verification
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function captureScreenshots() {
    console.log('📸 Starting Live Paper Trading Screenshot Capture...');
    
    const screenshotDir = path.join(__dirname, 'screenshots');
    await fs.mkdir(screenshotDir, { recursive: true });
    
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: false,
            devtools: false,
            args: ['--window-size=1400,1000']
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1400, height: 1000 });
        
        console.log('🌐 Navigating to Backtesting page...');
        await page.goto('http://localhost:8081/backtesting', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        // Wait for page load
        await page.waitForTimeout(3000);
        
        // Take initial screenshot
        console.log('📸 Taking initial backtesting screenshot...');
        await page.screenshot({ 
            path: path.join(screenshotDir, '01-backtesting-initial.png'),
            fullPage: false
        });
        
        // Click Live Paper Trading tab
        console.log('📑 Clicking Live Paper Trading tab...');
        const paperTab = await page.$('[data-value="paper"], [value="paper"]');
        if (paperTab) {
            await paperTab.click();
        } else {
            // Try clicking by text
            await page.evaluate(() => {
                const tabs = Array.from(document.querySelectorAll('button'));
                const paperTab = tabs.find(tab => tab.textContent.includes('Paper Trading') || tab.textContent.includes('Live Paper'));
                if (paperTab) paperTab.click();
            });
        }
        
        await page.waitForTimeout(3000);
        
        // Take Live Paper Trading initial view
        console.log('📸 Taking Live Paper Trading initial view...');
        await page.screenshot({ 
            path: path.join(screenshotDir, '02-live-paper-trading-initial.png'),
            fullPage: true
        });
        
        // Try to click symbol tabs and capture each
        console.log('🔍 Looking for symbol tabs...');
        const symbols = ['SPY', 'QQQ', 'IWM'];
        
        for (let symbol of symbols) {
            try {
                console.log(`📌 Attempting to capture ${symbol}...`);
                
                // Try clicking symbol button
                await page.evaluate((sym) => {
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const symbolButton = buttons.find(btn => btn.textContent.includes(sym));
                    if (symbolButton) symbolButton.click();
                }, symbol);
                
                await page.waitForTimeout(2000);
                
                // Take screenshot for this symbol
                await page.screenshot({ 
                    path: path.join(screenshotDir, `03-${symbol.toLowerCase()}-view.png`),
                    fullPage: true
                });
                
                console.log(`📸 ${symbol} screenshot captured`);
                
            } catch (error) {
                console.log(`⚠️ Could not capture ${symbol}: ${error.message}`);
            }
        }
        
        // Try to load options data by clicking refresh buttons
        console.log('🔄 Attempting to load options data...');
        await page.evaluate(() => {
            const refreshButtons = Array.from(document.querySelectorAll('button'));
            const optionsRefresh = refreshButtons.find(btn => 
                btn.textContent.includes('Refresh') || btn.textContent.includes('🔄')
            );
            if (optionsRefresh) optionsRefresh.click();
        });
        
        await page.waitForTimeout(3000);
        
        // Take final comprehensive screenshot
        console.log('📸 Taking final comprehensive view...');
        await page.screenshot({ 
            path: path.join(screenshotDir, '04-final-comprehensive.png'),
            fullPage: true
        });
        
        // Capture connection status info
        const connectionInfo = await page.evaluate(() => {
            const debugDiv = document.querySelector('[data-testid="debug-text"]');
            return debugDiv ? debugDiv.textContent : 'Debug info not found';
        });
        
        console.log('📊 Connection Info:', connectionInfo);
        
        // Save connection info to file
        await fs.writeFile(
            path.join(screenshotDir, 'connection-info.txt'), 
            `Timestamp: ${new Date().toISOString()}\n\nConnection Info:\n${connectionInfo}\n`
        );
        
        console.log('\n✅ Screenshot capture completed!');
        console.log('📁 Screenshots saved to:', screenshotDir);
        console.log('📸 Files captured:');
        console.log('  - 01-backtesting-initial.png');
        console.log('  - 02-live-paper-trading-initial.png');
        console.log('  - 03-spy-view.png');
        console.log('  - 03-qqq-view.png');
        console.log('  - 03-iwm-view.png');
        console.log('  - 04-final-comprehensive.png');
        console.log('  - connection-info.txt');
        
    } catch (error) {
        console.error('❌ Screenshot capture failed:', error);
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

// Execute
captureScreenshots();