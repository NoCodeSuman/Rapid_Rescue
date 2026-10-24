import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from '../ui/misc';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('UI error', error, info.componentStack); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto max-w-lg py-20">
        <ErrorState message="This page hit an unexpected problem. Reload to try again; your local data is stored locally and is unaffected."
          action={<button className="mt-3 rounded-md bg-navy-800 px-4 py-2 text-sm font-medium text-white" onClick={() => window.location.reload()}>Reload page</button>} />
      </div>
    );
  }
}
