# Self-hosted Authentication (Better Auth) Migration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Clerk with self-hosted Better Auth (email + password, email verification via OTP, single workspace org, rate limiting, admin panel) so sign-in works on this network, which blocks Clerk's external `*.clerk.accounts.dev` origin.

**Architecture:** Better Auth runs inside the Express API server, mounted at `/api/auth/*splat` **before** `express.json()`. Sessions are DB-backed httpOnly `sameSite=lax` cookies; the SPA authenticates via the same-origin vite `/api` proxy (no bearer-token plumbing). The API enforces `401` for unauthenticated traffic and a write-role guard (`viewer` read-only) on every `/api` route except `GET /api/healthz`. Auth config lives in a new `@workspace/auth` package shared by the API server and the `create-user` CLI.

**Tech Stack:** better-auth 1.7.2 (drizzle adapter, email/org/rate-limit plugins, React client), Express 5, Drizzle (PostgreSQL), Zod v4, Vite + TanStack Router SPA, Bun workspaces.

---

**Spec:** `docs/superpowers/specs/2026-08-28-better-auth-migration-design.md` (Approved). Read it first. This plan implements it.

**Relevant docs/skills:** `docs/roles-and-permissions.md`, `docs/implementation-plan.md`, `README.md`, `artifacts/api-server/.env.example`, `artifacts/global-dr-platform/.env.example`. Follow @test-driven-development-style verification where testable; this repo has **no test runner** (no vitest), so isolated verification scripts under `scripts/src/` print PASS/FAIL lines (matches the repo's existing QA style — see the two earlier task #2 verification sessions).

**Environment facts the implementer must know:**
- This network **blocks external domains** (Clerk, SMTP, OAuth all unreachable). Email verification is therefore console-transport by default; SMTP/OAuth are config-only.
- Local Postgres **is** reachable (`pg_isready`: `/tmp:5432` accepting). `@workspace/db` **throws at import** unless `DATABASE_URL` is set. No `.env` loading exists anywhere; env vars are passed inline to commands (existing repo pattern).
- Express is **v5** — the catch-all mount must be `app.all("/api/auth/*splat", ...)`.
- `bun run typecheck` = `tsc --build` (libs) + per-workspace `tsc --noEmit`. `bun run build` = typecheck + esbuild bundles. The Web build is `vite build`. esbuild `build.mjs` already externals `nodemailer` and `playwright`.
- Web route generation: new SPA route files must run `tsr generate` (the web package does this automatically in its `dev`/`typecheck`/`build` scripts).
- Git: the repo index was restored in a prior session and 42 files are staged-but-uncommitted. **Do not** `git add -A` or commit those unrelated staged files. Commit explicit paths only, as done for the spec (`git commit -m "..." -- <exact paths>`).

---

## File Structure Map

New/modified files, and the ownership boundary of each. Follow existing patterns in `lib/db/src/schema/*.ts`, `artifacts/api-server/src/routes/*.ts`, and `artifacts/global-dr-platform/src/*`.

```
lib/auth/                          NEW workspace package (@workspace/auth) — shared auth seam
  package.json                     + drizzle-orm, better-auth, @workspace/db, nodemailer (gated later)
  tsconfig.json                    mirror lib/db/tsconfig.json
  src/index.ts                     re-export roles/options/secondary/account/org/email
  src/roles.ts                     WORKSPACE_ROLES, WRITE_ROLES, WorkspaceRole, isWorkspaceRole, WORKSPACE_ORG
  src/email.ts                     MailTransport (console default; nodemailer when SMTP_HOST set)
  src/secondary-storage.ts         createSecondaryStorage(db) — rate_limit KV table
  src/options.ts                   buildAuthOptions({ db, secret }) -> betterAuth options
  src/account.ts                   createAccount({ auth, db, input }) — temp password + verification code
  src/org.ts                       ensureWorkspaceOrg(db, user) — idempotent "Meridian" seed
lib/db/src/schema/auth.ts          NEW: user, session, account, verification, organization, member, invitation, rate_limit
lib/db/src/schema/index.ts         add export * from "./auth";

artifacts/api-server/src/lib/auth.ts      NEW: export const auth = betterAuth(buildAuthOptions(...)); requireEnv BETTER_AUTH_SECRET
artifacts/api-server/src/middlewares/guards.ts   NEW (replaces clerkAuth.ts): authPassthrough(), requireSession(), requireDataRole(), requireWriteRole()
artifacts/api-server/src/middlewares/clerkAuth.ts  DELETE
artifacts/api-server/src/routes/index.ts   REWRITE mount order: healthRouter -> requireSession -> adminRouter -> requireWriteRole -> platformRouter
artifacts/api-server/src/routes/admin.ts   NEW (phase 3): adminRouter (users/members/invitations/role)
artifacts/api-server/src/app.ts            ADD auth handler before body parsers
artifacts/api-server/package.json          remove @clerk/*; add better-auth, @workspace/auth
artifacts/api-server/.env.example          rewrite (drop CLERK_*; add BETTER_AUTH_SECRET, AUTH_PASSTHROUGH, SMTP_*/GOOGLE_*/GITHUB_*)

lib/api-spec/openapi.yaml            ADD admin endpoints + auth-related types (phase 3) -> codegen regenerates api-zod + api-client-react
lib/api-spec/package.json            unchanged
lib/api-client-react/package.json    unchanged (regenerated by orval)

artifacts/global-dr-platform/src/lib/auth-client.ts  NEW: createAuthClient + inferAdditionalFields/emailVerificationClient/organizationClient
artifacts/global-dr-platform/src/lib/auth.tsx        REWRITE: SessionProvider w/ useSession + VITE_AUTH_DEMO
artifacts/global-dr-platform/src/App.tsx             SignInScreen -> form+OTP; drop SignInButton/clerkConfigured; nav "Administration" (phase 3)
artifacts/global-dr-platform/src/routes/admin.tsx    NEW (phase 3): /admin route
artifacts/global-dr-platform/package.json            remove @clerk/*; add better-auth, @workspace/auth? (client only imports better-auth/react)
artifacts/global-dr-platform/.env.example            rewrite (drop VITE_CLERK_PUBLISHABLE_KEY; add VITE_AUTH_DEMO)

scripts/package.json                 add deps @workspace/auth, @workspace/db, better-auth; devDep playwright; scripts create-user + auth-qa + route-qa
scripts/src/create-user.ts           NEW CLI: create-user <email> <name> [--role R] [--verify]
scripts/src/auth-qa.ts               NEW DB-backed auth verification script (phase 2)
scripts/src/route-qa.ts              NEW Playwright route/manual QA helper

docs/implementation-plan.md          Task #2 rewritten "Self-hosted sign-in (Better Auth)"; decision note updated
docs/roles-and-permissions.md        rewritten for Better Auth
README.md                            Authentication section rewritten
```

## Chunk 1: Core swap and guards (Tasks 0.1–1.2)

## Phase 0 — Foundation

### Task 0.1: Install better-auth and scaffold `@workspace/auth`

**Files:**
- Create: `lib/auth/package.json`, `lib/auth/tsconfig.json`, `lib/auth/src/index.ts`, `lib/auth/src/roles.ts`
- Modify: `artifacts/api-server/package.json`, `artifacts/global-dr-platform/package.json`, `scripts/package.json`, root `package.json` (catalog entry optional)

- [x] **Step 1: Install packages**

```bash
bun add --filter @workspace/api-server better-auth
bun add --filter @workspace/global-dr-platform better-auth
bun add --filter @workspace/scripts better-auth
```

Expected: bun resolves `better-auth@1.7.2` (latest 1.x) in each workspace. `rg '"better-auth"' bun.lock` shows entries.

- [x] **Step 2: Scaffold the `@workspace/auth` package**

`lib/auth/package.json`:
```json
{
  "name": "@workspace/auth",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "@workspace/db": "workspace:*",
    "better-auth": "1.7.2",
    "drizzle-orm": "catalog:"
  }
}
```

`lib/auth/tsconfig.json` — copy `lib/db/tsconfig.json` verbatim.

**✋ Verify the skin of the shared seam now (design check, not code):** `lib/auth` may NOT import `@workspace/db`'s live `db`/`pool` from its top-level `index.ts` (that module throws at import without `DATABASE_URL`). Every function below takes the `db` instance as an argument; only `npm-package type import` (`import type`) is allowed at module top. `@workspace/db` must export table types only when imported as types. If needed, import from `"@workspace/db/src/schema/auth"` for types. Do a small sanity run in step 4.

- [x] **Step 3: Write `lib/auth/src/roles.ts`**

```ts
export const WORKSPACE_ROLES = [
  "global_admin",
  "regional_director",
  "country_lead",
  "research",
  "meeting_coordinator",
  "viewer",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

// Roles permitted to create, update, or delete records. `viewer` is read-only.
export const WRITE_ROLES: ReadonlySet<WorkspaceRole> = new Set(
  WORKSPACE_ROLES.filter((role) => role !== "viewer"),
);

export function isWorkspaceRole(role: unknown): role is WorkspaceRole {
  return (
    typeof role === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(role)
  );
}

export const WORKSPACE_ORG = { name: "Meridian", slug: "meridian" } as const;

export const ORG_OWNER_ROLE = "owner" as const;
export const ORG_MEMBER_ROLE = "member" as const;
```

- [x] **Step 4: `lib/auth/src/index.ts` placeholder + verify package resolves**

```ts
export * from "./roles";
```

```bash
bun run --filter @workspace/auth typecheck
```
Expected: PASS (add `"typecheck": "tsc -p tsconfig.json --noEmit"` to `lib/auth/package.json` first if the lib tsconfigs live in the root build — check `lib/db/package.json`; if the root `typecheck:libs` uses `tsc --build`, add `lib/auth` to the root `tsconfig.json` references, mirroring how `lib/db` is referenced).

- [x] **Step 5: Commit**

```bash
git add lib/auth/package.json lib/auth/tsconfig.json lib/auth/src/index.ts lib/auth/src/roles.ts \
  artifacts/api-server/package.json artifacts/global-dr-platform/package.json scripts/package.json bun.lock
git commit -m "chore(auth): scaffold @workspace/auth package and install better-auth"
```

(Adjust `--` form if hook rejects staging wildcards; stage exact paths only — never `git add -A`.)

---

### Task 0.2: Drizzle schema for auth tables

**Files:**
- Create: `lib/db/src/schema/auth.ts`
- Modify: `lib/db/src/schema/index.ts`

- [x] **Step 1: Write `lib/db/src/schema/auth.ts`**

```ts
import {
  boolean,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  pgTable,
} from "drizzle-orm/pg-core";

// Better Auth core + plugin tables. Names are deliberately lowercase to match
// better-auth's Drizzle adapter model names (user, session, account,
// verification) and the organization plugin's tables. `role` is a custom
// column added via additionalFields: { input: false }.

export const userTable = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessionTable = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
});

export const accountTable = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verificationTable = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const organizationTable = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  metadata: text("metadata"),
});

export const memberTable = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("member_org_user_idx").on(table.organizationId, table.userId)],
);

export const invitationTable = pgTable("invitation", {
  id: text("id").primaryKey(),
  organizationId: text("organization_id")
    .notNull()
    .references(() => organizationTable.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role"),
  status: text("status").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  inviterId: text("inviter_id")
    .notNull()
    .references(() => userTable.id, { onDelete: "cascade" }),
});

// KV table backing better-auth's SecondaryStorage (rate limiter), per the
// spec's "Postgres-backed, no Redis" decision. Key/value are text but the
// value stored is a JSON number from better-auth.
export const rateLimitTable = pgTable("rate_limit", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

- [x] **Step 2: Export from `lib/db/src/schema/index.ts`**

```ts
export * from "./auth";
```

- [x] **Step 3: Typecheck + push**

```bash
bun run typecheck:libs
```
Expected: PASS, no unused imports.

```bash
DATABASE_URL="postgresql://localhost:5432/meridian" bun run --filter @workspace/db push
```
Expected: drizzle-kit confirms created tables `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`, `rate_limit`. (If that exact `DATABASE_URL` is wrong for the local PG, use the working `DATABASE_URL` that the DB-backed steps in later tasks use, and note it for Task 2.x. Confirm via `psql $DATABASE_URL -c "\dt"`.)

- [x] **Step 4: Commit**

```bash
git add lib/db/src/schema/auth.ts lib/db/src/schema/index.ts
git commit -m "feat(db): add better-auth core, org and rate-limit tables"
```

---

### Task 0.3: Emit guards middleware (replaces `clerkAuth.ts`)

Delete the Clerk middleware; a new `guards.ts` enforces the same three tiers with a Better Auth session, plus the two dev flags (`AUTH_PASSTHROUGH` for the API; the SPA flag is `VITE_AUTH_DEMO` in Task 1.4).

**Files:**
- Create: `artifacts/api-server/src/middlewares/guards.ts`
- Delete: `artifacts/api-server/src/middlewares/clerkAuth.ts`
- Modify: `artifacts/api-server/src/lib/auth.ts` (create now), `artifacts/api-server/src/routes/index.ts`
- Create: `lib/auth/src/options.ts`, `lib/auth/src/secondary-storage.ts`, `lib/auth/src/email.ts`; export them from `lib/auth/src/index.ts`

- [x] **Step 1: `lib/auth/src/email.ts`**

```ts
export interface MailMessage {
  subject: string;
  text: string;
}

export interface MailTransport {
  send(to: string, message: MailMessage): Promise<void>;
}

/**
 * Console transport is the default: on this network external hosts (SMTP)
 * are unreachable, and it still exercises the full verification flow. Switch
 * to SMTP by adding SMTP_* env vars.
 */
export const consoleMail: MailTransport = {
  async send(to, message) {
    console.info("\n[Mail:console]");
    console.info(`  to: ${to}`);
    console.info(`  subject: ${message.subject}`);
    console.info(`  body:\n${message.text}`);
    console.info("[End mail]\n");
  },
};

let smtp: MailTransport | null = null;

export function getMailTransport(): MailTransport {
  if (process.env.SMTP_HOST) {
    if (!smtp) smtp = createSmtpTransport();
    return smtp;
  }
  return consoleMail;
}

function createSmtpTransport(): MailTransport {
  const nodemailer = require("nodemailer") as typeof import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  const from = process.env.SMTP_FROM ?? '"Meridian" <no-reply@meridian.local>';
  return {
    async send(to, message) {
      await transport.sendMail({ from, to, subject: message.subject, text: message.text });
    },
  };
}
```

> Note: `nodemailer` is loaded lazily — the build's `external` list already covers it; if `nodemailer` is not installed as a dependency it simply falls back to console when unset. Add `nodemailer` to `lib/auth` `dependencies` in Task 2.2 (email verification task) only if we want the SMTP path shipped; on this network it stays inert either way. Use `createRequire(import.meta.url)` if the package is ESM-bundled (see `build.mjs` banner). **Spike note:** confirm `nodemailer` resolves under esbuild at first `bun run build`.

- [x] **Step 2: `lib/auth/src/secondary-storage.ts`**

```ts
import { and, eq, gt } from "drizzle-orm";
import { rateLimitTable, type Db } from "@workspace/db";

/**
 * Postgres-backed Storage for better-auth's `rateLimiter` plugin
 * (`storage: "secondary-storage"`). JSON-count KV with a TTL column.
 */
export function createSecondaryStorage(db: Db) {
  return {
    async get(key: string): Promise<string | null> {
      const [row] = await db
        .select({ value: rateLimitTable.value })
        .from(rateLimitTable)
        .where(
          and(eq(rateLimitTable.key, key), gt(rateLimitTable.expiresAt, new Date())),
        );
      return row?.value ?? null;
    },
    async set(key: string, value: string, ttl: number): Promise<void> {
      const expiresAt = new Date(Date.now() + ttl * 1000);
      await db
        .insert(rateLimitTable)
        .values({ key, value, expiresAt })
        .onConflictDoUpdate({
          target: rateLimitTable.key,
          set: { value, expiresAt },
        });
    },
    async delete(key: string): Promise<void> {
      await db.delete(rateLimitTable).where(eq(rateLimitTable.key, key));
    },
  };
}
```

> `Db` type: in `@workspace/db`, the drizzle instance type `db` is `PostgresJsDatabase<typeof schema>` in `lib/db/src/index.ts`. Export it there as `export type Db = typeof db;` (add to `lib/db/src/index.ts`, small, Task 0.3 also touches that file transiently — safe).

- [x] **Step 3: `lib/auth/src/options.ts`**

```ts
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailVerification, organization, rateLimiter } from "better-auth/plugins";
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

