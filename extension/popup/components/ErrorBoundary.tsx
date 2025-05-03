import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode; // Optional custom fallback UI
}

interface State {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service here
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      // Render custom fallback UI if provided, otherwise a default one
      return this.props.fallback ? this.props.fallback : (
        <div className="p-4 text-center text-red-600">
          <h2 className="text-xl font-semibold mb-2">Oops! Something went wrong.</h2>
          <p className="mb-2">An unexpected error occurred in the application.</p>
          {this.state.error && (
              <pre className="text-xs text-left bg-red-100 p-2 rounded overflow-auto">
                  {this.state.error.toString()}
              </pre>
          )}
          <button
            onClick={() => window.location.reload()} // Simple recovery: reload
            className="mt-4 px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          >
            Reload Extension
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 