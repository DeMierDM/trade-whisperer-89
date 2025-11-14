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

export interface BacktestMetrics {
  id: number;
  strategy_name: string;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  final_capital: number;
  total_return: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  max_drawdown_duration_minutes: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  avg_win: number;
  avg_loss: number;
  largest_win: number;
  largest_loss: number;
  avg_holding_period_minutes: number;
  status: string;
}

export interface Trade {
  id: number;
  contract_symbol: string;
  option_type: string;
  strike_price: number;
  entry_timestamp: string;
  exit_timestamp: string;
  entry_price: number;
  exit_price: number;
  quantity: number;
  net_pnl: number;
  return_pct: number;
  entry_delta: number;
  exit_delta: number;
  entry_underlying_price: number;
  exit_underlying_price: number;
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
  const [metrics, setMetrics] = useState<BacktestMetrics | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const { toast } = useToast();

  const runBacktest = async (config: BacktestConfig) => {
    setLoading(true);
    setResults(null);
    setProgress(0);
    setStatusMessage('Initiating backtest...');

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

      setProgress(10);
      setStatusMessage('Backtest started, processing trades...');

      // Poll for completion (max 20 attempts, 3 seconds each = 60 seconds total)
      const maxAttempts = 20;
      const pollInterval = 3000; // 3 seconds
      let attempts = 0;
      let backtestRun = null;

      while (attempts < maxAttempts) {
        attempts++;
        
        // Update progress based on polling attempts (10% to 80%)
        const pollProgress = 10 + ((attempts / maxAttempts) * 70);
        setProgress(pollProgress);
        setStatusMessage(`Running backtest... (${attempts}/${maxAttempts})`);
        
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
          setProgress(85);
          setStatusMessage('Backtest complete! Loading results...');
          break;
        } else if (backtestRun.status === 'failed') {
          throw new Error(backtestRun.error_message || 'Backtest failed');
        }
      }

      if (!backtestRun || backtestRun.status !== 'completed') {
        throw new Error('Backtest did not complete within 60 seconds');
      }

      console.log('Backtest run data:', backtestRun);

      // Store full metrics
      setMetrics(backtestRun);
      setProgress(90);
      setStatusMessage('Processing results...');

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

      // Automatically fetch trades after backtest completes
      setProgress(95);
      setStatusMessage('Fetching trade history...');
      await fetchTrades(backtestRun.id);

      setProgress(100);
      setStatusMessage('Complete!');

      toast({
        title: 'Backtest Complete',
        description: `Total Return: ${totalReturn.toFixed(2)}% | ${backtestRun.total_trades} trades`,
      });
    } catch (error: any) {
      console.error('Backtest error:', error);
      setProgress(0);
      setStatusMessage('');
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
      setTrades(data || []);
      return data || [];
    } catch (error: any) {
      console.error('Error in fetchTrades:', error);
      setTrades([]);
      return [];
    }
  };

  const fetchBacktestById = async (backtestId: string) => {
    try {
      console.log('Fetching backtest metrics for ID:', backtestId);

      const response = await fetch(`${ENDPOINTS.BACKTEST}/status/${backtestId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const backtestRun = await response.json();

      console.log('Loaded backtest metrics:', backtestRun);

      // Store full metrics
      setMetrics(backtestRun);

      // Map backend fields to frontend format
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

      return backtestRun;
    } catch (error: any) {
      console.error('Error in fetchBacktestById:', error);
      throw error;
    }
  };

  return {
    loading,
    results,
    metrics,
    trades,
    progress,
    statusMessage,
    runBacktest,
    fetchTrades,
    fetchBacktestById,
  };
};
