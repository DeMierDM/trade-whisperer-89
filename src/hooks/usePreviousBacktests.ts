import { useState, useEffect } from 'react';
import { ENDPOINTS } from '@/lib/apiConfig';

interface PreviousBacktest {
  id: number;
  strategy_name: string;
  symbol: string;
  start_date: string;
  end_date: string;
  status: string;
  total_trades: number;
  total_return: string;
  win_rate: string;
  created_at: string;
  completed_at: string | null;
}

export function usePreviousBacktests() {
  const [backtests, setBacktests] = useState<PreviousBacktest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPreviousBacktests = async (limit: number = 20) => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('[usePreviousBacktests] Fetching list...');
      const response = await fetch(`${ENDPOINTS.BACKTEST}/recent?limit=${limit}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch backtests: ${response.status}`);
      }
      
      const data = await response.json();
      console.log(`[usePreviousBacktests] Loaded ${data.length} backtests`);
      setBacktests(data);
    } catch (err: any) {
      console.error('[usePreviousBacktests] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPreviousBacktests(20);
  }, []);

  return {
    backtests,
    loading,
    error,
    refresh: fetchPreviousBacktests,
  };
}
