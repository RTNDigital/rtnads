import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCountries, getEk53Countries, getEUCountries, getByContinent } from "@/lib/knowledge";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ek53 = searchParams.get("ek53");
  const eu = searchParams.get("eu");
  const continent = searchParams.get("continent");

  if (ek53 === "true") {
    return NextResponse.json(await getEk53Countries());
  }
  if (eu === "true") {
    return NextResponse.json(await getEUCountries());
  }
  if (continent) {
    return NextResponse.json(await getByContinent(continent));
  }

  return NextResponse.json(await getCountries());
}
