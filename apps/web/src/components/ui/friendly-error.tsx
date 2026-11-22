"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, Wrench, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { parseFriendlyError } from "@/lib/api";

interface FriendlyErrorAlertProps {
  error: unknown;
  onDismiss?: () => void;
}

/**
 * Renders the structured friendly error sent by the FastAPI backend
 * in a warm, calm, architectural card instead of a harsh raw error banner.
 */
export function FriendlyErrorAlert({ error, onDismiss }: FriendlyErrorAlertProps) {
  if (!error) return null;
  const parsed = parseFriendlyError(error);

  return (
    <div
      role="status"
      className="relative flex flex-col gap-3 rounded-xl border border-[#F59E0B]/30 bg-[#141210] p-4 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3.5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-[#F59E0B]/30 bg-[#F59E0B]/15 text-[#FFB340]">
          <AlertTriangle className="size-4" />
        </div>

        <div className="flex flex-col gap-1 pr-6 sm:pr-0">
          <p className="text-sm font-semibold text-foreground">{parsed.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{parsed.detail}</p>
          {parsed.hint && (
            <p className="text-[11px] text-[#FFB340]/90">{parsed.hint}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
        {parsed.action_url && (
          <Button
            render={<Link href={parsed.action_url} />}
            variant="outline"
            size="sm"
            className="border-[#F59E0B]/40 bg-[#F59E0B]/10 text-foreground hover:bg-[#F59E0B]/20"
          >
            <Wrench data-icon="inline-start" />
            {parsed.action_label ?? "Configurar"}
            <ArrowRight data-icon="inline-end" />
          </Button>
        )}

        {onDismiss && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
            title="Cerrar aviso"
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

