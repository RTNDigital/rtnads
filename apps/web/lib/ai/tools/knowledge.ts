import { tool } from "ai";
import { z } from "zod";
import {
  getCountries,
  getEk53Countries,
  getEUCountries,
  getByContinent,
  getByLanguage,
  getCategories,
  getCategoryTree,
  getTemplatesForCategory,
  getDisclaimer,
} from "@/lib/knowledge";
import { checkCampaignPolicies } from "@/lib/meta/policy-checker";
import type { ClientType } from "@rtnads/shared";

export const knowledgeTools = {
  getCountries: tool({
    description: "Get list of target countries for health tourism campaigns. Can filter by EK-53 incentive list, EU membership, continent, or language.",
    inputSchema: z.object({
      ek53: z.boolean().optional().describe("Filter for EK-53 incentive countries only"),
      eu: z.boolean().optional().describe("Filter for EU countries only"),
      continent: z.string().optional().describe("Filter by continent: europe, asia, africa, americas, oceania, middle_east"),
      language: z.string().optional().describe("Filter by language code: de, en, ar, fr, etc."),
    }),
    execute: async ({ ek53, eu, continent, language }) => {
      if (ek53) return await getEk53Countries();
      if (eu) return await getEUCountries();
      if (continent) return await getByContinent(continent);
      if (language) return await getByLanguage(language);
      return await getCountries();
    },
  }),

  getTreatmentCategories: tool({
    description: "Get treatment categories for health tourism (rhinoplasty, dental, hair-transplant, etc.). Use tree=true to get hierarchical structure with parent-child relationships.",
    inputSchema: z.object({
      tree: z.boolean().optional().describe("Return as hierarchical tree with children nested under parents"),
    }),
    execute: async ({ tree }) => {
      if (tree) return await getCategoryTree();
      return await getCategories();
    },
  }),

  getLeadFormTemplates: tool({
    description: "Get pre-defined lead form question templates for a specific treatment category and locale. Returns questions with types, options, and WhatsApp field.",
    inputSchema: z.object({
      category: z.string().describe("Treatment category slug, e.g. 'rhinoplasty', 'dental-implants'"),
      locale: z.string().describe("Language code for the questions, e.g. 'de', 'en', 'ar'"),
    }),
    execute: async ({ category, locale }) => {
      return await getTemplatesForCategory(category, locale);
    },
  }),

  getDisclaimer: tool({
    description: "Get the mandatory İhracatçılar Birliği disclaimer text for a specific language. Required for agency-type clients.",
    inputSchema: z.object({
      locale: z.string().describe("Language code: de, en, fr, nl, ar, pl, ru, es, ro, no, kk, az, uz"),
    }),
    execute: async ({ locale }) => {
      const text = await getDisclaimer(locale);
      if (!text) return { found: false, locale };
      return { found: true, locale, text };
    },
  }),

  checkPolicies: tool({
    description: "Run policy checks on a campaign draft. Returns blockers (must fix), warnings, and info messages. Always run this before creating or publishing a campaign.",
    inputSchema: z.object({
      adCopy: z.string().optional().describe("Ad copy text"),
      headline: z.string().optional().describe("Ad headline"),
      description: z.string().optional().describe("Ad description"),
      targetCountries: z.array(z.string()).describe("Array of target country names"),
      adFormat: z.string().optional().describe("Ad format: lead_form, landing_page, whatsapp, ig_dm, funnel"),
      hasWhatsAppField: z.boolean().optional().describe("Whether the lead form has a WhatsApp field"),
      hasDisclaimer: z.boolean().optional().describe("Whether the ad copy includes the mandatory disclaimer"),
      clientType: z.enum(["clinic", "doctor", "agency"]).describe("Client type"),
    }),
    execute: async (input) => {
      return await checkCampaignPolicies(
        {
          adCopy: input.adCopy,
          headline: input.headline,
          description: input.description,
          targetCountries: input.targetCountries,
          adFormat: input.adFormat,
          hasWhatsAppField: input.hasWhatsAppField,
          hasDisclaimer: input.hasDisclaimer,
        },
        input.clientType as ClientType,
      );
    },
  }),
};
