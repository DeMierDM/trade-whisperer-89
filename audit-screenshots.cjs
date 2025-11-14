const { chromium } = require('playwright');

(async () => {
  let browser;
  try {
    console.log('🚀 Starting comprehensive Trading page audit...');
    
    browser = await chromium.launch({
      headless: false,
      slowMo: 1000,
      args: ['--disable-web-security', '--disable-features=VizDisplayCompositor']
    });

    const context = await browser.newContext({
      viewport: { width: 1600, height: 1000 }
    });

    const page = await context.newPage();
    
    // Enable console logging
    page.on('console', msg => console.log('[BROWSER]', msg.type(), ':', msg.text()));
    page.on('pageerror', error => console.log('[BROWSER ERROR]:', error.message));
    
    console.log('📍 Navigating to http://localhost:8081...');
    
    try {
      await page.goto('http://localhost:8081', { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
    } catch (error) {
      console.log('❌ Failed to load page:', error.message);
      return;
    }
    
    console.log('⏳ Waiting for page to fully load...');
    await page.waitForTimeout(5000);
    
    // Take screenshot of home page first
    console.log('📸 Screenshot 1: Home page');
    await page.screenshot({ 
      path: 'audit-1-home.png',
      fullPage: false
    });
    
    // Navigate to Trading page using hamburger menu
    console.log('🍔 Opening hamburger menu...');
    try {
      await page.click('button[aria-label="Toggle navigation menu"]', { timeout: 10000 });
      await page.waitForTimeout(2000);
      
      console.log('📈 Clicking Trading menu item...');
      await page.click('a[href="/trading"]', { timeout: 10000 });
      await page.waitForTimeout(8000);
      
    } catch (error) {
      console.log('❌ Navigation failed, trying direct URL...');
      await page.goto('http://localhost:8081/trading', { waitUntil: 'networkidle' });
      await page.waitForTimeout(8000);
    }
    
    console.log('📸 Screenshot 2: Trading page overview');
    await page.screenshot({ 
      path: 'audit-2-trading-overview.png',
      fullPage: true
    });
    
    // Focus on chart controls
    console.log('📸 Screenshot 3: Chart controls section');
    try {
      const controlsSection = await page.locator('.flex.items-center.justify-between.p-4');
      if (await controlsSection.count() > 0) {
        await controlsSection.screenshot({ path: 'audit-3-chart-controls.png' });
      }
    } catch (error) {
      console.log('⚠️ Could not capture chart controls');
    }
    
    // Focus on chart area
    console.log('📸 Screenshot 4: Chart area');
    try {
      const chartArea = await page.locator('[class*="h-[500px]"]');
      if (await chartArea.count() > 0) {
        await chartArea.screenshot({ path: 'audit-4-chart-area.png' });
      }
    } catch (error) {
      console.log('⚠️ Could not capture chart area');
    }
    
    // Test symbol selector
    console.log('🔄 Testing symbol selector...');
    try {
      await page.selectOption('select', 'QQQ');
      await page.waitForTimeout(3000);
      
      console.log('📸 Screenshot 5: After selecting QQQ');
      await page.screenshot({ 
        path: 'audit-5-qqq-selected.png',
        fullPage: false
      });
      
    } catch (error) {
      console.log('⚠️ Symbol selector test failed:', error.message);
    }
    
    // Test timeframe selector
    console.log('🔄 Testing timeframe selector...');
    try {
      await page.click('button:has-text("5m")');
      await page.waitForTimeout(3000);
      
      console.log('📸 Screenshot 6: After selecting 5m timeframe');
      await page.screenshot({ 
        path: 'audit-6-5m-timeframe.png',
        fullPage: false
      });
      
    } catch (error) {
      console.log('⚠️ Timeframe selector test failed:', error.message);
    }
    
    console.log('✅ Audit screenshots completed!');
    console.log('📁 Files created:');
    console.log('  - audit-1-home.png');
    console.log('  - audit-2-trading-overview.png'); 
    console.log('  - audit-3-chart-controls.png');
    console.log('  - audit-4-chart-area.png');
    console.log('  - audit-5-qqq-selected.png');
    console.log('  - audit-6-5m-timeframe.png');
    
  } catch (error) {
    console.error('❌ Error during audit:', error.message);
  } finally {
    if (browser) {
      console.log('🔚 Closing browser...');
      await browser.close();
    }
  }
})();