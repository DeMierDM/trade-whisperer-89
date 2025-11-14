const puppeteer = require('puppeteer');

async function debugAIPage() {
    console.log('🔍 Debugging AI page...');
    
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    
    try {
        const page = await browser.newPage();
        
        // Enable console logging
        page.on('console', msg => {
            console.log(`🖥️ Browser: ${msg.text()}`);
        });
        
        page.on('pageerror', error => {
            console.log(`❌ Page Error: ${error.message}`);
        });
        
        // Navigate to AI page
        console.log('📱 Opening AI page...');
        await page.goto('http://localhost:8080/ai', { waitUntil: 'domcontentloaded' });
        
        // Take initial screenshot
        await page.screenshot({ 
            path: 'debug-ai-page.png', 
            fullPage: true 
        });
        console.log('📸 Debug screenshot saved as debug-ai-page.png');
        
        // Wait a moment for React to load
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Check what elements are on the page
        const bodyContent = await page.evaluate(() => document.body.innerHTML);
        console.log('📋 Page body content (first 500 chars):');
        console.log(bodyContent.substring(0, 500));
        
        // Look for any AI-related elements
        const elements = await page.evaluate(() => {
            const selectors = [
                '.modern-claude-chat',
                '.claude-chat',
                '.ai-chat',
                '[data-testid="ai-chat"]',
                'main',
                '.container',
                '#root'
            ];
            
            const results = {};
            selectors.forEach(selector => {
                const element = document.querySelector(selector);
                results[selector] = {
                    exists: !!element,
                    text: element ? element.textContent.substring(0, 100) : null,
                    className: element ? element.className : null
                };
            });
            
            return results;
        });
        
        console.log('\n🔍 Element Analysis:');
        Object.entries(elements).forEach(([selector, info]) => {
            console.log(`${selector}: ${info.exists ? '✅' : '❌'} ${info.exists ? `"${info.text}" (${info.className})` : ''}`);
        });
        
        // Take final screenshot after waiting
        await page.screenshot({ 
            path: 'debug-ai-page-loaded.png', 
            fullPage: true 
        });
        console.log('📸 Final debug screenshot saved as debug-ai-page-loaded.png');
        
        console.log('\n💡 Keep browser open for 10 seconds for manual inspection...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
    } catch (error) {
        console.error('❌ Debug failed:', error.message);
    } finally {
        await browser.close();
    }
}

debugAIPage().catch(console.error);