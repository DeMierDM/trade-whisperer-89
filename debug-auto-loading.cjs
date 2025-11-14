#!/usr/bin/env node

/**
 * Debug Auto-Loading & Live Updates
 * Tests both initial data loading and WebSocket live updates
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function debugAutoLoading() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000,
    args: ['--disable-web-security']
  });

  try {
    const context = await browser.newContext({
      permissions: ['clipboard-read', 'clipboard-write']
    });
    
    const page = await context.newPage();

    // Enable console logging
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[STOCK-BUS]') || 
          text.includes('[LIVE-CHART]') || 
          text.includes('[TRADING]') ||
          text.includes('fetchHistoricalBars') ||
          text.includes('updateWithLiveTrade')) {
        console.log(`📊 ${new Date().toISOString().split('T')[1].slice(0,8)} ${text}`);
      }
    });

    console.log('🚀 Starting Auto-Loading Debug Test...\n');

    // Navigate to Trading page
    await page.goto('http://localhost:8081/trading');
    console.log('✅ Navigated to Trading page');

    // Wait for initial render
    await page.waitForTimeout(2000);

    // Check if chart is loaded
    const chartElement = await page.$('[data-testid="trading-view-chart"]');
    if (!chartElement) {
      console.log('❌ Chart element not found');
      return;
    }
    console.log('✅ Chart element found');

    // Check for canvas (TradingView chart renders to canvas)
    const canvas = await page.$('canvas');
    if (!canvas) {
      console.log('❌ Canvas not found - chart not rendered');
    } else {
      console.log('✅ Canvas found - chart is rendered');
    }

    // Test 1: Check if data loads automatically on mount
    console.log('\n🔍 Test 1: Auto-loading on component mount');
    await page.waitForTimeout(3000);

    // Look for data in chart
    const hasData = await page.evaluate(() => {
      // Check if there are any console messages about data loading
      return window.performance.getEntriesByType('navigation').length > 0;
    });

    // Test 2: Change symbol to trigger auto-loading
    console.log('\n🔍 Test 2: Auto-loading on symbol change');
    
    // Find symbol selector
    const symbolInput = await page.$('input[placeholder*="symbol"], input[value*="AAPL"], select');
    if (symbolInput) {
      console.log('✅ Found symbol input');
      await symbolInput.click();
      await symbolInput.fill('MSFT');
      await symbolInput.press('Enter');
      console.log('📝 Changed symbol to MSFT');
      
      // Wait and check for new data loading
      await page.waitForTimeout(3000);
    } else {
      console.log('❌ Symbol input not found');
    }

    // Test 3: Check WebSocket connection status
    console.log('\n🔍 Test 3: WebSocket connection status');
    
    const connectionStatus = await page.evaluate(() => {
      // Look for connection indicators in the DOM
      const statusElements = document.querySelectorAll('[data-testid*="connection"], [class*="connected"], [class*="status"]');
      return Array.from(statusElements).map(el => ({
        text: el.textContent,
        class: el.className,
        id: el.id
      }));
    });

    console.log('🔗 Connection status elements:', connectionStatus);

    // Test 4: Manually trigger refresh and compare
    console.log('\n🔍 Test 4: Manual refresh test');
    
    const refreshButton = await page.$('button[data-testid*="refresh"], button:has-text("Refresh"), button:has-text("Load")');
    if (refreshButton) {
      console.log('✅ Found refresh button');
      await refreshButton.click();
      console.log('🔄 Clicked refresh button');
      await page.waitForTimeout(3000);
    } else {
      console.log('❌ Refresh button not found');
    }

    // Test 5: Check for live data updates
    console.log('\n🔍 Test 5: Live data updates test');
    
    // Wait for potential live updates
    console.log('⏳ Waiting 10 seconds for live updates...');
    await page.waitForTimeout(10000);

    // Take screenshot for debugging
    await page.screenshot({ 
      path: 'auto-loading-debug.png',
      fullPage: true 
    });
    console.log('📸 Screenshot saved as auto-loading-debug.png');

    // Get final state
    const finalState = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        hasChart: !!document.querySelector('canvas'),
        hasData: !!document.querySelector('[class*="chart"], canvas'),
        consoleErrors: window.console._errors || []
      };
    });

    console.log('\n📋 Final State:');
    console.log('URL:', finalState.url);
    console.log('Has Chart:', finalState.hasChart);
    console.log('Has Data:', finalState.hasData);

  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
  } finally {
    console.log('\n🏁 Auto-loading debug test completed');
    await browser.close();
  }
}

debugAutoLoading().catch(console.error);