import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTemplatesForCategory, getAllTemplates } from "@/lib/knowledge";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const locale = searchParams.get("locale") || "en";

  if (category) {
    return NextResponse.json(await getTemplatesForCategory(category, locale));
  }

  return NextResponse.json(await getAllTemplates());
}
