#!/usr/bin/env node

const puppeteer = require('puppeteer');
const path = require('path');

async function debugBacktestingPage() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1200, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Enable console logging
    page.on('console', msg => {
      console.log(`[CONSOLE ${msg.type()}]:`, msg.text());
    });
    
    // Enable error logging
    page.on('pageerror', error => {
      console.error('❌ [PAGE ERROR]:', error.message);
    });
    
    // Enable failed requests logging
    page.on('requestfailed', request => {
      console.error('❌ [REQUEST FAILED]:', request.url(), request.failure().errorText);
    });

    console.log('🌐 Navigating to frontend...');
    await page.goto('http://localhost:8080', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });

    console.log('✅ Frontend loaded');
    
    // Wait for React to load
    await page.waitForSelector('body', { timeout: 10000 });
    
    // Check if we can find navigation elements
    const navElements = await page.evaluate(() => {
      // Look for common navigation patterns
      const links = Array.from(document.querySelectorAll('a, button, [role="button"]'));
      return links.map(el => ({
        text: el.textContent.trim(),
        href: el.href || '',
        className: el.className,
        tagName: el.tagName
      })).filter(el => el.text.toLowerCase().includes('backtest'));
    });
    
    console.log('📊 Found navigation elements:', navElements);
    
    if (navElements.length > 0) {
      console.log('🎯 Attempting to click backtesting link...');
      
      // Try to click the backtesting link
      const clicked = await page.evaluate(() => {
        const backTestLinks = Array.from(document.querySelectorAll('a, button, [role="button"]'))
          .filter(el => el.textContent.toLowerCase().includes('backtest'));
        
        if (backTestLinks.length > 0) {
          backTestLinks[0].click();
          return true;
        }
        return false;
      });
      
      if (clicked) {
        console.log('✅ Clicked backtesting link');
        
        // Wait for navigation
        await page.waitForTimeout(2000);
        
        // Check current URL
        const currentUrl = page.url();
        console.log('📍 Current URL:', currentUrl);
        
        // Check if page content loaded
        const pageContent = await page.evaluate(() => {
          return {
            bodyChildren: document.body.children.length,
            hasContent: document.body.textContent.trim().length > 100,
            title: document.title,
            bodyText: document.body.textContent.trim().substring(0, 200)
          };
        });
        
        console.log('📄 Page content analysis:', pageContent);
        
        if (pageContent.hasContent) {
          console.log('✅ Page has content');
        } else {
          console.log('❌ Page appears to be blank or has minimal content');
        }
        
      } else {
        console.log('❌ Could not find or click backtesting link');
      }
    } else {
      console.log('❌ No backtesting navigation elements found');
    }
    
    // Take a screenshot for debugging
    await page.screenshot({ 
      path: 'backtesting-debug.png',
      fullPage: true 
    });
    console.log('📸 Screenshot saved as backtesting-debug.png');
    
    // Keep browser open for manual inspection
    console.log('🔍 Browser kept open for manual inspection. Close manually when done.');
    await page.waitForTimeout(60000); // Wait 1 minute before closing
    
  } catch (error) {
    console.error('❌ Error during debugging:', error);
  } finally {
    await browser.close();
  }
}

// Check if frontend is running
const http = require('http');
const checkServer = () => {
  return new Promise((resolve) => {
    const req = http.get('http://localhost:8080', (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve(false);
    });
  });
};

checkServer().then(isRunning => {
  if (isRunning) {
    console.log('✅ Frontend server is running on http://localhost:8080');
    debugBacktestingPage();
  } else {
    console.log('❌ Frontend server is not running on http://localhost:8080');
    console.log('💡 Please start the frontend server first with: docker-compose up frontend');
  }
});