# Campaign Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-powered chat page (`/intelligence`) where users converse with Claude to create campaigns, analyze performance, and get strategic recommendations — with human-in-the-loop confirmation for all mutating actions.

**Architecture:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) with streaming chat. Server-side tool execution for read operations (knowledge queries, campaign lookups). Client-side tool confirmation for write operations (create/update/publish campaigns). Persistent conversation history in PostgreSQL via Drizzle ORM.

**Tech Stack:** Next.js 16.3.2, Vercel AI SDK v6, Anthropic Claude Sonnet, Drizzle ORM + Neon PostgreSQL, React 19, Tailwind v4, shadcn

**Spec:** `docs/superpowers/specs/2026-08-26-campaign-intelligence-design.md`

## Global Constraints

- Database driver: `@neondatabase/serverless` with `drizzle-orm/neon-http` — do NOT use `node-postgres` or `pg` Pool
- Existing DB instance: import `db` from `@/lib/db` — do NOT create a new connection
- Auth: `auth()` from `@/lib/auth` returns session with `session.user.id` (uuid) and `(session.user as any).orgId` (uuid)
- Schema exports: every new schema file must be re-exported from `lib/db/schema/index.ts`
- Knowledge layer: import query functions from `@/lib/knowledge` — do NOT query knowledge tables directly
- UI: Tailwind v4 + shadcn components, `cn()` from `@/lib/utils` for class merging
- No test framework — verification is `npx tsc --noEmit` from `apps/web/`
- IDs for chat tables: use `generateId()` from the `ai` package (string IDs), not uuid
- Policy checker is async: `checkCampaignPolicies(draft, clientType)` returns `Promise<PolicyCheckResult[]>`
- All user-facing text in the system prompt and UI labels: Turkish
- Anthropic model ID: `"claude-sonnet-4-20250514"`
- Sidebar nav: hardcoded array in `components/sidebar-nav.tsx` — add new item inline

---

### Task 1: Dependencies + Database Schema

**Files:**
- Modify: `apps/web/package.json` (add 4 new dependencies)
- Create: `apps/web/lib/db/schema/intelligence.ts`
- Modify: `apps/web/lib/db/schema/index.ts` (add re-export)

**Interfaces:**
- Consumes: `users` table from `./users` (for FK reference)
- Produces: `chats`, `intelligenceMessages`, `messageParts` tables + `chatsRelations`, `intelligenceMessagesRelations`, `messagePartsRelations` — used by Tasks 4, 5, 6, 7

- [ ] **Step 1: Install dependencies**

Run from `apps/web/`:

```bash
pnpm add ai @ai-sdk/anthropic @ai-sdk/react zod react-markdown
```

- [ ] **Step 2: Create the intelligence schema file**

Create `apps/web/lib/db/schema/intelligence.ts`:

```typescript
import { pgTable, varchar, text, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { users } from "./users";
import { generateId } from "ai";

export const chats = pgTable("chats", {
  id: varchar("id").primaryKey().$defaultFn(() => generateId()),
  userId: text("user_id").references(() => users.id).notNull(),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("chats_user_id_idx").on(table.userId),
]);

export const intelligenceMessages = pgTable("intelligence_messages", {
  id: varchar("id").primaryKey().$defaultFn(() => generateId()),
  chatId: varchar("chat_id").references(() => chats.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role").$type<"user" | "assistant">().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("intelligence_messages_chat_id_idx").on(table.chatId),
  index("intelligence_messages_chat_id_created_at_idx").on(table.chatId, table.createdAt),
]);

export const messageParts = pgTable("message_parts", {
  id: varchar("id").primaryKey().$defaultFn(() => generateId()),
  messageId: varchar("message_id").references(() => intelligenceMessages.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type").notNull(),
  order: integer("order").notNull().default(0),
  textContent: text("text_content"),
  toolCallId: varchar("tool_call_id"),
  toolName: varchar("tool_name"),
  toolArgs: jsonb("tool_args"),
  toolState: varchar("tool_state").$type<"input-available" | "output-available" | "output-error">(),
  toolResult: jsonb("tool_result"),
  toolErrorText: text("tool_error_text"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("message_parts_message_id_idx").on(table.messageId),
]);

export const chatsRelations = relations(chats, ({ many }) => ({
  messages: many(intelligenceMessages),
}));

export const intelligenceMessagesRelations = relations(intelligenceMessages, ({ one, many }) => ({
  chat: one(chats, { fields: [intelligenceMessages.chatId], references: [chats.id] }),
  parts: many(messageParts),
}));

export const messagePartsRelations = relations(messageParts, ({ one }) => ({
  message: one(intelligenceMessages, { fields: [messageParts.messageId], references: [intelligenceMessages.id] }),
}));
```

Note: The messages table is named `intelligenceMessages` (DB: `intelligence_messages`) to avoid collision with any existing `messages` export in the schema. All code references this name.

- [ ] **Step 3: Add re-export to schema index**

In `apps/web/lib/db/schema/index.ts`, add at the end:

```typescript
export * from "./intelligence";
```

- [ ] **Step 4: Push schema to database**

Run from `apps/web/`:

```bash
export $(grep -v '^#' .env.local | xargs) && npx drizzle-kit push
```

