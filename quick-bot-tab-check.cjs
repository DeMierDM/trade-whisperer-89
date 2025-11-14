const puppeteer = require('puppeteer');

async function quickBotTabCheck() {
  console.log('🔍 Quick Bot Tab Check...\n');
  
  const browser = await puppeteer.launch({ 
    headless: false, 
    args: ['--no-sandbox'] 
  });
  
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  
  try {
    console.log('Loading frontend...');
    await page.goto('http://localhost:8080');
    
    // Wait longer for React to mount and fetch data
    await new Promise(resolve => setTimeout(resolve, 8000));
    
    // Look for any element containing bot-related text
    const botText = await page.evaluate(() => {
      const elements = document.querySelectorAll('*');
      const found = [];
      for (const el of elements) {
        if (el.textContent && (
          el.textContent.includes('Active Trading Bots') ||
          el.textContent.includes('active bots') ||
          el.textContent.includes('SPY') ||
          el.textContent.includes('QQQ') ||
          el.textContent.includes('IWM')
        )) {
          found.push(el.textContent.trim());
        }
      }
      return found.slice(0, 10); // Limit results
    });
    
    console.log('Bot-related text found:');
    botText.forEach(text => console.log(`   - "${text}"`));
    
    // Look for specific bot tabs
    const botTabs = await page.$$('[data-testid^="bot-tab-"]');
    console.log(`\nFound ${botTabs.length} elements with bot-tab data-testid`);
    
    // Check React Dev Tools for component state (if available)
    const reactState = await page.evaluate(() => {
      // Try to find React state in the window object
      return window.React ? 'React available' : 'React not in global scope';
    });
    
    console.log(`React status: ${reactState}`);
    
    // Take a screenshot
    await page.screenshot({ 
      path: 'debug-screenshots/quick_bot_check.png',
      fullPage: true 
    });
    console.log('\n📸 Screenshot saved: quick_bot_check.png');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

quickBotTabCheck();