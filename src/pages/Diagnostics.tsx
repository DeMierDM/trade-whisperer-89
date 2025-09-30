import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, CheckCircle, XCircle, Clock, Loader2 } from "lucide-react";
import { useApiDiagnostics } from "@/hooks/useApiDiagnostics";

const Diagnostics = () => {
  const { tests, running, runDiagnostics } = useApiDiagnostics();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">API Diagnostics</h1>
            <p className="text-muted-foreground">Test all API connections and data flow</p>
          </div>
          <Button 
            onClick={runDiagnostics}
            disabled={running}
            className="bg-gradient-primary shadow-glow"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Run Diagnostics
              </>
            )}
          </Button>
        </div>

        <Card className="p-6 bg-gradient-card border-border shadow-card">
          <h2 className="text-xl font-semibold mb-4">Test Results</h2>
          
          {tests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Click "Run Diagnostics" to test all API connections
            </div>
          ) : (
            <div className="space-y-3">
              {tests.map((test, idx) => (
                <div 
                  key={idx}
                  className="p-4 rounded-lg bg-secondary/50 border border-border"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {test.status === 'pending' && (
                        <Clock className="w-5 h-5 text-muted-foreground" />
                      )}
                      {test.status === 'success' && (
                        <CheckCircle className="w-5 h-5 text-success" />
                      )}
                      {test.status === 'error' && (
                        <XCircle className="w-5 h-5 text-danger" />
                      )}
                      <div>
                        <p className="font-medium">{test.name}</p>
                        <p className="text-sm text-muted-foreground">{test.endpoint}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {test.duration && (
                        <span className="text-sm text-muted-foreground">
                          {test.duration}ms
                        </span>
                      )}
                      <Badge 
                        variant={
                          test.status === 'success' ? 'default' :
                          test.status === 'error' ? 'destructive' : 'outline'
                        }
                      >
                        {test.status}
                      </Badge>
                    </div>
                  </div>

                  {test.error && (
                    <div className="mt-2 p-3 rounded bg-danger/10 border border-danger/30">
                      <p className="text-sm text-danger font-mono">{test.error}</p>
                    </div>
                  )}

                  {test.response && test.status === 'success' && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm text-primary hover:underline">
                        View Response
                      </summary>
                      <pre className="mt-2 p-3 rounded bg-background border border-border text-xs overflow-x-auto">
                        {JSON.stringify(test.response, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 bg-gradient-card border-border shadow-card">
          <h2 className="text-xl font-semibold mb-4">API Requirements by Tab</h2>
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <h3 className="font-medium mb-2">Home Tab</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Alpaca Account API - Live balance, positions, P&L</li>
                <li>• Alpaca Orders API - Recent orders for win rate calculation</li>
                <li>• Updates every 30 seconds</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <h3 className="font-medium mb-2">Trading Tab</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Alpaca WebSocket - Real-time quotes for underlying</li>
                <li>• Polygon API - Options chain data</li>
                <li>• Note: Paper trading has 15-minute delay for quotes</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <h3 className="font-medium mb-2">Backtesting Tab</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Alpaca Data API - Historical stock bars (data.alpaca.markets)</li>
                <li>• Polygon API - Historical options data (if needed)</li>
                <li>• Requires date range in RFC3339 format</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <h3 className="font-medium mb-2">Tuning Tab</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Calls options-backtester multiple times with different parameters</li>
                <li>• Same data requirements as Backtesting</li>
                <li>• Stores results in strategy_parameters table</li>
              </ul>
            </div>

            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <h3 className="font-medium mb-2">History Tab</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Alpaca Orders API - Closed orders with fills</li>
                <li>• Filters: Date range, status, symbol search</li>
                <li>• Calculates P&L from filled_avg_price</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Diagnostics;