export function buildAuthOptions(input: AuthOptionsInput) {
  const { db, secret } = input;
  const mail = getMailTransport();

  return {
    secret,
    baseURL: input.baseURL,
    database: drizzleAdapter(db, { provider: "pg" }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // accounts are created by admins/CLI only
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    // Email + OTP. `sendOnSignUp: false` — emails are sent at account
    // creation via the shared `issueVerificationCode` path, not on sign-up
    // (there is no open sign-up).
    emailVerification: {
      sendOnSignUp: false,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, token }) => {
        if (input.sendVerificationEmailOverride) {
          await input.sendVerificationEmailOverride({ user, token });
          return;
        }
        await mail.send(user.email, {
          subject: "Meridian — verify your email address",
          text: `Your Meridian verification code is ${token}. It expires in 10 minutes. If you did not request this, ignore this email.`,
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
    plugins: [
      emailVerification(),
      organization(),
      rateLimiter({
        window: 60,
        max: 5,
        storage: "secondary-storage",
        modelName: "rateLimit",
        secondaryStorage: createSecondaryStorage(db),
        // Per-route tightening: verification code requests are rarer.
        routes: {
          "/sign-in/email": { window: 60, max: 5 },
          "/email-verification/verify-email": { window: 60, max: 3 },
        },
        customResponse: () =>
          new Response(JSON.stringify({ error: "too many requests" }), {
            status: 429,
            headers: { "content-type": "application/json" },
          }),
      }),
    ],
  };
}
```

> **⚠️ Spike (Task 2.1 pins these — do not re-decide here):** the `routes` per-path object on the `rateLimiter` plugin may not exist in the installed better-auth version. If typing/verification fails, drop the `routes` key and rely on the global 5/60 window. `Task 2.1` confirms.

- [x] **Step 4: Export from `lib/auth/src/index.ts`** (after stubbing `account.ts`/`org.ts` first)

a) Create **stub files** so typecheck stays green until Tasks 2.2/2.3 fill them in:

`lib/auth/src/account.ts`:
```ts
export {};
```

`lib/auth/src/org.ts`:
```ts
export {};
```

b) `lib/auth/src/index.ts`:
```ts
export * from "./roles";
export * from "./email";
export * from "./secondary-storage";
export * from "./options";
export * from "./account";
export * from "./org";
```

- [x] **Step 5: `lib/db` type export**

Add to `lib/db/src/index.ts` (the resolved type is `NodePgDatabase<typeof schema>`; alias it for the guard/secondary-storage signatures):
```ts
export type Db = typeof db;
```

- [x] **Step 6: `artifacts/api-server/src/lib/auth.ts`**

```ts
import { betterAuth } from "better-auth";
import { db } from "@workspace/db";
import { buildAuthOptions } from "@workspace/auth";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error(
    "BETTER_AUTH_SECRET must be set. Generate once with: openssl rand -base64 32",
  );
}

export const auth = betterAuth(
  buildAuthOptions({ db, secret, baseURL: process.env.BETTER_AUTH_URL }),
);
```

- [x] **Step 7: `artifacts/api-server/src/middlewares/guards.ts`**

```ts
import type { Request, RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth";
import { isWorkspaceRole, WRITE_ROLES, type WorkspaceRole } from "@workspace/auth";

/**
 * Dev-only escape hatch (default OFF, documented in .env.example).
 * Lets the SPA be developed against the app UI before auth is exercised.
 * Never set alongside a reachable database in a real deployment.
 */
export const authPassthrough = (): boolean => process.env.AUTH_PASSTHROUGH === "true";

interface AuthenticatedRequest extends Request {
  actor?: { id: string; role: WorkspaceRole | null };
}

/**
 * Session guard. Mounted after the public health route. Rejects requests with
 * no valid Better Auth session (401). On success attaches `req.actor` with the
 * user's id and global role so role guards never re-read the DB.
 */
export function requireSession(): RequestHandler {
  return async (req, res, next) => {
    if (authPassthrough()) {
      (req as AuthenticatedRequest).actor = {
        id: "passthrough",
        role: "global_admin",
      };
      next();
      return;
    }
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });
      if (!session?.user) {
        res
          .status(401)
          .json({ error: "unauthorized", message: "Sign in to continue." });
        return;
      }
      const role = isWorkspaceRole(session.user.role)
        ? session.user.role
        : null;
      (req as AuthenticatedRequest).actor = { id: session.user.id, role };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Requires a specific global role (data-access authority). Used for the admin
 * router. Runs after requireSession, which populates `req.actor`.
 */
export function requireDataRole(required: WorkspaceRole): RequestHandler {
  return (req, res, next) => {
    const role = (req as AuthenticatedRequest).actor?.role;
    if (role !== required) {
      res.status(403).json({
        error: "forbidden",
        message: "This action requires the Global Admin role.",
      });
      return;
    }
    next();
  };
}

/**
 * Write-role guard. Mutating requests (not GET/HEAD/OPTIONS) require a role in
 * the write set; viewers are read-only. Runs after requireSession.
 */
export function requireWriteRole(): RequestHandler {
  return (req, res, next) => {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
      next();
      return;
    }
    const { role } = req as AuthenticatedRequest;
    if (role === null) {
      res.status(403).json({
        error: "forbidden",
        message:
          "Your workspace role could not be determined. Ask an administrator to assign one.",
      });
      return;
    }
    if (!WRITE_ROLES.has(role)) {
      res.status(403).json({
        error: "forbidden",
        message: "Viewers have read-only access to the workspace.",
      });
      return;
    }
    next();
  };
}
```

> `session.user.role` is typed as `string` (better-auth doesn't know `additionalFields` without the inference plugin). `isWorkspaceRole` narrows it. This is intentional.

- [x] **Step 8: Stub the admin router, then rewrite `routes/index.ts`**

First create `artifacts/api-server/src/routes/admin.ts` (fully replaced in Task 3.1, but needed now so typecheck passes):

```ts
import { Router, type IRouter } from "express";

const router: IRouter = Router();

export default router;
```

Then rewrite `routes/index.ts`:

```ts
import { Router, type IRouter } from "express";
import healthRouter from "./health";
import platformRouter from "./platform";
import { requireSession, requireWriteRole } from "../middlewares/guards";
import adminRouter from "./admin";

const router: IRouter = Router();

// Health probe stays public and untouched; it exposes no confidential data.
router.use(healthRouter);

// Admin router is guarded by role inside the router (global_admin only) but
// needs the session guard first. It is mounted before the write-role guard so
// its read endpoints are also admin-only.
router.use(requireSession());
router.use(adminRouter);
router.use(requireWriteRole());
router.use(platformRouter);

export default router;
```

- [x] **Step 9: Mount the auth handler in `artifacts/api-server/src/app.ts`**

Insert **above** `app.use(cors())` / the body parsers:

```ts
import { toNodeHandler } from "better-auth/node";
import { auth } from "./lib/auth";

// Better Auth must see the raw request stream, so this handler is mounted
// before any body parser. Express 5 catch-all syntax.
app.all("/api/auth/*splat", toNodeHandler(auth));
```

Place it after `pinoHttp`. Do NOT mount inside the `/api` router.

- [x] **Step 10: Delete `clerkAuth.ts` and remove Clerk deps from `api-server`**

```bash
rm artifacts/api-server/src/middlewares/clerkAuth.ts
bun pm untach --workspace @workspace/api-server "@clerk/express" "@clerk/shared" 2>/dev/null || true
```

Clean `@clerk/express` and `@clerk/shared` from `artifacts/api-server/package.json` dependencies manually (the bun command may vary by version; edit the file directly): remove the two lines `"@clerk/express": "^2.1.61"` and `"@clerk/shared": "^4.29.3"`.

- [x] **Step 11: Verify mid-phase**

Every change must leave things green even though portions of Phase 1/2 remain:

```bash
bun install
bun run typecheck
bun run build
```
Expected: PASS. If esbuild chokes on better-auth (a monolith — it bundles warnings at most), add `better-auth` to the `external` array in `artifacts/api-server/build.mjs` and keep it external (then rely on runtime node_modules), OR pin a note. Do whatever produces a green `bun run build`.

- [x] **Step 12: `.env.example` for api-server — rewrite**

`artifacts/api-server/.env.example`:
```
# Self-hosted auth (Better Auth). Secret is required and must be stable:
# generate once with `openssl rand -base64 32` and reuse across all processes.
BETTER_AUTH_SECRET=

# Optional: explicit public base URL of the API (used for absolute links).
BETTER_AUTH_URL=

# Dev-only escape hatch (default OFF). When true, the session guard and role
# guards pass through so you can build the SPA before auth is exercised.
# Never combine with a reachable database in a real deployment.
AUTH_PASSTHROUGH=

# Optional SMTP for real email. Without it, verification codes are logged to
# the server console (this network blocks external hosts). All four are needed:
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Optional social providers (config-only migration; inert where OAuth hosts are
# unreachable):
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Database
DATABASE_URL=
```

- [x] **Step 13: Commit**

```bash
git add artifacts/api-server/src/middlewares/guards.ts artifacts/api-server/src/lib/auth.ts \
  artifacts/api-server/src/routes/index.ts artifacts/api-server/src/routes/admin.ts \
  artifacts/api-server/src/app.ts lib/auth/src/email.ts lib/auth/src/options.ts \
  lib/auth/src/secondary-storage.ts lib/auth/src/index.ts lib/db/src/index.ts \
  artifacts/api-server/.env.example artifacts/api-server/package.json bun.lock
git commit -m "feat(api): replace Clerk middleware with Better Auth session guards" 
```

(Delete the tracked `clerkAuth.ts` in the same commit: `git rm artifacts/api-server/src/middlewares/clerkAuth.ts` before committing.)

---

### Task 0.4: SPA auth client + session provider + sign-in screen

**Files:**
- Create: `artifacts/global-dr-platform/src/lib/auth-client.ts`
- Rewrite: `artifacts/global-dr-platform/src/lib/auth.tsx`
- Modify: `artifacts/global-dr-platform/src/App.tsx` (drop `SignInButton`, `clerkConfigured`; new `SignInScreen`), `artifacts/global-dr-platform/package.json`, `artifacts/global-dr-platform/.env.example`

- [x] **Step 1: `lib/auth-client.ts`**

```ts
import { createAuthClient } from "better-auth/react";
import {
  emailVerificationClient,
  inferAdditionalFields,
  organizationClient,
} from "better-auth/client/plugins";

export type SessionUserRole = string;

export const authClient = createAuthClient({
  baseURL: "/api/auth",
  plugins: [
    // Surface the custom `role` additional field on typed session users.
    inferAdditionalFields<{ user: { role: string } }>({
      user: { role: { type: "string" } },
    }),
    organizationClient(),
    emailVerificationClient(),
  ],
});

export const {
  useSession,
  signIn,
  signOut,
} = authClient;
```

> `authClient.signIn` (from `better-auth/react`) exposes `.email({ email, password })`. The email-verification client plugin exposes `authClient.emailVerification.sendVerificationEmail` and `authClient.emailVerification.verifyEmail({ email, code })` on the same instance.

- [x] **Step 2: Rewrite `lib/auth.tsx`**

```tsx
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
      user: toSessionUser(sessionUser),
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
```

- [x] **Step 3: `App.tsx` — replace imports**

Remove `import { SignInButton } from '@clerk/react';` and `import { clerkConfigured, useSessionInfo } from '@/lib/auth';` → `import { authDemoEnabled, useSessionInfo } from '@/lib/auth';`.

- [x] **Step 4: `App.tsx` — new `SignInScreen`**

Replace the existing `SignInScreen` (lines 349–364) with a stateful form + OTP view reusing the design language. Add `useState` (already imported) and imports for the client:

```tsx
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
```

```tsx
export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'error' | 'verify'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    setError(null);
    const res = await authClient.signIn.email({ email, password });
    if (res.error) {
      if (res.error.code === 'EMAIL_NOT_VERIFIED') {
        setStatus('verify');
        return;
      }
      setStatus('error');
      setError(res.error.message ?? 'Sign-in failed. Check your credentials.');
      return;
    }
    setStatus('idle');
  };

  const verify = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus('submitting');
    setError(null);
    const res = await authClient.emailVerification.verifyEmail({ email, code });
    if (res.error) {
      setStatus('verify');
      setError(res.error.message ?? 'Invalid or expired code.');
      return;
    }
    setStatus('idle');
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-5">
      <div className="workspace-grid w-full max-w-md rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-8 py-14 text-center shadow-xl">
        <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-[15px] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]">
          <Landmark size={26} strokeWidth={2.2} />
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[hsl(157_50%_62%)] ring-2 ring-[hsl(var(--card))]" />
        </span>
        <h1 className="mt-6 font-serif text-[30px] leading-tight">Meridian</h1>
        {status === 'verify' ? (
          <>
            <p className="mb-8 mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
              A verification code was sent to <span className="font-bold">{email}</span>. Enter it below to finish signing in.
            </p>
            <form onSubmit={verify} className="space-y-4">
              <input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="6-digit code"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-center text-lg tracking-[.4em] outline-none focus:border-[hsl(var(--accent-foreground))]"
                data-testid="input-verification-code"
              />
              {error && <p className="text-xs font-bold text-[hsl(var(--destructive))]" data-testid="text-verification-error">{error}</p>}
              <button
                type="submit"
                className="h-12 w-full cursor-pointer rounded-xl bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                disabled={status === 'submitting'}
                data-testid="button-verify-code"
              >
                {status === 'submitting' ? 'Verifying…' : 'Verify & continue'}
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mb-8 mt-2 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Sign in to open the diplomatic workspace. Access is restricted to your diplomatic affairs team.</p>
            <form onSubmit={submit} className="space-y-4">
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
                placeholder="email@ministry.gov"
                autoComplete="email"
                className="h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:border-[hsl(var(--accent-foreground))]"
                data-testid="input-signin-email"
              />
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
                placeholder="Password"
                autoComplete="current-password"
                className="h-12 w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm outline-none focus:border-[hsl(var(--accent-foreground))]"
                data-testid="input-signin-password"
              />
              {error && <p className="text-xs font-bold text-[hsl(var(--destructive))]" data-testid="text-signin-error">{error}</p>}
              <button
                type="submit"
                className="h-12 w-full cursor-pointer rounded-xl bg-[hsl(var(--primary))] px-4 text-xs font-bold text-[hsl(var(--primary-foreground))] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                disabled={status === 'submitting'}
                data-testid="button-sign-in"
              >
                {status === 'submitting' ? 'Signing in…' : 'Sign in to Meridian'}
              </button>
            </form>
            <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.35)] px-4 py-3 text-[11px] text-[hsl(var(--muted-foreground))]">
              <ShieldCheck size={14} className="text-[hsl(var(--primary))]" />
              <span>Sign-in is required before confidential records are shown</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

- [x] **Step 5: Settings panel sign-out (no longer Clerk-gated)**

In `SettingsPage` (App.tsx line 327 area), the `{clerkConfigured ? ... : null}` wrapping the sign-out button becomes unconditional when a real session exists. Replace `clerkConfigured` with `authDemoEnabled()` — in demo mode hide the button as before:

```tsx
{authDemoEnabled() ? null : (
  <div className="pt-2">
    <button
      onClick={() => void signOut()}
      className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-[hsl(42_25%_70%/.4)] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] hover:bg-[hsl(42_25%_70%/.15)]"
      data-testid="button-sign-out"
    >
      <X size={14} /> Sign out of Meridian
    </button>
  </div>
)}
```

- [x] **Step 6: Remove Clerk SPA deps + client wiring**

Remove `"@clerk/react": "^6.14.5"` and `"@clerk/themes": "^2.4.57"` from `artifacts/global-dr-platform/package.json`. Add `"better-auth": "1.7.2"` to `dependencies`. `@workspace/api-client-react`'s `setAuthTokenGetter` stays (exported) but is no longer called by the SPA — confirm nothing else in the web app calls it (`rg setAuthTokenGetter artifacts/global-dr-platform` → only the old `lib/auth.tsx`, now rewritten).

`artifacts/global-dr-platform/.env.example`:
```
# Demo session flag (default off). When '1', the app shows a Demo Analyst
# (global_admin) session without contacting the backend — pair with the API's
# AUTH_PASSTHROUGH to keep pages rendering during frontend-only development.
VITE_AUTH_DEMO=
```

- [x] **Step 7: Verify**

```bash
bun install
bun run typecheck
bun run build
```
Expected: PASS (web build regenerates `routeTree.gen.ts` automatically).

- [x] **Step 8: Commit**

```bash
git rm artifacts/global-dr-platform/package.json 2>/dev/null; true
git add artifacts/global-dr-platform/src/lib/auth-client.ts artifacts/global-dr-platform/src/lib/auth.tsx \
  artifacts/global-dr-platform/src/App.tsx artifacts/global-dr-platform/package.json \
  artifacts/global-dr-platform/.env.example bun.lock
git commit -m "feat(web): replace Clerk with Better Auth session provider and sign-in screen"
```

---

## Phase 1 — Verification of the swap (shippable checkpoint)

### Task 1.1: DB-backed auth test script + API 401 verification

**Files:**
- Create: `scripts/src/auth-qa.ts`
- Modify: `scripts/package.json`

This is the compact, runnable regression script for Phase 1: it boots an in-process Express app **without** starting a listener, uses supertest-free `fetch` against an ephemeral `http.createServer`, and prints PASS/FAIL lines. It needs a Postgres with the auth tables pushed (Task 0.2 did that).

- [x] **Step 1: `scripts/package.json` — add deps + qa script**

```json
{
  "scripts": {
    "auth-qa": "tsx ./src/auth-qa.ts"
  }
}
```
Add `@workspace/api-server` and `@workspace/db` as devDeps (so the script can import the real auth config and DB). `@workspace/api-server` currently has **no** `exports` field in its package.json, so Bun resolves its source subpaths by convention — do NOT add an exports map that would break `@workspace/api-server/src/lib/auth`. If an exports map must be added, include the wildcard:

```json
"exports": { ".": "./src/index.ts", "./src/*": "./src/*" }
```

- [x] **Step 2: `scripts/src/auth-qa.ts`**

```ts
// DB-backed verification of the Better Auth swap. Requires:
//   DATABASE_URL + BETTER_AUTH_SECRET (see artifacts/api-server/.env.example)
// Run: DATABASE_URL=... BETTER_AUTH_SECRET=... bun run --filter @workspace/scripts auth-qa
import http from "node:http";
import { once } from "node:events";
import app from "@workspace/api-server/src/app";
import { pool } from "@workspace/db";

// Boot the REAL api-server app (pino + cors + auth handler + guards) over a
// local listener so every layer — mount order, session guard, write-role
// guard — is exercised exactly as in production. app.ts does not listen; only
// index.ts does, so importing it here is side-effect free.

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { passed++; console.log(`  PASS ${name}`); }
  else { failed++; console.log(`  FAIL ${name} ${detail}`); }
}

async function main() {
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const origin = `http://127.0.0.1:${port}`;

  // 1. healthz stays public
  const health = await fetch(`${origin}/api/healthz`);
  check("GET /api/healthz public -> 200", health.status === 200, `got ${health.status}`);

  // 2. Unauthenticated -> 401 on a protected route
  const anon = await fetch(`${origin}/api/countries`);
  check("GET /api/countries unauthenticated -> 401", anon.status === 401, `got ${anon.status}`);

  // 3. Unauthenticated mutating request is also rejected before touching data
  const anonPost = await fetch(`${origin}/api/countries`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "QA", code: "QA", region: "QA", status: "leads" }) });
  check("POST /api/countries unauthenticated -> 401", anonPost.status === 401, `got ${anonPost.status}`);

  server.close();
  await pool.end();
  console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILURES`} (${passed} passed)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
```

