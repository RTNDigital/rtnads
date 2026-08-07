import { NormalizedSync } from "@rtnads/contracts";
import type { CreativeRow } from "@rtnads/contracts";
import type {
  PlatformConnector,
  PullInput,
  MetaRawSource,
  MetaConnectorConfig,
} from "../types.js";
import { DEFAULT_META_CONFIG } from "../types.js";
import {
  mapAccount,
  mapCampaign,
  mapAdSet,
  mapAd,
  mapCreativeFromAd,
  mapInsight,
} from "./mapper.js";

/**
 * Meta connector: orchestrates fetch → map → assemble → validate. The output is
 * runtime-validated against the NormalizedSync contract, so a malformed sync
 * never leaves L1 (docs/06 §5 — reads are reproducible, writes are recorded).
 */
export class MetaConnector implements PlatformConnector {
  readonly platform = "meta";

  constructor(
    private readonly source: MetaRawSource,
    private readonly config: MetaConnectorConfig = DEFAULT_META_CONFIG,
  ) {}

  async pull(input: PullInput): Promise<NormalizedSync> {
    const acctExt = input.account_external_id;
    const [rawAccount, rawCampaigns, rawAdSets, rawAds, rawInsights] =
      await Promise.all([
        this.source.fetchAccount(acctExt),
        this.source.fetchCampaigns(acctExt),
        this.source.fetchAdSets(acctExt),
        this.source.fetchAds(acctExt),
        this.source.fetchInsights(acctExt, input.window),
      ]);

    const account = mapAccount(rawAccount);

    const campaigns = rawCampaigns.map((c) => ({
      ...mapCampaign(c),
      account_external_id: account.external_id,
    }));

    const ad_sets = rawAdSets.map(mapAdSet);
    const ads = rawAds.map(mapAd);

    // Dedupe creatives referenced by ads.
    const creativeById = new Map<string, CreativeRow>();
    for (const ad of rawAds) {
      const cr = mapCreativeFromAd(ad);
      if (cr) creativeById.set(cr.external_id, cr);
    }
    const creatives = [...creativeById.values()];

    const facts = rawInsights
      .map((i) => mapInsight(i, account.currency, this.config))
      .filter((f): f is NonNullable<typeof f> => f !== null);

    // Validate at the L1→L2 boundary — a malformed sync fails here, not downstream.
    return NormalizedSync.parse({
      client_id: input.client_id,
      account,
      campaigns,
      ad_sets,
      ads,
      creatives,
      facts,
    });
  }
}
