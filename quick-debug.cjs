#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function quickDebug() {
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    await page.goto('http://localhost:8080/backtesting', { waitUntil: 'networkidle2' });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Get page content
    const content = await page.content();
    console.log('Page content preview (first 500 chars):', content.substring(0, 500));
    
    // Check for React mount
    const hasReact = content.includes('react') || content.includes('React');
    console.log('Has React content:', hasReact);
    
    // Check for any tabs
    const tabs = await page.$$eval('*', els => 
        els.filter(el => el.textContent && 
                   (el.textContent.toLowerCase().includes('tab') ||
                    el.textContent.toLowerCase().includes('backtest') ||
                    el.textContent.toLowerCase().includes('paper') ||
                    el.textContent.toLowerCase().includes('trading')))
           .map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0, 100) }))
    );
    console.log('Found elements with relevant text:', tabs);
    
    await browser.close();
}

quickDebug();