- [x] **Step 3: Run it**

```bash
DATABASE_URL="postgresql://localhost:5432/meridian" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  bun run --filter @workspace/scripts auth-qa
```
Expected: `PASS` on all lines; exit 0.

- [x] **Step 4: Commit**

```bash
git add scripts/src/auth-qa.ts scripts/package.json
git commit -m "test(api): DB-backed auth 401 regression script"
```

---

### Task 1.2: SPA demo-mode QA + real gate QA

**Files:**
- Create: `scripts/src/route-qa.ts` (Playwright)
- Modify: `scripts/package.json`

This reproduces the Playwright route-QA used in the prior session (kept in-repo now). Demo-mode (VITE_AUTH_DEMO=1) requires a stub data API to avoid data-route failures — reuse the prior stub pattern (a tiny express server returning shaped arrays for each endpoint list, or gate the assertions to header/nav/sign-in-shell presence).

- [x] **Step 1: `scripts/package.json` — add playwright devDependency and QA script**

```json
{
  "scripts": {
    "route-qa": "tsx ./src/route-qa.ts"
  },
  "devDependencies": {
    "playwright": "^1.53.0"
  }
}
```
`bun install` (adds/updates bun.lock).

- [x] **Step 2: `scripts/src/route-qa.ts`** — port the prior session's working temp file. Assertions:
  - `GET /` and each nav item (Overview, Countries, Contacts, Meetings, Agreements, Settings) render its header h1; active nav highlighting; 404 route test via an unknown path; demo user name (`Demo Analyst`) visible in the header (`[data-testid="current-user-name"]`); `data-testid="button-sign-out"` hidden in demo mode; zero console errors on the shell pages (assert each `page.on("console", type === 'error')`; treat network failures on data queries in demo mode as **expected**, not assertions).

