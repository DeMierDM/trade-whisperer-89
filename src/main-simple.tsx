import { createRoot } from "react-dom/client";
import "./index.css";

// Simple test without routing to isolate issues
function SimpleAppTest() {
  console.log("🎯 SimpleAppTest rendering...");
  
  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <h1 className="text-4xl font-bold mb-4">Trade Whisperer</h1>
      <p className="text-lg mb-4">✅ React is working in Electron!</p>
      <p className="text-lg mb-4">✅ CSS is loading!</p>
      <div className="bg-blue-600 p-4 rounded">
        <p>This is a styled component with Tailwind CSS</p>
      </div>
      <button 
        className="mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        onClick={() => console.log("🎯 Button works!")}
      >
        Test Button
      </button>
    </div>
  );
}

console.log("🔍 Simple test main.tsx executing...");

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(<SimpleAppTest />);
  console.log("✅ Simple test rendered");
} else {
  console.error("❌ Root element not found!");
}