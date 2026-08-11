import type { Pool } from "pg";
import type { AuditEntry } from "@rtnads/contracts";
import { appendEntry, verifyChain, type AuditInput, type AuditSink } from "./audit.js";

/**
 * Postgres-backed, append-only hash-chained audit log (docs/09 §8). Each append
 * reads the tip of the chain, links to it, and inserts a new immutable row. The
 * audit table grants the app role INSERT + SELECT only (migration 0009), so rows
 * cannot be updated or deleted through the application.
 *
 * The chain is global and ordered by `seq`; a privileged writer runs this (the
 * app role cannot see across tenants under RLS). Integration tests connect as the
 * owner, which is the same privileged posture.
 */
export class PgAuditLog implements AuditSink {
  constructor(private readonly pool: Pool) {}

  async append(input: AuditInput): Promise<AuditEntry> {
    const { rows } = await this.pool.query(
      "SELECT seq, hash FROM control.audit_entry ORDER BY seq DESC LIMIT 1",
    );
    const prev = rows[0]
      ? ({ seq: Number(rows[0].seq), hash: rows[0].hash } as AuditEntry)
      : null;
    const entry = appendEntry(prev, input);
    await this.pool.query(
      `INSERT INTO control.audit_entry
         (seq, client_id, actor, actor_kind, action, subject_ref, payload, prev_hash, hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)`,
      [
        entry.seq,
        entry.client_id,
        entry.actor,
        entry.actor_kind,
        entry.action,
        entry.subject_ref,
        JSON.stringify(entry.payload),
        entry.prev_hash,
        entry.hash,
        entry.created_at,
      ],
    );
    return entry;
  }

  /** Read the whole chain in order and verify its integrity. */
  async verify(): Promise<boolean> {
    const { rows } = await this.pool.query(
      "SELECT seq, client_id, actor, actor_kind, action, subject_ref, payload, prev_hash, hash, to_char(created_at,'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') AS created_at FROM control.audit_entry ORDER BY seq",
    );
    const entries: AuditEntry[] = rows.map((r) => ({
      seq: Number(r.seq),
      client_id: r.client_id,
      actor: r.actor,
      actor_kind: r.actor_kind,
      action: r.action,
      subject_ref: r.subject_ref,
      payload: r.payload,
      prev_hash: r.prev_hash,
      hash: r.hash,
      created_at: r.created_at,
    }));
    return verifyChain(entries);
  }
}
