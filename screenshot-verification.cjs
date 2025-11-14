const { chromium } = require('playwright');

async function takeScreenshot() {
  console.log('📸 Taking screenshot to verify the Live Paper Trading chart fix...');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    // Navigate to the app
    console.log('🔍 Navigating to http://localhost:8080...');
    await page.goto('http://localhost:8080');
    await page.waitForTimeout(2000);
    
    // Navigate to backtesting page
    console.log('🔍 Navigating to backtesting page...');
    await page.goto('http://localhost:8080/backtesting');
    await page.waitForTimeout(2000);
    
    // Wait for tabs to be visible
    console.log('📋 Waiting for tabs...');
    await page.waitForSelector('[role="tab"]', { timeout: 10000 });
    
    // Click on Live Paper Trading tab
    console.log('📋 Clicking Live Paper Trading tab...');
    const tabs = await page.$$('[role="tab"]');
    const tabTexts = await Promise.all(tabs.map(tab => tab.textContent()));
    console.log('📋 Available tabs:', tabTexts);
    
    const livePaperTab = tabs.find(async (tab, index) => {
      const text = await tab.textContent();
      return text?.includes('Live Paper Trading');
    });
    
    if (livePaperTab) {
      await livePaperTab.click();
      console.log('✅ Clicked Live Paper Trading tab');
    } else {
      // Try clicking the second tab (should be Live Paper Trading)
      if (tabs[1]) {
        await tabs[1].click();
        console.log('✅ Clicked second tab (Live Paper Trading)');
      }
    }
    
    await page.waitForTimeout(2000);
    
    // Check if our elements are visible
    console.log('🔍 Checking for chart elements...');
    const chartContainer = await page.$('[data-testid="chart-container"]');
    const loadingOverlay = await page.$('[data-testid="loading-overlay"]');
    const debugText = await page.$('[data-testid="debug-text"]');
    
    console.log('✅ Chart container found:', !!chartContainer);
    console.log('✅ Loading overlay found:', !!loadingOverlay);
    console.log('✅ Debug text found:', !!debugText);
    
    if (debugText) {
      const debugContent = await debugText.textContent();
      console.log('📋 Debug content:', debugContent);
    }
    
    if (loadingOverlay) {
      const loadingContent = await loadingOverlay.textContent();
      console.log('📋 Loading overlay content:', loadingContent);
    }
    
    // Take screenshot
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotPath = `screenshot-live-paper-trading-${timestamp}.png`;
    
    console.log('📸 Taking screenshot...');
    await page.screenshot({ 
      path: screenshotPath, 
      fullPage: true 
    });
    
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
    
    // Take a focused screenshot of just the chart area
    if (chartContainer) {
      const chartScreenshotPath = `screenshot-chart-container-${timestamp}.png`;
      await chartContainer.screenshot({ 
        path: chartScreenshotPath 
      });
      console.log(`📸 Chart container screenshot saved: ${chartScreenshotPath}`);
    }
    
    // Wait a bit for user to see
    await page.waitForTimeout(3000);
    
  } catch (error) {
    console.error('❌ Error during screenshot:', error.message);
  } finally {
    await browser.close();
  }
}

takeScreenshot().catch(console.error);