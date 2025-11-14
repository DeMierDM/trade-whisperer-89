/**
 * Debug Chart Issue - Let's see what's actually happening
 */

import { chromium } from 'playwright';

async function debugChartIssue() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500 
  });
  
  const page = await browser.newPage();
  
  // Listen for console messages and errors
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  
  try {
    console.log('🔍 Debug: Loading page...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    
    // Wait for React to load
    await page.waitForTimeout(5000);
    
    console.log('🔍 Debug: Checking page title...');
    const title = await page.title();
    console.log('Page title:', title);
    
    console.log('🔍 Debug: Checking for React root...');
    const rootContent = await page.locator('#root').innerHTML().catch(() => 'ERROR');
    console.log('Root content length:', rootContent.length);
    
    console.log('🔍 Debug: Looking for any buttons...');
    const allButtons = await page.locator('button').count();
    console.log('Total buttons found:', allButtons);
    
    console.log('🔍 Debug: Looking for any elements with "tab" role...');
    const tabElements = await page.locator('[role="tab"]').count();
    console.log('Tab elements found:', tabElements);
    
    console.log('🔍 Debug: Looking for text content...');
    const bodyText = await page.locator('body').innerText().catch(() => 'ERROR');
    console.log('Body text preview:', bodyText.substring(0, 500));
    
    console.log('🔍 Debug: Checking for specific tab text...');
    const paperTradingText = await page.getByText('Paper Trading').count();
    const liveTradingText = await page.getByText('Live Paper Trading').count();
    const backtestingText = await page.getByText('Backtesting').count();
    
    console.log('Text matches:');
    console.log('- "Paper Trading":', paperTradingText);
    console.log('- "Live Paper Trading":', liveTradingText);
    console.log('- "Backtesting":', backtestingText);
    
    // Take a screenshot to see what's actually there
    await page.screenshot({ path: 'debug-actual-page.png', fullPage: true });
    console.log('📸 Screenshot saved: debug-actual-page.png');
    
    // Check network requests
    console.log('🔍 Debug: Checking if there are any network errors...');
    
    await page.waitForTimeout(2000);
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    await page.screenshot({ path: 'debug-error-page.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

debugChartIssue();