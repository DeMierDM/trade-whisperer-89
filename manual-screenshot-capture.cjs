#!/usr/bin/env node

/**
 * Manual Screenshot Capture for Data Separation Validation
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function captureScreenshots() {
    const screenshotDir = path.join(__dirname, 'screenshots', 'manual-validation');
    await fs.mkdir(screenshotDir, { recursive: true });
    
    const browser = await puppeteer.launch({ 
        headless: false,
        defaultViewport: { width: 1920, height: 1080 }
    });
    
    const page = await browser.newPage();
    
    try {
        console.log('📍 Navigating to Live Paper Trading...');
        await page.goto('http://localhost:8080/backtesting', { waitUntil: 'networkidle2' });
        
        // Wait for page load
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Click Live Paper Trading tab
        const tabs = await page.$$('button');
        for (let tab of tabs) {
            const text = await page.evaluate(el => el.textContent, tab);
            if (text && text.includes('Live') && text.includes('Paper')) {
                await tab.click();
                break;
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 8000));
        
        // Take main screenshot
        const mainScreenshot = path.join(screenshotDir, 'live-paper-trading-main.png');
        await page.screenshot({ path: mainScreenshot, fullPage: true });
        console.log('📸 Main screenshot captured');
        
        // Try to click different symbol buttons and capture
        const symbols = ['SPY', 'QQQ', 'IWM'];
        
        for (const symbol of symbols) {
            console.log(`🎯 Attempting to capture ${symbol} view...`);
            
            const buttons = await page.$$('button');
            for (let button of buttons) {
                const text = await page.evaluate(el => el.textContent, button);
                if (text && text.trim() === symbol) {
                    await button.click();
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    const symbolScreenshot = path.join(screenshotDir, `${symbol.toLowerCase()}-view.png`);
                    await page.screenshot({ path: symbolScreenshot, fullPage: true });
                    console.log(`📸 ${symbol} view captured`);
                    break;
                }
            }
        }
        
        console.log('\n✅ Screenshots captured in:', screenshotDir);
        
    } catch (error) {
        console.error('❌ Screenshot capture failed:', error.message);
    } finally {
        await browser.close();
    }
}

captureScreenshots();