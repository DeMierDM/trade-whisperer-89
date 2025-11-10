import React from 'react';
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

console.log('🚀 MAIN APP STARTING - Full app with navigation');

const loadMainApp = () => {
  console.log('🎯 Loading main App component with navigation...');
  
  const rootElement = document.getElementById("root");
  if (rootElement) {
    const root = createRoot(rootElement);
    root.render(<App />);
    console.log("✅ Main app rendered successfully with hamburger navigation");
  } else {
    console.error("❌ Root element not found!");
  }
};

// Load the full app
loadMainApp();
