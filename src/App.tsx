import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";
import LivePaperTrading from "./pages/LivePaperTrading"; // Live paper trading with bot management
import Backtesting from "./pages/Backtesting"; // Historical backtesting engine
import Tuning from "./pages/Tuning";
import Diagnostics from "./pages/Diagnostics";
import History from "./pages/History";
import Settings from "./pages/Settings";
import AI from "./pages/AI";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
});

const App = () => (
  <ErrorBoundary
    fallbackTitle="Application Error"
    fallbackMessage="The trading application encountered an unexpected error. Please try again or reload the page."
    showDetails={true}
  >
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="*"
              element={
                <ProtectedRoute>
                  <ErrorBoundary
                    fallbackTitle="Protected Route Error"
                    fallbackMessage="An error occurred in the protected area. Please try logging in again."
                  >
                    <Layout>
                      <ErrorBoundary fallbackTitle="Page Error">
                        <Routes>
                          <Route path="/" element={<Home />} />
                          <Route path="/trading" element={<Navigate to="/live-trading" replace />} />
                          <Route path="/live-trading" element={<LivePaperTrading />} />
                          <Route path="/backtesting" element={<Backtesting />} />
                          <Route path="/tuning" element={<Tuning />} />
                          <Route path="/diagnostics" element={<Diagnostics />} />
                          <Route path="/history" element={<History />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="/ai" element={<AI />} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </ErrorBoundary>
                    </Layout>
                  </ErrorBoundary>
                </ProtectedRoute>
              }
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;

export default App;
