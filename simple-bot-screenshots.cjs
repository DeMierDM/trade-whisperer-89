#!/usr/bin/env node

/**
 * Simple Bot Screenshot Tool
 * Navigate to Live Paper Trading and capture screenshots
 */

const puppeteer = require('puppeteer');
const path = require('path');

async function captureBotScreenshots() {
  console.log('📸 Starting bot screenshot capture...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  
  // Monitor console for WebSocket activity
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Multi-WebSocket]') || text.includes('[LIVE CHART]') || text.includes('Adding symbol')) {
      console.log('📊', text);
    }
  });
  
  try {
    // Navigate to main page
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2', timeout: 15000 });
    
    console.log('🎯 Looking for Start Trading button...');
    
    // Click "Start Trading" button
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const startButton = buttons.find(btn => btn.textContent?.includes('Start Trading'));
      if (startButton) {
        startButton.click();
      }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Take screenshot of main trading interface
    await page.screenshot({ path: './main-trading-interface.png', fullPage: true });
    console.log('📸 Captured main trading interface');
    
    console.log('🔍 Looking for navigation elements...');
    
    // Look for Backtesting link or section
    const navigationLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a, button')).map(el => ({
        text: el.textContent?.trim(),
        href: el.href,
        role: el.getAttribute('role'),
        className: el.className
      })).filter(item => item.text && item.text.length < 100);
    });
    
    console.log('🧭 Found navigation elements:', navigationLinks.slice(0, 10));
    
    // Try to find and click on backtesting/paper trading
    const backTestingClicked = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a, button, [role="menuitem"]'));
      const backTestLink = links.find(link => 
        link.textContent?.toLowerCase().includes('backtest') ||
        link.textContent?.toLowerCase().includes('paper') ||
        link.textContent?.toLowerCase().includes('simulation')
      );
      
      if (backTestLink) {
        console.log('Found backtesting link:', backTestLink.textContent);
        backTestLink.click();
        return backTestLink.textContent;
      }
      return null;
    });
    
    if (backTestingClicked) {
      console.log('✅ Clicked on:', backTestingClicked);
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Look for Paper Trading tab
      const paperTabClicked = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('[role="tab"], button'));
        const paperTab = tabs.find(tab => 
          tab.textContent?.toLowerCase().includes('paper') ||
          tab.getAttribute('value') === 'paper'
        );
        
        if (paperTab) {
          console.log('Found paper tab:', paperTab.textContent);
          paperTab.click();
          return paperTab.textContent;
        }
        return null;
      });
      
      if (paperTabClicked) {
        console.log('✅ Clicked on Paper Trading tab');
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for data to load
        
        // Take screenshot of Live Paper Trading
        await page.screenshot({ path: './live-paper-trading.png', fullPage: true });
        console.log('📸 Captured Live Paper Trading interface');
        
        // Check for symbol tabs
        const symbols = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          return buttons.map(btn => btn.textContent?.trim()).filter(text => 
            text && ['SPY', 'QQQ', 'IWM'].includes(text)
          );
        });
        
        console.log('📊 Found symbol tabs:', symbols);
        
        // Capture each symbol
        for (const symbol of symbols) {
          console.log(`📸 Capturing ${symbol}...`);
          
          // Click on symbol tab
          await page.evaluate((sym) => {
            const buttons = Array.from(document.querySelectorAll('button'));
            const symbolBtn = buttons.find(btn => btn.textContent?.trim() === sym);
            if (symbolBtn) {
              symbolBtn.click();
            }
          }, symbol);
          
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // Take screenshot
          await page.screenshot({ 
            path: `./bot-${symbol}-screenshot.png`, 
            fullPage: true 
          });
          
          console.log(`✅ Captured ${symbol} screenshot`);
        }
        
        // Capture final overview
        await page.screenshot({ path: './final-overview.png', fullPage: true });
        console.log('📸 Captured final overview');
      }
    }
    
    console.log('✅ Screenshot capture complete!');
    
  } catch (error) {
    console.error('❌ Screenshot error:', error.message);
    
    // Take emergency screenshot to see current state
    await page.screenshot({ path: './error-state.png', fullPage: true });
    console.log('📸 Emergency screenshot saved: error-state.png');
  } finally {
    // Keep browser open for manual inspection
    console.log('🔍 Browser kept open for manual inspection...');
    console.log('Press Ctrl+C to close when done.');
    
    // Wait indefinitely until manually closed
    await new Promise(() => {});
  }
}

captureBotScreenshots().catch(console.error);