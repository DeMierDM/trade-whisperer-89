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
    const stocksWsUrl = 'wss://stream.data.alpaca.markets/v2/iex';
    const stocksSocket = new WebSocket(stocksWsUrl);
    
    // Connect to Alpaca Options WebSocket (v1beta1/options)
    const optionsWsUrl = 'wss://stream.data.alpaca.markets/v1beta1/options';
    const optionsSocket = new WebSocket(optionsWsUrl);
    
    console.log('[WS STOCKS] Connecting to Alpaca stocks WebSocket...');
    console.log('[WS STOCKS] URL:', stocksWsUrl);
    console.log('[WS OPTIONS] Connecting to Alpaca options WebSocket...');
    console.log('[WS OPTIONS] URL:', optionsWsUrl);
    console.log('[WS] Mode:', alpacaKey.mode);
    console.log('[WS] API Key:', alpacaKey.api_key?.substring(0, 8) + '...');

    // Stocks WebSocket handlers
    stocksSocket.onopen = () => {
      console.log('[WS STOCKS] Connected - sending auth');
      const authMsg = {
        action: 'auth',
        key: alpacaKey.api_key,
        secret: alpacaKey.api_secret
      };
      stocksSocket.send(JSON.stringify(authMsg));
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
      socket.send(JSON.stringify({ type: 'disconnected', stream: 'stocks' }));
    };

    // Options WebSocket handlers
    optionsSocket.onopen = () => {
      console.log('[WS OPTIONS] Connected - sending auth');
      const authMsg = {
        action: 'auth',
        key: alpacaKey.api_key,
        secret: alpacaKey.api_secret
      };
      optionsSocket.send(JSON.stringify(authMsg));
    };

    optionsSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS OPTIONS] Received:', JSON.stringify(data).substring(0, 200));
        
        if (data[0]?.T === 'success' && data[0]?.msg === 'authenticated') {
          console.log('[WS OPTIONS] ✓ Authenticated');
          socket.send(JSON.stringify({ type: 'connected', stream: 'options', message: 'Options stream connected' }));
        } else if (data[0]?.T === 'error') {
          console.error('[WS OPTIONS] ✗ Error:', data[0]?.msg);
          socket.send(JSON.stringify({ type: 'error', stream: 'options', message: data[0]?.msg }));
        } else {
          // Tag and forward options data
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
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('[WS CLIENT] Received:', message);
        
        // Forward subscription requests to appropriate stream
        if (message.action === 'subscribe' || message.action === 'unsubscribe') {
          const stream = message.stream || 'stocks'; // default to stocks
          
          if (stream === 'stocks' || !message.stream) {
            console.log('[WS CLIENT] Forwarding to stocks stream');
            stocksSocket.send(JSON.stringify(message));
          }
          
          if (stream === 'options' || message.optionSymbols) {
            console.log('[WS CLIENT] Forwarding to options stream');
            optionsSocket.send(JSON.stringify(message));
          }
        }
      } catch (error) {
        console.error('[WS CLIENT] Error processing message:', error);
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