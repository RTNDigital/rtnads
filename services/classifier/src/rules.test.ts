import { describe, it, expect } from "vitest";
import {
  normalizeObjective,
  conversionForObjective,
  inferSubcategory,
  classifyCampaign,
} from "./rules.js";
import { buildClassificationUpsertSql } from "./loader.js";
import { ClassificationAssignment } from "@rtnads/contracts";

describe("objective + conversion normalization", () => {
  it("normalizes platform objectives", () => {
    expect(normalizeObjective("OUTCOME_LEADS")).toBe("leads");
    expect(normalizeObjective("OUTCOME_SALES")).toBe("sales");
    expect(normalizeObjective("LINK_CLICKS")).toBe("traffic");
    expect(normalizeObjective(null)).toBeNull();
  });

  it("maps objective to conversion mechanism", () => {
    expect(conversionForObjective("leads")).toBe("form-lead");
    expect(conversionForObjective("sales")).toBe("purchase");
    expect(conversionForObjective("traffic")).toBeNull();
  });
});

describe("subcategory inference", () => {
  it("detects Health Tourism subcategories from the campaign name", () => {
    expect(inferSubcategory("Rhino-UK-Leads-Q3")).toBe("rhinoplasty");
    expect(inferSubcategory("Hair Transplant Germany")).toBe("hair-transplant");
    expect(inferSubcategory("Dental Implants UK")).toBe("dental");
    expect(inferSubcategory("Generic Brand Campaign")).toBeNull();
  });
});

describe("classifyCampaign", () => {
  it("builds a context vector from rules, tagged with source and confidence", () => {
    const assignments = classifyCampaign({
      campaign: { name: "Rhino-UK-Leads-Q3", objective: "OUTCOME_LEADS", maturity: "mature" },
      account: { platform: "meta", market: "uk", country: "uk" },
    });
    // Every assignment is contract-valid.
    for (const a of assignments) expect(ClassificationAssignment.parse(a)).toBeTruthy();

    const byKey = Object.fromEntries(assignments.map((a) => [a.dimension_key, a]));
    expect(byKey.platform?.value).toBe("meta");
    expect(byKey.objective?.value).toBe("leads");
    expect(byKey.conversion_type?.value).toBe("form-lead");
    expect(byKey.vertical?.value).toBe("health-tourism");
    expect(byKey.subcategory?.value).toBe("health-tourism/rhinoplasty");
    expect(byKey.campaign_maturity?.value).toBe("mature");
    // taxonomy dims are stored as materialized paths (for hierarchical similarity)
    expect(byKey.subcategory?.source).toBe("rule");
  });

  it("lets explicit (ingested) context override rule-derived values", () => {
    const assignments = classifyCampaign({
      campaign: { name: "Rhino-UK-Leads-Q3", objective: "OUTCOME_LEADS" },
      account: { platform: "meta" },
      explicit: { subcategory: "health-tourism/dental", market: "de" },
    });
    const byKey = Object.fromEntries(assignments.map((a) => [a.dimension_key, a]));
    expect(byKey.subcategory?.value).toBe("health-tourism/dental");
    expect(byKey.subcategory?.source).toBe("ingested");
    expect(byKey.market?.value).toBe("de");
    // rule did not overwrite the explicit subcategory
    expect(assignments.filter((a) => a.dimension_key === "subcategory")).toHaveLength(1);
  });
});

describe("buildClassificationUpsertSql", () => {
  const assignments: ClassificationAssignment[] = [
    { dimension_key: "platform", value: "meta", source: "ingested", confidence: 1 },
    { dimension_key: "subcategory", value: "health-tourism/rhinoplasty", source: "rule", confidence: 0.8 },
  ];

  it("emits idempotent upserts that resolve entity + dimension by lookup", () => {
    const sql = buildClassificationUpsertSql(
      { clientId: "c1", entityType: "campaign", externalId: "camp_2001" },
      assignments,
    );
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("FROM taxonomy.dimension d");
    expect(sql).toContain("JOIN core.campaign e ON e.external_id='camp_2001'");
    expect(sql).toContain("ON CONFLICT (entity_type, entity_id, dimension_id) WHERE valid_to IS NULL");
    expect(sql).toContain("COMMIT;");
  });

  it("rejects an unknown entity type", () => {
    expect(() =>
      buildClassificationUpsertSql({ clientId: "c1", entityType: "widget", externalId: "x" }, assignments),
    ).toThrow(/unknown entity type/);
  });

  it("escapes single quotes to prevent SQL breakage", () => {
    const sql = buildClassificationUpsertSql(
      { clientId: "c1", entityType: "campaign", externalId: "o'brien" },
      [{ dimension_key: "market", value: "uk", source: "rule", confidence: 1 }],
    );
    expect(sql).toContain("external_id='o''brien'");
  });
});
