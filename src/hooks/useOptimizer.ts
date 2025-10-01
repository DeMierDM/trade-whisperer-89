import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface OptimizerConfig {
  strategy: string;
  objective: string;
  startDate: string;
  endDate: string;
  walkForwardFolds: number;
  trialBudget: number;
  sampler: string;
  pruner: string;
}

export interface OptimizationResults {
  bestScore: number;
  bestParams: Record<string, number>;
  totalTrials: number;
  trials: Array<{
    trial_number: number;
    parameters: Record<string, number>;
    score: number;
    metrics: any;
  }>;
}

export const useOptimizer = () => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<OptimizationResults | null>(null);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();

  const startOptimization = async (config: OptimizerConfig) => {
    setLoading(true);
    setResults(null);
    setProgress(0);

    try {
      console.log('Starting optimization with config:', config);
      
      const { data, error } = await supabase.functions.invoke('strategy-optimizer', {
        body: config,
      });

      console.log('Optimization response:', data);
      console.log('Optimization error:', error);

      if (error) {
        console.error('Optimization invocation error:', error);
        throw error;
      }

      if (!data) {
        throw new Error('No response data from optimizer');
      }

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.success) {
        throw new Error(data.message || 'Optimization failed');
      }

      console.log('Optimization completed successfully');
      setResults(data);
      setProgress(100);

      toast({
        title: 'Optimization Complete',
        description: `Best ${config.objective}: ${(data.bestScore ?? 0).toFixed(4)}`,
      });
    } catch (error: any) {
      console.error('Optimization error:', error);
      toast({
        title: 'Optimization Failed',
        description: error.message || 'An unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    results,
    progress,
    startOptimization,
  };
};
