export const ONBOARDING_CHECKS = [
  { key: "facebook_page_active", label: "Facebook page is active", category: "Meta" },
  { key: "whatsapp_business_connected", label: "WhatsApp Business connected to page", category: "Meta" },
  { key: "instagram_connected", label: "Instagram account connected", category: "Meta" },
  { key: "pixel_installed", label: "Meta Pixel installed", category: "Meta" },
  { key: "pixel_connected_to_account", label: "Ad account connected to Pixel", category: "Meta" },
  { key: "domain_verified", label: "Domain verified", category: "Meta" },
  { key: "lead_destination_set", label: "Lead destination configured (CRM/Telegram)", category: "Lead Management" },
  { key: "lead_notification_tested", label: "Lead notification flow tested", category: "Lead Management" },
  { key: "tax_info_correct", label: "Ad account tax information verified", category: "Incentive" },
  { key: "client_type_set", label: "Client type determined (clinic/doctor/agency)", category: "Incentive" },
  { key: "target_markets_set", label: "Target markets and languages defined", category: "Strategy" },
  { key: "monthly_budget_set", label: "Monthly ad budget entered", category: "Budget" },
] as const;

export type OnboardingCheckKey = typeof ONBOARDING_CHECKS[number]["key"];
