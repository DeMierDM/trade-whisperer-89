const io = require('socket.io-client');

console.log('🔍 COMPREHENSIVE UI SESSION LIMIT DEBUG TEST');
console.log('================================================');

const socket = io('http://localhost:8081');

socket.on('connect', () => {
    console.log('✅ Connected to terminal bridge (port 8081)');
    console.log('🔍 Socket ID:', socket.id);
    
    // Create/connect to persistent terminal
    socket.emit('create-terminal', { 
        terminalId: 'claude-persistent-main' 
    });
});

socket.on('terminal-created', (data) => {
    console.log('📡 Terminal created:', data);
    console.log('🎯 Now testing session limit detection and frontend display...\n');
    
    // Test 1: Send a regular command first
    setTimeout(() => {
        console.log('📤 Test 1: Sending regular command to check normal flow...');
        socket.emit('terminal-input', {
            terminalId: 'claude-persistent-main',
            command: 'echo "Testing regular command"'
        });
    }, 2000);
    
    // Test 2: Manually simulate backend session limit detection
    setTimeout(() => {
        console.log('📤 Test 2: Simulating backend session limit broadcast...');
        
        // This simulates what terminal-bridge.js should send when it detects session limit
        console.log('🎭 Emitting claude-response with sessionLimit: true...');
        socket.emit('claude-response', {
            terminalId: 'claude-persistent-main',
            response: 'Session limit reached ∙ resets 7am',
            sessionLimit: true,
            timestamp: Date.now()
        });
        
        console.log('✅ Session limit event emitted');
        console.log('📋 Check frontend UI at http://localhost:8080/ai to see if warning appears');
    }, 6000);
    
    // Test 3: Check for any events coming back
    setTimeout(() => {
        console.log('📤 Test 3: Sending another command to see backend response...');
        socket.emit('terminal-input', {
            terminalId: 'claude-persistent-main',
            command: 'What is the current time?'
        });
    }, 10000);
});

// Listen for ALL events to debug what's happening
socket.onAny((eventName, ...args) => {
    console.log(`🎧 Event received: ${eventName}`, args);
    
    if (eventName === 'claude-response') {
        const data = args[0];
        console.log('🎯 CLAUDE-RESPONSE EVENT DETAILS:');
        console.log('   - sessionLimit:', data.sessionLimit);
        console.log('   - response:', data.response ? data.response.substring(0, 100) + '...' : 'none');
        console.log('   - timestamp:', data.timestamp);
        
        if (data.sessionLimit) {
            console.log('🚨 SESSION LIMIT FLAG DETECTED!');
            console.log('✅ Backend is correctly sending session limit events');
            console.log('📱 Frontend should now display the session limit warning');
        }
    }
});

socket.on('disconnect', () => {
    console.log('❌ Disconnected from terminal bridge');
});

socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
});

// Summary after test
setTimeout(() => {
    console.log('\n📋 TEST SUMMARY:');
    console.log('================');
    console.log('1. Check if regular commands worked');
    console.log('2. Check if session limit events were emitted');
    console.log('3. Check frontend at http://localhost:8080/ai for session limit warning');
    console.log('4. If no warning appears, the issue is in the frontend component');
    console.log('5. If warning appears, the backend detection needs debugging');
    console.log('\nTest completed. Disconnecting...');
    
    socket.disconnect();
    process.exit(0);
}, 15000);