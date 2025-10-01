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
      console.log('Fetching strategy defaults...');
      
      const { data, error } = await supabase
        .from('strategy_defaults')
        .select('*')
        .maybeSingle();

      console.log('Strategy defaults response:', data);
      console.log('Strategy defaults error:', error);

      if (error) {
        console.error('Error fetching strategy defaults:', error);
        throw error;
      }

      setDefaults(data);
    } catch (error: any) {
      console.error('Error in fetchDefaults:', error);
      toast({
        title: 'Error fetching strategy defaults',
        description: error.message || 'Failed to load strategy defaults',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const saveDefaults = async (newDefaults: Partial<StrategyDefaults>) => {
    try {
      console.log('Saving strategy defaults:', newDefaults);
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError) {
        console.error('Auth error:', userError);
        throw userError;
      }
      
      if (!user) {
        throw new Error('Not authenticated');
      }

      const { error } = await supabase
        .from('strategy_defaults')
        .upsert({
          user_id: user.id,
          ...newDefaults,
        });

      if (error) {
        console.error('Upsert error:', error);
        throw error;
      }

      console.log('Strategy defaults saved successfully');

      toast({
        title: 'Strategy defaults saved',
        description: 'Your strategy defaults have been updated successfully',
      });

      await fetchDefaults();
    } catch (error: any) {
      console.error('Error in saveDefaults:', error);
      toast({
        title: 'Error saving strategy defaults',
        description: error.message || 'Failed to save strategy defaults',
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
