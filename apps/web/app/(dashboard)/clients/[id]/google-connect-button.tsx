"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function GoogleConnectButton({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/google/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleConnect}
      disabled={loading}
    >
      {loading ? "Bağlanıyor..." : "Google Ads Bağla"}
    </Button>
  );
}
