import { Routes, Route } from "react-router-dom";
import Trading from "./pages/Trading";
import { Toaster } from "@/components/ui/toaster";
import MinimalTest from "./components/MinimalTest";

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Trading />} />
        <Route path="/trading" element={<Trading />} />
        <Route path="/test" element={<MinimalTest />} />
      </Routes>
      <Toaster />
    </div>
  );
}

export default App;