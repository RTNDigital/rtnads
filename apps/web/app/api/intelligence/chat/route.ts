import { NextResponse } from "next/server";
import {
  streamText,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  isStepCount,
  generateId,
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

  try {
    await ensureChat(chatId, userId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      generateMessageId: generateId,
      onEnd: async ({ responseMessage }) => {
        if (responseMessage.parts.length > 0) {
          await upsertMessage(chatId, responseMessage);
        }
      },
    }),
  });
}