- [x] **Step 3: Run**

```bash
bunx playwright install chromium 2>/dev/null || true
# API in passthrough + SPA in demo:
PORT=3000 DATABASE_URL="postgresql://localhost:5432/meridian" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  AUTH_PASSTHROUGH=true bun run --filter @workspace/api-server dev &
VITE_AUTH_DEMO=1 bun run --filter @workspace/global-dr-platform dev &
sleep 4
bun run --filter @workspace/scripts route-qa
```
Expected: all route assertions PASS, zero unexpected console errors, demo user in header, exit 0. Kill both servers afterwards.

- [x] **Step 4: Real gate QA (no demo) — sign-in shell shows**

With server + SPA running **without** `VITE_AUTH_DEMO` and **without** `AUTH_PASSTHROUGH`, assert `[data-testid="button-sign-in"]` is visible and the Shell is absent until signed in. Add this as a second mode in `route-qa.ts` behind `--mode real-auth`.

- [x] **Step 5: Commit**

```bash
git add scripts/src/route-qa.ts scripts/package.json bun.lock
git commit -m "test(web): in-repo Playwright route QA for demo and real-auth modes"
```

---

## Chunk 2: Verification features, admin panel, docs (Tasks 2.1–4.2)

## Phase 2 — Email verification, CLI bootstrap, org, rate limiting

