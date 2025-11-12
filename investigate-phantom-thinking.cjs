const puppeteer = require('puppeteer');

async function investigatePhantomThinking() {
    console.log('🕵️  Investigating Phantom "Thinking" States...');
    
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1400, height: 900 }
    });
    
    const page = await browser.newPage();
    
    try {
        // Capture console logs
        const consoleLogs = [];
        page.on('console', msg => {
            consoleLogs.push({
                timestamp: Date.now(),
                type: msg.type(),
                text: msg.text()
            });
        });
        
        console.log('🌐 Navigating to frontend...');
        await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Click on AI to access Claude chat
        console.log('🎯 Accessing Claude chat...');
        await page.click('text=AI');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Capture initial state WITHOUT sending any message
        console.log('📊 Checking state BEFORE any input...');
        
        const initialCheck = await page.evaluate(() => {
            const bodyText = document.body.textContent;
            return {
                hasThinking: bodyText.includes('thinking'),
                hasProcessing: bodyText.includes('processing'),
                thinkingTexts: (bodyText.match(/thinking[^.]*[.]?/gi) || []),
                processingTexts: (bodyText.match(/processing[^.]*[.]?/gi) || []),
                fullThinkingContext: bodyText.split('thinking').map((part, index) => 
                    index > 0 ? 'thinking' + part.slice(0, 100) : null
                ).filter(Boolean),
                messageElements: Array.from(document.querySelectorAll('div, p, span')).filter(el => {
                    const text = el.textContent || '';
                    return text.includes('thinking') || text.includes('request');
                }).map(el => ({
                    tag: el.tagName,
                    class: el.className,
                    text: el.textContent?.slice(0, 200)
                }))
            };
        });
        
        console.log('\n🔍 INITIAL STATE ANALYSIS (Before any input):');
        console.log('  Has "thinking":', initialCheck.hasThinking);
        console.log('  Has "processing":', initialCheck.hasProcessing);
        console.log('  Thinking texts found:', initialCheck.thinkingTexts);
        console.log('  Processing texts found:', initialCheck.processingTexts);
        
        if (initialCheck.hasThinking) {
            console.log('\n⚠️  WARNING: "Thinking" state detected BEFORE user input!');
            console.log('  Full thinking contexts:');
            initialCheck.fullThinkingContext.forEach((context, index) => {
                console.log(`    ${index + 1}. ${context}`);
            });
            
            console.log('\n  Elements containing "thinking":');
            initialCheck.messageElements.forEach((el, index) => {
                console.log(`    ${index + 1}. ${el.tag}.${el.class}: ${el.text}`);
            });
        }
        
        // Check if there are cached/static messages
        console.log('\n🔍 Checking for cached/static content...');
        const staticContent = await page.evaluate(() => {
            // Look for any elements that might contain static example content
            const examples = Array.from(document.querySelectorAll('*')).filter(el => {
                const text = el.textContent || '';
                return text.includes('example') || text.includes('demo') || 
                       text.includes('sample') || text.includes('Recent Chat Interactions');
            }).map(el => ({
                tag: el.tagName,
                class: el.className,
                text: el.textContent?.slice(0, 300)
            }));
            
            return examples;
        });
        
        console.log('Static/Example content found:');
        staticContent.forEach((content, index) => {
            console.log(`  ${index + 1}. ${content.tag}: ${content.text}`);
        });
        
        // Monitor network requests to see if automatic messages are sent
        console.log('\n📡 Monitoring network activity...');
        const networkRequests = [];
        page.on('request', request => {
            if (request.url().includes('socket.io') || request.url().includes('claude')) {
                networkRequests.push({
                    timestamp: Date.now(),
                    method: request.method(),
                    url: request.url(),
                    postData: request.postData()
                });
            }
        });
        
        // Wait without doing anything to see if automatic messages are sent
        console.log('⏳ Waiting 10 seconds without input to monitor automatic activity...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        console.log('\n📡 Network requests detected:');
        networkRequests.forEach((req, index) => {
            console.log(`  ${index + 1}. ${req.method} ${req.url}`);
            if (req.postData) {
                console.log(`     Data: ${req.postData.slice(0, 200)}`);
            }
        });
        
        console.log('\n📋 Frontend console logs:');
        consoleLogs.forEach((log, index) => {
            console.log(`  ${index + 1}. [${log.type.toUpperCase()}] ${log.text}`);
        });
        
        // Now let's find the textarea and check if it has any value
        const textareaInfo = await page.evaluate(() => {
            const textarea = document.querySelector('textarea');
            return textarea ? {
                value: textarea.value,
                placeholder: textarea.placeholder,
                hasContent: textarea.value.length > 0
            } : null;
        });
        
        console.log('\n📝 Textarea state:');
        console.log('  Value:', textareaInfo?.value || 'null');
        console.log('  Placeholder:', textareaInfo?.placeholder || 'null');
        console.log('  Has content:', textareaInfo?.hasContent || false);
        
        await page.screenshot({ 
            path: 'phantom-thinking-investigation.png', 
            fullPage: true 
        });
        console.log('📸 Screenshot saved: phantom-thinking-investigation.png');
        
        console.log('\n🔍 Keeping browser open for manual inspection...');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
    } catch (error) {
        console.error('❌ Error during investigation:', error);
    } finally {
        await browser.close();
        console.log('🏁 Investigation completed');
    }
}

investigatePhantomThinking().catch(console.error);