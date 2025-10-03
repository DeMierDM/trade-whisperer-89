import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface DiagnosticResult {
  name: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
  details?: string;
}

export const ApiDiagnostics = () => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DiagnosticResult[]>([]);

  const runDiagnostics = async () => {
    setRunning(true);
    const tests: DiagnosticResult[] = [
      { name: 'Account Info', status: 'pending' },
      { name: 'Stock Quote', status: 'pending' },
      { name: 'Historical Bars', status: 'pending' },
      { name: 'Options Contracts', status: 'pending' },
      { name: 'Order History', status: 'pending' },
    ];
    setResults([...tests]);

    // Test 1: Account
    try {
      const { data, error } = await supabase.functions.invoke('fetch-market-data', {
        body: { dataType: 'account' }
      });
      tests[0] = {
        ...tests[0],
        status: error ? 'error' : 'success',
        message: error ? error.message : 'Connected',
        details: data?.account ? `Balance: $${data.account.equity}` : undefined
      };
    } catch (err: any) {
      tests[0] = { ...tests[0], status: 'error', message: err.message };
    }
    setResults([...tests]);

    // Test 2: Quote
    try {
      const { data, error } = await supabase.functions.invoke('fetch-market-data', {
        body: { dataType: 'quote', symbol: 'SPY' }
      });
      tests[1] = {
        ...tests[1],
        status: error ? 'error' : 'success',
        message: error ? error.message : 'Success',
        details: data?.quote ? `Bid: $${data.quote.bid}, Ask: $${data.quote.ask}` : undefined
      };
    } catch (err: any) {
      tests[1] = { ...tests[1], status: 'error', message: err.message };
    }
    setResults([...tests]);

    // Test 3: Bars
    try {
      const { data, error } = await supabase.functions.invoke('fetch-market-data', {
        body: { 
          dataType: 'bars', 
          symbol: 'SPY',
          timeframe: '1Min',
          limit: 10
        }
      });
      tests[2] = {
        ...tests[2],
        status: error ? 'error' : 'success',
        message: error ? error.message : 'Success',
        details: data?.bars ? `Retrieved ${data.bars.length} bars` : undefined
      };
    } catch (err: any) {
      tests[2] = { ...tests[2], status: 'error', message: err.message };
    }
    setResults([...tests]);

    // Test 4: Options
    try {
      const { data, error } = await supabase.functions.invoke('fetch-market-data', {
        body: { dataType: 'options', symbol: 'SPY' }
      });
      
      if (error?.message?.includes('404')) {
        tests[3] = {
          ...tests[3],
          status: 'error',
          message: 'Options not available',
          details: 'Paper accounts have limited options access. Upgrade to live account for full options data.'
        };
      } else if (error) {
        tests[3] = { ...tests[3], status: 'error', message: error.message };
      } else {
        tests[3] = {
          ...tests[3],
          status: 'success',
          message: 'Success',
          details: data?.contracts ? `Found ${data.contracts.length} contracts` : undefined
        };
      }
    } catch (err: any) {
      tests[3] = { ...tests[3], status: 'error', message: err.message };
    }
    setResults([...tests]);

    // Test 5: Orders
    try {
      const { data, error } = await supabase.functions.invoke('fetch-market-data', {
        body: { dataType: 'orders' }
      });
      tests[4] = {
        ...tests[4],
        status: error ? 'error' : 'success',
        message: error ? error.message : 'Success',
        details: data?.orders ? `Retrieved ${data.orders.length} orders` : undefined
      };
    } catch (err: any) {
      tests[4] = { ...tests[4], status: 'error', message: err.message };
    }
    setResults([...tests]);

    setRunning(false);
  };

  return (
    <Card className="p-6 bg-gradient-card border-border shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">API Endpoint Diagnostics</h3>
        <Button 
          onClick={runDiagnostics} 
          disabled={running}
          size="sm"
        >
          {running ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Testing...
            </>
          ) : (
            'Run Tests'
          )}
        </Button>
      </div>

      {results.length > 0 && (
        <div className="space-y-2">
          {results.map((result, idx) => (
            <div 
              key={idx}
              className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background/50"
            >
              <div className="mt-0.5">
                {result.status === 'pending' && (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                )}
                {result.status === 'success' && (
                  <CheckCircle2 className="w-4 h-4 text-success" />
                )}
                {result.status === 'error' && (
                  <XCircle className="w-4 h-4 text-danger" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-medium text-sm">{result.name}</span>
                  {result.status !== 'pending' && (
                    <Badge 
                      variant={result.status === 'success' ? 'default' : 'destructive'}
                      className="text-xs"
                    >
                      {result.message}
                    </Badge>
                  )}
                </div>
                {result.details && (
                  <p className="text-xs text-muted-foreground">{result.details}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">Click "Run Tests" to check API connectivity</p>
        </div>
      )}
    </Card>
  );
};