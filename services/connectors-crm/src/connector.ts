import { NormalizedCrmSync } from "@rtnads/contracts";
import type {
  CrmConnector,
  CrmPullInput,
  CrmRawSource,
  CrmConnectorConfig,
} from "./types.js";
import { mapLead, mapFunnelEvent, mapSale } from "./mapper.js";

/**
 * CRM connector: fetch → pseudonymize/map → assemble → validate. The output is
 * validated against NormalizedCrmSync, a contract that cannot carry PII, so a
 * mistake fails at the boundary rather than leaking identity downstream.
 */
export class GenericCrmConnector implements CrmConnector {
  constructor(
    readonly source: string,
    private readonly raw: CrmRawSource,
    private readonly config: CrmConnectorConfig,
  ) {}

  async pull(input: CrmPullInput): Promise<NormalizedCrmSync> {
    const [rawLeads, rawEvents, rawSales] = await Promise.all([
      this.raw.fetchLeads(input),
      this.raw.fetchFunnelEvents(input),
      this.raw.fetchSales(input),
    ]);

    return NormalizedCrmSync.parse({
      client_id: input.client_id,
      vertical_path: input.vertical_path,
      leads: rawLeads.map((l) => mapLead(l, this.config)),
      events: rawEvents.map((e) => mapFunnelEvent(e, this.config)),
      sales: rawSales.map((s) => mapSale(s, this.config)),
    });
  }
}