### Task 2.1: Spike — pin Better Auth creation/OTP semantics against the installed package

**Files:** none (read-only investigation). This resolves the spec's "planner must verify exact semantics" directives.

- [x] **Step 1: Confirm create/verify/token mechanics**

```bash
rg -n "createUser|sendVerificationEmail|createVerificationValue|verifyEmail|EMAIL_NOT_VERIFIED|disableSignUp" \
  node_modules/better-auth/dist/plugins/*.mjs node_modules/better-auth/dist/*.mjs 2>/dev/null | head -40
```

Document the answers to each:
1. `auth.api.createUser` — exists? Does it require a session? Does it accept `body.role` despite `additionalFields.role.input=false`? (Expect: yes — admin server APIs intentionally bypass `input:false`.)
2. `disableSignUp: true` — does it also block `auth.api.createUser`? (Expect: no — only the public sign-up route.)
3. `requireEmailVerification: true` — what error code does sign-in return for unverified users? Confirm `EMAIL_NOT_VERIFIED` so the SPA branch matches.
4. The `sendVerificationEmail` hook — when does the emailVerification plugin invoke it, and what is `token` in OTP mode? Is there a server API `auth.api.sendVerificationEmail` and does it enforce the session-email-matches rule?
5. OTP storage — what `identifier` and `value` go into the `verification` table (`email-verification:<email>`? plaintext code vs hashed)?
6. `rateLimiter` — is the `routes` sub-config supported, and does `CustomResponse`/`secondaryStorage` match `createSecondaryStorage`'s shape (value JSON number)?

Record findings as a short comment block at the top of `lib/auth/src/account.ts` (`src/account.ts` is written in Task 2.2; record findings there once it exists, otherwise in `docs/superpowers/specs/2026-08-28-better-auth-migration-design.md` section "Verification & testing" — do not clutter the spec; log to this plan as a code comment).

- [x] **Step 2: Choose branch and implement in Task 2.2**

- **Branch A (preferred):** `auth.api.createUser(...)` then if OTP-send did NOT auto-fire (spike finding 4/5), call the plugin's intended send path or insert the verification row directly with the confirmed identifier/value format, then invoke `sendVerificationEmail`-equivalent (mail transport) ourselves.
- **Branch B (fallback):** direct `insert` into `user` with a hash produced by better-auth's password hashing (`import { hashPassword } from "better-auth/plugins"`), plus manual `verification` insert + our transport; sign-in then flows through better-auth normally.

- [x] **Step 3: Note the OTP code format**

Whatever branch is chosen, store the code as the value better-auth's `verify-email` endpoint reads (spike-confirmed), and send it via `sendVerificationMessage`. Deterministic outputs:
- 6-digit numeric OTP, 10-minute expiry, newline in console-mail body.
- Unverified sign-in returns `EMAIL_NOT_VERIFIED`.

---

### Task 2.2: `createAccount` — the shared admin/CLI path

**Files:**
- Create: `lib/auth/src/account.ts`, `lib/auth/src/org.ts`
- Modify: `lib/auth/src/email.ts` (add `sendVerificationMessage`), `lib/auth/package.json` (nodemailer, unless deferred)

- [x] **Step 1: `lib/auth/src/account.ts`**

```ts
import { createId } from "better-auth";
import { eq } from "drizzle-orm";
import { db as dbRef, userTable, verificationTable, type Db } from "@workspace/db"; // type-only for Db
import type { WorkspaceRole } from "./roles";
import { sendVerificationMessage } from "./email"; // added by Step 2 of this task

export interface CreateAccountInput {
  email: string;
  name: string;
  role: WorkspaceRole;
  /** Bootstrap escape: mark emailVerified, skip OTP, and print the temp password. */
  verify: boolean;
}

export interface CreateAccountResult {
  user: { id: string; email: string; name: string; role: WorkspaceRole };
  tempPassword: string;
  verificationCode: string | null;
}

function randomTempPassword(): string {
  return Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(18)))
    .toString("base64url");
}

async function issueVerificationCode(auth: AuthApi, email: string): Promise<string | null> {
  // Branch A: plugin's own path (spike Task 2.1).
  // Prefer auth.api.sendVerificationEmail if it exists and is not session-bound.
  try {
    (auth.api as ServerAPIWithSend).sendVerificationEmail({ email });
    return null; // code goes out via the plugin's transport; nothing to return
  } catch {
    // Branch A-fallback: insert the verification row directly in the format
    // confirmed by the spike and deliver via our transport.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    await dbRef
      .insert(verificationTable)
      .values({
        id: createId(),
        identifier: `email-verification:${email}`,
        value: code, // plaintext if plugin stores plaintext; hash if it stores a hash (spike)
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
    await sendVerificationMessage(email, code);
    return code;
  }
}

export async function createAccount(opts: {
  auth: AuthApi;
  db: Db;
  input: CreateAccountInput;
}): Promise<CreateAccountResult> {
  const { auth, db, input } = opts;
  const tempPassword = randomTempPassword();
  const created = await auth.api.createUser({
    body: {
      email: input.email,
      name: input.name,
      password: tempPassword,
      role: input.role, // confirm with Task 2.1 spike that input:false doesn't block admin API
    },
  });
  if (input.verify) {
    await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.id, created.id));
    return { user: { id: created.id, email: created.email, name: created.name, role: input.role }, tempPassword, verificationCode: null };
  }
  const verificationCode = await issueVerificationCode(auth, created.email);
  return { user: { id: created.id, email: created.email, name: created.name, role: input.role }, tempPassword, verificationCode };
}
```

