import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { TradingChartTabs, BotChartData } from './TradingChartTabs';
import { EnhancedMarketDataService, MarketDataResponse, MarketDataConfig } from '@/services/EnhancedMarketDataService';
import { ChartBar } from '@/lib/timeUtils';
import { Loader2, AlertTriangle, CheckCircle, Clock, Database, Wifi, RefreshCw } from 'lucide-react';

export interface EnhancedBotConfig {
  botId: string;
  botName: string;
  symbol: string;
  strategy: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '1d';
  status: 'running' | 'stopped' | 'error';
  isActive: boolean;
}

interface ValidationStatus {
  botId: string;
  symbol: string;
  status: 'loading' | 'validating' | 'ready' | 'error' | 'websocket-only';
  progress: number;
  dataResponse?: MarketDataResponse;
  validation?: {
    isValid: boolean;
    issues: string[];
    recommendations: string[];
  };
  error?: string;
}

interface EnhancedTradingChartsProps {
  botConfigs: EnhancedBotConfig[];
  onWebSocketReady?: (botId: string, config: { symbol: string; startTimestamp: number }) => void;
  onValidationComplete?: (results: ValidationStatus[]) => void;
  autoStartWebSocket?: boolean;
}

/**
 * Enhanced Trading Charts with comprehensive data validation and WebSocket alignment
 * 
 * Features:
 * - Proper 5-day historical data calculation from current time
 * - Gap detection and coverage analysis
 * - WebSocket starting point alignment
 * - Real-time validation status per bot
 * - Fallback strategies for data issues
 */
