const puppeteer = require('puppeteer');

async function findClaudeElements() {
    console.log('🔍 Finding Claude Chat Elements...');
    
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1400, height: 900 }
    });
    
    const page = await browser.newPage();
    
    try {
        console.log('🌐 Navigating to http://localhost:8080...');
        await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
        
        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Look for Claude-related elements
        console.log('🔍 Searching for Claude chat elements...');
        
        const claudeElements = await page.evaluate(() => {
            const elements = [];
            
            // Search for elements containing "Claude" text
            const claudeTexts = Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent && el.textContent.toLowerCase().includes('claude')
            );
            
            claudeTexts.forEach(el => {
                elements.push({
                    type: 'claude-text',
                    tagName: el.tagName,
                    className: el.className,
                    id: el.id,
                    text: el.textContent.slice(0, 100),
                    selector: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : '')
                });
            });
            
            // Search for AI/chat related elements
            const aiTexts = Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent && (
                    el.textContent.toLowerCase().includes('ai assistant') ||
                    el.textContent.toLowerCase().includes('chat') ||
                    el.textContent.toLowerCase().includes('assistant')
                )
            );
            
            aiTexts.forEach(el => {
                elements.push({
                    type: 'ai-text',
                    tagName: el.tagName,
                    className: el.className,
                    id: el.id,
                    text: el.textContent.slice(0, 100),
                    selector: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : '')
                });
            });
            
            // Search for textarea/input elements
            const inputs = Array.from(document.querySelectorAll('textarea, input')).map(el => ({
                type: 'input',
                tagName: el.tagName,
                className: el.className,
                id: el.id,
                placeholder: el.placeholder,
                selector: el.tagName + (el.id ? '#' + el.id : '') + (el.className ? '.' + el.className.split(' ').join('.') : '')
            }));
            
            elements.push(...inputs);
            
            return elements.slice(0, 20); // Limit results
        });
        
        console.log('📋 Found Claude-related elements:');
        claudeElements.forEach((el, index) => {
            console.log(`${index + 1}. Type: ${el.type}`);
            console.log(`   Tag: ${el.tagName}, Class: ${el.className}`);
            console.log(`   Text: ${el.text || el.placeholder || 'N/A'}`);
            console.log(`   Selector: ${el.selector}`);
            console.log('');
        });
        
        // Try to find and click on Claude section
        console.log('🎯 Attempting to access Claude chat...');
        
        // Try different approaches to find Claude chat
        const approaches = [
            () => page.click('text=AI Assistant'),
            () => page.click('text=Claude'),
            () => page.click('text=AI'),
            () => page.$eval('*[class*="claude"]', el => el.click()),
            () => page.$eval('*[class*="chat"]', el => el.click()),
            () => page.$eval('*[id*="claude"]', el => el.click())
        ];
        
        for (let i = 0; i < approaches.length; i++) {
            try {
                console.log(`  Approach ${i + 1}: Trying...`);
                await approaches[i]();
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Check if we successfully accessed Claude chat
                const hasClaudeInterface = await page.evaluate(() => {
                    const bodyText = document.body.textContent.toLowerCase();
                    return bodyText.includes('send a message') || 
                           bodyText.includes('claude ai') ||
                           bodyText.includes('ready') ||
                           bodyText.includes('connected');
                });
                
                if (hasClaudeInterface) {
                    console.log(`  ✅ Approach ${i + 1} successful!`);
                    break;
                } else {
                    console.log(`  ❌ Approach ${i + 1} did not access Claude interface`);
                }
            } catch (error) {
                console.log(`  ❌ Approach ${i + 1} failed:`, error.message);
            }
        }
        
        // Check current state after attempting access
        console.log('\n📊 Current page state:');
        const finalState = await page.evaluate(() => {
            const bodyText = document.body.textContent;
            return {
                hasReady: bodyText.includes('Ready') || bodyText.includes('ready'),
                hasLoading: bodyText.includes('Loading') || bodyText.includes('loading'),
                hasThinking: bodyText.includes('Thinking') || bodyText.includes('thinking'),
                hasConnected: bodyText.includes('Connected') || bodyText.includes('connected'),
                hasClaude: bodyText.includes('Claude'),
                hasTextarea: !!document.querySelector('textarea'),
                bodyLength: bodyText.length
            };
        });
        
        console.log('  State indicators found:');
        Object.entries(finalState).forEach(([key, value]) => {
            console.log(`    ${key}: ${value}`);
        });
        
        await page.screenshot({ path: 'claude-element-search.png' });
        console.log('📸 Screenshot saved: claude-element-search.png');
        
        console.log('\n🔍 Keeping browser open for 10 seconds for inspection...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
    } catch (error) {
        console.error('❌ Error during search:', error);
    } finally {
        await browser.close();
        console.log('🏁 Element search completed');
    }
}

findClaudeElements().catch(console.error);