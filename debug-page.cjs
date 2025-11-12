#!/usr/bin/env node

/**
 * Debug the blank backtesting page issue
 */

const puppeteer = require('puppeteer');

async function debugPage() {
    const browser = await puppeteer.launch({ 
        headless: false, 
        defaultViewport: { width: 1920, height: 1080 },
        devtools: true // Open DevTools automatically
    });
    
    const page = await browser.newPage();
    
    // Listen for console messages
    page.on('console', msg => {
        console.log('BROWSER CONSOLE:', msg.type(), msg.text());
    });
    
    // Listen for page errors
    page.on('pageerror', error => {
        console.log('PAGE ERROR:', error.message);
    });
    
    // Listen for failed requests
    page.on('requestfailed', request => {
        console.log('FAILED REQUEST:', request.url(), request.failure().errorText);
    });
    
    try {
        console.log('🌐 Loading backtesting page...');
        await page.goto('http://localhost:8080/backtesting', { 
            waitUntil: 'networkidle2',
            timeout: 30000
        });
        
        console.log('✅ Page loaded, checking DOM...');
        
        // Check if React root exists
        const reactRoot = await page.$('#root');
        console.log('React root exists:', !!reactRoot);
        
        // Check page title
        const title = await page.title();
        console.log('Page title:', title);
        
        // Check body content
        const bodyText = await page.evaluate(() => document.body.textContent);
        console.log('Body text length:', bodyText.length);
        console.log('Body preview:', bodyText.substring(0, 200));
        
        // Check for any visible content
        const visibleElements = await page.$$eval('*', els => 
            els.filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && 
                       style.visibility !== 'hidden' && 
                       el.offsetWidth > 0 && 
                       el.offsetHeight > 0;
            }).length
        );
        console.log('Visible elements count:', visibleElements);
        
        // Wait for a few seconds to see console messages
        await new Promise(resolve => setTimeout(resolve, 5000));
        
    } catch (error) {
        console.error('❌ Error loading page:', error.message);
    }
    
    console.log('Press Ctrl+C to close browser and exit...');
    // Keep browser open for inspection
    await new Promise(() => {}); // Never resolves, keeps browser open
}

debugPage();