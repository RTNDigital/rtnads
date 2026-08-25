import { metaFetch } from "./client";
import type { MetaAdSet, MetaApiResponse, CreateAdSetInput, UpdateAdSetInput } from "./types";

const ADSET_FIELDS = "id,name,campaign_id,status,effective_status,targeting,optimization_goal,bid_strategy,daily_budget,lifetime_budget,created_time,updated_time";

export async function createAdSet(accountId: string, data: CreateAdSetInput): Promise<string> {
  const result = await metaFetch<{ id: string }>(`/act_${accountId}/adsets`, {
    body: data as unknown as Record<string, unknown>,
    accountId,
  });
  return result.id;
}

export async function updateAdSet(adSetId: string, data: UpdateAdSetInput, accountId?: string): Promise<void> {
  await metaFetch<{ success: boolean }>(`/${adSetId}`, {
    body: data as Record<string, unknown>,
    method: "POST",
    accountId,
  });
}

export async function getAdSet(adSetId: string, accountId?: string): Promise<MetaAdSet> {
  return metaFetch<MetaAdSet>(`/${adSetId}`, {
    params: { fields: ADSET_FIELDS },
    accountId,
  });
}

export async function listAdSets(campaignId: string, accountId?: string): Promise<MetaAdSet[]> {
  const result = await metaFetch<MetaApiResponse<MetaAdSet>>(`/${campaignId}/adsets`, {
    params: { fields: ADSET_FIELDS, limit: "100" },
    accountId,
  });
  return result.data || [];
}
