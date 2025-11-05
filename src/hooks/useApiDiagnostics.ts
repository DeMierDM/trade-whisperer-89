import { useState } from 'react';
import { ENDPOINTS, REQUEST_CONFIG, logApiCall, createApiError } from '../lib/apiConfig';

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
        name: 'Alpaca Options Chain',
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
      const response = await fetch(ENDPOINTS.MARKET_DATA, {
        method: 'POST',
        headers: REQUEST_CONFIG.DEFAULT_HEADERS,
        body: JSON.stringify({ dataType: 'account' }),
      });
      const data = await response.json();
      const duration = Date.now() - start;

      console.log('Account test:', { data, duration });

      diagnosticTests[0] = {
        ...diagnosticTests[0],
        status: !response.ok || data.error ? 'error' : 'success',
        response: data,
        error: data?.error,
        duration,
      };
    } catch (e: any) {
      console.error('Account test exception:', e);
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
      const response = await fetch(ENDPOINTS.MARKET_DATA, {
        method: 'POST',
        headers: REQUEST_CONFIG.DEFAULT_HEADERS,
        body: JSON.stringify({ dataType: 'orders' }),
      });
      const data = await response.json();
      const duration = Date.now() - start;

      console.log('Orders test:', { data, duration });

      diagnosticTests[1] = {
        ...diagnosticTests[1],
        status: !response.ok || data.error ? 'error' : 'success',
        response: data,
        error: data?.error,
        duration,
      };
    } catch (e: any) {
      console.error('Orders test exception:', e);
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
      const response = await fetch(ENDPOINTS.MARKET_DATA, {
        method: 'POST',
        headers: REQUEST_CONFIG.DEFAULT_HEADERS,
        body: JSON.stringify({ dataType: 'quote', symbol: 'SPY' }),
      });
      const data = await response.json();
      const duration = Date.now() - start;

      console.log('Quote test:', { data, duration });

      diagnosticTests[2] = {
        ...diagnosticTests[2],
        status: !response.ok || data.error ? 'error' : 'success',
        response: data,
        error: data?.error,
        duration,
      };
    } catch (e: any) {
      console.error('Quote test exception:', e);
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
      const response = await fetch(ENDPOINTS.MARKET_DATA, {
        method: 'POST',
        headers: REQUEST_CONFIG.DEFAULT_HEADERS,
        body: JSON.stringify({
          dataType: 'bars',
          symbol: 'SPY',
          start: '2024-01-01T09:30:00Z',
          end: '2024-01-05T16:00:00Z',
          timeframe: '1Min'
        }),
      });
      const data = await response.json();
      const duration = Date.now() - start;

      console.log('Bars test:', { data, duration });

      diagnosticTests[3] = {
        ...diagnosticTests[3],
        status: !response.ok || data.error ? 'error' : 'success',
        response: data,
        error: data?.error,
        duration,
      };
    } catch (e: any) {
      console.error('Bars test exception:', e);
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
      const response = await fetch(ENDPOINTS.MARKET_DATA, {
        method: 'POST',
        headers: REQUEST_CONFIG.DEFAULT_HEADERS,
        body: JSON.stringify({ dataType: 'options', symbol: 'SPY' }),
      });
      const data = await response.json();
      const duration = Date.now() - start;

      console.log('Options test:', { data, duration });

      diagnosticTests[4] = {
        ...diagnosticTests[4],
        status: !response.ok || data.error ? 'error' : 'success',
        response: data,
        error: data?.error,
        duration,
      };
    } catch (e: any) {
      console.error('Options test exception:', e);
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
      const response = await fetch(ENDPOINTS.BACKTEST, {
        method: 'POST',
        headers: REQUEST_CONFIG.DEFAULT_HEADERS,
        body: JSON.stringify({
          strategy: 'HAVWAP-Rev-v2',
          symbol: 'SPY',
          startDate: '2024-01-02',
          endDate: '2024-01-03',
          timeframe: '1Min',
          initialCapital: 100000,
          commissionPerContract: 0.65,
          slippagePct: 50,
        }),
      });
      const data = await response.json();
      const duration = Date.now() - start;

      console.log('Backtest test:', { data, duration });

      diagnosticTests[5] = {
        ...diagnosticTests[5],
        status: !response.ok || data.error ? 'error' : 'success',
        response: data,
        error: data?.error,
        duration,
      };
    } catch (e: any) {
      console.error('Backtest test exception:', e);
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
