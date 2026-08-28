/**
 * Post-codegen patch for the orval-generated react-query client.
 *
 * Orval's `getHeaders` helper (v8.26) normalizes `RequestInit["headers"]` via
 * `h.entries()`, but this repo's TypeScript DOM lib ships a `Headers` type
 * without `entries()` (it has `forEach`/`getSetCookie`). Rewrite that branch
 * to iterate with `forEach`, which is both type-correct and identical at
 * runtime. Re-run after every `codegen`.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const file = path.resolve(process.cwd(), "..", "..", "lib", "api-client-react", "src", "generated", "api.ts");

const OLD = `    if (!h) return {};
    if (h instanceof Headers) return Object.fromEntries(h.entries());
    if (Array.isArray(h)) return Object.fromEntries(h);
    return h;
`;

const NEW = `    if (!h) return {};
    if (h instanceof Headers) {
      const out: Record<string, string> = {};
      h.forEach((value, key) => {
        out[key] = value;
      });
      return out;
    }
    if (Array.isArray(h)) return Object.fromEntries(h);
    return h;
`;

async function main(): Promise<void> {
  const source = await readFile(file, "utf-8");
  if (!source.includes(OLD)) {
    throw new Error(`patch-generated: expected getHeaders helper not found in ${file}`);
  }
  await writeFile(file, source.replaceAll(OLD, NEW), "utf-8");
  console.log(`patched getHeaders in ${file}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});