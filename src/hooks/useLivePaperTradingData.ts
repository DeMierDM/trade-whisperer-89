import { useState, useEffect, useRef } from 'react';
import { ChartBar } from '@/lib/timeUtils';

interface LiveChartDataHook {
  bars: ChartBar[];
  currentPrice: number | null;
  updateBar: (bar: ChartBar) => void;
  addSignal: (signal: LiveSignal) => void;
  addPosition: (position: LivePosition) => void;
  addTrade: (trade: LiveTrade) => void;
}

interface LiveSignal {
  id: number;
  bot_id: number;
  timestamp: string;
  signal_type: 'BUY_CALL' | 'BUY_PUT';
  underlying_symbol: string;
  underlying_price: number;
  signal_strength: number;
  signal_reason: string;
  executed: boolean;
  position_id?: number;
}

interface LivePosition {
  id: number;
  bot_id: number;
  contract_symbol: string;
  underlying_symbol: string;
  option_type: 'call' | 'put';
  strike_price: number;
  expiry_date: string;
  quantity: number;
  entry_price: number;
  current_price: number;
  entry_time: string;
  entry_signal_type: string;
  signal_strength: number;
  signal_reason: string;
  underlying_price_at_entry: number;
  profit_target_price?: number;
  stop_loss_price?: number;
  max_hold_until?: string;
  status: 'open' | 'closed';
  unrealized_pnl: number;
}

interface LiveTrade {
  id: number;
  bot_id: number;
  position_id: number;
  contract_symbol: string;
  underlying_symbol: string;
  option_type: 'call' | 'put';
  strike_price: number;
  expiry_date: string;
  quantity: number;
  entry_price: number;
  exit_price: number;
  entry_time: string;
  exit_time: string;
  entry_signal_type: string;
  signal_strength: number;
  signal_reason: string;
  exit_reason: string;
  gross_pnl: number;
  commission: number;
  net_pnl: number;
  return_pct: number;
  underlying_price_entry: number;
  underlying_price_exit: number;
  duration_minutes: number;
}

export function useLivePaperTradingData(symbol: string): LiveChartDataHook & {
  signals: LiveSignal[];
  positions: LivePosition[];
  trades: LiveTrade[];
} {
  const [bars, setBars] = useState<ChartBar[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const [positions, setPositions] = useState<LivePosition[]>([]);
  const [trades, setTrades] = useState<LiveTrade[]>([]);
  const barsRef = useRef<Map<number, ChartBar>>(new Map());

  // Fetch initial historical data
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Fetch historical bars from WebSocket-stored data (last 24 hours)
        const response = await fetch(`http://localhost:3005/api/historical/${symbol}?period=1d&timeframe=1m`);
        if (response.ok) {
          const historicalData = await response.json();
          if (historicalData.bars && Array.isArray(historicalData.bars)) {
            // Convert the data to our ChartBar format
            const chartBars: ChartBar[] = historicalData.bars.map((bar: any) => ({
              timestamp: new Date(bar.timestamp).getTime() / 1000, // Convert to Unix timestamp
              open: parseFloat(bar.open),
              high: parseFloat(bar.high),
              low: parseFloat(bar.low),
              close: parseFloat(bar.close),
              volume: bar.volume || 0
            }));
            
            setBars(chartBars);
            
            // Initialize bars map for quick updates
            barsRef.current.clear();
            chartBars.forEach((bar: ChartBar) => {
              barsRef.current.set(bar.timestamp, bar);
            });

            // Set initial current price
            const lastBar = chartBars[chartBars.length - 1];
            if (lastBar) {
              setCurrentPrice(lastBar.close);
            }
            
            console.log(`📊 Loaded ${chartBars.length} historical bars for ${symbol} from WebSocket data`);
          }
        }

        // Fetch existing signals from paper trading service
        const signalsResponse = await fetch('http://localhost:3005/api/signals');
        if (signalsResponse.ok) {
          const signalsData = await signalsResponse.json();
          setSignals(signalsData);
        }

        // Fetch existing positions
        const positionsResponse = await fetch('http://localhost:3005/api/positions');
        if (positionsResponse.ok) {
          const positionsData = await positionsResponse.json();
          setPositions(positionsData);
        }

        // Fetch recent trades
        const tradesResponse = await fetch('http://localhost:3005/api/trades?limit=100');
        if (tradesResponse.ok) {
          const tradesData = await tradesResponse.json();
          setTrades(tradesData);
        }
      } catch (error) {
        console.error('Error fetching initial live chart data:', error);
      }
    };

    if (symbol) {
      fetchInitialData();
    }
  }, [symbol]);

  const updateBar = (newBar: ChartBar) => {
    const timestamp = typeof newBar.timestamp === 'number' ? newBar.timestamp : Number(newBar.timestamp);
    
    setBars(prevBars => {
      // Check if this bar already exists
      const existingBar = barsRef.current.get(timestamp);
      
      if (existingBar) {
        // Update existing bar
        barsRef.current.set(timestamp, newBar);
        return prevBars.map(bar => 
          (typeof bar.timestamp === 'number' ? bar.timestamp : Number(bar.timestamp)) === timestamp 
            ? newBar 
            : bar
        );
      } else {
        // Add new bar
        barsRef.current.set(timestamp, newBar);
        return [...prevBars, newBar].sort((a, b) => {
          const aTime = typeof a.timestamp === 'number' ? a.timestamp : Number(a.timestamp);
          const bTime = typeof b.timestamp === 'number' ? b.timestamp : Number(b.timestamp);
          return aTime - bTime;
        });
      }
    });

    // Update current price
    setCurrentPrice(newBar.close);
  };

  const addSignal = (signal: LiveSignal) => {
    setSignals(prev => [...prev, signal].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ));
  };

  const addPosition = (position: LivePosition) => {
    setPositions(prev => {
      const existing = prev.find(p => p.id === position.id);
      if (existing) {
        return prev.map(p => p.id === position.id ? position : p);
      }
      return [...prev, position];
    });
  };

  const addTrade = (trade: LiveTrade) => {
    setTrades(prev => [...prev, trade].sort((a, b) => 
      new Date(b.exit_time).getTime() - new Date(a.exit_time).getTime()
    ));

    // Remove corresponding position when trade is completed
    setPositions(prev => prev.filter(p => p.id !== trade.position_id));
  };

  return {
    bars,
    currentPrice,
    signals,
    positions,
    trades,
    updateBar,
    addSignal,
    addPosition,
    addTrade,
  };
}