export const EnhancedTradingCharts: React.FC<EnhancedTradingChartsProps> = ({
  botConfigs,
  onWebSocketReady,
  onValidationComplete,
  autoStartWebSocket = true
}) => {
  const [validationStatuses, setValidationStatuses] = useState<ValidationStatus[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [overallStatus, setOverallStatus] = useState<'loading' | 'ready' | 'partial' | 'error'>('loading');

  // Initialize validation statuses when bot configs change
  useEffect(() => {
    const initialStatuses: ValidationStatus[] = botConfigs.map(config => ({
      botId: config.botId,
      symbol: config.symbol,
      status: 'loading',
      progress: 0
    }));
    
    setValidationStatuses(initialStatuses);
    setIsInitializing(true);
    
    console.log(`[ENHANCED CHARTS] 🚀 Initializing data validation for ${botConfigs.length} bots`);
    
    // Start validation process
    validateAllBots(botConfigs);
  }, [botConfigs]);

  /**
   * Validate data for all active bots
   */
  const validateAllBots = async (configs: EnhancedBotConfig[]) => {
    const activeBots = configs.filter(config => config.isActive);
    
    console.log(`[ENHANCED CHARTS] 📊 Starting validation for ${activeBots.length} active bots`);
    
    // Process each bot in parallel for faster loading
    const validationPromises = activeBots.map(async (config, index) => {
      return validateBotData(config, index, activeBots.length);
    });
    
    try {
      const results = await Promise.allSettled(validationPromises);
      
      // Process results and update overall status
      let readyCount = 0;
      let errorCount = 0;
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          if (result.value.status === 'ready' || result.value.status === 'websocket-only') {
            readyCount++;
          } else if (result.value.status === 'error') {
            errorCount++;
          }
        } else {
          errorCount++;
        }
      });
      
      // Determine overall status
      if (errorCount === 0 && readyCount === activeBots.length) {
        setOverallStatus('ready');
      } else if (readyCount > 0) {
        setOverallStatus('partial');
      } else {
        setOverallStatus('error');
      }
      
      setIsInitializing(false);
      
      // Trigger WebSocket initialization for ready bots
      if (autoStartWebSocket) {
        initializeWebSocketConnections();
      }
      
      // Notify parent component
      onValidationComplete?.(validationStatuses);
      
      console.log(`[ENHANCED CHARTS] ✅ Validation complete: ${readyCount} ready, ${errorCount} errors`);
      
    } catch (error) {
      console.error(`[ENHANCED CHARTS] ❌ Validation failed:`, error);
      setOverallStatus('error');
      setIsInitializing(false);
    }
  };

  /**
   * Validate data for a single bot
   */
  const validateBotData = async (config: EnhancedBotConfig, index: number, total: number): Promise<ValidationStatus> => {
    const updateStatus = (updates: Partial<ValidationStatus>) => {
      setValidationStatuses(prev => prev.map(status => 
        status.botId === config.botId ? { ...status, ...updates } : status
      ));
    };

    try {
      // Phase 1: Start loading
      updateStatus({ 
        status: 'loading', 
        progress: 10 
      });
      
      console.log(`[ENHANCED CHARTS] 🔄 [${index + 1}/${total}] Validating ${config.symbol} (${config.botName})`);
      
      // Phase 2: Fetch complete market data
      updateStatus({ progress: 30 });
      
      const marketDataConfig: MarketDataConfig = {
        symbol: config.symbol,
        timeframe: config.timeframe,
        ensureCompleteCoverage: true
      };
      
      const dataResponse = await EnhancedMarketDataService.fetchCompleteMarketData(marketDataConfig);
      
      // Phase 3: Analyze and validate
      updateStatus({ 
        status: 'validating', 
        progress: 70,
        dataResponse 
      });
      
      const validation = EnhancedMarketDataService.validateForLiveTrading(dataResponse);
      
      // Phase 4: Determine final status
      let finalStatus: ValidationStatus['status'];
      
      if (dataResponse.bars.length === 0) {
        finalStatus = 'websocket-only';
        console.log(`[ENHANCED CHARTS] 📡 ${config.symbol}: WebSocket-only mode (no historical data)`);
      } else if (validation.isValid) {
        finalStatus = 'ready';
        console.log(`[ENHANCED CHARTS] ✅ ${config.symbol}: Ready for live trading (${dataResponse.totalBars} bars)`);
      } else if (validation.issues.length > 0 && dataResponse.websocketStartpoint.shouldStartWebSocket) {
        finalStatus = 'websocket-only';
        console.log(`[ENHANCED CHARTS] ⚠️ ${config.symbol}: Data issues detected, using WebSocket-only mode`);
      } else {
        finalStatus = 'error';
        console.log(`[ENHANCED CHARTS] ❌ ${config.symbol}: Critical validation failures`);
      }
      
      const finalValidationStatus: ValidationStatus = {
        botId: config.botId,
        symbol: config.symbol,
        status: finalStatus,
        progress: 100,
        dataResponse,
        validation
      };
      
      updateStatus(finalValidationStatus);
      return finalValidationStatus;
      
    } catch (error) {
      console.error(`[ENHANCED CHARTS] ❌ Failed to validate ${config.symbol}:`, error);
      
      const errorStatus: ValidationStatus = {
        botId: config.botId,
        symbol: config.symbol,
        status: 'error',
        progress: 100,
        error: error instanceof Error ? error.message : 'Unknown validation error'
      };
      
      updateStatus(errorStatus);
      return errorStatus;
    }
  };

  /**
   * Initialize WebSocket connections for ready bots
   */
  const initializeWebSocketConnections = () => {
    validationStatuses.forEach(status => {
      if ((status.status === 'ready' || status.status === 'websocket-only') && status.dataResponse) {
        const wsConfig = status.dataResponse.websocketStartpoint;
        
        if (wsConfig.shouldStartWebSocket) {
          console.log(`[ENHANCED CHARTS] 🔌 Initializing WebSocket for ${status.symbol}: ${wsConfig.reason}`);
          
          onWebSocketReady?.(status.botId, {
            symbol: status.symbol,
            startTimestamp: wsConfig.startFromTimestamp
          });
        }
      }
    });
  };

  /**
   * Retry validation for failed bots
   */
  const retryValidation = useCallback(() => {
    const failedBots = botConfigs.filter(config => 
      validationStatuses.some(status => 
        status.botId === config.botId && status.status === 'error'
      )
    );
    
    if (failedBots.length > 0) {
      console.log(`[ENHANCED CHARTS] 🔄 Retrying validation for ${failedBots.length} failed bots`);
      validateAllBots(failedBots);
    }
  }, [botConfigs, validationStatuses]);

  /**
   * Convert validation data to BotChartData format
   */
  const getBotChartsData = (): BotChartData[] => {
    return botConfigs
      .filter(config => config.isActive)
      .map(config => {
        const validationStatus = validationStatuses.find(status => status.botId === config.botId);
        const dataResponse = validationStatus?.dataResponse;
        
        return {
          botId: config.botId,
          botName: config.botName,
          symbol: config.symbol,
          status: validationStatus?.status === 'ready' || validationStatus?.status === 'websocket-only' 
            ? config.status 
            : 'error',
          bars: dataResponse?.bars || [],
          currentPrice: undefined, // Will be updated by WebSocket
          isConnected: validationStatus?.status === 'ready' || validationStatus?.status === 'websocket-only',
          strategy: config.strategy,
          lastUpdate: dataResponse ? Date.now() : undefined
        };
      });
  };

  // Render validation summary
  const renderValidationSummary = () => {
    const readyCount = validationStatuses.filter(s => s.status === 'ready' || s.status === 'websocket-only').length;
    const loadingCount = validationStatuses.filter(s => s.status === 'loading' || s.status === 'validating').length;
    const errorCount = validationStatuses.filter(s => s.status === 'error').length;
    
    if (isInitializing || loadingCount > 0) {
      return (
        <Alert className="mb-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>Validating data coverage for {botConfigs.length} trading bots...</span>
              <span className="text-sm text-muted-foreground">
                {readyCount}/{botConfigs.length} ready
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {validationStatuses.map(status => (
                <div key={status.botId} className="flex items-center gap-2 text-sm">
                  <span className="w-16 text-muted-foreground">{status.symbol}:</span>
                  <Progress value={status.progress} className="flex-1 h-1" />
                  <span className="w-20 text-xs text-muted-foreground">
                    {status.status === 'loading' ? 'Loading...' : 
                     status.status === 'validating' ? 'Validating...' :
                     status.status === 'ready' ? 'Ready' :
                     status.status === 'websocket-only' ? 'WS Only' : 'Error'}
                  </span>
                </div>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      );
    }
    
    if (overallStatus === 'error' && errorCount === botConfigs.length) {
      return (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>All bots failed data validation. Check connections and try again.</span>
              <Button variant="outline" size="sm" onClick={retryValidation}>
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      );
    }
    
    if (overallStatus === 'partial' || errorCount > 0) {
      return (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>
                {readyCount} bot{readyCount !== 1 ? 's' : ''} ready, {errorCount} failed validation.
                {errorCount > 0 && ' Some bots may use WebSocket-only mode.'}
              </span>
              {errorCount > 0 && (
                <Button variant="outline" size="sm" onClick={retryValidation}>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry Failed
                </Button>
              )}
            </div>
          </AlertDescription>
        </Alert>
      );
    }
    
    return (
      <Alert className="mb-4 border-green-200 bg-green-50">
        <CheckCircle className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          <div className="flex items-center justify-between">
            <span>
              All {readyCount} trading bot{readyCount !== 1 ? 's' : ''} validated successfully. 
              WebSocket connections initialized.
            </span>
            <div className="flex items-center gap-2 text-sm">
              <Database className="h-3 w-3" />
              <span>5-day coverage</span>
              <Wifi className="h-3 w-3" />
              <span>Live streaming</span>
            </div>
          </div>
        </AlertDescription>
      </Alert>
    );
  };

  // Show detailed validation info for debugging
  const renderValidationDetails = () => {
    if (!validationStatuses.some(s => s.validation)) return null;
    
    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Database className="h-4 w-4" />
            Data Coverage Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {validationStatuses.map(status => {
            if (!status.dataResponse || !status.validation) return null;
            
            const data = status.dataResponse;
            const validation = status.validation;
            
            return (
              <div key={status.botId} className="text-sm border rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={status.status === 'ready' ? 'default' : status.status === 'websocket-only' ? 'secondary' : 'destructive'}>
                      {status.symbol}
                    </Badge>
                    <span className="text-muted-foreground">{status.status}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {data.totalBars} bars | {data.dateRange.tradingDaysCount} trading days
                  </div>
                </div>
                
                {data.coverage.hasGaps && (
                  <div className="text-xs text-yellow-600 mb-1">
                    ⚠️ {data.coverage.gapCount} data gaps detected
                  </div>
                )}
                
                <div className="text-xs text-muted-foreground">
                  WebSocket: {data.websocketStartpoint.reason}
                </div>
                
                {validation.issues.length > 0 && (
                  <div className="mt-2 text-xs">
                    <div className="text-red-600">Issues:</div>
                    <ul className="list-disc list-inside text-muted-foreground">
                      {validation.issues.map((issue, i) => (
                        <li key={i}>{issue}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  const botChartsData = getBotChartsData();

  return (
    <div className="space-y-4">
      {/* Validation Status */}
      {renderValidationSummary()}
      
      {/* Detailed Analysis (in development mode) */}
      {process.env.NODE_ENV === 'development' && renderValidationDetails()}
      
      {/* Trading Charts */}
      {botChartsData.length > 0 && overallStatus !== 'error' && (
        <TradingChartTabs 
          botCharts={botChartsData}
          onTabChange={(botId, symbol) => {
            console.log(`[ENHANCED CHARTS] 📊 Switched to ${symbol} (Bot: ${botId})`);
          }}
        />
      )}
      
      {/* No data fallback */}
      {botChartsData.length === 0 && !isInitializing && (
        <Card className="p-8">
          <div className="text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Active Trading Bots</h3>
            <p className="text-sm">
              Configure and start trading bots to view their individual charts with comprehensive data validation.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default EnhancedTradingCharts;