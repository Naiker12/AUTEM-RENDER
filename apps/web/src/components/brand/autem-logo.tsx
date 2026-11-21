import { cn } from "cn";

interface AutemLogoProps {
  className?: string;
  size?: number;
}

/**
 * Custom architectural isometric mark for Autem Render:
 * A cantilevered two-level structural volume with precision wireframe edges
 * and warm architectural lighting planes.
 */
export function AutemLogo({ className, size = 40 }: AutemLogoProps) {
  return (
    <div
      style={{ width: size, height: size }}
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[#F97316]/35 bg-[#121110] shadow-[inset_0_1px_0_rgba(255,159,10,0.22)]",
        className
      )}
    >
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-full"
      >
        <defs>
          <linearGradient id="autem-top" x1="8" y1="7" x2="32" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFB340" />
            <stop offset="100%" stopColor="#F97316" />
          </linearGradient>
          <linearGradient id="autem-left" x1="8" y1="14" x2="20" y2="33" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F97316" />
            <stop offset="100%" stopColor="#C2410C" />
          </linearGradient>
          <linearGradient id="autem-right" x1="20" y1="14" x2="32" y2="33" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FB923C" />
            <stop offset="100%" stopColor="#9A3412" />
          </linearGradient>
        </defs>

        {/* Subtle architectural grid lines */}
        <path
          d="M20 4V36M6 12L34 28M34 12L6 28"
          stroke="#F97316"
          strokeOpacity="0.12"
          strokeWidth="0.75"
        />

        {/* Upper cantilevered roof plane (Isometric diamond) */}
        <polygon
          points="20,7 32,14 20,21 8,14"
          fill="url(#autem-top)"
        />

        {/* Left structural facade with cantilever cutout */}
        <polygon
          points="8,14 20,21 20,33 12,28.5 12,21.5 8,19.2"
          fill="url(#autem-left)"
        />

        {/* Right glazed volume */}
        <polygon
          points="20,21 32,14 32,26 20,33"
          fill="url(#autem-right)"
        />

        {/* Inner illuminated architectural courtyard / window */}
        <polygon
          points="22.5,22.2 29.5,18.2 29.5,24.2 22.5,28.2"
          fill="#0A0A0B"
          fillOpacity="0.72"
        />

        {/* Precision structural wireframe highlights */}
        <path
          d="M20 7L32 14L20 21L8 14L20 7Z"
          stroke="#FFF7ED"
          strokeOpacity="0.55"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
        <path
          d="M20 21V33M8 14V19.2L12 21.5V28.5L20 33L32 26V14"
          stroke="#FFEDD5"
          strokeOpacity="0.4"
          strokeWidth="0.9"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
