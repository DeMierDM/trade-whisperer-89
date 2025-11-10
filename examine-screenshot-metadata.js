import fs from 'fs';
import path from 'path';

function examineScreenshots() {
    const screenshotDir = 'cypress/screenshots/backtesting-data-flow.cy.js/';
    
    if (!fs.existsSync(screenshotDir)) {
        console.log('❌ Screenshot directory not found');
        return;
    }
    
    const files = fs.readdirSync(screenshotDir)
        .filter(file => file.endsWith('.png'))
        .sort();
    
    console.log(`📊 Found ${files.length} screenshot files`);
    console.log('');
    
    // Analyze progression through steps
    const stepPattern = /cypress-(\d+)-(\d+)-(.+?)\.png$/;
    const steps = {};
    
    files.forEach(file => {
        const match = file.match(stepPattern);
        if (match) {
            const [, testNum, stepNum, stepName] = match;
            const key = `${testNum}-${stepNum}`;
            if (!steps[key]) steps[key] = [];
            steps[key].push(stepName.replace(/\s*\(attempt \d+\)$/, ''));
        }
        
        const stats = fs.statSync(path.join(screenshotDir, file));
        const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
        
        console.log(`📸 ${file}`);
        console.log(`   Size: ${sizeMB}MB | Modified: ${stats.mtime.toLocaleString()}`);
        
        // File size analysis (can indicate content type)
        if (stats.size < 50000) {
            console.log('   ⚠️  Small file - might be error page');
        } else if (stats.size > 500000) {
            console.log('   ✅ Large file - likely full page with content');
        }
        console.log('');
    });
    
    // Show progression summary
    console.log('📈 Step Progression Summary:');
    Object.keys(steps).sort().forEach(key => {
        const uniqueSteps = [...new Set(steps[key])];
        console.log(`   Step ${key}: ${uniqueSteps.join(', ')}`);
    });
}

examineScreenshots();