import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Play, Download, Eye, Loader2 } from "lucide-react";
import { useBacktest } from "@/hooks/useBacktest";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Backtesting = () => {
  const { loading, results, runBacktest, fetchTrades } = useBacktest();
  const [config, setConfig] = useState({
    strategy: 'HAVWAP-Rev-v2',
    symbol: 'SPY',
    startDate: '2024-01-01',
    endDate: '2024-03-28',
    timeframe: '1Min',
    initialCapital: 100000,
    commissionPerContract: 0.65,
    slippagePct: 50,
  });
  const [trades, setTrades] = useState<any[]>([]);
  const [equityCurve, setEquityCurve] = useState<any[]>([]);

  useEffect(() => {
    if (results) {
      loadTrades();
    }
  }, [results]);

  const loadTrades = async () => {
    if (!results) return;
    const tradesData = await fetchTrades(results.id);
    setTrades(tradesData);

    // Calculate equity curve
    let equity = config.initialCapital;
    const curve = [{ date: config.startDate, equity }];
    
    tradesData.forEach((trade) => {
      equity += trade.pnl;
      curve.push({
        date: new Date(trade.exit_time).toISOString().split('T')[0],
        equity,
      });
    });
    
    setEquityCurve(curve);
  };

  const handleRunBacktest = () => {
    runBacktest(config);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Backtesting</h1>
          <p className="text-muted-foreground">Test strategies on historical data with realistic fills</p>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Configuration Panel */}
          <Card className="col-span-4 p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4">Configuration</h2>
            <div className="space-y-4">
              <div>
                <Label>Strategy</Label>
                <select 
                  className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground"
                  value={config.strategy}
                  onChange={(e) => setConfig({ ...config, strategy: e.target.value })}
                >
                  <option value="HAVWAP-Rev-v2">HAVWAP-Rev-v2</option>
                  <option value="Delta-Bucket-Trend">Delta-Bucket-Trend</option>
                  <option value="ATM-Scalp-v1">ATM-Scalp-v1</option>
                </select>
              </div>

              <div>
                <Label>Symbol</Label>
                <Input 
                  placeholder="SPY" 
                  className="mt-1"
                  value={config.symbol}
                  onChange={(e) => setConfig({ ...config, symbol: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input 
                    type="date" 
                    className="mt-1"
                    value={config.startDate}
                    onChange={(e) => setConfig({ ...config, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input 
                    type="date" 
                    className="mt-1"
                    value={config.endDate}
                    onChange={(e) => setConfig({ ...config, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Timeframe</Label>
                <select 
                  className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground"
                  value={config.timeframe}
                  onChange={(e) => setConfig({ ...config, timeframe: e.target.value })}
                >
                  <option value="1Min">1 minute</option>
                  <option value="5Min">5 minutes</option>
                  <option value="15Min">15 minutes</option>
                </select>
              </div>

              <div>
                <Label>Initial Capital</Label>
                <Input 
                  type="number"
                  className="mt-1"
                  value={config.initialCapital}
                  onChange={(e) => setConfig({ ...config, initialCapital: Number(e.target.value) })}
                />
              </div>

              <div>
                <Label>Commission per Contract</Label>
                <Input 
                  type="number"
                  step="0.01"
                  className="mt-1"
                  value={config.commissionPerContract}
                  onChange={(e) => setConfig({ ...config, commissionPerContract: Number(e.target.value) })}
                />
              </div>

              <div>
                <Label>Slippage (% of spread)</Label>
                <Input 
                  type="number"
                  className="mt-1"
                  value={config.slippagePct}
                  onChange={(e) => setConfig({ ...config, slippagePct: Number(e.target.value) })}
                />
              </div>

              <Button 
                className="w-full mt-6 bg-gradient-primary shadow-glow"
                onClick={handleRunBacktest}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Run Backtest
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Results Panel */}
          <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Results</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
                <Button variant="outline" size="sm">
                  <Eye className="w-4 h-4 mr-2" />
                  Replay
                </Button>
              </div>
            </div>

            {/* Equity Curve */}
            <div className="h-[300px] bg-background/50 rounded-lg border border-border mb-6 p-4">
              {equityCurve.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="equity" 
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">
                    {loading ? 'Running backtest...' : 'Run a backtest to see equity curve'}
                  </p>
                </div>
              )}
            </div>

            {/* Metrics Grid */}
            {results && (
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Total Return", value: `${results.totalReturn >= 0 ? '+' : ''}${results.totalReturn.toFixed(2)}%`, positive: results.totalReturn >= 0 },
                  { label: "Sharpe Ratio", value: results.sharpeRatio.toFixed(2), positive: results.sharpeRatio > 0 },
                  { label: "Max Drawdown", value: `-${results.maxDrawdown.toFixed(2)}%`, positive: false },
                  { label: "Win Rate", value: `${results.winRate.toFixed(1)}%`, positive: results.winRate > 50 },
                  { label: "Total Trades", value: results.totalTrades.toString(), positive: null },
                  { label: "Avg Win", value: `$${results.avgWin.toFixed(0)}`, positive: true },
                  { label: "Avg Loss", value: `-$${Math.abs(results.avgLoss).toFixed(0)}`, positive: false },
                  { label: "Profit Factor", value: results.profitFactor.toFixed(2), positive: results.profitFactor > 1 },
                ].map((metric) => (
                  <div key={metric.label} className="p-4 rounded-lg bg-secondary/50 border border-border">
                    <p className="text-sm text-muted-foreground">{metric.label}</p>
                    <p className={`text-2xl font-bold mt-1 ${
                      metric.positive === true ? "text-success" :
                      metric.positive === false ? "text-danger" : ""
                    }`}>
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Trade List */}
            <h3 className="text-lg font-semibold mb-3">Trade History</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {trades.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  {loading ? 'Loading trades...' : 'No trades yet'}
                </div>
              ) : (
                trades.map((trade, idx) => (
                  <div key={idx} className="grid grid-cols-7 gap-3 p-3 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all cursor-pointer">
                    <div className="col-span-2">
                      <p className="text-sm font-medium">{trade.symbol}</p>
                      <Badge variant="outline" className="mt-1 text-xs">{trade.side}</Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Entry</p>
                      <p className="text-sm">{new Date(trade.entry_time).toLocaleTimeString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Exit</p>
                      <p className="text-sm">{new Date(trade.exit_time).toLocaleTimeString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">P&L</p>
                      <p className={`text-sm font-medium ${trade.pnl >= 0 ? "text-success" : "text-danger"}`}>
                        {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Return</p>
                      <p className={`text-sm font-medium ${trade.return_pct >= 0 ? "text-success" : "text-danger"}`}>
                        {trade.return_pct >= 0 ? '+' : ''}{trade.return_pct.toFixed(1)}%
                      </p>
                    </div>
                    <div className="flex items-center">
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Backtesting;
