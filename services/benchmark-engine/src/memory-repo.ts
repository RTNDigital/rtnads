import type { EntityRef } from "@rtnads/contracts";
import type {
  BenchmarkRepository,
  BenchmarkDataset,
  DateWindow,
} from "./types.js";

/**
 * In-memory benchmark repository for tests and fixtures. Keyed by subject entity
 * id; returns a preset dataset (subject + candidate cohort) so the weighted
 * cohort math is exercised identically to a warehouse-backed repo.
 */
export class InMemoryBenchmarkRepository implements BenchmarkRepository {
  constructor(private readonly byEntityId: Map<string, BenchmarkDataset>) {}

  async load(
    _clientId: string,
    entity: EntityRef,
    _metric: string,
    _window: DateWindow,
  ): Promise<BenchmarkDataset> {
    const ds = this.byEntityId.get(entity.id);
    if (!ds) throw new Error(`no benchmark dataset for entity ${entity.id}`);
    return ds;
  }
}
