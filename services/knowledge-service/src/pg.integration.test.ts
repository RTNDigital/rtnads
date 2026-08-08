import { describe, it, expect, afterAll } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { PgLearningSuggestionStore } from "./pg.js";

/**
 * Strategy Memory store integration (migration 0012). Runs when DATABASE_URL is
 * set. Proves supersede-on-upsert, source-event dedupe, the human decision gate,
 * and RLS tenant isolation against real Postgres.
 */
const url = process.env.DATABASE_URL;
const suite = url ? describe : describe.skip;
const CLIENT = "dddddddd-0000-0000-0000-00000000c0d1";
const OTHER = "eeeeeeee-0000-0000-0000-00000000c0d2";

suite("PgLearningSuggestionStore", () => {
  const pool = new pg.Pool({ connectionString: url });
  afterAll(async () => {
    await pool.end();
  });

  it("supersedes, dedupes, decides and isolates tenants", async () => {
    await pool.query("INSERT INTO iam.client(id,name) VALUES ($1,'KnowA'),($2,'KnowB') ON CONFLICT DO NOTHING", [CLIENT, OTHER]);
    const store = new PgLearningSuggestionStore(pool, () => new Date().toISOString(), () => randomUUID());

    // supersede: two upserts → one pending (latest), one superseded
    const evt1 = randomUUID();
    const evt2 = randomUUID();
    await store.upsertPending({ clientId: CLIENT, snapshot: { sample_size: 1 }, sourceEventId: evt1 });
    const latest = await store.upsertPending({ clientId: CLIENT, snapshot: { sample_size: 5 }, sourceEventId: evt2 });
    const pending = await store.list(CLIENT, "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0]!.id).toBe(latest!.id);
    expect(pending[0]!.snapshot.sample_size).toBe(5);

    // dedupe by source event
    const dup = await store.upsertPending({ clientId: CLIENT, snapshot: { sample_size: 5 }, sourceEventId: evt2 });
    expect(dup).toBeNull();

    // human decision gate
    const accepted = await store.decide(CLIENT, latest!.id, "accepted", "user:lead", "approved");
    expect(accepted.status).toBe("accepted");
    await expect(store.decide(CLIENT, latest!.id, "rejected", "user:lead")).rejects.toThrow();

    // RLS isolation — the other tenant cannot see this suggestion
    expect(await store.get(OTHER, latest!.id)).toBeNull();
  });
});
