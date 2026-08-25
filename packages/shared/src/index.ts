export const APP_NAME = "RTNADS";

export type UserRole = "admin" | "manager" | "junior";
export type ClientType = "clinic" | "doctor" | "agency";
export type OnboardingStatus = "pending" | "in_progress" | "ready";
export type CampaignType = "standard" | "event";
export type ApprovalStatus = "draft" | "pending_approval" | "approved" | "live" | "paused" | "rejected";
export type AdFormat = "lead_form" | "landing_page" | "whatsapp" | "ig_dm" | "funnel";
export type LeadStatus = "new" | "contacted" | "qualified" | "converted" | "lost";
export type LeadSource = "meta_webhook" | "meta_poll" | "manual";
export type SyncType = "campaigns" | "insights" | "leads" | "full";
export type SyncStatus = "running" | "completed" | "failed";
