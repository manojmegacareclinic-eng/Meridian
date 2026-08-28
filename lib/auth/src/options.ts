import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import type { BetterAuthOptions } from "better-auth";
import type { Db } from "@workspace/db";
import { getMailTransport } from "./email";
import { createSecondaryStorage } from "./secondary-storage";

export interface AuthOptionsInput {
  db: Db;
  secret: string;
  /** Optional explicit base URL; leave unset to derive from the request host. */
  baseURL?: string;
  /** Override for tests / demo. */
  sendVerificationEmailOverride?: (params: { user: { email: string }; token: string }) => Promise<void>;
}

export function buildAuthOptions(input: AuthOptionsInput): BetterAuthOptions {
  const { db, secret } = input;
  const mail = getMailTransport();
  const secondaryStorage = createSecondaryStorage(db);

  return {
    secret,
    baseURL: input.baseURL,
    database: drizzleAdapter(db, { provider: "pg" }),
    secondaryStorage,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // accounts are created by admins/CLI only
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    // Email verification is a core option in better-auth >=1.6. It gates
    // sign-in until the address is verified (requireEmailVerification above)
    // and, since `sendOnSignIn` is true, re-sends a fresh token on every
    // attempted sign-in with an unverified email.
    emailVerification: {
      sendOnSignUp: false,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        if (input.sendVerificationEmailOverride) {
          await input.sendVerificationEmailOverride({ user, token });
          return;
        }
        await mail.send(user.email, {
          subject: "Meridian — verify your email address",
          text: `Welcome to Meridian.\n\nYour email-verification token is:\n\n${token}\n\nPaste it into the verification field on the Meridian sign-in screen, or open:\n\n${url}\n\nThe token expires in 10 minutes. If you did not request this, ignore this email.`,
        });
      },
    },
    user: {
      additionalFields: {
        // Global data role. input:false => users can never self-escalate.
        role: {
          type: "string",
          required: true,
          defaultValue: "viewer",
          input: false,
        },
      },
    },
    plugins: [organization()],
    rateLimit: {
      window: 60,
      max: 5,
      storage: "secondary-storage", // Postgres KV table via secondaryStorage
      modelName: "rateLimit",
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/email-verification/verify-email": { window: 60, max: 3 },
      },
    },
  };
}