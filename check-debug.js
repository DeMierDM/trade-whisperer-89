/**
 * Check for Debug Elements
 */

import { chromium } from 'playwright';

async function checkDebugElements() {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 1000 
  });
  
  const page = await browser.newPage();
  
  // Listen for console messages
  page.on('console', msg => {
    if (msg.text().includes('Chart Debug')) {
      console.log('🔍 CONSOLE DEBUG:', msg.text());
    }
  });
  
  try {
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    await page.click('a:has-text("Backtesting")');
    await page.waitForTimeout(3000);
    
    await page.click('[role="tab"]:has-text("Live Paper Trading")');
    await page.waitForTimeout(3000);
    
    // Look for debug elements
    const debugContainer = await page.locator('[data-testid="chart-container"]').count();
    const debugText = await page.locator('text="DEBUG: Chart Container"').count();
    const loadingOverlay = await page.locator('[data-testid="loading-overlay"]').count();
    
    console.log('Debug elements found:');
    console.log('- Chart container:', debugContainer);  
    console.log('- Debug text:', debugText);
    console.log('- Loading overlay:', loadingOverlay);
    
    // Get all text on the Live Paper Trading tab
    const tabContent = await page.locator('[role="tabpanel"]').innerText();
    console.log('Tab content preview:', tabContent.substring(0, 500));
    
    await page.screenshot({ path: 'debug-elements-check.png', fullPage: true });
    
  } catch (error) {
    console.error('❌ Debug check failed:', error);
  } finally {
    await browser.close();
  }
}

checkDebugElements();