import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export function isExtensionOrNoiseError(err: any): boolean {
  if (!err) return false;
  const msg = typeof err === 'string' ? err : (err.message || err.reason || err.stack || String(err));
  return (
    msg.includes('tabs:outgoing.message.ready') ||
    msg.includes('No Listener') ||
    msg.includes('extension context invalidated') ||
    msg.includes('chrome-extension://') ||
    msg.includes('moz-extension://') ||
    msg.includes('safari-extension://') ||
    msg.includes('ResizeObserver loop') ||
    msg.includes('Could not establish connection') ||
    msg.includes('message channel closed') ||
    msg.includes('The message port closed before a response was received') ||
    msg.includes('Receiving end does not exist')
  );
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> | null {
    // If it's a browser extension error, don't trigger the error fallback UI
    if (isExtensionOrNoiseError(error)) {
      return null;
    }
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (isExtensionOrNoiseError(error)) {
      console.warn('[Ignored Browser Extension Error]:', error);
      return;
    }
    console.error('Uncaught React Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    try {
      // Clear session/cache if needed and hard reload page cleanly
      sessionStorage.clear();
      window.location.reload();
    } catch (e) {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center dir-rtl font-sans">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-lg shadow-2xl space-y-6">
            <div className="w-16 h-16 bg-red-500/10 text-red-400 rounded-full flex items-center justify-center mx-auto text-3xl font-bold">
              ⚠️
            </div>
            
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-100">حدث خطأ غير متوقع في التطبيق</h2>
              <p className="text-slate-400 text-sm">
                An unexpected system error occurred. Please click below to refresh and load the latest version.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950/60 p-4 rounded-xl text-xs font-mono text-slate-400 text-left overflow-x-auto max-h-36 dir-ltr border border-slate-800">
                {this.state.error.toString()}
              </div>
            )}

            <div className="pt-2">
              <button
                onClick={this.handleReload}
                className="w-full py-3 px-6 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5 animate-spin-slow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                تحديث الصفحة وتنشيط النظام / Refresh App
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

