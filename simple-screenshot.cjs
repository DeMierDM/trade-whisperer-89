#!/usr/bin/env node

/**
 * Simple screenshot capture for Live Paper Trading validation
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function captureScreenshot() {
    const screenshotDir = path.join(__dirname, 'screenshots');
    await fs.mkdir(screenshotDir, { recursive: true });
    
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    try {
        console.log('🌐 Navigating to Live Paper Trading...');
        await page.goto('http://localhost:8080/backtesting', { waitUntil: 'networkidle2' });
        
        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Take initial screenshot
        await page.screenshot({ 
            path: path.join(screenshotDir, 'backtesting-page.png'),
            fullPage: true 
        });
        console.log('📸 Captured backtesting page');
        
        // Click Live Paper Trading tab
        try {
            await page.click('[data-testid="live-paper-trading-tab"], button:has-text("Live Paper Trading")');
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await page.screenshot({ 
                path: path.join(screenshotDir, 'live-paper-trading-tab.png'),
                fullPage: true 
            });
            console.log('📸 Captured Live Paper Trading tab');
            
        } catch (error) {
            console.log('ℹ️ Live Paper Trading tab not found, capturing current state');
        }
        
        console.log('✅ Screenshots saved to screenshots/ directory');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await browser.close();
    }
}

captureScreenshot();