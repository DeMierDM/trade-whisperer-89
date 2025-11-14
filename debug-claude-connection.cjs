const io = require('socket.io-client');

console.log('🧪 Testing Claude chat connection...');

const socket = io('http://localhost:8081', {
  transports: ['websocket', 'polling']
});

let terminalId = null;

socket.on('connect', () => {
  console.log('✅ Connected to terminal bridge');
  
  // Create terminal first
  socket.emit('create-terminal', { sessionId: 'debug-test' });
});

socket.on('terminal-created', (data) => {
  console.log('✅ Terminal created:', data.terminalId);
  terminalId = data.terminalId;
  
  // Wait a bit then send message
  setTimeout(() => {
    console.log('📤 Sending test message: "Hello Claude, are you there?"');
    socket.emit('terminal-input', {
      terminalId: terminalId,
      input: 'Hello Claude, are you there?\n'
    });
  }, 3000); // Wait 3 seconds for Claude to initialize
});

socket.on('terminal-output', (data) => {
  console.log('📥 Received output:', JSON.stringify(data.data));
});

socket.on('disconnect', () => {
  console.log('❌ Disconnected');
});

socket.on('error', (error) => {
  console.error('💥 Error:', error);
});

// Keep alive for 10 seconds
setTimeout(() => {
  console.log('🔚 Test complete, closing connection');
  socket.disconnect();
  process.exit(0);
}, 10000);