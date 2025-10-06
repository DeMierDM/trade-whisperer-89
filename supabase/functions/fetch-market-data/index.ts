import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateSimulatedOptionsChain, generateSimulatedOptionBars } from './helpers.ts';

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
    // Following Alpaca's official SDK pattern for options chain retrieval
    if (dataType === 'options') {
      const { expirationDate, strikePrice } = requestBody;
      
      const data = await retryWithBackoff(async () => {
        console.log('[OPTIONS CHAIN] Fetching options contracts');
        console.log('[OPTIONS CHAIN] Symbol:', symbol);
        console.log('[OPTIONS CHAIN] Expiration filter:', expirationDate || 'all');
        console.log('[OPTIONS CHAIN] Strike filter:', strikePrice || 'all');
        console.log('[OPTIONS CHAIN] API Key ID:', alpacaKey.api_key?.substring(0, 8) + '...');
        console.log('[OPTIONS CHAIN] Account mode:', alpacaKey.mode);
        
        const baseUrl = 'https://data.alpaca.markets';
        const params = new URLSearchParams({
          underlying_symbols: symbol,
          status: 'active',
          limit: '1000'
        });
        
        // Add optional filters (matching Python's OptionChainRequest)
        if (expirationDate) {
          params.append('expiration_date', expirationDate);
        }
        if (strikePrice !== undefined && strikePrice !== null) {
          params.append('strike_price', strikePrice.toString());
        }
        
        const url = `${baseUrl}/v1beta1/options/contracts?${params.toString()}`;
        console.log('[OPTIONS CHAIN] Request URL:', url);
        
        const response = await fetch(url, {
          headers: {
            'APCA-API-KEY-ID': alpacaKey.api_key,
            'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
          },
        });

        console.log('[OPTIONS CHAIN] Response status:', response.status, response.statusText);

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[OPTIONS CHAIN] Error response:', errorText);
          
          // Paper accounts have limited options data access
          if (response.status === 404) {
            console.warn('[OPTIONS CHAIN] Paper account limitation detected');
            console.warn('[OPTIONS CHAIN] Returning simulated options chain based on stock data');
            
            // Fetch underlying stock price to generate simulated chain
            const quoteResponse = await fetch(`${baseUrl}/v2/stocks/${symbol}/quotes/latest`, {
              headers: {
                'APCA-API-KEY-ID': alpacaKey.api_key,
                'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
              },
            });
            
            if (quoteResponse.ok) {
              const quoteData = await quoteResponse.json();
              const stockPrice = quoteData.quote?.ap || quoteData.quote?.bp || 100;
              
              // Generate simulated options chain
              const simulated = generateSimulatedOptionsChain(symbol, stockPrice, expirationDate);
              console.log('[OPTIONS CHAIN] Generated', simulated.length, 'simulated contracts');
              return simulated;
            }
            
            throw new Error('Options data not available on paper account. Upgrade to live account for real options data, or stock-based simulation unavailable.');
          } else if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication failed. Please verify your Alpaca API keys in Settings.');
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait before trying again.');
          }
          
          throw new Error(`Alpaca options API error: ${response.status} - ${errorText}`);
        }

        const json = await response.json();
        console.log('[OPTIONS CHAIN] Response structure:', Object.keys(json));
        
        const contracts = json.option_contracts || json.contracts || json.data?.contracts || [];
        console.log('[OPTIONS CHAIN] Found', contracts.length, 'real contracts');
        
        // Map Alpaca contract fields to consistent format (following Python SDK pattern)
        const mapped = contracts.map((c: any) => ({
          symbol: c.symbol || c.ticker,
          underlying_symbol: c.underlying_symbol || symbol,
          expiration_date: c.expiration_date,
          strike_price: parseFloat(c.strike_price || c.strike || 0),
          option_type: (c.type || c.option_type || '').toLowerCase(),
          contract_type: (c.type || c.contract_type || '').toLowerCase().includes('p') ? 'put' : 'call',
          exercise_style: (c.style || c.exercise_style || 'american').toLowerCase(),
          shares_per_contract: parseInt(c.size || c.shares_per_contract || '100'),
          primary_exchange: c.exchange || c.primary_exchange || 'OPRA',
          open_interest: parseInt(c.open_interest || '0'),
          close_price: parseFloat(c.close_price || '0'),
          tradable: c.tradable !== false,
        }));

        console.log('[OPTIONS CHAIN] Successfully mapped', mapped.length, 'contracts');
        return mapped;
      }, 'Fetch Options Chain');

      return new Response(
        JSON.stringify({ data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== HISTORICAL OPTIONS BARS ====================
    // Following Alpaca's OptionBarsRequest pattern (matching Python SDK)
    if (dataType === 'historical-options') {
      const { contract, timeframe: tf = '1Day', from, to } = requestBody;
      if (!contract) throw new Error('Contract symbol required for historical options data');

      const data = await retryWithBackoff(async () => {
        console.log('[OPTIONS BARS] Fetching historical option bars');
        console.log('[OPTIONS BARS] Contract:', contract);
        console.log('[OPTIONS BARS] Timeframe:', tf);
        console.log('[OPTIONS BARS] Raw dates:', from, 'to', to);
        
        // Ensure UTC timezone (following Python's timezone-aware datetime pattern)
        const startDate = ensureUTCDate(from);
        const endDate = ensureUTCDate(to);
        
        console.log('[OPTIONS BARS] UTC dates:', startDate.toISOString(), 'to', endDate.toISOString());

        const baseUrl = 'https://data.alpaca.markets';
        // Use proper options bars endpoint format
        const params = new URLSearchParams({
          symbols: contract,
          timeframe: tf,
          start: startDate.toISOString(),
          end: endDate.toISOString(),
          limit: '10000',
          feed: 'indicative' // Use indicative feed for options
        });
        
        const url = `${baseUrl}/v1beta1/options/bars?${params.toString()}`;
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
          
          // Paper account limitation
          if (response.status === 404) {
            console.warn('[OPTIONS BARS] Paper account - options bars not available');
            console.warn('[OPTIONS BARS] Falling back to simulated data based on underlying');
            
            // Extract underlying symbol from option contract
            const underlying = contract.match(/^[A-Z]+/)?.[0] || symbol;
            console.log('[OPTIONS BARS] Extracted underlying:', underlying);
            
            // Fetch stock bars as fallback
            const stockUrl = `${baseUrl}/v2/stocks/${underlying}/bars?start=${startDate.toISOString()}&end=${endDate.toISOString()}&timeframe=${tf}&limit=10000&feed=iex`;
            const stockResponse = await fetch(stockUrl, {
              headers: {
                'APCA-API-KEY-ID': alpacaKey.api_key,
                'APCA-API-SECRET-KEY': alpacaKey.api_secret || '',
              },
            });
            
            if (stockResponse.ok) {
              const stockData = await stockResponse.json();
              const stockBars = stockData.bars?.[underlying] || [];
              
              // Generate simulated option bars from stock data
              const simulatedBars = generateSimulatedOptionBars(contract, stockBars);
              console.log('[OPTIONS BARS] Generated', simulatedBars.length, 'simulated bars');
              
              return {
                bars: { [contract]: simulatedBars },
                next_page_token: null,
                simulated: true
              };
            }
            
            throw new Error('Options historical data not available. Paper accounts require live account upgrade for real options bars.');
          } else if (response.status === 401 || response.status === 403) {
            throw new Error('Authentication failed. Please verify your API keys.');
          } else if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait before retrying.');
          }
          
          throw new Error(`Alpaca options bars error: ${response.status} - ${errorText}`);
        }
        
        const responseData = await response.json();
        const bars = responseData.bars || {};
        const barCount = bars[contract]?.length || 0;
        console.log('[OPTIONS BARS] Success - received', barCount, 'bars');
        
        if (barCount > 0) {
          console.log('[OPTIONS BARS] First bar:', bars[contract][0].t);
          console.log('[OPTIONS BARS] Last bar:', bars[contract][barCount - 1].t);
        }
        
        return responseData;
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
