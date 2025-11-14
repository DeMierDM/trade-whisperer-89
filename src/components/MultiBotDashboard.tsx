import React, { useEffect, useState, useCallback } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Play, 
  Pause, 
  Square, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Target,
  Activity,
  BarChart3,
  Settings,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Zap
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import "../styles/multibot.css";

interface BotPerformance {
  botId: number;
  name: string;
  symbol: string;
  strategy: string;
  status: string;
  riskLevel: string;
  allocation: number;
  initialCapital: number;
  currentCapital: number;
  capitalChange: number;
  capitalChangePercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  avgTradeReturn: number;
  bestTrade: number;
  worstTrade: number;
  todayTrades: number;
  todayPnL: number;
  openPositions: number;
  maxPositions: number;
  recentTrades: any[];
  createdAt: string;
  startedAt: string;
  lastUpdated: string;
}

interface DashboardSummary {
  totalCapital: number;
  totalBots: number;
  activeBots: number;
  totalAllocated: number;
  totalPnL: number;
  todayPnL: number;
  overallWinRate: number;
}

interface MultiBotDashboard {
  summary: DashboardSummary;
  bots: BotPerformance[];
}

const MultiBotDashboard: React.FC = () => {
  const { toast } = useToast();
  const [dashboard, setDashboard] = useState<MultiBotDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      console.log('📊 [MULTI-BOT] Fetching dashboard data...');
      
      const response = await fetch('http://localhost:3005/api/multi-bot/dashboard');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data: MultiBotDashboard = await response.json();
      setDashboard(data);
      setLastUpdate(new Date());
      
      console.log(`📊 [MULTI-BOT] Dashboard updated: ${data.bots.length} bots, $${data.summary.totalPnL.toFixed(2)} P&L`);

    } catch (error: any) {
      console.error('📊 [MULTI-BOT] Dashboard error:', error);
      toast({
        title: 'Dashboard Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Start all bots
  const startAllBots = useCallback(async () => {
    try {
      console.log('🚀 [MULTI-BOT] Starting all bots...');
      
      const response = await fetch('http://localhost:3005/api/multi-bot/start-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      toast({
        title: '🚀 Bots Started',
        description: `Successfully started ${result.results.length} bots`,
      });

      // Refresh dashboard
      await fetchDashboard();

    } catch (error: any) {
      console.error('🚀 [MULTI-BOT] Start error:', error);
      toast({
        title: 'Start Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [fetchDashboard, toast]);

  // Stop all bots
  const stopAllBots = useCallback(async () => {
    try {
      console.log('🛑 [MULTI-BOT] Stopping all bots...');
      
      const response = await fetch('http://localhost:3005/api/multi-bot/stop-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      toast({
        title: '🛑 Bots Stopped',
        description: result.message,
      });

      // Refresh dashboard
      await fetchDashboard();

    } catch (error: any) {
      console.error('🛑 [MULTI-BOT] Stop error:', error);
      toast({
        title: 'Stop Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [fetchDashboard, toast]);

  // Generate end-of-day report
  const generateReport = useCallback(async () => {
    try {
      console.log('📈 [MULTI-BOT] Generating end-of-day report...');
      
      const response = await fetch('http://localhost:3005/api/multi-bot/reports/end-of-day', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const report = await response.json();
      
      toast({
        title: '📈 Report Generated',
        description: `End-of-day report for ${report.reportDate} created successfully`,
      });

      console.log('📈 [MULTI-BOT] Report:', report);

    } catch (error: any) {
      console.error('📈 [MULTI-BOT] Report error:', error);
      toast({
        title: 'Report Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Auto-refresh effect
  useEffect(() => {
    fetchDashboard();

    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchDashboard();
      }, 10000); // Refresh every 10 seconds

      return () => clearInterval(interval);
    }
  }, [fetchDashboard, autoRefresh]);

  // Helper functions
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercent = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel.toLowerCase()) {
      case 'conservative':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'moderate':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'aggressive':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'stopped':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  if (!dashboard) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Loading multi-bot dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Multi-Bot Trading Dashboard</h1>
          <p className="text-muted-foreground">
            Manage multiple paper trading bots with individual strategies and allocations
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`w-4 h-4 mr-2 ${autoRefresh ? 'text-green-500' : 'text-gray-500'}`} />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          
          <Button variant="outline" size="sm" onClick={fetchDashboard} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <Button variant="outline" size="sm" onClick={generateReport}>
            <BarChart3 className="w-4 h-4 mr-2" />
            Generate Report
          </Button>

          <Button variant="default" size="sm" onClick={startAllBots}>
            <Play className="w-4 h-4 mr-2" />
            Start All
          </Button>

          <Button variant="destructive" size="sm" onClick={stopAllBots}>
            <Square className="w-4 h-4 mr-2" />
            Stop All
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Capital</p>
              <p className="text-2xl font-bold">{formatCurrency(dashboard.summary.totalCapital)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total P&L</p>
              <p className={`text-2xl font-bold ${dashboard.summary.totalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {formatCurrency(dashboard.summary.totalPnL)}
              </p>
            </div>
            {dashboard.summary.totalPnL >= 0 ? (
              <TrendingUp className="w-8 h-8 text-green-500" />
            ) : (
              <TrendingDown className="w-8 h-8 text-red-500" />
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Bots</p>
              <p className="text-2xl font-bold">
                {dashboard.summary.activeBots} / {dashboard.summary.totalBots}
              </p>
            </div>
            <Zap className="w-8 h-8 text-blue-500" />
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold">{formatPercent(dashboard.summary.overallWinRate)}</p>
            </div>
            <Target className="w-8 h-8 text-purple-500" />
          </div>
        </Card>
      </div>

      {/* Bot Performance Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {dashboard.bots.map((bot) => (
          <Card key={bot.botId} className="p-6">
            {/* Bot Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  {getStatusIcon(bot.status)}
                  {bot.name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {bot.symbol} • {bot.strategy}
                </p>
              </div>
              <Badge className={getRiskLevelColor(bot.riskLevel)}>
                {bot.riskLevel}
              </Badge>
            </div>

            {/* Allocation Progress */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Allocation</span>
                <span className="text-sm text-muted-foreground">
                  {bot.allocation.toFixed(1)}%
                </span>
              </div>
              <Progress value={bot.allocation} className="h-2" />
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="text-center p-3 bg-muted/50 rounded">
                <p className="text-xs text-muted-foreground">Capital</p>
                <p className="font-semibold">{formatCurrency(bot.currentCapital)}</p>
                <p className={`text-xs ${bot.capitalChangePercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatPercent(bot.capitalChangePercent)}
                </p>
              </div>
              
              <div className="text-center p-3 bg-muted/50 rounded">
                <p className="text-xs text-muted-foreground">Today P&L</p>
                <p className={`font-semibold ${bot.todayPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {formatCurrency(bot.todayPnL)}
                </p>
                <p className="text-xs text-muted-foreground">{bot.todayTrades} trades</p>
              </div>
            </div>

            {/* Trade Statistics */}
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div>
                <p className="text-muted-foreground">Trades</p>
                <p className="font-medium">{bot.totalTrades}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Win Rate</p>
                <p className="font-medium">{bot.winRate.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">Positions</p>
                <p className="font-medium">{bot.openPositions}/{bot.maxPositions}</p>
              </div>
            </div>

            {/* Recent Activity */}
            {bot.recentTrades.length > 0 && (
              <div className="mt-4 pt-4 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-2">Recent Trades</p>
                <div className="space-y-1">
                  {bot.recentTrades.slice(0, 2).map((trade, index) => (
                    <div key={index} className="flex items-center justify-between text-xs">
                      <span>{trade.symbol} {trade.side}</span>
                      <span className={trade.pnl >= 0 ? 'text-green-500' : 'text-red-500'}>
                        {formatCurrency(trade.pnl)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-4 pt-4 border-t">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  <Settings className="w-3 h-3 mr-1" />
                  Config
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  <BarChart3 className="w-3 h-3 mr-1" />
                  Details
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Footer Info */}
      {lastUpdate && (
        <div className="text-center text-sm text-muted-foreground">
          Last updated: {lastUpdate.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default MultiBotDashboard;