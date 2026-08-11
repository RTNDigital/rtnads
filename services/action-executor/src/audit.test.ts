import { describe, it, expect } from "vitest";
import { InMemoryAuditLog, appendEntry, verifyChain, computeHash, stableStringify, GENESIS_HASH } from "./audit.js";
import type { AuditInput } from "./audit.js";

const input = (over: Partial<AuditInput> = {}): AuditInput => ({
  client_id: "cccccccc-0000-0000-0000-000000000001",
  actor: "system:x",
  actor_kind: "system",
  action: "action.executed",
  subject_ref: "action:1",
  payload: { a: 1 },
  created_at: "2026-08-08T12:00:00.000Z",
  ...over,
});

describe("hash-chained audit", () => {
  it("links entries and verifies a valid chain", () => {
    const log = new InMemoryAuditLog();
    const e0 = log.append(input({ subject_ref: "action:1" }));
    const e1 = log.append(input({ subject_ref: "action:2" }));
    expect(e0.seq).toBe(0);
    expect(e0.prev_hash).toBe(GENESIS_HASH);
    expect(e1.prev_hash).toBe(e0.hash);
    expect(log.verify()).toBe(true);
  });

  it("detects tampering with a past entry", () => {
    const e0 = appendEntry(null, input({ subject_ref: "a" }));
    const e1 = appendEntry(e0, input({ subject_ref: "b" }));
    const chain = [e0, { ...e1 }];
    expect(verifyChain(chain)).toBe(true);
    // tamper with entry 0's payload after the fact
    const tampered = [{ ...e0, payload: { a: 999 } }, e1];
    expect(verifyChain(tampered)).toBe(false);
  });

  it("is order-independent over payload keys (stable hashing)", () => {
    const h1 = computeHash(GENESIS_HASH, 0, input({ payload: { a: 1, b: 2 } }));
    const h2 = computeHash(GENESIS_HASH, 0, input({ payload: { b: 2, a: 1 } }));
    expect(h1).toBe(h2);
    expect(stableStringify({ b: 2, a: 1 })).toBe(stableStringify({ a: 1, b: 2 }));
  });
});
