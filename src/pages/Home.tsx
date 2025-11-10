import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, TrendingUp, BarChart3, Settings, Brain, History, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ENDPOINTS, REQUEST_CONFIG, logApiCall, createApiError } from "../lib/apiConfig";

const Home = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [accountData, setAccountData] = useState({
    balance: "$0.00",
    dailyPnL: "$0.00",
    dailyPnLPercent: "0.0%",
    openPositions: "0",
    positionsITM: "0",
    winRate: "0.0%",
  });

  useEffect(() => {
    // For local mode, just set some demo data instead of fetching from API
    setAccountData({
      balance: "$10,000.00",
      dailyPnL: "+$125.50",
      dailyPnLPercent: "+1.3%",
      openPositions: "0",
      positionsITM: "0 ITM",
      winRate: "Local Mode",
    });
    setLoading(false);
  }, []);

  // Account data fetching removed for local mode - using demo data instead

  // Win rate calculation removed for local mode - using demo data instead

  const stats = [
    { 
      label: "Account Balance", 
      value: accountData.balance, 
      change: accountData.dailyPnLPercent, 
      positive: accountData.dailyPnL.startsWith('+') 
    },
    { 
      label: "Daily P&L", 
      value: accountData.dailyPnL, 
      change: accountData.dailyPnLPercent, 
      positive: accountData.dailyPnL.startsWith('+') 
    },
    { 
      label: "Open Positions", 
      value: accountData.openPositions, 
      change: accountData.positionsITM, 
      positive: true 
    },
    { 
      label: "Win Rate", 
      value: accountData.winRate, 
      change: "Last 30 days", 
      positive: true 
    },
  ];

  const quickActions = [
    { icon: Activity, label: "Start Trading", href: "/trading", color: "primary" },
    { icon: BarChart3, label: "Run Backtest", href: "/backtesting", color: "info" },
    { icon: Brain, label: "Tune Strategy", href: "/tuning", color: "accent" },
    { icon: Settings, label: "Settings", href: "/settings", color: "secondary" },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
              HAVWAP Trader
            </h1>
            <p className="text-muted-foreground mt-1">
              Professional Options Trading Platform
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-sm font-medium">Live Market Data</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="p-6 bg-gradient-card border-border shadow-card hover:shadow-elevated transition-all">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className={`text-sm font-medium ${stat.positive ? "text-success" : "text-danger"}`}>
                  {stat.change}
                </p>
              </div>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card className="p-6 bg-gradient-card border-border shadow-card">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <Button
                key={action.label}
                variant="outline"
                className="h-24 flex flex-col items-center justify-center gap-3 hover:bg-muted hover:shadow-glow transition-all"
                onClick={() => window.location.href = action.href}
              >
                <action.icon className="w-6 h-6" />
                <span className="font-medium">{action.label}</span>
              </Button>
            ))}
          </div>
        </Card>

        {/* Recent Activity */}
        <Card className="p-6 bg-gradient-card border-border shadow-card">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            Recent Activity
          </h2>
          <div className="space-y-3">
            {[
              { type: "TRADE", symbol: "SPY 450C 03/28", action: "CLOSED", pnl: "+$847", time: "2 min ago", positive: true },
              { type: "BACKTEST", strategy: "HAVWAP-Rev-v2", result: "Sharpe: 2.14", time: "15 min ago", positive: true },
              { type: "TUNE", study: "Optuna-Study-003", status: "Completed", time: "1 hour ago", positive: true },
              { type: "TRADE", symbol: "QQQ 370P 03/28", action: "OPENED", pnl: "—", time: "3 hours ago", positive: false },
            ].map((activity, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${activity.positive ? "bg-success" : "bg-info"}`} />
                  <div>
                    <p className="font-medium">{activity.type === "TRADE" ? activity.symbol : activity.type === "BACKTEST" ? activity.strategy : activity.study}</p>
                    <p className="text-sm text-muted-foreground">{activity.type === "TRADE" ? activity.action : activity.type === "BACKTEST" ? activity.result : activity.status}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-medium ${activity.type === "TRADE" && activity.positive ? "text-success" : ""}`}>
                    {activity.type === "TRADE" ? activity.pnl : ""}
                  </p>
                  <p className="text-sm text-muted-foreground">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* System Status */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-6 bg-gradient-card border-border shadow-card">
            <h3 className="text-lg font-semibold mb-4">Market Status</h3>
            <div className="space-y-3">
              {[
                { name: "Alpaca Data", status: "Connected", latency: "12ms", ok: true },
                { name: "Alpaca Broker", status: "Connected", latency: "8ms", ok: true },
                { name: "Options Chain (Alpaca)", status: "Live", latency: "45ms", ok: true },
              ].map((service) => (
                <div key={service.name} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${service.ok ? "bg-success" : "bg-danger"}`} />
                    <span className="font-medium">{service.name}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">{service.latency}</span>
                    <span className="text-sm text-success font-medium">{service.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6 bg-gradient-card border-border shadow-card">
            <h3 className="text-lg font-semibold mb-4">Active Strategies</h3>
            <div className="space-y-3">
              {[
                { name: "HAVWAP-Rev-v2", status: "Running", trades: 3, pnl: "+$1,247" },
                { name: "Delta-Bucket-Trend", status: "Paused", trades: 0, pnl: "+$892" },
                { name: "ATM-Scalp-v1", status: "Running", trades: 2, pnl: "-$154" },
              ].map((strategy) => (
                <div key={strategy.name} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                  <div>
                    <p className="font-medium">{strategy.name}</p>
                    <p className="text-sm text-muted-foreground">{strategy.trades} trades today</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-medium ${strategy.pnl.startsWith("+") ? "text-success" : "text-danger"}`}>
                      {strategy.pnl}
                    </p>
                    <p className="text-sm text-muted-foreground">{strategy.status}</p>
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

export default Home;