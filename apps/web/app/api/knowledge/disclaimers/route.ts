import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getDisclaimer, getAllDisclaimers } from "@/lib/knowledge";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale");

  if (locale) {
    const text = await getDisclaimer(locale);
    if (!text) {
      return NextResponse.json({ error: "Disclaimer not found for locale" }, { status: 404 });
    }
    return NextResponse.json({ locale, text });
  }

  return NextResponse.json(await getAllDisclaimers());
}
