import { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { ENDPOINTS, REQUEST_CONFIG, logApiCall, createApiError } from '../lib/apiConfig';

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
      logApiCall(ENDPOINTS.API_KEYS, 'GET');

      const response = await fetch(ENDPOINTS.API_KEYS, {
        headers: REQUEST_CONFIG.DEFAULT_HEADERS,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw createApiError(errorData.error || `HTTP ${response.status}`, ENDPOINTS.API_KEYS, response.status);
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
      const testData = { provider, apiKey, apiSecret, mode };
      logApiCall(ENDPOINTS.TEST_CONNECTION, 'POST', testData);

      const response = await fetch(ENDPOINTS.TEST_CONNECTION, {
        method: 'POST',
        headers: REQUEST_CONFIG.DEFAULT_HEADERS,
        body: JSON.stringify(testData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw createApiError(errorData.error || `HTTP ${response.status}`, ENDPOINTS.TEST_CONNECTION, response.status);
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
