# Campaign Intelligence Design Spec

## Overview

AI-powered campaign assistant and decision engine for RTNADS health tourism ad platform. Claude chat interface with tool-use capabilities — queries knowledge layer, creates/modifies campaigns, generates ad copy, analyzes performance. Human-in-the-loop: all destructive/mutating actions require explicit user confirmation before execution.

**Approach:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) with streaming chat, server-side tool execution for read operations, client-side tool confirmation for write operations. Dedicated `/intelligence` page with persistent conversation history.

**Data Management:** Conversations and messages stored in PostgreSQL via Drizzle ORM. AI SDK's `UIMessage` format with parts-based storage for text, tool calls, and tool results.

**Spec:** This document is the authority. The implementation plan argues from it.

---

## 1. Data Model

### 1.1 `chats` table

Conversation sessions per user.

```typescript
export const chats = pgTable("chats", {
  id: varchar("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  title: text("title"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("chats_user_id_idx").on(table.userId),
]);
```

Title is auto-generated from the first user message (first 80 chars). Updated on each new message (`updatedAt`).

### 1.2 `messages` table

Individual messages in a conversation.

```typescript
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey(),
  chatId: varchar("chat_id").references(() => chats.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role").$type<"user" | "assistant">().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("messages_chat_id_idx").on(table.chatId),
  index("messages_chat_id_created_at_idx").on(table.chatId, table.createdAt),
]);
```

### 1.3 `messageParts` table

Polymorphic parts storage — text, tool invocations, sources. Follows AI SDK persistence pattern.

```typescript
export const messageParts = pgTable("message_parts", {
  id: varchar("id").primaryKey(),
  messageId: varchar("message_id").references(() => messages.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type").notNull(),
  order: integer("order").notNull().default(0),
  // Text parts
  textContent: text("text_content"),
  // Tool invocation parts
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
```

### 1.4 Relations

```typescript
export const chatsRelations = relations(chats, ({ many }) => ({
  messages: many(messages),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
  parts: many(messageParts),
}));

export const messagePartsRelations = relations(messageParts, ({ one }) => ({
  message: one(messages, { fields: [messageParts.messageId], references: [messages.id] }),
}));
```

---

## 2. AI Tools

### 2.1 Knowledge Tools (server-side execute, no confirmation)

These tools have `execute` functions and run automatically when Claude calls them.

**`getCountries`**
- Input: `{ ek53?: boolean, eu?: boolean, continent?: string, language?: string }`
- Output: `Country[]`
- Source: `lib/knowledge/countries.ts`

**`getTreatmentCategories`**
- Input: `{ tree?: boolean }`
- Output: `TreatmentCategory[]` or `CategoryTreeNode[]`
- Source: `lib/knowledge/treatments.ts`

**`getLeadFormTemplates`**
- Input: `{ category: string, locale: string }`
- Output: `LeadFormTemplate[]`
- Source: `lib/knowledge/lead-templates.ts`

**`getDisclaimer`**
- Input: `{ locale: string }`
- Output: `{ text: string } | null`
- Source: `lib/knowledge/disclaimers.ts`

**`checkPolicies`**
- Input: `{ adCopy?: string, headline?: string, targetCountries: string[], adFormat?: string, hasWhatsAppField?: boolean, hasDisclaimer?: boolean, clientType: string }`
- Output: `PolicyCheckResult[]`
- Source: `lib/meta/policy-checker.ts`

