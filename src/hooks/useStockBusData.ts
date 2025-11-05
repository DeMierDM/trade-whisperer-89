import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSharedBusData, BusMessage } from './useSharedBusData';

export interface StockTradeData {
  symbol: string;
  price: number;
  size: number;
  timestamp: string;
  exchange?: string;
  conditions?: string[];
  data_source: string;
}

export interface StockQuoteData {
  symbol: string;
  bid: number;
  ask: number;
  bid_size?: number;
  ask_size?: number;
  timestamp: string;
  data_source: string;
  exchange?: string;
}

export interface BarData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CombinedStockData {
  symbol: string;
  price?: number;      // From trades
  bid?: number;        // From quotes
  ask?: number;        // From quotes
  bid_size?: number;
  ask_size?: number;
  size?: number;       // Trade size
  timestamp: string;
  exchange?: string;
  data_source: string;
  conditions?: string[];
}

/**
 * Trade aggregation helper - preserves exact logic from useDockerWebSocket.ts
 */
const buildBarsFromRecentTrades = (trades: StockTradeData[], symbol: string): BarData[] => {
  // Group trades by minute
  const minuteGroups = new Map<string, StockTradeData[]>();
  
  trades.forEach(trade => {
    const tradeTime = new Date(trade.timestamp);
    const minuteKey = `${tradeTime.getFullYear()}-${String(tradeTime.getMonth() + 1).padStart(2, '0')}-${String(tradeTime.getDate()).padStart(2, '0')} ${String(tradeTime.getHours()).padStart(2, '0')}:${String(tradeTime.getMinutes()).padStart(2, '0')}`;
    
    if (!minuteGroups.has(minuteKey)) {
      minuteGroups.set(minuteKey, []);
    }
    minuteGroups.get(minuteKey)!.push(trade);
  });

  // Convert to bars
  const bars: BarData[] = [];
  minuteGroups.forEach((trades, minuteKey) => {
    if (trades.length === 0) return;
    
    const sortedTrades = trades.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const open = sortedTrades[0].price;
    const close = sortedTrades[sortedTrades.length - 1].price;
    const high = Math.max(...sortedTrades.map(t => t.price));
    const low = Math.min(...sortedTrades.map(t => t.price));
    const volume = sortedTrades.reduce((sum, trade) => sum + trade.size, 0);
    
    // Parse the minute key back to timestamp
    const [dateStr, timeStr] = minuteKey.split(' ');
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    const time = Math.floor(new Date(year, month - 1, day, hour, minute).getTime() / 1000);
    
    bars.push({
      time,
      open,
      high,
      low,
      close,
      volume
    });
  });

  return bars.sort((a, b) => a.time - b.time);
};

export interface UseStockBusDataResult {
  connected: boolean;
  error: string | null;
  reconnectAttempts: number;
  quotes: Record<string, CombinedStockData>;
  recentTrades: StockTradeData[];
  bars: Record<string, BarData[]>;
  subscribedChannels: string[];
  
  // Helper functions (preserved from original)
  buildBarsFromRecentTrades: (trades: StockTradeData[], symbol: string) => BarData[];
}

/**
 * Stock data hook using data bus
 * Preserves all functionality from useDockerWebSocket.ts including trade aggregation
 */
