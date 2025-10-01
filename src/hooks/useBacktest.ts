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
      console.log('Starting backtest with config:', config);
      
      const { data, error } = await supabase.functions.invoke('options-backtester', {
        body: config,
      });

      console.log('Backtest response:', data);
      console.log('Backtest error:', error);

      if (error) {
        console.error('Backtest invocation error:', error);
        throw error;
      }

      if (!data) {
        throw new Error('No response data from backtest');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.success) {
        throw new Error(data.message || 'Backtest failed');
      }

      if (!data.backtestId) {
        throw new Error('No backtest ID returned');
      }

      // Fetch full results
      console.log('Fetching backtest results for ID:', data.backtestId);
      const { data: backtestRun, error: fetchError } = await supabase
        .from('backtest_runs')
        .select('*')
        .eq('id', data.backtestId)
        .maybeSingle();

      if (fetchError) {
        console.error('Error fetching backtest run:', fetchError);
        throw fetchError;
      }

      if (!backtestRun) {
        throw new Error('Backtest run not found in database');
      }

      console.log('Backtest run data:', backtestRun);

      setResults({
        id: backtestRun.id,
        totalReturn: backtestRun.total_return_pct ?? 0,
        sharpeRatio: backtestRun.sharpe_ratio ?? 0,
        maxDrawdown: backtestRun.max_drawdown_pct ?? 0,
        winRate: backtestRun.win_rate_pct ?? 0,
        totalTrades: backtestRun.total_trades ?? 0,
        avgWin: backtestRun.avg_win ?? 0,
        avgLoss: backtestRun.avg_loss ?? 0,
        profitFactor: backtestRun.profit_factor ?? 0,
      });

      toast({
        title: 'Backtest Complete',
        description: `Total Return: ${(backtestRun.total_return_pct ?? 0).toFixed(2)}%`,
      });
    } catch (error: any) {
      console.error('Backtest error:', error);
      toast({
        title: 'Backtest Failed',
        description: error.message || 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchTrades = async (backtestId: string) => {
    try {
      console.log('Fetching trades for backtest ID:', backtestId);
      
      const { data, error } = await supabase
        .from('backtest_trades')
        .select('*')
        .eq('backtest_run_id', backtestId)
        .order('entry_time', { ascending: false });

      if (error) {
        console.error('Error fetching trades:', error);
        throw error;
      }

      console.log(`Fetched ${data?.length || 0} trades`);
      return data || [];
    } catch (error: any) {
      console.error('Error in fetchTrades:', error);
      return [];
    }
  };

  return {
    loading,
    results,
    runBacktest,
    fetchTrades,
  };
};
