import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ApiTest {
  name: string;
  endpoint: string;
  status: 'pending' | 'success' | 'error';
  response?: any;
  error?: string;
  duration?: number;
}

export const useApiDiagnostics = () => {
  const [tests, setTests] = useState<ApiTest[]>([]);
  const [running, setRunning] = useState(false);

  const runDiagnostics = async () => {
    setRunning(true);
    const diagnosticTests: ApiTest[] = [
      {
        name: 'Alpaca Account Data',
        endpoint: 'fetch-market-data (account)',
        status: 'pending',
      },
      {
        name: 'Alpaca Orders History',
        endpoint: 'fetch-market-data (orders)',
        status: 'pending',
      },
      {
        name: 'Alpaca Stock Quote',
        endpoint: 'fetch-market-data (quote)',
        status: 'pending',
      },
      {
        name: 'Alpaca Historical Bars',
        endpoint: 'Alpaca Data API (bars)',
        status: 'pending',
      },
      {
        name: 'Polygon Options Chain',
        endpoint: 'fetch-market-data (options)',
        status: 'pending',
      },
      {
        name: 'Backtest Execution',
        endpoint: 'options-backtester',
        status: 'pending',
      },
    ];

    setTests(diagnosticTests);

    // Test 1: Alpaca Account
    try {
      const start = Date.now();
      const { data, error } = await supabase.functions.invoke('fetch-market-data', {
        body: { dataType: 'account' },
      });
      const duration = Date.now() - start;
      
      diagnosticTests[0] = {
        ...diagnosticTests[0],
        status: error ? 'error' : 'success',
        response: data,
        error: error?.message,
        duration,
      };
    } catch (e: any) {
      diagnosticTests[0] = {
        ...diagnosticTests[0],
        status: 'error',
        error: e.message,
      };
    }
    setTests([...diagnosticTests]);

    // Test 2: Orders History
    try {
      const start = Date.now();
      const { data, error } = await supabase.functions.invoke('fetch-market-data', {
        body: { dataType: 'orders' },
      });
      const duration = Date.now() - start;
      
      diagnosticTests[1] = {
        ...diagnosticTests[1],
        status: error ? 'error' : 'success',
        response: data,
        error: error?.message,
        duration,
      };
    } catch (e: any) {
      diagnosticTests[1] = {
        ...diagnosticTests[1],
        status: 'error',
        error: e.message,
      };
    }
    setTests([...diagnosticTests]);

    // Test 3: Stock Quote
    try {
      const start = Date.now();
      const { data, error } = await supabase.functions.invoke('fetch-market-data', {
        body: { dataType: 'quote', symbol: 'SPY' },
      });
      const duration = Date.now() - start;
      
      diagnosticTests[2] = {
        ...diagnosticTests[2],
        status: error ? 'error' : 'success',
        response: data,
        error: error?.message,
        duration,
      };
    } catch (e: any) {
      diagnosticTests[2] = {
        ...diagnosticTests[2],
        status: 'error',
        error: e.message,
      };
    }
    setTests([...diagnosticTests]);

    // Test 4: Historical Bars (Direct Alpaca Data API test)
    try {
      const start = Date.now();
      const { data, error } = await supabase.functions.invoke('fetch-market-data', {
        body: { 
          dataType: 'bars', 
          symbol: 'SPY',
          start: '2024-01-01',
          end: '2024-01-05',
          timeframe: '1Min'
        },
      });
      const duration = Date.now() - start;
      
      diagnosticTests[3] = {
        ...diagnosticTests[3],
        status: error ? 'error' : 'success',
        response: data,
        error: error?.message,
        duration,
      };
    } catch (e: any) {
      diagnosticTests[3] = {
        ...diagnosticTests[3],
        status: 'error',
        error: e.message,
      };
    }
    setTests([...diagnosticTests]);

    // Test 5: Options Chain
    try {
      const start = Date.now();
      const { data, error } = await supabase.functions.invoke('fetch-market-data', {
        body: { dataType: 'options', symbol: 'SPY' },
      });
      const duration = Date.now() - start;
      
      diagnosticTests[4] = {
        ...diagnosticTests[4],
        status: error ? 'error' : 'success',
        response: data,
        error: error?.message,
        duration,
      };
    } catch (e: any) {
      diagnosticTests[4] = {
        ...diagnosticTests[4],
        status: 'error',
        error: e.message,
      };
    }
    setTests([...diagnosticTests]);

    // Test 6: Backtest (small test)
    try {
      const start = Date.now();
      const { data, error } = await supabase.functions.invoke('options-backtester', {
        body: {
          strategy: 'HAVWAP-Rev-v2',
          symbol: 'SPY',
          startDate: '2024-01-02',
          endDate: '2024-01-03',
          timeframe: '1Min',
          initialCapital: 100000,
          commissionPerContract: 0.65,
          slippagePct: 50,
        },
      });
      const duration = Date.now() - start;
      
      diagnosticTests[5] = {
        ...diagnosticTests[5],
        status: error ? 'error' : 'success',
        response: data,
        error: error?.message,
        duration,
      };
    } catch (e: any) {
      diagnosticTests[5] = {
        ...diagnosticTests[5],
        status: 'error',
        error: e.message,
      };
    }
    setTests([...diagnosticTests]);

    setRunning(false);
  };

  return {
    tests,
    running,
    runDiagnostics,
  };
};
