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

    const polygonKey = apiKeys?.find(k => k.provider === 'polygon')?.api_key;
    const alpacaKey = apiKeys?.find(k => k.provider === 'alpaca')?.api_key;
    const alpacaSecret = apiKeys?.find(k => k.provider === 'alpaca')?.api_secret;

    if (!polygonKey || !alpacaKey || !alpacaSecret) {
      throw new Error('Missing API keys');
    }

    // Fetch historical underlying data from Alpaca Data API
    // Note: Use data.alpaca.markets for historical data, not trading API
    const alpacaDataUrl = 'https://data.alpaca.markets';
    
    // Format dates as RFC3339 for Alpaca API
    const startDateTime = `${config.startDate}T09:30:00Z`;
    const endDateTime = `${config.endDate}T16:00:00Z`;
    
    console.log(`Fetching bars for ${config.symbol} from ${startDateTime} to ${endDateTime}`);
    
    const underlyingResponse = await fetch(
      `${alpacaDataUrl}/v2/stocks/${config.symbol}/bars?timeframe=${config.timeframe}&start=${startDateTime}&end=${endDateTime}&limit=10000`,
      {
        headers: {
          'APCA-API-KEY-ID': alpacaKey,
          'APCA-API-SECRET-KEY': alpacaSecret,
        },
      }
    );

    if (!underlyingResponse.ok) {
      const errorText = await underlyingResponse.text();
      console.error('Alpaca API error:', errorText);
      throw new Error(`Failed to fetch underlying data: ${underlyingResponse.status} - ${errorText}`);
    }

    const underlyingData = await underlyingResponse.json();
    
    if (!underlyingData.bars || !underlyingData.bars[config.symbol]) {
      console.error('No bars returned:', underlyingData);
      throw new Error(`No bar data available for ${config.symbol}`);
    }
    
    const bars = underlyingData.bars[config.symbol];
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

function executeStrategy(strategy: string, bar: any, params: any, index: number, bars: any[]): 'BUY' | 'SELL' | 'HOLD' {
  // Simplified strategy logic - implement full strategies later
  if (strategy === 'HAVWAP-Rev-v2') {
    // Mean reversion based on VWAP
    if (index < 21) return 'HOLD';
    const ema = calculateEMA(bars.slice(Math.max(0, index - 21), index), params?.ema_length || 21);
    const deviation = ((bar.c - ema) / ema) * 100;
    
    if (deviation < -(params?.entry_deviation_pct || 0.18)) return 'BUY';
    if (deviation > (params?.near_deviation_pct || 0.06)) return 'SELL';
  } else if (strategy === 'Delta-Bucket-Trend') {
    // Simple trend following
    if (index < 10) return 'HOLD';
    const sma10 = bars.slice(index - 10, index).reduce((sum: number, b: any) => sum + b.c, 0) / 10;
    if (bar.c > sma10 * 1.02) return 'BUY';
    if (bar.c < sma10 * 0.98) return 'SELL';
  } else if (strategy === 'ATM-Scalp-v1') {
    // Scalping based on momentum
    if (index < 5) return 'HOLD';
    const momentum = bar.c - bars[index - 5].c;
    if (momentum > 0) return 'BUY';
    if (momentum < 0) return 'SELL';
  }
  
  return 'HOLD';
}

function calculateEMA(bars: any[], period: number): number {
  if (bars.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let ema = bars[0].c;
  for (let i = 1; i < bars.length; i++) {
    ema = (bars[i].c - ema) * multiplier + ema;
  }
  return ema;
}
