import { z } from "zod";
import { Uuid, EntityType } from "./common.js";

/**
 * Extensible industry taxonomy and context-dimension registry.
 * These are DATA, not schema: adding a vertical, subcategory or dimension is an
 * insert, never a migration (docs/02-domain-model.md §3–4, docs/03-database-model.md).
 */

/** A node in the industry tree (vertical → subcategory → …). */
export const TaxonomyNode = z.object({
  id: Uuid,
  parent_id: Uuid.nullable(),
  key: z.string().min(1), // e.g. "rhinoplasty"
  label: z.string().min(1),
  level: z.number().int().nonnegative(),
  /** Materialized path, e.g. "health-tourism/rhinoplasty". Unique. */
  path: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type TaxonomyNode = z.infer<typeof TaxonomyNode>;

/** How a context dimension's values are represented & compared. */
export const DimensionValueType = z.enum([
  "enum", // controlled vocabulary
  "taxonomy_ref", // references a taxonomy node (hierarchical distance)
  "range", // ordered buckets (bucket distance)
  "embedding", // vector cosine similarity (e.g. creative attributes)
  "free", // free text (exact/normalized match only)
]);
export type DimensionValueType = z.infer<typeof DimensionValueType>;

/** A registered classification axis (platform, market, funnel_stage, …). */
export const ContextDimension = z.object({
  id: Uuid,
  key: z.string().min(1),
  label: z.string().min(1),
  value_type: DimensionValueType,
  /** Comparator params, allowed values / bucketing, etc. */
  config: z.record(z.string(), z.unknown()).default({}),
});
export type ContextDimension = z.infer<typeof ContextDimension>;

/** Controlled vocabulary entry for enum/range dimensions. */
export const DimensionValue = z.object({
  id: Uuid,
  dimension_id: Uuid,
  value: z.string(),
  ordinal: z.number().int().nullable(), // for ranges / bands
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type DimensionValue = z.infer<typeof DimensionValue>;

/** Where a classification came from (precedence: human > rule > ai-suggested > ingested). */
export const ClassificationSource = z.enum([
  "ingested",
  "rule",
  "ai-suggested",
  "human",
]);
export type ClassificationSource = z.infer<typeof ClassificationSource>;

/**
 * A proposed/assigned classification for one dimension, before it is persisted as
 * a versioned row. Produced by the Classifier (docs/07 §Classifier).
 */
export const ClassificationAssignment = z.object({
  dimension_key: z.string().min(1),
  value: z.string().min(1),
  source: ClassificationSource,
  confidence: z.number().min(0).max(1),
});
export type ClassificationAssignment = z.infer<typeof ClassificationAssignment>;

/** (entity, dimension) → value, versioned and sourced. */
export const Classification = z.object({
  id: Uuid,
  client_id: Uuid,
  entity_type: EntityType,
  entity_id: Uuid,
  dimension_id: Uuid,
  value: z.string(),
  source: ClassificationSource,
  confidence: z.number().min(0).max(1),
  valid_from: z.string().datetime(),
  valid_to: z.string().datetime().nullable(), // null = current
});
export type Classification = z.infer<typeof Classification>;
