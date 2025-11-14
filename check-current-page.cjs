const puppeteer = require('puppeteer');

async function checkCurrentPage() {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    console.log('🌐 Navigating to frontend URL...');
    await page.goto('http://localhost:8080', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    // Get current URL
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Get page title
    const title = await page.title();
    console.log(`📄 Page Title: ${title}`);
    
    // Try to click Trading navigation if it exists
    try {
      console.log('🔍 Looking for Trading navigation link...');
      await page.waitForSelector('nav a[href*="trading"], a[href*="trading"]', { timeout: 5000 });
      await page.click('a[href*="trading"]');
      await page.waitForTimeout(2000);
      
      const tradingUrl = page.url();
      console.log(`🎯 After clicking Trading link: ${tradingUrl}`);
    } catch (navError) {
      console.log('❌ No Trading navigation link found, trying direct navigation...');
      await page.goto('http://localhost:8080/trading', { 
        waitUntil: 'networkidle0',
        timeout: 10000 
      });
      console.log(`🎯 Direct navigation to Trading: ${page.url()}`);
    }
    
    // Check if we can find any specific elements that should be in Trading.tsx
    const hasLiveTrading = await page.$eval('body', (body) => body.textContent.includes('Live Trading')).catch(() => false);
    const hasProfessionalOptions = await page.$eval('body', (body) => body.textContent.includes('Professional Options Trading Platform')).catch(() => false);
    const hasRedDebugBanner = await page.$('div[style*="red"]').then(el => el !== null).catch(() => false);
    
    console.log(`🔍 Elements found:`);
    console.log(`  - Live Trading header: ${hasLiveTrading}`);
    console.log(`  - Professional Options header: ${hasProfessionalOptions}`);
    console.log(`  - Red debug banner: ${hasRedDebugBanner}`);
    
    // Get page source to check
    const pageSource = await page.content();
    const hasContextDebug = pageSource.includes('CONTEXT7 DEBUG');
    const hasActiveBotSymbols = pageSource.includes('activeBotSymbols');
    
    console.log(`📝 Page source contains:`);
    console.log(`  - CONTEXT7 DEBUG: ${hasContextDebug}`);
    console.log(`  - activeBotSymbols: ${hasActiveBotSymbols}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

checkCurrentPage().catch(console.error);