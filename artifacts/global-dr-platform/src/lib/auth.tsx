import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useSession, signOut as clientSignOut } from '@/lib/auth-client';
import { queryClient } from '@/lib/query';

export const authDemoEnabled = (): boolean =>
  import.meta.env.VITE_AUTH_DEMO === '1' || import.meta.env.VITE_AUTH_DEMO === 'true';

export const ROLE_LABELS: Record<string, string> = {
  global_admin: 'Global Admin',
  regional_director: 'Regional Director',
  country_lead: 'Country Lead',
  research: 'Research Team',
  meeting_coordinator: 'Meeting Coordinator',
  viewer: 'Viewer',
};

export function roleLabel(role?: string | null): string {
  return role ? ROLE_LABELS[role] ?? role : '—';
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  role: string;
  roleLabel: string;
  imageUrl: string | null;
  lastSignInAt: string | null;
}

export interface SessionInfo {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: SessionUser | null;
  signOut: () => void;
}

const demoUser: SessionUser = {
  id: 'demo-session',
  name: 'Demo Analyst',
  email: 'demo@meridian.local',
  initials: 'DA',
  role: 'global_admin',
  roleLabel: 'Global Admin',
  imageUrl: null,
  lastSignInAt: null,
};

const noop = (): void => {};

function toSessionUser(user: {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: string | null;
  createdAt?: string | Date | null;
}): SessionUser {
  const role = typeof user.role === 'string' ? user.role : 'viewer';
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    initials:
      user.name
        .split(' ')
        .filter(Boolean)
        .map((part) => part[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || '·',
    role,
    roleLabel: roleLabel(role),
    imageUrl: user.image ?? null,
    // better-auth exposes no "last sign-in" in the session payload; keep the
    // field for the Settings panel, leave null in this migration.
    lastSignInAt: null,
  };
}

const SessionContext = createContext<SessionInfo>({
  isLoaded: true,
  isSignedIn: false,
  user: null,
  signOut: noop,
});

export function useSessionInfo(): SessionInfo {
  return useContext(SessionContext);
}

function BetterAuthBridge({ children }: { children: ReactNode }) {
  const { data, isPending, refetch } = useSession();

  const value = useMemo<SessionInfo>(() => {
    if (isPending) {
      return { isLoaded: false, isSignedIn: false, user: null, signOut: noop };
    }
    const sessionUser = data?.user;
    if (!sessionUser?.id) {
      return { isLoaded: true, isSignedIn: false, user: null, signOut: noop };
    }
    return {
      isLoaded: true,
      isSignedIn: true,
      user: toSessionUser(sessionUser as Parameters<typeof toSessionUser>[0]),
      signOut: () => {
        void clientSignOut();
        void queryClient.clear();
        void refetch();
      },
    };
  }, [data, isPending, refetch]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Session provider. Two modes:
 * - VITE_AUTH_DEMO=1: demo session (global_admin), no backend contact —
 *   frontend-only development. Pair with the API's AUTH_PASSTHROUGH.
 * - Default: real Better Auth session fetched from the API via the vite
 *   `/api` proxy (same-origin cookies).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  if (authDemoEnabled()) {
    return (
      <SessionContext.Provider
        value={{ isLoaded: true, isSignedIn: true, user: demoUser, signOut: noop }}
      >
        {children}
      </SessionContext.Provider>
    );
  }
  return <BetterAuthBridge>{children}</BetterAuthBridge>;
}