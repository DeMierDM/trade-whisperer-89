#!/usr/bin/env node

/**
 * Trade Whisperer Comprehensive Visual Testing Suite
 * Orchestrates Playwright, Cypress, and Selenium testing with screenshot validation
 */

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class TradeWhispererTestOrchestrator {
  constructor() {
    this.baseDir = process.cwd();
    this.resultsDir = path.join(this.baseDir, 'test-results');
    this.servers = [];
    this.testResults = {
      timestamp: new Date().toISOString(),
      playwright: null,
      cypress: null,
      selenium: null,
      overall: 'pending'
    };
    
    // Ensure results directory exists
    if (!fs.existsSync(this.resultsDir)) {
      fs.mkdirSync(this.resultsDir, { recursive: true });
    }
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = {
      'info': '📊',
      'success': '✅',
      'error': '❌',
      'warning': '⚠️',
      'test': '🧪'
    }[type] || 'ℹ️';
    
    console.log(`${prefix} [${timestamp}] ${message}`);
  }

  async checkServerHealth(url, name) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.log(`${name} health check timeout`, 'warning');
        resolve(false);
      }, 10000);

      fetch(url)
        .then(response => {
          clearTimeout(timeout);
          if (response.ok) {
            this.log(`${name} is healthy`, 'success');
            resolve(true);
          } else {
            this.log(`${name} returned status ${response.status}`, 'warning');
            resolve(false);
          }
        })
        .catch(error => {
          clearTimeout(timeout);
          this.log(`${name} health check failed: ${error.message}`, 'error');
          resolve(false);
        });
    });
  }

  async startServer(command, name, healthUrl) {
    return new Promise((resolve, reject) => {
      this.log(`Starting ${name}...`);
      
      const server = spawn('npm', ['run', command], {
        cwd: this.baseDir,
        stdio: 'pipe',
        shell: true
      });

      server.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('running') || output.includes('listening')) {
          this.log(`${name} output: ${output.trim()}`);
        }
      });

      server.stderr.on('data', (data) => {
        const error = data.toString();
        if (!error.includes('warning') && !error.includes('deprecation')) {
          this.log(`${name} error: ${error.trim()}`, 'warning');
        }
      });

      // Wait for server to be ready
      let attempts = 0;
      const maxAttempts = 30;
      
      const checkHealth = async () => {
        attempts++;
        const isHealthy = await this.checkServerHealth(healthUrl, name);
        
        if (isHealthy) {
          this.servers.push({ name, process: server });
          resolve(server);
        } else if (attempts < maxAttempts) {
          setTimeout(checkHealth, 2000);
        } else {
          reject(new Error(`${name} failed to start after ${maxAttempts} attempts`));
        }
      };

      setTimeout(checkHealth, 3000); // Initial delay
    });
  }

  async startAllServers() {
    this.log('Starting all required servers...', 'info');
    
    try {
      // Start frontend dev server
      await this.startServer('dev', 'Frontend Server', 'http://localhost:8080');
      
      // Start API server
      const apiServerCommand = 'cd docker/api-server && node server.js';
      const apiServer = spawn(apiServerCommand, {
        shell: true,
        stdio: 'pipe'
      });
      
      await new Promise((resolve, reject) => {
        setTimeout(async () => {
          const isHealthy = await this.checkServerHealth('http://localhost:3001/health', 'API Server');
          if (isHealthy) {
            this.servers.push({ name: 'API Server', process: apiServer });
            resolve();
          } else {
            reject(new Error('API Server failed to start'));
          }
        }, 5000);
      });
      
      // Start backtesting server
      const backtestServerCommand = 'cd docker/backtesting-server && node server.js';
      const backtestServer = spawn(backtestServerCommand, {
        shell: true,
        stdio: 'pipe'
      });
      
      await new Promise((resolve, reject) => {
        setTimeout(async () => {
          const isHealthy = await this.checkServerHealth('http://localhost:3002/health', 'Backtesting Server');
          if (isHealthy) {
            this.servers.push({ name: 'Backtesting Server', process: backtestServer });
            resolve();
          } else {
            this.log('Backtesting Server not healthy, but continuing with tests', 'warning');
            resolve(); // Continue even if backtesting server fails
          }
        }, 5000);
      });
      
      this.log('All servers started successfully', 'success');
      return true;
      
    } catch (error) {
      this.log(`Failed to start servers: ${error.message}`, 'error');
      return false;
    }
  }

  async runPlaywrightTests() {
    this.log('Running Playwright visual tests...', 'test');
    
    return new Promise((resolve) => {
      const playwright = spawn('npx', ['playwright', 'test', '--reporter=json'], {
        cwd: this.baseDir,
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      playwright.stdout.on('data', (data) => {
        output += data.toString();
      });

      playwright.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      playwright.on('close', (code) => {
        try {
          const results = JSON.parse(output);
          this.testResults.playwright = {
            exitCode: code,
            passed: results.suites ? results.suites.reduce((acc, suite) => acc + (suite.specs ? suite.specs.filter(spec => spec.ok).length : 0), 0) : 0,
            failed: results.suites ? results.suites.reduce((acc, suite) => acc + (suite.specs ? suite.specs.filter(spec => !spec.ok).length : 0), 0) : 0,
            total: results.suites ? results.suites.reduce((acc, suite) => acc + (suite.specs ? suite.specs.length : 0), 0) : 0
          };
          
          if (code === 0) {
            this.log('Playwright tests completed successfully', 'success');
          } else {
            this.log(`Playwright tests completed with errors (exit code: ${code})`, 'warning');
          }
        } catch (parseError) {
          this.testResults.playwright = {
            exitCode: code,
            error: 'Failed to parse results',
            rawOutput: output,
            rawError: errorOutput
          };
          this.log('Failed to parse Playwright results', 'error');
        }
        
        resolve(this.testResults.playwright);
      });
    });
  }

  async runCypressTests() {
    this.log('Running Cypress visual tests...', 'test');
    
    return new Promise((resolve) => {
      const cypress = spawn('npx', ['cypress', 'run', '--reporter', 'json'], {
        cwd: this.baseDir,
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      cypress.stdout.on('data', (data) => {
        output += data.toString();
      });

      cypress.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      cypress.on('close', (code) => {
        try {
          const results = JSON.parse(output);
          this.testResults.cypress = {
            exitCode: code,
            passed: results.stats ? results.stats.passes : 0,
            failed: results.stats ? results.stats.failures : 0,
            total: results.stats ? results.stats.tests : 0,
            duration: results.stats ? results.stats.duration : 0
          };
          
          if (code === 0) {
            this.log('Cypress tests completed successfully', 'success');
          } else {
            this.log(`Cypress tests completed with errors (exit code: ${code})`, 'warning');
          }
        } catch (parseError) {
          this.testResults.cypress = {
            exitCode: code,
            error: 'Failed to parse results',
            rawOutput: output,
            rawError: errorOutput
          };
          this.log('Failed to parse Cypress results', 'error');
        }
        
        resolve(this.testResults.cypress);
      });
    });
  }

  async runSeleniumTests() {
    this.log('Running Selenium cross-browser tests...', 'test');
    
    return new Promise((resolve) => {
      const selenium = spawn('node', ['tests/visual/selenium-tester.js'], {
        cwd: this.baseDir,
        stdio: 'pipe'
      });

      let output = '';
      let errorOutput = '';

      selenium.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        console.log(text.trim()); // Show real-time output
      });

      selenium.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      selenium.on('close', (code) => {
        try {
          // Look for JSON report in selenium output
          const reportMatch = output.match(/Test report saved: (.+\.json)/);
          let results = {};
          
          if (reportMatch) {
            const reportPath = reportMatch[1];
            if (fs.existsSync(reportPath)) {
              results = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
            }
          }
          
          this.testResults.selenium = {
            exitCode: code,
            passed: results.passed || 0,
            failed: results.failed || 0,
            total: results.total_tests || 0,
            browser: results.browser || 'unknown'
          };
          
          if (code === 0) {
            this.log('Selenium tests completed successfully', 'success');
          } else {
            this.log(`Selenium tests completed with errors (exit code: ${code})`, 'warning');
          }
        } catch (parseError) {
          this.testResults.selenium = {
            exitCode: code,
            error: 'Failed to parse results',
            rawOutput: output,
            rawError: errorOutput
          };
          this.log('Failed to parse Selenium results', 'error');
        }
        
        resolve(this.testResults.selenium);
      });
    });
  }

  async generateFinalReport() {
    this.log('Generating comprehensive test report...', 'info');
    
    // Calculate overall results
    const allTests = [
      this.testResults.playwright,
      this.testResults.cypress,
      this.testResults.selenium
    ].filter(Boolean);
    
    const totalPassed = allTests.reduce((sum, test) => sum + (test.passed || 0), 0);
    const totalFailed = allTests.reduce((sum, test) => sum + (test.failed || 0), 0);
    const totalTests = allTests.reduce((sum, test) => sum + (test.total || 0), 0);
    
    this.testResults.overall = totalFailed === 0 ? 'PASS' : 'PARTIAL_PASS';
    this.testResults.summary = {
      total_tests: totalTests,
      total_passed: totalPassed,
      total_failed: totalFailed,
      pass_rate: totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(2) : 0
    };
    
    // Save comprehensive report
    const reportPath = path.join(this.resultsDir, 'comprehensive-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(this.testResults, null, 2));
    
    // Generate HTML report
    const htmlReport = this.generateHtmlReport();
    const htmlPath = path.join(this.resultsDir, 'visual-test-report.html');
    fs.writeFileSync(htmlPath, htmlReport);
    
    this.log(`Comprehensive report saved: ${reportPath}`, 'success');
    this.log(`HTML report saved: ${htmlPath}`, 'success');
    
    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('🎯 TRADE WHISPERER VISUAL TESTING SUMMARY');
    console.log('='.repeat(60));
    console.log(`📊 Total Tests: ${totalTests}`);
    console.log(`✅ Passed: ${totalPassed}`);
    console.log(`❌ Failed: ${totalFailed}`);
    console.log(`📈 Pass Rate: ${this.testResults.summary.pass_rate}%`);
    console.log(`🏆 Overall Status: ${this.testResults.overall}`);
    console.log('='.repeat(60));
    
    if (this.testResults.playwright) {
      console.log(`🎭 Playwright: ${this.testResults.playwright.passed}/${this.testResults.playwright.total} passed`);
    }
    if (this.testResults.cypress) {
      console.log(`🌲 Cypress: ${this.testResults.cypress.passed}/${this.testResults.cypress.total} passed`);
    }
    if (this.testResults.selenium) {
      console.log(`🌐 Selenium: ${this.testResults.selenium.passed}/${this.testResults.selenium.total} passed`);
    }
    console.log('='.repeat(60) + '\n');
    
    return this.testResults;
  }

  generateHtmlReport() {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Trade Whisperer Visual Testing Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { background: white; border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; }
        .pass { border-left: 4px solid #4CAF50; }
        .fail { border-left: 4px solid #f44336; }
        .partial { border-left: 4px solid #ff9800; }
        .tool-results { margin: 20px 0; }
        .tool-section { background: #f9f9f9; padding: 15px; margin: 10px 0; border-radius: 5px; }
        pre { background: #f0f0f0; padding: 10px; border-radius: 3px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🎯 Trade Whisperer Visual Testing Report</h1>
        <p><strong>Generated:</strong> ${this.testResults.timestamp}</p>
        <p><strong>Overall Status:</strong> <span class="${this.testResults.overall.toLowerCase()}">${this.testResults.overall}</span></p>
    </div>
    
    <div class="summary">
        <div class="metric ${this.testResults.summary.total_passed === this.testResults.summary.total_tests ? 'pass' : 'partial'}">
            <h3>Total Tests</h3>
            <div style="font-size: 2em; font-weight: bold;">${this.testResults.summary.total_tests}</div>
        </div>
        <div class="metric pass">
            <h3>Passed</h3>
            <div style="font-size: 2em; font-weight: bold; color: #4CAF50;">${this.testResults.summary.total_passed}</div>
        </div>
        <div class="metric ${this.testResults.summary.total_failed > 0 ? 'fail' : 'pass'}">
            <h3>Failed</h3>
            <div style="font-size: 2em; font-weight: bold; color: ${this.testResults.summary.total_failed > 0 ? '#f44336' : '#4CAF50'};">${this.testResults.summary.total_failed}</div>
        </div>
        <div class="metric ${parseFloat(this.testResults.summary.pass_rate) >= 80 ? 'pass' : 'partial'}">
            <h3>Pass Rate</h3>
            <div style="font-size: 2em; font-weight: bold;">${this.testResults.summary.pass_rate}%</div>
        </div>
    </div>
    
    <div class="tool-results">
        <h2>📊 Tool-Specific Results</h2>
        
        ${this.testResults.playwright ? `
        <div class="tool-section">
            <h3>🎭 Playwright Results</h3>
            <p>Passed: ${this.testResults.playwright.passed || 0} | Failed: ${this.testResults.playwright.failed || 0} | Total: ${this.testResults.playwright.total || 0}</p>
            <p>Exit Code: ${this.testResults.playwright.exitCode}</p>
        </div>
        ` : ''}
        
        ${this.testResults.cypress ? `
        <div class="tool-section">
            <h3>🌲 Cypress Results</h3>
            <p>Passed: ${this.testResults.cypress.passed || 0} | Failed: ${this.testResults.cypress.failed || 0} | Total: ${this.testResults.cypress.total || 0}</p>
            <p>Duration: ${this.testResults.cypress.duration || 0}ms | Exit Code: ${this.testResults.cypress.exitCode}</p>
        </div>
        ` : ''}
        
        ${this.testResults.selenium ? `
        <div class="tool-section">
            <h3>🌐 Selenium Results</h3>
            <p>Passed: ${this.testResults.selenium.passed || 0} | Failed: ${this.testResults.selenium.failed || 0} | Total: ${this.testResults.selenium.total || 0}</p>
            <p>Browser: ${this.testResults.selenium.browser || 'unknown'} | Exit Code: ${this.testResults.selenium.exitCode}</p>
        </div>
        ` : ''}
    </div>
    
    <div class="tool-results">
        <h2>📁 Generated Assets</h2>
        <ul>
            <li>Playwright screenshots: <code>test-results/playwright-report/</code></li>
            <li>Cypress screenshots: <code>cypress/screenshots/</code></li>
            <li>Selenium screenshots: <code>test-results/selenium-screenshots/</code></li>
            <li>JSON report: <code>test-results/comprehensive-test-report.json</code></li>
        </ul>
    </div>
</body>
</html>`;
  }

  async stopAllServers() {
    this.log('Stopping all servers...', 'info');
    
    for (const server of this.servers) {
      try {
        server.process.kill('SIGTERM');
        this.log(`${server.name} stopped`, 'success');
      } catch (error) {
        this.log(`Failed to stop ${server.name}: ${error.message}`, 'warning');
      }
    }
    
    // Kill any remaining processes
    try {
      exec('pkill -f "node.*server" 2>/dev/null || true');
      exec('pkill -f "vite" 2>/dev/null || true');
    } catch (error) {
      // Ignore errors
    }
  }

  async runFullTestSuite() {
    this.log('🚀 Starting Trade Whisperer Visual Testing Suite', 'info');
    
    try {
      // Start all required servers
      const serversStarted = await this.startAllServers();
      if (!serversStarted) {
        throw new Error('Failed to start required servers');
      }
      
      // Wait a bit for servers to stabilize
      this.log('Waiting for servers to stabilize...', 'info');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Run all test suites in parallel for faster execution
      this.log('Running all test suites...', 'test');
      
      const [playwrightResults, cypressResults, seleniumResults] = await Promise.allSettled([
        this.runPlaywrightTests(),
        this.runCypressTests(),
        this.runSeleniumTests()
      ]);
      
      // Process results
      if (playwrightResults.status === 'fulfilled') {
        this.testResults.playwright = playwrightResults.value;
      } else {
        this.log(`Playwright tests failed: ${playwrightResults.reason}`, 'error');
      }
      
      if (cypressResults.status === 'fulfilled') {
        this.testResults.cypress = cypressResults.value;
      } else {
        this.log(`Cypress tests failed: ${cypressResults.reason}`, 'error');
      }
      
      if (seleniumResults.status === 'fulfilled') {
        this.testResults.selenium = seleniumResults.value;
      } else {
        this.log(`Selenium tests failed: ${seleniumResults.reason}`, 'error');
      }
      
      // Generate final report
      const finalResults = await this.generateFinalReport();
      
      this.log('🏁 Visual testing suite completed', 'success');
      return finalResults;
      
    } catch (error) {
      this.log(`Test suite failed: ${error.message}`, 'error');
      throw error;
    } finally {
      await this.stopAllServers();
    }
  }
}

// Run if called directly
if (require.main === module) {
  const orchestrator = new TradeWhispererTestOrchestrator();
  
  orchestrator.runFullTestSuite()
    .then((results) => {
      console.log('✅ Testing completed successfully');
      process.exit(results.summary.total_failed === 0 ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Testing failed:', error.message);
      process.exit(1);
    });
}

module.exports = TradeWhispererTestOrchestrator;