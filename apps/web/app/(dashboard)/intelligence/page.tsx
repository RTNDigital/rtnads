"use client";

import { useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  generateId,
  lastAssistantMessageIsCompleteWithToolCalls,
  isToolUIPart,
  getToolName,
} from "ai";
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
    id: chatId,
    transport: new DefaultChatTransport({
      api: "/api/intelligence/chat",
      body: { chatId },
    }),
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
        (p) => isToolUIPart(p) && p.toolCallId === toolCallId,
      );
      if (!part || !isToolUIPart(part)) return;

      const toolName = getToolName(part);
      const endpoint = ACTION_ENDPOINTS[toolName];
      if (!endpoint) return;

      const input = (part.input ?? {}) as any;

      setIsToolExecuting(true);

      try {
        const body =
          toolName === "generateAdCopy"
            ? { adCopy: input.adCopy, headline: input.headline, description: input.description }
            : toolName === "updateCampaign"
              ? input.updates
              : input;

        const res = await fetch(endpoint.url(input), {
          method: endpoint.method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        addToolOutput({
          tool: toolName,
          toolCallId,
          output: res.ok ? data : { error: data.error ?? "İşlem başarısız" },
        });
      } catch {
        addToolOutput({
          tool: toolName,
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
