import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BacktestConfig {
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  timeframe: string;
  initialCapital: number;
  commissionPerContract: number;
  slippagePct: number;
}

interface OptionsData {
  timestamp: string;
  strike: number;
  call_bid: number;
  call_ask: number;
  put_bid: number;
  put_ask: number;
  underlying_price: number;
  volume: number;
  open_interest: number;
}

interface Trade {
  entry_time: string;
  exit_time: string;
  symbol: string;
  side: string;
  quantity: number;
  entry_price: number;
  exit_price: number;
  pnl: number;
  return_pct: number;
  commission: number;
  slippage: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const config: BacktestConfig = await req.json();
    console.log('Starting backtest:', config);

    // Create backtest run record
    const { data: backtestRun, error: insertError } = await supabase
      .from('backtest_runs')
      .insert({
        user_id: user.id,
        strategy_name: config.strategy,
        symbol: config.symbol,
        start_date: config.startDate,
        end_date: config.endDate,
        timeframe: config.timeframe,
        initial_capital: config.initialCapital,
        commission_per_contract: config.commissionPerContract,
        slippage_pct: config.slippagePct,
        status: 'running',
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // Fetch API keys
    const { data: apiKeys } = await supabase
      .from('api_keys')
      .select('provider, api_key, api_secret')
      .eq('user_id', user.id);

    const alpacaKey = apiKeys?.find(k => k.provider === 'alpaca')?.api_key;
    const alpacaSecret = apiKeys?.find(k => k.provider === 'alpaca')?.api_secret;

    if (!alpacaKey || !alpacaSecret) {
      throw new Error('Missing Alpaca API keys');
    }

    // Fetch historical underlying data with retry logic
    const bars = await fetchHistoricalDataWithRetry(
      config.symbol,
      config.startDate,
      config.endDate,
      config.timeframe,
      alpacaKey,
      alpacaSecret
    );
    
    console.log(`Fetched ${bars.length} bars for ${config.symbol}`);

    // Fetch strategy parameters
    const { data: strategyParams } = await supabase
      .from('strategy_defaults')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // Run backtest simulation
    const trades: Trade[] = [];
    let equity = config.initialCapital;
    let peakEquity = equity;
    let maxDrawdown = 0;
    let position: any = null;

    for (let i = 0; i < bars.length; i++) {
      const bar = bars[i];
      const price = bar.c;
      const timestamp = bar.t;

      // Strategy logic based on selected strategy
      const signal = executeStrategy(config.strategy, bar, strategyParams, i, bars);

      if (signal === 'BUY' && !position) {
        // Entry logic - find ATM option
        const strike = Math.round(price);
        const optionSymbol = `${config.symbol} ${strike}C`;
        
        // Simulate option price (using simplified model)
        const entryPrice = price * 0.03; // ~3% of underlying
        const slippage = (entryPrice * config.slippagePct / 100) / 2;
        const effectiveEntry = entryPrice + slippage;
        const quantity = Math.floor(equity * 0.1 / (effectiveEntry * 100)); // 10% of capital

        if (quantity > 0) {
          position = {
            symbol: optionSymbol,
            entry_time: timestamp,
            entry_price: effectiveEntry,
            quantity,
            side: 'LONG',
          };
        }
      } else if (signal === 'SELL' && position) {
        // Exit logic
        const exitPrice = price * 0.035; // Simulated exit
        const slippage = (exitPrice * config.slippagePct / 100) / 2;
        const effectiveExit = exitPrice - slippage;
        
        const pnl = (effectiveExit - position.entry_price) * position.quantity * 100 - 
                    (config.commissionPerContract * 2 * position.quantity);
        const returnPct = (pnl / (position.entry_price * position.quantity * 100)) * 100;

        trades.push({
          entry_time: position.entry_time,
          exit_time: timestamp,
          symbol: position.symbol,
          side: position.side,
          quantity: position.quantity,
          entry_price: position.entry_price,
          exit_price: effectiveExit,
          pnl,
          return_pct: returnPct,
          commission: config.commissionPerContract * 2 * position.quantity,
          slippage: slippage * position.quantity * 100,
        });

        equity += pnl;
        if (equity > peakEquity) {
          peakEquity = equity;
        }
        const drawdown = ((peakEquity - equity) / peakEquity) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }

        position = null;
      }
    }

    // Calculate metrics
    const totalReturn = ((equity - config.initialCapital) / config.initialCapital) * 100;
    const winningTrades = trades.filter(t => t.pnl > 0);
    const losingTrades = trades.filter(t => t.pnl < 0);
    const winRate = (winningTrades.length / trades.length) * 100;
    const avgWin = winningTrades.reduce((sum, t) => sum + t.pnl, 0) / (winningTrades.length || 1);
    const avgLoss = Math.abs(losingTrades.reduce((sum, t) => sum + t.pnl, 0) / (losingTrades.length || 1));
    const profitFactor = avgWin / (avgLoss || 1);
    
    // Calculate Sharpe ratio (simplified)
    const returns = trades.map(t => t.return_pct);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / (returns.length || 1);
    const stdDev = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length || 1));
    const sharpeRatio = (avgReturn / (stdDev || 1)) * Math.sqrt(252);

    // Update backtest run
    await supabase
      .from('backtest_runs')
      .update({
        status: 'completed',
        total_return_pct: totalReturn,
        sharpe_ratio: sharpeRatio,
        max_drawdown_pct: maxDrawdown,
        win_rate_pct: winRate,
        total_trades: trades.length,
        avg_win: avgWin,
        avg_loss: avgLoss,
        profit_factor: profitFactor,
        final_equity: equity,
        completed_at: new Date().toISOString(),
      })
      .eq('id', backtestRun.id);

    // Insert trades
    if (trades.length > 0) {
      await supabase.from('backtest_trades').insert(
        trades.map(t => ({
          backtest_run_id: backtestRun.id,
          ...t,
        }))
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        backtestId: backtestRun.id,
        metrics: {
          totalReturn,
          sharpeRatio,
          maxDrawdown,
          winRate,
          totalTrades: trades.length,
          avgWin,
          avgLoss,
          profitFactor,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Backtest error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to fetch historical data with retry logic
async function fetchHistoricalDataWithRetry(
  symbol: string,
  startDate: string,
  endDate: string,
  timeframe: string,
  apiKey: string,
  apiSecret: string,
  maxRetries = 3
): Promise<any[]> {
  const alpacaDataUrl = 'https://data.alpaca.markets';
  const startDateTime = `${startDate}T09:30:00Z`;
  const endDateTime = `${endDate}T16:00:00Z`;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`Fetching bars for ${symbol} (attempt ${attempt + 1}/${maxRetries})`);
      
      const response = await fetch(
        `${alpacaDataUrl}/v2/stocks/${symbol}/bars?timeframe=${timeframe}&start=${startDateTime}&end=${endDateTime}&limit=10000&adjustment=all`,
        {
          headers: {
            'APCA-API-KEY-ID': apiKey,
            'APCA-API-SECRET-KEY': apiSecret,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        
        // Don't retry on auth errors
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Authentication failed: ${errorText}`);
        }
        
        // Retry on rate limits and server errors
        if (response.status === 429 || response.status >= 500) {
          if (attempt < maxRetries - 1) {
            const delay = Math.pow(2, attempt) * 1000;
            console.log(`Rate limited or server error, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        throw new Error(`Failed to fetch data: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.bars || !data.bars[symbol]) {
        throw new Error(`No bar data available for ${symbol}`);
      }
      
      return data.bars[symbol];
      
    } catch (error) {
      if (attempt === maxRetries - 1) {
        throw error;
      }
      console.error(`Attempt ${attempt + 1} failed:`, error);
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
  
  throw new Error('Failed to fetch historical data after all retries');
}

function executeStrategy(strategy: string, bar: any, params: any, index: number, bars: any[]): 'BUY' | 'SELL' | 'HOLD' {
  if (strategy === 'HAVWAP-Rev-v2') {
    // Mean reversion based on EMA with configurable parameters
    const emaLength = params?.ema_length || 21;
    if (index < emaLength) return 'HOLD';
    
    const ema = calculateEMA(bars.slice(Math.max(0, index - emaLength), index), emaLength);
    const deviation = ((bar.c - ema) / ema) * 100;
    
    // Entry on oversold, exit on return to mean
    if (deviation < -(params?.entry_deviation_pct || 0.18)) return 'BUY';
    if (deviation > (params?.near_deviation_pct || 0.06)) return 'SELL';
    
  } else if (strategy === 'Delta-Bucket-Trend') {
    // Trend following with SMA crossover
    const shortPeriod = params?.short_period || 10;
    const longPeriod = params?.long_period || 20;
    
    if (index < longPeriod) return 'HOLD';
    
    const shortSMA = calculateSMA(bars.slice(index - shortPeriod, index));
    const longSMA = calculateSMA(bars.slice(index - longPeriod, index));
    const prevShortSMA = calculateSMA(bars.slice(index - shortPeriod - 1, index - 1));
    const prevLongSMA = calculateSMA(bars.slice(index - longPeriod - 1, index - 1));
    
    // Bullish crossover
    if (shortSMA > longSMA && prevShortSMA <= prevLongSMA) return 'BUY';
    // Bearish crossover
    if (shortSMA < longSMA && prevShortSMA >= prevLongSMA) return 'SELL';
    
  } else if (strategy === 'ATM-Scalp-v1') {
    // Momentum scalping with RSI
    const rsiPeriod = params?.rsi_period || 14;
    if (index < rsiPeriod) return 'HOLD';
    
    const rsi = calculateRSI(bars.slice(index - rsiPeriod, index + 1));
    const momentum = bar.c - bars[index - 5].c;
    
    // Buy on oversold with positive momentum
    if (rsi < 30 && momentum > 0) return 'BUY';
    // Sell on overbought with negative momentum
    if (rsi > 70 && momentum < 0) return 'SELL';
  }
  
  return 'HOLD';
}

// Technical indicator calculations
function calculateEMA(bars: any[], period: number): number {
  if (bars.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let ema = bars[0].c;
  for (let i = 1; i < bars.length; i++) {
    ema = (bars[i].c - ema) * multiplier + ema;
  }
  return ema;
}

function calculateSMA(bars: any[]): number {
  if (bars.length === 0) return 0;
  return bars.reduce((sum: number, bar: any) => sum + bar.c, 0) / bars.length;
}

function calculateRSI(bars: any[], period = 14): number {
  if (bars.length < period + 1) return 50;
  
  let gains = 0;
  let losses = 0;
  
  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = bars[i].c - bars[i - 1].c;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  // Calculate RSI using Wilder's smoothing
  for (let i = period + 1; i < bars.length; i++) {
    const change = bars[i].c - bars[i - 1].c;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}
