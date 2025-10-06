import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { headers } = req;
    const upgradeHeader = headers.get("upgrade") || "";

    if (upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket connection", { status: 400 });
    }

    // Extract auth token from query parameter (browser WebSocket limitation)
    const url = new URL(req.url);
    const token = url.searchParams.get('token');
    
    if (!token) {
      throw new Error('No authorization token found in query parameters');
    }

    const authHeader = `Bearer ${token}`;

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get API keys from database
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys')
      .select('*')
      .eq('user_id', user.id);

    if (keysError) throw keysError;

    const alpacaKey = apiKeys?.find(k => k.provider === 'alpaca');
    
    if (!alpacaKey) {
      throw new Error('Alpaca API key not configured');
    }

    const { socket, response } = Deno.upgradeWebSocket(req);
    
    // Connect to Alpaca Stock WebSocket (v2/iex)
    // Following Python's OptionDataStream pattern but adapted for WebSocket API
    const stocksWsUrl = 'wss://stream.data.alpaca.markets/v2/iex';
    const stocksSocket = new WebSocket(stocksWsUrl);
    
    // Connect to Alpaca Options WebSocket (v2/options)
    // Note: Paper accounts may have limited access to options streams
    const optionsWsUrl = 'wss://stream.data.alpaca.markets/v2/options';
    const optionsSocket = new WebSocket(optionsWsUrl);
    
    // Keepalive timers
    let stocksPing: number | undefined;
    let optionsPing: number | undefined;
    
    console.log('[WS STOCKS] Connecting to Alpaca stocks WebSocket...');
    console.log('[WS STOCKS] URL:', stocksWsUrl);
    console.log('[WS OPTIONS] Connecting to Alpaca options WebSocket...');
    console.log('[WS OPTIONS] URL:', optionsWsUrl);
    console.log('[WS] Mode:', alpacaKey.mode);
    console.log('[WS] API Key:', alpacaKey.api_key?.substring(0, 8) + '...');
    
    if (alpacaKey.mode === 'paper') {
      console.warn('[WS] Paper account - options stream may have limited functionality');
    }

    // Stocks WebSocket handlers
    stocksSocket.onopen = () => {
      console.log('[WS STOCKS] Connected - sending auth');
      const authMsg = {
        action: 'auth',
        key: alpacaKey.api_key,
        secret: alpacaKey.api_secret
      };
      stocksSocket.send(JSON.stringify(authMsg));
      // Start keepalive ping
      try {
        stocksPing = setInterval(() => {
          if (stocksSocket.readyState === WebSocket.OPEN) {
            stocksSocket.send(JSON.stringify({ action: 'ping' }));
          }
        }, 20000) as unknown as number;
      } catch (_) {}

    };

    stocksSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS STOCKS] Received:', JSON.stringify(data).substring(0, 200));
        
        if (data[0]?.T === 'success' && data[0]?.msg === 'authenticated') {
          console.log('[WS STOCKS] ✓ Authenticated');
          socket.send(JSON.stringify({ type: 'connected', stream: 'stocks', message: 'Stocks stream connected' }));
        } else if (data[0]?.T === 'error') {
          console.error('[WS STOCKS] ✗ Error:', data[0]?.msg);
          socket.send(JSON.stringify({ type: 'error', stream: 'stocks', message: data[0]?.msg }));
        } else {
          // Tag and forward stocks data
          socket.send(JSON.stringify({ stream: 'stocks', data }));
        }
      } catch (error) {
        console.error('[WS STOCKS] Error processing message:', error);
      }
    };

    stocksSocket.onerror = (error) => {
      console.error('[WS STOCKS] ✗ Error:', error);
      socket.send(JSON.stringify({ type: 'error', stream: 'stocks', message: 'Stocks connection error' }));
    };

    stocksSocket.onclose = (event) => {
      console.log('[WS STOCKS] Closed:', event.code, event.reason);
      if (stocksPing) {
        try { clearInterval(stocksPing); } catch (_) {}
        stocksPing = undefined;
      }
      socket.send(JSON.stringify({ type: 'disconnected', stream: 'stocks' }));
    };

    // Options WebSocket handlers
    // Following Alpaca's WebSocket protocol for options (similar to Python's async pattern)
    optionsSocket.onopen = () => {
      console.log('[WS OPTIONS] Connected - sending auth');
      const authMsg = {
        action: 'auth',
        key: alpacaKey.api_key,
        secret: alpacaKey.api_secret
      };
      optionsSocket.send(JSON.stringify(authMsg));
      console.log('[WS OPTIONS] Auth message sent');
      // Start keepalive ping
      try {
        optionsPing = setInterval(() => {
          if (optionsSocket.readyState === WebSocket.OPEN) {
            optionsSocket.send(JSON.stringify({ action: 'ping' }));
          }
        }, 20000) as unknown as number;
      } catch (_) {}

    };

    optionsSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS OPTIONS] Received:', JSON.stringify(data).substring(0, 200));
        
        // Handle Alpaca WebSocket message types
        if (Array.isArray(data)) {
          for (const msg of data) {
            if (msg.T === 'success' && msg.msg === 'authenticated') {
              console.log('[WS OPTIONS] ✓ Authenticated successfully');
              socket.send(JSON.stringify({ 
                type: 'connected', 
                stream: 'options', 
                message: 'Options stream authenticated',
                paperAccount: alpacaKey.mode === 'paper'
              }));
            } else if (msg.T === 'error') {
              console.error('[WS OPTIONS] ✗ Error:', msg.msg, msg.code);
              // Check for paper account limitations
              if (msg.msg?.includes('not found') || msg.msg?.includes('not available')) {
                console.warn('[WS OPTIONS] Paper account limitation - options stream unavailable');
                socket.send(JSON.stringify({ 
                  type: 'error', 
                  stream: 'options', 
                  message: 'Options stream not available on paper account',
                  code: 'PAPER_ACCOUNT_LIMITATION'
                }));
              } else {
                socket.send(JSON.stringify({ type: 'error', stream: 'options', message: msg.msg }));
              }
            } else if (msg.T === 'subscription') {
              console.log('[WS OPTIONS] Subscription confirmed:', msg);
              socket.send(JSON.stringify({ type: 'subscribed', stream: 'options', data: msg }));
            } else if (msg.T === 'q' || msg.T === 't') {
              // Quote or Trade data - forward to client
              socket.send(JSON.stringify({ stream: 'options', type: msg.T, data: msg }));
            }
          }
        } else {
          // Non-array message format
          socket.send(JSON.stringify({ stream: 'options', data }));
        }
      } catch (error) {
        console.error('[WS OPTIONS] Error processing message:', error);
      }
    };

    optionsSocket.onerror = (error) => {
      console.error('[WS OPTIONS] ✗ Error:', error);
      socket.send(JSON.stringify({ type: 'error', stream: 'options', message: 'Options connection error' }));
    };

    optionsSocket.onclose = (event) => {
      console.log('[WS OPTIONS] Closed:', event.code, event.reason);
      socket.send(JSON.stringify({ type: 'disconnected', stream: 'options' }));
    };

    // Handle messages from client (subscription requests)
    // Following Alpaca's subscription protocol (matching Python's subscribe_quotes/subscribe_trades pattern)
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WS CLIENT] Received:', message);
        
        // Forward subscription requests to appropriate stream
        if (message.action === 'subscribe' || message.action === 'unsubscribe') {
          const stream = message.stream || 'stocks'; // default to stocks
          
          // Prepare subscription message for Alpaca
          const alpacaMessage: any = {
            action: message.action
          };
          
          if (stream === 'stocks' || !message.stream) {
            // Stock subscriptions (quotes, trades, bars)
            if (message.quotes) alpacaMessage.quotes = message.quotes;
            if (message.trades) alpacaMessage.trades = message.trades;
            if (message.bars) alpacaMessage.bars = message.bars;
            
            console.log('[WS CLIENT] Forwarding to stocks stream:', alpacaMessage);
            if (stocksSocket.readyState === WebSocket.OPEN) {
              stocksSocket.send(JSON.stringify(alpacaMessage));
            } else {
              console.warn('[WS CLIENT] Stocks socket not ready:', stocksSocket.readyState);
            }
          }
          
          if (stream === 'options' || message.optionSymbols) {
            // Options subscriptions (quotes, trades)
            const optionsMessage: any = {
              action: message.action
            };
            
            if (message.optionSymbols) optionsMessage.quotes = message.optionSymbols;
            if (message.quotes) optionsMessage.quotes = message.quotes;
            if (message.trades) optionsMessage.trades = message.trades;
            
            console.log('[WS CLIENT] Forwarding to options stream:', optionsMessage);
            if (optionsSocket.readyState === WebSocket.OPEN) {
              optionsSocket.send(JSON.stringify(optionsMessage));
            } else {
              console.warn('[WS CLIENT] Options socket not ready:', optionsSocket.readyState);
              if (alpacaKey.mode === 'paper') {
                socket.send(JSON.stringify({
                  type: 'warning',
                  stream: 'options',
                  message: 'Options WebSocket not available on paper account'
                }));
              }
            }
          }
        }
      } catch (error) {
        console.error('[WS CLIENT] Error processing message:', error);
        socket.send(JSON.stringify({
          type: 'error',
          message: 'Failed to process subscription request'
        }));
      }
    };

    socket.onclose = () => {
      console.log('[WS CLIENT] Disconnected');
      stocksSocket.close();
      optionsSocket.close();
    };

    socket.onerror = (error) => {
      console.error('[WS CLIENT] Error:', error);
      stocksSocket.close();
      optionsSocket.close();
    };

    return response;
  } catch (error) {
    console.error('Error in alpaca-websocket:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});