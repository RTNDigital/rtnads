"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Check = {
  id: string;
  checkKey: string;
  status: string;
  notes: string | null;
};

type CheckDefinition = {
  key: string;
  label: string;
  category: string;
};

export function OnboardingChecklist({
  clientId,
  checks,
  checkDefinitions,
}: {
  clientId: string;
  checks: Check[];
  checkDefinitions: readonly CheckDefinition[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  const categories = [...new Set(checkDefinitions.map((d) => d.category))];

  async function toggleCheck(checkKey: string, currentStatus: string) {
    setLoading(checkKey);
    const newStatus = currentStatus === "pass" ? "pending" : "pass";

    await fetch(`/api/clients/${clientId}/onboarding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checkKey, status: newStatus }),
    });

    router.refresh();
    setLoading(null);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding Checklist</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {categories.map((category) => (
          <div key={category}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">
              {category}
            </h3>
            <div className="flex flex-col gap-2">
              {checkDefinitions
                .filter((d) => d.category === category)
                .map((def) => {
                  const check = checks.find((c) => c.checkKey === def.key);
                  const isPassed = check?.status === "pass";

                  return (
                    <div
                      key={def.key}
                      className="flex items-center gap-3 rounded-md border p-3"
                    >
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleCheck(def.key, check?.status || "pending")}
                        disabled={loading === def.key}
                        className="h-6 w-6 p-0 shrink-0"
                      >
                        {isPassed ? "✓" : "○"}
                      </Button>
                      <span
                        className={
                          isPassed ? "text-muted-foreground line-through" : ""
                        }
                      >
                        {def.label}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
