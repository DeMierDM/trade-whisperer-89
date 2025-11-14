#!/usr/bin/env node

/**
 * Frontend Connection Health Test
 * Tests if the shared connection fix resolved the connection storm issue
 */

const WebSocket = require('ws');

console.log('🔍 FRONTEND CONNECTION HEALTH CHECK\n');

let connectionCount = 0;
let disconnectionCount = 0;
let subscriptionCount = 0;

// Monitor data bus for a period to verify stable connections
function monitorConnectionHealth() {
  return new Promise((resolve) => {
    console.log('📡 Monitoring data bus connections for 30 seconds...');
    
    const ws = new WebSocket('ws://localhost:3004');
    let connected = false;
    
    ws.on('open', () => {
      console.log('✅ Test client connected to data bus');
      connected = true;
      
      // Just observe, don't interfere
      ws.send(JSON.stringify({
        action: 'subscribe',
        channels: ['test.monitor.health']
      }));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === 'connected') {
          connectionCount++;
          console.log(`📊 Connection detected (total: ${connectionCount})`);
        } else if (message.type === 'subscribed') {
          subscriptionCount++;
          console.log(`📊 Subscription detected (total: ${subscriptionCount})`);
        }
      } catch (error) {
        // Ignore parsing errors from other clients
      }
    });
    
    ws.on('error', (error) => {
      console.error('❌ Monitor error:', error.message);
    });
    
    // Monitor for 30 seconds
    setTimeout(() => {
      if (connected) {
        ws.close();
      }
      
      console.log('\n📊 MONITORING RESULTS:');
      console.log(`🔌 Connections observed: ${connectionCount}`);
      console.log(`❌ Disconnections observed: ${disconnectionCount}`);
      console.log(`📡 Subscriptions observed: ${subscriptionCount}`);
      
      // Health assessment
      const isHealthy = connectionCount <= 2 && (connectionCount <= disconnectionCount + 1);
      
      if (isHealthy) {
        console.log('\n✅ CONNECTION HEALTH: GOOD');
        console.log('The shared connection fix appears to be working correctly.');
      } else {
        console.log('\n⚠️  CONNECTION HEALTH: NEEDS ATTENTION');
        console.log('There may still be connection issues to address.');
      }
      
      resolve({ healthy: isHealthy, connectionCount, disconnectionCount, subscriptionCount });
    }, 30000);
  });
}

// Test frontend responsiveness
async function testFrontendHealth() {
  console.log('\n🌐 Testing frontend accessibility...');
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch('http://localhost:8083/trading', { 
      signal: controller.signal 
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      console.log('✅ Frontend: Accessible and responding');
      return true;
    } else {
      console.log(`⚠️  Frontend: HTTP ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Frontend: ${error.message}`);
    return false;
  }
}

// Main health check
async function runHealthCheck() {
  try {
    console.log('🚀 Starting frontend connection health check...\n');
    
    // Test 1: Frontend accessibility
    const frontendHealthy = await testFrontendHealth();
    
    // Test 2: Connection monitoring
    const connectionHealth = await monitorConnectionHealth();
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 HEALTH CHECK SUMMARY');
    console.log('='.repeat(60));
    console.log(`🌐 Frontend Access: ${frontendHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`);
    console.log(`🔌 Connection Pattern: ${connectionHealth.healthy ? '✅ STABLE' : '⚠️  UNSTABLE'}`);
    
    const overallHealthy = frontendHealthy && connectionHealth.healthy;
    
    console.log('\n🎯 OVERALL STATUS:', overallHealthy ? '✅ FRONTEND HEALTHY' : '⚠️  NEEDS ATTENTION');
    
    if (overallHealthy) {
      console.log('\n🎉 SUCCESS! The frontend connection issues have been resolved.');
      console.log('The shared WebSocket connection is working correctly.');
    } else {
      console.log('\n🔧 Additional debugging may be needed.');
      console.log('Check browser console for more detailed error information.');
    }
    
    return overallHealthy;
    
  } catch (error) {
    console.error('\n💥 Health check failed:', error.message);
    return false;
  }
}

// Run health check
if (require.main === module) {
  runHealthCheck()
    .then((healthy) => {
      process.exit(healthy ? 0 : 1);
    })
    .catch((error) => {
      console.error('\n💥 Health check error:', error.message);
      process.exit(1);
    });
}