import { metaFetch } from "./client";
import type { MetaAd, MetaApiResponse, CreateAdInput, UpdateAdInput } from "./types";

const AD_FIELDS = "id,name,adset_id,status,effective_status,creative{id},created_time,updated_time";

export async function createAd(accountId: string, data: CreateAdInput): Promise<string> {
  const result = await metaFetch<{ id: string }>(`/act_${accountId}/ads`, {
    body: data as unknown as Record<string, unknown>,
    accountId,
  });
  return result.id;
}

export async function updateAd(adId: string, data: UpdateAdInput, accountId?: string): Promise<void> {
  await metaFetch<{ success: boolean }>(`/${adId}`, {
    body: data as Record<string, unknown>,
    method: "POST",
    accountId,
  });
}

export async function getAd(adId: string, accountId?: string): Promise<MetaAd> {
  return metaFetch<MetaAd>(`/${adId}`, {
    params: { fields: AD_FIELDS },
    accountId,
  });
}

export async function listAds(adSetId: string, accountId?: string): Promise<MetaAd[]> {
  const result = await metaFetch<MetaApiResponse<MetaAd>>(`/${adSetId}/ads`, {
    params: { fields: AD_FIELDS, limit: "100" },
    accountId,
  });
  return result.data || [];
}
