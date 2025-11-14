const puppeteer = require('puppeteer');
const fs = require('fs');
const axios = require('axios');

class FrontendAPIRoutingDebugger {
    constructor() {
        this.browser = null;
        this.page = null;
        this.screenshots = [];
        this.results = {
            frontendRunning: false,
            apiServerRunning: false,
            endpointExists: false,
            frontendCanAccessEndpoint: false,
            routingIssue: null,
            fixNeeded: null
        };
    }

    async initialize() {
        console.log('🚀 Starting Frontend API Routing Debug...\n');
        
        this.browser = await puppeteer.launch({
            headless: false,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
            defaultViewport: { width: 1400, height: 900 }
        });
        
        this.page = await this.browser.newPage();
        
        // Enable network monitoring
        await this.page.setRequestInterception(true);
        
        this.page.on('request', request => {
            const url = request.url();
            if (url.includes('/api/options-matrix-data')) {
                console.log(`🌐 API Call Detected: ${url}`);
                console.log(`   Method: ${request.method()}`);
                console.log(`   Headers:`, request.headers());
            }
            request.continue();
        });
        
        this.page.on('response', response => {
            const url = response.url();
            if (url.includes('/api/options-matrix-data')) {
                console.log(`📡 API Response: ${url} -> ${response.status()}`);
            }
        });
        
        this.page.on('console', msg => {
            if (msg.text().includes('options') || msg.text().includes('matrix')) {
                console.log(`🖥️  Frontend Console: ${msg.text()}`);
            }
        });
    }

    async testBackendDirectly() {
        console.log('📊 Testing Backend API Server Direct Access...\n');
        
        try {
            // Test API server health
            const healthResponse = await axios.get('http://localhost:3005/health');
            console.log('✅ API Server Health:', healthResponse.data);
            this.results.apiServerRunning = true;
            
            // Test options matrix endpoint directly
            const optionsResponse = await axios.post('http://localhost:3005/api/options-matrix-data', {
                symbol: 'SPY'
            });
            console.log('✅ Options Matrix Endpoint Response:', {
                status: optionsResponse.status,
                dataLength: optionsResponse.data?.length || 0,
                sample: optionsResponse.data?.slice(0, 3) || []
            });
            this.results.endpointExists = true;
            
        } catch (error) {
            console.log('❌ Backend API Error:', error.message);
            this.results.apiServerRunning = false;
        }
    }

    async testFrontendAccess() {
        console.log('\n🎯 Testing Frontend Access to Options Matrix...\n');
        
        try {
            await this.page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
            this.results.frontendRunning = true;
            
            // Take initial screenshot
            await this.takeScreenshot('01_initial_frontend');
            
            // Wait for charts to load
            await this.page.waitForTimeout(3000);
            
            // Look for options matrix or trading chart
            const hasOptionsMatrix = await this.page.$('.options-matrix, [data-testid="options-matrix"], .trading-chart');
            if (hasOptionsMatrix) {
                console.log('✅ Options Matrix component found');
                await this.takeScreenshot('02_options_matrix_found');
            } else {
                console.log('❌ Options Matrix component not found');
            }
            
            // Try to trigger options data fetch manually
            const fetchResult = await this.page.evaluate(async () => {
                try {
                    console.log('🔄 Testing direct API call from frontend...');
                    
                    // Test relative path (what frontend currently uses)
                    const relativeResponse = await fetch('/api/options-matrix-data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ symbol: 'SPY' })
                    });
                    
                    return {
                        relativePathStatus: relativeResponse.status,
                        relativePathOk: relativeResponse.ok,
                        error: relativeResponse.ok ? null : await relativeResponse.text()
                    };
                    
                } catch (error) {
                    return {
                        relativePathStatus: 'ERROR',
                        relativePathOk: false,
                        error: error.message
                    };
                }
            });
            
            console.log('📡 Frontend API Call Results:', fetchResult);
            
            if (!fetchResult.relativePathOk) {
                console.log('❌ Frontend cannot access /api/options-matrix-data via relative path');
                this.results.frontendCanAccessEndpoint = false;
                this.results.routingIssue = 'Frontend calls /api/options-matrix-data but no proxy routes it to port 3005';
            } else {
                console.log('✅ Frontend can access API endpoint');
                this.results.frontendCanAccessEndpoint = true;
            }
            
            // Test direct port access from frontend
            const directPortTest = await this.page.evaluate(async () => {
                try {
                    const directResponse = await fetch('http://localhost:3005/api/options-matrix-data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ symbol: 'SPY' })
                    });
                    
                    return {
                        directPortStatus: directResponse.status,
                        directPortOk: directResponse.ok,
                        dataReceived: directResponse.ok ? await directResponse.json() : null
                    };
                } catch (error) {
                    return {
                        directPortStatus: 'ERROR',
                        directPortOk: false,
                        error: error.message
                    };
                }
            });
            