> Types: `AuthApi`/`ServerAPIWithSend` are structural — `betterAuth()` returns `BetterAuth` whose `.api` carries server methods. Type accordingly (define `type AuthApi = Parameters<typeof betterAuth>[0] extends never ? never : BetterAuth` after importing `type BetterAuth from "better-auth"`). Keep types loose and let tsc guide.

- [x] **Step 2: `lib/auth/src/email.ts` — add `sendVerificationMessage`**

```ts
// getMailTransport is already defined in this file (Task 0.3); do NOT import from "./email".
export async function sendVerificationMessage(email: string, code: string): Promise<void> {
  await getMailTransport().send(email, {
    subject: "Meridian — verify your email address",
    text: `Your Meridian verification code is ${code}. It expires in 10 minutes.`,
  });
}
```

- [x] **Step 3: `lib/auth/src/org.ts`**

```ts
import { createId } from "better-auth";
import { eq } from "drizzle-orm";
import { organizationTable, memberTable, type Db } from "@workspace/db";
import { ORG_MEMBER_ROLE, ORG_OWNER_ROLE, WORKSPACE_ORG } from "./roles";

/**
 * Idempotently seed the single workspace org and, when a user is given,
 * grant them membership. Same function serves the CLI bootstrap (owner) and
 * admin-created accounts (member).
 */
export async function ensureWorkspaceOrg(db: Db, userId?: string, role: string = ORG_MEMBER_ROLE) {
  const [org] = await db
    .insert(organizationTable)
    .values({ id: createId(), name: WORKSPACE_ORG.name, slug: WORKSPACE_ORG.slug })
    .onConflictDoNothing()
    .returning();
  const orgId = org?.id ?? (await db.select({ id: organizationTable.id }).from(organizationTable).where(eq(organizationTable.slug, WORKSPACE_ORG.slug)))[0]?.id;
  if (!orgId) throw new Error("Workspace org could not be found or created.");
  if (!userId) return orgId;
  await db
    .insert(memberTable)
    .values({ id: createId(), organizationId: orgId, userId, role })
    .onConflictDoNothing();
  return orgId;
}
```

- [x] **Step 4: Wire exports**

`lib/auth/src/index.ts` now exports `.`, which includes `account.ts` and `org.ts` — the empty stubs from Task 0.3/0.4 are replaced.

- [x] **Step 5: Verify**

```bash
bun install
bun run typecheck
bun run build
```
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add lib/auth/src/account.ts lib/auth/src/org.ts lib/auth/src/email.ts lib/auth/src/index.ts \
  lib/auth/package.json
git commit -m "feat(auth): shared account-creation and org-seed modules"
```

---

### Task 2.3: `create-user` CLI

**Files:**
- Create: `scripts/src/create-user.ts`
- Modify: `scripts/package.json`

- [x] **Step 1: `scripts/package.json` — add the script AND the CLI's dependencies**

```json
{
  "scripts": {
    "create-user": "tsx ./src/create-user.ts"
  },
  "dependencies": {
    "@workspace/auth": "workspace:*",
    "@workspace/db": "workspace:*",
    "better-auth": "1.7.2"
  }
}
```
`bun install` (do not forget this — the CLI fails at runtime with module-not-found otherwise).

- [x] **Step 2: `scripts/src/create-user.ts`**

```ts
#!/usr/bin/env node
//
// Bootstrap a user in the Meridian workspace.
//
// Usage:
//   DATABASE_URL=... BETTER_AUTH_SECRET=... \
//     bun run --filter @workspace/scripts create-user <email> <name> [--role global_admin] [--verify]
//
// Without --verify: account is created unverified, an OTP is queued/sent, and
// the temp password is printed once — sign-in is blocked until verified.
// With --verify: the account is marked verified immediately (bootstrap escape
// for the first admin on networks where email cannot arrive), the OTP is
// skipped, and the temp password is printed.
import { betterAuth } from "better-auth";
import { db, pool } from "@workspace/db";
import { buildAuthOptions, createAccount, ensureWorkspaceOrg, isWorkspaceRole, ORG_OWNER_ROLE, ORG_MEMBER_ROLE } from "@workspace/auth";

function fail(message: string): never {
  console.error(`error: ${message}`);
  console.error(usage);
  process.exit(1);
}

const usage = `Usage: create-user <email> <name> [--role ROLE] [--verify]`;

const args = process.argv.slice(2);
const emailArg = args.find((a) => !a.startsWith("--"));
const nameArg = args.slice(1).find((a) => !a.startsWith("--"));
const role = (() => { const i = args.indexOf("--role"); return i >= 0 ? args[i + 1] : "global_admin"; })();
const verify = args.includes("--verify");

if (!emailArg || !nameArg) fail("email and name are required.");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailArg)) fail("email looks invalid.");
if (!isWorkspaceRole(role)) fail(`role must be one of: global_admin, regional_director, country_lead, research, meeting_coordinator, viewer`);

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) fail("BETTER_AUTH_SECRET must be set (see artifacts/api-server/.env.example).");

