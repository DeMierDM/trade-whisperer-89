const { Builder, By, until, Key } = require('selenium-webdriver');
const fs = require('fs');
const path = require('path');

/**
 * Trade Whisperer Selenium Testing Suite
 * Cross-browser compatibility and legacy browser support
 */

class TradeWhispererSeleniumTester {
  constructor() {
    this.screenshotDir = './test-results/selenium-screenshots';
    this.driver = null;
    this.testResults = [];
    
    // Ensure screenshot directory exists
    if (!fs.existsSync(this.screenshotDir)) {
      fs.mkdirSync(this.screenshotDir, { recursive: true });
    }
  }

  async setup(browserName = 'chrome') {
    console.log(`🚀 Setting up Selenium WebDriver for ${browserName}`);
    
    try {
      this.driver = await new Builder()
        .forBrowser(browserName)
        .build();
        
      // Set window size for consistent screenshots
      await this.driver.manage().window().setRect({
        width: 1280,
        height: 720,
        x: 0,
        y: 0
      });
      
      console.log(`✅ ${browserName} driver initialized successfully`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to initialize ${browserName} driver:`, error.message);
      return false;
    }
  }

  async takeScreenshot(filename, description = '') {
    try {
      const screenshot = await this.driver.takeScreenshot();
      const filepath = path.join(this.screenshotDir, filename);
      
      fs.writeFileSync(filepath, screenshot, 'base64');
      
      console.log(`📸 Screenshot saved: ${filename}`);
      if (description) {
        console.log(`   Description: ${description}`);
      }
      
      return filepath;
    } catch (error) {
      console.error(`❌ Failed to take screenshot ${filename}:`, error.message);
      return null;
    }
  }

  async testLandingPage() {
    console.log('\n🔍 Testing Landing Page...');
    
    try {
      await this.driver.get('http://localhost:8080');
      await this.driver.wait(until.titleContains('Trade Whisperer'), 10000);
      
      await this.takeScreenshot('selenium-01-landing-page.png', 'Initial landing page load');
      
      // Test navigation elements
      const navElements = await this.driver.findElements(By.css('nav a, nav button'));
      console.log(`   Found ${navElements.length} navigation elements`);
      
      await this.takeScreenshot('selenium-02-navigation-visible.png', 'Navigation elements loaded');
      
      this.testResults.push({
        test: 'Landing Page',
        status: 'PASS',
        details: `Navigation elements found: ${navElements.length}`
      });
      
    } catch (error) {
      console.error('❌ Landing page test failed:', error.message);
      await this.takeScreenshot('selenium-error-landing.png', 'Landing page error state');
      
      this.testResults.push({
        test: 'Landing Page',
        status: 'FAIL',
        details: error.message
      });
    }
  }

  async testTradingInterface() {
    console.log('\n🔍 Testing Trading Interface...');
    
    try {
      await this.driver.get('http://localhost:8080/trading');
      await this.driver.sleep(3000); // Wait for page load
      
      await this.takeScreenshot('selenium-03-trading-page.png', 'Trading interface loaded');
      
      // Test symbol input
      const symbolInputs = await this.driver.findElements(By.css('input[type="text"]'));
      
      if (symbolInputs.length > 0) {
        await symbolInputs[0].clear();
        await symbolInputs[0].sendKeys('SPY');
        await this.driver.sleep(2000);
        
        await this.takeScreenshot('selenium-04-symbol-entered.png', 'Symbol SPY entered');
      }
      
      // Check for WebSocket connection indicators
      const connectionElements = await this.driver.findElements(By.xpath('//*[contains(text(), "Connected") or contains(text(), "Online") or contains(@class, "connection")]'));
      
      await this.takeScreenshot('selenium-05-trading-with-data.png', 'Trading interface with data');
      
      this.testResults.push({
        test: 'Trading Interface',
        status: 'PASS',
        details: `Symbol inputs: ${symbolInputs.length}, Connection indicators: ${connectionElements.length}`
      });
      
    } catch (error) {
      console.error('❌ Trading interface test failed:', error.message);
      await this.takeScreenshot('selenium-error-trading.png', 'Trading interface error');
      
      this.testResults.push({
        test: 'Trading Interface',
        status: 'FAIL',
        details: error.message
      });
    }
  }

  async testBacktestingInterface() {
    console.log('\n🔍 Testing Backtesting Interface...');
    
    try {
      await this.driver.get('http://localhost:8080/backtesting');
      await this.driver.sleep(3000);
      
      await this.takeScreenshot('selenium-06-backtesting-page.png', 'Backtesting interface loaded');
      
      // Test form inputs
      const textInputs = await this.driver.findElements(By.css('input[type="text"], input[type="date"], input[type="number"]'));
      const buttons = await this.driver.findElements(By.css('button'));
      
      console.log(`   Found ${textInputs.length} inputs and ${buttons.length} buttons`);
      
      // Fill test data if inputs exist
      if (textInputs.length > 0) {
        await textInputs[0].clear();
        await textInputs[0].sendKeys('SPY');
        await this.driver.sleep(1000);
        
        await this.takeScreenshot('selenium-07-backtest-with-symbol.png', 'Backtesting with symbol entered');
      }
      
      this.testResults.push({
        test: 'Backtesting Interface',
        status: 'PASS',
        details: `Inputs: ${textInputs.length}, Buttons: ${buttons.length}`
      });
      
    } catch (error) {
      console.error('❌ Backtesting interface test failed:', error.message);
      await this.takeScreenshot('selenium-error-backtesting.png', 'Backtesting interface error');
      
      this.testResults.push({
        test: 'Backtesting Interface',
        status: 'FAIL',
        details: error.message
      });
    }
  }

  async testHistoryPage() {
    console.log('\n🔍 Testing History Page...');
    
    try {
      await this.driver.get('http://localhost:8080/history');
      await this.driver.sleep(3000);
      
      await this.takeScreenshot('selenium-08-history-page.png', 'History page loaded');
      
      // Look for data tables or lists
      const tables = await this.driver.findElements(By.css('table, .table, .data-table'));
      const lists = await this.driver.findElements(By.css('ul, ol, .list'));
      
      console.log(`   Found ${tables.length} tables and ${lists.length} lists`);
      
      // Test search functionality
      const searchInputs = await this.driver.findElements(By.css('input[placeholder*="search" i], input[placeholder*="filter" i]'));
      
      if (searchInputs.length > 0) {
        await searchInputs[0].clear();
        await searchInputs[0].sendKeys('SPY');
        await this.driver.sleep(2000);
        
        await this.takeScreenshot('selenium-09-history-searched.png', 'History page with search term');
      }
      
      this.testResults.push({
        test: 'History Page',
        status: 'PASS',
        details: `Tables: ${tables.length}, Lists: ${lists.length}, Search inputs: ${searchInputs.length}`
      });
      
    } catch (error) {
      console.error('❌ History page test failed:', error.message);
      await this.takeScreenshot('selenium-error-history.png', 'History page error');
      
      this.testResults.push({
        test: 'History Page',
        status: 'FAIL',
        details: error.message
      });
    }
  }

  async testDiagnosticsPage() {
    console.log('\n🔍 Testing Diagnostics Page...');
    
    try {
      await this.driver.get('http://localhost:8080/diagnostics');
      await this.driver.sleep(3000);
      
      await this.takeScreenshot('selenium-10-diagnostics-page.png', 'Diagnostics page loaded');
      
      // Look for diagnostic buttons or tests
      const buttons = await this.driver.findElements(By.css('button'));
      const testButtons = await this.driver.findElements(By.xpath('//button[contains(text(), "Test") or contains(text(), "Run") or contains(text(), "Check")]'));
      
      console.log(`   Found ${buttons.length} total buttons, ${testButtons.length} test buttons`);
      
      // Run diagnostic test if available
      if (testButtons.length > 0) {
        await testButtons[0].click();
        await this.driver.sleep(5000); // Wait for API calls
        
        await this.takeScreenshot('selenium-11-diagnostics-results.png', 'Diagnostics test results');
      }
      
      this.testResults.push({
        test: 'Diagnostics Page',
        status: 'PASS',
        details: `Buttons: ${buttons.length}, Test buttons: ${testButtons.length}`
      });
      
    } catch (error) {
      console.error('❌ Diagnostics page test failed:', error.message);
      await this.takeScreenshot('selenium-error-diagnostics.png', 'Diagnostics page error');
      
      this.testResults.push({
        test: 'Diagnostics Page',
        status: 'FAIL',
        details: error.message
      });
    }
  }

  async testMobileView() {
    console.log('\n🔍 Testing Mobile View...');
    
    try {
      // Set mobile viewport
      await this.driver.manage().window().setRect({
        width: 375,
        height: 667,
        x: 0,
        y: 0
      });
      
      await this.driver.get('http://localhost:8080');
      await this.driver.sleep(3000);
      
      await this.takeScreenshot('selenium-12-mobile-home.png', 'Mobile home page');
      
      // Test mobile navigation
      const mobileMenus = await this.driver.findElements(By.xpath('//button[contains(@class, "menu") or contains(@class, "hamburger") or contains(text(), "Menu")]'));
      
      if (mobileMenus.length > 0) {
        await mobileMenus[0].click();
        await this.driver.sleep(1000);
        
        await this.takeScreenshot('selenium-13-mobile-menu-open.png', 'Mobile menu opened');
      }
      
      // Restore desktop viewport
      await this.driver.manage().window().setRect({
        width: 1280,
        height: 720,
        x: 0,
        y: 0
      });
      
      this.testResults.push({
        test: 'Mobile View',
        status: 'PASS',
        details: `Mobile menus found: ${mobileMenus.length}`
      });
      
    } catch (error) {
      console.error('❌ Mobile view test failed:', error.message);
      await this.takeScreenshot('selenium-error-mobile.png', 'Mobile view error');
      
      this.testResults.push({
        test: 'Mobile View',
        status: 'FAIL',
        details: error.message
      });
    }
  }

  async generateReport() {
    console.log('\n📊 Generating Test Report...');
    
    const report = {
      timestamp: new Date().toISOString(),
      browser: await this.driver.getCapabilities().get('browserName'),
      total_tests: this.testResults.length,
      passed: this.testResults.filter(r => r.status === 'PASS').length,
      failed: this.testResults.filter(r => r.status === 'FAIL').length,
      results: this.testResults,
      screenshots_directory: this.screenshotDir
    };
    
    const reportPath = path.join(this.screenshotDir, 'selenium-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log(`📄 Test report saved: ${reportPath}`);
    console.log(`✅ Passed: ${report.passed}/${report.total_tests}`);
    console.log(`❌ Failed: ${report.failed}/${report.total_tests}`);
    
    return report;
  }

  async runAllTests(browserName = 'chrome') {
    console.log(`\n🎯 Starting Trade Whisperer Selenium Test Suite (${browserName})`);
    
    const setupSuccess = await this.setup(browserName);
    if (!setupSuccess) {
      console.error('❌ Setup failed, aborting tests');
      return false;
    }
    
    try {
      await this.testLandingPage();
      await this.testTradingInterface();
      await this.testBacktestingInterface();
      await this.testHistoryPage();
      await this.testDiagnosticsPage();
      await this.testMobileView();
      
      const report = await this.generateReport();
      return report;
      
    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
      return false;
    } finally {
      if (this.driver) {
        await this.driver.quit();
        console.log('🏁 Selenium driver closed');
      }
    }
  }

  async cleanup() {
    if (this.driver) {
      await this.driver.quit();
    }
  }
}

// Export for use in other scripts
module.exports = TradeWhispererSeleniumTester;

// Run tests if called directly
if (require.main === module) {
  async function runTests() {
    const tester = new TradeWhispererSeleniumTester();
    
    try {
      // Test Chrome
      console.log('🔴 Testing with Chrome...');
      await tester.runAllTests('chrome');
      
      // Test Firefox if available
      try {
        console.log('\n🦊 Testing with Firefox...');
        const firefoxTester = new TradeWhispererSeleniumTester();
        await firefoxTester.runAllTests('firefox');
      } catch (error) {
        console.log('⚠️ Firefox testing skipped:', error.message);
      }
      
    } catch (error) {
      console.error('❌ Test execution failed:', error.message);
    }
  }
  
  runTests();
}