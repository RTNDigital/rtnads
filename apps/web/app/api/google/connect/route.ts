import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAuthUrl } from "@/lib/google/auth";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { clientId } = body;

  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  const state = JSON.stringify({
    clientId,
    orgId: (session.user as any).orgId,
  });

  const url = getAuthUrl(Buffer.from(state).toString("base64"));

  return NextResponse.json({ url });
}