async function main() {
  const auth = betterAuth(buildAuthOptions({ db, secret }));
  const created = await createAccount({
    auth,
    db,
    input: { email: emailArg.trim().toLowerCase(), name: nameArg.trim(), role, verify },
  });
  const memberRole = role === "global_admin" && verify ? ORG_OWNER_ROLE : ORG_MEMBER_ROLE;
  const orgId = await ensureWorkspaceOrg(db, created.user.id, memberRole);

  console.log(`\nCreated user:`);
  console.log(`  email:    ${created.user.email}`);
  console.log(`  name:     ${created.user.name}`);
  console.log(`  role:     ${created.user.role}`);
  console.log(`  org:      Meridian (${orgId})`);
  console.log(`  verified: ${verify ? "yes (bootstrap)" : "no — OTP issued"}`);
  console.log(`  temp password (shown once, rotate after sign-in):`);
  console.log(`    ${created.tempPassword}`);
  if (!verify && created.verificationCode) {
    console.log(`  verification code (also sent via console/SMTP): ${created.verificationCode}`);
  }
  console.log(``);

  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
```

- [x] **Step 3: Run — bootstrap admin**

```bash
DATABASE_URL="postgresql://localhost:5432/meridian" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  bun run --filter @workspace/scripts create-user admin@meridian.gov "Ada Lovelace" --role global_admin --verify
```
Expected: prints the user, org id, temp password; DB rows exist (`psql $DATABASE_URL -c "select email, role, email_verified from \"user\";"` → 1 row verified; `select count(*) from member;` → 1; org present).

- [x] **Step 4: Commit**

```bash
git add scripts/src/create-user.ts scripts/package.json
git commit -m "feat(scripts): create-user CLI with bootstrap admin and org seed"
```

---

### Task 2.4: Full auth loop verification (DB-backed)

**Files:**
- Modify: `scripts/src/auth-qa.ts`

Extend the Phase 1 QA into the full loop (per spec Verification #3):
- unauthenticated `/api/countries` → 401
- create a user **without** `--verify` via the CLI-equivalent path → temp password + OTP appear in console/log output
- unverified sign-in → rejected (`EMAIL_NOT_VERIFIED`)
- verify with the OTP → sign-in OK → cookie set → `/api/countries` → 200
- sign-out or new session for a `viewer` → POST `viewer` → 403; POST `global_admin` → 201

Steps that mutate state must clean up after themselves (delete created users via `auth.api.deleteUser`? or isolated temp DB). **Prefer a disposable user** `qa@meridian.local` removed at the end via `db.delete(userTable)`. Keep the QA output `PASS/FAIL`.

- [x] **Step 1: Extend the QA harness with CookieJar + sign-in + verify**

Concretely, add to `scripts/src/auth-qa.ts`:

0. **Imports to ensure exist:** `countryTable` from `@workspace/db`; `inArray`, `eq` from `drizzle-orm`. (The existing QA file already imports the rest; add only what's missing.)

1. **Cookie jar:** parse every response's `set-cookie` header (`response.headers.getSetCookie()` — Node 24 fetch) into a `Map<string,string>` (name=value pairs, e.g. `meridian.session_token=...`), then send them back on every subsequent request via a `cookie` header. `better-auth` `sameSite=lax`, path `/api/auth`, httpOnly — the jar keeps them.
2. **User creation:** reuse `@workspace/auth`'s `createAccount` + `betterAuth(buildAuthOptions(...))` exactly as `create-user.ts` does, with `verify: false` for email `qa@meridian.local`. Capture the returned `verificationCode` **and** assert it appears in the console-mail output (spike Task 2.1 confirms the OTP is either returned by `createAccount` or only logged — assert whichever the branch produces).
3. **Unverified sign-in:** `POST /api/auth/sign-in/email` with `{ email, password }` → expect `400`-family with error code `EMAIL_NOT_VERIFIED`.
4. **Verify:** `POST /api/auth/email-verification/verify-email` with `{ email, code }` → expect success and the response to set a session cookie (auto-sign-in).
5. **Authenticated data:** with the jar, `GET /api/countries` → 200.
6. **Role enforcement:** create a second disposable account `qa-viewer@meridian.local` with `verify: false` then `--verify`-style mark-verified (or use `createAccount(..., { verify: true })`), sign in as the viewer, `POST /api/countries` → 403. Sign in as `qa@meridian.local` with role `global_admin`, same POST → 201 (then delete the created country row to keep the DB clean).
7. **Cleanup:** `db.delete(userTable).where(inArray(userTable.email, [qa mails]))` + `db.delete(countryTable).where(eq(countryTable.code, "QA"))` at the end. Assert zero residual rows.

Keep output as monotonic `PASS`/`FAIL` lines with a final `ALL PASS` gate.

- [x] **Step 2: Run full suite**

```bash
DATABASE_URL="postgresql://localhost:5432/meridian" BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  bun run --filter @workspace/scripts auth-qa
```
Expected: every stage PASSes, exit 0; no residual `qa@meridian.local` row.

- [x] **Step 3: Commit**

```bash
git add scripts/src/auth-qa.ts scripts/package.json
git commit -m "test(api): full OTP verify + role enforcement auth loop"
```

---

## Phase 3 — Admin panel & API

### Task 3.1: Admin API endpoints + OpenAPI

**Files:**
- Create: `artifacts/api-server/src/routes/admin.ts`
- Modify: `lib/api-spec/openapi.yaml`, regenerate via codegen

- [x] **Step 1: Extend `lib/api-spec/openapi.yaml` and run codegen FIRST**

`admin.ts` (next step) imports the generated schemas, so codegen must run before the router typechecks. **Note:** `openapi.yaml` currently defines **no** `securitySchemes` and no path carries a `security` block — enforcement is entirely server-side (the guards). Follow that existing convention: do **not** add `security` fields or a security scheme to the new admin paths.

Add schema objects and paths to the EXISTING `components.schemas` and top-level `paths` sections — **merge, do not replace the file** (`lib/api-spec/openapi.yaml` already has its own `components`, `/health`, `/countries` etc.). Follow the existing conventions (`operationId` etc. in `paths` for `/countries`):

```yaml
components:
  schemas:
    AdminUser:
      type: object
      required: [id, name, email, role, emailVerified]
      properties:
        id: { type: string }
        name: { type: string }
        email: { type: string, format: email }
        role: { type: string }
        emailVerified: { type: boolean }
        memberId: { type: string, nullable: true }
    CreateAdminUserBody:
      type: object
      required: [email, name, role]
      properties:
        email: { type: string, format: email }
        name: { type: string }
        role: { type: string, enum: [global_admin, regional_director, country_lead, research, meeting_coordinator, viewer] }
    CreateAdminUserResponse:
      type: object
      required: [user, tempPassword]
      properties:
        user: { $ref: "#/components/schemas/AdminUser" }
        tempPassword: { type: string }
        verificationCode: { type: string, nullable: true }
    UpdateUserRoleBody:
      type: object
      required: [role]
      properties:
        role:
          type: string
          enum: [global_admin, regional_director, country_lead, research, meeting_coordinator, viewer]
    ListAdminUsersResponse:
      type: array
      items: { $ref: "#/components/schemas/AdminUser" }
    AdminMember:
      type: object
      required: [id, organizationId, userId, role, name, email]
      properties:
        id: { type: string }
        organizationId: { type: string }
        userId: { type: string }
        role: { type: string }
        name: { type: string }
        email: { type: string }
    AdminInvitation:
      type: object
      required: [id, organizationId, email, status, inviterId]
      properties:
        id: { type: string }
        organizationId: { type: string }
        email: { type: string }
        role: { type: string, nullable: true }
        status: { type: string }
        inviterId: { type: string }
    ListAdminMembersResponse:
      type: object
      required: [members, invitations]
      properties:
        members: { type: array, items: { $ref: "#/components/schemas/AdminMember" } }
        invitations: { type: array, items: { $ref: "#/components/schemas/AdminInvitation" } }
    CreateInvitationBody:
      type: object
      required: [email]
      properties:
        email: { type: string, format: email }
        role: { type: string, nullable: true }
paths:
  /admin/users:
    get:
      operationId: listAdminUsers
      responses:
        '200': { description: Users, content: { 'application/json': { schema: { type: array, items: { $ref: '#/components/schemas/AdminUser' } } } } }
    post:
      operationId: createAdminUser
      requestBody:
        required: true
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateAdminUserBody' } } }
      responses:
        '201': { description: Created, content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateAdminUserResponse' } } } }
  /admin/users/{id}/role:
    patch:
      operationId: updateAdminUserRole
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateUserRoleBody' } } }
      responses:
        '200': { description: Updated, content: { 'application/json': { schema: { type: object, properties: { id: { type: string }, role: { type: string } } } } } }
  /admin/members:
    get:
      operationId: listAdminMembers
      responses:
        '200': { description: Members + invitations, content: { 'application/json': { schema: { $ref: '#/components/schemas/ListAdminMembersResponse' } } } }
  /admin/invitations:
    post:
      operationId: createAdminInvitation
      requestBody:
        required: true
        content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateInvitationBody' } } }
      responses:
        '201': { description: Created, content: { 'application/json': { schema: { type: object, properties: { invitation: { type: object } } } } } }
```

> Failure responses (400/401/403/404/503) are intentionally not documented — the existing file's paths (see `/countries`) document success responses only, and this stays consistent.

Then regenerate:

```bash
bun run --filter @workspace/api-spec codegen
```

Expected output: orval rewrites `lib/api-zod/src/generated/` and the `@workspace/api-client-react` hooks. Verify the new exports exist before writing `admin.ts`:

```bash
ls lib/api-zod/src/generated/
rg -l "ListAdminUsers|CreateAdminUserBody" lib/api-zod lib/api-client-react --glob '!node_modules'
```

Expected: `ListAdminUsersResponse`, `CreateAdminUserBody`, `UpdateUserRoleBody`, `CreateInvitationBody`, `ListAdminMembersResponse` appear in generated output, and hooks `useListAdminUsers`, `useCreateAdminUser`, `useUpdateAdminUserRole`, `useListAdminMembers`, `useCreateAdminInvitation` are emitted. (If orval's config at `lib/api-spec/orval.config.ts` does not emit zod, see `lib/api-zod/src/index.ts` which re-exports `./generated/api` — the codegen is expected to emit these; the backfill fallback is to hand-write the five zod schemas in `lib/api-zod` mirroring how `ListCountriesResponse` is generated.)

- [x] **Step 2: `artifacts/api-server/src/routes/admin.ts`** (replace the Task 0.3 stub)

```ts
import { Router, type IRouter } from "express";
import { createId } from "better-auth";
import { asc, desc, eq } from "drizzle-orm";
import { db, userTable, memberTable, invitationTable, organizationTable } from "@workspace/db";
import { createAccount, ensureWorkspaceOrg, ORG_MEMBER_ROLE } from "@workspace/auth";
import { auth } from "../lib/auth";
import {
  CreateAdminUserBody,
  UpdateUserRoleBody,
  CreateInvitationBody,
  ListAdminUsersResponse,
  ListAdminMembersResponse,
} from "@workspace/api-zod";
import { requireDataRole } from "../middlewares/guards";

const router: IRouter = Router();

router.use(requireDataRole("global_admin"));

router.get("/users", async (_req, res) => {
  const rows = await db
    .select({
      id: userTable.id,
      name: userTable.name,
      email: userTable.email,
      role: userTable.role,
      emailVerified: userTable.emailVerified,
      memberId: memberTable.id,
    })
    .from(userTable)
    .leftJoin(memberTable, eq(memberTable.userId, userTable.id))
    .orderBy(asc(userTable.email));
  res.json(ListAdminUsersResponse.parse(rows));
});

router.post("/users", async (req, res) => {
  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const created = await createAccount({
    auth,
    db,
    input: { email: parsed.data.email, name: parsed.data.name, role: parsed.data.role, verify: false },
  });
  await ensureWorkspaceOrg(db, created.user.id, ORG_MEMBER_ROLE);
  res.status(201).json({
    user: created.user,
    tempPassword: created.tempPassword,
    verificationCode: created.verificationCode,
  });
});

router.patch("/users/:id/role", async (req, res) => {
  const parsed = UpdateUserRoleBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db
    .update(userTable)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(eq(userTable.id, req.params.id))
    .returning({ id: userTable.id, role: userTable.role });
  if (!row) { res.status(404).json({ error: "User not found." }); return; }
  res.json(row);
});

router.get("/members", async (_req, res) => {
  const members = await db
    .select({
      id: memberTable.id, organizationId: memberTable.organizationId,
      userId: memberTable.userId, role: memberTable.role,
      name: userTable.name, email: userTable.email,
    })
    .from(memberTable)
    .innerJoin(userTable, eq(userTable.id, memberTable.userId))
    .orderBy(asc(userTable.email));
  const invitations = await db
    .select({
      id: invitationTable.id, organizationId: invitationTable.organizationId,
      email: invitationTable.email, role: invitationTable.role, status: invitationTable.status,
      inviterId: invitationTable.inviterId,
    })
    .from(invitationTable)
    .orderBy(desc(invitationTable.expiresAt));
  res.json(ListAdminMembersResponse.parse({ members, invitations }));
});

router.post("/invitations", async (req, res) => {
  const parsed = CreateInvitationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [org] = await db.select({ id: organizationTable.id }).from(organizationTable).limit(1);
  if (!org) { res.status(500).json({ error: "Workspace org is not seeded." }); return; }
  const [user] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, parsed.data.email));
  if (!user) {
    res.status(400).json({ error: "No account exists for that email. Create the user first, then invite." });
    return;
  }
  // Direct insert instead of auth.api.organization.createInvitation: the org
  // plugin's createInvitation requires the CALLER to be an org owner/admin,
  // but any global_admin is authorized here regardless of org role (spec:
  // org membership is administrative/bookkeeping only, never a data-access
  // gate). The global_admin guard on this router is the authorization; the
  // invitation row is pure bookkeeping the invitee's org-plugin surface sees.
  const actor = (req as unknown as { actor: { id: string } }).actor;
  if (actor?.id === "passthrough") {
    // Dev-only AUTH_PASSTHROUGH can't be an inviter: invitation.inviter_id is
    // an FK to user. Refuse instead of crashing with a constraint violation.
    res.status(503).json({ error: "Cannot create invitations while AUTH_PASSTHROUGH is enabled." });
    return;
  }
  const [invitation] = await db
    .insert(invitationTable)
    .values({
      id: createId(),
      organizationId: org.id,
      email: parsed.data.email,
      role: parsed.data.role ?? "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      inviterId: actor!.id,
    })
    .returning();
  res.status(201).json({ invitation });
});

