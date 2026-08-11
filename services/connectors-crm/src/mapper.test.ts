import { describe, it, expect } from "vitest";
import { pseudonymize } from "./pseudonymize.js";
import { qualityBand, mapLead } from "./mapper.js";
import { GenericCrmConnector } from "./connector.js";
import { FixtureCrmSource, LEADS } from "./fixtures.js";
import type { CrmConnectorConfig } from "./types.js";
import { NormalizedCrmSync } from "@rtnads/contracts";

const CONFIG: CrmConnectorConfig = { pseudonymSalt: "test-salt-do-not-use-in-prod" };

describe("pseudonymize", () => {
  it("is deterministic and stable across variations", () => {
    const a = pseudonymize("Patient01@Example.com ", CONFIG.pseudonymSalt);
    const b = pseudonymize("patient01@example.com", CONFIG.pseudonymSalt);
    expect(a).toBe(b); // normalized identity → same pseudonym
  });

  it("depends on the salt (non-reversible without it)", () => {
    expect(pseudonymize("x@y.com", "salt-a")).not.toBe(
      pseudonymize("x@y.com", "salt-b"),
    );
  });

  it("produces a 64-hex-char digest and not the raw input", () => {
    const p = pseudonymize("x@y.com", CONFIG.pseudonymSalt);
    expect(p).toMatch(/^[0-9a-f]{64}$/);
    expect(p).not.toContain("x@y.com");
  });
});

describe("qualityBand", () => {
  it("maps scores to bands", () => {
    expect(qualityBand(92)).toBe("high");
    expect(qualityBand(55)).toBe("mid");
    expect(qualityBand(12)).toBe("low");
    expect(qualityBand(undefined)).toBeNull();
  });
});

describe("mapLead drops PII", () => {
  it("emits only pseudonym + non-PII qualifiers", () => {
    const row = mapLead(LEADS[0]!, CONFIG);
    const serialized = JSON.stringify(row);
    // The raw lead's PII must not appear anywhere in the mapped row.
    expect(serialized).not.toContain("Patient 01");
    expect(serialized).not.toContain("patient01@example.com");
    expect(serialized).not.toContain("7700");
    expect(row.pseudonym_id).toMatch(/^[0-9a-f]{64}$/);
    expect(row.lead_quality).toBe("high");
    expect(row.attributes).toEqual({ procedure_interest: "rhinoplasty", market: "uk" });
  });
});

describe("no-PII-upward invariant (docs/14 §3)", () => {
  it("the entire normalized CRM sync contains no raw PII", async () => {
    const connector = new GenericCrmConnector(
      "hubspot",
      new FixtureCrmSource(),
      CONFIG,
    );
    const sync = await connector.pull({
      client_id: "11111111-1111-1111-1111-111111111111",
      vertical_path: "health-tourism",
      window: { start: "2026-07-01", end: "2026-07-31" },
    });
    expect(() => NormalizedCrmSync.parse(sync)).not.toThrow();

    const blob = JSON.stringify(sync);
    // No name, email, or phone from any fixture lead may survive.
    expect(blob).not.toMatch(/Patient \d\d/);
    expect(blob).not.toMatch(/@example\.com/);
    expect(blob).not.toMatch(/\+44 7700/);

    // Funnel counts are as designed.
    expect(sync.leads).toHaveLength(10);
    const byStage = (k: string) => sync.events.filter((e) => e.stage_key === k).length;
    expect(byStage("lead")).toBe(10);
    expect(byStage("qualified")).toBe(4);
    expect(byStage("booking")).toBe(2);
    expect(sync.sales).toHaveLength(1);
  });
});
