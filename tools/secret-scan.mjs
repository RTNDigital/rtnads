/**
 * Committed-secret scanner (docs/09 §2, docs/14 §10). Fails CI if a credential-
 * looking literal is committed to source. High-signal patterns only, to avoid
 * false positives on the intentional short fake tokens used in tests. This guards
 * the invariant that credentials live only in the environment / L1 boundary and
 * never in the repository. Dependency-free.
 *
 * Note: PII leakage into the analytical store is a SEPARATE, runtime gate — the CI
 * database job scans the loaded warehouse for PII (see .github/workflows/ci.yml).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SELF = "tools/secret-scan.mjs";

const SCAN_EXT = new RegExp("\\.(ts|mjs|js|sql|json|ya?ml|md)$");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".pnpm-store", "coverage"]);
const SKIP_FILES = new Set(["pnpm-lock.yaml"]);

const PATTERNS = [
  { re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, name: "private key" },
  { re: /AKIA[0-9A-Z]{16}/, name: "AWS access key id" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, name: "GitHub token" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, name: "Slack token" },
  { re: /\b(?:secret|token|api[_-]?key|password|passwd|pwd)\b\s*[:=]\s*["'][A-Za-z0-9_\-\/+=]{24,}["']/i, name: "hardcoded credential" },
  { re: /access_token=(?!REDACTED)[A-Za-z0-9_\-]{20,}/, name: "access token in URL" },
];

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e) || SKIP_FILES.has(e)) continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (SCAN_EXT.test(e)) out.push(p);
  }
  return out;
}

let hits = 0;
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (rel === SELF) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const p of PATTERNS) {
      if (p.re.test(line)) {
        console.error(`✗ possible ${p.name}: ${rel}:${i + 1}`);
        hits++;
      }
    }
  });
}

if (hits > 0) {
  console.error(`\n${hits} possible committed secret(s). Move credentials to the environment / secrets vault.`);
  process.exit(1);
}
console.log("secret scan clean");
