import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OptimizerConfig {
  strategy: string;
  objective: string;
  startDate: string;
  endDate: string;
  walkForwardFolds: number;
  trialBudget: number;
  sampler: string;
  pruner: string;
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

    const config: OptimizerConfig = await req.json();
    console.log('Starting optimization:', config);

    // Parameter ranges for optimization
    const paramRanges: Record<string, any> = {
      'HAVWAP-Rev-v2': {
        ema_length: [10, 50],
        entry_deviation_pct: [0.1, 0.5],
        near_deviation_pct: [0.03, 0.15],
        min_slope: [0.0001, 0.001],
        rv_cap_bps: [20, 100],
        time_stop_bars: [60, 240],
      },
      'Delta-Bucket-Trend': {
        lookback_period: [5, 30],
        threshold_pct: [0.5, 3.0],
        stop_loss_pct: [1, 5],
      },
      'ATM-Scalp-v1': {
        momentum_period: [3, 15],
        entry_threshold: [0.1, 1.0],
        profit_target_pct: [1, 5],
      },
    };

    const ranges = paramRanges[config.strategy];
    const trials = [];
    let bestSharpe = -Infinity;
    let bestParams = null;

    // Simple grid search (simplified Optuna-like approach)
    for (let trial = 0; trial < config.trialBudget; trial++) {
      // Generate random parameters
      const params: Record<string, number> = {};
      for (const [key, range] of Object.entries(ranges)) {
        const rangeArray = range as number[];
        if (typeof rangeArray[0] === 'number') {
          params[key] = rangeArray[0] + Math.random() * (rangeArray[1] - rangeArray[0]);
        }
      }

      // Save parameters to database
      const { data: paramRecord } = await supabase
        .from('strategy_parameters')
        .insert({
          user_id: user.id,
          strategy_name: config.strategy,
          parameters: params,
          is_default: false,
        })
        .select()
        .single();

      // Run backtest with these parameters via edge function
      const backtestResponse = await fetch(
        `${supabaseUrl}/functions/v1/options-backtester`,
        {
          method: 'POST',
          headers: {
            'Authorization': req.headers.get('Authorization')!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            strategy: config.strategy,
            symbol: 'SPY',
            startDate: config.startDate,
            endDate: config.endDate,
            timeframe: '1Min',
            initialCapital: 100000,
            commissionPerContract: 0.65,
            slippagePct: 50,
          }),
        }
      );

      const backtestResult = await backtestResponse.json();
      
      if (backtestResult.success) {
        const metrics = backtestResult.metrics;
        let score = 0;

        // Calculate objective score
        if (config.objective === 'sharpe') {
          score = metrics.sharpeRatio;
        } else if (config.objective === 'return') {
          score = metrics.totalReturn;
        } else if (config.objective === 'calmar') {
          score = metrics.totalReturn / (metrics.maxDrawdown || 1);
        }

        trials.push({
          trial_number: trial + 1,
          parameters: params,
          score,
          metrics,
        });

        if (score > bestSharpe) {
          bestSharpe = score;
          bestParams = params;
        }

        console.log(`Trial ${trial + 1}: Score=${score.toFixed(4)}, Params=`, params);
      }

      // Yield to avoid timeout
      if (trial % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Save best parameters as default
    if (bestParams) {
      await supabase
        .from('strategy_parameters')
        .update({ is_default: false })
        .eq('user_id', user.id)
        .eq('strategy_name', config.strategy);

      await supabase
        .from('strategy_parameters')
        .insert({
          user_id: user.id,
          strategy_name: config.strategy,
          parameters: bestParams,
          is_default: true,
        });
    }

    return new Response(
      JSON.stringify({
        success: true,
        bestScore: bestSharpe,
        bestParams,
        totalTrials: trials.length,
        trials: trials.slice(-10), // Return last 10 trials
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Optimization error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
