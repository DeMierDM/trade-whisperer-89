import React from 'react';
import { createRoot } from "react-dom/client";
import Trading from "./pages/Trading";
import { Toaster } from "@/components/ui/toaster";
import "./index.css";

console.log('🚀 HOT RELOAD TEST V6 - React is working! Testing hot reload now...');
console.log('🔍 Direct Trading test main.tsx executing...');

// Simple API test first
const testAPI = async () => {
  console.log('🧪 Testing API call directly...');
  try {
    const now = Date.now();
    const start = new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(now).toISOString();

    const response = await fetch('http://localhost:3001/api/fetch-market-data', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dataType: "bars",
        symbol: "SPY",
        start: start,
        end: end,
        timeframe: '1Min'
      }),
    });

    console.log('🧪 API Response status:', response.status);
    console.log('🧪 API Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('🧪 API Error body:', errorText);
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('🧪 API Success! Data length:', data.results?.length || 0);
    
    // If API test passes, load Trading component
    console.log('🧪 API test passed, loading Trading component...');
    loadTradingComponent();
    
  } catch (error) {
    console.error('🧪 API test failed:', error);
    // Load Trading component anyway for testing
    console.log('🧪 Loading Trading component despite API failure...');
    loadTradingComponent();
  }
};

const loadTradingComponent = () => {
  console.log('🎯 Loading Trading component...');
  
  const TradingApp = () => {
    console.log('🎯 TradingApp rendering...');
    return (
      <div className="min-h-screen bg-background">
        <Trading />
        <Toaster />
      </div>
    );
  };

  const rootElement = document.getElementById("root");
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<TradingApp />);
    console.log("✅ Trading app rendered successfully");
  } else {
    console.error("❌ Root element not found!");
  }
};

const loadErrorDisplay = () => {
  console.log('🚨 Loading error display...');
  
  const ErrorDisplay = () => (
    <div className='p-5 text-red-500 font-mono bg-slate-900 min-h-screen'>
      <h2 className='text-xl mb-4'>API Connection Failed</h2>
      <p className='mb-2'>Could not connect to the trading API at localhost:3001</p>
      <p>Check the console for detailed error information</p>
    </div>
  );

  const rootElement = document.getElementById("root");
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<ErrorDisplay />);
    console.log("✅ Error display rendered");
  }
};

// Start API test and load app
testAPI();