Verify: 3 new tables created (`chats`, `intelligence_messages`, `message_parts`) with indexes.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/db/schema/intelligence.ts lib/db/schema/index.ts package.json pnpm-lock.yaml
git commit -m "feat(intelligence): add chat persistence schema and AI SDK dependencies"
```

---

### Task 2: AI Tools — Knowledge Queries + Campaign Queries

**Files:**
- Create: `apps/web/lib/ai/tools/knowledge.ts`
- Create: `apps/web/lib/ai/tools/campaigns.ts`
- Create: `apps/web/lib/ai/tools/index.ts`

**Interfaces:**
- Consumes: `getCountries`, `getEk53Countries`, `getEUCountries`, `getByContinent`, `getByLanguage` from `@/lib/knowledge`; `getCategories`, `getCategoryTree` from `@/lib/knowledge`; `getTemplatesForCategory` from `@/lib/knowledge`; `getDisclaimer` from `@/lib/knowledge`; `checkCampaignPolicies` from `@/lib/meta/policy-checker`; `db` from `@/lib/db`; `campaigns`, `clients`, `adSets`, `ads` from `@/lib/db/schema`
- Produces: `knowledgeTools` object (ToolSet), `campaignQueryTools` object (ToolSet), `allTools` merged ToolSet — used by Tasks 3, 4

- [ ] **Step 1: Create knowledge tools**

Create `apps/web/lib/ai/tools/knowledge.ts`:

```typescript
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
```

- [ ] **Step 2: Create campaign query tools**

Create `apps/web/lib/ai/tools/campaigns.ts`:

```typescript
import { tool } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { campaigns, clients, adSets, ads } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export function createCampaignQueryTools(orgId: string) {
  return {
    getCampaignList: tool({
      description: "Get list of campaigns for the current organization. Can filter by client or status.",
      inputSchema: z.object({
        clientId: z.string().optional().describe("Filter by client ID"),
        status: z.string().optional().describe("Filter by status: draft, active, paused, completed"),
      }),
      execute: async ({ clientId, status }) => {
        const orgClients = await db.select({ id: clients.id }).from(clients).where(eq(clients.orgId, orgId));
        const orgClientIds = orgClients.map((c) => c.id);

        let allCampaigns = await db.select().from(campaigns);
        allCampaigns = allCampaigns.filter((c) => orgClientIds.includes(c.clientId));

        if (clientId) {
          allCampaigns = allCampaigns.filter((c) => c.clientId === clientId);
        }
        if (status) {
          allCampaigns = allCampaigns.filter((c) => c.status === status);
        }

        return allCampaigns.map((c) => ({
          id: c.id,
          name: c.name,
          clientId: c.clientId,
          status: c.status,
          treatmentCategory: c.treatmentCategory,
          targetCountries: c.targetCountries,
          dailyBudget: c.dailyBudget,
          budgetCurrency: c.budgetCurrency,
          approvalStatus: c.approvalStatus,
          createdAt: c.createdAt,
        }));
      },
    }),

    getCampaignDetails: tool({
      description: "Get detailed information about a specific campaign including its ad sets and ads.",
      inputSchema: z.object({
        campaignId: z.string().describe("The campaign UUID"),
      }),
      execute: async ({ campaignId }) => {
        const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
        if (!campaign) return { error: "Campaign not found" };

        const orgClients = await db.select({ id: clients.id }).from(clients).where(eq(clients.orgId, orgId));
        if (!orgClients.some((c) => c.id === campaign.clientId)) {
          return { error: "Campaign not found" };
        }

        const campaignAdSets = await db.select().from(adSets).where(eq(adSets.campaignId, campaignId));
        const adSetIds = campaignAdSets.map((a) => a.id);

        let campaignAds: (typeof ads.$inferSelect)[] = [];
        for (const adSetId of adSetIds) {
          const setAds = await db.select().from(ads).where(eq(ads.adSetId, adSetId));
          campaignAds.push(...setAds);
        }

        return {
          ...campaign,
          adSets: campaignAdSets,
          ads: campaignAds,
        };
      },
    }),
  };
}
```

Note: `createCampaignQueryTools` is a factory that takes `orgId` — this ensures org-scoped queries. Called at request time in the chat API route.

- [ ] **Step 3: Create tools index**

Create `apps/web/lib/ai/tools/index.ts`:

```typescript
export { knowledgeTools } from "./knowledge";
export { createCampaignQueryTools } from "./campaigns";
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/ai/tools/
git commit -m "feat(intelligence): add knowledge and campaign query tools for AI SDK"
```

---

### Task 3: Action Tools + System Prompt

**Files:**
- Create: `apps/web/lib/ai/tools/actions.ts`
- Modify: `apps/web/lib/ai/tools/index.ts` (add export)
- Create: `apps/web/lib/ai/system-prompt.ts`
- Create: `apps/web/lib/ai/index.ts`

**Interfaces:**
- Consumes: `db` from `@/lib/db`; `clients`, `campaigns` from `@/lib/db/schema`; `organizations` from `@/lib/db/schema`
- Produces: `actionTools` object (ToolSet with no execute), `ACTION_TOOL_NAMES` string array, `isActionTool(name: string): boolean`, `buildSystemPrompt(orgId: string): Promise<string>` — used by Tasks 4, 6

- [ ] **Step 1: Create action tools (no execute functions)**

Create `apps/web/lib/ai/tools/actions.ts`:

```typescript
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
```

- [ ] **Step 2: Update tools index to export actions**

Replace `apps/web/lib/ai/tools/index.ts` with:

```typescript
export { knowledgeTools } from "./knowledge";
export { createCampaignQueryTools } from "./campaigns";
export { actionTools, ACTION_TOOL_NAMES, isActionTool } from "./actions";
```

- [ ] **Step 3: Create system prompt builder**

Create `apps/web/lib/ai/system-prompt.ts`:

```typescript
import { db } from "@/lib/db";
import { clients, campaigns, organizations } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

