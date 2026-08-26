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
