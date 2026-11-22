"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  X,
  XCircle,
} from "lucide-react";
import { useToastStore, type ToastVariant } from "@/stores/toast-store";

const VARIANT_STYLES: Record<
  ToastVariant,
  {
    border: string;
    iconBg: string;
    bar: string;
    icon: typeof Info;
    iconColor: string;
  }
> = {
  info: {
    border: "border-[#2A2A32]",
    iconBg: "bg-sky-500/12 ring-1 ring-sky-400/25",
    bar: "bg-sky-400/80",
    icon: Info,
    iconColor: "text-sky-400",
  },
  success: {
    border: "border-emerald-500/30",
    iconBg: "bg-emerald-500/12 ring-1 ring-emerald-400/30",
    bar: "bg-emerald-400/85",
    icon: CheckCircle2,
    iconColor: "text-emerald-400",
  },
  warning: {
    border: "border-[#F97316]/35",
    iconBg: "bg-[#F97316]/12 ring-1 ring-[#FF9F0A]/30",
    bar: "bg-gradient-to-r from-[#FF9F0A] to-[#F97316]",
    icon: AlertTriangle,
    iconColor: "text-[#FF9F0A]",
  },
  error: {
    border: "border-rose-500/35",
    iconBg: "bg-rose-500/12 ring-1 ring-rose-400/30",
    bar: "bg-rose-500/85",
    icon: XCircle,
    iconColor: "text-rose-400",
  },
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-[calc(100vw-2.5rem)] max-w-[396px] flex-col gap-2.5"
    >
      {toasts.map((item) => {
        const style = VARIANT_STYLES[item.variant];
        const Icon = style.icon;
        return (
          <div
            key={item.id}
            role="status"
            className={`group pointer-events-auto relative overflow-hidden rounded-[14px] border ${style.border} bg-[#111114]/95 p-3.5 shadow-[0_20px_50px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-xl animate-[autem-toast-in_240ms_cubic-bezier(0.16,1,0.3,1)_forwards]`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${style.iconBg}`}
              >
                <Icon className={`size-4 ${style.iconColor}`} />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[13px] font-semibold tracking-[-0.01em] text-[#F5F5F5]">
                  {item.title}
                </p>
                {item.description && (
                  <p className="text-xs leading-relaxed text-[#A1A1AA]">{item.description}</p>
                )}

                {item.actionHref && item.actionLabel && (
                  <div className="pt-1.5">
                    <Link
                      href={item.actionHref}
                      onClick={() => dismiss(item.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#F97316]/35 bg-[#F97316]/12 px-2.5 py-1 text-[11px] font-semibold text-[#FF9F0A] transition hover:border-[#F97316]/60 hover:bg-[#F97316]/20"
                    >
                      {item.actionLabel}
                      <ArrowRight className="size-3" />
                    </Link>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-lg p-1 text-[#71717A] transition hover:bg-white/5 hover:text-[#F5F5F5]"
                aria-label="Cerrar notificación"
              >
                <X className="size-3.5" />
              </button>
            </div>

            {item.durationMs > 0 && (
              <div
                aria-hidden="true"
                className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.04]"
              >
                <div
                  className={`h-full w-full origin-left ${style.bar} group-hover:[animation-play-state:paused]`}
                  style={{
                    animation: `autem-toast-progress ${item.durationMs}ms linear forwards`,
                  }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
