import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { useApiKeys } from "@/hooks/useApiKeys";
import { useRiskControls } from "@/hooks/useRiskControls";
import { useStrategyDefaults } from "@/hooks/useStrategyDefaults";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const Settings = () => {
  const { toast } = useToast();
  const { apiKeys, loading: apiKeysLoading, testConnection, refetch: refetchApiKeys } = useApiKeys();
  const { controls, loading: controlsLoading, saveControls } = useRiskControls();
  const { defaults, loading: defaultsLoading, saveDefaults } = useStrategyDefaults();

  // API Keys State
  
  const [alpacaKey, setAlpacaKey] = useState("");
  const [alpacaSecret, setAlpacaSecret] = useState("");
  const [alpacaMode, setAlpacaMode] = useState<"paper" | "live">("paper");
  const [testingApi, setTestingApi] = useState<string | null>(null);

  // Risk Controls State
  const [riskForm, setRiskForm] = useState({
    max_positions: 10,
    max_position_size_usd: 5000,
    max_spread_cents: 12,
    min_open_interest: 100,
    daily_loss_limit_usd: 5000,
    weekly_loss_limit_usd: 15000,
    monthly_loss_limit_usd: 50000,
    max_drawdown_pct: 15,
    trading_start_time: "09:30:00",
    trading_end_time: "15:45:00",
    max_hold_time_minutes: 180,
    pre_expiry_close_minutes: 15,
    auto_kill_data_loss_seconds: 30,
    auto_kill_pnl_spike_pct: 5,
  });

  // Strategy Defaults State
  const [strategyForm, setStrategyForm] = useState({
    ema_length: 21,
    entry_deviation_pct: 0.18,
    near_deviation_pct: 0.06,
    min_slope: 0.00032,
    rv_cap_bps: 50,
    time_stop_bars: 120,
  });

  // Load existing data
  useEffect(() => {
    if (controls) {
      setRiskForm(controls);
    }
  }, [controls]);

  useEffect(() => {
    if (defaults) {
      setStrategyForm(defaults);
    }
  }, [defaults]);

  const alpacaApi = apiKeys.find((key) => key.provider === "alpaca");

  const handleTestConnection = async (provider: "alpaca") => {
    if (!alpacaKey?.trim() || !alpacaSecret?.trim()) {
      toast({
        title: 'Missing credentials',
        description: 'Please enter both API key and secret',
        variant: 'destructive',
      });
      return;
    }
    
    setTestingApi(provider);
    const isConnected = await testConnection("alpaca", alpacaKey.trim(), alpacaSecret.trim(), alpacaMode);
    setTestingApi(null);
    
    if (isConnected) {
      toast({
        title: 'Connection successful',
        description: 'Successfully connected to Alpaca',
      });
    }
  };

  const handleSaveApiKey = async () => {
    try {
      console.log(`Saving alpaca API key...`);
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error('Auth error:', userError);
        throw userError;
      }
      
      if (!user) {
        throw new Error("Not authenticated");
      }

      const keyData = {
        user_id: user.id,
        provider: 'alpaca' as const,
        api_key: alpacaKey.trim(),
        api_secret: alpacaSecret.trim(),
        mode: alpacaMode,
      };

      console.log('Upserting API key for provider: alpaca');

      const { error } = await supabase
        .from("api_keys")
        .upsert([keyData], {
          onConflict: 'user_id,provider'
        });

      if (error) {
        console.error('Upsert error:', error);
        throw error;
      }
      
      console.log(`alpaca API key saved successfully`);
      
      // Refetch to update connection status in UI
      await refetchApiKeys();
      
      toast({
        title: "API key saved",
        description: `Your alpaca API key has been saved successfully`,
      });
    } catch (error: any) {
      console.error("Error saving API key:", error);
      toast({
        title: "Error saving API key",
        description: error.message || 'Failed to save API key',
        variant: "destructive",
      });
    }
  };

  const handleSaveRiskControls = async () => {
    await saveControls(riskForm);
  };

  const handleSaveStrategyDefaults = async () => {
    await saveDefaults(strategyForm);
  };

  if (apiKeysLoading || controlsLoading || defaultsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure API keys, risk controls, and preferences</p>
        </div>

        <Tabs defaultValue="api" className="w-full">
          <TabsList className="bg-secondary">
            <TabsTrigger value="api">API Keys</TabsTrigger>
            <TabsTrigger value="risk">Risk Controls</TabsTrigger>
            <TabsTrigger value="strategy">Strategy Defaults</TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Alpaca API */}
              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Alpaca</h2>
                  <Badge variant="outline" className={alpacaApi?.is_connected ? "bg-success/10 text-success border-success" : "bg-warning/10 text-warning border-warning"}>
                    {alpacaApi?.is_connected ? (
                      <><CheckCircle2 className="w-3 h-3 mr-1" />Connected</>
                    ) : (
                      <><AlertTriangle className="w-3 h-3 mr-1" />Not Connected</>
                    )}
                  </Badge>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>API Key</Label>
                    <Input 
                      type="password" 
                      placeholder="Enter your Alpaca API key" 
                      className="mt-1"
                      value={alpacaKey}
                      onChange={(e) => setAlpacaKey(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>API Secret</Label>
                    <Input 
                      type="password" 
                      placeholder="Enter your Alpaca API secret" 
                      className="mt-1"
                      value={alpacaSecret}
                      onChange={(e) => setAlpacaSecret(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Mode</Label>
                    <select 
                      className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground"
                      value={alpacaMode}
                      onChange={(e) => setAlpacaMode(e.target.value as "paper" | "live")}
                    >
                      <option value="paper">Paper Trading</option>
                      <option value="live">Live Trading</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => handleSaveApiKey()}
                      disabled={!alpacaKey || !alpacaSecret}
                    >
                      Save
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1"
                      onClick={() => handleTestConnection("alpaca")}
                      disabled={!alpacaKey || !alpacaSecret || testingApi === "alpaca"}
                    >
                      {testingApi === "alpaca" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Test"}
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="risk" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Position Limits</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Max Positions</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.max_positions}
                      onChange={(e) => setRiskForm({...riskForm, max_positions: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Max Position Size ($)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.max_position_size_usd}
                      onChange={(e) => setRiskForm({...riskForm, max_position_size_usd: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Max Spread (¢)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.max_spread_cents}
                      onChange={(e) => setRiskForm({...riskForm, max_spread_cents: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Min Open Interest</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.min_open_interest}
                      onChange={(e) => setRiskForm({...riskForm, min_open_interest: parseInt(e.target.value)})}
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Loss Limits</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Daily Loss Limit ($)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.daily_loss_limit_usd}
                      onChange={(e) => setRiskForm({...riskForm, daily_loss_limit_usd: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Weekly Loss Limit ($)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.weekly_loss_limit_usd}
                      onChange={(e) => setRiskForm({...riskForm, weekly_loss_limit_usd: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Monthly Loss Limit ($)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.monthly_loss_limit_usd}
                      onChange={(e) => setRiskForm({...riskForm, monthly_loss_limit_usd: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Max Drawdown (%)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.max_drawdown_pct}
                      onChange={(e) => setRiskForm({...riskForm, max_drawdown_pct: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Time Controls</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Trading Start Time</Label>
                    <Input 
                      type="time" 
                      className="mt-1" 
                      value={riskForm.trading_start_time}
                      onChange={(e) => setRiskForm({...riskForm, trading_start_time: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Trading End Time</Label>
                    <Input 
                      type="time" 
                      className="mt-1" 
                      value={riskForm.trading_end_time}
                      onChange={(e) => setRiskForm({...riskForm, trading_end_time: e.target.value})}
                    />
                  </div>
                  <div>
                    <Label>Max Hold Time (minutes)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.max_hold_time_minutes}
                      onChange={(e) => setRiskForm({...riskForm, max_hold_time_minutes: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Pre-Expiry Close (minutes)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.pre_expiry_close_minutes}
                      onChange={(e) => setRiskForm({...riskForm, pre_expiry_close_minutes: parseInt(e.target.value)})}
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Kill Switch</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Auto-Kill on Data Loss (seconds)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.auto_kill_data_loss_seconds}
                      onChange={(e) => setRiskForm({...riskForm, auto_kill_data_loss_seconds: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Auto-Kill on PnL Spike (%)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={riskForm.auto_kill_pnl_spike_pct}
                      onChange={(e) => setRiskForm({...riskForm, auto_kill_pnl_spike_pct: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
              </Card>
            </div>
            <Button className="w-full mt-4 bg-gradient-primary" onClick={handleSaveRiskControls}>
              Save Risk Controls
            </Button>
          </TabsContent>

          <TabsContent value="strategy" className="mt-4">
            <Card className="p-6 bg-gradient-card border-border shadow-card max-w-2xl">
              <h2 className="text-xl font-semibold mb-4">Default Parameters</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>EMA Length</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={strategyForm.ema_length}
                      onChange={(e) => setStrategyForm({...strategyForm, ema_length: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Entry Deviation (%)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      step="0.01"
                      value={strategyForm.entry_deviation_pct}
                      onChange={(e) => setStrategyForm({...strategyForm, entry_deviation_pct: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Near Deviation (%)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      step="0.01"
                      value={strategyForm.near_deviation_pct}
                      onChange={(e) => setStrategyForm({...strategyForm, near_deviation_pct: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Min Slope</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      step="0.00001"
                      value={strategyForm.min_slope}
                      onChange={(e) => setStrategyForm({...strategyForm, min_slope: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>RV Cap (bps)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={strategyForm.rv_cap_bps}
                      onChange={(e) => setStrategyForm({...strategyForm, rv_cap_bps: parseInt(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label>Time Stop (bars)</Label>
                    <Input 
                      type="number" 
                      className="mt-1" 
                      value={strategyForm.time_stop_bars}
                      onChange={(e) => setStrategyForm({...strategyForm, time_stop_bars: parseInt(e.target.value)})}
                    />
                  </div>
                </div>
                <Button className="w-full bg-gradient-primary" onClick={handleSaveStrategyDefaults}>
                  Save Defaults
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