const STATIC_PROMPT = `Sen RTNADS sağlık turizmi reklam platformunun Campaign Intelligence asistanısın.

## Görevin
- Kampanya oluşturma, optimizasyon ve strateji konusunda yardım et
- Hedef ülke, tedavi kategorisi, bütçe, ad copy önerilerinde bulun
- Mevcut kampanyaları analiz et, performans değerlendirmesi yap

## Zorunlu Kurallar
- Türkiye (TR) ASLA hedef ülke olarak seçilemez — Türkiye'ye reklam gösterilmesi teşvik hakkını ortadan kaldırır
- EK-53 teşvik oranı %70, diğer ülkeler %50
- Reklam metni ASLA Türkçe olamaz — hedef ülke dili veya İngilizce kullan
- Ajans müşterilerinde İhracatçılar Birliği disclaimer zorunlu
- Lead formlarda WhatsApp alanı zorunlu ("Whats.App" yazımı kullan — Meta validation bypass)
- AB ülkeleri GDPR uyumluluğu gerektirir
- WhatsApp optimizasyonu AB ülkelerinde çalışmaz

## Davranış Kuralları
- Aksiyon tool'larını kullanmadan önce ne yapacağını açıkla
- Bütçe önerilerinde müşterinin mevcut bütçe limitini aşma (%20 tolerans var)
- Ad copy'yi hedef ülkenin dilinde yaz
- Kullanıcıyla her zaman Türkçe konuş
- Kampanya oluştururken önce checkPolicies tool'unu çalıştır, blocker varsa kullanıcıyı bilgilendir
- createCampaign kullanırken targetCountries'de "Turkey" veya "TR" ASLA olmamalı`;

