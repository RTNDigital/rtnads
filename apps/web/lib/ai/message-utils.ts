import { db } from "@/lib/db";
import { chats, intelligenceMessages, messageParts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateId, isToolUIPart, getToolName } from "ai";
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

  await db
    .insert(intelligenceMessages)
    .values({
      id: messageId,
      chatId,
      role: message.role as "user" | "assistant",
    })
    .onConflictDoUpdate({
      target: intelligenceMessages.id,
      set: { chatId },
    });

  await db.delete(messageParts).where(eq(messageParts.messageId, messageId));

  const parts = (message.parts || []).map((part, index) => {
    const base = {
      id: generateId(),
      messageId,
      order: index,
      type: part.type as string,
      textContent: null as string | null,
      toolCallId: null as string | null,
      toolName: null as string | null,
      toolArgs: null as unknown,
      toolState: null as "input-available" | "output-available" | "output-error" | null,
      toolResult: null as unknown,
      toolErrorText: null as string | null,
    };

    if (part.type === "text") {
      return { ...base, textContent: part.text };
    }

    // AI SDK v7 represents tool calls as either a statically-typed
    // `tool-${name}` part or a `dynamic-tool` part. `isToolUIPart` +
    // `getToolName` cover both cases uniformly.
    if (isToolUIPart(part)) {
      const state = part.state;
      return {
        ...base,
        toolCallId: part.toolCallId,
        toolName: getToolName(part),
        toolArgs: "input" in part ? (part.input ?? null) : null,
        toolState: state as "input-available" | "output-available" | "output-error",
        toolResult: state === "output-available" && "output" in part ? (part.output ?? null) : null,
        toolErrorText: state === "output-error" && "errorText" in part ? (part.errorText ?? null) : null,
      };
    }

    return base;
  });

  if (parts.length > 0) {
    await db.insert(messageParts).values(parts);
  }
}

type DBMessagePart = typeof messageParts.$inferSelect;

function mapDBPartToUIPart(part: DBMessagePart): UIMessage["parts"][number] {
  if (part.type === "text") {
    return { type: "text", text: part.textContent ?? "" } as UIMessage["parts"][number];
  }

  if (part.toolCallId && part.toolName) {
    const state = part.toolState ?? "input-available";

    const toolPart: Record<string, unknown> = {
      // `part.type` preserves the original discriminator, e.g.
      // "tool-getCampaignList" or "dynamic-tool".
      type: part.type,
      toolCallId: part.toolCallId,
      state,
      input: part.toolArgs ?? {},
    };

    if (part.type === "dynamic-tool") {
      toolPart.toolName = part.toolName;
    }

    if (state === "output-available") {
      toolPart.output = part.toolResult ?? null;
    }

    if (state === "output-error") {
      toolPart.errorText = part.toolErrorText ?? "Unknown error";
    }

    return toolPart as UIMessage["parts"][number];
  }

  return { type: "text", text: "" } as UIMessage["parts"][number];
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
