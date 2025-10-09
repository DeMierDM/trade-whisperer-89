import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ApiKey {
  id: string;
  provider: 'alpaca' | 'openai';
  api_key_masked: string; // Only masked version visible to client
  api_secret_masked?: string; // Only masked version visible to client
  mode?: 'paper' | 'live';
  is_connected: boolean;
  last_tested_at?: string;
  is_encrypted: boolean;
}

export const useApiKeys = () => {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchApiKeys = async () => {
    try {
      // Use the safe view that only exposes masked keys
      const { data, error } = await supabase
        .from('api_keys_safe')
        .select('*')
        .order('created_at', { ascending: false });

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
      const { data, error } = await supabase.functions.invoke('test-api-connection', {
        body: { provider, apiKey, apiSecret, mode },
      });

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
