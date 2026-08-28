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