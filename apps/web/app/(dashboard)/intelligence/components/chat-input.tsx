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
