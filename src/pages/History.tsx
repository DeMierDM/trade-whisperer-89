import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, Download, Eye, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: string;
  filled_avg_price: string;
  status: string;
  filled_at: string;
  type: string;
}

const History = () => {
  const { toast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      console.log('Fetching order history...');
      
      const { data, error } = await supabase.functions.invoke("fetch-market-data", {
        body: { dataType: "orders" },
      });

      console.log('Orders response:', data);
      console.log('Orders error:', error);

      if (error) {
        console.error('Orders error:', error);
        throw error;
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      if (data?.data && Array.isArray(data.data)) {
        console.log('Orders received:', data.data.length);
        setOrders(data.data);
      } else {
        console.warn('No orders data in response');
        setOrders([]);
      }
    } catch (error: any) {
      console.error('Error fetching order history:', error);
      toast({
        title: "Error fetching order history",
        description: error.message || 'Failed to fetch order history. Check console for details.',
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    if (searchTerm && !order.symbol.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    
    if (startDate) {
      const orderDate = new Date(order.filled_at);
      if (orderDate < new Date(startDate)) return false;
    }
    
    if (endDate) {
      const orderDate = new Date(order.filled_at);
      if (orderDate > new Date(endDate)) return false;
    }
    
    return true;
  });

  const calculateStats = () => {
    const trades: { [key: string]: Order[] } = {};
    
    filteredOrders.forEach(order => {
      if (!trades[order.symbol]) trades[order.symbol] = [];
      trades[order.symbol].push(order);
    });

    let totalPnL = 0;
    let wins = 0;
    let losses = 0;
    let totalWinAmount = 0;
    let totalLossAmount = 0;

    Object.values(trades).forEach(symbolOrders => {
      symbolOrders.sort((a, b) => 
        new Date(a.filled_at).getTime() - new Date(b.filled_at).getTime()
      );
      
      for (let i = 0; i < symbolOrders.length - 1; i += 2) {
        const entry = symbolOrders[i];
        const exit = symbolOrders[i + 1];
        
        if (entry && exit && entry.status === 'filled' && exit.status === 'filled') {
          const entryPrice = parseFloat(entry.filled_avg_price);
          const exitPrice = parseFloat(exit.filled_avg_price);
          const qty = parseFloat(entry.qty);
          
          const pnl = entry.side === 'buy' 
            ? (exitPrice - entryPrice) * qty
            : (entryPrice - exitPrice) * qty;
          
          totalPnL += pnl;
          if (pnl > 0) {
            wins++;
            totalWinAmount += pnl;
          } else if (pnl < 0) {
            losses++;
            totalLossAmount += Math.abs(pnl);
          }
        }
      }
    });

    return {
      totalTrades: wins + losses,
      winRate: wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0,
      avgWin: wins > 0 ? totalWinAmount / wins : 0,
      avgLoss: losses > 0 ? totalLossAmount / losses : 0,
    };
  };

  const stats = calculateStats();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

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
              <Input 
                placeholder="Search symbol..." 
                className="pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input 
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <Button onClick={fetchOrders} className="w-full">
              Refresh
            </Button>
          </div>
        </Card>

        {/* Trade List */}
        <Card className="p-6 bg-gradient-card border-border shadow-card">
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No orders found
              </div>
            ) : (
              filteredOrders.map((order) => (
                <div key={order.id} className="grid grid-cols-7 gap-3 p-4 rounded-lg bg-secondary/50 border border-border hover:bg-secondary transition-all">
                  <div>
                    <p className="text-xs text-muted-foreground">Symbol</p>
                    <p className="text-sm font-medium">{order.symbol}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Side</p>
                    <Badge variant={order.side === 'buy' ? 'default' : 'secondary'}>
                      {order.side.toUpperCase()}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Qty</p>
                    <p className="text-sm font-medium">{order.qty}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Price</p>
                    <p className="text-sm font-medium">${parseFloat(order.filled_avg_price).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge variant="outline">{order.status}</Badge>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground">Time</p>
                    <p className="text-sm">
                      {order.filled_at ? new Date(order.filled_at).toLocaleString() : '-'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <p className="text-sm text-muted-foreground">Total Trades</p>
            <p className="text-2xl font-bold mt-1">{stats.totalTrades}</p>
          </Card>
          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <p className="text-2xl font-bold mt-1">{stats.winRate.toFixed(1)}%</p>
          </Card>
          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <p className="text-sm text-muted-foreground">Avg Win</p>
            <p className="text-2xl font-bold mt-1 text-success">+${stats.avgWin.toFixed(2)}</p>
          </Card>
          <Card className="p-4 bg-gradient-card border-border shadow-card">
            <p className="text-sm text-muted-foreground">Avg Loss</p>
            <p className="text-2xl font-bold mt-1 text-danger">-${stats.avgLoss.toFixed(2)}</p>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default History;
