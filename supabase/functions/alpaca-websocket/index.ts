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
    
    console.log('Connecting to Alpaca WebSocket...');

    alpacaSocket.onopen = () => {
      console.log('Connected to Alpaca WebSocket');
      
      // Authenticate with Alpaca
      alpacaSocket.send(JSON.stringify({
        action: 'auth',
        key: alpacaKey.api_key,
        secret: alpacaKey.api_secret
      }));
    };

    alpacaSocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('Received from Alpaca:', data);
        
        // Handle auth response
        if (data[0]?.T === 'success' && data[0]?.msg === 'authenticated') {
          console.log('Alpaca authentication successful');
          socket.send(JSON.stringify({ type: 'connected', message: 'Connected to Alpaca' }));
        } else {
          // Forward data to client
          socket.send(event.data);
        }
      } catch (error) {
        console.error('Error processing Alpaca message:', error);
      }
    };

    alpacaSocket.onerror = (error) => {
      console.error('Alpaca WebSocket error:', error);
      socket.send(JSON.stringify({ type: 'error', message: 'Alpaca connection error' }));
    };

    alpacaSocket.onclose = () => {
      console.log('Alpaca WebSocket closed');
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