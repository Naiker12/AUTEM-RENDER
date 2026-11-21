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
  { border: string; bar: string; icon: typeof Info; iconColor: string }
> = {
  info: {
    border: "border-[#2A2A2F]",
    bar: "bg-sky-400",
    icon: Info,
    iconColor: "text-sky-400",
  },
  success: {
    border: "border-emerald-500/35",
    bar: "bg-emerald-400",
    icon: CheckCircle2,
    iconColor: "text-emerald-400",
  },
  warning: {
    border: "border-[#F97316]/45",
    bar: "bg-gradient-to-b from-[#FF9F0A] to-[#F97316]",
    icon: AlertTriangle,
    iconColor: "text-[#FF9F0A]",
  },
  error: {
    border: "border-rose-500/45",
    bar: "bg-rose-500",
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
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-full max-w-[390px] flex-col gap-2.5"
    >
      {toasts.map((item) => {
        const style = VARIANT_STYLES[item.variant];
        const Icon = style.icon;
        return (
          <div
            key={item.id}
            role="status"
            className={`pointer-events-auto relative overflow-hidden rounded-[12px] border ${style.border} bg-[#111113]/95 p-3.5 pl-4 shadow-[0_16px_40px_rgba(0,0,0,0.65)] backdrop-blur-xl transition-all`}
          >
            {/* Left accent bar */}
            <span
              aria-hidden="true"
              className={`absolute bottom-0 left-0 top-0 w-[3px] ${style.bar}`}
            />

            <div className="flex items-start gap-3">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconColor}`} />

              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-[13px] font-semibold leading-snug text-[#F5F5F5]">
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
                      className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#F97316]/40 bg-[#F97316]/15 px-2.5 py-1 text-[11px] font-semibold text-[#FF9F0A] transition hover:bg-[#F97316]/25"
                    >
                      {item.actionLabel}
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="rounded-md p-1 text-[#71717A] transition hover:bg-[#1E1E22] hover:text-[#F5F5F5]"
                aria-label="Cerrar notificación"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
