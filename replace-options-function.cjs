const fs = require('fs');

// Read the file
let content = fs.readFileSync('docker/api-server/server.js', 'utf8');

// New function content
const newFunction = `function connectToAlpacaOptionsPublisher() {
  console.log('🚀 Options WS Publisher: connecting to Alpaca indicative feed…');

  const apiKey = process.env.ALPACA_LIVE_API_KEY;
  const apiSecret = process.env.ALPACA_LIVE_API_SECRET;
  if (!apiKey || !apiSecret) {
    console.error('❌ Missing Alpaca API keys');
    return;
  }

  const url = 'wss://stream.data.alpaca.markets/v1beta1/indicative';
  let ws;

  const SUB_SYMBOLS = [
    'SPY251219C00600000','SPY251219P00600000',
    'QQQ251219C00450000','QQQ251219P00450000',
    'IWM251219C00200000','IWM251219P00200000'
  ];

  function openSocket() {
    ws = new WebSocket(url);
    // For Node.js, ws gives Buffer; msgpack decoder handles Buffer fine.
    // If you ever see ArrayBuffer, you could also set: ws.binaryType = 'nodebuffer';

    ws.on('open', () => {
      console.log('✅ WS open. Sending auth…');
      const auth = { action: 'auth', key: apiKey, secret: apiSecret };
      ws.send(JSON.stringify(auth));
    });

    ws.on('message', (data) => {
      try {
        // All option messages are MsgPack (even success/auth replies)
        const msg = decode(data);
        const msgs = Array.isArray(msg) ? msg : [msg];

        for (const m of msgs) {
          if (m.T === 'success' && m.msg === 'connected') {
            console.log('✅ WS connected (server). Waiting for auth success…');
          } else if (m.T === 'success' && m.msg === 'authenticated') {
            console.log('✅ Authenticated. Subscribing to quotes/trades…');
            const sub = { action: 'subscribe', quotes: SUB_SYMBOLS, trades: SUB_SYMBOLS };
            ws.send(JSON.stringify(sub));
          } else if (m.T === 'subscription') {
            console.log('📡 Subscribed. Quotes:', m.quotes?.length || 0, 'Trades:', m.trades?.length || 0);
          } else if (m.T === 'q') {
            // Quote message (MsgPack fields)
            const quote = {
              symbol: m.S, bid: m.bp, ask: m.ap,
              bid_size: m.bs, ask_size: m.as,
              timestamp: m.t, data_source: 'indicative_feed'
            };
            // Publish to your bus
            const und = quote.symbol.startsWith('SPY') ? 'SPY' :
                        quote.symbol.startsWith('QQQ') ? 'QQQ' :
                        quote.symbol.startsWith('IWM') ? 'IWM' : 'UNK';
            busClient.publish(\`options.\${und}.quote\`, quote);
            
            // Throttled logging
            if (Math.random() < 0.01) {
              console.log(\`📊 Options Publisher: Published \${m.S} to options.\${und}.quote\`);
            }
          } else if (m.T === 't') {
            const trade = { symbol: m.S, price: m.p, size: m.s, timestamp: m.t, data_source: 'indicative_feed' };
            const und = trade.symbol.startsWith('SPY') ? 'SPY' :
                        trade.symbol.startsWith('QQQ') ? 'QQQ' :
                        trade.symbol.startsWith('IWM') ? 'IWM' : 'UNK';
            busClient.publish(\`options.\${und}.trade\`, trade);
            
            // Throttled logging  
            if (Math.random() < 0.01) {
              console.log(\`📊 Options Publisher: Published \${m.S} to options.\${und}.trade\`);
            }
          } else if (m.T === 'error') {
            console.error('❌ WS error:', m.code, m.msg);
          }
        }
      } catch (e) {
        console.error('❌ MsgPack decode error:', e.message);
      }
    });

    ws.on('close', (code, reason) => {
      console.warn('⚠️ WS closed:', code, reason?.toString());
      setTimeout(openSocket, 5000);
    });

    ws.on('error', (err) => {
      console.error('❌ WS error:', err.message);
    });
  }

  openSocket();
}`;

// Find function start and end
const functionStart = content.indexOf('function connectToAlpacaOptionsPublisher() {');
if (functionStart === -1) {
  console.error('Function not found!');
  process.exit(1);
}

// Find the end of the function by counting braces
let braceCount = 0;
let functionEnd = functionStart;
let inFunction = false;

for (let i = functionStart; i < content.length; i++) {
  const char = content[i];
  if (char === '{') {
    braceCount++;
    inFunction = true;
  } else if (char === '}') {
    braceCount--;
    if (inFunction && braceCount === 0) {
      functionEnd = i + 1;
      break;
    }
  }
}

console.log(`Function found from position ${functionStart} to ${functionEnd}`);

// Replace the function
const newContent = content.substring(0, functionStart) + newFunction + content.substring(functionEnd);

// Write back
fs.writeFileSync('docker/api-server/server.js', newContent);
console.log('✅ Function replaced successfully!');