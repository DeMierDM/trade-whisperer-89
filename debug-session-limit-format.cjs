const io = require('socket.io-client');

console.log('🔧 Debugging session limit message format...');

const socket = io('http://localhost:8081');

socket.on('connect', () => {
    console.log('✅ Connected to terminal bridge');
    
    // Create terminal
    socket.emit('create-terminal', { 
        terminalId: 'claude-persistent-main' 
    });
});

socket.on('terminal-created', (data) => {
    console.log('📡 Terminal created:', data);
    
    // Send a simple command
    socket.emit('terminal-input', {
        terminalId: 'claude-persistent-main',
        command: 'help'
    });
});

socket.on('claude-response', (data) => {
    console.log('📨 Claude response received:', {
        message: data.message,
        sessionLimit: data.sessionLimit,
        messageLength: data.message ? data.message.length : 0
    });
    
    if (data.message && data.message.includes('Session limit')) {
        console.log('🔍 Session limit message found!');
        console.log('Raw message:', JSON.stringify(data.message));
        console.log('Message bytes:', Array.from(data.message).map(char => char.charCodeAt(0)));
        
        // Test different detection patterns
        const patterns = [
            /Session limit reached/i,
            /resets 7am/i,
            /Session limit/i,
            /limit reached/i,
            /7am/i
        ];
        
        patterns.forEach((pattern, i) => {
            const matches = pattern.test(data.message);
            console.log(`Pattern ${i + 1} (${pattern}): ${matches ? '✅ MATCHES' : '❌ NO MATCH'}`);
        });
    }
});

socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
});

setTimeout(() => {
    console.log('⏱️ Test timeout, closing...');
    socket.disconnect();
    process.exit(0);
}, 10000);