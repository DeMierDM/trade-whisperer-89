#!/usr/bin/env node
/**
 * Debug Claude Terminal Input
 * Test the terminal-input event handling
 */

const puppeteer = require('puppeteer');

async function debugClaudeInput() {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: { width: 1200, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    
    // Monitor console logs from frontend
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('TERMINAL-INPUT') || text.includes('claude-processing') || text.includes('claude-response')) {
        console.log('[FRONTEND]', text);
      }
    });

    console.log('🧪 Debugging Claude terminal input handling...');
    console.log('🌐 Navigating to frontend...');
    
    await page.goto('http://localhost:8080', { waitUntil: 'networkidle0' });
    
    console.log('🎯 Waiting for Claude chat to be ready...');
    await page.waitForSelector('textarea', { timeout: 15000 });
    
    // Wait a moment for WebSocket to establish
    await page.waitForTimeout(3000);
    
    console.log('📤 Sending test message...');
    
    // Enter message
    const textarea = await page.$('textarea');
    await textarea.click();
    await textarea.type('What is 2 + 2?', { delay: 50 });
    
    // Send message
    const sendButton = await page.$('button[type="submit"]');
    await sendButton.click();
    
    console.log('⏱️  Monitoring for 15 seconds...');
    await page.waitForTimeout(15000);
    
    console.log('🏁 Debug complete');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    console.log('🔍 Leaving browser open for inspection...');
    // Don't close browser for manual inspection
    // await browser.close();
  }
}

debugClaudeInput().catch(console.error);