            console.log('🔗 Direct Port Test Results:', directPortTest);
            
            await this.takeScreenshot('03_api_test_results');
            
        } catch (error) {
            console.log('❌ Frontend Access Error:', error.message);
            this.results.frontendRunning = false;
        }
    }

    async analyzeFix() {
        console.log('\n🔧 Analyzing Required Fix...\n');
        
        if (this.results.apiServerRunning && this.results.endpointExists && !this.results.frontendCanAccessEndpoint) {
            this.results.fixNeeded = 'ADD_VITE_PROXY';
            console.log('💡 Fix Needed: Add Vite proxy configuration to route /api/* to port 3005');
            console.log('   Current: Frontend calls /api/options-matrix-data (port 8080)');
            console.log('   Backend: API server listening on port 3005');
            console.log('   Solution: Configure Vite proxy in vite.config.ts');
        } else if (!this.results.apiServerRunning) {
            this.results.fixNeeded = 'START_API_SERVER';
            console.log('💡 Fix Needed: Start API server on port 3005');
        } else if (!this.results.endpointExists) {
            this.results.fixNeeded = 'IMPLEMENT_ENDPOINT';
            console.log('💡 Fix Needed: Implement /api/options-matrix-data endpoint');
        } else {
            console.log('✅ Everything appears to be working correctly');
        }
    }

    async takeScreenshot(name) {
        const filename = `debug-screenshots/${name}.png`;
        await this.page.screenshot({ 
            path: filename, 
            fullPage: true 
        });
        this.screenshots.push(filename);
        console.log(`📸 Screenshot: ${filename}`);
    }

    async generateReport() {
        console.log('\n📋 FRONTEND API ROUTING DEBUG REPORT\n');
        console.log('='.repeat(50));
        
        console.log('\n🔍 Diagnostic Results:');
        Object.entries(this.results).forEach(([key, value]) => {
            const status = typeof value === 'boolean' ? (value ? '✅' : '❌') : '📄';
            console.log(`   ${status} ${key}: ${value}`);
        });
        
        console.log('\n📸 Screenshots Generated:');
        this.screenshots.forEach(screenshot => {
            console.log(`   - ${screenshot}`);
        });
        
        if (this.results.fixNeeded === 'ADD_VITE_PROXY') {
            console.log('\n🛠️  RECOMMENDED FIX:');
            console.log('   Add this to vite.config.ts:');
            console.log('   ```typescript');
            console.log('   server: {');
            console.log('     // ... existing config');
            console.log('     proxy: {');
            console.log('       "/api": {');
            console.log('         target: "http://localhost:3005",');
            console.log('         changeOrigin: true,');
            console.log('         secure: false');
            console.log('       }');
            console.log('     }');
            console.log('   }');
            console.log('   ```');
        }
        
        console.log('\n✨ Debug Complete! Check screenshots for visual confirmation.');
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

// Run the debugger
const apiDebugger = new FrontendAPIRoutingDebugger();

apiDebugger.initialize()
    .then(() => apiDebugger.testBackendDirectly())
    .then(() => apiDebugger.testFrontendAccess())
    .then(() => apiDebugger.analyzeFix())
    .then(() => apiDebugger.generateReport())
    .catch(error => {
        console.error('❌ Debug Error:', error);
    })
    .finally(() => {
        apiDebugger.cleanup();
    });