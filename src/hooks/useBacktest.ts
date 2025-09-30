import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BacktestConfig {
  strategy: string;
  symbol: string;
  startDate: string;
  endDate: string;
  timeframe: string;
  initialCapital: number;
  commissionPerContract: number;
  slippagePct: number;
}

export interface BacktestResults {
  id: string;
  totalReturn: number;
  sharpeRatio: number;
  maxDrawdown: number;
  winRate: number;
  totalTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

export const useBacktest = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BacktestResults | null>(null);
  const { toast } = useToast();

  const runBacktest = async (config: BacktestConfig) => {
    setLoading(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('options-backtester', {
        body: config,
      });

      if (error) throw error;

      if (data.success) {
        // Fetch full results
        const { data: backtestRun, error: fetchError } = await supabase
          .from('backtest_runs')
          .select('*')
          .eq('id', data.backtestId)
          .single();

        if (fetchError) throw fetchError;

        setResults({
          id: backtestRun.id,
          totalReturn: backtestRun.total_return_pct,
          sharpeRatio: backtestRun.sharpe_ratio,
          maxDrawdown: backtestRun.max_drawdown_pct,
          winRate: backtestRun.win_rate_pct,
          totalTrades: backtestRun.total_trades,
          avgWin: backtestRun.avg_win,
          avgLoss: backtestRun.avg_loss,
          profitFactor: backtestRun.profit_factor,
        });

        toast({
          title: 'Backtest Complete',
          description: `Total Return: ${backtestRun.total_return_pct.toFixed(2)}%`,
        });
      }
    } catch (error: any) {
      console.error('Backtest error:', error);
      toast({
        title: 'Backtest Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTrades = async (backtestId: string) => {
    const { data, error } = await supabase
      .from('backtest_trades')
      .select('*')
      .eq('backtest_run_id', backtestId)
      .order('entry_time', { ascending: false });

    if (error) {
      console.error('Error fetching trades:', error);
      return [];
    }

    return data;
  };

  return {
    loading,
    results,
    runBacktest,
    fetchTrades,
  };
};
