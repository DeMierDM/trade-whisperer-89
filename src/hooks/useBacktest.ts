import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ENDPOINTS } from '@/lib/apiConfig';

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

      const response = await fetch(`${ENDPOINTS.BACKTEST}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Backtest response:', data);

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.success) {
        throw new Error(data.message || 'Backtest failed');
      }

      if (!data.backtestId) {
        throw new Error('No backtest ID returned');
      }

      console.log(`✅ Backtest initiated with ID: ${data.backtestId}`);
      console.log(`⏱️  Estimated completion: ${data.estimatedSeconds || 30}s`);

      // Poll for completion (max 20 attempts, 3 seconds each = 60 seconds total)
      const maxAttempts = 20;
      const pollInterval = 3000; // 3 seconds
      let attempts = 0;
      let backtestRun = null;

      while (attempts < maxAttempts) {
        attempts++;
        console.log(`[Polling ${attempts}/${maxAttempts}] Checking backtest status...`);

        await new Promise(resolve => setTimeout(resolve, pollInterval));

        const statusResponse = await fetch(`${ENDPOINTS.BACKTEST}/status/${data.backtestId}`);

        if (!statusResponse.ok) {
          console.warn(`Status check failed: ${statusResponse.status}`);
          continue;
        }

        backtestRun = await statusResponse.json();

        console.log(`  Status: ${backtestRun.status}, Trades: ${backtestRun.total_trades ?? 0}`);

        if (backtestRun.status === 'completed') {
          console.log('✅ Backtest completed successfully!');
          break;
        } else if (backtestRun.status === 'failed') {
          throw new Error(backtestRun.error_message || 'Backtest failed');
        }
      }

      if (!backtestRun || backtestRun.status !== 'completed') {
        throw new Error('Backtest did not complete within 60 seconds');
      }

      console.log('Backtest run data:', backtestRun);

      // Map backend fields (snake_case decimals) to frontend format (camelCase percentages)
      const totalReturn = parseFloat(backtestRun.total_return ?? '0') * 100;
      const sharpeRatio = parseFloat(backtestRun.sharpe_ratio ?? '0');
      const maxDrawdown = parseFloat(backtestRun.max_drawdown ?? '0') * 100;
      const winRate = parseFloat(backtestRun.win_rate ?? '0') * 100;

      setResults({
        id: backtestRun.id,
        totalReturn,
        sharpeRatio,
        maxDrawdown,
        winRate,
        totalTrades: backtestRun.total_trades ?? 0,
        avgWin: parseFloat(backtestRun.avg_win ?? '0'),
        avgLoss: parseFloat(backtestRun.avg_loss ?? '0'),
        profitFactor: parseFloat(backtestRun.profit_factor ?? '0'),
      });

      toast({
        title: 'Backtest Complete',
        description: `Total Return: ${totalReturn.toFixed(2)}%`,
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

      const response = await fetch(`${ENDPOINTS.BACKTEST}/${backtestId}/trades`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

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
