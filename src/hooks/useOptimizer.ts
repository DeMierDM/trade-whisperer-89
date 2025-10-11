import { useState } from 'react';
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

const DOCKER_API_URL = 'http://localhost:3001/api';

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

      const response = await fetch(`${DOCKER_API_URL}/optimize/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('Optimization response:', data);

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
