"use client";

import { useEffect } from "react";
import { Loader2, Trash2, X } from "lucide-react";

interface ConfirmDeleteDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  itemName?: string;
  itemMeta?: string;
  previewUrl?: string | null;
  deleting?: boolean;
  confirmLabel?: string;
  secondaryLabel?: string;
  onClose: () => void;
  onSecondaryAction?: () => void;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDeleteDialog({
  open,
  title = "¿Eliminar esta imagen?",
  description = "Se eliminará del servidor y dejará de estar disponible en tu biblioteca.",
  itemName,
  itemMeta,
  previewUrl,
  deleting = false,
  confirmLabel = "Eliminar definitivamente",
  secondaryLabel,
  onClose,
  onSecondaryAction,
  onConfirm,
}: ConfirmDeleteDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deleting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, deleting, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="autem-delete-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        onClick={() => {
          if (!deleting) onClose();
        }}
        className="fixed inset-0 bg-black/75 backdrop-blur-sm animate-[autem-backdrop-in_160ms_ease-out_forwards]"
      />

      {/* Dialog surface */}
      <div className="relative z-10 w-full max-w-[430px] overflow-hidden rounded-2xl border border-[#27272E] bg-[#111114]/98 shadow-[0_24px_70px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.05)] animate-[autem-dialog-in_200ms_cubic-bezier(0.16,1,0.3,1)_forwards]">
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-rose-500/30 bg-rose-500/12 text-rose-400">
                <Trash2 className="size-4.5" />
              </div>
              <div className="space-y-1">
                <h2
                  id="autem-delete-dialog-title"
                  className="text-[15px] font-semibold tracking-[-0.01em] text-[#F5F5F5]"
                >
                  {title}
                </h2>
                <p className="text-xs leading-relaxed text-[#A1A1AA]">{description}</p>
              </div>
            </div>

            <button
              type="button"
              disabled={deleting}
              onClick={onClose}
              className="rounded-lg p-1 text-[#71717A] transition hover:bg-white/5 hover:text-[#F5F5F5] disabled:opacity-40"
              aria-label="Cerrar diálogo"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Preview card of the asset being deleted */}
          {(previewUrl || itemName) && (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#232329] bg-[#0B0B0E] p-2.5">
              {previewUrl && (
                <div className="bg-checkerboard size-14 shrink-0 overflow-hidden rounded-lg border border-[#232329]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={itemName ?? "Vista previa"}
                    className="size-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {itemName && (
                  <p className="truncate text-xs font-medium text-[#F5F5F5]">{itemName}</p>
                )}
                {itemMeta && (
                  <p className="mt-0.5 font-mono text-[11px] text-[#71717A]">{itemMeta}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#1E1E24] bg-[#0D0D10]/90 px-5 py-3.5">
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="h-9 rounded-lg border border-[#27272E] bg-[#16161B] px-3.5 text-xs font-medium text-[#D4D4D8] transition hover:border-[#3A3A44] hover:text-[#F5F5F5] disabled:opacity-40"
          >
            Cancelar
          </button>

          {secondaryLabel && onSecondaryAction && (
            <button
              type="button"
              disabled={deleting}
              onClick={onSecondaryAction}
              className="h-9 rounded-lg border border-[#2C2C34] bg-[#1A1A20] px-3.5 text-xs font-medium text-[#F5F5F5] transition hover:border-[#42424E] hover:bg-[#22222A] disabled:opacity-40"
            >
              {secondaryLabel}
            </button>
          )}

          <button
            type="button"
            disabled={deleting}
            onClick={() => void onConfirm()}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-500/45 bg-rose-500/18 px-4 text-xs font-semibold text-rose-300 transition hover:border-rose-500/70 hover:bg-rose-500/28 hover:text-rose-200 disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            {deleting ? "Eliminando..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
