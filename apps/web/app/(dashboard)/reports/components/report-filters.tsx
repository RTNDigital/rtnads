"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

interface ClientOption {
  id: string;
  name: string;
}

interface ReportFiltersProps {
  clients: ClientOption[];
  selectedClientId: string;
  selectedPeriod: string;
}

const periods = [
  { value: "7", label: "Son 7 Gün" },
  { value: "30", label: "Son 30 Gün" },
  { value: "month", label: "Bu Ay" },
];

export function ReportFilters({
  clients,
  selectedClientId,
  selectedPeriod,
}: ReportFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set(key, value);
    router.push(`/reports?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 print:hidden">
      <Select
        value={selectedClientId}
        onValueChange={(v) => v && updateParam("clientId", v)}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Müşteri seçin" />
        </SelectTrigger>
        <SelectContent>
          {clients.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedPeriod}
        onValueChange={(v) => v && updateParam("period", v)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {periods.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="outline"
        size="sm"
        onClick={() => window.print()}
        className="ml-auto"
      >
        <Printer className="mr-2 h-4 w-4" />
        Yazdır / PDF
      </Button>
    </div>
  );
}
