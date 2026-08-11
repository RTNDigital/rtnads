import type { Pool, PoolClient } from "pg";
import { LearningSuggestion, type LearningSuggestionStatus } from "@rtnads/contracts";
import type { LearningSuggestionStore, UpsertPendingInput, Decision } from "./types.js";

/**
 * Postgres-backed Strategy Memory store (knowledge.learning_suggestion, migration
 * 0012). Every access is client-scoped and sets app.client_id so RLS isolates
 * tenants (fail-closed). Same supersede/dedupe/terminal-decision semantics as the
 * in-memory store.
 */
export class PgLearningSuggestionStore implements LearningSuggestionStore {
  constructor(
    private readonly pool: Pool,
    private readonly now: () => string,
    private readonly newId: () => string,
  ) {}

  private async scoped<T>(clientId: string, fn: (c: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query("SELECT set_config('app.client_id', $1, true)", [clientId]);
      return await fn(c);
    } finally {
      c.release();
    }
  }

  async upsertPending(input: UpsertPendingInput): Promise<LearningSuggestion | null> {
    const { clientId, snapshot, sourceEventId = null, kind = "calibration" } = input;
    return this.scoped(clientId, async (c) => {
      if (sourceEventId) {
        const dup = await c.query(
          "SELECT 1 FROM knowledge.learning_suggestion WHERE client_id=$1 AND source_event_id=$2",
          [clientId, sourceEventId],
        );
        if (dup.rowCount && dup.rowCount > 0) return null;
      }
      await c.query(
        "UPDATE knowledge.learning_suggestion SET status='superseded' WHERE client_id=$1 AND status='pending'",
        [clientId],
      );
      const id = this.newId();
      await c.query(
        `INSERT INTO knowledge.learning_suggestion (id, client_id, created_at, status, kind, snapshot, source_event_id)
         VALUES ($1,$2,$3,'pending',$4,$5::jsonb,$6)`,
        [id, clientId, this.now(), kind, JSON.stringify(snapshot), sourceEventId],
      );
      return this.row(c, clientId, id);
    });
  }

  async list(clientId: string, status?: LearningSuggestionStatus): Promise<LearningSuggestion[]> {
    return this.scoped(clientId, async (c) => {
      const { rows } = await c.query(
        `SELECT * FROM knowledge.learning_suggestion
          WHERE client_id=$1 AND ($2::text IS NULL OR status=$2)
          ORDER BY created_at DESC`,
        [clientId, status ?? null],
      );
      return rows.map(mapRow);
    });
  }

  async get(clientId: string, id: string): Promise<LearningSuggestion | null> {
    return this.scoped(clientId, (c) => this.row(c, clientId, id));
  }

  async decide(clientId: string, id: string, decision: Decision, decidedBy: string, note?: string): Promise<LearningSuggestion> {
    return this.scoped(clientId, async (c) => {
      const cur = await c.query(
        "SELECT status FROM knowledge.learning_suggestion WHERE client_id=$1 AND id=$2",
        [clientId, id],
      );
      if (!cur.rows[0]) throw new Error("learning suggestion not found");
      if (cur.rows[0].status !== "pending") throw new Error(`cannot decide a ${cur.rows[0].status} suggestion`);
      await c.query(
        `UPDATE knowledge.learning_suggestion
            SET status=$3, decided_by=$4, decided_at=$5, note=COALESCE($6, note)
          WHERE client_id=$1 AND id=$2`,
        [clientId, id, decision, decidedBy, this.now(), note ?? null],
      );
      const row = await this.row(c, clientId, id);
      if (!row) throw new Error("learning suggestion vanished after decide");
      return row;
    });
  }

  private async row(c: PoolClient, clientId: string, id: string): Promise<LearningSuggestion | null> {
    const { rows } = await c.query("SELECT * FROM knowledge.learning_suggestion WHERE client_id=$1 AND id=$2", [clientId, id]);
    return rows[0] ? mapRow(rows[0]) : null;
  }
}

function mapRow(r: Record<string, unknown>): LearningSuggestion {
  return LearningSuggestion.parse({
    id: r.id,
    client_id: r.client_id,
    created_at: new Date(r.created_at as string | number | Date).toISOString(),
    status: r.status,
    kind: r.kind,
    snapshot: r.snapshot,
    source_event_id: r.source_event_id ?? null,
    note: r.note ?? null,
    decided_by: r.decided_by ?? null,
    decided_at: r.decided_at ? new Date(r.decided_at as string | number | Date).toISOString() : null,
  });
}
