import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, MessageSquare, Code, TrendingUp } from "lucide-react";

const AI = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold">AI Assistant (Claude MCP)</h1>
          <p className="text-muted-foreground">Interact with your trading system through Claude Desktop</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* MCP Status */}
          <Card className="p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Brain className="w-5 h-5 text-primary" />
              MCP Status
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-sm font-medium">Connection</span>
                <Badge variant="outline" className="bg-success/10 text-success border-success">
                  Active
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-sm font-medium">Tools Available</span>
                <span className="font-medium">7</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                <span className="text-sm font-medium">Requests Today</span>
                <span className="font-medium">24</span>
              </div>
            </div>
          </Card>

          {/* Available Tools */}
          <Card className="col-span-2 p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Code className="w-5 h-5 text-primary" />
              Available Tools
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                { name: "get_bars", desc: "Fetch historical OHLCV data", icon: TrendingUp },
                { name: "chain_top3", desc: "Get top 3 call/put options", icon: TrendingUp },
                { name: "run_backtest", desc: "Execute strategy backtest", icon: TrendingUp },
                { name: "generate_pinescript", desc: "Generate Pine Script code", icon: Code },
                { name: "start_tuning", desc: "Start Optuna study", icon: Brain },
                { name: "study_status", desc: "Check tuning progress", icon: Brain },
                { name: "best_params", desc: "Get optimal parameters", icon: Brain },
              ].map((tool) => (
                <div key={tool.name} className="p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all cursor-pointer">
                  <div className="flex items-center gap-2 mb-2">
                    <tool.icon className="w-4 h-4 text-primary" />
                    <span className="font-mono text-sm font-medium">{tool.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{tool.desc}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Recent Tool Calls */}
          <Card className="col-span-3 p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Recent Tool Calls
            </h2>
            <div className="space-y-2">
              {[
                { tool: "run_backtest", params: "{ strategy: 'HAVWAP-Rev-v2', from: '2024-01-01' }", result: "Success: Sharpe 2.14", time: "2 min ago", success: true },
                { tool: "chain_top3", params: "{ symbol: 'SPY', mode: 'atm' }", result: "Success: 6 contracts returned", time: "5 min ago", success: true },
                { tool: "get_bars", params: "{ symbol: 'QQQ', tf: '1m', from: '2024-03-28' }", result: "Success: 390 bars", time: "8 min ago", success: true },
                { tool: "start_tuning", params: "{ strategy: 'HAVWAP-Rev-v2', trials: 50 }", result: "Running: study-004", time: "15 min ago", success: true },
              ].map((call, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${call.success ? "bg-success" : "bg-danger"}`} />
                      <span className="font-mono text-sm font-medium">{call.tool}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{call.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-1">Params: {call.params}</p>
                  <p className="text-xs font-medium text-success">{call.result}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="col-span-3 p-6 bg-gradient-card border-border shadow-card">
            <h2 className="text-xl font-semibold mb-4">Quick Examples</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { label: "Get SPY options chain", command: "Show me the top 3 ATM options for SPY" },
                { label: "Run backtest", command: "Backtest HAVWAP-Rev-v2 from Jan 1 to Mar 28" },
                { label: "Start parameter tuning", command: "Tune HAVWAP strategy with 50 trials" },
                { label: "Check tuning status", command: "What's the status of my latest Optuna study?" },
              ].map((example) => (
                <div key={example.label} className="p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all cursor-pointer">
                  <p className="text-sm font-medium mb-2">{example.label}</p>
                  <p className="text-xs text-muted-foreground font-mono">"{example.command}"</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AI;
