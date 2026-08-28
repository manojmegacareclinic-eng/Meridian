import { createRootRoute, Outlet } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { Shell, QuickAddListener, NotFound, SignInScreen } from '@/App';
import { queryClient } from '@/lib/query';
import { useSessionInfo } from '@/lib/auth';

function AuthScreen() {
  const { isLoaded } = useSessionInfo();

  if (!isLoaded) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))]">
        <div className="flex flex-col items-center gap-3">
          <span className="h-10 w-10 animate-pulse rounded-[13px] bg-[hsl(var(--primary))]" />
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">
            Preparing the workspace
          </p>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SignInScreen />
    </QueryClientProvider>
  );
}

function Layout() {
  const { isLoaded, isSignedIn } = useSessionInfo();

  if (!isLoaded || !isSignedIn) {
    return <AuthScreen />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Shell>
        <Outlet />
      </Shell>
      <QuickAddListener />
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({
  component: Layout,
  notFoundComponent: NotFound,
});