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
