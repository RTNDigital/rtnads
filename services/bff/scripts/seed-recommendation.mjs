/**
 * Pipeline runner: derive a real recommendation from the loaded warehouse and
 * persist it for the operator console. Runs the deterministic chain
 * analytics → benchmark → decision, then the AI orchestrator (scripted provider,
 * offline) for the narrative, and writes it to intel.recommendation.
 *
 *   DATABASE_URL=… node scripts/seed-recommendation.mjs <client-uuid>
 *
 * Requires a prior `pnpm build` and the standard seeded data (ads + CRM + classify
 * + historical fixtures).
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const R = (p) => pathToFileURL(join(here, "..", "..", "..", p)).href;
const { AnalyticsEngine, PgAnalyticsRepository } = await import(R("services/analytics-engine/dist/index.js"));
const { BenchmarkEngine, PgBenchmarkRepository } = await import(R("services/benchmark-engine/dist/index.js"));
const { DecisionEngine } = await import(R("services/decision-engine/dist/index.js"));
const { AiOrchestrator, buildEvidenceText } = await import(R("services/orchestrator/dist/index.js"));
const { ScriptedLlmProvider } = await import(R("providers/llm-core/dist/index.js"));

const clientId = process.argv[2];
const url = process.env.DATABASE_URL;
if (!clientId || !url) { console.error("usage: DATABASE_URL=… node scripts/seed-recommendation.mjs <client-uuid>"); process.exit(1); }

const pool = new pg.Pool({ connectionString: url });
const window = { start: "2026-07-01", end: "2026-07-31" };

// Resolve the subject campaign + its account.
const { rows } = await pool.query(
  `SELECT c.id AS campaign_id, a.id AS account_id
     FROM core.campaign c JOIN core.ad_account a ON a.id=c.ad_account_id
    WHERE c.external_id='camp_2001' AND c.client_id=$1`, [clientId]);
if (!rows[0]) { console.error("camp_2001 not found — load the ads read-path first"); process.exit(1); }
const entity = { type: "campaign", id: rows[0].campaign_id };
const accountId = rows[0].account_id;

// 1. analytics (for the subject sample) + 2. benchmark on CPL.
const analytics = new AnalyticsEngine(new PgAnalyticsRepository(pool));
const snap = await analytics.analyze(clientId, entity, window, "health_tourism");
const benchmark = new BenchmarkEngine(new PgBenchmarkRepository(pool));
const b = await benchmark.compareWithCohort(clientId, entity, "cpl", window);

if (b.comparison.cohort_size < 3) { console.error("insufficient cohort — load historical fixtures first"); process.exit(1); }

// 3. decision → candidate draft.
const evidence = {
  entity, window,
  primary: {
    cohort_id: randomUUID(), metric: "cpl", subject_value: b.comparison.subject_value,
    percentile: b.comparison.percentile, assessment: b.comparison.assessment,
    cohort_size: b.comparison.cohort_size, effective_sample: b.comparison.effective_sample,
    cohort_p50: b.comparison.cohort.p50, lower_is_better: true, recency: 0.85,
  },
  anomalies: [],
  subject_sample: snap.totals.conversions,
  supporting_metrics: { cpl_minor: b.comparison.subject_value, cohort_median_minor: b.comparison.cohort.p50 },
};
const [draft] = new DecisionEngine().generate(evidence);
if (!draft) { console.error("no candidate recommendation for this subject (within expected)"); process.exit(0); }

// 4. orchestrator narrative (offline scripted provider, digit-free → always grounded).
const narrative =
  "This campaign's cost per lead compares favourably against its most similar RTN cohort, " +
  "so the recommended change is supported by cohort evidence. This is correlational evidence, " +
  "not proof that the action will cause the expected change; a short observation window is advised.";
const orch = new AiOrchestrator({
  provider: new ScriptedLlmProvider(narrative, { model: "scripted-1", version: "0.0.0" }),
  now: () => new Date().toISOString(),
  newId: () => randomUUID(),
});
const rec = await orch.authorRecommendation({ clientId, draft, evidenceText: buildEvidenceText(draft) });

// 5. persist for the operator console.
await pool.query(
  `INSERT INTO intel.recommendation (id, client_id, entity_type, entity_id, account_id, recommendation_type, status, confidence, risk_level, doc, created_at)
   VALUES ($1,$2,$3,$4,$5,$6,'published',$7,$8,$9::jsonb,$10)
   ON CONFLICT (id) DO NOTHING`,
  [rec.id, clientId, rec.entity.type, rec.entity.id, accountId, rec.recommendation_type, rec.confidence_score, rec.risk_level, JSON.stringify(rec), rec.created_at],
);
console.log(`persisted recommendation ${rec.id} (${rec.recommendation_type}, ${rec.benchmark_comparison.assessment}, conf ${rec.confidence_score.toFixed(2)})`);
await pool.end();