**`getCampaignList`**
- Input: `{ clientId?: string, status?: string }`
- Output: `Campaign[]` (filtered by user's org)
- Source: DB query on `campaigns` table

**`getCampaignDetails`**
- Input: `{ campaignId: string }`
- Output: `Campaign` with adsets, ads, insights
- Source: DB query with joins

### 2.2 Action Tools (client-side confirmation required)

These tools have NO `execute` function. They are caught by `onToolCall` on the client, a confirmation UI is shown, and the user must approve before execution.

**`createCampaign`**
- Input: `{ clientId: string, name: string, treatmentCategory: string, targetCountries: string[], dailyBudget: number, budgetCurrency?: string, objective?: string, adFormat?: string }`
- Confirmation shows: campaign name, target countries, budget, category
- On approve: POST `/api/meta/campaigns`
- On reject: returns `{ status: "cancelled", reason: "User cancelled" }`

**`updateCampaign`**
- Input: `{ campaignId: string, updates: { dailyBudget?: number, targetCountries?: string[], status?: string } }`
- Confirmation shows: what's changing (diff)
- On approve: PATCH `/api/meta/campaigns/[id]`

**`generateAdCopy`**
- Input: `{ campaignId: string, treatmentCategory: string, targetCountry: string, locale: string, tone?: string }`
- No execute function — Claude generates the ad copy in its text response, then calls this tool to save it to the campaign
- Confirmation shows: generated headline, description, body text — user reviews before saving
- On approve: PATCH campaign with ad copy fields

**`publishCampaign`**
- Input: `{ campaignId: string }`
- Confirmation shows: campaign summary, policy check results, final warning
- On approve: POST `/api/meta/campaigns/[id]/publish`

---

## 3. System Prompt

### 3.1 Static Instructions

```
Sen RTNADS sağlık turizmi reklam platformunun Campaign Intelligence asistanısın.

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
- Kampanya oluştururken önce policy check yap, blocker varsa kullanıcıyı bilgilendir
```

### 3.2 Dynamic Context (per-conversation)

Injected at conversation start, refreshed on each API call:

```typescript
function buildDynamicContext(orgId: string): string {
  // Lightweight — only counts and names, not full data
  return `
## Mevcut Durum
- Organizasyon: ${org.name}
- Müşteriler: ${clients.map(c => `${c.name} (${c.type})`).join(", ")}
- Aktif kampanya sayısı: ${activeCampaignCount}
- Toplam bütçe: ${totalBudget}
  `;
}
```

Heavy data (country lists, templates, campaign details) is fetched via tools on demand.

---

## 4. File Structure

```
apps/web/lib/ai/
  tools/
    knowledge.ts          — Knowledge query tools (getCountries, getTreatments, etc.)
    campaigns.ts          — Campaign query tools (getCampaignList, getCampaignDetails)
    actions.ts            — Action tool definitions (no execute — client-confirmed)
    index.ts              — Merges all tools into single ToolSet
  system-prompt.ts        — buildSystemPrompt(orgId) → static + dynamic context
  message-utils.ts        — DB ↔ UIMessage mapping helpers
  index.ts                — Barrel export

apps/web/lib/db/schema/
  intelligence.ts         — chats, messages, messageParts tables + relations

apps/web/app/api/intelligence/
  chat/route.ts           — POST: streamText with tools, persistence middleware
  conversations/route.ts  — GET: list user's conversations
  conversations/[id]/
    route.ts              — GET: load chat messages, DELETE: delete conversation

apps/web/app/(dashboard)/intelligence/
  page.tsx                — Main intelligence page
  layout.tsx              — Two-column layout (sidebar + chat)
  components/
    chat-input.tsx        — Message input (textarea + send button)
    message-list.tsx      — Scrollable message list with streaming support
    message-bubble.tsx    — Single message render (text, markdown, tool parts)
    tool-confirmation.tsx — Action approval card UI (approve/reject buttons)
    tool-result-card.tsx  — Collapsible tool result display
    conversation-sidebar.tsx — Conversation history list
    suggestion-cards.tsx  — Empty state quick-start prompts
```

---

## 5. Chat API Flow

### 5.1 POST `/api/intelligence/chat`

```typescript
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return unauthorized();

  const { chatId, messages }: { chatId: string; messages: UIMessage[] } = await req.json();

  // 1. Ensure chat exists (create if new)
  await ensureChat(chatId, session.user.id);

  // 2. Save user message to DB
  const lastUserMessage = messages.findLast(m => m.role === "user");
  if (lastUserMessage) await upsertMessage(chatId, lastUserMessage);

  // 3. Update chat title from first message
  await updateChatTitleIfNeeded(chatId, messages);

  // 4. Build system prompt with dynamic context
  const systemPrompt = await buildSystemPrompt(session.user.orgId);

  // 5. Stream response
  const result = streamText({
    model: anthropic("claude-sonnet-4-20250514"),
    system: systemPrompt,
    messages: await convertToModelMessages(messages),
    tools: allTools,
    stopWhen: isStepCount(5),
    onFinish: async ({ response }) => {
      // 6. Save assistant message(s) to DB
      await saveAssistantMessages(chatId, response.messages);
    },
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
```

### 5.2 Client-Side Tool Confirmation

```typescript
const { messages, sendMessage, addToolOutput } = useChat({
  api: "/api/intelligence/chat",
  id: chatId,
  sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
  onToolCall: async ({ toolCall }) => {
    // Action tools: show confirmation UI (don't resolve immediately)
    if (isActionTool(toolCall.toolName)) {
      setPendingToolCall(toolCall); // triggers confirmation card render
      return; // resolved later via addToolOutput
    }
  },
});

// When user approves:
async function handleApprove() {
  const result = await executeAction(pendingToolCall);
  addToolOutput({
    tool: pendingToolCall.toolName,
    toolCallId: pendingToolCall.toolCallId,
    output: result,
  });
}

// When user rejects:
function handleReject() {
  addToolOutput({
    tool: pendingToolCall.toolName,
    toolCallId: pendingToolCall.toolCallId,
    output: { status: "cancelled", reason: "Kullanıcı iptal etti" },
  });
}
```

---

## 6. UI Components

### 6.1 Layout

Two-column responsive layout:
- **Left sidebar (280px):** "Yeni Sohbet" button + conversation list (title + relative date), most recent first. Active conversation highlighted. Delete on hover.
- **Right panel (flex-1):** Chat area with header (title), scrollable message list, fixed-bottom input.
- **Mobile:** Sidebar collapses to hamburger menu.

### 6.2 Message Rendering

Messages render based on their `parts` array:

| Part Type | Render |
|-----------|--------|
| `text` | Markdown via react-markdown, user right-aligned, assistant left-aligned |
| `tool-invocation` (knowledge tool, output-available) | Collapsible card: tool name as label, result hidden by default |
| `tool-invocation` (action tool, input-available) | Confirmation card with approve/reject buttons |
| `tool-invocation` (action tool, output-available) | Success badge with summary |
| `tool-invocation` (output-error) | Error badge with message |

### 6.3 Empty State

When a new conversation starts, show 4 suggestion cards:

| Card | Prompt |
|------|--------|
| "Yeni kampanya oluştur" | "Yeni bir kampanya oluşturmak istiyorum" |
| "Kampanya analizi" | "Aktif kampanyalarımın performansını analiz et" |
| "Bütçe önerisi" | "Bu ay için bütçe dağılımı öner" |
| "Ad copy yaz" | "Almanya hedefli rhinoplasty için ad copy yaz" |

Cards are clickable — sends the prompt automatically.

---

## 7. Policy Checker Update

### 7.1 New Rule: TURKEY_TARGETING

Add to `checkCampaignPolicies` in `lib/meta/policy-checker.ts`:

```typescript
if (draft.targetCountries.some(c => c === "Turkey" || c === "TR")) {
  results.push({
    level: "blocker",
    code: "TURKEY_TARGETING",
    message: "Türkiye hedef ülkelerde olamaz. Türkiye'ye reklam gösterilmesi teşvik hakkını ortadan kaldırır.",
    field: "targetCountries",
  });
}
```

### 7.2 Seed Update

Add to `platformRules` seed:

```typescript
{
  code: "TURKEY_TARGETING",
  level: "blocker",
  messageTemplate: "Türkiye hedef ülkelerde olamaz. Türkiye'ye reklam gösterilmesi teşvik hakkını ortadan kaldırır.",
  field: "targetCountries",
  isActive: true,
}
```

---

## 8. Dependencies

### New packages (apps/web):
```
ai                    — Vercel AI SDK core (streamText, useChat, tools, UIMessage)
@ai-sdk/anthropic     — Anthropic provider for AI SDK
zod                   — Tool input schema validation
react-markdown        — Markdown rendering in chat messages
```

### Environment Variables:
```
ANTHROPIC_API_KEY     — Required. Claude API key for AI SDK.
```

No other new environment variables. Existing `DATABASE_URL` serves the new tables.

---

## 9. Integration Points

### Knowledge Layer (existing)
- All knowledge query tools call existing `lib/knowledge/` functions directly
- No new API routes needed — tools use the query layer, not HTTP

### Meta Ads API (existing)
- `createCampaign` action tool calls existing `POST /api/meta/campaigns` logic
- `publishCampaign` calls existing publish route logic
- `getCampaignDetails` queries existing `campaigns` table with joins

### Policy Checker (existing)
- `checkPolicies` tool calls existing `checkCampaignPolicies()` function
- New `TURKEY_TARGETING` rule added to the same function

### Dashboard Sidebar (existing)
- New "Intelligence" nav item added to dashboard sidebar
- Links to `/intelligence`

---

## 10. Out of Scope (v1)

- Google Ads integration (separate plan — last in roadmap)
- Image/creative upload in chat
- Voice messages / speech-to-text
- Multi-user real-time collaboration in same conversation
- Token usage tracking / rate limiting per user
- Claude model selection (fixed to Claude Sonnet)
- Conversation search / filtering
- Autonomous campaign optimization (no human-less actions)
- A/B testing suggestions
- Webhook-triggered AI responses (e.g., auto-respond to lead form submissions)
- Admin UI for managing system prompt
