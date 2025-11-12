#!/usr/bin/env node

/**
 * WebSocket Connection Debug Test
 * Check if frontend is properly connecting to WebSocket for options data
 */

const puppeteer = require('puppeteer');

async function debugWebSocketConnection() {
  let browser;
  
  try {
    console.log('🔍 Starting WebSocket Connection Debug...');
    
    browser = await puppeteer.launch({ 
      headless: false,
      defaultViewport: { width: 1600, height: 1000 },
      devtools: true
    });
    
    const page = await browser.newPage();
    
    // Monitor console messages for WebSocket activity
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[Shared WebSocket]') || 
          text.includes('[ULTRA-FAST]') || 
          text.includes('Connected to') ||
          text.includes('WebSocket') ||
          text.includes('Connected clients') ||
          text.includes('connection')) {
        console.log(`🖥️  FRONTEND: ${text}`);
      }
    });
    
    console.log('🌐 Loading application...');
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Click Live Paper Trading tab to trigger WebSocket connection
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
      
      // Check WebSocket connection status in detail
      const wsStatus = await page.evaluate(() => {
        // Check for WebSocket in global scope
        const globalWs = window.ws;
        
        // Check for active WebSocket connections
        let activeConnections = 0;
        let wsDetails = [];
        
        // Look for any WebSocket references
        const wsInstances = [];
        try {
          // Try to find WebSocket instances in the page
          if (typeof WebSocket !== 'undefined') {
            wsInstances.push('WebSocket constructor available');
          }
          
          if (globalWs) {
            wsDetails.push({
              type: 'global window.ws',
              readyState: globalWs.readyState,
              url: globalWs.url,
              states: {
                CONNECTING: WebSocket.CONNECTING,
                OPEN: WebSocket.OPEN, 
                CLOSING: WebSocket.CLOSING,
                CLOSED: WebSocket.CLOSED
              },
              currentState: globalWs.readyState === WebSocket.CONNECTING ? 'CONNECTING' :
                          globalWs.readyState === WebSocket.OPEN ? 'OPEN' :
                          globalWs.readyState === WebSocket.CLOSING ? 'CLOSING' : 'CLOSED'
            });
          }
          
        } catch (e) {
          wsDetails.push({ error: e.message });
        }
        
        return {
          wsInstances,
          wsDetails,
          activeConnections,
          hasGlobalWs: !!globalWs
        };
      });
      
      console.log('📡 WebSocket Status:');
      console.log('   WebSocket instances:', wsStatus.wsInstances);
      console.log('   WebSocket details:', JSON.stringify(wsStatus.wsDetails, null, 2));
      console.log('   Has global WebSocket:', wsStatus.hasGlobalWs);
      
      // Check if useMultiSymbolWebSocket is active
      const hookStatus = await page.evaluate(() => {
        // Look for React component state or debug info
        const reactDebug = [];
        
        // Check for hook debugging
        try {
          if (window.React) {
            reactDebug.push('React available');
          }
          
          // Look for elements that might indicate WebSocket usage
          const liveElements = Array.from(document.querySelectorAll('*'))
            .filter(el => {
              const text = el.textContent || '';
              return text.includes('LIVE') || 
                     text.includes('Connected') || 
                     text.includes('WebSocket') ||
                     el.id?.includes('live') ||
                     el.className?.includes('live');
            })
            .map(el => ({
              tag: el.tagName,
              id: el.id,
              className: el.className,
              text: (el.textContent || '').substring(0, 100)
            }))
            .slice(0, 5);
            
          return {
            reactDebug,
            liveElements: liveElements.length,
            sampleElements: liveElements
          };
        } catch (e) {
          return { error: e.message };
        }
      });
      
      console.log('⚛️  React/Hook Status:');
      console.log(JSON.stringify(hookStatus, null, 2));
      
      // Wait and monitor for 10 more seconds
      console.log('⏱️  Monitoring for 10 seconds...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Final check - try to trigger WebSocket connection manually
      const manualTrigger = await page.evaluate(() => {
        try {
          // Try to create WebSocket connection manually for testing
          const testWs = new WebSocket('ws://localhost:3001/ws?symbols=SPY,QQQ');
          
          return new Promise((resolve) => {
            let result = { attempted: true };
            
            const timeout = setTimeout(() => {
              result.timeout = true;
              testWs.close();
              resolve(result);
            }, 5000);
            
            testWs.onopen = () => {
              result.connected = true;
              result.readyState = testWs.readyState;
              result.url = testWs.url;
              clearTimeout(timeout);
              testWs.close();
              resolve(result);
            };
            
            testWs.onerror = (error) => {
              result.error = 'Connection error';
              clearTimeout(timeout);
              resolve(result);
            };
            
            testWs.onclose = (event) => {
              result.closed = true;
              result.closeCode = event.code;
              result.closeReason = event.reason;
              clearTimeout(timeout);
              resolve(result);
            };
          });
        } catch (e) {
          return { error: e.message };
        }
      });
      
      console.log('🧪 Manual WebSocket Test Result:');
      console.log(JSON.stringify(manualTrigger, null, 2));
      
    } else {
      console.log('❌ Could not find Live Paper Trading tab');
    }
    
    console.log('✅ WebSocket debug completed!');
    
    // Keep browser open for inspection
    console.log('🔄 Keeping browser open for 10 seconds for manual inspection...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
  } catch (error) {
    console.error('❌ WebSocket debug failed:', error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

debugWebSocketConnection().catch(console.error);