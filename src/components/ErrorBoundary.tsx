import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
  fallbackTitle?: string;
  fallbackMessage?: string;
  showDetails?: boolean;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorCount: number;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null,
      errorCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('❌ [Error Boundary] Caught error:', error);
    console.error('❌ [Error Boundary] Component stack:', errorInfo.componentStack);

    this.setState(prevState => ({
      error,
      errorInfo,
      errorCount: prevState.errorCount + 1
    }));

    // Log to external error tracking service in production
    if (process.env.NODE_ENV === 'production') {
      this.logErrorToService(error, errorInfo);
    }

    // Prevent infinite error loops
    if (this.state.errorCount > 5) {
      console.error('❌ [Error Boundary] Too many errors detected. Stopping error boundary.');
    }
  }

  logErrorToService(error: Error, errorInfo: React.ErrorInfo) {
    // TODO: Integrate with Sentry, Datadog, or similar service
    const errorReport = {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    console.log('[Error Report]', errorReport);
    // Example: Sentry.captureException(error, { contexts: { react: { componentStack: errorInfo.componentStack } } });
  }

  resetError = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    const { hasError, error, errorInfo, errorCount } = this.state;
    const { fallback, fallbackTitle, fallbackMessage, showDetails } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        const FallbackComponent = fallback;
        return <FallbackComponent error={error!} resetError={this.resetError} />;
      }

      // If too many errors, show critical failure
      if (errorCount > 5) {
        return (
          <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
            <div className="max-w-2xl w-full p-8 border-red-300 bg-white rounded-lg shadow-lg">
              <div className="flex items-center gap-4 mb-6">
                <AlertTriangle className="h-12 w-12 text-red-600" />
                <div>
                  <h1 className="text-2xl font-bold text-red-900">Critical Error</h1>
                  <p className="text-red-700">Multiple errors detected. Please reload the application.</p>
                </div>
              </div>
              
              <Button onClick={this.handleReload} className="w-full">
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload Application
              </Button>
            </div>
          </div>
        );
      }

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full p-8 border-slate-300 bg-white rounded-lg shadow-lg">
            <div className="flex items-center gap-4 mb-6">
              <AlertTriangle className="h-10 w-10 text-amber-600" />
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  {fallbackTitle || 'Something went wrong'}
                </h1>
                <p className="text-slate-600 mt-1">
                  {fallbackMessage || 'An unexpected error occurred. Please try again.'}
                </p>
              </div>
            </div>

            {showDetails !== false && error && (
              <div className="mb-6 p-4 bg-slate-100 rounded-lg border border-slate-300">
                <h3 className="font-semibold text-slate-800 mb-2">Error Details:</h3>
                <p className="text-sm text-red-700 font-mono mb-2">{error.toString()}</p>
                
                {process.env.NODE_ENV === 'development' && errorInfo && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700 hover:text-slate-900">
                      Component Stack (Development Only)
                    </summary>
                    <pre className="mt-2 text-xs text-slate-600 overflow-auto max-h-40 p-2 bg-white rounded border">
                      {errorInfo.componentStack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button onClick={this.resetError} variant="default" className="flex-1">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
              <Button onClick={this.handleGoHome} variant="outline" className="flex-1">
                <Home className="mr-2 h-4 w-4" />
                Go Home
              </Button>
              <Button onClick={this.handleReload} variant="outline" className="flex-1">
                Reload Page
              </Button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <p className="mt-6 text-xs text-slate-500 text-center">
                Error #{errorCount} | Development Mode | Check console for details
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;