"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Box, Clapperboard, Folder, Image as ImageIcon, Layers3, Settings } from "lucide-react";
import { cn } from "cn";
import { AutemLogo } from "@/components/brand/autem-logo";
import { Card, CardContent } from "@/components/ui/card";
import { prefetchRouteData } from "@/lib/api";

const NAV_ITEMS = [
  { href: "/projects", label: "Proyectos", icon: Folder },
  { href: "/image-to-3d", label: "Imagen a 3D", icon: Box },
  { href: "/render", label: "Render", icon: ImageIcon },
  { href: "/scene", label: "Escena 3D", icon: Layers3 },
  { href: "/video", label: "Video", icon: Clapperboard },
];

const ALL_ROUTES = ["/projects", "/image-to-3d", "/render", "/scene", "/video", "/settings"];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // Pre-compile and prefetch all routes in the background right after mount so tab switching is 0ms
  useEffect(() => {
    const timers = ALL_ROUTES.map((route, idx) =>
      window.setTimeout(() => {
        router.prefetch(route);
      }, 120 + idx * 140)
    );
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [router]);

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-5">
      <Link href="/image-to-3d" className="mb-7 flex items-center gap-3 px-2 group">
        <AutemLogo size={40} className="transition-transform group-hover:scale-[1.03]" />
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            Autem Render
          </p>
          <p className="truncate text-xs text-muted-foreground">AI Architecture Studio</p>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (pathname === "/" && item.href === "/image-to-3d") ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              onMouseEnter={() => prefetchRouteData(item.href)}
              className={cn(
                "group relative flex items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
              )}
            >
              {active && (
                <span
                  aria-hidden="true"
                  className="btn-primary absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full"
                />
              )}
              <span className="flex items-center gap-3">
                <Icon
                  className={cn(
                    "size-[18px]",
                    active
                      ? "text-primary"
                      : "text-muted-foreground group-hover:text-foreground"
                  )}
                />
                <span>{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2.5 pt-4">
        <Link
          href="/settings"
          prefetch={true}
          onMouseEnter={() => prefetchRouteData("/settings")}
          className={cn(
            "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
            pathname.startsWith("/settings")
              ? "bg-sidebar-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
          )}
        >
          {pathname.startsWith("/settings") && (
            <span
              aria-hidden="true"
              className="btn-primary absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r-full"
            />
          )}
          <Settings
            className={cn(
              "size-[18px]",
              pathname.startsWith("/settings")
                ? "text-primary"
                : "text-muted-foreground group-hover:text-foreground"
            )}
          />
          <span>Configuración</span>
        </Link>

        <Card size="sm" className="bg-card/80">
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground">Estudio Local + Cloud</p>
              <span className="size-2 rounded-full bg-[#22C55E]" />
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              3D · Render · Orbit · Video
            </p>
          </CardContent>
        </Card>
      </div>
    </aside>
  );
}
