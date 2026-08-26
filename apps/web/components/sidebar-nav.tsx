"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@rtnads/shared";

const navItems = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "Clients", href: "/clients", icon: "Users" },
  { label: "Campaigns", href: "/campaigns", icon: "Megaphone" },
  { label: "Creatives", href: "/creatives", icon: "Image" },
  { label: "Leads", href: "/leads", icon: "Contact" },
  { label: "Intelligence", href: "/intelligence", icon: "Brain" },
  { label: "Knowledge", href: "/knowledge", icon: "BookOpen" },
  { label: "Settings", href: "/settings", icon: "Settings" },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {APP_NAME}
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
