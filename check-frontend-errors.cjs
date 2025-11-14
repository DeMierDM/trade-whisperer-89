#!/usr/bin/env node

const puppeteer = require('puppeteer');

async function checkFrontendErrors() {
  let browser;
  
  try {
    console.log('🔍 Checking frontend for JavaScript errors...');
    
    browser = await puppeteer.launch({ 
      headless: false,
      defaultViewport: null,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Listen for console errors
    const errors = [];
    const warnings = [];
    const logs = [];
    
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      
      if (type === 'error') {
        errors.push(text);
        console.log('❌ Console Error:', text);
      } else if (type === 'warning') {
        warnings.push(text);
        console.log('⚠️  Console Warning:', text);
      } else if (type === 'log' && (text.includes('SHARED') || text.includes('BUS'))) {
        logs.push(text);
        console.log('📋 Bus Log:', text);
      }
    });
    
    // Listen for page errors
    page.on('pageerror', error => {
      console.log('💥 Page Error:', error.message);
      errors.push(error.message);
    });
    
    // Navigate to the trading page
    console.log('🌐 Navigating to http://localhost:8084/trading...');
    await page.goto('http://localhost:8084/trading', { 
      waitUntil: 'networkidle0',
      timeout: 30000 
    });
    
    console.log('✅ Page loaded successfully');
    
    // Wait and watch for 30 seconds
    console.log('👀 Monitoring for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    console.log('\n📊 SUMMARY:');
    console.log(`❌ Errors: ${errors.length}`);
    console.log(`⚠️  Warnings: ${warnings.length}`);
    console.log(`📋 Bus Logs: ${logs.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ JavaScript Errors Found:');
      errors.forEach((error, i) => {
        console.log(`${i + 1}. ${error}`);
      });
    }
    
    if (warnings.length > 5) {
      console.log('\n⚠️  Recent Warnings:');
      warnings.slice(-5).forEach((warning, i) => {
        console.log(`${warnings.length - 4 + i}. ${warning}`);
      });
    }
    
    return { errors, warnings, logs };
    
  } catch (error) {
    console.error('💥 Test failed:', error.message);
    return { errors: [error.message], warnings: [], logs: [] };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

if (require.main === module) {
  checkFrontendErrors()
    .then(({ errors }) => {
      process.exit(errors.length > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('💥 Failed to check frontend:', error);
      process.exit(1);
    });
}

module.exports = { checkFrontendErrors };