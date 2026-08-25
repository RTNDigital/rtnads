import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const { name, email, password } = await request.json();

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return NextResponse.json({ error: "Email already exists" }, { status: 400 });
  }

  let [org] = await db.select().from(organizations).limit(1);
  if (!org) {
    [org] = await db.insert(organizations).values({
      name: "RTN House",
      slug: "rtn-house",
    }).returning();
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const isFirstUser = (await db.select().from(users).limit(1)).length === 0;

  const [user] = await db.insert(users).values({
    orgId: org.id,
    name,
    email,
    passwordHash,
    role: isFirstUser ? "admin" : "junior",
  }).returning();

  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}