export default router;
```

> Enforced ordering: `router.use(requireDataRole("global_admin"))` runs **after** the session guard mounted in `routes/index.ts` (`router.use(requireSession())` precedes `router.use(adminRouter)`), so a non-signed-in caller gets 401 before the role check, and a non-admin gets 403.

- [x] **Step 3: Verify + admin-403 test**

```bash
bun install && bun run typecheck && bun run build
```
Expected: PASS. Then extend `scripts/src/auth-qa.ts` (Phase 2) with:
- admin endpoints return 403 for a non-`global_admin` session, 200/201 for the bootstrap admin.
- **non-bootstrap-admin invitation (guards against the org-owner regression):** create a second `global_admin` via `POST /api/admin/users`, sign in as that second admin, then `POST /api/admin/invitations` for a pre-created account → expect `201`. (The direct insert makes any `global_admin` able to invite, regardless of org role.)
Re-run QA green.

- [x] **Step 4: Commit**

```bash
git add artifacts/api-server/src/routes/admin.ts lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react scripts/src/auth-qa.ts
git commit -m "feat(api): admin users/members/invitations endpoints (global_admin only)"
```

---

### Task 3.2: `/admin` web page

**Files:**
- Create: `artifacts/global-dr-platform/src/routes/admin.tsx`
- Modify: `artifacts/global-dr-platform/src/App.tsx` (nav item), `lib/api-client-react` (regenerated hooks already)

- [x] **Step 1: Nav item (App.tsx `navItems`)**

`navItems` already calls `useSessionInfo()` per item — pull `user` from its returned `SessionInfo` (`authDemoEnabled()` is already imported). Add, under Governance (next to Settings):
```ts
const { user } = useSessionInfo(); // existing hook from Phase 1 (Task 1.2)
const isAdmin = user?.role === 'global_admin' && !authDemoEnabled();
// ...render <Link to="/admin">Administration</Link> when isAdmin
```
Reuse the `Settings` link markup, `data-testid="link-nav-admin"`.

- [x] **Step 2: `routes/admin.tsx`**

```tsx
import { createFileRoute } from '@tanstack/react-router';
import { AdminPage } from '@/App';

export const Route = createFileRoute('/admin')({
  component: AdminPage,
});
```

- [x] **Step 3: `AdminPage` in App.tsx**

Mirror `SettingsPage` design (PageIntro, cards). Sections:
- Members & invitations list (`useListAdminMembers`) — table with name/email/role + status badges. Testids: `admin-member-row-${id}`, `admin-invitation-row-${id}`.
- Create user form (`useCreateAdminUser`): email/name/role selects; on success show the temp password + verification code in a dismissible notice (`data-testid="text-temp-password"`, `data-testid="text-verification-code"`).
- Role change (`useUpdateAdminUserRole`): a per-row select keyed `admin-role-select-${id}`.
- Invite (`useCreateAdminInvitation`): email field + submit.

Pages render even in demo mode (demo user is global_admin) but the underlying calls will fail without a real backend — acceptable; on this network demo-mode asserts no console errors for the *navigation* and accepts data-request failures (Task 1.2 convention).

- [x] **Step 4: Verify**

```bash
bun run --filter @workspace/global-dr-platform dev   # regenerates routes
bun run typecheck && bun run build
```
Expected: PASS; `/admin` reachable in real-auth mode by the bootstrap admin; 403-handled for non-admins (ErrorState).

- [x] **Step 5: Commit**

```bash
git add artifacts/global-dr-platform/src/routes/admin.tsx artifacts/global-dr-platform/src/App.tsx \
  artifacts/global-dr-platform/src/routeTree.gen.ts
git commit -m "feat(web): administration page for user, role and invitation management"
```

---

## Phase 4 — Docs, cleanup, and final verification

### Task 4.1: Update docs

**Files:**
- Modify: `README.md`, `docs/roles-and-permissions.md`, `docs/implementation-plan.md`, `artifacts/api-server/.env.example` (done in Task 0.3), `artifacts/global-dr-platform/.env.example` (done in Task 0.4)

- [x] **Step 1: `README.md` → "Authentication (Better Auth)"**

Replace the Clerk section with: self-hosted Better Auth, `BETTER_AUTH_SECRET` (openssl command), no provider keys needed, bootstrap steps (push schema → `create-user --verify admin` → sign in), dev flags `VITE_AUTH_DEMO` + `AUTH_PASSTHROUGH`, console-vs-SMTP transport, link to `docs/roles-and-permissions.md`.

- [x] **Step 2: `docs/roles-and-permissions.md`**

Rewrite: auth served by Better Auth; role lives on `user.role` (not Clerk metadata); org roles are bookkeeping-only; enforcement stack (session → write-role → admin); dev flags; CLI bootstrap; full verification checklist updated (curl 401, sign-in, viewer 403).

- [x] **Step 3: `docs/implementation-plan.md`**

- Task #2 → status `DONE` reworded to "Self-hosted sign-in (Better Auth)": delete the `requireAuth`/Clerk phrasing; note the swap and that `docs/roles-and-permissions.md` was updated.
- Replace the "Authentication provider decision (made 28 August 2026): Clerk" bullet with the Better Auth decision and the reason (Clerk hosted origin blocked on this network).
- Set Task #3 (audit events) back to `NEXT` with `Current next task` text.

- [x] **Step 4: Commit**

```bash
git add README.md docs/roles-and-permissions.md docs/implementation-plan.md
git commit -m "docs: document self-hosted Better Auth tradeoffs, bootstrap and dev flags"
```

---

### Task 4.2: Final regression + cleanup sweep

- [x] **Step 1: Full checks**

```bash
bun run typecheck && bun run build
```
Expected: PASS in every workspace.

- [x] **Step 2: Sweep for leftover Clerk**

```bash
rg -n -i "clerk|@clerk|CLERK_" --glob '!node_modules' --glob '!bun.lock' --glob '!docs/superpowers/**' .
```
Expected: no hits in `src/`, `scripts/`, `lib/` (README/docs history handled in Task 4.1). Delete any residual file (e.g. `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` was already removed; recheck).

- [x] **Step 3: Re-run all QAs on a clean database**

```bash
# 1. bootstrap admin — expect temp password printed
# 2. scripts auth-qa — expect ALL PASS
# 3. SPA demo route-qa — expect ALL PASS; real-auth gate check — sign-in shell shows
```
Record results in `docs/implementation-plan.md` Current status evidence block.

- [x] **Step 4: Commit any stragglers**

Only the files this plan actually touched (never `git add -A`; the repo has unrelated staged-not-committed restoration files):

```bash
git add scripts/src scripts/package.json lib/auth lib/db/src/schema/auth.ts lib/db/src/schema/index.ts lib/db/src/index.ts \
  artifacts/api-server/src artifacts/api-server/.env.example artifacts/api-server/package.json \
  artifacts/global-dr-platform/src artifacts/global-dr-platform/.env.example artifacts/global-dr-platform/package.json \
  lib/api-spec/openapi.yaml lib/api-zod lib/api-client-react README.md docs/implementation-plan.md docs/roles-and-permissions.md
git commit -m "chore(auth): final regression and cleanup sweep"
```
Then confirm `git status --short` shows no uncommitted files this plan created.

---

## Execution handoff

After the plan is executed and verified: `git log --oneline -20` shows the auth commits; `docs/implementation-plan.md` has Task #2 rewritten; Task #3 (audit events) is the next task per `docs/implementation-plan.md`. Update this plan's checkboxes as you go — an executor can resume at any `- [ ]` line.