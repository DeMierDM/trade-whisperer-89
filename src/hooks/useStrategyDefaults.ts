import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface StrategyDefaults {
  ema_length: number;
  entry_deviation_pct: number;
  near_deviation_pct: number;
  min_slope: number;
  rv_cap_bps: number;
  time_stop_bars: number;
}

export const useStrategyDefaults = () => {
  const [defaults, setDefaults] = useState<StrategyDefaults | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchDefaults = async () => {
    try {
      const { data, error } = await supabase
        .from('strategy_defaults')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setDefaults(data);
    } catch (error: any) {
      toast({
        title: 'Error fetching strategy defaults',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const saveDefaults = async (newDefaults: Partial<StrategyDefaults>) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('strategy_defaults')
        .upsert({
          user_id: user.id,
          ...newDefaults,
        });

      if (error) throw error;

      toast({
        title: 'Strategy defaults saved',
        description: 'Your strategy defaults have been updated successfully',
      });

      await fetchDefaults();
    } catch (error: any) {
      toast({
        title: 'Error saving strategy defaults',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchDefaults();
  }, []);

  return {
    defaults,
    loading,
    saveDefaults,
    refetch: fetchDefaults,
  };
};
