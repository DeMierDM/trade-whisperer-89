import React, { useEffect, useState } from 'react';
import { useSharedBusData } from '../hooks/useSharedBusData';

const MinimalTest = () => {
  const [testRender, setTestRender] = useState(0);

  console.log('🧪 MinimalTest render:', testRender);

  const busData = useSharedBusData(
    'test-minimal',
    ['stock.SPY.quote'],
    (message) => {
      console.log('🧪 Test message:', message.type, message.channel);
    },
    (error) => {
      console.error('🧪 Test error:', error.message);
    },
    () => {
      console.log('🧪 Test connected');
    },
    () => {
      console.log('🧪 Test disconnected');
    }
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTestRender(prev => prev + 1);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-5 font-mono">
      <h2 className="text-xl font-bold mb-4">Minimal Bus Connection Test</h2>
      <p className="mb-2">Render count: {testRender}</p>
      <p className="mb-2">Connected: {busData.connected ? 'YES' : 'NO'}</p>
      <p className="mb-2">Error: {busData.error || 'None'}</p>
      <p className="mb-2">Subscribed channels: {busData.subscribedChannels.join(', ')}</p>
      <p className="mb-2">Reconnect attempts: {busData.reconnectAttempts}</p>
    </div>
  );
};

export default MinimalTest;