// Quick Diagnostic Script
// Open browser console and run: `runDiagnostics()`

window.runDiagnostics = function() {
  console.log('🔍 Running Application Diagnostics...');
  console.log('==========================================');
  
  // 1. Check if React app is loaded
  console.log('1. React App Status:');
  const reactRoot = document.querySelector('#root');
  if (reactRoot && reactRoot.children.length > 0) {
    console.log('✅ React app loaded successfully');
  } else {
    console.log('❌ React app not loaded or empty');
  }
  
  // 2. Check for JavaScript errors
  console.log('\n2. Error Detection:');
  const errors = [];
  window.addEventListener('error', (e) => {
    errors.push(e.message);
  });
  
  if (errors.length === 0) {
    console.log('✅ No JavaScript errors detected');
  } else {
    console.log('❌ JavaScript errors found:', errors);
  }
  
  // 3. Check network connectivity
  console.log('\n3. Network Connectivity:');
  fetch('/vite.svg')
    .then(() => console.log('✅ Network connection working'))
    .catch(() => console.log('❌ Network connection failed'));
    
  // 4. Check if on correct page
  console.log('\n4. Current Location:');
  console.log('URL:', window.location.href);
  console.log('Path:', window.location.pathname);
  
  // 5. Check for chart components
  console.log('\n5. Chart Components:');
  const chartContainers = document.querySelectorAll('[class*="TradingView"], [class*="chart"], canvas');
  console.log(`Found ${chartContainers.length} chart-related elements`);
  
  // 6. Check for data
  console.log('\n6. Data Status:');
  const statusElements = document.querySelectorAll('[class*="text-green"], [class*="animate-pulse"]');
  console.log(`Found ${statusElements.length} status indicators`);
  
  console.log('\n📊 Diagnostics Complete!');
  console.log('Navigate to /trading page if not already there');
};

console.log('💡 Diagnostics loaded. Run runDiagnostics() to check connection issues.');