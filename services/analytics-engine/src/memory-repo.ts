import type { EntityRef, UnitEconomicsModel } from "@rtnads/contracts";
import type {
  AnalyticsRepository,
  AnalyticsInputs,
  DateWindow,
} from "./types.js";

/**
 * In-memory repository for tests and fixtures. Keyed by entity id; mirrors what a
 * Postgres-backed repository will return so the engine's math is exercised
 * identically in both (docs/14 §8).
 */
export class InMemoryAnalyticsRepository implements AnalyticsRepository {
  constructor(private readonly byEntityId: Map<string, AnalyticsInputs>) {}

  async load(
    _clientId: string,
    entity: EntityRef,
    window: DateWindow,
    model: UnitEconomicsModel,
  ): Promise<AnalyticsInputs> {
    const found = this.byEntityId.get(entity.id);
    if (!found) throw new Error(`no analytics inputs for entity ${entity.id}`);
    // Return with the requested context so callers see a consistent window/model.
    return { ...found, entity, window, model };
  }
}
