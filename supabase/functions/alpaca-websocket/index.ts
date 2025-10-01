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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

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
    
    // Connect to Alpaca WebSocket
    const alpacaWsUrl = alpacaKey.mode === 'paper'
      ? 'wss://stream.data.alpaca.markets/v2/iex'
      : 'wss://stream.data.alpaca.markets/v2/iex';
    
    const alpacaSocket = new WebSocket(alpacaWsUrl);
    
    console.log('[WS] Connecting to Alpaca WebSocket...');
    console.log('[WS] URL:', alpacaWsUrl);
    console.log('[WS] Mode:', alpacaKey.mode);
    console.log('[WS] API Key:', alpacaKey.api_key?.substring(0, 8) + '...');

    alpacaSocket.onopen = () => {
      console.log('[WS] Connected to Alpaca WebSocket - sending auth');
      
      // Authenticate with Alpaca
      const authMsg = {
        action: 'auth',
        key: alpacaKey.api_key,
        secret: alpacaKey.api_secret
      };
      
      console.log('[WS] Sending auth message');
      alpacaSocket.send(JSON.stringify(authMsg));
    };

    alpacaSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[WS] Received from Alpaca:', JSON.stringify(data).substring(0, 200));
        
        // Handle auth response
        if (data[0]?.T === 'success' && data[0]?.msg === 'authenticated') {
          console.log('[WS] ✓ Alpaca authentication successful');
          socket.send(JSON.stringify({ type: 'connected', message: 'Connected to Alpaca' }));
        } else if (data[0]?.T === 'error') {
          console.error('[WS] ✗ Alpaca auth error:', data[0]?.msg);
          socket.send(JSON.stringify({ type: 'error', message: data[0]?.msg || 'Authentication failed' }));
        } else {
          // Forward data to client
          socket.send(event.data);
        }
      } catch (error) {
        console.error('[WS] Error processing Alpaca message:', error);
      }
    };

    alpacaSocket.onerror = (error) => {
      console.error('[WS] ✗ Alpaca WebSocket error:', error);
      socket.send(JSON.stringify({ type: 'error', message: 'Alpaca connection error' }));
    };

    alpacaSocket.onclose = (event) => {
      console.log('[WS] Alpaca WebSocket closed');
      console.log('[WS] Close code:', event.code);
      console.log('[WS] Close reason:', event.reason);
      socket.send(JSON.stringify({ type: 'disconnected', message: 'Alpaca connection closed' }));
    };

    // Handle messages from client (subscription requests)
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Received from client:', message);
        
        // Forward subscription requests to Alpaca
        if (message.action === 'subscribe' || message.action === 'unsubscribe') {
          alpacaSocket.send(JSON.stringify(message));
        }
      } catch (error) {
        console.error('Error processing client message:', error);
      }
    };

    socket.onclose = () => {
      console.log('Client disconnected');
      alpacaSocket.close();
    };

    socket.onerror = (error) => {
      console.error('Client WebSocket error:', error);
      alpacaSocket.close();
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