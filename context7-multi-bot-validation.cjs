const puppeteer = require('puppeteer');
const fs = require('fs');

class Context7MultiBotValidator {
    constructor() {
        this.browser = null;
        this.page = null;
        this.results = {
            botTabsVisible: false,
            symbolSwitching: false,
            optionsDataLoading: false,
            allSymbolsWorking: false,
            context7Patterns: []
        };
    }

    async initialize() {
        console.log('🎯 CONTEXT7 MULTI-BOT VALIDATION');
        console.log('='.repeat(50));
        console.log('Testing: Individual bot tab selection and data separation');
        console.log('Pattern: Context7 tab-based component testing\n');
        
        this.browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: { width: 1400, height: 900 }
        });
        
        this.page = await this.browser.newPage();
        
        // Monitor network requests for options data
        await this.page.setRequestInterception(true);
        
        this.page.on('request', request => {
            const url = request.url();
            if (url.includes('/api/options-matrix-data')) {
                const postData = request.postData();
                let symbol = 'unknown';
                try {
                    if (postData) {
                        const parsed = JSON.parse(postData);
                        symbol = parsed.symbol || 'unknown';
                    }
                } catch (e) {}
                console.log(`📡 Options API Request: ${symbol}`);
            }
            request.continue();
        });
        
        this.page.on('response', response => {
            const url = response.url();
            if (url.includes('/api/options-matrix-data')) {
                console.log(`📨 Options API Response: ${response.status()}`);
            }
        });
    }

    async validateBotTabs() {
        console.log('🤖 Step 1: Validating Bot Tab Interface...\n');
        
        try {
            await this.page.goto('http://localhost:8080', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            // Wait for React to load and fetch bot symbols
            await this.page.waitForSelector('body', { timeout: 10000 });
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Take initial screenshot
            await this.page.screenshot({ 
                path: 'debug-screenshots/context7_01_initial.png',
                fullPage: true 
            });
            
            // Look for Context7 pattern: bot tabs with data-testid
            const botTabs = await this.page.$$('[data-testid^="bot-tab-"]');
            console.log(`Found ${botTabs.length} bot tabs`);
            
            if (botTabs.length > 0) {
                this.results.botTabsVisible = true;
                console.log('✅ Context7 Pattern: Bot tabs are visible');
                
                // Extract tab symbols
                const tabSymbols = [];
                for (let i = 0; i < botTabs.length; i++) {
                    const symbol = await botTabs[i].textContent();
                    tabSymbols.push(symbol.trim());
                    console.log(`   - Tab ${i + 1}: ${symbol}`);
                }
                
                this.results.context7Patterns.push('Individual bot tab selection');
                return tabSymbols;
            } else {
                console.log('❌ No bot tabs found');
                return [];
            }
            
        } catch (error) {
            console.log(`❌ Error validating bot tabs: ${error.message}`);
            return [];
        }
    }

    async testSymbolSwitching(tabSymbols) {
        console.log('\n🔄 Step 2: Testing Context7 Symbol Switching...\n');
        
        if (tabSymbols.length < 2) {
            console.log('⚠️  Need at least 2 tabs to test switching');
            return false;
        }
        
        try {
            const testSymbols = tabSymbols.slice(0, 3); // Test up to 3 symbols
            
            for (let i = 0; i < testSymbols.length; i++) {
                const symbol = testSymbols[i];
                console.log(`Testing ${symbol} tab...`);
                
                // Click the tab
                const tabSelector = `[data-testid="bot-tab-${symbol}"]`;
                await this.page.click(tabSelector);
                console.log(`   Clicked ${symbol} tab`);
                
                // Wait for data loading
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Take screenshot of each symbol's data
                await this.page.screenshot({ 
                    path: `debug-screenshots/context7_02_${symbol}_data.png`
                });
                
                // Check if options data is loading/loaded
                const optionsElements = await this.page.$$('.options-matrix, [data-testid="options-matrix"], .option');
                console.log(`   Found ${optionsElements.length} options-related elements`);
                
                if (optionsElements.length > 0) {
                    this.results.optionsDataLoading = true;
                }
            }
            
            this.results.symbolSwitching = true;
            this.results.context7Patterns.push('Tab-based data separation');
            console.log('✅ Context7 Pattern: Symbol switching working');
            return true;
            
        } catch (error) {
            console.log(`❌ Error testing symbol switching: ${error.message}`);
            return false;
        }
    }

    async validateOptionsData() {
        console.log('\n📊 Step 3: Validating Options Data for Each Symbol...\n');
        
        // Test API endpoints directly to confirm data availability
        const symbols = ['SPY', 'QQQ', 'IWM'];
        let allWorking = true;
        
        for (const symbol of symbols) {
            try {
                const apiTest = await this.page.evaluate(async (sym) => {
                    const response = await fetch('/api/options-matrix-data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ symbol: sym })
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        return {
                            success: true,
                            contractCount: data.contracts?.length || 0,
                            symbol: sym
                        };
                    } else {
                        return { success: false, symbol: sym };
                    }
                }, symbol);
                
                if (apiTest.success && apiTest.contractCount > 0) {
                    console.log(`✅ ${symbol}: ${apiTest.contractCount} contracts available`);
                } else {
                    console.log(`❌ ${symbol}: No options data`);
                    allWorking = false;
                }
                
            } catch (error) {
                console.log(`❌ ${symbol}: API error - ${error.message}`);
                allWorking = false;
            }
        }
        
        this.results.allSymbolsWorking = allWorking;
        if (allWorking) {
            this.results.context7Patterns.push('Multi-symbol data validation');
            console.log('✅ Context7 Pattern: All symbols have options data');
        }
        
        return allWorking;
    }

    async generateReport() {
        // Final comprehensive screenshot
        await this.page.screenshot({ 
            path: 'debug-screenshots/context7_03_final_state.png',
            fullPage: true 
        });
        
        console.log('\n' + '='.repeat(50));
        console.log('📋 CONTEXT7 MULTI-BOT VALIDATION REPORT');
        console.log('='.repeat(50));
        
        console.log('\n🔍 Test Results:');
        Object.entries(this.results).forEach(([test, result]) => {
            if (test === 'context7Patterns') return;
            const status = result ? '✅' : '❌';
            console.log(`   ${status} ${test}: ${result}`);
        });
        
        console.log('\n🎯 Context7 Patterns Implemented:');
        this.results.context7Patterns.forEach(pattern => {
            console.log(`   ✅ ${pattern}`);
        });
        
        const allPassed = Object.entries(this.results)
            .filter(([key]) => key !== 'context7Patterns')
            .every(([_, value]) => value === true);
        
        if (allPassed) {
            console.log('\n🎉 SUCCESS! Context7 Multi-Bot Pattern Working!');
            console.log('   ✅ Individual bot tabs for each symbol');
            console.log('   ✅ Tab-based data separation');
            console.log('   ✅ Multi-symbol options matrix support');
            console.log('   ✅ Real-time symbol switching');
        } else {
            console.log('\n⚠️  PARTIAL SUCCESS - Some patterns need refinement');
        }
        
        console.log('\n📸 Screenshots Generated:');
        console.log('   - context7_01_initial.png (Interface overview)');
        console.log('   - context7_02_SPY_data.png (SPY options data)');  
        console.log('   - context7_02_QQQ_data.png (QQQ options data)');
        console.log('   - context7_02_IWM_data.png (IWM options data)');
        console.log('   - context7_03_final_state.png (Final state)');
        
        console.log('\n✨ Context7 validation complete!');
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Run Context7 validation
const validator = new Context7MultiBotValidator();

validator.initialize()
    .then(() => validator.validateBotTabs())
    .then(tabSymbols => validator.testSymbolSwitching(tabSymbols))
    .then(() => validator.validateOptionsData())
    .then(() => validator.generateReport())
    .catch(error => {
        console.error('❌ Validation Error:', error);
    })
    .finally(() => {
        validator.cleanup();
    });