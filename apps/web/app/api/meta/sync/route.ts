import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { metaAdAccounts, clients } from "@/lib/db/schema";
import { auth } from "@/lib/auth";
import { eq } from "drizzle-orm";
import { fullSync } from "@/lib/meta/sync";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const accountId = body.accountId;

  const [account] = await db.select().from(metaAdAccounts)
    .where(eq(metaAdAccounts.id, accountId)).limit(1);
  if (!account) return NextResponse.json({ error: "Ad account not found" }, { status: 404 });

  const result = await fullSync(
    account.id,
    account.accountId,
    account.pageId,
    account.clientId,
  );

  return NextResponse.json(result);
}
