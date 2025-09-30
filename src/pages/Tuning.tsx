import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Play, Square, TrendingUp, Lock } from "lucide-react";

const Tuning = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Strategy Tuning</h1>
          <p className="text-muted-foreground">Optimize parameters with Optuna for maximum Sharpe ratio</p>
        </div>

        <div className="grid grid-cols-12 gap-4">
          {/* Study Configuration */}
          <Card className="col-span-4 p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4">New Study</h2>
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
                <Label>Objective</Label>
                <select className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground">
                  <option>Maximize Sharpe Ratio</option>
                  <option>Minimize Max Drawdown</option>
                  <option>Multi-Objective (Sharpe + DD)</option>
                </select>
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
                <Label>Walk-Forward Folds</Label>
                <Input type="number" placeholder="4" className="mt-1" />
              </div>

              <div>
                <Label>Trial Budget</Label>
                <Input type="number" placeholder="50" className="mt-1" />
              </div>

              <div>
                <Label>Sampler</Label>
                <select className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground">
                  <option>TPE (Tree-structured Parzen Estimator)</option>
                  <option>CMA-ES</option>
                  <option>Random</option>
                </select>
              </div>

              <div>
                <Label>Pruner</Label>
                <select className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground">
                  <option>Median Pruner</option>
                  <option>Hyperband</option>
                  <option>None</option>
                </select>
              </div>

              <Button className="w-full mt-6 bg-gradient-primary shadow-glow">
                <Play className="w-4 h-4 mr-2" />
                Start Study
              </Button>
            </div>
          </Card>

          {/* Study Progress */}
          <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Study Progress</h2>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-success/10 text-success border-success">
                  Running
                </Badge>
                <Button variant="destructive" size="sm">
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              </div>
            </div>

            {/* Progress Stats */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {[
                { label: "Trials Completed", value: "24 / 50" },
                { label: "Best Sharpe", value: "2.47" },
                { label: "Best Max DD", value: "-6.2%" },
                { label: "Elapsed Time", value: "12m 34s" },
              ].map((stat) => (
                <div key={stat.label} className="p-4 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold mt-1">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Optimization History Chart Placeholder */}
            <div className="h-[250px] bg-background/50 rounded-lg flex items-center justify-center border border-border mb-6">
              <p className="text-muted-foreground">Optimization History Chart</p>
            </div>

            {/* Best Trial */}
            <div className="p-4 rounded-lg bg-gradient-success/10 border border-success/30 mb-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-success" />
                  Best Trial (#17)
                </h3>
                <Button variant="outline" size="sm">
                  <Lock className="w-4 h-4 mr-2" />
                  Lock Parameters
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-3 mb-3">
                <div>
                  <p className="text-xs text-muted-foreground">Sharpe Ratio</p>
                  <p className="text-lg font-bold text-success">2.47</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Max DD</p>
                  <p className="text-lg font-bold">-6.2%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                  <p className="text-lg font-bold">67.8%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Profit Factor</p>
                  <p className="text-lg font-bold">2.03</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div className="p-2 rounded bg-secondary/50">
                  <span className="text-muted-foreground">emaLen:</span> <span className="font-mono">21</span>
                </div>
                <div className="p-2 rounded bg-secondary/50">
                  <span className="text-muted-foreground">dEntryPct:</span> <span className="font-mono">0.18</span>
                </div>
                <div className="p-2 rounded bg-secondary/50">
                  <span className="text-muted-foreground">dNearPct:</span> <span className="font-mono">0.06</span>
                </div>
                <div className="p-2 rounded bg-secondary/50">
                  <span className="text-muted-foreground">slopeMin:</span> <span className="font-mono">0.00032</span>
                </div>
                <div className="p-2 rounded bg-secondary/50">
                  <span className="text-muted-foreground">spreadMax:</span> <span className="font-mono">8</span>
                </div>
                <div className="p-2 rounded bg-secondary/50">
                  <span className="text-muted-foreground">timeStopBars:</span> <span className="font-mono">120</span>
                </div>
              </div>
            </div>

            {/* Parameter Importance */}
            <h3 className="text-lg font-semibold mb-3">Parameter Importance</h3>
            <div className="space-y-2">
              {[
                { param: "emaLen", importance: 0.28 },
                { param: "dEntryPct", importance: 0.22 },
                { param: "spreadMax", importance: 0.18 },
                { param: "slopeMin", importance: 0.15 },
                { param: "timeStopBars", importance: 0.10 },
                { param: "dNearPct", importance: 0.07 },
              ].map((item) => (
                <div key={item.param} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-mono">{item.param}</span>
                    <span className="text-muted-foreground">{(item.importance * 100).toFixed(0)}%</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-primary transition-all"
                      style={{ width: `${item.importance * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Recent Studies */}
        <Card className="p-6 bg-gradient-card border-border shadow-card">
          <h2 className="text-xl font-semibold mb-4">Recent Studies</h2>
          <div className="space-y-2">
            {[
              { id: "study-003", strategy: "HAVWAP-Rev-v2", trials: "50/50", bestSharpe: "2.47", status: "Completed", time: "25m ago" },
              { id: "study-002", strategy: "Delta-Bucket-Trend", trials: "38/50", bestSharpe: "1.89", status: "Stopped", time: "2h ago" },
              { id: "study-001", strategy: "ATM-Scalp-v1", trials: "50/50", bestSharpe: "1.64", status: "Completed", time: "5h ago" },
            ].map((study) => (
              <div key={study.id} className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all cursor-pointer">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="font-medium">{study.id}</p>
                    <p className="text-sm text-muted-foreground">{study.strategy}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Trials</p>
                    <p className="font-medium">{study.trials}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Best Sharpe</p>
                    <p className="font-medium text-success">{study.bestSharpe}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge variant={study.status === "Completed" ? "default" : "outline"}>
                    {study.status}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{study.time}</p>
                  <Button variant="outline" size="sm">View</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Tuning;
