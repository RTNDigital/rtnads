"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const TREATMENT_CATEGORIES = [
  "rhinoplasty", "dental", "facelift", "eyelid_surgery",
  "bariatric", "mommy_makeover", "hair_transplant", "bbl",
];

export default function NewClientPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [budgetCurrency, setBudgetCurrency] = useState("USD");
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        type,
        treatmentCategories: selectedCategories,
        monthlyBudget: monthlyBudget ? parseInt(monthlyBudget) : null,
        budgetCurrency,
        notes: notes || null,
      }),
    });

    if (res.ok) {
      const client = await res.json();
      router.push(`/clients/${client.id}`);
    }
    setLoading(false);
  }

  function toggleCategory(cat: string) {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Add New Client</h1>
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Client Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Client Type</Label>
              <Select value={type} onValueChange={(value) => setType(value ?? "")} required>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinic">Clinic</SelectItem>
                  <SelectItem value="doctor">Doctor</SelectItem>
                  <SelectItem value="agency">Agency (Acente)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Treatment Categories</Label>
              <div className="flex flex-wrap gap-2">
                {TREATMENT_CATEGORIES.map((cat) => (
                  <Button
                    key={cat}
                    type="button"
                    variant={selectedCategories.includes(cat) ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleCategory(cat)}
                    className="capitalize"
                  >
                    {cat.replace("_", " ")}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="budget">Monthly Budget</Label>
                <Input
                  id="budget"
                  type="number"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(e.target.value)}
                  placeholder="e.g. 3000"
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label>Currency</Label>
                <Select value={budgetCurrency} onValueChange={(value) => setBudgetCurrency(value ?? "USD")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="TRY">TRY</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <Button type="submit" disabled={loading || !name || !type}>
              {loading ? "Creating..." : "Create Client"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
