import type { ClassificationAssignment } from "@rtnads/contracts";

/**
 * Classifier loader: upserts the current context classifications for one entity.
 * Resolves the entity by external id and the dimension by key, and upserts on the
 * "current classification" partial unique index (migration 0008) so replay is
 * idempotent. Emits SQL text (dependency-free), consistent with the other loaders.
 */

function lit(v: string | number): string {
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  return `'${v.replace(/'/g, "''")}'`;
}

const ENTITY_TABLE: Record<string, string> = {
  account: "core.ad_account",
  campaign: "core.campaign",
  ad_set: "core.ad_set",
  ad: "core.ad",
  creative: "core.creative",
};

export interface ClassificationTarget {
  clientId: string;
  entityType: keyof typeof ENTITY_TABLE | string;
  /** External platform id of the entity to classify. */
  externalId: string;
}

export function buildClassificationUpsertSql(
  target: ClassificationTarget,
  assignments: readonly ClassificationAssignment[],
): string {
  const table = ENTITY_TABLE[target.entityType];
  if (!table) throw new Error(`unknown entity type: ${target.entityType}`);
  const cid = lit(target.clientId);
  const etype = lit(target.entityType);
  const ext = lit(target.externalId);

  const out: string[] = ["BEGIN;"];
  for (const a of assignments) {
    out.push(
      `INSERT INTO taxonomy.classification
         (client_id, entity_type, entity_id, dimension_id, value, source, confidence, valid_from)
       SELECT ${cid}, ${etype}, e.id, d.id, ${lit(a.value)}, ${lit(a.source)}, ${lit(a.confidence)}, now()
       FROM taxonomy.dimension d
       JOIN ${table} e ON e.external_id=${ext} AND e.client_id=${cid}
       WHERE d.key=${lit(a.dimension_key)}
       ON CONFLICT (entity_type, entity_id, dimension_id) WHERE valid_to IS NULL
       DO UPDATE SET value=EXCLUDED.value, source=EXCLUDED.source, confidence=EXCLUDED.confidence;`,
    );
  }
  out.push("COMMIT;");
  return out.join("\n");
}
