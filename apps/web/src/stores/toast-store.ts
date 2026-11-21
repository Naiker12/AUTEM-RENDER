import { create } from "zustand";

export type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  durationMs: number;
}

interface ToastInput {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
  durationMs?: number;
}

interface ToastStore {
  toasts: ToastItem[];
  push: (variant: ToastVariant, input: ToastInput) => string;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (variant, input) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const durationMs = input.durationMs ?? (variant === "error" || variant === "warning" ? 6500 : 4000);
    const item: ToastItem = {
      id,
      variant,
      title: input.title,
      description: input.description,
      actionLabel: input.actionLabel,
      actionHref: input.actionHref,
      durationMs,
    };

    set((state) => ({
      // Keep max 4 visible toasts, deduplicating identical title+description
      toasts: [
        ...state.toasts.filter(
          (t) => !(t.title === item.title && t.description === item.description)
        ),
        item,
      ].slice(-4),
    }));

    if (durationMs > 0) {
      setTimeout(() => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      }, durationMs);
    }

    return id;
  },
  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export const toast = {
  info: (input: ToastInput) => useToastStore.getState().push("info", input),
  success: (input: ToastInput) => useToastStore.getState().push("success", input),
  warning: (input: ToastInput) => useToastStore.getState().push("warning", input),
  error: (input: ToastInput) => useToastStore.getState().push("error", input),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};
