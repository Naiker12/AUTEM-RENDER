"use client";

import { cn } from "cn";

interface AutemLoaderProps {
  title?: string;
  subtitle?: string;
  progress?: number | null;
  compact?: boolean;
  className?: string;
}

/**
 * Signature architectural loader for Autem Render:
 * Isometric architectural massing with animated laser scan-plane,
 * glowing structural vertices, and live monospace telemetry.
 */
export function AutemLoader({
  title = "Procesando geometría arquitectónica...",
  subtitle,
  progress = null,
  compact = false,
  className,
}: AutemLoaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center select-none",
        compact ? "gap-2.5 p-4" : "gap-4 p-8",
        className
      )}
    >
      <div
        className={cn(
          "relative flex items-center justify-center rounded-2xl border border-[#27272E] bg-[#0D0D10] shadow-[0_12px_36px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.04)]",
          compact ? "size-20" : "size-28"
        )}
      >
        {/* Subtle architectural corner ticks */}
        <span className="pointer-events-none absolute top-1.5 left-1.5 size-2 rounded-tl border-t border-l border-primary/50" />
        <span className="pointer-events-none absolute top-1.5 right-1.5 size-2 rounded-tr border-t border-r border-primary/50" />
        <span className="pointer-events-none absolute bottom-1.5 left-1.5 size-2 rounded-bl border-b border-l border-primary/50" />
        <span className="pointer-events-none absolute right-1.5 bottom-1.5 size-2 rounded-br border-r border-b border-primary/50" />

        {/* Ambient radial orange pulse */}
        <div className="pointer-events-none absolute inset-2 animate-pulse rounded-xl bg-primary/12 blur-md" />

        <svg
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={cn(compact ? "size-14" : "size-20")}
        >
          {/* Base isometric ground grid */}
          <polygon
            points="60,72 100,92 60,110 20,92"
            stroke="#2A2A30"
            strokeWidth="1.2"
            fill="#141418"
          />
          <line x1="40" y1="82" x2="80" y2="101" stroke="#232329" strokeWidth="1" />
          <line x1="80" y1="82" x2="40" y2="101" stroke="#232329" strokeWidth="1" />

          {/* Lower architectural volume wireframe */}
          <polygon
            points="60,48 90,63 60,78 30,63"
            fill="#F97316"
            fillOpacity="0.08"
            stroke="#F97316"
            strokeOpacity="0.45"
            strokeWidth="1.4"
          />
          <path
            d="M30 63V88L60 103L90 88V63M60 78V103"
            stroke="#F97316"
            strokeOpacity="0.55"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />

          {/* Upper cantilevered volume wireframe (pulsing dash) */}
          <polygon
            points="60,22 94,39 60,56 26,39"
            fill="#FF9F0A"
            fillOpacity="0.14"
            stroke="#FF9F0A"
            strokeWidth="1.6"
          />
          <path
            d="M26 39V56L60 73L94 56V39M60 56V73"
            stroke="#FF9F0A"
            strokeWidth="1.5"
            strokeDasharray="4 3"
            className="animate-[pulse_1.8s_ease-in-out_infinite]"
          />

          {/* Smooth vertical architectural laser scan plane */}
          <g style={{ animation: "autem-scan 2.2s ease-in-out infinite" }}>
            <polygon
              points="60,34 98,53 60,72 22,53"
              fill="#F97316"
              fillOpacity="0.2"
              stroke="#FFB340"
              strokeWidth="1.5"
            />
          </g>

          {/* Corner architectural vertex nodes */}
          <circle cx="60" cy="22" r="2.5" fill="#FFB340" />
          <circle cx="94" cy="39" r="2.5" fill="#F97316" />
          <circle cx="26" cy="39" r="2.5" fill="#F97316" />
          <circle cx="60" cy="56" r="2.8" fill="#FFF7ED" />
          <circle cx="60" cy="103" r="2.2" fill="#F97316" />
        </svg>

        {typeof progress === "number" && (
          <span className="absolute -bottom-2.5 rounded-full border border-primary/50 bg-[#0A0A0B] px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[#FF9F0A] shadow-md">
            {Math.round(progress)}%
          </span>
        )}
      </div>

      <div className="flex max-w-sm flex-col gap-1">
        <p className={cn("font-semibold text-foreground", compact ? "text-xs" : "text-sm")}>
          {title}
        </p>
        {subtitle && (
          <p className="font-mono text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
