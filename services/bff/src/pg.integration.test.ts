import { describe, it, expect, afterAll } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { Recommendation } from "@rtnads/contracts";
import { PgQueryStore, PgControlOps } from "./pg.js";
import { makePrincipal } from "./index.js";

/**
 * BFF Postgres store integration (docs/06). Runs when DATABASE_URL is set. Seeds a
 * recommendation, then proves the read models + approval flow work against the
 * real control/intel schemas — including tenant scoping and the audit write.
 */
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;
const CLIENT = "dddddddd-0000-0000-0000-00000000bff1";
const OTHER = "eeeeeeee-0000-0000-0000-00000000bff2";

function recDoc(id: string, clientId: string): Recommendation {
  return Recommendation.parse({
    id, client_id: clientId, recommendation_type: "budget_increase",
    entity: { type: "campaign", id: "22222222-2222-2222-2222-222222222222" },
    recommended_action: { action: "update_budget", change: { type: "percent", value: 0.2 } },
    reasoning: "Grounded rationale.", supporting_metrics: {},
    benchmark_comparison: { cohort_id: randomUUID(), metric: "cpl", percentile: 0.2, assessment: "outperforming" },
    confidence_score: 0.5,
    confidence_detail: { evidence_strength: 0.6, sample_adequacy: 0.5, causal_support: "weak", recency: 0.85 },
    risk_level: "low",
    expected_outcome: { metric: "cpl", direction: "hold", magnitude_range: [0, 0.1], basis: "cohort_evidence" },
    evidence_window: { start: "2026-07-01", end: "2026-07-31" },
    recommended_observation_period: "P14D",
    model_provenance: { provider: "scripted", model: "scripted-1", version: "0.0.0" },
    status: "published", created_at: "2026-08-08T12:00:00.000Z",
  });
}

suite("BFF Postgres stores", () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(async () => { await pool.end(); });

  it("reads recommendations tenant-scoped and runs the approval flow", async () => {
    const recId = randomUUID();
    await pool.query("INSERT INTO iam.client(id,name) VALUES ($1,'BffA'),($2,'BffB') ON CONFLICT DO NOTHING", [CLIENT, OTHER]);
    const doc = recDoc(recId, CLIENT);
    await pool.query(
      `INSERT INTO intel.recommendation (id, client_id, entity_type, entity_id, account_id, recommendation_type, status, confidence, risk_level, doc, created_at)
       VALUES ($1,$2,'campaign',$3,$4,'budget_increase','published',0.5,'low',$5::jsonb,$6) ON CONFLICT (id) DO NOTHING`,
      [recId, CLIENT, doc.entity.id, "aaaaaaaa-0000-0000-0000-0000000000a1", JSON.stringify(doc), doc.created_at],
    );

    const query = new PgQueryStore(pool);
    const control = new PgControlOps(pool, () => new Date().toISOString(), () => randomUUID());

    // read models, tenant-scoped
    const list = await query.listRecommendations(CLIENT, { status: "published" });
    expect(list.find((r) => r.id === recId)).toBeTruthy();
    expect(await query.getRecommendation(OTHER, recId)).toBeNull(); // cross-tenant invisible

    // approval flow
    const principal = makePrincipal("user:operator", CLIENT, ["optimizer"]);
    const { action } = await control.approve(CLIENT, recId, principal, "looks good");
    expect(action.status).toBe("approved");

    // effects: recommendation flipped, action row exists, audit entry written
    const status = await pool.query("SELECT status FROM intel.recommendation WHERE id=$1", [recId]);
    expect(status.rows[0].status).toBe("approved");
    const got = await query.getAction(CLIENT, action.id);
    expect(got?.action.id).toBe(action.id);
    const audit = await query.getAudit(CLIENT, `action:${action.id}`);
    expect(audit.map((e) => e.action)).toContain("decision.approved");
  });
});
