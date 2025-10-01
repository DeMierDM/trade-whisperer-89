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

    const requestBody = await req.json();
    const { symbol, dataType, start, end, timeframe } = requestBody;

    // Get API keys from database
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys')
      .select('*')
      .eq('user_id', user.id);

    if (keysError) throw keysError;

    const polygonKey = apiKeys?.find(k => k.provider === 'polygon');
    const alpacaKey = apiKeys?.find(k => k.provider === 'alpaca');

    if (dataType === 'options' && polygonKey) {
      // Fetch historical options contracts from Polygon (Options Starter plan)
      // Get all available contracts for backtesting
      const response = await fetch(
        `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&limit=1000&apiKey=${polygonKey.api_key}`
      );

      if (!response.ok) {
        throw new Error(`Polygon API error: ${await response.text()}`);
      }

      const data = await response.json();
      
      return new Response(
        JSON.stringify({ data: data.results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (dataType === 'historical-options' && polygonKey) {
      // Fetch historical minute/day aggregates for a specific options contract
      const { contract, timeframe = '1', from, to } = await req.json();
      
      if (!contract) {
        throw new Error('Contract ticker required for historical options data');
      }
      
      const response = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${contract}/range/${timeframe}/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000&apiKey=${polygonKey.api_key}`
      );

      if (!response.ok) {
        throw new Error(`Polygon API error: ${await response.text()}`);
      }

      const data = await response.json();
      
      return new Response(
        JSON.stringify({ data }),
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
      // Fetch historical bars from Alpaca - only request trading days
      const baseUrl = 'https://data.alpaca.markets';
      
      const endDate = end ? new Date(end) : new Date();
      
      // Calculate start date - go back more days to account for weekends
      const daysToGoBack = 45; // Request more days to ensure we get 30 trading days
      const startDate = start ? new Date(start) : new Date(endDate.getTime() - daysToGoBack * 24 * 60 * 60 * 1000);
      
      const tf = timeframe || '1Min';
      
      console.log(`[BARS REQUEST] Symbol: ${symbol}`);
      console.log(`[BARS REQUEST] Start: ${startDate.toISOString()}`);
      console.log(`[BARS REQUEST] End: ${endDate.toISOString()}`);
      console.log(`[BARS REQUEST] Timeframe: ${tf}`);
      console.log(`[BARS REQUEST] API Key ID: ${alpacaKey.api_key?.substring(0, 8)}...`);
      console.log(`[BARS REQUEST] Mode: ${alpacaKey.mode}`);
      
      const url = `${baseUrl}/v2/stocks/${symbol}/bars?start=${startDate.toISOString()}&end=${endDate.toISOString()}&timeframe=${tf}&limit=10000&feed=iex`;
      console.log(`[BARS REQUEST] Full URL: ${url}`);
      
      const response = await fetch(url, {
        headers: {
          'APCA-API-KEY-ID': alpacaKey.api_key,
          'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
        },
      });

      console.log(`[BARS RESPONSE] Status: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[BARS ERROR] Response:', errorText);
        throw new Error(`Alpaca API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const barCount = data.bars?.[symbol]?.length || 0;
      console.log(`[BARS SUCCESS] Received ${barCount} bars`);
      
      if (barCount === 0) {
        console.warn('[BARS WARNING] No bars returned - possible reasons:');
        console.warn('  - Markets are closed');
        console.warn('  - No trading activity in date range');
        console.warn('  - IEX feed limitation (paper trading)');
        console.warn('  - Symbol not found or invalid');
      } else {
        const firstBar = data.bars[symbol][0];
        const lastBar = data.bars[symbol][barCount - 1];
        console.log(`[BARS INFO] First bar: ${firstBar.t}`);
        console.log(`[BARS INFO] Last bar: ${lastBar.t}`);
      }
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (dataType === 'account' && alpacaKey) {
      // Fetch account data from Alpaca
      const baseUrl = alpacaKey.mode === 'paper' 
        ? 'https://paper-api.alpaca.markets' 
        : 'https://api.alpaca.markets';
      
      // Fetch account info
      const accountResponse = await fetch(`${baseUrl}/v2/account`, {
        headers: {
          'APCA-API-KEY-ID': alpacaKey.api_key,
          'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
        },
      });

      if (!accountResponse.ok) {
        throw new Error(`Alpaca API error: ${await accountResponse.text()}`);
      }

      const accountData = await accountResponse.json();
      
      // Fetch positions
      const positionsResponse = await fetch(`${baseUrl}/v2/positions`, {
        headers: {
          'APCA-API-KEY-ID': alpacaKey.api_key,
          'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
        },
      });
      
      const positions = positionsResponse.ok ? await positionsResponse.json() : [];
      
      return new Response(
        JSON.stringify({ 
          data: {
            account: accountData,
            positions: positions
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else if (dataType === 'orders' && alpacaKey) {
      // Fetch order history for win rate calculation
      const baseUrl = alpacaKey.mode === 'paper' 
        ? 'https://paper-api.alpaca.markets' 
        : 'https://api.alpaca.markets';
      
      const after = new Date();
      after.setDate(after.getDate() - 30); // Last 30 days
      
      const response = await fetch(
        `${baseUrl}/v2/orders?status=closed&after=${after.toISOString()}&limit=500`,
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
