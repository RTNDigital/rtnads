import { metaFetch } from "./client";
import type {
  MetaCampaign, MetaApiResponse, CreateCampaignInput,
  UpdateCampaignInput, CampaignFilters,
} from "./types";

const CAMPAIGN_FIELDS = "id,name,objective,status,effective_status,daily_budget,lifetime_budget,created_time,updated_time,start_time,stop_time";

export async function createCampaign(accountId: string, data: CreateCampaignInput): Promise<string> {
  const result = await metaFetch<{ id: string }>(`/act_${accountId}/campaigns`, {
    body: { ...data, special_ad_categories: data.special_ad_categories || [] },
    accountId,
  });
  return result.id;
}

export async function updateCampaign(campaignId: string, data: UpdateCampaignInput, accountId?: string): Promise<void> {
  await metaFetch<{ success: boolean }>(`/${campaignId}`, {
    body: data as Record<string, unknown>,
    method: "POST",
    accountId,
  });
}

export async function getCampaign(campaignId: string, accountId?: string): Promise<MetaCampaign> {
  return metaFetch<MetaCampaign>(`/${campaignId}`, {
    params: { fields: CAMPAIGN_FIELDS },
    accountId,
  });
}

export async function listCampaigns(accountId: string, filters?: CampaignFilters): Promise<MetaCampaign[]> {
  const params: Record<string, string> = { fields: CAMPAIGN_FIELDS, limit: "100" };
  if (filters?.effective_status) {
    params.effective_status = JSON.stringify(filters.effective_status);
  }
  if (filters?.updated_since) {
    params.updated_since = filters.updated_since;
  }

  const result = await metaFetch<MetaApiResponse<MetaCampaign>>(`/act_${accountId}/campaigns`, {
    params,
    accountId,
  });
  return result.data || [];
}

export async function updateCampaignStatus(campaignId: string, status: "ACTIVE" | "PAUSED", accountId?: string): Promise<void> {
  await updateCampaign(campaignId, { status }, accountId);
}
