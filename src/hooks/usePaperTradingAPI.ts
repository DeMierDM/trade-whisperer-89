/**
 * Paper Trading API hook - connects to the paper trading service
 */

import { useState, useEffect, useMemo } from 'react';
import { useToast } from '@/hooks/use-toast';

const PAPER_TRADING_API_URL = import.meta.env.VITE_PAPER_TRADING_API_URL || 'http://localhost:3005';

export interface PaperTradingBot {
  id: number; // Fixed: API returns bot_id as number
  name: string;
  strategy: string; // Maps to strategy_name from API
  symbol: string;
  parameters: Record<string, any>;
  status: 'active' | 'stopped' | 'error' | 'running'; // Added 'running' status
  created_at: string;
  started_at?: string;
  stopped_at?: string;
  total_trades: number;
  winning_trades: number;
  total_pnl: number;
  current_positions: number;
  last_signal_at?: string;
}

export interface BotPosition {
  position_id: number;
  bot_id: number;
  symbol: string;
  option_symbol: string;
  position_type: string;
  quantity: number;
  entry_price: number;
  exit_price?: number;
  entry_time: string;
  exit_time?: string;
  exit_reason?: string;
  pnl?: number;
  status: 'open' | 'closed';
  signal_reason?: string;
  signal_strength?: number;
}

export interface BotPerformance {
  total_trades: number;
  winning_trades: number;
  losing_trades: number;
  win_rate: number;
  total_pnl: number;
  avg_pnl: number;
  best_trade: number;
  worst_trade: number;
  open_positions: number;
}

export interface TradingSignal {
  signal_id: number;
  bot_id: number;
  symbol: string;
  signal_type: string;
  signal_strength: number;
  underlying_price: number;
  signal_reason: string;
  target_delta: number;
  rsi_value?: number;
  vwap_value?: number;
  timestamp: string;
  bot_name?: string;
}

export interface Strategy {
  name: string;
  displayName: string;
  description: string;
  symbols: string[];
  riskLevel: string;
  loaded: boolean;
  error?: string;
}

export interface PaperTradingPosition {
  id: string;
  contract_symbol: string;
  side: 'long' | 'short';
  quantity: number;
  avg_fill_price: number;
  unrealized_pnl: number;
  created_at: string;
}

export interface PaperTradingTrade {
  id: string;
  contract_symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  timestamp: string;
  reason?: string;
}

export interface PaperTradingMetrics {
  total_value: number;
  daily_pnl: number;
  win_rate: number;
  total_trades: number;
}

