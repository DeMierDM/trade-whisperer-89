import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Play, Square, TrendingUp, Lock, Loader2 } from "lucide-react";
import { useOptimizer } from "@/hooks/useOptimizer";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const Tuning = () => {
  const { loading, results, progress, startOptimization } = useOptimizer();
  const [config, setConfig] = useState({
    strategy: 'HAVWAP-Rev-v2',
    objective: 'sharpe',
    startDate: '2024-01-01',
    endDate: '2024-03-28',
    walkForwardFolds: 4,
    trialBudget: 50,
    sampler: 'TPE',
    pruner: 'Median',
  });

  const handleStartStudy = () => {
    startOptimization(config);
  };

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
                <Label>Objective</Label>
                <select 
                  className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground"
                  value={config.objective}
                  onChange={(e) => setConfig({ ...config, objective: e.target.value })}
                >
                  <option value="sharpe">Maximize Sharpe Ratio</option>
                  <option value="return">Maximize Return</option>
                  <option value="calmar">Maximize Calmar Ratio</option>
                </select>
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
                <Label>Walk-Forward Folds</Label>
                <Input 
                  type="number"
                  className="mt-1"
                  value={config.walkForwardFolds}
                  onChange={(e) => setConfig({ ...config, walkForwardFolds: Number(e.target.value) })}
                />
              </div>

              <div>
                <Label>Trial Budget</Label>
                <Input 
                  type="number"
                  className="mt-1"
                  value={config.trialBudget}
                  onChange={(e) => setConfig({ ...config, trialBudget: Number(e.target.value) })}
                />
              </div>

              <div>
                <Label>Sampler</Label>
                <select 
                  className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground"
                  value={config.sampler}
                  onChange={(e) => setConfig({ ...config, sampler: e.target.value })}
                >
                  <option value="TPE">TPE (Tree-structured Parzen Estimator)</option>
                  <option value="CMA-ES">CMA-ES</option>
                  <option value="Random">Random</option>
                </select>
              </div>

              <div>
                <Label>Pruner</Label>
                <select 
                  className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground"
                  value={config.pruner}
                  onChange={(e) => setConfig({ ...config, pruner: e.target.value })}
                >
                  <option value="Median">Median Pruner</option>
                  <option value="Hyperband">Hyperband</option>
                  <option value="None">None</option>
                </select>
              </div>

              <Button 
                className="w-full mt-6 bg-gradient-primary shadow-glow"
                onClick={handleStartStudy}
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
                    Start Study
                  </>
                )}
              </Button>
            </div>
          </Card>

          {/* Study Progress */}
          <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Study Progress</h2>
              <div className="flex items-center gap-2">
                {loading && (
                  <Badge variant="outline" className="bg-success/10 text-success border-success">
                    Running
                  </Badge>
                )}
                {results && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary">
                    Completed
                  </Badge>
                )}
              </div>
            </div>

            {/* Progress Stats */}
            {results && (
              <>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                    <p className="text-sm text-muted-foreground">Trials Completed</p>
                    <p className="text-xl font-bold mt-1">{results.totalTrials} / {config.trialBudget}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                    <p className="text-sm text-muted-foreground">Best Score</p>
                    <p className="text-xl font-bold mt-1">{results.bestScore.toFixed(2)}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                    <p className="text-sm text-muted-foreground">Objective</p>
                    <p className="text-xl font-bold mt-1 capitalize">{config.objective}</p>
                  </div>
                  <div className="p-4 rounded-lg bg-secondary/50 border border-border">
                    <p className="text-sm text-muted-foreground">Status</p>
                    <p className="text-xl font-bold mt-1">Complete</p>
                  </div>
                </div>

                {/* Optimization History Chart */}
                <div className="h-[250px] bg-background/50 rounded-lg border border-border mb-6 p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={results.trials}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="trial_number" stroke="hsl(var(--muted-foreground))" />
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
                        dataKey="score" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Best Parameters */}
                <div className="p-4 rounded-lg bg-gradient-success/10 border border-success/30 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-success" />
                      Best Parameters
                    </h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    {Object.entries(results.bestParams).map(([key, value]) => (
                      <div key={key} className="p-2 rounded bg-secondary/50">
                        <span className="text-muted-foreground">{key}:</span>{' '}
                        <span className="font-mono">{typeof value === 'number' ? value.toFixed(4) : value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!results && !loading && (
              <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                Configure and start a study to see optimization results
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Tuning;
