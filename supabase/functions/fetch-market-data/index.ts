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

    const { symbol, dataType } = await req.json();

    // Get API keys from database
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys')
      .select('*')
      .eq('user_id', user.id);

    if (keysError) throw keysError;

    const polygonKey = apiKeys?.find(k => k.provider === 'polygon');
    const alpacaKey = apiKeys?.find(k => k.provider === 'alpaca');

    if (dataType === 'options' && polygonKey) {
      // Fetch options chain from Polygon
      const today = new Date();
      const nextMonth = new Date(today);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      
      const expirationDate = nextMonth.toISOString().split('T')[0];
      
      const response = await fetch(
        `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expiration_date=${expirationDate}&limit=100&apiKey=${polygonKey.api_key}`
      );

      if (!response.ok) {
        throw new Error(`Polygon API error: ${await response.text()}`);
      }

      const data = await response.json();
      
      return new Response(
        JSON.stringify({ data: data.results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (dataType === 'quote' && alpacaKey) {
      // Fetch latest quote from Alpaca
      const baseUrl = alpacaKey.mode === 'paper' 
        ? 'https://data.alpaca.markets' 
        : 'https://data.alpaca.markets';
      
      const response = await fetch(
        `${baseUrl}/v2/stocks/${symbol}/quotes/latest`,
        {
          headers: {
            'APCA-API-KEY-ID': alpacaKey.api_key,
            'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Alpaca API error: ${await response.text()}`);
      }

      const data = await response.json();
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (dataType === 'bars' && alpacaKey) {
      // Fetch historical bars from Alpaca
      const baseUrl = alpacaKey.mode === 'paper' 
        ? 'https://data.alpaca.markets' 
        : 'https://data.alpaca.markets';
      
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 7);
      
      const response = await fetch(
        `${baseUrl}/v2/stocks/${symbol}/bars?start=${start.toISOString()}&end=${end.toISOString()}&timeframe=1Min&limit=1000`,
        {
          headers: {
            'APCA-API-KEY-ID': alpacaKey.api_key,
            'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Alpaca API error: ${await response.text()}`);
      }

      const data = await response.json();
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      throw new Error('Invalid dataType or missing API keys');
    }
  } catch (error) {
    console.error('Error in fetch-market-data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
