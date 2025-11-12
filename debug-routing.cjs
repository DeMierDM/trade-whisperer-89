const puppeteer = require('puppeteer');

async function debugRouting() {
  const browser = await puppeteer.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    
    console.log('🌐 Loading home page...');
    await page.goto('http://localhost:8080', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Get all navigation links
    const navLinks = await page.$$eval('a', (links) => 
      links.map(link => ({
        href: link.href,
        text: link.textContent?.trim()
      })).filter(link => link.text)
    );
    
    console.log('🔗 Navigation links found:');
    navLinks.forEach(link => console.log(`  - "${link.text}" -> ${link.href}`));
    
    // Check if this page contains trading interface
    const bodyText = await page.$eval('body', (body) => body.textContent);
    
    const hasRecent = bodyText.includes('Recent Activity');
    const hasSPY = bodyText.includes('SPY');
    const hasQQQ = bodyText.includes('QQQ');
    const hasMarketData = bodyText.includes('Market Data');
    const hasActiveBots = bodyText.includes('Active Trading Bots');
    const hasContextDebug = bodyText.includes('CONTEXT7 DEBUG');
    
    console.log('📝 Page content analysis:');
    console.log(`  - Recent Activity: ${hasRecent}`);
    console.log(`  - SPY mentioned: ${hasSPY}`);
    console.log(`  - QQQ mentioned: ${hasQQQ}`);
    console.log(`  - Market Data: ${hasMarketData}`);
    console.log(`  - Active Trading Bots: ${hasActiveBots}`);
    console.log(`  - CONTEXT7 DEBUG: ${hasContextDebug}`);
    
    // Check if this IS the trading page already
    console.log('\n🤔 This might already BE the trading page!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

debugRouting().catch(console.error);