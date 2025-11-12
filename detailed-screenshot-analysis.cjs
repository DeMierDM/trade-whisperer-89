const { chromium } = require('playwright');

async function detailedScreenshotAnalysis() {
  console.log('📸 Detailed screenshot analysis of Live Paper Trading tab...');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  try {
    // Navigate to the app
    console.log('🔍 Navigating to http://localhost:8080/backtesting...');
    await page.goto('http://localhost:8080/backtesting', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    // Take initial screenshot
    await page.screenshot({ path: 'initial-page.png', fullPage: true });
    console.log('📸 Initial page screenshot taken');
    
    // Wait for and find tabs
    console.log('📋 Looking for tabs...');
    await page.waitForSelector('[role="tab"]', { timeout: 10000 });
    
    const tabs = await page.$$('[role="tab"]');
    const tabTexts = await Promise.all(tabs.map(tab => tab.textContent()));
    console.log('📋 Tabs found:', tabTexts);
    
    // Click Live Paper Trading tab
    console.log('📋 Clicking Live Paper Trading tab...');
    for (let i = 0; i < tabs.length; i++) {
      const text = tabTexts[i];
      if (text && text.includes('Live Paper Trading')) {
        await tabs[i].click();
        console.log(`✅ Clicked tab ${i}: "${text}"`);
        break;
      }
    }
    
    // Wait for tab content to load
    await page.waitForTimeout(3000);
    
    // Take screenshot after clicking tab
    await page.screenshot({ path: 'after-tab-click.png', fullPage: true });
    console.log('📸 After tab click screenshot taken');
    
    // Check active tab panel
    console.log('🔍 Checking for active tab panel...');
    const activeTabPanel = await page.$('[role="tabpanel"][data-state="active"]');
    if (activeTabPanel) {
      console.log('✅ Found active tab panel');
      const panelText = await activeTabPanel.textContent();
      console.log('📋 Panel content preview:', panelText.substring(0, 200) + '...');
      
      // Take screenshot of just the tab panel
      await activeTabPanel.screenshot({ path: 'active-tab-panel.png' });
      console.log('📸 Active tab panel screenshot taken');
    } else {
      console.log('❌ No active tab panel found');
    }
    
    // Look for our specific test elements
    console.log('🔍 Looking for chart elements...');
    const chartContainer = await page.$('[data-testid="chart-container"]');
    const loadingOverlay = await page.$('[data-testid="loading-overlay"]');
    const debugText = await page.$('[data-testid="debug-text"]');
    
    console.log('🔍 Chart container:', !!chartContainer);
    console.log('🔍 Loading overlay:', !!loadingOverlay);
    console.log('🔍 Debug text:', !!debugText);
    
    if (!chartContainer) {
      console.log('❌ Chart container not found - checking for any Card elements...');
      const cards = await page.$$('div[class*="card"], div[class*="Card"]');
      console.log(`📋 Found ${cards.length} card-like elements`);
      
      for (let i = 0; i < Math.min(cards.length, 5); i++) {
        const cardText = await cards[i].textContent();
        console.log(`📋 Card ${i}:`, cardText.substring(0, 100));
      }
    }
    
    // Look for any loading or error messages
    console.log('🔍 Checking for any error or loading messages...');
    const bodyText = await page.textContent('body');
    const hasLoading = bodyText.includes('Loading');
    const hasError = bodyText.includes('Error') || bodyText.includes('error');
    console.log('📋 Page contains "Loading":', hasLoading);
    console.log('📋 Page contains "Error":', hasError);
    
    // Wait a bit longer and take final screenshot
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'final-detailed-screenshot.png', fullPage: true });
    console.log('📸 Final detailed screenshot taken');
    
  } catch (error) {
    console.error('❌ Error during analysis:', error.message);
    // Take error screenshot
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

detailedScreenshotAnalysis().catch(console.error);