import { createAuthClient } from 'better-auth/react';
import {
  inferAdditionalFields,
  organizationClient,
} from 'better-auth/client/plugins';

export type SessionUserRole = string;

// better-auth's client requires an absolute base URL. The SPA and the auth
// endpoints share an origin (the Vite /api proxy), so derive it at runtime.
const apiOrigin = typeof window !== "undefined"
  ? window.location.origin
  : "http://localhost:5173";

export const authClient = createAuthClient({
  baseURL: `${apiOrigin}/api/auth`,
  plugins: [
    // Surface the custom `role` additional field on typed session users.
    inferAdditionalFields<{ user: { role: string } }>({
      user: { role: { type: 'string' } },
    }),
    organizationClient(),
  ],
});

export const { useSession, signIn, signOut } = authClient;

// better-auth >=1.6 exposes email verification as core endpoints rather than a
// client plugin:
//   GET  /api/auth/email-verification/verify-email?token=…  — verifies and
//        sets the session cookie (autoSignInAfterVerification).
//   POST /api/auth/email-verification/send-verification-email — (re)sends the
//        email containing the token.
// We call them same-origin through the Vite /api proxy so the session cookie
// keeps a stable host.
export async function sendVerificationEmail(email: string): Promise<void> {
  await fetch('/api/auth/email-verification/send-verification-email', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export async function verifyEmailToken(
  token: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `/api/auth/email-verification/verify-email?token=${encodeURIComponent(token)}&callbackURL=/`,
    { headers: { accept: 'application/json' } },
  );
  if (res.ok) return { ok: true };
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return { ok: false, error: body?.error ?? 'Verification failed. Try again.' };
}