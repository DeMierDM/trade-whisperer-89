import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Loader2, Activity } from "lucide-react";

interface DataFlowDebugPanelProps {
  wsConnected: boolean;
  quotesCount: number;
  tradesCount: number;
  barsCount: number;
  optionsCount: number;
  marketStatus: string;
  latestQuote?: { symbol: string; bid: number; ask: number };
  latestTrade?: { symbol: string; price: number; timestamp: string };
}

export const DataFlowDebugPanel = ({
  wsConnected,
  quotesCount,
  tradesCount,
  barsCount,
  optionsCount,
  marketStatus,
  latestQuote,
  latestTrade,
}: DataFlowDebugPanelProps) => {
  return (
    <Card className="p-4 bg-gradient-card border-border shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Live Data Flow Monitor
        </h3>
        <Badge variant={marketStatus === "open" ? "default" : "secondary"} className="text-xs">
          {marketStatus}
        </Badge>
      </div>

      <div className="space-y-3 text-xs">
        {/* WebSocket Status */}
        <div className="flex items-center justify-between p-2 rounded bg-background/50 border border-border">
          <span className="text-muted-foreground">WebSocket Connection</span>
          <div className="flex items-center gap-2">
            {wsConnected ? (
              <>
                <CheckCircle className="w-4 h-4 text-success" />
                <span className="text-success font-medium">Connected</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-danger" />
                <span className="text-danger font-medium">Disconnected</span>
              </>
            )}
          </div>
        </div>

        {/* Real-time Quotes */}
        <div className="flex items-center justify-between p-2 rounded bg-background/50 border border-border">
          <span className="text-muted-foreground">Live Quotes Received</span>
          <Badge variant="outline" className="font-mono">
            {quotesCount}
          </Badge>
        </div>

        {/* Latest Quote */}
        {latestQuote && (
          <div className="p-2 rounded bg-success/5 border border-success/20">
            <div className="text-muted-foreground mb-1">Latest Quote: {latestQuote.symbol}</div>
            <div className="font-mono text-success">
              Bid: ${latestQuote.bid.toFixed(2)} | Ask: ${latestQuote.ask.toFixed(2)}
            </div>
          </div>
        )}

        {/* Real-time Trades */}
        <div className="flex items-center justify-between p-2 rounded bg-background/50 border border-border">
          <span className="text-muted-foreground">Live Trades Received</span>
          <Badge variant="outline" className="font-mono">
            {tradesCount}
          </Badge>
        </div>

        {/* Latest Trade */}
        {latestTrade && (
          <div className="p-2 rounded bg-primary/5 border border-primary/20">
            <div className="text-muted-foreground mb-1">Latest Trade: {latestTrade.symbol}</div>
            <div className="font-mono text-primary">
              ${latestTrade.price.toFixed(2)} @ {new Date(latestTrade.timestamp).toLocaleTimeString()}
            </div>
          </div>
        )}

        {/* Historical Bars */}
        <div className="flex items-center justify-between p-2 rounded bg-background/50 border border-border">
          <span className="text-muted-foreground">Historical Bars Loaded</span>
          <Badge variant="outline" className="font-mono">
            {barsCount}
          </Badge>
        </div>

        {/* Options Contracts */}
        <div className="flex items-center justify-between p-2 rounded bg-background/50 border border-border">
          <span className="text-muted-foreground">Options Contracts</span>
          <Badge variant="outline" className="font-mono">
            {optionsCount}
          </Badge>
        </div>

        {/* Data Pipeline Status */}
        <div className="pt-2 mt-2 border-t border-border">
          <div className="text-muted-foreground mb-2">Data Pipeline:</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {wsConnected ? (
                <CheckCircle className="w-3 h-3 text-success" />
              ) : (
                <Loader2 className="w-3 h-3 animate-spin text-warning" />
              )}
              <span className="text-xs">WebSocket → Quote Stream</span>
            </div>
            <div className="flex items-center gap-2">
              {barsCount > 0 ? (
                <CheckCircle className="w-3 h-3 text-success" />
              ) : (
                <Loader2 className="w-3 h-3 animate-spin text-warning" />
              )}
              <span className="text-xs">REST API → Historical Bars</span>
            </div>
            <div className="flex items-center gap-2">
              {optionsCount > 0 ? (
                <CheckCircle className="w-3 h-3 text-success" />
              ) : (
                <Loader2 className="w-3 h-3 animate-spin text-warning" />
              )}
              <span className="text-xs">REST API → Options Chain</span>
            </div>
            <div className="flex items-center gap-2">
              {tradesCount > 0 ? (
                <CheckCircle className="w-3 h-3 text-success" />
              ) : (
                <XCircle className="w-3 h-3 text-muted-foreground" />
              )}
              <span className="text-xs">Trades → Chart Updates</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
