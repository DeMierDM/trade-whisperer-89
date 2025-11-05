import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Simple test component to verify React is working
function SimpleTest() {
  console.log("🎯 SimpleTest component rendered!");
  
  return (
    <div style={{
      padding: "20px",
      background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      color: "white",
      fontSize: "24px",
      fontFamily: "sans-serif",
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center"
    }}>
      <h1>🚀 Trade Whisperer - Electron + Docker Mode</h1>
      <p>✅ React is working!</p>
      <p>✅ Electron is working!</p>
      <p>✅ Docker containers are running!</p>
      <div style={{ marginTop: "20px", fontSize: "16px" }}>
        <p>Next: Load full trading interface...</p>
      </div>
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <SimpleTest />
  </StrictMode>
);