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
      const { data, error } = await supabase.functions.invoke('strategy-optimizer', {
        body: config,
      });

      if (error) throw error;

      if (data.success) {
        setResults(data);
        setProgress(100);

        toast({
          title: 'Optimization Complete',
          description: `Best ${config.objective}: ${data.bestScore.toFixed(4)}`,
        });
      }
    } catch (error: any) {
      console.error('Optimization error:', error);
      toast({
        title: 'Optimization Failed',
        description: error.message,
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
