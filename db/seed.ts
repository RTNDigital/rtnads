/**
 * Minimal seed runner — applies db/seed/*.sql in order. Seeds are idempotent
 * (ON CONFLICT DO NOTHING), so this is safe to re-run.
 *
 * Usage:  DATABASE_URL=postgres://user:pass@host/db  node --experimental-strip-types db/seed.ts
 */
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const seedDir = join(here, "seed");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const files = readdirSync(seedDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const f of files) {
  console.log(`seed   ${f}`);
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", join(seedDir, f)], {
    stdio: "inherit",
  });
}
console.log(`done: ${files.length} seed file(s) applied.`);
