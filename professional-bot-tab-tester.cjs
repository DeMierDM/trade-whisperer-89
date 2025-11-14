const puppeteer = require('puppeteer');
const fs = require('fs');

/**
 * Professional Bot Tab Testing with Screenshots
 * Based on Context7 Puppeteer patterns and Testing Library best practices
 */
class BotTabTester {
  constructor() {
    this.browser = null;
    this.page = null;
    this.screenshots = [];
    this.testResults = {};
  }

  async initialize() {
    console.log('🚀 Initializing Professional Bot Tab Tester...');
    
    this.browser = await puppeteer.launch({
      headless: false,
      devtools: true,
      defaultViewport: { width: 1600, height: 1000 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    
    // Enhanced console logging with date filtering
    this.page.on('console', msg => {
      const text = msg.text();
      
      // Capture date-related logs to identify hardcoded dates
      if (text.includes('2025') || text.includes('Jan') || text.includes('Feb') || 
          text.includes('Nov') || text.includes('Loading') || text.includes('BOT TABS') ||
          text.includes('CURRENT') || text.includes('HISTORICAL')) {
        console.log('📊 Frontend:', text);
      }
    });
    
    // Monitor network requests for data fetching
    this.page.on('request', request => {
      if (request.url().includes('chart') || request.url().includes('trading')) {
        const postData = request.postData();
        if (postData && (postData.includes('2025') || postData.includes('forceCurrentData'))) {
          console.log('🌐 Data Request:', request.url());
          console.log('📤 Payload:', postData);
        }
      }
    });
  }

  async navigateToBacktesting() {
    console.log('📍 Navigating to backtesting page...');
    
    await this.page.goto('http://localhost:8080/backtesting', { 
      waitUntil: 'networkidle2',
      timeout: 30000    
    });
  }

  async switchToPaperTradingTab() {
    console.log('🔄 Switching to Paper Trading tab...');
    
    // Take screenshot before tab switch
    await this.takeScreenshot('before-tab-switch', 'State before switching to paper trading');
    
    // Use Testing Library inspired selectors for better reliability
    const tabSelectors = [
      '[role="tab"][data-value="paper"]',
      '[role="tab"]:has-text("Paper Trading")',
      'button[value="paper"]',
      'button:has-text("Paper")',
      '[data-testid="paper-tab"]'
    ];
    
    let tabFound = false;
    for (const selector of tabSelectors) {
      try {
        console.log(`   Trying tab selector: ${selector}`);
        const element = await this.page.waitForSelector(selector, { timeout: 3000 });
        if (element) {
          await element.click();
          console.log(`✅ Successfully clicked Paper Trading tab with: ${selector}`);
          tabFound = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!tabFound) {
      console.log('⚠️ Paper Trading tab not found, checking available tabs...');
      const tabs = await this.page.$$eval('[role="tab"], button[data-state]', 
        elements => elements.map(el => ({
          text: el.textContent?.trim(),
          value: el.getAttribute('value') || el.getAttribute('data-value'),
          id: el.id,
          className: el.className
        }))
      );
      console.log('Available tabs:', tabs);
    }
    
    await this.page.waitForTimeout(3000); // Wait for tab content to load
    await this.takeScreenshot('after-paper-tab-switch', 'State after switching to paper trading tab');
  }

  async captureActiveBotTabs() {
    console.log('🤖 Analyzing active bot tabs...');
    
    // Find bot chart tabs using Context7-inspired selectors
    const botTabData = await this.page.evaluate(() => {
      const results = {
        totalTabs: 0,
        activeTabs: [],
        tabsData: [],
        chartElements: [],
        dateStrings: []
      };
      
      // Find bot tabs - look for elements with bot indicators
      const botTabSelectors = [
        '[data-testid*="bot"]',
        'button:has([class*="status"])',
        '[role="tab"]:has([class*="rounded-full"])', // Status indicators
        'button:has(.badge)', // Symbol badges
        '[class*="tab"]:has([class*="badge"])'
      ];
      
      let allBotTabs = [];
      botTabSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          allBotTabs = [...allBotTabs, ...Array.from(elements)];
        } catch (e) {
          // Selector not valid, continue
        }
      });
      
      // Remove duplicates
      const uniqueTabs = [...new Set(allBotTabs)];
      
      results.totalTabs = uniqueTabs.length;
      
      uniqueTabs.forEach((tab, idx) => {
        const tabInfo = {
          index: idx,
          text: tab.textContent?.trim() || '',
          id: tab.id || '',
          className: tab.className || '',
          hasStatusIndicator: !!tab.querySelector('[class*="rounded-full"]'),
          hasSymbolBadge: !!tab.querySelector('.badge'),
          isActive: tab.getAttribute('aria-selected') === 'true' || 
                   tab.classList.contains('active') ||
                   tab.hasAttribute('data-state') && tab.getAttribute('data-state') === 'active'
        };
        
        results.tabsData.push(tabInfo);
        if (tabInfo.isActive) {
          results.activeTabs.push(tabInfo);
        }
      });
      
      // Find chart containers
      const chartContainers = document.querySelectorAll(
        '[class*="chart"], [id*="chart"], canvas, [class*="trading"]'
      );
      results.chartElements = Array.from(chartContainers).map(el => ({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        visible: el.offsetWidth > 0 && el.offsetHeight > 0
      }));
      
      // Look for date strings in the DOM
      const allText = document.body.innerText;
      const datePatterns = [
        /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/gi,
        /\b20(24|25)\b/g,
        /\b(January|February|March|April|May|June|July|August|September|October|November|December)\b/gi
      ];
      
      datePatterns.forEach(pattern => {
        const matches = allText.match(pattern);
        if (matches) {
          results.dateStrings.push(...matches);
        }
      });
      
      return results;
    });
    
    this.testResults.botTabAnalysis = botTabData;
    
    console.log(`📊 Bot Tab Analysis:`);
    console.log(`  Total bot tabs found: ${botTabData.totalTabs}`);
    console.log(`  Active tabs: ${botTabData.activeTabs.length}`);
    console.log(`  Chart elements: ${botTabData.chartElements.length}`);
    console.log(`  Date strings found: ${botTabData.dateStrings.length}`);
    
    if (botTabData.dateStrings.length > 0) {
      console.log(`  🗓️ Dates detected:`, [...new Set(botTabData.dateStrings)]);
    }
    
    await this.takeScreenshot('bot-tabs-analysis', 'Analysis of bot tabs and chart elements');
    
    return botTabData;
  }

  async testIndividualBotTabs(botTabData) {
    console.log('🔍 Testing individual bot tabs...');
    
    if (botTabData.totalTabs === 0) {
      console.log('⚠️ No bot tabs found to test');
      await this.takeScreenshot('no-bot-tabs', 'No bot tabs detected');
      return;
    }
    
    // Test each individual bot tab
    for (let i = 0; i < Math.min(botTabData.totalTabs, 5); i++) { // Limit to 5 tabs max
      try {
        console.log(`  Testing bot tab ${i + 1}/${botTabData.totalTabs}...`);
        
        // Click the tab using index-based selection (Testing Library pattern)
        await this.page.evaluate((tabIndex) => {
          const botTabs = document.querySelectorAll('[role="tab"], button[data-state]');
          if (botTabs[tabIndex]) {
            botTabs[tabIndex].click();
            return true;
          }
          return false;
        }, i);
        
        await this.page.waitForTimeout(2000); // Wait for tab to load
        
        // Capture screenshot of this specific bot tab
        await this.takeScreenshot(`bot-tab-${i + 1}`, `Individual bot tab ${i + 1} view`);
        
        // Analyze the chart data for this specific bot
        const chartAnalysis = await this.page.evaluate(() => {
          // Look for chart data indicators
          const chartContainer = document.querySelector('[class*="chart"], canvas');
          const priceElements = document.querySelectorAll('[class*="price"], [class*="$"]');
          const statusElements = document.querySelectorAll('[class*="status"], [class*="running"]');
          
          return {
            hasChart: !!chartContainer,
            chartVisible: chartContainer ? chartContainer.offsetWidth > 0 : false,
            priceElements: priceElements.length,
            statusElements: statusElements.length
          };
        });
        
        console.log(`    Tab ${i + 1}: Chart=${chartAnalysis.hasChart}, Visible=${chartAnalysis.chartVisible}`);
        
      } catch (error) {
        console.log(`    ❌ Error testing tab ${i + 1}:`, error.message);
      }
    }
  }

  async checkForDataSeparationIssues() {
    console.log('🔍 Checking for data separation issues...');
    
    const issueAnalysis = await this.page.evaluate(() => {
      const issues = {
        oldDatesFound: [],
        currentDatesFound: [],
        mixedDateSources: false,
        hardcodedDates: []
      };
      
      const bodyText = document.body.innerText.toLowerCase();
      
      // Check for old dates (Jan/Feb 2025)
      if (bodyText.includes('jan') || bodyText.includes('january') || bodyText.includes('feb') || bodyText.includes('february')) {
        if (bodyText.includes('2025')) {
          issues.oldDatesFound.push('January/February 2025 dates detected');
        }
      }
      
      // Check for current dates (Nov 2025)
      if (bodyText.includes('nov') || bodyText.includes('november')) {
        if (bodyText.includes('2025')) {
          issues.currentDatesFound.push('November 2025 dates detected');
        }
      }
      
      // Check for mixed date sources (indicates fallback issues)
      if (issues.oldDatesFound.length > 0 && issues.currentDatesFound.length > 0) {
        issues.mixedDateSources = true;
      }
      
      // Look for hardcoded date patterns in displayed text
      const dateRegex = /20(24|25)-\d{2}-\d{2}/g;
      const matches = bodyText.match(dateRegex);
      if (matches) {
        issues.hardcodedDates = [...new Set(matches)];
      }
      
      return issues;
    });
    
    this.testResults.dataSeparationAnalysis = issueAnalysis;
    
    console.log('📊 Data Separation Analysis:');
    console.log(`  Old dates found: ${issueAnalysis.oldDatesFound.length > 0 ? '❌ YES' : '✅ NO'}`);
    console.log(`  Current dates found: ${issueAnalysis.currentDatesFound.length > 0 ? '✅ YES' : '❌ NO'}`);
    console.log(`  Mixed date sources: ${issueAnalysis.mixedDateSources ? '❌ YES (Problem!)' : '✅ NO'}`);
    
    if (issueAnalysis.hardcodedDates.length > 0) {
      console.log(`  Hardcoded dates:`, issueAnalysis.hardcodedDates);
    }
    
    await this.takeScreenshot('data-separation-check', 'Final data separation analysis');
    
    return issueAnalysis;
  }

  async takeScreenshot(name, description) {
    const timestamp = Date.now();
    const filename = `screenshot-${name}-${timestamp}.png`;
    
    await this.page.screenshot({ 
      path: filename, 
      fullPage: true,
      type: 'png'
    });
    
    this.screenshots.push({
      filename,
      name,
      description,
      timestamp: new Date().toISOString()
    });
    
    console.log(`📸 Screenshot saved: ${filename} - ${description}`);
  }

  async generateTestReport() {
    const report = {
      timestamp: new Date().toISOString(),
      testResults: this.testResults,
      screenshots: this.screenshots,
      summary: {
        totalScreenshots: this.screenshots.length,
        issuesFound: [],
        recommendations: []
      }
    };
    
    // Analyze results and generate recommendations
    if (this.testResults.dataSeparationAnalysis) {
      const analysis = this.testResults.dataSeparationAnalysis;
      
      if (analysis.oldDatesFound.length > 0) {
        report.summary.issuesFound.push('Old hardcoded dates (Jan/Feb 2025) still appearing in UI');
        report.summary.recommendations.push('Update remaining hardcoded date references to use current date calculation');
      }
      
      if (analysis.mixedDateSources) {
        report.summary.issuesFound.push('Mixed date sources detected - indicates fallback to old configuration');
        report.summary.recommendations.push('Check data loading logic for proper tab-aware date selection');
      }
      
      if (!analysis.currentDatesFound.length) {
        report.summary.issuesFound.push('No current November 2025 dates found');
        report.summary.recommendations.push('Verify forceCurrentData parameter is working correctly');
      }
    }
    
    if (this.testResults.botTabAnalysis) {
      const analysis = this.testResults.botTabAnalysis;
      
      if (analysis.totalTabs === 0) {
        report.summary.issuesFound.push('No bot tabs found');
        report.summary.recommendations.push('Check if bots are running and getBotChartsData() filter is working');
      }
      
      if (analysis.activeTabs.length === 0 && analysis.totalTabs > 0) {
        report.summary.issuesFound.push('Bot tabs found but none appear active');
        report.summary.recommendations.push('Verify active tab state management');
      }
    }
    
    // Save report
    fs.writeFileSync('bot-tab-test-report.json', JSON.stringify(report, null, 2));
    console.log('📄 Test report saved: bot-tab-test-report.json');
    
    return report;
  }

  async runFullTest() {
    try {
      await this.initialize();
      await this.navigateToBacktesting();
      await this.switchToPaperTradingTab();
      
      const botTabData = await this.captureActiveBotTabs();
      await this.testIndividualBotTabs(botTabData);
      await this.checkForDataSeparationIssues();
      
      const report = await this.generateTestReport();
      
      console.log('\n🎯 TEST SUMMARY:');
      console.log(`Screenshots taken: ${report.summary.totalScreenshots}`);
      console.log(`Issues found: ${report.summary.issuesFound.length}`);
      
      if (report.summary.issuesFound.length > 0) {
        console.log('\n❌ ISSUES DETECTED:');
        report.summary.issuesFound.forEach((issue, idx) => {
          console.log(`  ${idx + 1}. ${issue}`);
        });
        
        console.log('\n💡 RECOMMENDATIONS:');
        report.summary.recommendations.forEach((rec, idx) => {
          console.log(`  ${idx + 1}. ${rec}`);
        });
      } else {
        console.log('✅ No issues detected!');
      }
      
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      await this.takeScreenshot('error-state', 'Error state capture');
    } finally {
      console.log('\n🔍 Keeping browser open for manual inspection...');
      await this.page.waitForTimeout(10000); // Keep open for 10 seconds for manual review
      if (this.browser) {
        await this.browser.close();
      }
    }
  }
}

// Run the test
async function main() {
  const tester = new BotTabTester();
  await tester.runFullTest();
}

main().catch(console.error);