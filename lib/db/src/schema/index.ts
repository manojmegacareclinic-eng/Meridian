// Export your models here. Add one export per file
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

export * from "./countries";
export * from "./contacts";
export * from "./meetings";
export * from "./agreements";
export * from "./documents";
export * from "./news";
export * from "./activity";
export * from "./auth";
export {
  userTable as user,
  sessionTable as session,
  accountTable as account,
  verificationTable as verification,
  organizationTable as organization,
  memberTable as member,
  invitationTable as invitation,
  rateLimitTable as rate_limit,
} from "./auth";