import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ApiKey {
  id: string;
  provider: 'polygon' | 'alpaca' | 'openai';
  api_key: string;
  api_secret?: string;
  mode?: 'paper' | 'live';
  is_connected: boolean;
  last_tested_at?: string;
}

export const useApiKeys = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchApiKeys = async () => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (error: any) {
      toast({
        title: 'Error fetching API keys',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const testConnection = async (
    provider: string,
    apiKey: string,
    apiSecret?: string,
    mode?: string
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke('test-api-connection', {
        body: { provider, apiKey, apiSecret, mode },
      });

      if (error) throw error;

      toast({
        title: data.isConnected ? 'Connection successful' : 'Connection failed',
        description: data.message,
        variant: data.isConnected ? 'default' : 'destructive',
      });

      await fetchApiKeys();
      return data.isConnected;
    } catch (error: any) {
      toast({
        title: 'Connection test failed',
        description: error.message,
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    apiKeys,
    loading,
    testConnection,
    refetch: fetchApiKeys,
  };
};
