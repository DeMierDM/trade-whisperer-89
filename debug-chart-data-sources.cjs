const puppeteer = require('puppeteer');
const fs = require('fs');

async function debugChartDataSources() {
  console.log('🔍 Debugging Chart Data Sources - Taking Screenshots & Console Analysis');
  
  const browser = await puppeteer.launch({ 
    headless: false, 
    devtools: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1400, height: 900 }
  });
  
  const page = await browser.newPage();
  
  // Capture ALL console logs to find data source issues
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ timestamp: Date.now(), text });
    
    // Log important data flow messages
    if (text.includes('Loading') || text.includes('data') || text.includes('fetch') || 
        text.includes('chart') || text.includes('bars') || text.includes('timestamp') ||
        text.includes('January') || text.includes('February') || text.includes('2024') || text.includes('2025')) {
      console.log('📊 DATA:', text);
    }
  });

  // Capture network requests to see what data is actually being fetched
  const networkLogs = [];
  page.on('request', request => {
    if (request.url().includes('api') || request.url().includes('data') || request.url().includes('chart')) {
      networkLogs.push({
        url: request.url(),
        method: request.method(),
        postData: request.postData(),
        timestamp: Date.now()
      });
      console.log('🌐 REQUEST:', request.method(), request.url());
      if (request.postData()) {
        console.log('📤 POST DATA:', request.postData());
      }
    }
  });

  page.on('response', response => {
    if (response.url().includes('api') || response.url().includes('data') || response.url().includes('chart')) {
      console.log('📥 RESPONSE:', response.status(), response.url());
    }
  });
  
  try {
    console.log('1️⃣ Loading application...');
    await page.goto('http://localhost:8081', { waitUntil: 'networkidle2', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    // Take screenshot of home page
    await page.screenshot({ path: 'debug-home.png', fullPage: true });
    console.log('📸 Screenshot saved: debug-home.png');
    
    console.log('2️⃣ Navigating to Backtesting page...');
    await page.goto('http://localhost:8081/backtesting', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(3000);
    
    // Take screenshot of backtesting page
    await page.screenshot({ path: 'debug-backtesting-initial.png', fullPage: true });
    console.log('📸 Screenshot saved: debug-backtesting-initial.png');
    
    console.log('3️⃣ Looking for Paper Trading tab...');
    // Try multiple selectors for paper trading tab
    const paperTabSelectors = [
      '[role="tablist"] [value="paper"]',
      'button[data-state]:contains("Paper")', 
      'button:has-text("Paper Trading")',
      '[data-value="paper"]',
      'button:contains("Paper")'
    ];
    
    let paperTabFound = false;
    for (const selector of paperTabSelectors) {
      try {
        console.log(`   Trying selector: ${selector}`);
        const element = await page.waitForSelector(selector, { timeout: 2000 });
        if (element) {
          console.log(`✅ Found Paper Trading tab with selector: ${selector}`);
          await element.click();
          paperTabFound = true;
          await page.waitForTimeout(2000);
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!paperTabFound) {
      console.log('⚠️ Paper Trading tab not found, checking available tabs...');
      // Get all available tabs
      const tabs = await page.$$eval('[role="tab"], button[data-state]', elements => 
        elements.map(el => ({ text: el.textContent, value: el.getAttribute('value') || el.getAttribute('data-value') }))
      );
      console.log('Available tabs:', tabs);
    }
    
    // Take screenshot after tab interaction
    await page.screenshot({ path: 'debug-after-tab-click.png', fullPage: true });
    console.log('📸 Screenshot saved: debug-after-tab-click.png');
    
    console.log('4️⃣ Analyzing chart data...');
    await page.waitForTimeout(3000);
    
    // Look for chart elements and extract any visible date information
    const chartInfo = await page.evaluate(() => {
      const results = {
        chartElements: [],
        dateStrings: [],
        visibleText: document.body.innerText.slice(0, 2000) // First 2000 chars
      };
      
      // Find any elements with date-like content
      const allElements = document.querySelectorAll('*');
      for (let el of allElements) {
        const text = el.textContent || '';
        if (text.includes('Jan') || text.includes('Feb') || text.includes('2024') || text.includes('2025') || 
            text.includes('January') || text.includes('February') || text.includes('November')) {
          results.dateStrings.push({
            element: el.tagName,
            text: text.slice(0, 100),
            id: el.id,
            className: el.className
          });
        }
      }
      
      // Find chart containers
      const chartContainers = document.querySelectorAll('[class*="chart"], [id*="chart"], canvas');
      results.chartElements = Array.from(chartContainers).map(el => ({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        width: el.offsetWidth,
        height: el.offsetHeight
      }));
      
      return results;
    });
    
    console.log('\n📊 CHART ANALYSIS:');
    console.log('Chart Elements Found:', chartInfo.chartElements.length);
    console.log('Date Strings Found:', chartInfo.dateStrings.length);
    
    if (chartInfo.dateStrings.length > 0) {
      console.log('\n🗓️ DATE STRINGS DETECTED:');
      chartInfo.dateStrings.forEach((item, idx) => {
        console.log(`${idx + 1}. ${item.element}: "${item.text}"`);
      });
    }
    
    // Take final comprehensive screenshot
    await page.screenshot({ path: 'debug-final-state.png', fullPage: true });
    console.log('📸 Screenshot saved: debug-final-state.png');
    
    console.log('5️⃣ Checking for bot data...');
    // Look for any bot-related API calls or data
    const botNetworkCalls = networkLogs.filter(log => 
      log.url.includes('bot') || log.url.includes('paper') || log.url.includes('trading')
    );
    
    if (botNetworkCalls.length > 0) {
      console.log('\n🤖 BOT-RELATED API CALLS:');
      botNetworkCalls.forEach((call, idx) => {
        console.log(`${idx + 1}. ${call.method} ${call.url}`);
        if (call.postData) {
          console.log(`   Data: ${call.postData}`);
        }
      });
    }
    
    console.log('6️⃣ Saving analysis results...');
    
    // Save all logs to file
    const analysisReport = {
      timestamp: new Date().toISOString(),
      chartInfo,
      consoleLogs: consoleLogs.slice(-50), // Last 50 console logs
      networkLogs,
      botNetworkCalls,
      summary: {
        totalConsoleMessages: consoleLogs.length,
        totalNetworkRequests: networkLogs.length,
        chartElementsFound: chartInfo.chartElements.length,
        dateStringsFound: chartInfo.dateStrings.length,
        paperTabFound
      }
    };
    
    fs.writeFileSync('debug-analysis-report.json', JSON.stringify(analysisReport, null, 2));
    console.log('📄 Analysis saved to: debug-analysis-report.json');
    
    console.log('\n🎯 KEY FINDINGS:');
    if (chartInfo.dateStrings.some(d => d.text.includes('Jan') || d.text.includes('Feb') || d.text.includes('2024'))) {
      console.log('❌ ISSUE CONFIRMED: Old dates (Jan/Feb 2024) detected in UI');
    }
    
    if (chartInfo.dateStrings.some(d => d.text.includes('Nov') || d.text.includes('2025'))) {
      console.log('✅ Current dates (Nov 2025) also detected');
    } else {
      console.log('❌ NO current dates (Nov 2025) found in UI');
    }
    
    console.log(`📊 Total chart elements: ${chartInfo.chartElements.length}`);
    console.log(`🌐 Total API requests: ${networkLogs.length}`);
    
  } catch (error) {
    console.error('❌ Debug error:', error.message);
    await page.screenshot({ path: 'debug-error-state.png', fullPage: true });
  } finally {
    console.log('\n🔍 Screenshots taken:');
    console.log('  - debug-home.png');
    console.log('  - debug-backtesting-initial.png'); 
    console.log('  - debug-after-tab-click.png');
    console.log('  - debug-final-state.png');
    console.log('  - debug-analysis-report.json');
    
    await page.waitForTimeout(5000); // Keep browser open for manual inspection
    await browser.close();
  }
}

debugChartDataSources().catch(console.error);