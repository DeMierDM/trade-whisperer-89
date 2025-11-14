#!/usr/bin/env node

/**
 * Quick Bot Validation Tool - Debug Navigation Issue
 */

const puppeteer = require('puppeteer');

async function debugPageLoad() {
  console.log('🔍 Debugging page load issue...');
  
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1920, height: 1080 }
  });
  
  const page = await browser.newPage();
  
  // Monitor console for errors
  page.on('console', msg => console.log('📊 [Console]', msg.text()));
  page.on('pageerror', error => console.error('❌ [Page Error]', error.message));
  
  try {
    console.log('🌐 Navigating to localhost:8080...');
    await page.goto('http://localhost:8080', { 
      waitUntil: 'networkidle0',
      timeout: 15000 
    });
    
    // Take screenshot of current page
    await page.screenshot({ path: './debug-page-load.png', fullPage: true });
    console.log('📸 Screenshot saved: debug-page-load.png');
    
    // Check what's on the page
    const title = await page.title();
    console.log('📄 Page title:', title);
    
    // Look for React root or main content
    const hasReactRoot = await page.$('#root');
    console.log('⚛️  React root exists:', !!hasReactRoot);
    
    // Check for any testids
    const testIds = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-testid]')).map(el => el.getAttribute('data-testid'));
    });
    console.log('🧪 Found test IDs:', testIds);
    
    // Look for tabs or navigation
    const tabs = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.map(btn => btn.textContent?.trim()).filter(text => text && text.length < 50);
    });
    console.log('🔖 Found buttons/tabs:', tabs);
    
    // Wait a bit and try to find the backtesting page or tab
    await page.waitForTimeout(5000);
    
    // Try clicking on a Backtesting tab if it exists
    const backTestingTab = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, [role="tab"]'));
      const backTestButton = buttons.find(btn => 
        btn.textContent?.toLowerCase().includes('backtest') ||
        btn.textContent?.toLowerCase().includes('paper') ||
        btn.textContent?.toLowerCase().includes('trading')
      );
      if (backTestButton) {
        backTestButton.click();
        return backTestButton.textContent;
      }
      return null;
    });
    
    if (backTestingTab) {
      console.log('🎯 Clicked on:', backTestingTab);
      await page.waitForTimeout(3000);
      
      // Take another screenshot after clicking
      await page.screenshot({ path: './debug-after-click.png', fullPage: true });
      console.log('📸 After click screenshot: debug-after-click.png');
      
      // Check for paper trading tab
      const paperTab = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        return elements.find(el => 
          el.textContent?.toLowerCase().includes('paper') && 
          (el.tagName === 'BUTTON' || el.getAttribute('role') === 'tab')
        )?.textContent;
      });
      
      if (paperTab) {
        console.log('📋 Found paper tab:', paperTab);
        
        await page.evaluate(() => {
          const elements = Array.from(document.querySelectorAll('*'));
          const paperElement = elements.find(el => 
            el.textContent?.toLowerCase().includes('paper') && 
            (el.tagName === 'BUTTON' || el.getAttribute('role') === 'tab')
          );
          if (paperElement) {
            paperElement.click();
          }
        });
        
        await page.waitForTimeout(3000);
        await page.screenshot({ path: './debug-paper-tab.png', fullPage: true });
        console.log('📸 Paper tab screenshot: debug-paper-tab.png');
      }
    }
    
    // Final check for chart container
    const hasChartContainer = await page.$('[data-testid="chart-container"]');
    console.log('📊 Chart container exists:', !!hasChartContainer);
    
    await page.waitForTimeout(2000);
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
  } finally {
    await browser.close();
    console.log('✅ Debug complete');
  }
}

debugPageLoad().catch(console.error);