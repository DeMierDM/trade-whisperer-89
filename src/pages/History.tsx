import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Eye } from "lucide-react";

const History = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Trade History</h1>
            <p className="text-muted-foreground">Complete audit trail of all executed trades</p>
          </div>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Filters */}
        <Card className="p-6 bg-gradient-card border-border shadow-card">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search symbol..." className="pl-10" />
            </div>
            <Input type="date" defaultValue="2024-01-01" />
            <Input type="date" defaultValue="2024-03-28" />
            <select className="p-2 rounded-lg bg-secondary border border-border text-foreground">
              <option>All Strategies</option>
              <option>HAVWAP-Rev-v2</option>
              <option>Delta-Bucket-Trend</option>
            </select>
          </div>
        </Card>

        {/* Trade List */}
        <Card className="p-6 bg-gradient-card border-border shadow-card">
          <div className="space-y-2">
            {[
              { date: "2024-03-28", time: "14:32", symbol: "SPY 450C 03/28", strategy: "HAVWAP-Rev-v2", entry: "$6.20", exit: "$6.65", qty: "+2", pnl: "+$90", pnlPct: "+7.3%", positive: true, version: "v2.1" },
              { date: "2024-03-28", time: "11:15", symbol: "QQQ 370P 03/28", strategy: "Delta-Bucket-Trend", entry: "$3.80", exit: "$3.50", qty: "-1", pnl: "+$30", pnlPct: "+7.9%", positive: true, version: "v1.3" },
              { date: "2024-03-27", time: "15:42", symbol: "SPY 455C 03/29", strategy: "HAVWAP-Rev-v2", entry: "$2.50", exit: "$2.35", qty: "+3", pnl: "-$45", pnlPct: "-6.0%", positive: false, version: "v2.1" },
              { date: "2024-03-27", time: "13:28", symbol: "IWM 185C 03/29", strategy: "ATM-Scalp-v1", entry: "$1.85", exit: "$2.05", qty: "+5", pnl: "+$100", pnlPct: "+10.8%", positive: true, version: "v1.0" },
              { date: "2024-03-27", time: "10:05", symbol: "SPY 452P 03/27", strategy: "HAVWAP-Rev-v2", entry: "$5.20", exit: "$5.80", qty: "-2", pnl: "+$120", pnlPct: "+11.5%", positive: true, version: "v2.0" },
              { date: "2024-03-26", time: "14:55", symbol: "QQQ 375C 03/27", strategy: "Delta-Bucket-Trend", entry: "$4.35", exit: "$4.15", qty: "+1", pnl: "-$20", pnlPct: "-4.6%", positive: false, version: "v1.3" },
            ].map((trade, idx) => (
              <div key={idx} className="grid grid-cols-10 gap-3 p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all">
                <div>
                  <p className="text-xs text-muted-foreground">Date</p>
                  <p className="text-sm font-medium">{trade.date}</p>
                  <p className="text-xs text-muted-foreground">{trade.time}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Symbol</p>
                  <p className="text-sm font-medium">{trade.symbol}</p>
                  <Badge variant="outline" className="text-xs mt-1">{trade.qty}</Badge>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Strategy</p>
                  <p className="text-sm font-medium">{trade.strategy}</p>
                  <p className="text-xs text-muted-foreground">{trade.version}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Entry</p>
                  <p className="text-sm font-medium">{trade.entry}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Exit</p>
                  <p className="text-sm font-medium">{trade.exit}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">P&L</p>
                  <p className={`text-sm font-medium ${trade.positive ? "text-success" : "text-danger"}`}>
                    {trade.pnl}
                  </p>
                  <p className={`text-xs ${trade.positive ? "text-success" : "text-danger"}`}>
                    {trade.pnlPct}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm">
                    <Eye className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: "Total Trades", value: "147" },
            { label: "Win Rate", value: "64.2%" },
            { label: "Avg Win", value: "+$284" },
            { label: "Avg Loss", value: "-$142" },
          ].map((stat) => (
            <Card key={stat.label} className="p-4 bg-gradient-card border-border shadow-card">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className="text-2xl font-bold mt-1">{stat.value}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};

export default History;
