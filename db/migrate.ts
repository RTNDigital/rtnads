/**
 * Minimal, dependency-free migration runner.
 * Applies db/migrations/*.sql in lexical order via `psql`, inside a transaction
 * per file, and records applied files in a `schema_migrations` table.
 *
 * Usage:  DATABASE_URL=postgres://user:pass@host/db  node --experimental-strip-types db/migrate.ts
 *
 * This is intentionally simple for M0 (docs/13-mvp-milestones.md). A richer tool
 * (or a library like node-pg-migrate) can replace it without changing the .sql.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "migrations");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

function psql(sql: string): string {
  return execFileSync("psql", [url!, "-v", "ON_ERROR_STOP=1", "-q", "-c", sql], {
    encoding: "utf8",
  });
}

function psqlFile(path: string): void {
  execFileSync("psql", [url!, "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", path], {
    stdio: "inherit",
  });
}

psql(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);`);

const applied = new Set(
  psql("SELECT filename FROM public.schema_migrations;")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(".sql")),
);

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

let count = 0;
for (const f of files) {
  if (applied.has(f)) {
    console.log(`skip   ${f}`);
    continue;
  }
  console.log(`apply  ${f}`);
  psqlFile(join(migrationsDir, f));
  psql(
    `INSERT INTO public.schema_migrations(filename) VALUES ('${f.replace(/'/g, "''")}');`,
  );
  count++;
}
console.log(`done: ${count} migration(s) applied, ${files.length} total.`);
// Reference readFileSync to keep the import meaningful for future checksums.
void readFileSync;
