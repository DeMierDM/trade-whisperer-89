const { chromium } = require('playwright');

async function inspectActualHTML() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Listen to console messages
  page.on('console', msg => {
    if (msg.text().includes('🔍 Chart Debug')) {
      console.log('🔍 CONSOLE DEBUG:', msg.text());
    }
  });
  
  console.log('📋 Navigating to backtesting page...');
  await page.goto('http://localhost:8080');
  await page.waitForLoadState('networkidle');
  
  // Wait for React to load
  await page.waitForTimeout(3000);
  
  console.log('📋 Looking for tabs...');
  await page.waitForSelector('[role="tab"]', { timeout: 10000 });
  const tabs = await page.locator('[role="tab"]').allTextContents();
  console.log('Tabs found:', tabs);
  
  console.log('📋 Clicking Live Paper Trading tab...');
  await page.locator('[role="tab"]:has-text("Live Paper Trading")').click();
  await page.waitForTimeout(3000);
  
  // Get the full HTML of the active tab panel
  console.log('📋 Getting tab panel HTML...');
  const tabPanelHTML = await page.locator('[role="tabpanel"]').innerHTML();
  console.log('📋 TAB PANEL HTML:');
  console.log('='.repeat(60));
  console.log(tabPanelHTML);
  console.log('='.repeat(60));
  
  // Check specifically for our debug elements
  console.log('📋 Looking for debug elements...');
  const debugContainer = await page.locator('[data-testid="debug-chart-container"]').count();
  const debugText = await page.locator('[data-testid="debug-text"]').count();
  const loadingSpinner = await page.locator('.animate-spin').count();
  
  console.log(`Debug container count: ${debugContainer}`);
  console.log(`Debug text count: ${debugText}`);
  console.log(`Loading spinner count: ${loadingSpinner}`);
  
  // Try to get the debug text content if it exists
  if (debugText > 0) {
    const debugTextContent = await page.locator('[data-testid="debug-text"]').textContent();
    console.log(`Debug text content: ${debugTextContent}`);
  }
  
  await browser.close();
}

inspectActualHTML().catch(console.error);