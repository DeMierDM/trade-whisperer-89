import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';

const DOCKER_API_URL = 'http://localhost:3001/api';

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
      const response = await fetch(`${DOCKER_API_URL}/config/api-keys`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
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
      const response = await fetch(`${DOCKER_API_URL}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey, apiSecret, mode }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

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
