const puppeteer = require('puppeteer');

async function inspectPage() {
  console.log('🔍 Inspecting page content...');
  
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1200, height: 800 }
    });

    const page = await browser.newPage();
    
    console.log('📍 Navigating to http://localhost:8080...');
    await page.goto('http://localhost:8080', { 
      waitUntil: 'domcontentloaded',
      timeout: 10000 
    });
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get page title
    const title = await page.title();
    console.log(`📄 Page title: "${title}"`);
    
    // Get main content structure
    const structure = await page.evaluate(() => {
      const body = document.body;
      if (!body) return 'No body element found';
      
      const getElementInfo = (el, depth = 0, maxDepth = 3) => {
        if (depth > maxDepth) return '...';
        
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const classes = el.className ? `.${el.className.split(' ').slice(0, 2).join('.')}` : '';
        const text = el.textContent ? el.textContent.substring(0, 50) : '';
        
        let result = `${'  '.repeat(depth)}${tag}${id}${classes}`;
        if (text && !text.match(/^\s*$/)) {
          result += ` [${text.replace(/\s+/g, ' ').trim()}]`;
        }
        result += '\n';
        
        // Add children
        if (depth < maxDepth) {
          for (let child of el.children) {
            result += getElementInfo(child, depth + 1, maxDepth);
          }
        }
        
        return result;
      };
      
      return getElementInfo(body);
    });
    
    console.log('🏗️ Page structure:');
    console.log(structure);
    
    // Look for any buttons
    const buttons = await page.$$eval('button', buttons => 
      buttons.map(btn => ({
        text: btn.textContent?.substring(0, 50),
        class: btn.className,
        id: btn.id,
        dataValue: btn.getAttribute('data-value')
      }))
    );
    
    console.log(`🔘 Found ${buttons.length} buttons:`);
    buttons.forEach((btn, i) => {
      console.log(`  ${i}: "${btn.text}" (class: ${btn.class}, data-value: ${btn.dataValue})`);
    });
    
    // Take screenshot
    await page.screenshot({
      path: 'page-inspection.png',
      fullPage: true
    });
    
    console.log('📸 Screenshot saved as: page-inspection.png');
    
    // Keep browser open for inspection
    console.log('👀 Keeping browser open for 15 seconds...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
  } catch (error) {
    console.error('❌ Inspection failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

inspectPage();