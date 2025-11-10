const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    console.log('🚀 Starting Trading page screenshot...');
    
    browser = await chromium.launch({
      headless: false,
      slowMo: 500
    });

    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 }
    });

    const page = await context.newPage();
    
    console.log('📍 Navigating to Trading page...');
    await page.goto('http://localhost:8081', { waitUntil: 'networkidle' });
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Navigate to Trading page using the hamburger menu
    console.log('🍔 Opening hamburger menu...');
    await page.click('button[aria-label="Toggle navigation menu"]');
    await page.waitForTimeout(1000);
    
    console.log('📈 Clicking Trading menu item...');
    await page.click('a[href="/trading"]');
    await page.waitForTimeout(5000);
    
    console.log('📸 Taking Trading page screenshot...');
    await page.screenshot({ 
      path: 'trading-page-screenshot.png',
      fullPage: true
    });
    
    console.log('✅ Screenshot saved as trading-page-screenshot.png');
    
  } catch (error) {
    console.error('❌ Error during screenshot capture:', error.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();