export function usePaperTradingAPI() {
  const { toast } = useToast();
  const [bots, setBots] = useState<PaperTradingBot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state for active bots
  const activeBots = useMemo(() => {
    return bots.filter(bot => bot.status === 'active' || bot.status === 'running');
  }, [bots]);

  const apiCall = async (endpoint: string, options: RequestInit = {}) => {
    try {
      const response = await fetch(`${PAPER_TRADING_API_URL}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
        ...options,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Paper Trading API error for ${endpoint}:`, error);
      throw error;
    }
  };

  const getStrategies = async (): Promise<Strategy[]> => {
    return await apiCall('/api/strategies');
  };

  // Fetch and refresh bots data
  const fetchBots = async () => {
    setLoading(true);
    setError(null);
    try {
      const botsData = await apiCall('/api/bots');
      const mappedBots = botsData.map((bot: any) => ({
        id: bot.bot_id || bot.id, // Handle both bot_id and id
        name: bot.name,
        strategy: bot.strategy_name || bot.strategy, // Map strategy_name to strategy
        symbol: bot.symbol,
        parameters: bot.parameters || {},
        status: bot.status,
        created_at: bot.created_at,
        started_at: bot.started_at,
        stopped_at: bot.stopped_at,
        total_trades: bot.total_trades || 0,
        winning_trades: bot.winning_trades || 0,
        total_pnl: bot.total_pnl || 0,
        current_positions: bot.current_positions || 0,
        last_signal_at: bot.last_signal_at,
      }));
      setBots(mappedBots);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch bots';
      setError(errorMessage);
      console.error('Error fetching bots:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchBots();
  }, []);

  const getBots = async (): Promise<PaperTradingBot[]> => {
    const bots = await apiCall('/api/bots');
    // Map API response to expected interface
    return bots.map((bot: any) => ({
      id: bot.bot_id || bot.id, // Handle both bot_id and id
      name: bot.name,
      strategy: bot.strategy_name || bot.strategy, // Map strategy_name to strategy
      symbol: bot.symbol,
      parameters: bot.parameters || {},
      status: bot.status,
      created_at: bot.created_at,
      started_at: bot.started_at,
      stopped_at: bot.stopped_at,
      total_trades: bot.total_trades || 0,
      winning_trades: bot.winning_trades || 0,
      total_pnl: bot.total_pnl || 0,
      current_positions: bot.current_positions || 0,
      last_signal_at: bot.last_signal_at,
    }));
  };

  const createBot = async (botConfig: {
    name: string;
    strategy: string; // Accept 'strategy' but map to 'strategy_name'
    symbol: string;
    parameters?: Record<string, any>;
    position_size?: number;
    max_positions?: number;
    stop_loss?: number;
    take_profit?: number;
  }): Promise<{ bot_id: number; message: string }> => {
    // Map frontend config to API format
    const apiConfig = {
      name: botConfig.name,
      strategy_name: botConfig.strategy, // Map strategy to strategy_name
      symbol: botConfig.symbol,
      parameters: {
        accountSize: botConfig.position_size || 10000,
        maxPositions: botConfig.max_positions || 5,
        rsiPeriod: 14,
        profitTarget: (botConfig.take_profit || 50) / 100, // Convert percentage to decimal
        stopLoss: (botConfig.stop_loss || 20) / 100, // Convert percentage to decimal
        ...botConfig.parameters,
      },
    };
    
    const result = await apiCall('/api/bots', {
      method: 'POST',
      body: JSON.stringify(apiConfig),
    });
    
    // Refresh bots list after creation
    await fetchBots();
    return result;
  };

  const startBot = async (botId: number): Promise<{ message: string }> => {
    const result = await apiCall(`/api/bots/${botId}/start`, {
      method: 'POST',
    });
    // Refresh bots list after starting
    await fetchBots();
    return result;
  };

  const stopBot = async (botId: number): Promise<{ message: string }> => {
    const result = await apiCall(`/api/bots/${botId}/stop`, {
      method: 'POST',
    });
    // Refresh bots list after stopping
    await fetchBots();
    return result;
  };

  const getBotPerformance = async (botId: number): Promise<BotPerformance> => {
    return await apiCall(`/api/bots/${botId}/performance`);
  };

  const getBotPositions = async (botId: number): Promise<BotPosition[]> => {
    return await apiCall(`/api/bots/${botId}/positions`);
  };

  const getBotTrades = async (botId: number, limit = 50): Promise<BotPosition[]> => {
    return await apiCall(`/api/bots/${botId}/trades?limit=${limit}`);
  };

  const getRecentSignals = async (symbol?: string, limit = 20): Promise<TradingSignal[]> => {
    const params = new URLSearchParams();
    if (symbol) params.append('symbol', symbol);
    params.append('limit', limit.toString());
    
    return await apiCall(`/api/signals?${params.toString()}`);
  };

  const getAllPositions = async (): Promise<PaperTradingPosition[]> => {
    return await apiCall('/api/positions');
  };

  const getAllTrades = async (limit = 50): Promise<PaperTradingTrade[]> => {
    return await apiCall(`/api/trades?limit=${limit}`);
  };

  const getMetrics = async (): Promise<PaperTradingMetrics> => {
    return await apiCall('/api/metrics');
  };

  const deleteBot = async (botId: string): Promise<{ message: string }> => {
    return await apiCall(`/api/bots/${botId}`, {
      method: 'DELETE',
    });
  };

  const getHealthStatus = async () => {
    return await apiCall('/health');
  };

  return {
    // State
    bots,
    activeBots,
    loading,
    error,
    // Actions
    fetchBots,
    getStrategies,
    getBots,
    createBot,
    startBot,
    stopBot,
    deleteBot,
    getBotPerformance,
    getBotPositions,
    getBotTrades,
    getAllPositions,
    getAllTrades,
    getMetrics,
    getRecentSignals,
    getHealthStatus,
  };
}

export function usePaperTradingWebSocket(onUpdate?: (type: string, data: any) => void) {
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    const wsUrl = PAPER_TRADING_API_URL.replace('http', 'ws');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setConnected(true);
      console.log('📡 [Paper Trading WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        setLastUpdate(message);
        
        if (onUpdate) {
          onUpdate(message.type, message.data);
        }

        // Show toast notifications for important events
        if (message.type === 'position_opened') {
          toast({
            title: 'Position Opened',
            description: `${message.data.signal.signal_type} for ${message.data.signal.symbol}`,
          });
        } else if (message.type === 'position_closed') {
          toast({
            title: 'Position Closed',
            description: message.data.reason,
          });
        } else if (message.type === 'signal_error') {
          toast({
            title: 'Signal Error',
            description: message.data.error,
            variant: 'destructive',
          });
        }
      } catch (error) {
        console.error('📡 [Paper Trading WS] Error parsing message:', error);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      console.log('📡 [Paper Trading WS] Disconnected');
    };

    ws.onerror = (error) => {
      console.error('📡 [Paper Trading WS] Error:', error);
      setConnected(false);
    };

    return () => {
      ws.close();
    };
  }, [toast, onUpdate]);

  const subscribeToBotUpdates = (botId: number) => {
    // This would send a subscription message to the WebSocket
    // Implementation depends on the WebSocket protocol
  };

  return {
    connected,
    lastUpdate,
    subscribeToBotUpdates,
  };
}