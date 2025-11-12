const puppeteer = require('puppeteer');

async function debugChartTabs() {
  console.log('🔍 Debugging Chart Tabs Implementation...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1200, height: 800 },
      args: ['--disable-web-security']
    });

    const page = await browser.newPage();
    
    // Navigate to application on Docker port 8080
    console.log('📍 Navigating to http://localhost:8080...');
    await page.goto('http://localhost:8080', { 
      waitUntil: 'networkidle0',
      timeout: 10000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check what tabs are available
    console.log('🔍 Looking for tabs...');
    const allTabs = await page.$$('button[data-value]');
    console.log(`Found ${allTabs.length} tab buttons`);
    
    for (let i = 0; i < allTabs.length; i++) {
      const tab = allTabs[i];
      const value = await tab.evaluate(el => el.getAttribute('data-value'));
      const text = await tab.evaluate(el => el.textContent);
      console.log(`Tab ${i}: value="${value}", text="${text}"`);
    }
    
    // Navigate to Live Paper Trading
    console.log('🔄 Clicking Live Paper Trading tab...');
    const paperTradingTab = await page.$('button[data-value="live-paper-trading"]');
    if (paperTradingTab) {
      await paperTradingTab.click();
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('✅ Successfully clicked Live Paper Trading tab');
    } else {
      console.log('❌ Live Paper Trading tab not found');
      return;
    }
    
    // Check for TradingChartTabs component
    console.log('🔍 Looking for TradingChartTabs component...');
    
    // Check various possible selectors
    const selectors = [
      '[data-testid="chart-container"]',
      '.TradingChartTabs', // Class name might be added
      'div:has(.flex.items-center.gap-1)', // Bot tabs container
      'canvas', // TradingView chart canvas
      '.bg-\\[\\#1e222d\\]' // Chart header style
    ];
    
    for (const selector of selectors) {
      const elements = await page.$$(selector);
      console.log(`Selector "${selector}": ${elements.length} elements found`);
    }
    
    // Check for bot data
    console.log('🤖 Looking for bot-related elements...');
    const botElements = await page.$$eval('*', elements => {
      return Array.from(elements)
        .filter(el => el.textContent && (
          el.textContent.includes('Bot') || 
          el.textContent.includes('SPY') ||
          el.textContent.includes('QQQ') ||
          el.textContent.includes('IWM') ||
          el.textContent.includes('Running') ||
          el.textContent.includes('Stopped')
        ))
        .map(el => ({
          tag: el.tagName,
          class: el.className,
          text: el.textContent.substring(0, 100)
        }))
        .slice(0, 10); // Limit results
    });
    
    console.log('Bot-related elements:', botElements);
    
    // Check for any error messages
    const errors = await page.$$eval('.text-red-500, [class*="error"]', 
      elements => elements.map(el => el.textContent)
    );
    
    if (errors.length > 0) {
      console.log('❌ Errors found:', errors);
    }
    
    // Take screenshot
    await page.screenshot({
      path: 'debug-chart-tabs.png',
      fullPage: true
    });
    
    console.log('📸 Debug screenshot saved as: debug-chart-tabs.png');
    
    // Wait to see the interface
    console.log('👀 Leaving browser open for 10 seconds to inspect...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('❌ Debug failed:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugChartTabs();