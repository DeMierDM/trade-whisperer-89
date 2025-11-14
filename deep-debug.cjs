#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function deepDebug() {
    const browser = await puppeteer.launch({ 
        headless: false,
        defaultViewport: { width: 1920, height: 1080 }
    });
    const page = await browser.newPage();
    
    // Capture console messages and errors
    page.on('console', msg => console.log('CONSOLE:', msg.text()));
    page.on('pageerror', error => console.log('ERROR:', error.message));
    
    console.log('Loading page...');
    await page.goto('http://localhost:8080/backtesting', { waitUntil: 'networkidle2' });
    
    // Wait much longer for React to render
    console.log('Waiting for React to render...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Check if root div has content
    const rootContent = await page.$eval('#root', el => el.innerHTML.length);
    console.log('Root div content length:', rootContent);
    
    // Check all div elements
    const divs = await page.$$eval('div', divs => 
        divs.map(div => ({ 
            id: div.id, 
            className: div.className, 
            textLength: div.textContent.length,
            hasChildren: div.children.length > 0
        })).filter(div => div.textLength > 10 || div.hasChildren)
    );
    console.log('Meaningful divs:', divs);
    
    // Look specifically for tabs
    const allElements = await page.$$eval('*', els => 
        els.filter(el => el.textContent && el.textContent.toLowerCase().includes('live'))
           .map(el => ({ tag: el.tagName, text: el.textContent.trim().substring(0, 50) }))
    );
    console.log('Elements containing "live":', allElements);
    
    await browser.close();
}

deepDebug();