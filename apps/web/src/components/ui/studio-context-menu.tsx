"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
  onSelect: () => void;
}

interface StudioContextMenuProps {
  position: { x: number; y: number } | null;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function StudioContextMenu({ position, items, onClose }: StudioContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(position);

  useLayoutEffect(() => {
    if (!position) {
      setCoords(null);
      return;
    }
    const el = menuRef.current;
    const width = el?.offsetWidth ?? 224;
    const height = el?.offsetHeight ?? 240;
    const pad = 10;
    const x = Math.min(position.x, Math.max(pad, window.innerWidth - width - pad));
    const y = Math.min(position.y, Math.max(pad, window.innerHeight - height - pad));
    setCoords({ x, y });
  }, [position, items.length]);

  useEffect(() => {
    if (!position) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const handleScroll = () => onClose();

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [position, onClose]);

  if (!position) return null;

  const left = coords?.x ?? position.x;
  const top = coords?.y ?? position.y;

  return (
    <div
      ref={menuRef}
      role="menu"
      style={{ left, top }}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-[224px] overflow-hidden rounded-xl border border-[#27272E] bg-[#111114]/98 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.78),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-xl animate-[autem-dialog-in_140ms_cubic-bezier(0.16,1,0.3,1)_forwards]"
    >
      {items.map((item) => (
        <div key={item.id}>
          {item.dividerBefore && <div className="my-1.5 h-px bg-[#222228]" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              onClose();
              item.onSelect();
            }}
            className={`flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition disabled:pointer-events-none disabled:opacity-40 ${
              item.danger
                ? "text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
                : "text-[#E4E4E7] hover:bg-white/[0.06] hover:text-white"
            }`}
          >
            <span className="flex items-center gap-2.5">
              {item.icon && (
                <span
                  className={`flex size-4 items-center justify-center ${
                    item.danger ? "text-rose-400" : "text-[#8A8A93]"
                  }`}
                >
                  {item.icon}
                </span>
              )}
              <span>{item.label}</span>
            </span>
            {item.shortcut && (
              <span className="font-mono text-[10px] text-[#71717A]">{item.shortcut}</span>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