export async function buildSystemPrompt(orgId: string): Promise<string> {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);

  const orgClients = await db.select().from(clients).where(eq(clients.orgId, orgId));

  const clientIds = orgClients.map((c) => c.id);
  let activeCampaignCount = 0;
  let totalBudget = 0;

  for (const clientId of clientIds) {
    const clientCampaigns = await db.select().from(campaigns).where(
      and(eq(campaigns.clientId, clientId))
    );
    const active = clientCampaigns.filter((c) => c.status === "active" || c.approvalStatus === "live");
    activeCampaignCount += active.length;
    totalBudget += clientCampaigns.reduce((sum, c) => sum + (c.dailyBudget ?? 0), 0);
  }

  const dynamicContext = `

## Mevcut Durum
- Organizasyon: ${org?.name ?? "Bilinmiyor"}
- Müşteriler: ${orgClients.map((c) => `${c.name} (${c.type})`).join(", ") || "Henüz müşteri yok"}
- Aktif kampanya sayısı: ${activeCampaignCount}
- Toplam günlük bütçe: $${totalBudget}`;

  return STATIC_PROMPT + dynamicContext;
}
```

- [ ] **Step 4: Create barrel export**

Create `apps/web/lib/ai/index.ts`:

```typescript
export { knowledgeTools, createCampaignQueryTools, actionTools, ACTION_TOOL_NAMES, isActionTool } from "./tools";
export { buildSystemPrompt } from "./system-prompt";
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add lib/ai/
git commit -m "feat(intelligence): add action tools and system prompt builder"
```

---

### Task 4: Message Utilities + Chat API Route

**Files:**
- Create: `apps/web/lib/ai/message-utils.ts`
- Create: `apps/web/app/api/intelligence/chat/route.ts`

**Interfaces:**
- Consumes: `chats`, `intelligenceMessages`, `messageParts` from `@/lib/db/schema`; `db` from `@/lib/db`; `auth` from `@/lib/auth`; `knowledgeTools`, `createCampaignQueryTools`, `actionTools`, `buildSystemPrompt` from `@/lib/ai`; `generateId`, `UIMessage`, `streamText`, `convertToModelMessages`, `createUIMessageStreamResponse`, `toUIMessageStream`, `isStepCount` from `ai`; `anthropic` from `@ai-sdk/anthropic`
- Produces: `ensureChat(chatId, userId)`, `upsertMessage(chatId, message)`, `saveAssistantMessages(chatId, responseMessages)`, `loadChatMessages(chatId)` — used by Task 5; POST `/api/intelligence/chat` — used by Task 6

- [ ] **Step 1: Create message utility functions**

Create `apps/web/lib/ai/message-utils.ts`:

```typescript
import { db } from "@/lib/db";
import { chats, intelligenceMessages, messageParts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "ai";
import type { UIMessage } from "ai";

export async function ensureChat(chatId: string, userId: string): Promise<void> {
  const [existing] = await db.select({ id: chats.id }).from(chats).where(eq(chats.id, chatId)).limit(1);
  if (!existing) {
    await db.insert(chats).values({ id: chatId, userId });
  }
}

export async function updateChatTitle(chatId: string, title: string): Promise<void> {
  await db.update(chats).set({ title, updatedAt: new Date() }).where(eq(chats.id, chatId));
}

export async function upsertMessage(chatId: string, message: UIMessage): Promise<void> {
  const messageId = message.id || generateId();

  await db.insert(intelligenceMessages).values({
    id: messageId,
    chatId,
    role: message.role as "user" | "assistant",
  }).onConflictDoUpdate({
    target: intelligenceMessages.id,
    set: { chatId },
  });

  await db.delete(messageParts).where(eq(messageParts.messageId, messageId));

  const parts = (message.parts || []).map((part, index) => {
    const base = {
      id: generateId(),
      messageId,
      order: index,
      type: part.type,
      textContent: null as string | null,
      toolCallId: null as string | null,
      toolName: null as string | null,
      toolArgs: null as unknown,
      toolState: null as string | null,
      toolResult: null as unknown,
      toolErrorText: null as string | null,
    };

    if (part.type === "text") {
      return { ...base, textContent: part.text };
    }

    if (part.type === "tool-invocation") {
      return {
        ...base,
        toolCallId: part.toolInvocation.toolCallId,
        toolName: part.toolInvocation.toolName,
        toolArgs: part.toolInvocation.args,
        toolState: part.toolInvocation.state,
        toolResult: "result" in part.toolInvocation ? part.toolInvocation.result : null,
        toolErrorText: "errorText" in part.toolInvocation ? (part.toolInvocation as any).errorText : null,
      };
    }

    return base;
  });

  if (parts.length > 0) {
    for (const part of parts) {
      await db.insert(messageParts).values(part);
    }
  }
}

interface DBPart {
  type: string;
  textContent: string | null;
  toolCallId: string | null;
  toolName: string | null;
  toolArgs: unknown;
  toolState: string | null;
  toolResult: unknown;
  toolErrorText: string | null;
  order: number;
}

function mapDBPartToUIPart(part: DBPart): UIMessage["parts"][number] {
  if (part.type === "text" && part.textContent) {
    return { type: "text", text: part.textContent };
  }

  if (part.type === "tool-invocation" && part.toolCallId && part.toolName) {
    const toolInvocation: any = {
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      args: part.toolArgs ?? {},
      state: part.toolState ?? "input-available",
    };

    if (part.toolState === "output-available" && part.toolResult !== null) {
      toolInvocation.result = part.toolResult;
    }

    if (part.toolState === "output-error") {
      toolInvocation.errorText = part.toolErrorText ?? "Unknown error";
    }

    return { type: "tool-invocation", toolInvocation };
  }

  return { type: "text", text: "" };
}

export async function loadChatMessages(chatId: string): Promise<UIMessage[]> {
  const msgs = await db
    .select()
    .from(intelligenceMessages)
    .where(eq(intelligenceMessages.chatId, chatId))
    .orderBy(intelligenceMessages.createdAt);

  const result: UIMessage[] = [];

  for (const msg of msgs) {
    const dbParts = await db
      .select()
      .from(messageParts)
      .where(eq(messageParts.messageId, msg.id))
      .orderBy(messageParts.order);

    result.push({
      id: msg.id,
      role: msg.role,
      parts: dbParts.map(mapDBPartToUIPart),
    });
  }

  return result;
}
```

- [ ] **Step 2: Create chat API route**

Create `apps/web/app/api/intelligence/chat/route.ts`:

```typescript
import { NextResponse } from "next/server";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  isStepCount,
  type UIMessage,
} from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { auth } from "@/lib/auth";
import { knowledgeTools, createCampaignQueryTools, actionTools, buildSystemPrompt } from "@/lib/ai";
import { ensureChat, upsertMessage, updateChatTitle } from "@/lib/ai/message-utils";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatId, messages }: { chatId: string; messages: UIMessage[] } = await req.json();
  const userId = session.user.id!;
  const orgId = (session.user as any).orgId as string;

  await ensureChat(chatId, userId);

  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMessage) {
    await upsertMessage(chatId, lastUserMessage);
  }

  const firstUserMessage = messages.find((m) => m.role === "user");
  if (firstUserMessage && messages.filter((m) => m.role === "user").length === 1) {
    const firstText = firstUserMessage.parts?.find((p) => p.type === "text");
    if (firstText && "text" in firstText) {
      const title = firstText.text.slice(0, 80);
      await updateChatTitle(chatId, title);
    }
  }

  const systemPrompt = await buildSystemPrompt(orgId);
  const campaignQueryTools = createCampaignQueryTools(orgId);

  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: {
      ...knowledgeTools,
      ...campaignQueryTools,
      ...actionTools,
    },
    stopWhen: isStepCount(5),
    onFinish: async ({ response }) => {
      for (const msg of response.messages) {
        if (msg.role === "assistant") {
          const uiMsg: UIMessage = {
            id: msg.id ?? `assistant-${Date.now()}`,
            role: "assistant",
            parts: [],
          };

          for (const content of msg.content) {
            if (content.type === "text") {
              uiMsg.parts.push({ type: "text", text: content.text });
            }
            if (content.type === "tool-call") {
              uiMsg.parts.push({
                type: "tool-invocation",
                toolInvocation: {
                  toolCallId: content.toolCallId,
                  toolName: content.toolName,
                  args: content.args,
                  state: "input-available",
                },
              });
            }
          }

          if (uiMsg.parts.length > 0) {
            await upsertMessage(chatId, uiMsg);
          }
        }
      }
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If AI SDK types differ from expected shapes, adjust the type casts in `message-utils.ts` and `chat/route.ts` accordingly.

- [ ] **Step 4: Commit**

```bash
git add lib/ai/message-utils.ts app/api/intelligence/chat/route.ts
git commit -m "feat(intelligence): add chat API with streaming, tools, and message persistence"
```

---

### Task 5: Conversations API + Policy Checker Update

**Files:**
- Create: `apps/web/app/api/intelligence/conversations/route.ts`
- Create: `apps/web/app/api/intelligence/conversations/[id]/route.ts`
- Modify: `apps/web/lib/meta/policy-checker.ts` (add TURKEY_TARGETING rule)
- Modify: `apps/web/lib/db/seed.ts` (add TURKEY_TARGETING to platformRules seed)

**Interfaces:**
- Consumes: `chats`, `intelligenceMessages` from `@/lib/db/schema`; `auth` from `@/lib/auth`; `db` from `@/lib/db`; `loadChatMessages` from `@/lib/ai/message-utils`
- Produces: GET `/api/intelligence/conversations` (returns `{ id, title, updatedAt }[]`), GET/DELETE `/api/intelligence/conversations/[id]`

- [ ] **Step 1: Create conversations list endpoint**

Create `apps/web/app/api/intelligence/conversations/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { auth } from "@/lib/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id!;
  const conversations = await db
    .select({
      id: chats.id,
      title: chats.title,
      createdAt: chats.createdAt,
      updatedAt: chats.updatedAt,
    })
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.updatedAt));

  return NextResponse.json(conversations);
}
```

- [ ] **Step 2: Create single conversation endpoint (load + delete)**

Create `apps/web/app/api/intelligence/conversations/[id]/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { loadChatMessages } from "@/lib/ai/message-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id!;

  const [chat] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.userId, userId)))
    .limit(1);

  if (!chat) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = await loadChatMessages(id);

  return NextResponse.json({ chat, messages });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const userId = session.user.id!;

  const [chat] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, id), eq(chats.userId, userId)))
    .limit(1);

  if (!chat) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.delete(chats).where(eq(chats.id, id));

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 3: Add TURKEY_TARGETING rule to policy checker**

In `apps/web/lib/meta/policy-checker.ts`, add this block right after the existing Turkish text check (after the `if (TURKISH_CHARS.test ...)` block, around line 43):

```typescript
  if (draft.targetCountries.some((c) => c === "Turkey" || c === "TR")) {
    results.push({
      level: "blocker",
      code: "TURKEY_TARGETING",
      message: "Türkiye hedef ülkelerde olamaz. Türkiye'ye reklam gösterilmesi teşvik hakkını ortadan kaldırır.",
      field: "targetCountries",
    });
  }
```

- [ ] **Step 4: Add TURKEY_TARGETING to seed data**

In `apps/web/lib/db/seed.ts`, find the `platformRulesSeed` array (or wherever platform rules are seeded) and add:

```typescript
  {
    platform: "meta" as const,
    ruleType: "TURKEY_TARGETING",
    countryScope: ["TR"],
    ruleContent: {
      level: "blocker",
      message: "Türkiye hedef ülkelerde olamaz. Türkiye'ye reklam gösterilmesi teşvik hakkını ortadan kaldırır.",
      field: "targetCountries",
    },
    active: true,
  },
```

- [ ] **Step 5: Run seed to add the new rule**

```bash
export $(grep -v '^#' .env.local | xargs) && npx tsx lib/db/seed.ts
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/api/intelligence/ lib/meta/policy-checker.ts lib/db/seed.ts
git commit -m "feat(intelligence): add conversations API and TURKEY_TARGETING policy rule"
```

---

### Task 6: Chat UI Components

**Files:**
- Create: `apps/web/app/(dashboard)/intelligence/components/chat-input.tsx`
- Create: `apps/web/app/(dashboard)/intelligence/components/message-list.tsx`
- Create: `apps/web/app/(dashboard)/intelligence/components/message-bubble.tsx`
- Create: `apps/web/app/(dashboard)/intelligence/components/tool-confirmation.tsx`
- Create: `apps/web/app/(dashboard)/intelligence/components/tool-result-card.tsx`
- Create: `apps/web/app/(dashboard)/intelligence/components/suggestion-cards.tsx`
- Create: `apps/web/app/(dashboard)/intelligence/components/conversation-sidebar.tsx`

**Interfaces:**
- Consumes: `UIMessage` from `ai`; `isActionTool` from `@/lib/ai`; `cn` from `@/lib/utils`
- Produces: `<ChatInput>`, `<MessageList>`, `<MessageBubble>`, `<ToolConfirmation>`, `<ToolResultCard>`, `<SuggestionCards>`, `<ConversationSidebar>` — used by Task 7

- [ ] **Step 1: Create ChatInput component**

Create `apps/web/app/(dashboard)/intelligence/components/chat-input.tsx`:

```tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isLoading, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  };

  return (
    <div className="border-t bg-card p-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Mesajınızı yazın..."
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-lg border bg-background px-4 py-3 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-primary/20",
            "placeholder:text-muted-foreground",
          )}
          disabled={isLoading}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || isLoading}
          className={cn(
            "shrink-0 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground",
            "hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
            "transition-colors",
          )}
        >
          {isLoading ? "..." : "Gönder"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ToolConfirmation component**

Create `apps/web/app/(dashboard)/intelligence/components/tool-confirmation.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

interface ToolConfirmationProps {
  toolName: string;
  args: Record<string, unknown>;
  onApprove: () => void;
  onReject: () => void;
  isExecuting: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  createCampaign: "Kampanya Oluştur",
  updateCampaign: "Kampanya Güncelle",
  generateAdCopy: "Ad Copy Kaydet",
  publishCampaign: "Kampanya Yayınla",
};

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  return String(value);
}

export function ToolConfirmation({ toolName, args, onApprove, onReject, isExecuting }: ToolConfirmationProps) {
  const label = TOOL_LABELS[toolName] ?? toolName;
  const displayArgs = Object.entries(args).filter(([key]) =>
    !["clientId", "campaignId"].includes(key)
  );

  return (
    <div className="my-2 max-w-md rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">🔧</span>
        <span className="font-medium text-sm">{label}</span>
      </div>
      <div className="mb-3 space-y-1">
        {displayArgs.map(([key, value]) => (
          <div key={key} className="flex gap-2 text-xs">
            <span className="shrink-0 font-medium text-muted-foreground">{key}:</span>
            <span className="text-foreground">{formatValue(value)}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onApprove}
          disabled={isExecuting}
          className={cn(
            "rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground",
            "hover:bg-primary/90 disabled:opacity-50",
          )}
        >
          {isExecuting ? "İşleniyor..." : "Onayla"}
        </button>
        <button
          onClick={onReject}
          disabled={isExecuting}
          className={cn(
            "rounded-md border px-3 py-1.5 text-xs font-medium",
            "hover:bg-muted disabled:opacity-50",
          )}
        >
          İptal
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ToolResultCard component**

Create `apps/web/app/(dashboard)/intelligence/components/tool-result-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

interface ToolResultCardProps {
  toolName: string;
  state: string;
  result?: unknown;
  errorText?: string;
}

const TOOL_LABELS: Record<string, string> = {
  getCountries: "Ülke Verileri",
  getTreatmentCategories: "Tedavi Kategorileri",
  getLeadFormTemplates: "Form Şablonları",
  getDisclaimer: "Disclaimer",
  checkPolicies: "Policy Kontrol",
  getCampaignList: "Kampanya Listesi",
  getCampaignDetails: "Kampanya Detayı",
  createCampaign: "Kampanya Oluştur",
  updateCampaign: "Kampanya Güncelle",
  generateAdCopy: "Ad Copy",
  publishCampaign: "Yayınla",
};

export function ToolResultCard({ toolName, state, result, errorText }: ToolResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const label = TOOL_LABELS[toolName] ?? toolName;

  if (state === "output-error") {
    return (
      <div className="my-1 inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs dark:border-red-800 dark:bg-red-950/30">
        <span className="text-red-600">✕</span>
        <span>{label}: {errorText ?? "Hata oluştu"}</span>
      </div>
    );
  }

  if (state === "output-available") {
    return (
      <div className="my-1">
        <button
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs hover:bg-muted transition-colors"
        >
          <span className="text-green-600">✓</span>
          <span>{label}</span>
          <span className="text-muted-foreground">{expanded ? "▲" : "▼"}</span>
        </button>
        {expanded && result && (
          <pre className="mt-1 max-h-48 overflow-auto rounded-md bg-muted p-2 text-xs">
            {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    );
  }

  return (
    <div className="my-1 inline-flex items-center gap-1.5 rounded-md border bg-muted/50 px-2 py-1 text-xs">
      <span className="animate-spin">⏳</span>
      <span>{label} çalışıyor...</span>
    </div>
  );
}
```

- [ ] **Step 4: Create MessageBubble component**

Create `apps/web/app/(dashboard)/intelligence/components/message-bubble.tsx`:

```tsx
"use client";

import Markdown from "react-markdown";
import { cn } from "@/lib/utils";
import { ToolConfirmation } from "./tool-confirmation";
import { ToolResultCard } from "./tool-result-card";
import { isActionTool } from "@/lib/ai";
import type { UIMessage } from "ai";

interface MessageBubbleProps {
  message: UIMessage;
  pendingToolCallId?: string;
  onToolApprove?: (toolCallId: string) => void;
  onToolReject?: (toolCallId: string) => void;
  isToolExecuting?: boolean;
}

export function MessageBubble({
  message,
  pendingToolCallId,
  onToolApprove,
  onToolReject,
  isToolExecuting,
}: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted",
        )}
      >
        {message.parts.map((part, i) => {
          if (part.type === "text" && "text" in part && part.text) {
            return (
              <div key={i} className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown>{part.text}</Markdown>
              </div>
            );
          }

          if (part.type === "tool-invocation" && "toolInvocation" in part) {
            const inv = part.toolInvocation;
            const isAction = isActionTool(inv.toolName);

            if (isAction && inv.state === "input-available") {
              return (
                <ToolConfirmation
                  key={i}
                  toolName={inv.toolName}
                  args={inv.args as Record<string, unknown>}
                  onApprove={() => onToolApprove?.(inv.toolCallId)}
                  onReject={() => onToolReject?.(inv.toolCallId)}
                  isExecuting={isToolExecuting && pendingToolCallId === inv.toolCallId}
                />
              );
            }

            return (
              <ToolResultCard
                key={i}
                toolName={inv.toolName}
                state={inv.state}
                result={"result" in inv ? inv.result : undefined}
                errorText={"errorText" in inv ? (inv as any).errorText : undefined}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create MessageList component**

Create `apps/web/app/(dashboard)/intelligence/components/message-list.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { MessageBubble } from "./message-bubble";
import type { UIMessage } from "ai";

interface MessageListProps {
  messages: UIMessage[];
  pendingToolCallId?: string;
  onToolApprove?: (toolCallId: string) => void;
  onToolReject?: (toolCallId: string) => void;
  isToolExecuting?: boolean;
}

export function MessageList({
  messages,
  pendingToolCallId,
  onToolApprove,
  onToolReject,
  isToolExecuting,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            pendingToolCallId={pendingToolCallId}
            onToolApprove={onToolApprove}
            onToolReject={onToolReject}
            isToolExecuting={isToolExecuting}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Create SuggestionCards component**

Create `apps/web/app/(dashboard)/intelligence/components/suggestion-cards.tsx`:

```tsx
"use client";

import { cn } from "@/lib/utils";

interface SuggestionCardsProps {
  onSelect: (prompt: string) => void;
}

const SUGGESTIONS = [
  { label: "Yeni kampanya oluştur", prompt: "Yeni bir kampanya oluşturmak istiyorum" },
  { label: "Kampanya analizi", prompt: "Aktif kampanyalarımın performansını analiz et" },
  { label: "Bütçe önerisi", prompt: "Bu ay için bütçe dağılımı öner" },
  { label: "Ad copy yaz", prompt: "Almanya hedefli rhinoplasty için ad copy yaz" },
];

export function SuggestionCards({ onSelect }: SuggestionCardsProps) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg text-center">
        <h2 className="mb-2 text-xl font-semibold">Campaign Intelligence</h2>
        <p className="mb-8 text-sm text-muted-foreground">
          Kampanya oluşturma, analiz ve strateji konusunda size yardımcı olabilirim.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => onSelect(s.prompt)}
              className={cn(
                "rounded-lg border p-4 text-left text-sm transition-colors",
                "hover:bg-muted hover:border-primary/30",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create ConversationSidebar component**

Create `apps/web/app/(dashboard)/intelligence/components/conversation-sidebar.tsx`:

```tsx
"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

interface ConversationSidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  refreshKey: number;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes}dk`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}sa`;
  const days = Math.floor(hours / 24);
  return `${days}g`;
}

export function ConversationSidebar({ activeId, onSelect, onNew, refreshKey }: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch("/api/intelligence/conversations")
      .then((r) => r.json())
      .then((data) => setConversations(data))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await fetch(`/api/intelligence/conversations/${id}`, { method: "DELETE" });
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeId === id) onNew();
  };

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r bg-card">
      <div className="border-b p-3">
        <button
          onClick={onNew}
          className={cn(
            "w-full rounded-md border px-3 py-2 text-sm font-medium",
            "hover:bg-muted transition-colors",
          )}
        >
          + Yeni Sohbet
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading && <p className="p-3 text-xs text-muted-foreground">Yükleniyor...</p>}
        {!loading && conversations.length === 0 && (
          <p className="p-3 text-xs text-muted-foreground">Henüz konuşma yok</p>
        )}
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={cn(
              "group flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors",
              activeId === conv.id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate">{conv.title || "Yeni sohbet"}</p>
              <p className="text-xs opacity-60">{timeAgo(conv.updatedAt)}</p>
            </div>
            <button
              onClick={(e) => handleDelete(e, conv.id)}
              className="ml-2 hidden shrink-0 rounded p-1 text-xs text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block"
            >
              ✕
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors. If `react-markdown` causes issues with `Markdown` default export, use `import Markdown from "react-markdown"` — the package ships ESM with a default export.

- [ ] **Step 9: Commit**

```bash
git add app/\(dashboard\)/intelligence/components/
git commit -m "feat(intelligence): add chat UI components (input, messages, tools, sidebar)"
```

---

### Task 7: Intelligence Page + Layout + Sidebar Nav

**Files:**
- Create: `apps/web/app/(dashboard)/intelligence/page.tsx`
- Create: `apps/web/app/(dashboard)/intelligence/layout.tsx`
- Modify: `apps/web/components/sidebar-nav.tsx` (add Intelligence nav item)

**Interfaces:**
- Consumes: `<ChatInput>`, `<MessageList>`, `<SuggestionCards>`, `<ConversationSidebar>` from Task 6; `useChat` from `@ai-sdk/react`; `lastAssistantMessageIsCompleteWithToolCalls`, `generateId` from `ai`; `isActionTool` from `@/lib/ai`; `loadChatMessages` from `@/lib/ai/message-utils`
- Produces: Fully functional `/intelligence` page with chat, tool confirmation, conversation history

- [ ] **Step 1: Create intelligence layout**

Create `apps/web/app/(dashboard)/intelligence/layout.tsx`:

```tsx
export default function IntelligenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="-m-6 flex h-[calc(100vh-3.5rem)]">
      {children}
    </div>
  );
}
```

The negative margin and full-height calc remove the default padding from the dashboard layout's `<main className="p-6">` wrapper, letting the chat page fill the available space.

- [ ] **Step 2: Create intelligence page**

Create `apps/web/app/(dashboard)/intelligence/page.tsx`:

```tsx
"use client";

import { useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { generateId, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { isActionTool } from "@/lib/ai";
import { ChatInput } from "./components/chat-input";
import { MessageList } from "./components/message-list";
import { SuggestionCards } from "./components/suggestion-cards";
import { ConversationSidebar } from "./components/conversation-sidebar";

const ACTION_ENDPOINTS: Record<string, { method: string; url: (args: any) => string }> = {
  createCampaign: { method: "POST", url: () => "/api/meta/campaigns" },
  updateCampaign: { method: "PATCH", url: (a: any) => `/api/meta/campaigns/${a.campaignId}` },
  generateAdCopy: { method: "PATCH", url: (a: any) => `/api/meta/campaigns/${a.campaignId}` },
  publishCampaign: { method: "POST", url: (a: any) => `/api/meta/campaigns/${a.campaignId}/publish` },
};

export default function IntelligencePage() {
  const [chatId, setChatId] = useState(() => generateId());
  const [sidebarRefreshKey, setSidebarRefreshKey] = useState(0);
  const [pendingToolCallId, setPendingToolCallId] = useState<string | null>(null);
  const [isToolExecuting, setIsToolExecuting] = useState(false);

  const { messages, sendMessage, addToolOutput, status } = useChat({
    api: "/api/intelligence/chat",
    id: chatId,
    body: { chatId },
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      if (isActionTool(toolCall.toolName)) {
        setPendingToolCallId(toolCall.toolCallId);
        return;
      }
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  const handleSend = useCallback(
    (text: string) => {
      sendMessage({ role: "user", parts: [{ type: "text", text }] });
      setSidebarRefreshKey((k) => k + 1);
    },
    [sendMessage],
  );

  const handleToolApprove = useCallback(
    async (toolCallId: string) => {
      const msg = messages.findLast((m) => m.role === "assistant");
      const part = msg?.parts.find(
        (p) => p.type === "tool-invocation" && "toolInvocation" in p && p.toolInvocation.toolCallId === toolCallId,
      );
      if (!part || part.type !== "tool-invocation") return;

      const inv = part.toolInvocation;
      const endpoint = ACTION_ENDPOINTS[inv.toolName];
      if (!endpoint) return;

      setIsToolExecuting(true);

      try {
        const body = inv.toolName === "generateAdCopy"
          ? { adCopy: (inv.args as any).adCopy, headline: (inv.args as any).headline, description: (inv.args as any).description }
          : inv.toolName === "updateCampaign"
            ? (inv.args as any).updates
            : inv.args;

        const res = await fetch(endpoint.url(inv.args), {
          method: endpoint.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        addToolOutput({
          tool: inv.toolName,
          toolCallId,
          output: res.ok ? data : { error: data.error ?? "İşlem başarısız" },
        });
      } catch (err) {
        addToolOutput({
          tool: inv.toolName,
          toolCallId,
          state: "output-error",
          errorText: "İstek başarısız oldu",
        });
      } finally {
        setIsToolExecuting(false);
        setPendingToolCallId(null);
      }
    },
    [messages, addToolOutput],
  );

  const handleToolReject = useCallback(
    (toolCallId: string) => {
      addToolOutput({
        tool: "",
        toolCallId,
        output: { status: "cancelled", reason: "Kullanıcı iptal etti" },
      });
      setPendingToolCallId(null);
    },
    [addToolOutput],
  );

  const handleNewChat = useCallback(() => {
    setChatId(generateId());
    setSidebarRefreshKey((k) => k + 1);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setChatId(id);
  }, []);

  const hasMessages = messages.length > 0;

  return (
    <>
      <ConversationSidebar
        activeId={chatId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        refreshKey={sidebarRefreshKey}
      />
      <div className="flex flex-1 flex-col">
        {hasMessages ? (
          <MessageList
            messages={messages}
            pendingToolCallId={pendingToolCallId ?? undefined}
            onToolApprove={handleToolApprove}
            onToolReject={handleToolReject}
            isToolExecuting={isToolExecuting}
          />
        ) : (
          <SuggestionCards onSelect={(prompt) => handleSend(prompt)} />
        )}
        <ChatInput onSend={handleSend} isLoading={isLoading} />
      </div>
    </>
  );
}
```

- [ ] **Step 3: Update sidebar navigation**

In `apps/web/components/sidebar-nav.tsx`, update the `navItems` array. Replace the existing `Chat` entry:

```typescript
  { label: "Chat", href: "/chat", icon: "MessageSquare" },
```

with:

```typescript
  { label: "Intelligence", href: "/intelligence", icon: "Brain" },
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Start dev server and test**

```bash
pnpm dev
```

Open `http://localhost:3000/intelligence` in a browser. Verify:
1. Sidebar shows "Intelligence" link
2. Intelligence page loads with two-column layout
3. Empty state shows 4 suggestion cards
4. Clicking a suggestion sends a message
5. Claude responds with streaming text
6. Tool calls appear as collapsible cards (knowledge tools) or confirmation cards (action tools)
7. Conversation appears in sidebar after first message
8. Creating a new chat resets the conversation

Note: Requires `ANTHROPIC_API_KEY` in `.env.local` for streaming to work. If not set, the chat API will return an auth error from the Anthropic SDK.

- [ ] **Step 6: Commit**

```bash
git add app/\(dashboard\)/intelligence/ components/sidebar-nav.tsx
git commit -m "feat(intelligence): add intelligence page with chat UI and sidebar navigation"
```
