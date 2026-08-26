"use client";

import Markdown from "react-markdown";
import { isToolUIPart, getToolName } from "ai";
import { cn } from "@/lib/utils";
import { ToolConfirmation } from "./tool-confirmation";
import { ToolResultCard } from "./tool-result-card";
import { isActionTool } from "@/lib/ai/tools/actions";
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
          if (part.type === "text" && part.text) {
            return (
              <div key={i} className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown>{part.text}</Markdown>
              </div>
            );
          }

          if (isToolUIPart(part)) {
            const toolName = getToolName(part);
            const isAction = isActionTool(toolName);

            if (isAction && part.state === "input-available") {
              return (
                <ToolConfirmation
                  key={i}
                  toolName={toolName}
                  input={part.input as Record<string, unknown>}
                  onApprove={() => onToolApprove?.(part.toolCallId)}
                  onReject={() => onToolReject?.(part.toolCallId)}
                  isExecuting={Boolean(isToolExecuting) && pendingToolCallId === part.toolCallId}
                />
              );
            }

            return (
              <ToolResultCard
                key={i}
                toolName={toolName}
                state={part.state}
                result={"output" in part ? part.output : undefined}
                errorText={"errorText" in part ? part.errorText : undefined}
              />
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
