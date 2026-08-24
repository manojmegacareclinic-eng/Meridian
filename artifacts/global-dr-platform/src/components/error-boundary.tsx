import {
  Component,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import { RefreshCw } from 'lucide-react';

export interface ErrorFallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  FallbackComponent?: ComponentType<ErrorFallbackProps>;
  /** Changing this clears a caught error. Pass the route to recover on navigation. */
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }
  if (typeof value === 'string') {
    return new Error(value);
  }
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error(String(value));
  }
}

function DefaultFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[hsl(var(--background))] p-6">
      <div className="w-full max-w-lg rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-10 text-center shadow-[0_12px_35px_hsl(190_20%_20%/.08)]">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(4_64%_48%/.12)] text-[hsl(var(--destructive))]"><RefreshCw size={22} /></div>
        <h1 className="font-serif text-2xl">A secure connection was interrupted</h1>
        <p className="mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">This part of Meridian hit an unexpected error. Your workspace data is unchanged.</p>
        {/* Dev only: messages can carry API responses and other internals. */}
        {import.meta.env.DEV ? (
          <pre className="mt-4 overflow-x-auto rounded-xl bg-[hsl(var(--muted))] p-3 text-left text-xs text-[hsl(var(--muted-foreground))]">
            {error.message || String(error)}
          </pre>
        ) : null}
        <button
          type="button"
          onClick={resetError}
          className="mt-5 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(
      'ErrorBoundary caught an error:',
      toError(error),
      info.componentStack,
    );
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    if (
      this.state.error !== null &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) {
      return this.props.children;
    }
    const Fallback = this.props.FallbackComponent ?? DefaultFallback;
    return <Fallback error={error} resetError={this.resetError} />;
  }
}
