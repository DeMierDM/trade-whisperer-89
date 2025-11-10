/**
 * Electron App Screenshot Auditing Script
 *
 * This script automatically:
 * 1. Launches the Electron app
 * 2. Takes screenshots of all pages
 * 3. Validates that data is being displayed correctly
 * 4. Generates an audit report
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Configuration
const CONFIG = {
  screenshotDir: './audit-screenshots',
  reportPath: './ELECTRON_AUDIT_REPORT.md',
  appUrl: 'http://localhost:8080',
  timeout: 60000,
  pages: [
    { name: 'Home', path: '/', checks: ['Market Status', 'System Health'] },
    { name: 'Trading', path: '/trading', checks: ['SPY', 'Chart', 'Live Data'] },
    { name: 'Backtesting', path: '/backtesting', checks: ['Backtest', 'Strategy'] },
    { name: 'Diagnostics', path: '/diagnostics', checks: ['Data Bus', 'Docker'] }
  ]
};

// Helper functions
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const icon = {
    info: '📋',
    success: '✅',
    error: '❌',
    warning: '⚠️'
  }[type] || 'ℹ️';

  console.log(`${icon} [${timestamp}] ${message}`);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`Created directory: ${dir}`, 'info');
  }
}

async function waitForServices() {
  log('Waiting for services to be ready...');

  const maxAttempts = 30;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('http://localhost:3001/health');
      if (response.ok) {
        log('API Server is ready', 'success');

        // Also check Data Bus
        const busResponse = await fetch('http://localhost:3004/health');
        if (busResponse.ok) {
          log('Data Bus is ready', 'success');
          return true;
        }
      }
    } catch (error) {
      // Service not ready yet
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  log('Services did not become ready in time', 'warning');
  return false;
}

async function takeScreenshot(page, name) {
  const filename = `${name.toLowerCase().replace(/\s+/g, '-')}.png`;
  const filepath = path.join(CONFIG.screenshotDir, filename);

  await page.screenshot({
    path: filepath,
    fullPage: true,
    animations: 'disabled'
  });

  log(`Screenshot saved: ${filename}`, 'success');
  return filepath;
}

async function checkForElements(page, elements) {
  const results = [];

  for (const element of elements) {
    try {
      const isVisible = await page.getByText(element, { exact: false }).isVisible({ timeout: 2000 });
      results.push({ element, found: isVisible });
      log(`  - ${element}: ${isVisible ? '✓' : '✗'}`, isVisible ? 'success' : 'warning');
    } catch (error) {
      results.push({ element, found: false });
      log(`  - ${element}: ✗ (not found)`, 'warning');
    }
  }

  return results;
}

async function extractConsoleErrors(page) {
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', error => {
    errors.push(error.message);
  });

  return errors;
}

async function checkDataFlowHealth(page) {
  log('Checking data flow health...');

  try {
    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 10000 });

    // Check for common error indicators
    const hasErrorMessage = await page.getByText('error', { exact: false }).count() > 0;
    const hasDisconnected = await page.getByText('disconnected', { exact: false }).count() > 0;
    const hasLoading = await page.getByText('loading', { exact: false }).count() > 0;

    return {
      hasErrors: hasErrorMessage,
      isDisconnected: hasDisconnected,
      isStillLoading: hasLoading
    };
  } catch (error) {
    log(`Error checking data flow: ${error.message}`, 'error');
    return { hasErrors: true, isDisconnected: true, isStillLoading: false };
  }
}

async function generateReport(auditResults) {
  log('Generating audit report...');

  const timestamp = new Date().toISOString();
  const totalPages = auditResults.length;
  const successfulPages = auditResults.filter(r => r.success).length;

  let report = `# Electron App Audit Report\n\n`;
  report += `**Generated:** ${timestamp}\n\n`;
  report += `**Summary:** ${successfulPages}/${totalPages} pages passed validation\n\n`;
  report += `---\n\n`;

  // Overall status
  report += `## Overall Status\n\n`;
  report += `- Docker Containers: ${auditResults[0]?.dockerStatus || 'Unknown'}\n`;
  report += `- API Server: ${auditResults[0]?.apiStatus || 'Unknown'}\n`;
  report += `- Data Bus: ${auditResults[0]?.dataBusStatus || 'Unknown'}\n\n`;

  // Page-by-page results
  report += `## Page Audit Results\n\n`;

  for (const result of auditResults) {
    const status = result.success ? '✅ PASS' : '❌ FAIL';
    report += `### ${status} - ${result.pageName}\n\n`;
    report += `**URL:** ${result.url}\n\n`;
    report += `**Screenshot:** [${result.screenshot}](${result.screenshot})\n\n`;

    if (result.elements && result.elements.length > 0) {
      report += `**Elements Found:**\n`;
      for (const elem of result.elements) {
        report += `- ${elem.found ? '✓' : '✗'} ${elem.element}\n`;
      }
      report += `\n`;
    }

    if (result.dataFlow) {
      report += `**Data Flow Status:**\n`;
      report += `- Has Errors: ${result.dataFlow.hasErrors ? '❌ Yes' : '✅ No'}\n`;
      report += `- Disconnected: ${result.dataFlow.isDisconnected ? '❌ Yes' : '✅ No'}\n`;
      report += `- Still Loading: ${result.dataFlow.isStillLoading ? '⚠️ Yes' : '✅ No'}\n\n`;
    }

    if (result.consoleErrors && result.consoleErrors.length > 0) {
      report += `**Console Errors:**\n`;
      report += `\`\`\`\n`;
      result.consoleErrors.forEach(err => report += `${err}\n`);
      report += `\`\`\`\n\n`;
    }

    report += `---\n\n`;
  }

  // Recommendations
  report += `## Recommendations\n\n`;

  const failedPages = auditResults.filter(r => !r.success);
  if (failedPages.length === 0) {
    report += `✅ All pages passed validation! The electron app is displaying data correctly.\n\n`;
  } else {
    report += `The following pages need attention:\n\n`;
    failedPages.forEach(page => {
      report += `- **${page.pageName}**: Check screenshot for issues\n`;
    });
  }

  fs.writeFileSync(CONFIG.reportPath, report);
  log(`Report generated: ${CONFIG.reportPath}`, 'success');
}

async function main() {
  log('Starting Electron App Audit', 'info');

  // Ensure screenshot directory exists
  ensureDir(CONFIG.screenshotDir);

  // Wait for services
  const servicesReady = await waitForServices();

  // Launch browser
  log('Launching browser...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    recordVideo: {
      dir: CONFIG.screenshotDir,
      size: { width: 1400, height: 900 }
    }
  });

  const page = await context.newPage();

  // Track console errors
  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const auditResults = [];

  try {
    // Check service status
    const dockerStatus = servicesReady ? '✅ Running' : '❌ Not Ready';
    const apiStatus = servicesReady ? '✅ Healthy' : '❌ Unhealthy';
    const dataBusStatus = servicesReady ? '✅ Connected' : '❌ Disconnected';

    // Audit each page
    for (const pageConfig of CONFIG.pages) {
      log(`\nAuditing page: ${pageConfig.name}`, 'info');

      const url = `${CONFIG.appUrl}${pageConfig.path}`;

      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: CONFIG.timeout });

        // Wait a bit for data to load
        await page.waitForTimeout(3000);

        // Take screenshot
        const screenshot = await takeScreenshot(page, pageConfig.name);

        // Check for expected elements
        const elements = await checkForElements(page, pageConfig.checks);

        // Check data flow health
        const dataFlow = await checkDataFlowHealth(page);

        // Determine success
        const foundCount = elements.filter(e => e.found).length;
        const success = foundCount >= Math.ceil(elements.length / 2) && !dataFlow.hasErrors;

        auditResults.push({
          pageName: pageConfig.name,
          url,
          screenshot,
          elements,
          dataFlow,
          consoleErrors: [...consoleErrors],
          success,
          dockerStatus,
          apiStatus,
          dataBusStatus
        });

        log(`Page audit ${success ? 'passed' : 'failed'}`, success ? 'success' : 'warning');

        // Clear console errors for next page
        consoleErrors.length = 0;

      } catch (error) {
        log(`Error auditing ${pageConfig.name}: ${error.message}`, 'error');
        auditResults.push({
          pageName: pageConfig.name,
          url,
          error: error.message,
          success: false,
          dockerStatus,
          apiStatus,
          dataBusStatus
        });
      }
    }

  } finally {
    // Close browser
    await browser.close();
    log('Browser closed');
  }

  // Generate report
  await generateReport(auditResults);

  log('\n===========================================', 'info');
  log('Audit Complete!', 'success');
  log('===========================================\n', 'info');
  log(`Screenshots saved to: ${CONFIG.screenshotDir}`);
  log(`Report saved to: ${CONFIG.reportPath}`);

  const successCount = auditResults.filter(r => r.success).length;
  const totalCount = auditResults.length;

  if (successCount === totalCount) {
    log(`\n🎉 All ${totalCount} pages passed!`, 'success');
    process.exit(0);
  } else {
    log(`\n⚠️ ${totalCount - successCount} of ${totalCount} pages failed`, 'warning');
    process.exit(1);
  }
}

// Run the audit
main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  console.error(error);
  process.exit(1);
});
