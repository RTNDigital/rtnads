import Link from "next/link";
import { db } from "@/lib/db";
import { clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  ready: "bg-green-100 text-green-800",
};

export default async function ClientsPage() {
  const session = await auth();
  const orgId = (session?.user as any)?.orgId;

  const allClients = await db
    .select()
    .from(clients)
    .where(eq(clients.orgId, orgId));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clients</h1>
        <Button render={<Link href="/clients/new">Add Client</Link>} />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Categories</TableHead>
            <TableHead>Budget</TableHead>
            <TableHead>Onboarding</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {allClients.map((client) => (
            <TableRow key={client.id}>
              <TableCell>
                <Link href={`/clients/${client.id}`} className="font-medium hover:underline">
                  {client.name}
                </Link>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="capitalize">{client.type}</Badge>
              </TableCell>
              <TableCell>
                {(client.treatmentCategories as string[] || []).join(", ") || "—"}
              </TableCell>
              <TableCell>
                {client.monthlyBudget
                  ? `${client.budgetCurrency} ${client.monthlyBudget.toLocaleString()}`
                  : "—"}
              </TableCell>
              <TableCell>
                <Badge className={statusColors[client.onboardingStatus] || ""}>
                  {client.onboardingStatus.replace("_", " ")}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
          {allClients.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No clients yet. Add your first client to get started.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
