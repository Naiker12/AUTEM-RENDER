"use client";

interface ProviderIconProps {
  id: string;
  className?: string;
}

const ICON_MAP: Record<string, { src: string; invertOnDark?: boolean; alt: string }> = {
  huggingface: { src: "/icons/providers/huggingface.svg", alt: "Hugging Face" },
  fal: { src: "/icons/providers/fal.svg", invertOnDark: true, alt: "fal.ai" },
  stability: { src: "/icons/providers/stability.svg", alt: "Stability AI" },
  tripo: { src: "/icons/providers/tripo.svg", alt: "Tripo3D" },
  meshy: { src: "/icons/providers/meshy.svg", alt: "Meshy" },
  replicate: { src: "/icons/providers/replicate.svg", invertOnDark: true, alt: "Replicate" },
  openai: { src: "/icons/providers/openai.svg", invertOnDark: true, alt: "OpenAI" },
  comfyui: { src: "/icons/providers/comfyui.svg", alt: "ComfyUI" },
  ollama: { src: "/icons/providers/ollama.svg", invertOnDark: true, alt: "Ollama" },
  pollinations: {
    src: "/icons/providers/pollinations.svg",
    invertOnDark: true,
    alt: "Pollinations",
  },
};

export function ProviderIcon({ id, className = "h-5 w-5" }: ProviderIconProps) {
  const key = id.split(".")[0].toLowerCase();
  const entry = ICON_MAP[key] ?? ICON_MAP[id.toLowerCase()];

  if (entry) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={entry.src}
        alt={entry.alt}
        className={`${className} object-contain ${entry.invertOnDark ? "brightness-0 invert" : ""}`}
      />
    );
  }

  // Fallback for custom local 3D server
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <polygon
        points="12,3 20,12 12,21 4,12"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="M4 12H20M12 3V21" stroke="currentColor" strokeWidth="1.35" strokeOpacity="0.7" />
    </svg>
  );
}
