/**
 * Visual Screenshot Checker
 * Actually examines what the UI shows in screenshots
 */

const { chromium } = require('playwright');
const fs = require('fs');

async function checkUIScreenshots() {
  console.log('\n🔍 VISUAL UI VERIFICATION - Checking What Screenshots Actually Show\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Check if screenshots exist
  const screenshots = [
    'audit-1-app-loaded.png',
    'audit-2-backtest-tab.png', 
    'audit-3-form-filled.png',
    'audit-4-after-button-click.png',
    'final-1-loaded.png',
    'final-2-tab.png'
  ];

  console.log('📋 SCREENSHOT INVENTORY:');
  console.log('-'.repeat(50));
  
  for (const screenshot of screenshots) {
    try {
      const stats = fs.statSync(screenshot);
      console.log(`   ✅ ${screenshot} - ${Math.round(stats.size/1024)}KB`);
    } catch (error) {
      console.log(`   ❌ ${screenshot} - File not found`);
    }
  }

  // Now let me run the ACTUAL UI test with visual verification
  console.log('\n🎯 RUNNING LIVE UI TEST WITH VISUAL VERIFICATION:');
  console.log('-'.repeat(50));

  try {
    await page.goto('http://localhost:8081', { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });

    console.log('✅ App loaded successfully');

    // Take screenshot of initial state
    await page.screenshot({ path: 'visual-check-1-initial.png', fullPage: true });
    console.log('📸 Screenshot 1: Initial app state');

    // Click backtesting tab
    await page.click('text=Backtesting');
    await page.waitForTimeout(2000);
    
    await page.screenshot({ path: 'visual-check-2-backtest-tab.png', fullPage: true });
    console.log('📸 Screenshot 2: Backtesting tab opened');

    // Check if form is visible
    const formVisible = await page.isVisible('form');
    console.log(`   Form visible: ${formVisible}`);

    // Check if button exists and its state
    const buttonSelector = 'button:has-text("Run Backtest")';
    const buttonExists = await page.isVisible(buttonSelector);
    console.log(`   Run Backtest button visible: ${buttonExists}`);

    if (buttonExists) {
      const buttonDisabled = await page.isDisabled(buttonSelector);
      console.log(`   Button disabled: ${buttonDisabled}`);
      
      if (buttonDisabled) {
        console.log('⏳ Button is disabled - checking for data loading...');
        
        // Wait for data to load (check for loading indicators)
        await page.waitForFunction(() => {
          const loadingElements = document.querySelectorAll('[data-loading="true"], .loading, .spinner');
          return loadingElements.length === 0;
        }, { timeout: 30000 });
        
        console.log('✅ Data loading completed');
        
        const buttonStillDisabled = await page.isDisabled(buttonSelector);
        console.log(`   Button still disabled after data load: ${buttonStillDisabled}`);
      }
      
      if (!await page.isDisabled(buttonSelector)) {
        console.log('🎯 Clicking Run Backtest button...');
        
        // Fill form first
        await page.fill('input[type="date"]', '2024-10-10');
        await page.selectOption('select', 'SPY');
        
        await page.screenshot({ path: 'visual-check-3-form-filled.png', fullPage: true });
        console.log('📸 Screenshot 3: Form filled');
        
        // Click the button
        await page.click(buttonSelector);
        console.log('✅ Button clicked');
        
        // Wait a moment then take screenshot
        await page.waitForTimeout(3000);
        await page.screenshot({ path: 'visual-check-4-after-click.png', fullPage: true });
        console.log('📸 Screenshot 4: Immediately after button click');
        
        // Check if screen is blank or has content
        const bodyText = await page.textContent('body');
        const hasContent = bodyText && bodyText.trim().length > 100;
        console.log(`   Screen has content: ${hasContent}`);
        console.log(`   Body text length: ${bodyText ? bodyText.length : 0} characters`);
        
        // Check for specific UI elements
        const resultsVisible = await page.isVisible('.results, .metrics, .trade-history, [data-testid*="result"]');
        console.log(`   Results section visible: ${resultsVisible}`);
        
        // Wait longer to see if results appear
        console.log('⏳ Waiting 15 seconds for results to load...');
        await page.waitForTimeout(15000);
        
        await page.screenshot({ path: 'visual-check-5-after-wait.png', fullPage: true });
        console.log('📸 Screenshot 5: After waiting for results');
        
        // Final check
        const finalBodyText = await page.textContent('body');
        const finalHasContent = finalBodyText && finalBodyText.trim().length > 100;
        console.log(`   Final screen has content: ${finalHasContent}`);
        
        // Check for error messages
        const errorVisible = await page.isVisible('.error, .alert, [role="alert"]');
        console.log(`   Error message visible: ${errorVisible}`);
        
        if (errorVisible) {
          const errorText = await page.textContent('.error, .alert, [role="alert"]');
          console.log(`   Error text: ${errorText}`);
        }
        
      } else {
        console.log('❌ Button remains disabled - cannot test click');
      }
    } else {
      console.log('❌ Run Backtest button not found');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    await page.screenshot({ path: 'visual-check-error.png', fullPage: true });
    console.log('📸 Error screenshot saved');
  }

  await browser.close();
  
  console.log('\n📋 VISUAL VERIFICATION COMPLETE');
  console.log('-'.repeat(50));
  console.log('   Check the visual-check-*.png files to see actual UI state');
  console.log('   Pay attention to visual-check-4-after-click.png and visual-check-5-after-wait.png\n');
}

checkUIScreenshots().catch(console.error);