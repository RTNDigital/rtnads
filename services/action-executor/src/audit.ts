import { createHash } from "node:crypto";
import type { AuditEntry, ActorKind } from "@rtnads/contracts";

/**
 * Append-only, hash-chained audit log (docs/03 §control, docs/09 §8). Each entry
 * commits to the previous one via `hash = H(seq, fields, prev_hash)`, so any
 * tampering with a past entry breaks the chain and is detectable. Pure and
 * deterministic given the inputs.
 */

export const GENESIS_HASH = "0".repeat(64);

export interface AuditInput {
  client_id: string | null;
  actor: string;
  actor_kind: ActorKind;
  action: string;
  subject_ref: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/** Stable JSON: object keys sorted recursively, so hashing is order-independent. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",")}}`;
}

export function computeHash(prevHash: string, seq: number, input: AuditInput): string {
  const canonical = stableStringify({
    seq,
    client_id: input.client_id,
    actor: input.actor,
    actor_kind: input.actor_kind,
    action: input.action,
    subject_ref: input.subject_ref,
    payload: input.payload,
    prev_hash: prevHash,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Build the next entry given the previous one (or null for the first). */
export function appendEntry(prev: AuditEntry | null, input: AuditInput): AuditEntry {
  const seq = prev ? prev.seq + 1 : 0;
  const prevHash = prev ? prev.hash : GENESIS_HASH;
  return {
    seq,
    client_id: input.client_id,
    actor: input.actor,
    actor_kind: input.actor_kind,
    action: input.action,
    subject_ref: input.subject_ref,
    payload: input.payload,
    prev_hash: prevHash,
    hash: computeHash(prevHash, seq, input),
    created_at: input.created_at,
  };
}

/**
 * Verify a full chain: strictly-increasing sequence, prev_hash linkage, and
 * recomputed hashes. Works for any monotonic seq (in-memory chains start at 0,
 * a Postgres bigserial chain starts at 1) — integrity rests on the hash linkage,
 * not on a specific starting index.
 */
export function verifyChain(entries: readonly AuditEntry[]): boolean {
  let prevHash = GENESIS_HASH;
  let prevSeq: number | null = null;
  for (const e of entries) {
    if (prevSeq !== null && e.seq <= prevSeq) return false;
    if (e.prev_hash !== prevHash) return false;
    if (computeHash(prevHash, e.seq, e) !== e.hash) return false;
    prevHash = e.hash;
    prevSeq = e.seq;
  }
  return true;
}

/** An append-only audit sink — in-memory or Postgres-backed. */
export interface AuditSink {
  append(input: AuditInput): AuditEntry | Promise<AuditEntry>;
}

/** In-memory append-only audit log for tests and fixtures. */
export class InMemoryAuditLog {
  private readonly _entries: AuditEntry[] = [];

  append(input: AuditInput): AuditEntry {
    const prev = this._entries[this._entries.length - 1] ?? null;
    const entry = appendEntry(prev, input);
    this._entries.push(entry);
    return entry;
  }

  get entries(): readonly AuditEntry[] {
    return this._entries;
  }

  verify(): boolean {
    return verifyChain(this._entries);
  }
}
