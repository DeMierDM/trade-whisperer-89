import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Pause, Square, RefreshCw, AlertTriangle } from "lucide-react";

const Trading = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        {/* Header with Bot Controls */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Live Trading</h1>
            <p className="text-muted-foreground">Real-time options trading with HAVWAP strategies</p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="px-4 py-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse mr-2" />
              Bot Active
            </Badge>
            <Button variant="outline" size="sm">
              <Play className="w-4 h-4 mr-2" />
              Start
            </Button>
            <Button variant="outline" size="sm">
              <Pause className="w-4 h-4 mr-2" />
              Pause
            </Button>
            <Button variant="destructive" size="sm">
              <Square className="w-4 h-4 mr-2" />
              Kill Switch
            </Button>
          </div>
        </div>

        {/* Mode Selector */}
        <Tabs defaultValue="live" className="w-full">
          <TabsList className="bg-secondary">
            <TabsTrigger value="live">Live Trading</TabsTrigger>
            <TabsTrigger value="paper">Paper Trading</TabsTrigger>
          </TabsList>

          <TabsContent value="live" className="space-y-4 mt-4">
            {/* Main Grid */}
            <div className="grid grid-cols-12 gap-4">
              {/* Chart Panel */}
              <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <h2 className="text-xl font-semibold">SPY</h2>
                    <Badge variant="outline">1m</Badge>
                    <span className="text-2xl font-bold text-success">$452.34</span>
                    <span className="text-sm text-success">+0.84%</span>
                  </div>
                  <Button variant="outline" size="sm">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
                <div className="h-[500px] bg-background/50 rounded-lg flex items-center justify-center border border-border">
                  <p className="text-muted-foreground">Lightweight Charts Panel</p>
                </div>
              </Card>

              {/* Options Matrix */}
              <Card className="col-span-4 p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Options Matrix</h2>
                <div className="space-y-4">
                  {/* Controls */}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1">ATM±3</Button>
                    <Button variant="outline" size="sm" className="flex-1">Δ Buckets</Button>
                  </div>

                  {/* Options Chain */}
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground grid grid-cols-7 gap-1 px-2">
                      <span className="col-span-2">Strike</span>
                      <span className="text-right">Bid</span>
                      <span className="text-right">Ask</span>
                      <span className="text-right">Vol</span>
                      <span className="text-right">OI</span>
                      <span className="text-right">Δ</span>
                    </div>
                    {[
                      { strike: "455C", bid: "2.45", ask: "2.48", vol: "12.4K", oi: "45K", delta: "0.52", itm: false },
                      { strike: "452C", bid: "4.20", ask: "4.24", vol: "18.2K", oi: "67K", delta: "0.65", itm: true },
                      { strike: "450C", bid: "6.15", ask: "6.19", vol: "22.1K", oi: "89K", delta: "0.78", itm: true },
                      { strike: "450P", bid: "3.92", ask: "3.95", vol: "15.3K", oi: "54K", delta: "-0.22", itm: false },
                      { strike: "452P", bid: "5.84", ask: "5.88", vol: "19.8K", oi: "72K", delta: "-0.35", itm: false },
                      { strike: "455P", bid: "8.45", ask: "8.50", vol: "11.2K", oi: "41K", delta: "-0.48", itm: false },
                    ].map((option) => (
                      <div
                        key={option.strike}
                        className={`text-sm grid grid-cols-7 gap-1 p-2 rounded transition-all cursor-pointer hover:bg-muted ${
                          option.itm ? "bg-success/5 border border-success/20" : "bg-secondary/50"
                        }`}
                      >
                        <span className="col-span-2 font-medium">{option.strike}</span>
                        <span className="text-right text-muted-foreground">{option.bid}</span>
                        <span className="text-right text-muted-foreground">{option.ask}</span>
                        <span className="text-right text-xs">{option.vol}</span>
                        <span className="text-right text-xs">{option.oi}</span>
                        <span className={`text-right text-xs ${parseFloat(option.delta) > 0 ? "text-success" : "text-danger"}`}>
                          {option.delta}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              {/* Position Monitor */}
              <Card className="col-span-8 p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Open Positions</h2>
                <div className="space-y-2">
                  {[
                    { symbol: "SPY 450C 03/28", qty: "+2", entry: "$6.20", current: "$6.45", pnl: "+$50.00", pnlPct: "+4.0%", positive: true },
                    { symbol: "QQQ 370P 03/28", qty: "-1", entry: "$3.80", current: "$3.65", pnl: "+$15.00", pnlPct: "+3.9%", positive: true },
                    { symbol: "SPY 455C 03/29", qty: "+3", entry: "$2.50", current: "$2.40", pnl: "-$30.00", pnlPct: "-4.0%", positive: false },
                  ].map((position, idx) => (
                    <div key={idx} className="grid grid-cols-7 gap-4 p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all">
                      <div className="col-span-2">
                        <p className="font-medium">{position.symbol}</p>
                        <p className="text-sm text-muted-foreground">{position.qty}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Entry</p>
                        <p className="font-medium">{position.entry}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Current</p>
                        <p className="font-medium">{position.current}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">P&L</p>
                        <p className={`font-medium ${position.positive ? "text-success" : "text-danger"}`}>
                          {position.pnl}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">P&L %</p>
                        <p className={`font-medium ${position.positive ? "text-success" : "text-danger"}`}>
                          {position.pnlPct}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1">Close</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Risk Monitor */}
              <Card className="col-span-4 p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-warning" />
                  Risk Monitor
                </h2>
                <div className="space-y-4">
                  {[
                    { label: "Daily Loss Limit", current: "$847", limit: "$5,000", pct: 17 },
                    { label: "Position Size", current: "6", limit: "10", pct: 60 },
                    { label: "Max Spread", current: "$0.04", limit: "$0.12", pct: 33 },
                    { label: "Time Stop", current: "45m", limit: "180m", pct: 25 },
                  ].map((risk) => (
                    <div key={risk.label} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{risk.label}</span>
                        <span className="text-sm text-muted-foreground">
                          {risk.current} / {risk.limit}
                        </span>
                      </div>
                      <div className="h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            risk.pct > 80 ? "bg-danger" : risk.pct > 50 ? "bg-warning" : "bg-success"
                          }`}
                          style={{ width: `${risk.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 rounded-lg bg-success/10 border border-success/20">
                  <p className="text-sm font-medium text-success">All Risk Checks Passed</p>
                  <p className="text-xs text-muted-foreground mt-1">Last check: 2s ago</p>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="paper">
            <div className="flex items-center justify-center h-[600px]">
              <p className="text-muted-foreground">Paper trading interface (identical to live)</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Trading;
