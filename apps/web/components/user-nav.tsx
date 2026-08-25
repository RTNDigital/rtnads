import { auth, signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export async function UserNav() {
  const session = await auth();
  if (!session?.user) return null;

  const role = (session.user as any).role;

  return (
    <div className="flex items-center gap-3">
      <Badge variant="outline" className="capitalize">{role}</Badge>
      <span className="text-sm text-muted-foreground">{session.user.email}</span>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <Button variant="ghost" size="sm" type="submit">
          Sign Out
        </Button>
      </form>
    </div>
  );
}
