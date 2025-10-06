import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Retry configuration (following Python pattern)
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;
const BACKOFF_MULTIPLIER = 2;

/**
 * Ensures a date is timezone-aware (UTC) - following Python's timezone handling
 */
function ensureUTCDate(dateInput: string | Date): Date {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  // If no timezone info, assume UTC
  if (!dateInput.toString().includes('Z') && !dateInput.toString().includes('+')) {
    return new Date(date.toISOString());
  }
  return date;
}

/**
 * Retry wrapper for API calls with exponential backoff
 * Matches Python's retry logic pattern
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[RETRY] ${operationName} - Attempt ${attempt}/${maxRetries}`);
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = RETRY_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, attempt - 1);
        console.warn(`[RETRY] ${operationName} failed (attempt ${attempt}): ${lastError.message}`);
        console.log(`[RETRY] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`[RETRY] ${operationName} failed after ${maxRetries} attempts`);
  throw lastError;
}

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

    console.log('[REQUEST] User:', user.id.substring(0, 8) + '...');
    console.log('[REQUEST] Data Type:', dataType);
    console.log('[REQUEST] Symbol:', symbol);

    // Get API keys from database
    const { data: apiKeys, error: keysError } = await supabaseClient
      .from('api_keys')
      .select('*')
      .eq('user_id', user.id);

    if (keysError) throw keysError;

    const alpacaKey = apiKeys?.find(k => k.provider === 'alpaca');

    if (!alpacaKey) {
      throw new Error('No Alpaca API keys found. Please add your keys in Settings.');
    }

    console.log('[API KEY] Found Alpaca key for mode:', alpacaKey.mode);

    // ==================== OPTIONS CHAIN ====================
    if (dataType === 'options') {
      const data = await retryWithBackoff(async () => {
        console.log('[OPTIONS] Fetching options contracts');
        console.log('[OPTIONS] Symbol:', symbol);
        console.log('[OPTIONS] API Key ID:', alpacaKey.api_key?.substring(0, 8) + '...');
        console.log('[OPTIONS] Account mode:', alpacaKey.mode);
        
        const baseUrl = 'https://data.alpaca.markets';
        const encodedSymbol = encodeURIComponent(symbol);
        const url = `${baseUrl}/v1beta1/options/contracts?underlying_symbols=${encodedSymbol}&status=active&limit=1000`;
        
        console.log('[OPTIONS] Request URL:', url);
        
        const response = await fetch(url, {
          headers: {
            'APCA-API-KEY-ID': alpacaKey.api_key,
            'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
          },
        });

        console.log('[OPTIONS] Response status:', response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[OPTIONS] Error response:', errorText);
          
          if (response.status === 404) {
            throw new Error('Options data not available. Paper trading accounts have limited access to options endpoints. Please upgrade to a live account or use stock data.');
          } else if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication failed. Please verify your Alpaca API keys in Settings.');
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait before trying again.');
          }
          
          throw new Error(`Alpaca options API error: ${response.status} - ${errorText}`);
        }

        const json = await response.json();
        console.log('[OPTIONS] Response structure:', Object.keys(json));
        
        const contracts = json.contracts || json.data?.contracts || json.results || [];
        console.log('[OPTIONS] Found', contracts.length, 'contracts');
        
        if (contracts.length === 0) {
          console.warn('[OPTIONS] No contracts returned. Possible reasons:');
          console.warn('  - Symbol may not have active options');
          console.warn('  - Paper trading account limitations');
          console.warn('  - Market hours restrictions');
        }
        
        // Map Alpaca contract fields to UI-friendly shape
        const mapped = contracts.map((c: any) => ({
          cfi: c.cfi || null,
          contract_type: (c.type || c.contract_type || '').toString().toLowerCase().includes('p') ? 'put' : 'call',
          exercise_style: (c.style || c.exercise_style || 'american').toString().toLowerCase(),
          expiration_date: c.expiration_date,
          primary_exchange: c.exchange || c.primary_exchange || 'OPRA',
          shares_per_contract: c.shares_per_contract || 100,
          strike_price: c.strike || c.strike_price,
          ticker: c.symbol || c.ticker,
          underlying_ticker: c.underlying_symbol || c.underlying_ticker || symbol,
        }));

        console.log('[OPTIONS] Successfully mapped', mapped.length, 'contracts');
        return mapped;
      }, 'Fetch Options Chain');

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== HISTORICAL OPTIONS BARS ====================
    if (dataType === 'historical-options') {
      const { contract, timeframe: tf = '1Min', from, to } = requestBody;
      if (!contract) throw new Error('Contract ticker required for historical options data');

      const data = await retryWithBackoff(async () => {
        console.log('[OPTIONS BARS] Fetching historical option bars');
        console.log('[OPTIONS BARS] Contract:', contract);
        console.log('[OPTIONS BARS] Timeframe:', tf);
        console.log('[OPTIONS BARS] Raw dates:', from, 'to', to);
        
        // Ensure UTC timezone (following Python pattern)
        const startDate = ensureUTCDate(from);
        const endDate = ensureUTCDate(to);
        
        console.log('[OPTIONS BARS] UTC dates:', startDate.toISOString(), 'to', endDate.toISOString());

        const baseUrl = 'https://data.alpaca.markets';
        const url = `${baseUrl}/v1beta1/options/bars?symbols=${encodeURIComponent(contract)}&timeframe=${tf}&start=${encodeURIComponent(startDate.toISOString())}&end=${encodeURIComponent(endDate.toISOString())}&limit=50000`;
        
        console.log('[OPTIONS BARS] Request URL:', url);
        
        const response = await fetch(url, {
          headers: {
            'APCA-API-KEY-ID': alpacaKey.api_key,
            'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
          },
        });
        
        console.log('[OPTIONS BARS] Response status:', response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('[OPTIONS BARS] Error response:', errorText);
          
          if (response.status === 404) {
            throw new Error('Options historical data not available. Paper accounts have limited access. Consider upgrading to a live account.');
          } else if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication failed. Please verify your API keys.');
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait before retrying.');
          }
          
          throw new Error(`Alpaca options bars error: ${response.status} - ${errorText}`);
        }
        
        const data = await response.json();
        const barCount = data.bars?.[contract]?.length || 0;
        console.log('[OPTIONS BARS] Success - received', barCount, 'bars');
        
        return data;
      }, 'Fetch Options Historical Bars');
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== STOCK QUOTE ====================
    if (dataType === 'quote') {
      const data = await retryWithBackoff(async () => {
        console.log('[QUOTE] Fetching latest quote for', symbol);
        const baseUrl = 'https://data.alpaca.markets';
        
        const response = await fetch(
          `${baseUrl}/v2/stocks/${symbol}/quotes/latest`,
          {
            headers: {
              'APCA-API-KEY-ID': alpacaKey.api_key,
              'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
            },
          }
        );

        console.log('[QUOTE] Response status:', response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[QUOTE] Error response:', errorText);
          
          if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication failed. Check your API keys.');
          }
          
          throw new Error(`Alpaca API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[QUOTE] Success - Latest quote received');
        
        return data;
      }, 'Fetch Latest Quote');
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== STOCK HISTORICAL BARS ====================
    if (dataType === 'bars') {
      const data = await retryWithBackoff(async () => {
        console.log('[BARS] Fetching historical stock bars');
        const baseUrl = 'https://data.alpaca.markets';
        
        // Ensure timezone-aware dates (following Python pattern)
        const endDate = end ? ensureUTCDate(end) : new Date();
        const daysToGoBack = 45; // Account for weekends/holidays
        const startDate = start ? ensureUTCDate(start) : new Date(endDate.getTime() - daysToGoBack * 24 * 60 * 60 * 1000);
        
        const tf = timeframe || '1Min';
        
        console.log('[BARS] Symbol:', symbol);
        console.log('[BARS] Start (UTC):', startDate.toISOString());
        console.log('[BARS] End (UTC):', endDate.toISOString());
        console.log('[BARS] Timeframe:', tf);
        console.log('[BARS] API Key ID:', alpacaKey.api_key?.substring(0, 8) + '...');
        console.log('[BARS] Account mode:', alpacaKey.mode);
        
        // Use 'all' adjustment for corporate actions (splits, dividends)
        const url = `${baseUrl}/v2/stocks/${symbol}/bars?start=${startDate.toISOString()}&end=${endDate.toISOString()}&timeframe=${tf}&limit=10000&feed=iex&adjustment=all`;
        console.log('[BARS] Request URL:', url);
        
        const response = await fetch(url, {
          headers: {
            'APCA-API-KEY-ID': alpacaKey.api_key,
            'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
          },
        });

        console.log('[BARS] Response status:', response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[BARS] Error response:', errorText);
          
          if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication failed. Please verify your Alpaca API keys in Settings.');
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait before trying again.');
          } else if (response.status === 422) {
            throw new Error('Invalid parameters. Check symbol and date range.');
          }
          
          throw new Error(`Alpaca API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const barCount = data.bars?.[symbol]?.length || 0;
        console.log('[BARS] Received', barCount, 'bars');
        
        if (barCount === 0) {
          console.warn('[BARS] No bars returned. Possible reasons:');
          console.warn('  - Markets closed or no trading activity');
          console.warn('  - Date range outside trading hours');
          console.warn('  - Invalid symbol');
          console.warn('  - IEX feed limitations (paper accounts)');
        } else {
          const firstBar = data.bars[symbol][0];
          const lastBar = data.bars[symbol][barCount - 1];
          console.log('[BARS] First bar:', firstBar.t);
          console.log('[BARS] Last bar:', lastBar.t);
          console.log('[BARS] Price range: $', firstBar.c, 'to $', lastBar.c);
        }
        
        return data;
      }, 'Fetch Stock Historical Bars');
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== ACCOUNT DATA ====================
    if (dataType === 'account') {
      const data = await retryWithBackoff(async () => {
        console.log('[ACCOUNT] Fetching account data');
        const baseUrl = alpacaKey.mode === 'paper' 
          ? 'https://paper-api.alpaca.markets' 
          : 'https://api.alpaca.markets';
        
        console.log('[ACCOUNT] Base URL:', baseUrl);
        
        // Fetch account info
        const accountResponse = await fetch(`${baseUrl}/v2/account`, {
          headers: {
            'APCA-API-KEY-ID': alpacaKey.api_key,
            'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
          },
        });

        if (!accountResponse.ok) {
          const errorText = await accountResponse.text();
          console.error('[ACCOUNT] Error:', errorText);
          throw new Error(`Alpaca API error: ${accountResponse.status} - ${errorText}`);
        }

        const accountData = await accountResponse.json();
        console.log('[ACCOUNT] Account fetched - Status:', accountData.status);
        
        // Fetch positions
        const positionsResponse = await fetch(`${baseUrl}/v2/positions`, {
          headers: {
            'APCA-API-KEY-ID': alpacaKey.api_key,
            'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
          },
        });
        
        const positions = positionsResponse.ok ? await positionsResponse.json() : [];
        console.log('[ACCOUNT] Positions fetched:', positions.length);
        
        return {
          account: accountData,
          positions: positions
        };
      }, 'Fetch Account Data');
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== ORDER HISTORY ====================
    if (dataType === 'orders') {
      const data = await retryWithBackoff(async () => {
        console.log('[ORDERS] Fetching order history');
        const baseUrl = alpacaKey.mode === 'paper' 
          ? 'https://paper-api.alpaca.markets' 
          : 'https://api.alpaca.markets';
        
        const after = new Date();
        after.setDate(after.getDate() - 30); // Last 30 days
        
        console.log('[ORDERS] Date range: Last 30 days');
        console.log('[ORDERS] After:', after.toISOString());
        
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
          const errorText = await response.text();
          console.error('[ORDERS] Error:', errorText);
          throw new Error(`Alpaca API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        console.log('[ORDERS] Success - fetched', data.length, 'orders');
        
        return data;
      }, 'Fetch Order History');
      
      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Invalid dataType: ${dataType}`);

  } catch (error) {
    console.error('[ERROR] fetch-market-data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
