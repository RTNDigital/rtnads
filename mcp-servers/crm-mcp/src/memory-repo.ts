import type { EntityRef } from "@rtnads/contracts";
import type {
  CrmRepository,
  DateWindow,
  LeadQualityDistribution,
  FunnelConversion,
  SalesOutcomes,
} from "./types.js";

/** In-memory anonymized CRM data for tests/fixtures, keyed by entity id. */
export class InMemoryCrmRepository implements CrmRepository {
  constructor(
    private readonly byEntityId: Map<
      string,
      { quality: LeadQualityDistribution; funnel: FunnelConversion; sales: SalesOutcomes }
    >,
  ) {}

  private get(entity: EntityRef) {
    const d = this.byEntityId.get(entity.id);
    if (!d) throw new Error(`no CRM data for entity ${entity.id}`);
    return d;
  }
  async leadQualityDistribution(_c: string, e: EntityRef, _w: DateWindow): Promise<LeadQualityDistribution> {
    return this.get(e).quality;
  }
  async funnelConversion(_c: string, e: EntityRef, _w: DateWindow): Promise<FunnelConversion> {
    return this.get(e).funnel;
  }
  async salesOutcomes(_c: string, e: EntityRef, _w: DateWindow): Promise<SalesOutcomes> {
    return this.get(e).sales;
  }
}
