#!/usr/bin/env node

/**
 * Frontend Data Reception Debug Test
 * Check what the frontend is actually receiving from WebSocket and API
 */

const puppeteer = require('puppeteer');

async function debugFrontendDataReception() {
  let browser;
  
  try {
    console.log('🔍 Starting Frontend Data Reception Debug...');
    
    browser = await puppeteer.launch({ 
      headless: false,
      defaultViewport: { width: 1600, height: 1000 },
      devtools: true
    });
    
    const page = await browser.newPage();
    
    // Intercept all network requests
    await page.setRequestInterception(true);
    
    let apiCalls = [];
    let wsMessages = [];
    
    page.on('request', request => {
      if (request.url().includes('/api/')) {
        console.log(`📡 API Request: ${request.method()} ${request.url()}`);
        if (request.postData()) {
          console.log(`   Body: ${request.postData()}`);
        }
        apiCalls.push({
          method: request.method(),
          url: request.url(),
          body: request.postData()
        });
      }
      request.continue();
    });
    
    page.on('response', async response => {
      if (response.url().includes('/api/options-matrix-data')) {
        console.log(`📊 Options Matrix API Response: ${response.status()}`);
        try {
          const data = await response.json();
          console.log(`   Contracts: ${data.contracts?.length || 0}`);
          console.log(`   Current Price: $${data.currentPrice || 'N/A'}`);
          console.log(`   Symbol: ${data.symbol || 'N/A'}`);
        } catch (e) {
          console.log('   Failed to parse response');
        }
      }
    });
    
    // Monitor console messages
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[LIVE OPTIONS]') || 
          text.includes('[TAB SWITCH]') || 
          text.includes('[OPTIONS INIT]') ||
          text.includes('[ULTRA-FAST]') ||
          text.includes('optionQuoteUpdate')) {
        console.log(`🖥️  FRONTEND: ${text}`);
      }
    });
    
    console.log('🌐 Loading application...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 4000));
    
    console.log('📸 Initial state screenshot...');
    await page.screenshot({ 
      path: 'screenshots/debug-initial-state.png',
      fullPage: true
    });
    
    // Click Live Paper Trading tab
    console.log('🎯 Clicking Live Paper Trading tab...');
    
    const tabClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const paperBtn = buttons.find(btn => 
        btn.textContent && btn.textContent.toLowerCase().includes('live paper trading')
      );
      
      if (paperBtn) {
        paperBtn.click();
        return true;
      }
      return false;
    });
    
    if (tabClicked) {
      console.log('✅ Live Paper Trading tab clicked!');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Check WebSocket connection status
      const wsStatus = await page.evaluate(() => {
        return {
          readyState: window.ws ? window.ws.readyState : 'No WebSocket found',
          url: window.ws ? window.ws.url : 'N/A'
        };
      });
      
      console.log(`📡 WebSocket Status: ${JSON.stringify(wsStatus)}`);
      
      // Check if options data exists in the DOM
      const optionsDataCheck = await page.evaluate(() => {
        // Check for options matrix elements
        const matrixHeaders = Array.from(document.querySelectorAll('h2, h3'))
          .filter(el => el.textContent && el.textContent.toLowerCase().includes('options matrix'));
        
        const optionRows = Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const text = el.textContent || '';
            return text.includes('CALL') || text.includes('PUT');
          });
          
        const badges = Array.from(document.querySelectorAll('[class*="badge"]'))
          .map(el => el.textContent);
          
        return {
          matrixHeaders: matrixHeaders.length,
          optionRows: optionRows.length,
          badges: badges.filter(b => b && (b.includes('LIVE') || b.includes('OPTIONS')))
        };
      });
      
      console.log('📊 Options Data in DOM:');
      console.log(`   Matrix Headers: ${optionsDataCheck.matrixHeaders}`);
      console.log(`   Option Rows: ${optionsDataCheck.optionRows}`);
      console.log(`   Live Badges: ${JSON.stringify(optionsDataCheck.badges)}`);
      
      // Take screenshot after tab switch
      console.log('📸 After tab switch screenshot...');
      await page.screenshot({ 
        path: 'screenshots/debug-after-tab-switch.png',
        fullPage: true
      });
      
      // Wait and monitor for WebSocket messages
      console.log('🎧 Monitoring WebSocket messages for 10 seconds...');
      
      // Inject WebSocket message monitoring
      await page.evaluate(() => {
        if (window.ws && window.ws.readyState === WebSocket.OPEN) {
          const originalOnMessage = window.ws.onmessage;
          window.ws.onmessage = function(event) {
            try {
              const message = JSON.parse(event.data);
              if (message.type === 'option_quote' || message.type === 'option_trade') {
                console.log(`[WS DEBUG] ${message.type}: ${message.data?.symbol} - $${message.data?.bid}/$${message.data?.ask}`);
              }
            } catch (e) {
              // Ignore parsing errors
            }
            
            if (originalOnMessage) {
              originalOnMessage.call(this, event);
            }
          };
        }
      });
      
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Final check of DOM state
      const finalCheck = await page.evaluate(() => {
        const optionElements = Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const text = el.textContent || '';
            return text.match(/SPY\d+[CP]\d+/) || text.includes('CALL') || text.includes('PUT');
          })
          .map(el => el.textContent?.substring(0, 100))
          .slice(0, 5);
          
        return {
          optionElements: optionElements.length,
          sampleElements: optionElements
        };
      });
      
      console.log('📊 Final Options Check:');
      console.log(`   Option Elements Found: ${finalCheck.optionElements}`);
      finalCheck.sampleElements.forEach((text, i) => {
        console.log(`   ${i + 1}. ${text}...`);
      });
      
    } else {
      console.log('❌ Could not find Live Paper Trading tab');
    }
    
    console.log('📸 Final screenshot...');
    await page.screenshot({ 
      path: 'screenshots/debug-final-state.png',
      fullPage: true
    });
    
    console.log('📋 Summary:');
    console.log(`   API Calls Made: ${apiCalls.length}`);
    apiCalls.forEach((call, i) => {
      console.log(`   ${i + 1}. ${call.method} ${call.url}`);
    });
    
    console.log('✅ Frontend debug completed!');
    console.log('🔍 Check screenshots/ directory for visual results');
    
    // Keep browser open for manual inspection
    console.log('🔄 Keeping browser open for 15 seconds for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
  } catch (error) {
    console.error('❌ Debug test failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugFrontendDataReception().catch(console.error);