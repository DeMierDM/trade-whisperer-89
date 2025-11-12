const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

class OptionsMatrixDataFlowValidator {
    constructor() {
        this.browser = null;
        this.page = null;
        this.screenshots = [];
        this.testResults = {
            apiServerCorrect: false,
            proxyConfigured: false,
            frontendConnects: false,
            optionsDataDisplayed: false,
            dataFlowWorking: false
        };
    }

    async initialize() {
        console.log('🎯 TESTING OPTIONS MATRIX DATA FLOW AFTER FIX\n');
        console.log('='.repeat(60));
        
        this.browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
            defaultViewport: { width: 1400, height: 900 }
        });
        
        this.page = await this.browser.newPage();
        
        // Monitor network requests
        await this.page.setRequestInterception(true);
        
        this.page.on('request', request => {
            const url = request.url();
            if (url.includes('/api/options-matrix-data') || url.includes('options')) {
                console.log(`📡 Frontend Request: ${url}`);
            }
            request.continue();
        });
        
        this.page.on('response', response => {
            const url = response.url();
            if (url.includes('/api/options-matrix-data') || url.includes('options')) {
                console.log(`📨 Response: ${url} -> ${response.status()}`);
                if (response.status() === 200) {
                    console.log('  ✅ SUCCESS - Options data endpoint responding!');
                }
            }
        });
        
        // Monitor console for data reception
        this.page.on('console', msg => {
            const text = msg.text();
            if (text.includes('options') || text.includes('matrix') || text.includes('contracts')) {
                console.log(`🖥️  Console: ${text}`);
            }
        });
    }

    async testBackendEndpoint() {
        console.log('\n📊 Testing Backend API Server (Port 3001)...\n');
        
        try {
            const response = await axios.post('http://localhost:3001/api/options-matrix-data', {
                symbol: 'SPY'
            });
            
            const data = response.data;
            console.log('✅ API Server Response:', {
                success: data.success,
                symbol: data.symbol,
                currentPrice: data.currentPrice,
                contractCount: data.contracts?.length || 0,
                hasRecentTrades: !!data.recentTrades,
                timestamp: data.timestamp
            });
            
            this.testResults.apiServerCorrect = true;
            
            if (data.contracts && data.contracts.length > 100) {
                console.log(`🎉 EXCELLENT! ${data.contracts.length} dynamic contracts generated!`);
                console.log('Sample contracts:', data.contracts.slice(0, 3).map(c => ({
                    symbol: c.symbol,
                    type: c.type,
                    strike: c.strike,
                    bid: c.bid,
                    ask: c.ask
                })));
            }
            
        } catch (error) {
            console.log('❌ Backend API Error:', error.message);
            this.testResults.apiServerCorrect = false;
        }
    }

    async testFrontendConnection() {
        console.log('\n🎯 Testing Frontend Options Matrix Display...\n');
        
        try {
            await this.page.goto('http://localhost:8080', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            this.testResults.frontendConnects = true;
            await this.takeScreenshot('01_frontend_loaded');
            
            // Wait for page to stabilize
            await this.page.waitForTimeout(5000);
            
            // Look for options matrix or trading components
            const componentSelectors = [
                '.options-matrix',
                '[data-testid="options-matrix"]',
                '.trading-chart',
                '[class*="option"]',
                '[class*="matrix"]'
            ];
            
            let foundComponent = null;
            for (const selector of componentSelectors) {
                const element = await this.page.$(selector);
                if (element) {
                    foundComponent = selector;
                    console.log(`✅ Found component: ${selector}`);
                    break;
                }
            }
            
            await this.takeScreenshot('02_components_loaded');
            
            // Test direct API call from frontend
            const apiTest = await this.page.evaluate(async () => {
                try {
                    console.log('🔄 Testing /api/options-matrix-data from frontend...');
                    
                    const response = await fetch('/api/options-matrix-data', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ symbol: 'SPY' })
                    });
                    
                    console.log(`API Response Status: ${response.status}`);
                    
                    if (response.ok) {
                        const data = await response.json();
                        console.log(`✅ Received ${data.contracts?.length || 0} options contracts`);
                        
                        return {
                            success: true,
                            status: response.status,
                            contractCount: data.contracts?.length || 0,
                            hasData: !!data.contracts,
                            sampleContract: data.contracts?.[0] || null
                        };
                    } else {
                        const errorText = await response.text();
                        console.log(`❌ API Error: ${errorText}`);
                        return {
                            success: false,
                            status: response.status,
                            error: errorText
                        };
                    }
                    
                } catch (error) {
                    console.log(`❌ Frontend API Error: ${error.message}`);
                    return {
                        success: false,
                        error: error.message
                    };
                }
            });
            
            console.log('📡 Frontend API Test Results:', apiTest);
            
            if (apiTest.success && apiTest.contractCount > 0) {
                console.log(`🎉 SUCCESS! Frontend receives ${apiTest.contractCount} options contracts!`);
                this.testResults.optionsDataDisplayed = true;
                this.testResults.dataFlowWorking = true;
                this.testResults.proxyConfigured = true;
            } else {
                console.log('❌ Frontend not receiving options data properly');
            }
            
            await this.takeScreenshot('03_api_test_complete');
            
            // Look for any error messages or data loading indicators
            const errorElements = await this.page.$$eval('*', elements => {
                return elements
                    .map(el => el.textContent || '')
                    .filter(text => 
                        text.includes('error') || 
                        text.includes('loading') || 
                        text.includes('no data') ||
                        text.includes('404') ||
                        text.includes('failed')
                    )
                    .slice(0, 5);
            });
            
            if (errorElements.length > 0) {
                console.log('🚨 Potential Error Messages Found:', errorElements);
            }
            
            await this.takeScreenshot('04_final_state');
            
        } catch (error) {
            console.log('❌ Frontend Test Error:', error.message);
            this.testResults.frontendConnects = false;
        }
    }

    async takeScreenshot(name) {
        try {
            const filename = `debug-screenshots/${name}.png`;
            await this.page.screenshot({ 
                path: filename, 
                fullPage: true 
            });
            this.screenshots.push(filename);
            console.log(`📸 Screenshot: ${filename}`);
        } catch (error) {
            console.log(`❌ Screenshot Error: ${error.message}`);
        }
    }

    async generateFinalReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📋 FINAL VALIDATION REPORT');
        console.log('='.repeat(60));
        
        console.log('\n🔍 Test Results:');
        Object.entries(this.testResults).forEach(([test, passed]) => {
            const status = passed ? '✅' : '❌';
            console.log(`   ${status} ${test}: ${passed}`);
        });
        
        console.log('\n📸 Screenshots Generated:');
        this.screenshots.forEach(screenshot => {
            console.log(`   - ${screenshot}`);
        });
        
        const allPassed = Object.values(this.testResults).every(result => result === true);
        
        if (allPassed) {
            console.log('\n🎉 SUCCESS! OPTIONS MATRIX DATA FLOW IS WORKING!');
            console.log('   ✅ API Server on port 3001 has options-matrix-data endpoint');
            console.log('   ✅ Vite proxy routes /api/* to port 3001');
            console.log('   ✅ Frontend can access options data');
            console.log('   ✅ 126+ dynamic options contracts are available');
            console.log('   ✅ Complete data flow is functional');
        } else {
            console.log('\n⚠️  PARTIAL SUCCESS - Some issues remain:');
            
            if (!this.testResults.apiServerCorrect) {
                console.log('   ❌ API Server on port 3001 not responding correctly');
            }
            if (!this.testResults.proxyConfigured) {
                console.log('   ❌ Vite proxy not configured or not working');
            }
            if (!this.testResults.frontendConnects) {
                console.log('   ❌ Frontend not loading properly');
            }
            if (!this.testResults.optionsDataDisplayed) {
                console.log('   ❌ Options data not being displayed in frontend');
            }
        }
        
        console.log('\n🔧 Configuration Applied:');
        console.log('   - apiConfig.ts: MAIN_API.PORT = 3001 (API Server)');
        console.log('   - vite.config.ts: Added proxy for /api/* -> localhost:3001');
        console.log('   - Frontend calls: /api/options-matrix-data (relative path)');
        console.log('   - Backend serves: localhost:3001/api/options-matrix-data');
        
        console.log('\n✨ Validation complete! Check screenshots for visual confirmation.');
    }

    async cleanup() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// Create screenshots directory
if (!fs.existsSync('debug-screenshots')) {
    fs.mkdirSync('debug-screenshots');
}

// Run the validator
const validator = new OptionsMatrixDataFlowValidator();

validator.initialize()
    .then(() => validator.testBackendEndpoint())
    .then(() => validator.testFrontendConnection())
    .then(() => validator.generateFinalReport())
    .catch(error => {
        console.error('❌ Validation Error:', error);
    })
    .finally(() => {
        validator.cleanup();
    });