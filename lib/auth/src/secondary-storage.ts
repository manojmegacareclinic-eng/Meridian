import { sql, and, eq, gt, lt } from "drizzle-orm";
import { rateLimitTable, type Db } from "@workspace/db";

/**
 * Postgres-backed Storage for better-auth's rate limiting
 * (`rateLimit: { storage: "secondary-storage" }`). JSON-count KV with a TTL
 * column; `increment` is atomic and only sets the TTL on creation, so a
 * counter expires a fixed window after it was first created.
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
    async getAndDelete(key: string): Promise<string | null> {
      const [row] = await db
        .delete(rateLimitTable)
        .where(
          and(eq(rateLimitTable.key, key), gt(rateLimitTable.expiresAt, new Date())),
        )
        .returning({ value: rateLimitTable.value });
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
    async increment(key: string, ttl: number): Promise<number> {
      return db.transaction(async (tx) => {
        await tx
          .delete(rateLimitTable)
          .where(and(eq(rateLimitTable.key, key), lt(rateLimitTable.expiresAt, new Date())));
        const [row] = await tx
          .insert(rateLimitTable)
          .values({ key, value: "1", expiresAt: new Date(Date.now() + ttl * 1000) })
          .onConflictDoUpdate({
            target: rateLimitTable.key,
            set: {
              value: sql`(${rateLimitTable.value}::int + 1)::text`,
            },
          })
          .returning({ value: rateLimitTable.value });
        return Number(row?.value ?? 1);
      });
    },
  };
}