import React, { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LiveTradingViewChart, ChartUpdateAPI } from '@/components/LiveTradingViewChart';
import { ChartBar } from '@/lib/timeUtils';

export interface BotChartData {
  botId: string;
  botName: string;
  symbol: string;
  status: 'running' | 'stopped' | 'error';
  bars: ChartBar[];
  currentPrice?: number;
  isConnected: boolean;
  strategy?: string;
  lastUpdate?: number;
}

interface TradingChartTabsProps {
  botCharts: BotChartData[];
  onTabChange?: (botId: string, symbol: string) => void;
  defaultActiveTab?: string;
  height?: number;
}

export const TradingChartTabs: React.FC<TradingChartTabsProps> = ({
  botCharts,
  onTabChange,
  defaultActiveTab,
  height = 400,
}) => {
  // Use the first bot as default if no default specified
  const [activeTabId, setActiveTabId] = useState<string>(
    defaultActiveTab || botCharts[0]?.botId || ''
  );

  // ULTRA LOW-LATENCY: Immediate re-render on price updates (NO throttling)
  useEffect(() => {
    console.log('[TRADING TABS] ⚡ Ultra-fast update with new bot data - ZERO throttling');
  }, [botCharts]); // Immediate updates, no throttling for maximum speed

  // Track chart refs for each bot instance
  const chartRefs = useRef<Record<string, React.RefObject<ChartUpdateAPI>>>({});

  // Initialize chart refs for each bot
  useEffect(() => {
    botCharts.forEach(bot => {
      if (!chartRefs.current[bot.botId]) {
        chartRefs.current[bot.botId] = React.createRef<ChartUpdateAPI>();
      }
    });

    // Clean up refs for removed bots
    Object.keys(chartRefs.current).forEach(botId => {
      if (!botCharts.find(bot => bot.botId === botId)) {
        delete chartRefs.current[botId];
      }
    });
  }, [botCharts]);

  const handleTabClick = (botId: string, symbol: string) => {
    setActiveTabId(botId);
    onTabChange?.(botId, symbol);
  };

  const getActiveBot = () => botCharts.find(bot => bot.botId === activeTabId);

  // If no active tab is set or bot doesn't exist anymore, use first available
  const activeBot = getActiveBot() || botCharts[0];

  if (!activeBot) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          <p className="text-lg font-medium mb-2">No Active Trading Bots</p>
          <p className="text-sm">Create and start trading bots to see their individual charts here.</p>
        </div>
      </Card>
    );
  }

  const getStatusIndicator = (status: string, isConnected: boolean) => {
    if (!isConnected) return { color: 'bg-red-500', text: 'Disconnected' };
    
    switch (status) {
      case 'running':
        return { color: 'bg-green-500', text: 'Running' };
      case 'stopped':
        return { color: 'bg-yellow-500', text: 'Stopped' };
      case 'error':
        return { color: 'bg-red-500', text: 'Error' };
      default:
        return { color: 'bg-gray-500', text: 'Unknown' };
    }
  };

  return (
    <Card className="w-full">
      {/* Tab Header */}
      <div className="border-b border-border bg-secondary/20">
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-1 overflow-x-auto">
            {botCharts.map((bot) => {
              const isActive = bot.botId === activeTabId;
              const statusInfo = getStatusIndicator(bot.status, bot.isConnected);
              
              return (
                <button
                  key={bot.botId}
                  onClick={() => handleTabClick(bot.botId, bot.symbol)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-t-lg transition-all whitespace-nowrap ${
                    isActive 
                      ? 'bg-background border-l border-r border-t border-border text-foreground' 
                      : 'bg-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }`}
                >
                  {/* Status Indicator */}
                  <div className={`w-2 h-2 rounded-full ${statusInfo.color} ${
                    bot.status === 'running' && bot.isConnected ? 'animate-pulse' : ''
                  }`} />
                  
                  {/* Bot Name/Symbol */}
                  <span className="font-medium text-sm">
                    {bot.botName}
                  </span>
                  
                  {/* Symbol Badge */}
                  <Badge variant="outline" className="text-xs px-1 py-0">
                    {bot.symbol}
                  </Badge>
                  
                  {/* Price */}
                  {bot.currentPrice && (
                    <span className="text-xs font-mono text-primary">
                      ${bot.currentPrice.toFixed(2)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          
          {/* Active Bot Summary */}
          <div className="flex items-center gap-3 text-sm">
            <Badge variant="outline">
              {botCharts.length} Bot{botCharts.length !== 1 ? 's' : ''}
            </Badge>
            <div className="text-muted-foreground">
              Active: {activeBot.symbol}
            </div>
          </div>
        </div>
      </div>
      
      {/* Chart Content */}
      <div className="relative">
        {/* Professional Trading Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#1e222d] border-b border-[#2a2e39]">
          <div className="flex items-center gap-4">
            {/* Bot Info */}
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-[#d1d4dc]">
                {activeBot.botName}
              </h3>
              <Badge variant="outline" className="text-xs">
                {activeBot.strategy || 'Unknown Strategy'}  
              </Badge>
            </div>
            
            {/* Live Price & Change */}
            {activeBot.currentPrice && activeBot.bars.length > 0 && (() => {
              const lastBar = activeBot.bars[activeBot.bars.length - 1];
              const priceDiff = activeBot.currentPrice - lastBar.close;
              const changePercent = ((priceDiff / lastBar.close) * 100);
              const isPositive = priceDiff >= 0;
              
              return (
                <div className="flex items-center gap-3">
                  <span className="text-xl font-mono font-bold text-white">
                    ${activeBot.currentPrice.toFixed(2)}
                  </span>
                  <span className={`text-sm font-semibold px-2 py-1 rounded ${
                    isPositive ? 'text-[#26a69a] bg-[#26a69a]/10' : 'text-[#ef5350] bg-[#ef5350]/10'
                  }`}>
                    {isPositive ? '+' : ''}${priceDiff.toFixed(2)} ({isPositive ? '+' : ''}{changePercent.toFixed(2)}%)
                  </span>
                </div>
              );
            })()}
          </div>
          
          {/* Status & Metrics */}
          <div className="flex items-center gap-4 text-xs text-[#787b86]">
            {/* Connection Status */}
            <div className="flex items-center gap-1">
              <div className={`w-2 h-2 rounded-full ${
                activeBot.isConnected && activeBot.status === 'running' 
                  ? 'bg-[#26a69a] animate-pulse' 
                  : activeBot.isConnected
                  ? 'bg-[#ff9800]'
                  : 'bg-[#ef5350]'
              }`} />
              <span>{getStatusIndicator(activeBot.status, activeBot.isConnected).text}</span>
            </div>
            
            {/* Data Stats */}
            <span>{activeBot.bars.length} bars</span>
            
            {/* Last Update */}
            {activeBot.lastUpdate && (
              <span>
                Updated: {new Date(activeBot.lastUpdate).toLocaleTimeString()}
              </span>
            )}
            
            <span className="text-[#2962ff] font-medium">TradingView Pro</span>
          </div>
        </div>
        
        {/* Chart Container */}
        <div className={`relative ${height === 400 ? 'h-[400px]' : height === 300 ? 'h-[300px]' : height === 500 ? 'h-[500px]' : 'h-[400px]'}`}>
          {activeBot.bars.length > 0 ? (
            <LiveTradingViewChart
              ref={chartRefs.current[activeBot.botId]}
              symbol={activeBot.symbol}
              bars={activeBot.bars}
              currentPrice={activeBot.currentPrice}
              height={height}
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-[#131722] text-[#d1d4dc]">
              <div className="text-center">
                {activeBot.isConnected ? (
                  <>
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#2962ff] mx-auto mb-3"></div>
                    <p className="text-sm mb-1">Loading {activeBot.symbol} chart data...</p>
                    <p className="text-xs text-[#787b86]">Bot: {activeBot.botName}</p>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full bg-[#ef5350] flex items-center justify-center mx-auto mb-3">
                      <span className="text-white text-xs">!</span>
                    </div>
                    <p className="text-sm mb-1">Connection Lost</p>
                    <p className="text-xs text-[#787b86]">
                      Check WebSocket connection for {activeBot.symbol}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Professional Status Footer */}
        <div className="px-4 py-2 bg-[#1e222d] border-t border-[#2a2e39]">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  activeBot.bars.length > 0 ? 'bg-[#26a69a]' : 'bg-[#ff9800]'
                }`} />
                <span className="text-[#787b86]">
                  Engine: {activeBot.bars.length > 0 ? 'Active' : 'Loading'}
                </span>
              </div>
              
              <span className="text-[#787b86]">
                Strategy: {activeBot.strategy || 'Default'}
              </span>
              
              <span className="text-[#787b86]">
                Data: {activeBot.bars.length} bars loaded
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-[#2962ff] text-xs font-medium">
                Multi-Bot Trading System
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default TradingChartTabs;