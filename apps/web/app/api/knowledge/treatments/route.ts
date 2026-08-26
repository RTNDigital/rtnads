import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCategories, getCategoryTree } from "@/lib/knowledge";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tree = searchParams.get("tree");

  if (tree === "true") {
    return NextResponse.json(await getCategoryTree());
  }

  return NextResponse.json(await getCategories());
}
