import type { ClientType } from "@rtnads/shared";
import { getEk53Countries, getEUCountries } from "@/lib/knowledge";

export interface PolicyCheckResult {
  level: "blocker" | "warning" | "info";
  code: string;
  message: string;
  field?: string;
}

export interface CampaignDraft {
  adCopy?: string;
  headline?: string;
  description?: string;
  targetCountries: string[];
  adFormat?: string;
  leadFormQuestions?: { text: string }[];
  hasWhatsAppField?: boolean;
  hasDisclaimer?: boolean;
}

const TURKISH_CHARS = /[çğıöşüÇĞİÖŞÜ]/;
const TURKISH_WORDS = /\b(ve|bir|ile|için|olan|bu|da|de|den|dan|ne|nasıl|kadar|gibi|daha|çok|iyi|tedavi|sağlık|turizm|estetik|ameliyat)\b/i;

export async function checkCampaignPolicies(
  draft: CampaignDraft,
  clientType: ClientType,
): Promise<PolicyCheckResult[]> {
  const results: PolicyCheckResult[] = [];
  const allText = [draft.adCopy, draft.headline, draft.description]
    .filter(Boolean)
    .join(" ");
  const questionTexts = (draft.leadFormQuestions || []).map((q) => q.text).join(" ");
  const combinedText = `${allText} ${questionTexts}`;

  if (TURKISH_CHARS.test(combinedText) || TURKISH_WORDS.test(combinedText)) {
    results.push({
      level: "blocker",
      code: "TURKISH_TEXT",
      message: "Turkish text detected. Health tourism ads cannot contain Turkish content — incentive eligibility requires target-language or English copy.",
      field: "adCopy",
    });
  }

  const ek53Countries = await getEk53Countries();
  const ek53Names = ek53Countries.map((c) => c.name);
  const ek53Count = draft.targetCountries.filter((c) => ek53Names.includes(c)).length;
  const nonEk53Count = draft.targetCountries.length - ek53Count;
  if (draft.targetCountries.length > 0) {
    const rate = nonEk53Count === 0 ? 70 : ek53Count > 0 ? "50-70" : 50;
    results.push({
      level: "info",
      code: "EK53_INCENTIVE",
      message: `Incentive rate: ${rate}%. ${ek53Count} of ${draft.targetCountries.length} target countries are in the EK-53 list.`,
    });
  }

  if (clientType === "agency" && !draft.hasDisclaimer) {
    results.push({
      level: "blocker",
      code: "MANDATORY_DISCLAIMER",
      message: "Agency clients must include the mandatory disclaimer text from İhracatçılar Birliği in ad copy.",
      field: "adCopy",
    });
  }

  if (draft.adFormat === "lead_form" && !draft.hasWhatsAppField) {
    results.push({
      level: "blocker",
      code: "WHATSAPP_REQUIRED",
      message: "WhatsApp field is mandatory in all lead forms.",
      field: "leadForm",
    });
  }

  const euCountries = await getEUCountries();
  const euNames = euCountries.map((c) => c.name);
  const targetsEurope = draft.targetCountries.some((c) => euNames.includes(c));
  if (targetsEurope && draft.adFormat === "whatsapp") {
    results.push({
      level: "warning",
      code: "EUROPE_WHATSAPP",
      message: "WhatsApp conversation optimization is not available in European countries. Consider using a different ad format for EU targets.",
    });
  }

  if (targetsEurope) {
    results.push({
      level: "warning",
      code: "GDPR_NOTICE",
      message: "Targeting EU countries — ensure GDPR compliance in data collection and privacy policy.",
    });
  }

  return results;
}
