import { describe, it, expect } from "vitest";
import { buildPath, parsePath, isDescendant, subtree } from "./taxonomy.js";
import type { TaxonomyNode } from "@rtnads/contracts";

const nodes: TaxonomyNode[] = [
  { id: "1", parent_id: null, key: "health-tourism", label: "Health Tourism", level: 0, path: "health-tourism", metadata: {} },
  { id: "2", parent_id: "1", key: "rhinoplasty", label: "Rhinoplasty", level: 1, path: "health-tourism/rhinoplasty", metadata: {} },
  { id: "3", parent_id: "1", key: "dental", label: "Dental", level: 1, path: "health-tourism/dental", metadata: {} },
  { id: "4", parent_id: "3", key: "implants", label: "Implants", level: 2, path: "health-tourism/dental/implants", metadata: {} },
  { id: "5", parent_id: null, key: "ecommerce", label: "E-commerce", level: 0, path: "ecommerce", metadata: {} },
];

describe("taxonomy helpers", () => {
  it("builds and parses paths", () => {
    expect(buildPath(["health-tourism", "dental", "implants"])).toBe("health-tourism/dental/implants");
    expect(parsePath("health-tourism/dental/implants")).toEqual(["health-tourism", "dental", "implants"]);
  });

  it("recognizes descendants", () => {
    expect(isDescendant("health-tourism", "health-tourism/dental/implants")).toBe(true);
    expect(isDescendant("health-tourism/dental", "health-tourism/rhinoplasty")).toBe(false);
    expect(isDescendant("health-tourism/dental", "health-tourism/dental")).toBe(true);
  });

  it("extracts a subtree (extensible: a new node just appears)", () => {
    const t = subtree(nodes, "health-tourism");
    expect(t.map((n) => n.key).sort()).toEqual(["dental", "health-tourism", "implants", "rhinoplasty"]);
    expect(subtree(nodes, "ecommerce").map((n) => n.key)).toEqual(["ecommerce"]);
  });
});
