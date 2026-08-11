import { describe, it, expect } from "vitest";
import { Recommendation, LearningSuggestion } from "@rtnads/contracts";
import { BffRouter } from "./router.js";
import { InMemoryQueryStore, InMemoryControlOps, InMemoryLearningStore } from "./memory.js";
import { makePrincipal } from "./index.js";

const CLIENT_A = "aaaaaaaa-0000-0000-0000-0000000000a1";
const CLIENT_B = "bbbbbbbb-0000-0000-0000-0000000000b1";
const REC_ID = "22222222-2222-2222-2222-222222222222";
const SUG_ID = "66666666-6666-6666-6666-666666666666";

function suggestion(clientId: string, id: string, status = "pending"): LearningSuggestion {
  return LearningSuggestion.parse({
    id,
    client_id: clientId,
    created_at: "2026-08-22T00:00:00.000Z",
    status,
    kind: "calibration",
    snapshot: { sample_size: 3, result_counts: { improved: 2, neutral: 1, regressed: 0, inconclusive: 0 }, mean_causal_confidence: 0.3 },
    source_event_id: null,
    note: null,
    decided_by: null,
    decided_at: null,
  });
}

function recommendation(clientId: string, id: string, status: string): Recommendation {
  return Recommendation.parse({
    id,
    client_id: clientId,
    recommendation_type: "reallocate",
    entity: { type: "campaign", id: "33333333-3333-3333-3333-333333333333" },
    recommended_action: { shift_fraction: 0.2 },
    reasoning: "Grounded rationale.",
    supporting_metrics: {},
    benchmark_comparison: { cohort_id: "44444444-4444-4444-4444-444444444444", metric: "cpl", percentile: 0.8, assessment: "underperforming" },
    confidence_score: 0.6,
    confidence_detail: { evidence_strength: 0.7, sample_adequacy: 0.6, causal_support: "weak", recency: 0.9 },
    risk_level: "medium",
    expected_outcome: { metric: "cpl", direction: "decrease", magnitude_range: [0.1, 0.25], basis: "cohort_evidence" },
    evidence_window: { start: "2026-07-01", end: "2026-07-31" },
    recommended_observation_period: "P14D",
    model_provenance: { provider: "x", model: "y", version: "1" },
    status,
    created_at: "2026-08-08T00:00:00.000Z",
  });
}

function makeRouter() {
  const query = new InMemoryQueryStore({
    recommendations: { [CLIENT_A]: [recommendation(CLIENT_A, REC_ID, "published")] },
  });
  let n = 0;
  const control = new InMemoryControlOps(
    () => "2026-08-08T12:00:00.000Z",
    () => `55555555-5555-5555-5555-55555555555${n++}`,
  );
  const learning = new InMemoryLearningStore({ [CLIENT_A]: [suggestion(CLIENT_A, SUG_ID)] });
  return { router: new BffRouter({ query, control, learning }), control, learning };
}

const viewer = makePrincipal("u1", CLIENT_A, ["viewer"]);
const optimizer = makePrincipal("u2", CLIENT_A, ["optimizer"]);
const clientB = makePrincipal("u3", CLIENT_B, ["optimizer"]);

describe("RBAC capability resolution", () => {
  it("grants viewers read but not approval", () => {
    expect(viewer.capabilities).toContain("recommendation.read");
    expect(viewer.capabilities).not.toContain("recommendation.approve");
  });
  it("grants optimizers approval + execute", () => {
    expect(optimizer.capabilities).toEqual(expect.arrayContaining(["recommendation.approve", "action.execute"]));
  });
});

describe("BFF routing + authorization", () => {
  it("lists recommendations for a viewer", async () => {
    const { router } = makeRouter();
    const res = await router.dispatch(viewer, { method: "GET", path: "/v1/recommendations?status=published" });
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBe(1);
  });

  it("forbids a viewer from approving (403)", async () => {
    const { router } = makeRouter();
    const res = await router.dispatch(viewer, { method: "POST", path: `/v1/recommendations/${REC_ID}/approve`, body: {} });
    expect(res.status).toBe(403);
  });

  it("lets an optimizer approve, creating an approval + action", async () => {
    const { router, control } = makeRouter();
    const res = await router.dispatch(optimizer, { method: "POST", path: `/v1/recommendations/${REC_ID}/approve`, body: { note: "looks good" } });
    expect(res.status).toBe(200);
    expect(control.approvals).toHaveLength(1);
    expect(control.actions).toHaveLength(1);
    expect(control.actions[0]!.status).toBe("approved");
  });

  it("scopes by principal.client_id — another tenant cannot see the recommendation (404)", async () => {
    const { router } = makeRouter();
    const res = await router.dispatch(clientB, { method: "GET", path: `/v1/recommendations/${REC_ID}` });
    expect(res.status).toBe(404);
  });

  it("requires a reason to reject (400)", async () => {
    const { router } = makeRouter();
    const res = await router.dispatch(optimizer, { method: "POST", path: `/v1/recommendations/${REC_ID}/reject`, body: {} });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown recommendation", async () => {
    const { router } = makeRouter();
    const res = await router.dispatch(optimizer, { method: "GET", path: "/v1/recommendations/99999999-9999-9999-9999-999999999999" });
    expect(res.status).toBe(404);
  });

  it("gates the audit endpoint on audit.read", async () => {
    const { router } = makeRouter();
    // viewer lacks audit.read
    const denied = await router.dispatch(viewer, { method: "GET", path: `/v1/actions/${REC_ID}/audit` });
    expect(denied.status).toBe(403);
    // optimizer has audit.read → 200 (empty list)
    const ok = await router.dispatch(optimizer, { method: "GET", path: `/v1/actions/${REC_ID}/audit` });
    expect(ok.status).toBe(200);
  });
});

describe("BFF learning suggestions (Flow E human gate)", () => {
  it("lists pending suggestions for a reader, scoped to the tenant", async () => {
    const { router } = makeRouter();
    const res = await router.dispatch(viewer, { method: "GET", path: "/v1/learning" });
    expect(res.status).toBe(200);
    expect((res.body as unknown[]).length).toBe(1);
    // another tenant sees nothing
    const other = await router.dispatch(clientB, { method: "GET", path: "/v1/learning" });
    expect(other.status).toBe(200);
    expect((other.body as unknown[]).length).toBe(0);
  });

  it("forbids a viewer from deciding (403)", async () => {
    const { router } = makeRouter();
    const res = await router.dispatch(viewer, { method: "POST", path: `/v1/learning/${SUG_ID}/decide`, body: { decision: "accepted" } });
    expect(res.status).toBe(403);
  });

  it("lets an optimizer accept a suggestion", async () => {
    const { router, learning } = makeRouter();
    const res = await router.dispatch(optimizer, { method: "POST", path: `/v1/learning/${SUG_ID}/decide`, body: { decision: "accepted", note: "ship it" } });
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("accepted");
    // it left the pending queue
    expect(await learning.listSuggestions(CLIENT_A, "pending")).toHaveLength(0);
  });

  it("rejects an invalid decision (400)", async () => {
    const { router } = makeRouter();
    const res = await router.dispatch(optimizer, { method: "POST", path: `/v1/learning/${SUG_ID}/decide`, body: { decision: "maybe" } });
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown suggestion", async () => {
    const { router } = makeRouter();
    const res = await router.dispatch(optimizer, { method: "POST", path: "/v1/learning/99999999-9999-9999-9999-999999999999/decide", body: { decision: "rejected" } });
    expect(res.status).toBe(404);
  });
});
