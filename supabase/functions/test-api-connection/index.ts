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

    const { provider, apiKey, apiSecret, mode } = await req.json();

    let isConnected = false;
    let message = '';

    console.log(`Testing ${provider} connection for user ${user.id}`);

    if (provider === 'alpaca') {
      // Test Alpaca API
      const baseUrl = mode === 'paper' 
        ? 'https://paper-api.alpaca.markets' 
        : 'https://api.alpaca.markets';
      
      const response = await fetch(`${baseUrl}/v2/account`, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret || '',
        },
      });
      
      isConnected = response.ok;
      message = response.ok ? 'Alpaca connected successfully' : 'Alpaca connection failed';
      
      if (!response.ok) {
        const errorData = await response.text();
        console.error('Alpaca error:', errorData);
        message += `: ${errorData}`;
      }
    }

    // Use service role client to encrypt and store API keys
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Encrypt the API secret before storing
    const { data: encryptedSecret, error: encryptError } = apiSecret 
      ? await supabaseAdmin.rpc('encrypt_secret', { secret: apiSecret })
      : { data: null, error: null };

    if (encryptError) {
      console.error('Error encrypting secret:', encryptError);
      throw encryptError;
    }

    // Update the connection status in the database with encrypted secret
    const { error: updateError } = await supabaseAdmin
      .from('api_keys')
      .upsert({
        user_id: user.id,
        provider,
        api_key: apiKey,
        api_secret: encryptedSecret,
        mode,
        is_connected: isConnected,
        is_encrypted: apiSecret ? true : false,
        last_tested_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id,provider'
      });

    if (updateError) {
      console.error('Error updating api_keys:', updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({ isConnected, message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in test-api-connection:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
