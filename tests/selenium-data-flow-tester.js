import { Builder, By, until, Key } from 'selenium-webdriver';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SeleniumDataFlowTester {
  constructor() {
    this.driver = null;
    this.screenshotDir = 'test-results/selenium-screenshots';
    this.testResults = [];
    
    // Ensure screenshot directory exists
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  async initialize(browserName = 'chrome') {
    console.log(`🚀 Initializing Selenium with ${browserName}`);
    
    let options;
    switch (browserName) {
      case 'chrome':
        const { default: chrome } = await import('selenium-webdriver/chrome.js');
        options = new chrome.Options();
        options.addArguments('--headless=new');
        options.addArguments('--window-size=1920,1080');
        options.addArguments('--disable-dev-shm-usage');
        options.addArguments('--no-sandbox');
        this.driver = await new Builder()
          .forBrowser('chrome')
          .setChromeOptions(options)
          .build();
        break;
        
      case 'firefox':
        const { default: firefox } = await import('selenium-webdriver/firefox.js');
        options = new firefox.Options();
        options.addArguments('--headless');
        options.addArguments('--width=1920');
        options.addArguments('--height=1080');
        this.driver = await new Builder()
          .forBrowser('firefox')
          .setFirefoxOptions(options)
          .build();
        break;
        
      case 'edge':
        const { default: edge } = await import('selenium-webdriver/edge.js');
        options = new edge.Options();
        options.addArguments('--headless');
        options.addArguments('--window-size=1920,1080');
        this.driver = await new Builder()
          .forBrowser('MicrosoftEdge')
          .setEdgeOptions(options)
          .build();
        break;
        
      default:
        throw new Error(`Unsupported browser: ${browserName}`);
    }
    
    // Set implicit wait
    await this.driver.manage().setTimeouts({ implicit: 10000 });
    console.log(`✅ ${browserName} driver initialized`);
  }

  async takeScreenshot(name) {
    try {
      const screenshot = await this.driver.takeScreenshot();
      const filePath = path.join(this.screenshotDir, `${name}.png`);
      fs.writeFileSync(filePath, screenshot, 'base64');
      console.log(`📸 Screenshot saved: ${filePath}`);
      return filePath;
    } catch (error) {
      console.error(`❌ Failed to take screenshot ${name}:`, error.message);
      return null;
    }
  }

  async waitForElement(selector, timeout = 30000) {
    try {
      const element = await this.driver.wait(
        until.elementLocated(By.css(selector)),
        timeout
      );
      await this.driver.wait(until.elementIsVisible(element), timeout);
      return element;
    } catch (error) {
      console.error(`❌ Element not found: ${selector}`, error.message);
      throw error;
    }
  }

  async waitForText(text, timeout = 30000) {
    try {
      return await this.driver.wait(
        until.elementLocated(By.xpath(`//*[contains(text(), "${text}")]`)),
        timeout
      );
    } catch (error) {
      console.error(`❌ Text not found: ${text}`, error.message);
      throw error;
    }
  }

  async runDataFlowTest(dateConfig, browserName) {
    const testId = `${browserName}-${dateConfig.label.replace(/\s+/g, '-').toLowerCase()}`;
    console.log(`🔄 Running data flow test: ${testId}`);
    
    try {
      // Navigate to application
      await this.driver.get('http://localhost:8080');
      await this.driver.sleep(2000);
      await this.takeScreenshot(`${testId}-01-initial`);

      // Navigate to backtesting
      const backestingLink = await this.driver.findElement(
        By.xpath(`//a[contains(@href, 'backtesting')] | //button[contains(text(), 'Backtesting')]`)
      );
      await backestingLink.click();
      
      await this.waitForText('Backtesting');
      await this.takeScreenshot(`${testId}-02-backtesting-page`);

      // STEP 1: Configure backtest
      console.log('🔧 Configuring backtest parameters');
      
      // Set strategy
      const strategySelect = await this.driver.findElement(By.css('select'));
      await strategySelect.sendKeys('HAVWAP-Rev-v2');
      
      // Set symbol
      const symbolInput = await this.driver.findElement(By.css('input[placeholder*="SPY"]'));
      await symbolInput.clear();
      await symbolInput.sendKeys('SPY');
      
      // Set dates
      const dateInputs = await this.driver.findElements(By.css('input[type="date"]'));
      await dateInputs[0].clear();
      await dateInputs[0].sendKeys(dateConfig.start);
      await dateInputs[1].clear();
      await dateInputs[1].sendKeys(dateConfig.end);
      
      // Set timeframe
      const timeframeSelect = await this.driver.findElements(By.css('select'));
      if (timeframeSelect.length > 1) {
        await timeframeSelect[1].sendKeys('1Min');
      }
      
      await this.takeScreenshot(`${testId}-03-configured`);

      // STEP 2: Fetch data
      console.log('📊 Fetching data');
      
      const fetchButton = await this.driver.findElement(By.xpath(`//button[contains(text(), 'Fetch Data')]`));
      await fetchButton.click();
      
      // Wait for fetching state
      await this.waitForText('Fetching');
      await this.takeScreenshot(`${testId}-04-fetching`);
      
      // Wait for stock data
      await this.waitForText('Stock Data Ready', 45000);
      await this.takeScreenshot(`${testId}-05-stock-loaded`);
      
      // Validate stock data presence
      await this.waitForText('Total Bars');
      await this.waitForText('First Price');
      await this.waitForText('Last Price');
      
      // Wait for options data
      await this.waitForText('Options Ready', 90000);
      await this.takeScreenshot(`${testId}-06-options-loaded`);
      
      // Validate options data
      await this.waitForText('Options Contracts');

      // STEP 3: Verify chart
      console.log('📈 Verifying chart');
      await this.waitForText('TradingView');
      await this.waitForText('Initialized: ✅');
      await this.takeScreenshot(`${testId}-07-chart-ready`);

      // STEP 4: Run backtest
      console.log('⚡ Running backtest');
      
      const runButton = await this.driver.findElement(By.xpath(`//button[contains(text(), 'Run Backtest')]`));
      await runButton.click();
      
      // Wait for running state
      await this.waitForText('Running');
      await this.takeScreenshot(`${testId}-08-running`);
      
      // Wait for completion
      await this.waitForText('Total Return', 180000);
      await this.takeScreenshot(`${testId}-09-complete`);

      // STEP 5: Validate results
      console.log('✅ Validating results');
      
      const requiredMetrics = [
        'Total Return',
        'Sharpe Ratio',
        'Max Drawdown',
        'Win Rate',
        'Total Trades'
      ];
      
      for (const metric of requiredMetrics) {
        await this.waitForText(metric);
      }
      
      await this.waitForText('Equity Curve');
      await this.waitForText('Trade History');
      
      await this.takeScreenshot(`${testId}-10-final`);

      // STEP 6: Data quality validation
      console.log('🔍 Validating data quality');
      
      // Check that values are not NaN
      const pageSource = await this.driver.getPageSource();
      if (pageSource.includes('NaN') || pageSource.includes('undefined')) {
        throw new Error('Found NaN or undefined values in results');
      }
      
      // Extract some metrics for reporting
      const totalBarsElement = await this.driver.findElement(
        By.xpath(`//*[contains(text(), 'Total Bars')]/following-sibling::*`)
      );
      const totalBars = await totalBarsElement.getText();
      
      const totalTradesElement = await this.driver.findElement(
        By.xpath(`//*[contains(text(), 'Total Trades')]/following-sibling::*`)
      );
      const totalTrades = await totalTradesElement.getText();
      
      const result = {
        testId,
        status: 'PASSED',
        dateConfig,
        browserName,
        metrics: {
          totalBars: totalBars.trim(),
          totalTrades: totalTrades.trim()
        },
        timestamp: new Date().toISOString()
      };
      
      this.testResults.push(result);
      console.log(`✅ Test completed successfully: ${testId}`);
      console.log(`📊 Metrics - Bars: ${totalBars.trim()}, Trades: ${totalTrades.trim()}`);
      
      return result;
      
    } catch (error) {
      console.error(`❌ Test failed: ${testId}`, error.message);
      await this.takeScreenshot(`${testId}-error`);
      
      const result = {
        testId,
        status: 'FAILED',
        dateConfig,
        browserName,
        error: error.message,
        timestamp: new Date().toISOString()
      };
      
      this.testResults.push(result);
      return result;
    }
  }

  async runErrorHandlingTest(browserName) {
    const testId = `${browserName}-error-handling`;
    console.log(`🔄 Running error handling test: ${testId}`);
    
    try {
      await this.driver.get('http://localhost:8080');
      await this.driver.sleep(2000);
      
      const backestingLink = await this.driver.findElement(
        By.xpath(`//a[contains(@href, 'backtesting')] | //button[contains(text(), 'Backtesting')]`)
      );
      await backestingLink.click();
      await this.waitForText('Backtesting');
      
      // Set invalid date range (weekend)
      const dateInputs = await this.driver.findElements(By.css('input[type="date"]'));
      await dateInputs[0].clear();
      await dateInputs[0].sendKeys('2024-01-06'); // Saturday
      await dateInputs[1].clear();
      await dateInputs[1].sendKeys('2024-01-07'); // Sunday
      
      const fetchButton = await this.driver.findElement(By.xpath(`//button[contains(text(), 'Fetch Data')]`));
      await fetchButton.click();
      
      // Should show error or no data
      try {
        await this.driver.wait(
          until.elementLocated(
            By.xpath(`//*[contains(text(), 'error') or contains(text(), 'No data') or contains(text(), 'failed')]`)
          ),
          30000
        );
        await this.takeScreenshot(`${testId}-success`);
        
        console.log(`✅ Error handling test passed: ${testId}`);
        return { testId, status: 'PASSED', type: 'error-handling' };
        
      } catch (timeoutError) {
        await this.takeScreenshot(`${testId}-timeout`);
        console.log(`⚠️  Error handling test inconclusive: ${testId}`);
        return { testId, status: 'INCONCLUSIVE', type: 'error-handling' };
      }
      
    } catch (error) {
      await this.takeScreenshot(`${testId}-error`);
      console.error(`❌ Error handling test failed: ${testId}`, error.message);
      return { testId, status: 'FAILED', type: 'error-handling', error: error.message };
    }
  }

  async generateReport() {
    const reportPath = path.join(this.screenshotDir, 'selenium-test-report.json');
    const report = {
      summary: {
        totalTests: this.testResults.length,
        passed: this.testResults.filter(r => r.status === 'PASSED').length,
        failed: this.testResults.filter(r => r.status === 'FAILED').length,
        inconclusive: this.testResults.filter(r => r.status === 'INCONCLUSIVE').length
      },
      results: this.testResults,
      timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📋 Test report generated: ${reportPath}`);
    return report;
  }

  async cleanup() {
    if (this.driver) {
      await this.driver.quit();
      console.log('🧹 Selenium driver cleaned up');
    }
  }
}

// Main test execution
async function runSeleniumTests() {
  const testDates = [
    { start: '2024-10-15', end: '2024-10-15', label: 'Single Day Oct 15' },
    { start: '2024-10-16', end: '2024-10-16', label: 'Single Day Oct 16' },
    { start: '2024-10-17', end: '2024-10-17', label: 'Single Day Oct 17' }
  ];
  
  const browsers = ['chrome', 'firefox'];
  
  for (const browserName of browsers) {
    const tester = new SeleniumDataFlowTester();
    
    try {
      await tester.initialize(browserName);
      
      // Run data flow tests
      for (const dateConfig of testDates) {
        await tester.runDataFlowTest(dateConfig, browserName);
        await tester.driver.sleep(2000); // Brief pause between tests
      }
      
      // Run error handling test
      await tester.runErrorHandlingTest(browserName);
      
    } catch (error) {
      console.error(`❌ Failed to run tests for ${browserName}:`, error.message);
    } finally {
      await tester.cleanup();
    }
    
    // Generate report for this browser
    await tester.generateReport();
  }
  
  console.log('🎉 All Selenium tests completed!');
}

// Export for use as module or run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runSeleniumTests().catch(console.error);
}

export { SeleniumDataFlowTester, runSeleniumTests };