import type { TaxonomyNode } from "@rtnads/contracts";

/**
 * Pure helpers over the extensible industry taxonomy (docs/02-domain-model.md §3).
 * The taxonomy is data; these helpers never mutate storage.
 */

/** Build a materialized path from an ordered list of node keys. */
export function buildPath(keys: readonly string[]): string {
  return keys.filter(Boolean).join("/");
}

/** Split a materialized path into its keys. */
export function parsePath(path: string): string[] {
  return path.split("/").filter(Boolean);
}

/** Depth of a node = number of path segments (root vertical = 1). */
export function pathDepth(path: string): number {
  return parsePath(path).length;
}

/** True if `descendantPath` is at or below `ancestorPath` in the tree. */
export function isDescendant(ancestorPath: string, descendantPath: string): boolean {
  const a = parsePath(ancestorPath);
  const d = parsePath(descendantPath);
  if (d.length < a.length) return false;
  return a.every((seg, i) => seg === d[i]);
}

/**
 * Return the subtree rooted at `rootPath` (inclusive) from a flat node list.
 * Extensibility: new nodes appear here with no code change.
 */
export function subtree(
  nodes: readonly TaxonomyNode[],
  rootPath: string,
): TaxonomyNode[] {
  return nodes.filter((n) => isDescendant(rootPath, n.path));
}

/** Index nodes by id for O(1) parent walks. */
export function indexById(
  nodes: readonly TaxonomyNode[],
): Map<string, TaxonomyNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}
