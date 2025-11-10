import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, TrendingDown, DollarSign, Target, BarChart3, Activity } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface BacktestMetrics {
  id: number;
  strategy_name: string;
  symbol: string;
  start_date: string;
  end_date: string;
  initial_capital: number;
  final_capital: number;
  total_return: number;
  sharpe_ratio: number;
  sortino_ratio: number;
  max_drawdown: number;
  max_drawdown_duration_minutes: number;
  win_rate: number;
  profit_factor: number;
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  avg_win: number;
  avg_loss: number;
  largest_win: number;
  largest_loss: number;
  avg_holding_period_minutes: number;
  status: string;
}

interface Trade {
  id: number;
  contract_symbol: string;
  option_type: string;
  strike_price: string | number;
  entry_timestamp: string;
  exit_timestamp: string;
  entry_price: string | number;
  exit_price: string | number;
  quantity: number;
  net_pnl: string | number;
  return_pct: string | number;
  entry_delta: string | number;
  exit_delta: string | number;
  entry_underlying_price?: string | number;
  exit_underlying_price?: string | number;
  underlying_symbol?: string;
  expiry_date?: string;
  entry_gamma?: string | number;
  entry_theta?: string | number;
  entry_vega?: string | number;
  entry_rho?: string | number;
  entry_iv?: string | number;
}

interface BacktestResultsProps {
  metrics: BacktestMetrics | null;
  trades: Trade[];
  loading: boolean;
}

