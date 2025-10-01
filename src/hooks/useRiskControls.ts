import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
      
      const { data, error } = await supabase
        .from('risk_controls')
        .select('*')
        .maybeSingle();

      console.log('Risk controls response:', data);
      console.log('Risk controls error:', error);

      if (error) {
        console.error('Error fetching risk controls:', error);
        throw error;
      }

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
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error('Auth error:', userError);
        throw userError;
      }
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('risk_controls')
        .upsert({
          user_id: user.id,
          ...newControls,
        });

      if (error) {
        console.error('Upsert error:', error);
        throw error;
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
