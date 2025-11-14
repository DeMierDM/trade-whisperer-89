const { chromium } = require('playwright');

async function quickManualInspection() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000 // Slow down for manual observation
  });
  const page = await browser.newPage();
  
  console.log('🔍 Opening browser for manual inspection...');
  
  // Navigate and wait
  await page.goto('http://localhost:8080');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(5000);
  
  console.log('📋 Page loaded. Manual inspection time - check the UI!');
  console.log('📋 Looking at browser window...');
  
  // Wait for manual inspection
  await page.waitForTimeout(30000);
  
  await browser.close();
}

quickManualInspection().catch(console.error);