export function BacktestResults({ metrics, trades, loading }: BacktestResultsProps) {
  // Debug logging
  console.log('[BacktestResults] Rendering with:', { 
    hasMetrics: !!metrics, 
    tradesCount: Array.isArray(trades) ? trades.length : 'not an array',
    tradesType: typeof trades,
    loading 
  });

  // Helper function to safely convert string/number to number
  const toNumber = (value: string | number | undefined): number => {
    if (value === undefined || value === null) return 0;
    return typeof value === 'string' ? parseFloat(value) : value;
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Running backtest...</p>
          </div>
        </div>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No backtest results yet. Configure and run a backtest to see results.</p>
        </div>
      </Card>
    );
  }

  // Safety check for trades array
  const safeTrades = Array.isArray(trades) ? trades : [];
  
  if (safeTrades.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Backtest completed but no trades were executed. Try adjusting your strategy parameters.</p>
        </div>
      </Card>
    );
  }

  const profitDollars = toNumber(metrics.final_capital) - toNumber(metrics.initial_capital);
  const isProfit = profitDollars >= 0;

  // Calculate equity curve from trades
  const equityCurve = safeTrades.reduce((acc, trade, index) => {
    const prevEquity = index === 0 ? toNumber(metrics.initial_capital) : acc[index - 1].equity;
    acc.push({
      trade: index + 1,
      equity: prevEquity + toNumber(trade.net_pnl),
      pnl: toNumber(trade.net_pnl),
      timestamp: trade.exit_timestamp
    });
    return acc;
  }, [] as any[]);

  // Calculate hourly performance
  const hourlyPerformance = safeTrades.reduce((acc, trade) => {
    const hour = new Date(trade.entry_timestamp).getHours();
    if (!acc[hour]) {
      acc[hour] = { hour, trades: 0, wins: 0, totalPnl: 0 };
    }
    acc[hour].trades++;
    if (toNumber(trade.net_pnl) > 0) acc[hour].wins++;
    acc[hour].totalPnl += toNumber(trade.net_pnl);
    return acc;
  }, {} as any);

  const hourlyData = Object.values(hourlyPerformance).sort((a: any, b: any) => a.hour - b.hour);

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Return</p>
              <p className={`text-2xl font-bold ${isProfit ? 'text-green-500' : 'text-red-500'}`}>
                {(toNumber(metrics.total_return) * 100).toFixed(2)}%
              </p>
              <p className="text-xs text-muted-foreground">${profitDollars.toFixed(2)}</p>
            </div>
            {isProfit ? <TrendingUp className="h-8 w-8 text-green-500" /> : <TrendingDown className="h-8 w-8 text-red-500" />}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Sharpe Ratio</p>
              <p className="text-2xl font-bold">{toNumber(metrics.sharpe_ratio).toFixed(3)}</p>
              <p className="text-xs text-muted-foreground">Sortino: {metrics.sortino_ratio ? toNumber(metrics.sortino_ratio).toFixed(3) : 'N/A'}</p>
            </div>
            <Activity className="h-8 w-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold">{(toNumber(metrics.win_rate) * 100).toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">{metrics.winning_trades}W / {metrics.losing_trades}L</p>
            </div>
            <Target className="h-8 w-8 text-purple-500" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Profit Factor</p>
              <p className="text-2xl font-bold">{toNumber(metrics.profit_factor).toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">Avg Hold: {metrics.avg_holding_period_minutes ? toNumber(metrics.avg_holding_period_minutes).toFixed(0) : 'N/A'}m</p>
            </div>
            <DollarSign className="h-8 w-8 text-green-500" />
          </div>
        </Card>
      </div>

      {/* Detailed Metrics */}
      <Card className="p-6">
        <Tabs defaultValue="performance">
          <TabsList>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="trades">Trades ({metrics.total_trades})</TabsTrigger>
            <TabsTrigger value="hourly">Hourly Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Equity Curve */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Equity Curve</h3>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={equityCurve}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="trade" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
                    <Area type="monotone" dataKey="equity" stroke="#8884d8" fill="#8884d8" fillOpacity={0.3} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Risk Metrics */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Risk Metrics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Max Drawdown</span>
                    <Badge variant="destructive">{(toNumber(metrics.max_drawdown) * 100).toFixed(2)}%</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Drawdown Duration</span>
                    <Badge variant="secondary">{metrics.max_drawdown_duration_minutes || 'N/A'} min</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Average Win</span>
                    <Badge variant="default" className="bg-green-500">${toNumber(metrics.avg_win).toFixed(2)}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Average Loss</span>
                    <Badge variant="destructive">${Math.abs(toNumber(metrics.avg_loss)).toFixed(2)}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Largest Win</span>
                    <Badge variant="default" className="bg-green-600">${metrics.largest_win ? toNumber(metrics.largest_win).toFixed(2) : 'N/A'}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Largest Loss</span>
                    <Badge variant="destructive">${metrics.largest_loss ? Math.abs(toNumber(metrics.largest_loss)).toFixed(2) : 'N/A'}</Badge>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="trades">
            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Entry Time</TableHead>
                    <TableHead>Entry Px</TableHead>
                    <TableHead>Exit Px</TableHead>
                    <TableHead>Delta</TableHead>
                    <TableHead>P&L</TableHead>
                    <TableHead>Return %</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {safeTrades.map((trade, index) => (
                    <TableRow key={trade.id} className={toNumber(trade.net_pnl) > 0 ? 'bg-green-500/10' : 'bg-red-500/10'}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{trade.contract_symbol}</TableCell>
                      <TableCell>
                        <Badge variant={trade.option_type === 'CALL' ? 'default' : 'secondary'}>
                          {trade.option_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {new Date(trade.entry_timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>${toNumber(trade.entry_price).toFixed(2)}</TableCell>
                      <TableCell>${toNumber(trade.exit_price).toFixed(2)}</TableCell>
                      <TableCell>{toNumber(trade.entry_delta).toFixed(3)}</TableCell>
                      <TableCell className={toNumber(trade.net_pnl) > 0 ? 'text-green-500 font-semibold' : 'text-red-500 font-semibold'}>
                        ${toNumber(trade.net_pnl).toFixed(2)}
                      </TableCell>
                      <TableCell className={toNumber(trade.return_pct) > 0 ? 'text-green-500' : 'text-red-500'}>
                        {(toNumber(trade.return_pct) * 100).toFixed(1)}%
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="hourly">
            <div>
              <h3 className="text-lg font-semibold mb-4">Performance by Hour</h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="hour" tickFormatter={(hour) => `${hour}:00`} />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: any, name: string) => {
                      if (name === 'totalPnl') return [`$${value.toFixed(2)}`, 'Total P&L'];
                      return [value, name];
                    }}
                    labelFormatter={(hour) => `${hour}:00 - ${hour}:59`}
                  />
                  <Area type="monotone" dataKey="totalPnl" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-5 gap-2">
                {hourlyData.map((hourData: any) => (
                  <Card key={hourData.hour} className="p-3">
                    <p className="text-xs text-muted-foreground">Hour {hourData.hour}</p>
                    <p className="text-lg font-bold">{hourData.trades} trades</p>
                    <p className="text-xs">{((hourData.wins / hourData.trades) * 100).toFixed(0)}% win</p>
                    <p className={`text-sm font-semibold ${hourData.totalPnl > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      ${hourData.totalPnl.toFixed(0)}
                    </p>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
