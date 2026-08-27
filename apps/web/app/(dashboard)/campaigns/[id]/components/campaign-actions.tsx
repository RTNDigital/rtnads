"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface CampaignActionsProps {
  campaignId: string;
  approvalStatus: string;
  metaStatus: string | null;
  metaCampaignId: string | null;
  hasAdAccount: boolean;
}

export function CampaignActions({
  campaignId,
  approvalStatus,
  metaStatus,
  metaCampaignId,
  hasAdAccount,
}: CampaignActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePublish = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meta/campaigns/${campaignId}/publish`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Publish failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status: "ACTIVE" | "PAUSED") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/meta/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metaStatus: status }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Status change failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  };

  const isDraft = approvalStatus === "draft";
  const isPaused = metaStatus === "PAUSED";
  const isActive = metaStatus === "ACTIVE";

  return (
    <div className="flex items-center gap-2">
      {isDraft && !hasAdAccount && (
        <p className="text-sm text-muted-foreground">Publish için önce bir reklam hesabı bağlayın.</p>
      )}
      {isDraft && hasAdAccount && (
        <Button onClick={handlePublish} disabled={loading}>
          {loading ? "Publishing..." : "Meta'ya Yayınla"}
        </Button>
      )}
      {metaCampaignId && isPaused && (
        <Button onClick={() => handleStatusChange("ACTIVE")} disabled={loading} variant="default">
          {loading ? "Activating..." : "Aktif Et"}
        </Button>
      )}
      {metaCampaignId && isActive && (
        <Button onClick={() => handleStatusChange("PAUSED")} disabled={loading} variant="outline">
          {loading ? "Pausing..." : "Duraklat"}
        </Button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
