import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useSharedBusData, BusMessage } from './useSharedBusData';

export interface OptionQuoteData {
  symbol: string;
  bid: number;
  ask: number;
  bid_size?: number;
  ask_size?: number;
  timestamp: string;
  data_source: string;
  exchange?: string;
  underlying?: string;
  strike?: number;
  expiry?: string;
  option_type?: 'call' | 'put';
}

export interface OptionChainData {
  symbol: string; // underlying symbol (SPY, QQQ, IWM)
  expiry_date: string;
  contracts: OptionContractData[];
  timestamp: string;
  data_source: string;
}

export interface OptionContractData {
  symbol: string; // full option symbol (SPY251101C00580000)
  underlying: string;
  strike: number;
  expiry: string;
  option_type: 'call' | 'put';
  bid?: number;
  ask?: number;
  bid_size?: number;
  ask_size?: number;
  volume?: number;
  open_interest?: number;
  implied_volatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
  last_updated?: string;
}

export interface UseOptionsBusDataResult {
  connected: boolean;
  error: string | null;
  reconnectAttempts: number;
  subscribedChannels: string[];
  
  // Options data
  optionQuotes: Record<string, OptionQuoteData>;
  optionChains: Record<string, OptionChainData>;
  optionContracts: Record<string, OptionContractData>;
  
  // Helper functions
  getOptionChain: (underlying: string) => OptionChainData | undefined;
  getOptionQuote: (optionSymbol: string) => OptionQuoteData | undefined;
  getContractsByStrike: (underlying: string, strike: number) => OptionContractData[];
  getContractsByExpiry: (underlying: string, expiry: string) => OptionContractData[];
}

/**
 * Options data hook using data bus
 * Handles options quotes and chain data from centralized bus
 */
