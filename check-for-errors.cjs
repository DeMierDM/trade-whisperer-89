const { chromium } = require('playwright');

async function checkForErrors() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Listen to all console messages
  page.on('console', msg => {
    console.log('🔍 CONSOLE:', msg.type().toUpperCase(), msg.text());
  });
  
  // Listen to errors
  page.on('pageerror', error => {
    console.log('❌ PAGE ERROR:', error.message);
  });
  
  // Listen to failed requests
  page.on('requestfailed', request => {
    console.log('❌ FAILED REQUEST:', request.url(), request.failure()?.errorText);
  });
  
  console.log('📋 Navigating to check for errors...');
  await page.goto('http://localhost:8080');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  
  // Try to find the tabs
  try {
    console.log('📋 Looking for any tabs at all...');
    const allElements = await page.locator('*').all();
    console.log(`Found ${allElements.length} total elements on page`);
    
    // Look for any element containing "Live Paper Trading"
    const livePaperElements = await page.locator('text=Live Paper Trading').count();
    console.log(`Elements containing "Live Paper Trading": ${livePaperElements}`);
    
    // Look for tab-related elements
    const tabElements = await page.locator('[role="tab"], .tabs, [data-state]').count();
    console.log(`Tab-related elements found: ${tabElements}`);
    
    if (tabElements > 0) {
      const tabInfo = await page.locator('[role="tab"], .tabs, [data-state]').all();
      for (let i = 0; i < Math.min(5, tabInfo.length); i++) {
        try {
          const text = await tabInfo[i].textContent();
          console.log(`Tab ${i}: "${text}"`);
        } catch (e) {
          console.log(`Tab ${i}: Unable to get text`);
        }
      }
    }
    
  } catch (error) {
    console.log('❌ Error during element search:', error.message);
  }
  
  await browser.close();
}

checkForErrors().catch(console.error);