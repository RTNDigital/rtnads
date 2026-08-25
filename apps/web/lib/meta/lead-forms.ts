import { metaFetch } from "./client";
import type { MetaLeadForm, MetaLead, MetaApiResponse, CreateLeadFormInput } from "./types";

export async function createLeadForm(pageId: string, data: CreateLeadFormInput): Promise<string> {
  const result = await metaFetch<{ id: string }>(`/${pageId}/leadgen_forms`, {
    body: data as unknown as Record<string, unknown>,
  });
  return result.id;
}

export async function getLeadForm(formId: string): Promise<MetaLeadForm> {
  return metaFetch<MetaLeadForm>(`/${formId}`, {
    params: { fields: "id,name,status,locale,questions,created_time" },
  });
}

export async function listLeadForms(pageId: string): Promise<MetaLeadForm[]> {
  const result = await metaFetch<MetaApiResponse<MetaLeadForm>>(`/${pageId}/leadgen_forms`, {
    params: { fields: "id,name,status,locale,questions,created_time", limit: "100" },
  });
  return result.data || [];
}

export async function getLeadFormData(formId: string, since?: Date): Promise<MetaLead[]> {
  const params: Record<string, string> = { fields: "id,created_time,field_data", limit: "100" };
  if (since) {
    params.filtering = JSON.stringify([{
      field: "time_created",
      operator: "GREATER_THAN",
      value: Math.floor(since.getTime() / 1000),
    }]);
  }
  const result = await metaFetch<MetaApiResponse<MetaLead>>(`/${formId}/leads`, { params });
  return result.data || [];
}
