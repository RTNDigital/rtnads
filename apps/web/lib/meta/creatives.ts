import { metaFetch } from "./client";
import type { MetaCreative, MetaApiResponse, CreateCreativeInput } from "./types";

const CREATIVE_FIELDS = "id,name,title,body,image_url,video_id,thumbnail_url,object_type,created_time";

export async function createCreative(accountId: string, data: CreateCreativeInput): Promise<string> {
  const result = await metaFetch<{ id: string }>(`/act_${accountId}/adcreatives`, {
    body: data as unknown as Record<string, unknown>,
    accountId,
  });
  return result.id;
}

export async function uploadImage(accountId: string, imageUrl: string): Promise<{ hash: string }> {
  const result = await metaFetch<{ images: Record<string, { hash: string }> }>(`/act_${accountId}/adimages`, {
    body: { url: imageUrl },
    accountId,
  });
  const firstKey = Object.keys(result.images)[0];
  return { hash: result.images[firstKey].hash };
}

export async function uploadVideo(accountId: string, videoUrl: string): Promise<{ id: string }> {
  const result = await metaFetch<{ id: string }>(`/act_${accountId}/advideos`, {
    body: { file_url: videoUrl },
    accountId,
  });
  return { id: result.id };
}

export async function getCreatives(accountId: string): Promise<MetaCreative[]> {
  const result = await metaFetch<MetaApiResponse<MetaCreative>>(`/act_${accountId}/adcreatives`, {
    params: { fields: CREATIVE_FIELDS, limit: "100" },
    accountId,
  });
  return result.data || [];
}
