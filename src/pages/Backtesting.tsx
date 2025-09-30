import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Play, Download, Eye } from "lucide-react";

const Backtesting = () => {
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
                <select className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground">
                  <option>HAVWAP-Rev-v2</option>
                  <option>Delta-Bucket-Trend</option>
                  <option>ATM-Scalp-v1</option>
                </select>
              </div>

              <div>
                <Label>Symbol</Label>
                <Input placeholder="SPY" className="mt-1" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" className="mt-1" defaultValue="2024-01-01" />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" className="mt-1" defaultValue="2024-03-28" />
                </div>
              </div>

              <div>
                <Label>Timeframe</Label>
                <select className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground">
                  <option>1 minute</option>
                  <option>5 minutes</option>
                  <option>15 minutes</option>
                </select>
              </div>

              <div>
                <Label>Initial Capital</Label>
                <Input type="number" placeholder="100000" className="mt-1" />
              </div>

              <div>
                <Label>Commission per Contract</Label>
                <Input type="number" placeholder="0.65" className="mt-1" />
              </div>

              <div>
                <Label>Slippage (% of spread)</Label>
                <Input type="number" placeholder="50" className="mt-1" />
              </div>

              <Button className="w-full mt-6 bg-gradient-primary shadow-glow">
                <Play className="w-4 h-4 mr-2" />
                Run Backtest
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

            {/* Equity Curve Placeholder */}
            <div className="h-[300px] bg-background/50 rounded-lg flex items-center justify-center border border-border mb-6">
              <p className="text-muted-foreground">Equity Curve Chart</p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: "Total Return", value: "+24.7%", positive: true },
                { label: "Sharpe Ratio", value: "2.14", positive: true },
                { label: "Max Drawdown", value: "-8.3%", positive: false },
                { label: "Win Rate", value: "64.2%", positive: true },
                { label: "Total Trades", value: "147", positive: null },
                { label: "Avg Win", value: "$284", positive: true },
                { label: "Avg Loss", value: "-$142", positive: false },
                { label: "Profit Factor", value: "1.84", positive: true },
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

            {/* Trade List */}
            <h3 className="text-lg font-semibold mb-3">Trade History</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {[
                { entry: "2024-01-15 10:32", exit: "2024-01-15 14:45", symbol: "SPY 450C", side: "LONG", pnl: "+$347", return: "+8.4%", positive: true },
                { entry: "2024-01-16 09:45", exit: "2024-01-16 15:12", symbol: "QQQ 370P", side: "SHORT", pnl: "+$189", return: "+5.2%", positive: true },
                { entry: "2024-01-17 11:20", exit: "2024-01-17 13:05", symbol: "SPY 455C", side: "LONG", pnl: "-$94", return: "-2.1%", positive: false },
                { entry: "2024-01-18 10:05", exit: "2024-01-18 14:30", symbol: "SPY 452P", side: "SHORT", pnl: "+$412", return: "+9.8%", positive: true },
                { entry: "2024-01-19 09:35", exit: "2024-01-19 15:45", symbol: "QQQ 375C", side: "LONG", pnl: "+$267", return: "+6.1%", positive: true },
              ].map((trade, idx) => (
                <div key={idx} className="grid grid-cols-7 gap-3 p-3 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all cursor-pointer">
                  <div className="col-span-2">
                    <p className="text-sm font-medium">{trade.symbol}</p>
                    <Badge variant="outline" className="mt-1 text-xs">{trade.side}</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Entry</p>
                    <p className="text-sm">{trade.entry.split(" ")[1]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Exit</p>
                    <p className="text-sm">{trade.exit.split(" ")[1]}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">P&L</p>
                    <p className={`text-sm font-medium ${trade.positive ? "text-success" : "text-danger"}`}>
                      {trade.pnl}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Return</p>
                    <p className={`text-sm font-medium ${trade.positive ? "text-success" : "text-danger"}`}>
                      {trade.return}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Backtesting;