export function useStockBusData(symbols: string[]): UseStockBusDataResult {
  console.log('📈 [STOCK-BUS] Hook called with symbols:', symbols);
  
  const [quotes, setQuotes] = useState<Map<string, CombinedStockData>>(new Map());
  const [recentTrades, setRecentTrades] = useState<StockTradeData[]>([]);
  const [bars, setBars] = useState<Map<string, BarData[]>>(new Map());

  // Build subscription channels for stocks
  const channels = useMemo(() => {
    const stockChannels: string[] = [];
    symbols.forEach(symbol => {
      stockChannels.push(`stock.${symbol}.quote`);
      stockChannels.push(`stock.${symbol}.trade`);
    });
    console.log('📈 🎯 [STOCK-BUS] Generated channels:', stockChannels);
    return stockChannels;
  }, [symbols]);

  const handleBusMessage = useCallback((message: BusMessage) => {
    const { channel, data, type } = message;
    
    // Extract symbol from channel (stock.SPY.trade -> SPY)
    const channelParts = channel.split('.');
    const symbol = channelParts[1];
    
    if (!symbol) {
      console.warn('📈 ⚠️ [STOCK-BUS] No symbol found in channel:', channel);
      return;
    }

    console.log('📈 📨 [STOCK-BUS] Processing message:', {
      channel,
      type,
      symbol,
      dataPreview: {
        price: data.price,
        bid: data.bid,
        ask: data.ask,
        timestamp: data.timestamp
      }
    });
    
    if (type === 'trade') {
      const tradeData: StockTradeData = {
        symbol: data.symbol || symbol,
        price: data.price,
        size: data.size,
        timestamp: data.timestamp,
        exchange: data.exchange,
        conditions: data.conditions,
        data_source: data.data_source || 'bus_trade'
      };

      console.log('📈 💰 [STOCK-BUS] LIVE STOCK TRADE:', {
        symbol: tradeData.symbol,
        price: tradeData.price,
        size: tradeData.size,
        source: tradeData.data_source
      });

      // Store trade in recent trades array for bar building (preserve exact logic)
      setRecentTrades(prev => {
        // Keep only last 1000 trades and trades from last 2 hours
        const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
        const filteredTrades = prev.filter(t => new Date(t.timestamp).getTime() > twoHoursAgo);
        const updatedTrades = [...filteredTrades, tradeData].slice(-1000);
        
        // Build bars from updated trades
        const symbolTrades = updatedTrades.filter(t => t.symbol === symbol);
        if (symbolTrades.length > 0) {
          const newBars = buildBarsFromRecentTrades(symbolTrades, symbol);
          
          setBars(prev => {
            const updated = new Map(prev);
            updated.set(symbol, newBars);
            console.log(`📈 📊 [STOCK-BUS] Built ${newBars.length} bars for ${symbol}`);
            return updated;
          });
        }
        
        return updatedTrades;
      });

      // Update quotes with trade data (preserve exact logic)
      setQuotes(prev => {
        const newQuotes = new Map(prev);
        const existing = prev.get(symbol);
        
        newQuotes.set(symbol, {
          symbol,
          price: tradeData.price,
          size: tradeData.size,
          timestamp: tradeData.timestamp,
          exchange: tradeData.exchange,
          data_source: tradeData.data_source,
          conditions: tradeData.conditions,
          // Keep existing bid/ask if available
          bid: existing?.bid || tradeData.price,
          ask: existing?.ask || tradeData.price,
          bid_size: existing?.bid_size,
          ask_size: existing?.ask_size,
        });
        
        console.log('📈 📋 [STOCK-BUS] Updated quotes with trade, now has', newQuotes.size, 'quotes');
        return newQuotes;
      });
    }
    
    if (type === 'quote') {
      const quoteData: StockQuoteData = {
        symbol: data.symbol || symbol,
        bid: data.bid,
        ask: data.ask,
        bid_size: data.bid_size,
        ask_size: data.ask_size,
        timestamp: data.timestamp,
        data_source: data.data_source || 'bus_quote',
        exchange: data.exchange
      };

      console.log('📈 📊 [STOCK-BUS] LIVE STOCK QUOTE:', {
        symbol: quoteData.symbol,
        bid: quoteData.bid,
        ask: quoteData.ask,
        source: quoteData.data_source
      });

      setQuotes(prev => {
        const newQuotes = new Map(prev);
        const existing = prev.get(symbol);
        
        // Merge with existing trade data if available (preserve exact logic)
        newQuotes.set(symbol, {
          ...existing,
          symbol,
          bid: quoteData.bid,
          ask: quoteData.ask,
          bid_size: quoteData.bid_size,
          ask_size: quoteData.ask_size,
          timestamp: quoteData.timestamp,
          data_source: quoteData.data_source,
          exchange: quoteData.exchange,
        });
        
        console.log('📈 📋 [STOCK-BUS] Updated quotes with quote, now has', newQuotes.size, 'quotes');
        return newQuotes;
      });
    }
  }, []);

  // Use shared bus connection with unique subscriber ID
  const subscriberId = useRef(`stock-${symbols.join(',')}-${Date.now()}`).current;
  
  const busConnection = useSharedBusData(
    subscriberId,
    channels,
    handleBusMessage,
    (error) => {
      console.error('📈 ❌ [STOCK-BUS] Bus error:', error);
    },
    () => {
      console.log('📈 ✅ [STOCK-BUS] Connected to data bus for stock data');
    },
    () => {
      console.log('📈 ❌ [STOCK-BUS] Disconnected from data bus');
    }
  );

  return {
    connected: busConnection.connected,
    error: busConnection.error,
    reconnectAttempts: busConnection.reconnectAttempts,
    subscribedChannels: busConnection.subscribedChannels,
    
    // Convert Maps to objects for easier consumption
    quotes: Object.fromEntries(quotes),
    recentTrades,
    bars: Object.fromEntries(bars),
    
    // Helper functions (preserved from original)
    buildBarsFromRecentTrades,
  };
}