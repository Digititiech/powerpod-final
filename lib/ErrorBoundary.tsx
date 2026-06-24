import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  message: string | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: null };

  static getDerivedStateFromError(error: unknown): State {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    console.error('UI crashed', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="w-full max-w-xl bg-white rounded-[40px] border border-gray-100 shadow-sm p-10">
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Application Error</h1>
          <p className="text-gray-500 mt-2 font-medium">
            A client-side error occurred. Reload the page. If the issue persists, contact an administrator.
          </p>
          {this.state.message && (
            <div className="mt-6 bg-gray-50 border border-gray-100 rounded-2xl p-4">
              <p className="text-[11px] font-mono text-gray-700 break-all">{this.state.message}</p>
            </div>
          )}
          <div className="mt-8 flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all"
            >
              Reload
            </button>
            <button
              onClick={() => this.setState({ hasError: false, message: null })}
              className="px-6 py-3 bg-white border border-gray-200 text-gray-700 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;

