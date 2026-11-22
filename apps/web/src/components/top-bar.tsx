"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronRight, Home, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { cn } from "cn";
import {
  API_URL,
  fetchCostSummary,
  resetApiOfflineCircuit,
  type CostSummary,
} from "@/lib/api";

const ROUTE_TITLES: Record<string, string> = {
  "/projects": "Proyectos",
  "/render": "Render",
  "/scene": "Escena 3D",
  "/video": "Video",
  "/image-to-3d": "Imagen a 3D",
  "/settings": "Configuración",
};

export function TopBar() {
  const pathname = usePathname();
  const [apiState, setApiState] = useState<"checking" | "online" | "offline">("checking");
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const currentTitle = ROUTE_TITLES[pathname] ?? "Imagen a 3D";
  const isProjectsRoot = pathname === "/projects";

  function checkApiHealth() {
    resetApiOfflineCircuit();
    setApiState("checking");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 650);

    fetch(`${API_URL}/api/v1/health`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => {
        const ok = res.ok;
        setApiState(ok ? "online" : "offline");
        if (ok) {
          fetchCostSummary()
            .then((summary) => setCostSummary(summary))
            .catch(() => {});
        }
      })
      .catch(() => {
        setApiState("offline");
      })
      .finally(() => {
        clearTimeout(timer);
      });
  }

  useEffect(() => {
    checkApiHealth();
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border bg-background/95 px-8 backdrop-blur-md">
      {/* Subtle top-edge laser activity line while checking */}
      {apiState === "checking" && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px] overflow-hidden bg-border/40"
        >
          <div className="btn-primary h-full w-1/3 animate-pulse rounded-full" />
        </div>
      )}

      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link
          href="/projects"
          className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
          title="Ir a Proyectos"
        >
          <Home className="size-4" />
        </Link>
        <ChevronRight className="size-3.5 text-muted-foreground/60" />
        {isProjectsRoot ? (
          <span className="font-medium text-foreground">Proyectos</span>
        ) : (
          <>
            <Link
              href="/projects"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Proyectos
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground/60" />
            <span className="font-medium text-foreground">{currentTitle}</span>
          </>
        )}
      </nav>

      {/* Top-right daily spend chip + engine status pill */}
      <div className="flex items-center gap-2.5">
        {apiState === "online" && costSummary && (
          <Link
            href="/settings"
            title="Ver presupuesto y contabilidad de gastos"
            className="hidden h-8 items-center gap-2 rounded-full border border-border bg-card px-3 font-mono text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground sm:inline-flex"
          >
            {costSummary.free_only_mode ? (
              <>
                <ShieldCheck className="size-3.5 text-[#22C55E]" />
                <span className="text-[#22C55E]">Solo Gratis</span>
                <span>· $0.00</span>
              </>
            ) : (
              <>
                <Wallet className="size-3.5 text-primary" />
                <span>
                  Hoy{" "}
                  <strong className="font-semibold text-foreground">
                    ${costSummary.spent_today_usd.toFixed(2)}
                  </strong>{" "}
                  / ${costSummary.daily_limit_usd.toFixed(2)}
                </span>
              </>
            )}
          </Link>
        )}

        <div className="inline-flex h-8 items-center gap-2.5 rounded-full border border-border bg-card px-3 text-xs shadow-2xs">
          {/* Mini isometric architectural cube icon in top bar */}
          <svg
            viewBox="0 0 20 20"
            fill="none"
            className={cn(
              "size-4 shrink-0",
              apiState === "checking" && "animate-spin"
            )}
          >
            <polygon
              points="10,2.5 17,6.5 10,10.5 3,6.5"
              fill={apiState === "online" ? "#F97316" : "#8A8A8F"}
              fillOpacity="0.3"
              stroke={apiState === "online" ? "#FF9F0A" : "#8A8A8F"}
              strokeWidth="1.3"
            />
            <path
              d="M3 6.5V13.5L10 17.5L17 13.5V6.5M10 10.5V17.5"
              stroke={apiState === "online" ? "#F97316" : "#8A8A8F"}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>

          <Link
            href="/settings"
            className="flex items-center gap-2 font-mono text-xs text-foreground transition-colors hover:text-primary"
          >
            <span
              className={cn(
                "size-2 rounded-full",
                apiState === "online"
                  ? "bg-[#22C55E] shadow-[0_0_8px_#22C55E]"
                  : apiState === "offline"
                    ? "bg-[#F59E0B]"
                    : "animate-pulse bg-primary"
              )}
            />
            <span>
              {apiState === "online"
                ? "Motor Conectado"
                : apiState === "offline"
                  ? "Sin API · Configurar"
                  : "Sincronizando..."}
            </span>
          </Link>

          <button
            type="button"
            onClick={checkApiHealth}
            className="ml-0.5 rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Verificar conexión ahora"
          >
            <RefreshCw
              className={cn("size-3", apiState === "checking" && "animate-spin text-primary")}
            />
          </button>
        </div>
      </div>
    </header>
  );
}
