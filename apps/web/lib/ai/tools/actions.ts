import { tool } from "ai";
import { z } from "zod";

export const ACTION_TOOL_NAMES = [
  "createCampaign",
  "updateCampaign",
  "generateAdCopy",
  "publishCampaign",
] as const;

export function isActionTool(toolName: string): boolean {
  return (ACTION_TOOL_NAMES as readonly string[]).includes(toolName);
}

export const actionTools = {
  createCampaign: tool({
    description: "Create a new campaign. Requires user confirmation before execution. Always run checkPolicies first to verify there are no blockers.",
    inputSchema: z.object({
      clientId: z.string().describe("Client UUID"),
      name: z.string().describe("Campaign name"),
      treatmentCategory: z.string().describe("Treatment category slug"),
      targetCountries: z.array(z.string()).describe("Target country names — NEVER include Turkey/TR"),
      dailyBudget: z.number().describe("Daily budget amount"),
      budgetCurrency: z.string().optional().default("USD").describe("Budget currency code"),
      objective: z.string().optional().describe("Campaign objective"),
      adFormat: z.string().optional().describe("Ad format: lead_form, landing_page, whatsapp"),
    }),
  }),

  updateCampaign: tool({
    description: "Update an existing campaign. Requires user confirmation before execution.",
    inputSchema: z.object({
      campaignId: z.string().describe("Campaign UUID to update"),
      updates: z.object({
        name: z.string().optional(),
        dailyBudget: z.number().optional(),
        targetCountries: z.array(z.string()).optional(),
        status: z.string().optional(),
        treatmentCategory: z.string().optional(),
      }).describe("Fields to update"),
    }),
  }),

  generateAdCopy: tool({
    description: "Save generated ad copy to a campaign. Write the ad copy in your text response first, then use this tool to save it. The user will confirm before it's saved. Ad copy must be in the target country's language, NEVER in Turkish.",
    inputSchema: z.object({
      campaignId: z.string().describe("Campaign UUID"),
      headline: z.string().describe("Ad headline text"),
      description: z.string().describe("Ad description text"),
      adCopy: z.string().describe("Full ad copy body text"),
    }),
  }),

  publishCampaign: tool({
    description: "Publish a campaign to Meta Ads. This sends it live. Requires user confirmation. Always run checkPolicies first.",
    inputSchema: z.object({
      campaignId: z.string().describe("Campaign UUID to publish"),
    }),
  }),
};
