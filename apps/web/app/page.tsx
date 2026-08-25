import { APP_NAME } from "@rtnads/shared";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">{APP_NAME}</h1>
      <p className="text-muted-foreground">Reklam Karar-Zekâsı Platformu</p>
      <Button>Get Started</Button>
    </main>
  );
}
