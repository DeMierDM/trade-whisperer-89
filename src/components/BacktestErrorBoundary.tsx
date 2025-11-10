import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class BacktestErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    console.error('[ErrorBoundary] getDerivedStateFromError:', error);
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Component crashed:', error);
    console.error('[ErrorBoundary] Error info:', errorInfo);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    
    this.setState({
      error,
      errorInfo,
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Card className="p-6 border-red-500 bg-red-500/10">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-red-500" />
              <div>
                <h2 className="text-xl font-bold text-red-500">
                  BacktestResults Component Crashed
                </h2>
                <p className="text-sm text-muted-foreground">
                  An error occurred while rendering the backtest results
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="bg-black/50 p-4 rounded-lg">
                <p className="font-semibold text-red-400 mb-2">Error:</p>
                <pre className="text-xs overflow-x-auto text-red-300">
                  {this.state.error?.toString()}
                </pre>
              </div>

              {this.state.error?.stack && (
                <div className="bg-black/50 p-4 rounded-lg">
                  <p className="font-semibold text-orange-400 mb-2">Stack Trace:</p>
                  <pre className="text-xs overflow-x-auto text-orange-300">
                    {this.state.error.stack}
                  </pre>
                </div>
              )}

              {this.state.errorInfo && (
                <div className="bg-black/50 p-4 rounded-lg">
                  <p className="font-semibold text-yellow-400 mb-2">Component Stack:</p>
                  <pre className="text-xs overflow-x-auto text-yellow-300">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-border">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600 transition"
              >
                Reload Page
              </button>
            </div>
          </div>
        </Card>
      );
    }

    return this.props.children;
  }
}
