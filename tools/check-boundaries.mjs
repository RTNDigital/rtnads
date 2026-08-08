/**
 * Dependency-direction guard (docs/12 §2). Enforces the architectural boundaries
 * that keep the determinism / security invariants intact — the ones the docs say
 * "CI must reject". Scans each package's non-test source for `from "…"` imports and
 * fails on any forbidden edge. Dependency-free; run in CI and via `pnpm lint:boundaries`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

/** pkgPrefix → list of {pattern, why} imports that package's src may NOT contain. */
const RULES = [
  { pkg: "packages/contracts", forbid: [{ re: /@rtnads\//, why: "contracts is a leaf — it must not depend on any workspace package" }] },
  { pkg: "packages/domain", forbid: [{ re: /@rtnads\/(?!contracts)/, why: "domain may only depend on contracts" }] },
  { pkg: "packages/eventbus", forbid: [{ re: /@rtnads\/(?!contracts)/, why: "the event bus is leaf infrastructure — it may only depend on contracts" }] },
  { pkg: "services/ingestion-scheduler", forbid: [{ re: /@rtnads\/(analytics-engine|benchmark-engine|decision-engine|orchestrator|policy-engine|action-executor|connectors-|bff)|-mcp/, why: "the ingestion scheduler is L1 — it drives sync cadence via the event bus and must not import upward" }] },
  { pkg: "services/orchestrator", forbid: [
    { re: /@rtnads\/(analytics-engine|benchmark-engine|decision-engine|policy-engine|action-executor|connectors-|bff)/, why: "the orchestrator reaches backends ONLY through MCP + llm-core, never directly (docs/01 §6)" },
    { re: /(^|["'/])pg($|["'])/, why: "the orchestrator has no database access" },
  ] },
  { pkg: "services/analytics-engine", forbid: [{ re: /@rtnads\/(orchestrator|bff)|-mcp/, why: "L3 engines must not import upward (orchestrator/mcp/bff)" }] },
  { pkg: "services/benchmark-engine", forbid: [{ re: /@rtnads\/(orchestrator|bff)|-mcp/, why: "L3 engines must not import upward" }] },
  { pkg: "services/decision-engine", forbid: [{ re: /@rtnads\/(orchestrator|bff)|-mcp|(^|["'/])pg($|["'])/, why: "the Decision Engine is pure L3 — no upward imports, no DB, no LLM" }] },
  { pkg: "services/classifier", forbid: [{ re: /@rtnads\/(orchestrator|bff)|-mcp/, why: "the Classifier must not import upward" }] },
  { pkg: "services/connectors-ads", forbid: [{ re: /@rtnads\/(analytics-engine|benchmark-engine|decision-engine|orchestrator|policy-engine|action-executor|bff)|-mcp/, why: "connectors are L1 — they normalize platform I/O and depend on nothing above" }] },
  { pkg: "services/connectors-crm", forbid: [{ re: /@rtnads\/(analytics-engine|benchmark-engine|decision-engine|orchestrator|policy-engine|action-executor|bff)|-mcp/, why: "connectors are L1" }] },
  { pkg: "services/policy-engine", forbid: [{ re: /@rtnads\/(orchestrator|.*-mcp|bff|analytics-engine|benchmark-engine)|(^|["'/])pg($|["'])/, why: "the Policy Engine is a pure deterministic gate" }] },
  { pkg: "mcp-servers/ads-analytics-mcp", forbid: [{ re: /@rtnads\/(crm-mcp|rtn-knowledge-mcp|ads-actions-mcp)/, why: "MCP servers must not import each other (docs/04 §topology)" }] },
  { pkg: "mcp-servers/ads-actions-mcp", forbid: [{ re: /@rtnads\/(crm-mcp|rtn-knowledge-mcp|ads-analytics-mcp)/, why: "MCP servers must not import each other" }] },
  { pkg: "mcp-servers/crm-mcp", forbid: [{ re: /@rtnads\/(ads-analytics-mcp|rtn-knowledge-mcp|ads-actions-mcp)/, why: "MCP servers must not import each other" }] },
  { pkg: "mcp-servers/rtn-knowledge-mcp", forbid: [{ re: /@rtnads\/(ads-analytics-mcp|crm-mcp|ads-actions-mcp)/, why: "MCP servers must not import each other" }] },
];

const IMPORT_RE = /(?:from|import)\s*["']([^"']+)["']|import\(["']([^"']+)["']\)/g;

function walk(dir) {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { if (e !== "node_modules" && e !== "dist") out.push(...walk(p)); }
    else if (e.endsWith(".ts") && !e.endsWith(".test.ts") && !e.includes(".integration.")) out.push(p);
  }
  return out;
}

let violations = 0;
for (const rule of RULES) {
  const files = walk(join(ROOT, rule.pkg, "src"));
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2];
      if (!spec) continue;
      for (const f of rule.forbid) {
        if (f.re.test(spec)) {
          console.error(`✗ ${rule.pkg}: forbidden import "${spec}"\n    in ${file.replace(ROOT, "")}\n    ${f.why}`);
          violations++;
        }
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} dependency-boundary violation(s).`);
  process.exit(1);
}
console.log("dependency boundaries OK");
