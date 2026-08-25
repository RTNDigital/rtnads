import { auth } from "./auth";
import { redirect } from "next/navigation";
import type { UserRole } from "@rtnads/shared";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const session = await requireAuth();
  const role = (session.user as any).role as UserRole;
  if (!allowedRoles.includes(role)) redirect("/");
  return session;
}
