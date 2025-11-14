#!/usr/bin/env node

/**
 * Enhanced screenshot capture for Live Paper Trading validation on port 8080
 */

const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');

async function captureEnhancedScreenshots() {
    const screenshotDir = path.join(__dirname, 'screenshots', 'live-paper-validation');
    await fs.mkdir(screenshotDir, { recursive: true });
    
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    try {
        console.log('🌐 Navigating to Backtesting page on port 8080...');
        await page.goto('http://localhost:8080/backtesting', { 
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        // Wait for page to fully load
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Take initial screenshot of backtesting page
        await page.screenshot({ 
            path: path.join(screenshotDir, '01-backtesting-page-loaded.png'),
            fullPage: true 
        });
        console.log('📸 Captured initial backtesting page');
        
        // Look for and click Live Paper Trading tab
        const tabSelectors = [
            'button:has-text("Live Paper Trading")',
            '[data-testid="live-paper-trading-tab"]',
            'button[role="tab"]:has-text("Live Paper Trading")',
            '.tab-button:has-text("Live Paper Trading")',
            'button:contains("Live Paper Trading")',
            '.MuiTab-root:has-text("Live Paper Trading")'
        ];
        
        let tabFound = false;
        for (const selector of tabSelectors) {
            try {
                await page.waitForSelector(selector, { timeout: 2000 });
                await page.click(selector);
                console.log(`✅ Found and clicked Live Paper Trading tab with selector: ${selector}`);
                tabFound = true;
                break;
            } catch (error) {
                console.log(`❌ Tab selector failed: ${selector}`);
            }
        }
        
        if (!tabFound) {
            console.log('⚠️ Trying to find tabs by text content...');
            // Get all buttons and check their text
            const buttons = await page.$$('button');
            for (let button of buttons) {
                const text = await page.evaluate(el => el.textContent, button);
                if (text && text.toLowerCase().includes('live') && text.toLowerCase().includes('paper')) {
                    await button.click();
                    console.log(`✅ Found Live Paper Trading tab by text: "${text}"`);
                    tabFound = true;
                    break;
                }
            }
        }
        
        if (tabFound) {
            // Wait for tab content to load
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            await page.screenshot({ 
                path: path.join(screenshotDir, '02-live-paper-trading-tab.png'),
                fullPage: true 
            });
            console.log('📸 Captured Live Paper Trading tab');
            
            // Look for multi-symbol indicators
            const symbolSelectors = [
                'button:has-text("SPY")',
                'button:has-text("QQQ")', 
                'button:has-text("IWM")',
                '.symbol-tab',
                '.bot-selector'
            ];
            
            console.log('🔍 Looking for symbol switching controls...');
            for (const selector of symbolSelectors) {
                try {
                    const elements = await page.$$(selector);
                    if (elements.length > 0) {
                        console.log(`✅ Found ${elements.length} elements matching: ${selector}`);
                        
                        // Click first symbol to test switching
                        await elements[0].click();
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        
                        await page.screenshot({ 
                            path: path.join(screenshotDir, `03-symbol-${selector.replace(/[^a-zA-Z]/g, '')}.png`),
                            fullPage: true 
                        });
                        console.log(`📸 Captured symbol switching for ${selector}`);
                        break;
                    }
                } catch (error) {
                    console.log(`❌ Symbol selector failed: ${selector}`);
                }
            }
            
        } else {
            console.log('⚠️ Live Paper Trading tab not found, capturing available tabs...');
            
            // Find all tabs/buttons to see what's available
            const allButtons = await page.$$('button');
            console.log(`Found ${allButtons.length} buttons on page`);
            
            for (let i = 0; i < Math.min(allButtons.length, 20); i++) {
                const text = await page.evaluate(el => el.textContent, allButtons[i]);
                console.log(`Button ${i}: "${text}"`);
            }
        }
        
        // Take final screenshot
        await page.screenshot({ 
            path: path.join(screenshotDir, '04-final-state.png'),
            fullPage: true 
        });
        console.log('📸 Captured final state');
        
        // Check for options matrix elements
        console.log('🔍 Looking for options matrix...');
        const optionsSelectors = [
            '.options-matrix',
            '.options-chain', 
            '.strike-price',
            '[data-testid="options-matrix"]',
            '.options-table'
        ];
        
        for (const selector of optionsSelectors) {
            try {
                const elements = await page.$$(selector);
                if (elements.length > 0) {
                    console.log(`✅ Found options matrix elements: ${selector} (${elements.length} elements)`);
                }
            } catch (error) {
                console.log(`❌ Options selector failed: ${selector}`);
            }
        }
        
        console.log('\n✅ Enhanced validation complete!');
        console.log(`📂 Screenshots saved to: ${screenshotDir}`);
        
    } catch (error) {
        console.error('❌ Error during validation:', error.message);
        
        // Take error screenshot
        try {
            await page.screenshot({ 
                path: path.join(screenshotDir, 'error-state.png'),
                fullPage: true 
            });
            console.log('📸 Captured error state screenshot');
        } catch (screenshotError) {
            console.error('Failed to capture error screenshot:', screenshotError.message);
        }
    } finally {
        await browser.close();
    }
}

captureEnhancedScreenshots();