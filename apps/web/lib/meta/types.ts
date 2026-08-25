export interface MetaError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id: string;
}

export interface MetaApiResponse<T> {
  data?: T[];
  paging?: {
    cursors: { before: string; after: string };
    next?: string;
  };
  error?: MetaError;
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective: string;
  status: string;
  effective_status: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
  updated_time: string;
  start_time?: string;
  stop_time?: string;
}

export interface MetaAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  effective_status: string;
  targeting: Record<string, unknown>;
  optimization_goal: string;
  bid_strategy: string;
  daily_budget?: string;
  lifetime_budget?: string;
  created_time: string;
  updated_time: string;
}

export interface MetaAd {
  id: string;
  name: string;
  adset_id: string;
  status: string;
  effective_status: string;
  creative: { id: string };
  created_time: string;
  updated_time: string;
}

export interface MetaCreative {
  id: string;
  name: string;
  title?: string;
  body?: string;
  image_url?: string;
  video_id?: string;
  thumbnail_url?: string;
  object_type: string;
  created_time: string;
}

export interface MetaLeadForm {
  id: string;
  name: string;
  status: string;
  locale: string;
  questions: { key: string; label: string; type: string }[];
  created_time: string;
}

export interface MetaLead {
  id: string;
  created_time: string;
  field_data: { name: string; values: string[] }[];
}

export interface MetaInsight {
  date_start: string;
  date_stop: string;
  spend: string;
  impressions: string;
  clicks: string;
  cpc: string;
  cpm: string;
  ctr: string;
  conversions?: string;
  cost_per_result?: string;
  reach: string;
  frequency: string;
  actions?: { action_type: string; value: string }[];
}

export interface CreateCampaignInput {
  name: string;
  objective: string;
  status?: "PAUSED" | "ACTIVE";
  daily_budget?: number;
  lifetime_budget?: number;
  special_ad_categories?: string[];
  start_time?: string;
  stop_time?: string;
}

export interface UpdateCampaignInput {
  name?: string;
  status?: "ACTIVE" | "PAUSED" | "ARCHIVED";
  daily_budget?: number;
  lifetime_budget?: number;
  stop_time?: string;
}

export interface CreateAdSetInput {
  name: string;
  campaign_id: string;
  optimization_goal: string;
  billing_event: string;
  bid_strategy?: string;
  daily_budget?: number;
  lifetime_budget?: number;
  targeting: Record<string, unknown>;
  status?: "PAUSED" | "ACTIVE";
  start_time?: string;
  end_time?: string;
}

export interface UpdateAdSetInput {
  name?: string;
  status?: "ACTIVE" | "PAUSED" | "ARCHIVED";
  daily_budget?: number;
  targeting?: Record<string, unknown>;
}

export interface CreateAdInput {
  name: string;
  adset_id: string;
  creative: { creative_id: string };
  status?: "PAUSED" | "ACTIVE";
}

export interface UpdateAdInput {
  name?: string;
  status?: "ACTIVE" | "PAUSED" | "ARCHIVED";
  creative?: { creative_id: string };
}

export interface CreateLeadFormInput {
  name: string;
  locale: string;
  questions: { type: string; key: string; label: string; options?: { value: string; key: string }[] }[];
  privacy_policy: { url: string; link_text: string };
  follow_up_action_url?: string;
}

export interface CreateCreativeInput {
  name: string;
  object_story_spec: {
    page_id: string;
    link_data?: {
      message: string;
      link: string;
      name: string;
      description?: string;
      image_hash?: string;
      call_to_action: { type: string; value?: { link: string } };
    };
    video_data?: {
      video_id: string;
      message: string;
      title: string;
      call_to_action: { type: string; value?: { link: string } };
    };
  };
}

export interface CampaignFilters {
  effective_status?: string[];
  updated_since?: string;
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    public code: number,
    public subcode?: number,
    public fbtraceId?: string,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}
