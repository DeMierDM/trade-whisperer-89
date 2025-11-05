import React from 'react';
import { createRoot } from "react-dom/client";
import Trading from "./pages/Trading";
import { Toaster } from "@/components/ui/toaster";
import "./index.css";

console.log('🌐 Running in Codespace mode - Web version');
console.log('🔍 Trade Whisperer web app initializing...');

// Detect if running in Codespace
const isCodespace = process.env.NODE_ENV === 'development' && window.location.hostname.includes('app.github.dev');

// API URL configuration for Codespace
const getApiUrl = () => {
  if (isCodespace) {
    // In Codespace, use the forwarded port URL
    const hostname = window.location.hostname;
    return `https://${hostname.replace('8080', '3001')}`;
  }
  return 'http://localhost:3001';
};

const getWebSocketUrl = () => {
  if (isCodespace) {
    // In Codespace, use the forwarded port URL with wss
    const hostname = window.location.hostname;
    return `wss://${hostname.replace('8080', '3004')}`;
  }
  return 'ws://localhost:3004';
};

// Test API connectivity
const testAPI = async () => {
  console.log('🧪 Testing API connectivity...');
  const apiUrl = getApiUrl();
  console.log(`🔗 API URL: ${apiUrl}`);
  
  try {
    const response = await fetch(`${apiUrl}/health`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    console.log('🧪 API Health Response status:', response.status);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('🧪 API Health Success:', data);
    
    // Load Trading component
    console.log('🧪 API test passed, loading Trading component...');
    loadTradingComponent();
    
  } catch (error) {
    console.error('🧪 API test failed:', error);
    // Load Trading component anyway for development
    console.log('🧪 Loading Trading component despite API failure...');
    loadTradingComponent();
  }
};

const loadTradingComponent = () => {
  console.log('🎯 Loading Trading component...');
  
  // Set global API configuration
  (window as any).TRADE_WHISPERER_CONFIG = {
    API_URL: getApiUrl(),
    WS_URL: getWebSocketUrl(),
    IS_CODESPACE: isCodespace,
    MODE: 'web'
  };
  
  const TradingApp = () => {
    console.log('🎯 TradingApp rendering...');
    return (
      <div className="min-h-screen bg-background">
        {isCodespace && (
          <div className="bg-blue-600 text-white p-2 text-center text-sm">
            🌐 Running in GitHub Codespace | API: {getApiUrl()} | WebSocket: {getWebSocketUrl()}
          </div>
        )}
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

// Initialize the app
if (isCodespace) {
  console.log('🌐 Detected Codespace environment');
}

testAPI();