export function useOptionsBusData(
  underlyingSymbols: string[] = [], 
  optionSymbols: string[] = []
): UseOptionsBusDataResult {
  console.log('📊 [OPTIONS-BUS] Hook called with:', { 
    underlyingSymbols, 
    optionSymbols: optionSymbols.length > 10 ? `${optionSymbols.slice(0, 10).join(', ')}... (${optionSymbols.length} total)` : optionSymbols
  });
  
  const [optionQuotes, setOptionQuotes] = useState<Map<string, OptionQuoteData>>(new Map());
  const [optionChains, setOptionChains] = useState<Map<string, OptionChainData>>(new Map());
  const [optionContracts, setOptionContracts] = useState<Map<string, OptionContractData>>(new Map());

  // Build subscription channels for options
  const channels = useMemo(() => {
    const optionsChannels: string[] = [];
    
    // Subscribe to chain updates for underlying symbols
    underlyingSymbols.forEach(symbol => {
      optionsChannels.push(`options.${symbol}.chain`);
    });
    
    // Subscribe to quote updates for specific option symbols
    optionSymbols.forEach(symbol => {
      optionsChannels.push(`options.${symbol}.quote`);
    });
    
    console.log('📊 🎯 [OPTIONS-BUS] Generated channels:', optionsChannels.slice(0, 10), 
      optionsChannels.length > 10 ? `... (${optionsChannels.length} total)` : '');
    return optionsChannels;
  }, [underlyingSymbols, optionSymbols]);

  const handleBusMessage = useCallback((message: BusMessage) => {
    const { channel, data, type } = message;
    
    // Extract symbol from channel (options.SPY.chain -> SPY, options.SPY251101C00580000.quote -> SPY251101C00580000)
    const channelParts = channel.split('.');
    const symbol = channelParts[1];
    
    if (!symbol) {
      console.warn('📊 ⚠️ [OPTIONS-BUS] No symbol found in channel:', channel);
      return;
    }

    console.log('📊 📨 [OPTIONS-BUS] Processing message:', {
      channel,
      type,
      symbol,
      dataPreview: {
        bid: data.bid,
        ask: data.ask,
        contracts: Array.isArray(data.contracts) ? data.contracts.length : 'N/A',
        timestamp: data.timestamp
      }
    });
    
    if (type === 'quote') {
      const quoteData: OptionQuoteData = {
        symbol: data.symbol || symbol,
        bid: data.bid,
        ask: data.ask,
        bid_size: data.bid_size,
        ask_size: data.ask_size,
        timestamp: data.timestamp,
        data_source: data.data_source || 'bus_option_quote',
        exchange: data.exchange,
        underlying: data.underlying,
        strike: data.strike,
        expiry: data.expiry,
        option_type: data.option_type
      };

      console.log('📊 💰 [OPTIONS-BUS] LIVE OPTION QUOTE:', {
        symbol: quoteData.symbol,
        bid: quoteData.bid,
        ask: quoteData.ask,
        underlying: quoteData.underlying,
        source: quoteData.data_source
      });

      setOptionQuotes(prev => {
        const newQuotes = new Map(prev);
        newQuotes.set(symbol, quoteData);
        console.log('📊 📋 [OPTIONS-BUS] Updated option quotes, now has', newQuotes.size, 'quotes');
        return newQuotes;
      });

      // Also update the contract with latest quote data
      setOptionContracts(prev => {
        const newContracts = new Map(prev);
        const existing = prev.get(symbol);
        
        if (existing) {
          newContracts.set(symbol, {
            ...existing,
            bid: quoteData.bid,
            ask: quoteData.ask,
            bid_size: quoteData.bid_size,
            ask_size: quoteData.ask_size,
            last_updated: quoteData.timestamp
          });
          console.log('📊 🔄 [OPTIONS-BUS] Updated contract with live quote:', symbol);
        }
        
        return newContracts;
      });
    }
    
    if (type === 'chain') {
      const chainData: OptionChainData = {
        symbol: data.symbol || symbol,
        expiry_date: data.expiry_date,
        contracts: data.contracts || [],
        timestamp: data.timestamp,
        data_source: data.data_source || 'bus_option_chain'
      };

      console.log('📊 🔗 [OPTIONS-BUS] OPTION CHAIN UPDATE:', {
        symbol: chainData.symbol,
        contracts: chainData.contracts.length,
        expiry: chainData.expiry_date,
        source: chainData.data_source
      });

      setOptionChains(prev => {
        const newChains = new Map(prev);
        newChains.set(symbol, chainData);
        console.log('📊 📋 [OPTIONS-BUS] Updated option chains, now has', newChains.size, 'chains');
        return newChains;
      });

      // Update individual contracts from chain data
      if (chainData.contracts && chainData.contracts.length > 0) {
        setOptionContracts(prev => {
          const newContracts = new Map(prev);
          
          chainData.contracts.forEach(contract => {
            if (contract.symbol) {
              newContracts.set(contract.symbol, contract);
            }
          });
          
          console.log('📊 📄 [OPTIONS-BUS] Updated', chainData.contracts.length, 'contracts from chain');
          return newContracts;
        });
      }
    }
  }, []);

  // Use shared bus connection with stable subscriber ID (don't include optionSymbols in ID)
  const subscriberId = useRef(`options-${underlyingSymbols.join(',')}-${Date.now()}`).current;
  
  const busConnection = useSharedBusData(
    subscriberId,
    channels,
    handleBusMessage,
    (error) => {
      console.error('📊 ❌ [OPTIONS-BUS] Bus error:', error);
    },
    () => {
      console.log('📊 ✅ [OPTIONS-BUS] Connected to data bus for options data');
    },
    () => {
      console.log('📊 ❌ [OPTIONS-BUS] Disconnected from data bus');
    }
  );

  // Helper functions
  const getOptionChain = useCallback((underlying: string): OptionChainData | undefined => {
    return optionChains.get(underlying);
  }, [optionChains]);

  const getOptionQuote = useCallback((optionSymbol: string): OptionQuoteData | undefined => {
    return optionQuotes.get(optionSymbol);
  }, [optionQuotes]);

  const getContractsByStrike = useCallback((underlying: string, strike: number): OptionContractData[] => {
    const contracts: OptionContractData[] = [];
    
    optionContracts.forEach(contract => {
      if (contract.underlying === underlying && contract.strike === strike) {
        contracts.push(contract);
      }
    });
    
    return contracts.sort((a, b) => a.expiry.localeCompare(b.expiry));
  }, [optionContracts]);

  const getContractsByExpiry = useCallback((underlying: string, expiry: string): OptionContractData[] => {
    const contracts: OptionContractData[] = [];
    
    optionContracts.forEach(contract => {
      if (contract.underlying === underlying && contract.expiry === expiry) {
        contracts.push(contract);
      }
    });
    
    return contracts.sort((a, b) => a.strike - b.strike);
  }, [optionContracts]);

  return {
    connected: busConnection.connected,
    error: busConnection.error,
    reconnectAttempts: busConnection.reconnectAttempts,
    subscribedChannels: busConnection.subscribedChannels,
    
    // Convert Maps to objects for easier consumption
    optionQuotes: Object.fromEntries(optionQuotes),
    optionChains: Object.fromEntries(optionChains),
    optionContracts: Object.fromEntries(optionContracts),
    
    // Helper functions
    getOptionChain,
    getOptionQuote,
    getContractsByStrike,
    getContractsByExpiry,
  };
}