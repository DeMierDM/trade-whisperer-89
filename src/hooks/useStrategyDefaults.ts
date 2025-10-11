import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const DOCKER_API_URL = 'http://localhost:3001/api';

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

      const response = await fetch(`${DOCKER_API_URL}/config/strategy-defaults`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Strategy defaults response:', data);
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

      const response = await fetch(`${DOCKER_API_URL}/config/strategy-defaults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDefaults),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
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
