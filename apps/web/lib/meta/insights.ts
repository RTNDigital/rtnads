import { metaFetch } from "./client";
import type { MetaInsight, MetaApiResponse } from "./types";

const DEFAULT_FIELDS = "spend,impressions,clicks,cpc,cpm,ctr,reach,frequency,actions,cost_per_action_type";

export async function getInsights(
  objectId: string,
  params: {
    level: "campaign" | "adset" | "ad";
    fields?: string;
    dateRange: { since: string; until: string };
    timeIncrement?: number;
  },
  accountId?: string,
): Promise<MetaInsight[]> {
  const queryParams: Record<string, string> = {
    level: params.level,
    fields: params.fields || DEFAULT_FIELDS,
    time_range: JSON.stringify({
      since: params.dateRange.since,
      until: params.dateRange.until,
    }),
  };
  if (params.timeIncrement) {
    queryParams.time_increment = String(params.timeIncrement);
  }

  const result = await metaFetch<MetaApiResponse<MetaInsight>>(`/${objectId}/insights`, {
    params: queryParams,
    accountId,
  });
  return result.data || [];
}
