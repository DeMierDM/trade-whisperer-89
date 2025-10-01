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
      console.log('Fetching API keys...');
      
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      console.log('API keys response:', data);
      console.log('API keys error:', error);

      if (error) {
        console.error('Error fetching API keys:', error);
        throw error;
      }
      
      setApiKeys(data || []);
    } catch (error: any) {
      console.error('Error in fetchApiKeys:', error);
      toast({
        title: 'Error fetching API keys',
        description: error.message || 'Failed to load API keys',
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
      console.log(`Testing ${provider} connection...`);
      
      const { data, error } = await supabase.functions.invoke('test-api-connection', {
        body: { provider, apiKey, apiSecret, mode },
      });

      console.log('Test connection response:', data);
      console.log('Test connection error:', error);

      if (error) {
        console.error('Connection test invocation error:', error);
        throw error;
      }

      if (!data) {
        throw new Error('No response from connection test');
      }

      toast({
        title: data.isConnected ? 'Connection successful' : 'Connection failed',
        description: data.message || 'Connection test completed',
        variant: data.isConnected ? 'default' : 'destructive',
      });

      await fetchApiKeys();
      return data.isConnected;
    } catch (error: any) {
      console.error('Error in testConnection:', error);
      toast({
        title: 'Connection test failed',
        description: error.message || 'Failed to test connection',
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
