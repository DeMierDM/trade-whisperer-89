import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ENDPOINTS, REQUEST_CONFIG, logApiCall, createApiError } from '../lib/apiConfig';

export interface RiskControls {
  max_positions: number;
  max_position_size_usd: number;
  max_spread_cents: number;
  min_open_interest: number;
  daily_loss_limit_usd: number;
  weekly_loss_limit_usd: number;
  monthly_loss_limit_usd: number;
  max_drawdown_pct: number;
  trading_start_time: string;
  trading_end_time: string;
  max_hold_time_minutes: number;
  pre_expiry_close_minutes: number;
  auto_kill_data_loss_seconds: number;
  auto_kill_pnl_spike_pct: number;
}

export const useRiskControls = () => {
  const [controls, setControls] = useState<RiskControls | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchControls = async () => {
    try {
      console.log('Fetching risk controls...');

      const response = await fetch(ENDPOINTS.RISK_CONTROLS);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Risk controls response:', data);
      setControls(data);
    } catch (error: any) {
      console.error('Error in fetchControls:', error);
      toast({
        title: 'Error fetching risk controls',
        description: error.message || 'Failed to load risk controls',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const saveControls = async (newControls: Partial<RiskControls>) => {
    try {
      console.log('Saving risk controls:', newControls);

      const response = await fetch(ENDPOINTS.RISK_CONTROLS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newControls),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      console.log('Risk controls saved successfully');

      toast({
        title: 'Risk controls saved',
        description: 'Your risk controls have been updated successfully',
      });

      await fetchControls();
    } catch (error: any) {
      console.error('Error in saveControls:', error);
      toast({
        title: 'Error saving risk controls',
        description: error.message || 'Failed to save risk controls',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchControls();
  }, []);

  return {
    controls,
    loading,
    saveControls,
    refetch: fetchControls,
  };
};
