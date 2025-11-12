const puppeteer = require('puppeteer');

async function investigateClaudeStates() {
    console.log('🔬 CLAUDE INTERACTIVE STATES INVESTIGATION');
    console.log('==========================================\n');
    
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized'],
        devtools: true // Open devtools to see console
    });
    
    try {
        const page = await browser.newPage();
        
        // Enable console logging from the page
        page.on('console', msg => {
            const type = msg.type();
            const text = msg.text();
            
            // Filter for Claude-related logs
            if (text.includes('Claude') || text.includes('🤖') || text.includes('🔍') || text.includes('WebSocket') || text.includes('connected') || text.includes('ready')) {
                console.log(`📱 [${type.toUpperCase()}] ${text}`);
            }
        });
        
        page.on('pageerror', error => {
            console.log(`❌ Page Error: ${error.message}`);
        });
        
        console.log('📱 Opening AI page...');
        await page.goto('http://localhost:8080/ai', { waitUntil: 'networkidle0' });
        
        // Wait for React to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check initial state
        console.log('\n🔍 INITIAL STATE ANALYSIS:');
        const initialState = await page.evaluate(() => {
            return {
                hasTextarea: !!document.querySelector('textarea'),
                hasButton: !!document.querySelector('button:not([disabled])'),
                connectionStatus: document.body.innerText.includes('Connected') ? 'Connected' : 
                                 document.body.innerText.includes('Disconnected') ? 'Disconnected' : 'Unknown',
                claudeReadyText: document.body.innerText.includes('Claude is ready') || 
                               document.body.innerText.includes('ready'),
                thinkingAnimation: !!document.querySelector('.thinking-animation'),
                messagesCount: document.querySelectorAll('.message, .bg-gradient-to-r, .bg-white').length
            };
        });
        
        console.log('📊 Initial State:', JSON.stringify(initialState, null, 2));
        
        // Take screenshot of initial state
        await page.screenshot({ 
            path: 'claude-states-initial.png', 
            fullPage: true 
        });
        console.log('📸 Initial state screenshot saved');
        
        if (!initialState.hasTextarea) {
            console.log('❌ CRITICAL: No textarea found - component not loaded properly');
            return;
        }
        
        // Test state changes by typing and sending a message
        console.log('\n🧪 TESTING STATE TRANSITIONS:');
        
        const testMessage = "Hello Claude! Please respond with exactly: 'I am Claude and I am working correctly.'";
        console.log(`💬 Typing test message: "${testMessage}"`);
        
        await page.focus('textarea');
        await page.type('textarea', testMessage);
        
        // Check state after typing
        const typingState = await page.evaluate(() => {
            const textarea = document.querySelector('textarea');
            const button = document.querySelector('button:not([disabled])');
            return {
                textareaValue: textarea?.value || '',
                buttonEnabled: button && !button.disabled,
                buttonText: button?.textContent || button?.innerHTML || 'No button text'
            };
        });
        
        console.log('📝 After typing:', JSON.stringify(typingState, null, 2));
        
        // Take screenshot with message typed
        await page.screenshot({ 
            path: 'claude-states-typed.png', 
            fullPage: true 
        });
        
        if (!typingState.buttonEnabled) {
            console.log('⚠️ Button is disabled - checking why...');
            
            const buttonState = await page.evaluate(() => {
                const button = document.querySelector('button');
                return {
                    disabled: button?.disabled,
                    className: button?.className,
                    title: button?.title,
                    textContent: button?.textContent
                };
            });
            console.log('🔘 Button state:', JSON.stringify(buttonState, null, 2));
        }
        
        // Click the send button
        console.log('📤 Clicking send button...');
        await page.click('button:not([disabled])');
        
        // Monitor state changes for 30 seconds
        console.log('\n⏱️ MONITORING STATE CHANGES (30 seconds):');
        
        let previousState = { messagesCount: initialState.messagesCount };
        
        for (let i = 0; i < 30; i++) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const currentState = await page.evaluate(() => {
                return {
                    messagesCount: document.querySelectorAll('.message, .bg-gradient-to-r, .bg-white').length,
                    hasThinkingAnimation: !!document.querySelector('.thinking-animation'),
                    hasThinkingDots: !!document.querySelector('.thinking-dots'),
                    textareaDisabled: document.querySelector('textarea')?.disabled || false,
                    textareaPlaceholder: document.querySelector('textarea')?.placeholder || '',
                    connectionText: Array.from(document.querySelectorAll('*')).find(el => 
                        el.textContent && (el.textContent.includes('Connected') || el.textContent.includes('ready')))?.textContent || 'Not found',
                    lastMessageText: Array.from(document.querySelectorAll('.bg-white, .bg-gradient-to-r')).pop()?.textContent?.substring(0, 100) || 'No messages'
                };
            });
            
            // Check if state changed
            if (currentState.messagesCount !== previousState.messagesCount ||
                currentState.hasThinkingAnimation !== previousState.hasThinkingAnimation ||
                currentState.textareaDisabled !== previousState.textareaDisabled) {
                
                console.log(`📊 [${i+1}s] State Change:`, JSON.stringify(currentState, null, 2));
                previousState = { ...currentState };
                
                // Take screenshot on significant state changes
                if (currentState.hasThinkingAnimation || currentState.messagesCount > initialState.messagesCount + 1) {
                    await page.screenshot({ 
                        path: `claude-states-${i+1}s.png`, 
                        fullPage: true 
                    });
                    console.log(`📸 State change screenshot saved (${i+1}s)`);
                }
            }
            
            // Check for Claude response
            if (currentState.lastMessageText.includes('Claude') && currentState.lastMessageText.includes('working correctly')) {
                console.log('✅ CLAUDE RESPONDED CORRECTLY!');
                console.log(`📝 Response: "${currentState.lastMessageText}"`);
                break;
            }
        }
        
        // Final state analysis
        console.log('\n📋 FINAL STATE ANALYSIS:');
        const finalState = await page.evaluate(() => {
            const messages = Array.from(document.querySelectorAll('.bg-white, .bg-gradient-to-r')).map(el => ({
                text: el.textContent?.substring(0, 50) || '',
                className: el.className,
                isUser: el.className.includes('from-blue'),
                isClaude: el.className.includes('bg-white')
            }));
            
            return {
                totalMessages: messages.length,
                userMessages: messages.filter(m => m.isUser).length,
                claudeMessages: messages.filter(m => m.isClaude).length,
                lastClaudeMessage: messages.filter(m => m.isClaude).pop()?.text || 'None',
                hasActiveThinking: !!document.querySelector('.thinking-animation'),
                connectionVisible: !!Array.from(document.querySelectorAll('*')).find(el => 
                    el.textContent && el.textContent.includes('Connected')),
                readyStateVisible: !!Array.from(document.querySelectorAll('*')).find(el => 
                    el.textContent && el.textContent.includes('ready'))
            };
        });
        
        console.log('🏁 Final Analysis:', JSON.stringify(finalState, null, 2));
        
        // Take final screenshot
        await page.screenshot({ 
            path: 'claude-states-final.png', 
            fullPage: true 
        });
        console.log('📸 Final screenshot saved');
        
        // Summary
        console.log('\n🎯 INVESTIGATION SUMMARY:');
        console.log('=======================');
        
        if (finalState.claudeMessages > 0) {
            console.log('✅ Claude IS responding');
            console.log(`📊 Messages: ${finalState.userMessages} user, ${finalState.claudeMessages} Claude`);
        } else {
            console.log('❌ Claude is NOT responding');
            console.log('🔍 Possible issues:');
            console.log('  - WebSocket connection problems');
            console.log('  - Message filtering too aggressive');
            console.log('  - State management issues');
        }
        
        console.log('\n📂 Screenshots saved:');
        console.log('  - claude-states-initial.png (page load)');
        console.log('  - claude-states-typed.png (message typed)'); 
        console.log('  - claude-states-[X]s.png (state changes)');
        console.log('  - claude-states-final.png (final result)');
        
        console.log('\n💡 Keep browser open for 15 seconds for manual inspection...');
        await new Promise(resolve => setTimeout(resolve, 15000));
        
    } catch (error) {
        console.error('❌ Investigation failed:', error.message);
    } finally {
        await browser.close();
    }
}

// Check services first
async function checkServices() {
    console.log('🔍 Checking services...');
    
    try {
        const frontendResp = await fetch('http://localhost:8080');
        console.log('✅ Frontend running on port 8080');
    } catch (e) {
        console.log('❌ Frontend not running');
        return false;
    }
    
    try {
        const claudeResp = await fetch('http://localhost:8081');
        console.log('✅ Claude AI service running on port 8081'); 
    } catch (e) {
        console.log('❌ Claude AI service not running');
        return false;
    }
    
    return true;
}

async function main() {
    const servicesOk = await checkServices();
    if (!servicesOk) {
        console.log('\n❌ Services not ready. Please start them first.');
        process.exit(1);
    }
    
    console.log('\n🚀 Services ready, starting investigation...\n');
    await investigateClaudeStates();
}

main().catch(console.error);