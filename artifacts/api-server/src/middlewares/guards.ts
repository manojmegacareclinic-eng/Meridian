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
      // `role` is a dynamic DB column (user.additionalFields), not part of the
      // statically-inferred Session user shape — read it defensively.
      const user = session.user as { role?: unknown };
      const role = isWorkspaceRole(user.role) ? user.role : null;
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
    const { role } = (req as AuthenticatedRequest).actor ?? { role: null };
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