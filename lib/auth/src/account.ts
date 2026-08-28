// Spike findings (Task 2.1) — better-auth 1.7.2 semantics pinned against the
// installed package (node_modules/.bun/better-auth@1.7.2*/.../dist):
//
// 1. auth.api.createUser — EXISTS, via the ADMIN plugin (`admin()` from
//    "better-auth/plugins"; HTTP route POST /api/auth/admin/create-user).
//    Callable server-side with NO session (`{ method: "admin" }` bypasses
//    `additionalFields.role.input=false`), accepts `role: string | string[]`
//    (single strings pass parseRoles untouched), lowercases the email, hashes
//    the password internally and links a credential account. Duplicate email
//    -> APIError "user_already_exists".
// 2. `disableSignUp: true` blocks ONLY the public sign-up route
//    (dist/api/routes/sign-up.mjs throws BAD_REQUEST). It does NOT block
//    auth.api.createUser.
// 3. RequireEmailVerification: unverified sign-in -> HTTP FORBIDDEN with code
//    `EMAIL_NOT_VERIFIED` (sign-in.mjs). With sendOnSignIn:true a fresh token
//    is auto-sent first.
// 4. sendVerificationEmail (POST /api/auth/send-verification-email) exists as
//    `auth.api.sendVerificationEmail({ body: { email } })`. When called with no
//    session it does NOT enforce a session-email match (constant-time 500ms
//    floor; silent for unknown/already-verified addresses). With a session it
//    enforces EMAIL_MISMATCH / EMAIL_ALREADY_VERIFIED.
// 5. OTP storage — the core email-verification flow does NOT use the
//    `verification` table in 1.7.2. Verification is a JWT: payload `{ email }`,
//    HS256 over the plain-text secret, exp = now + expiresIn (default 3600s).
//    Verify endpoint: GET /api/auth/verify-email?token=...&callbackURL=...
//    (sets emailVerified and auto-signs-in when autoSignInAfterVerification).
//    The `verification` table is only used by magic-link/recovery and the
//    email-otp plugin. => `createAccount` mints the same token shape ourselves
//    via signJWT("better-auth/crypto") so the CLI/QA can return it directly;
//    the token is interchangeable with better-auth's own.
// 6. rateLimit customRules keys are endpoint paths relative to the auth router
//    (`/sign-in/email`, `/verify-email`); fixed in options.ts.
import { signJWT } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { userTable, type Db } from "@workspace/db";
import type { WorkspaceRole } from "./roles";
import { sendVerificationMessage } from "./email";

export interface CreateAccountInput {
  email: string;
  name: string;
  role: WorkspaceRole;
  /** Bootstrap escape: mark emailVerified, skip token, print the temp password. */
  verify: boolean;
}

export interface CreateAccountResult {
  user: { id: string; email: string; name: string; role: WorkspaceRole };
  tempPassword: string;
  /** Verification token (10-minute JWT) when !verify. Also mailed. */
  verificationToken: string | null;
}

/** Loose structural type; `betterAuth(...)` instances satisfy it. */
export interface CreateAccountAuth {
  api: {
    // `body` is deliberately `any`: the admin plugin types `role` as its own
    // "admin" | "user" union, while the runtime accepts any string value.
    createUser: (opts: any) => Promise<{
      user: { id: string; email: string; name: string };
    }>;
  };
}

function randomTempPassword(): string {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(18))).toString(
    "base64url",
  );
}

const VERIFICATION_TOKEN_TTL_SECONDS = 10 * 60;

function verificationURL(baseURL: string, token: string): string {
  return `${baseURL}/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent("/")}`;
}

async function issueVerificationToken(input: {
  secret: string;
  email: string;
  baseURL: string;
}): Promise<string> {
  const token = await signJWT({ email: input.email }, input.secret, VERIFICATION_TOKEN_TTL_SECONDS);
  await sendVerificationMessage(input.email, token);
  return token;
}

export async function createAccount(opts: {
  auth: CreateAccountAuth;
  db: Db;
  secret: string;
  input: CreateAccountInput;
  /** Base URL used for the verification link in the mail body. */
  baseURL?: string;
}): Promise<CreateAccountResult> {
  const { auth, db, secret, input } = opts;
  const baseURL = opts.baseURL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:5173";
  const tempPassword = randomTempPassword();
  const created = await auth.api.createUser({
    body: {
      email: input.email,
      name: input.name,
      password: tempPassword,
      role: input.role,
    },
  });
  if (input.verify) {
    await db
      .update(userTable)
      .set({ emailVerified: true })
      .where(eq(userTable.id, created.user.id));
    return {
      user: {
        id: created.user.id,
        email: created.user.email,
        name: created.user.name,
        role: input.role,
      },
      tempPassword,
      verificationToken: null,
    };
  }
  const verificationToken = await issueVerificationToken({ secret, email: created.user.email.toLowerCase(), baseURL });
  return {
    user: {
      id: created.user.id,
      email: created.user.email,
      name: created.user.name,
      role: input.role,
    },
    tempPassword,
    verificationToken,
  };
}