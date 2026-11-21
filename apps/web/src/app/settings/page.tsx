"use client";

import { useEffect, useMemo, useState } from "react";
import { ProviderIcon } from "@/components/brand/provider-icons";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Cloud,
  Cpu,
  DollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Layers,
  Loader2,
  Receipt,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FriendlyErrorAlert } from "@/components/ui/friendly-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchCostLedger,
  fetchProviders,
  fetchProviderSettings,
  testProviderConnection,
  updateProviderSettings,
  type CloudProviderStatus,
  type CostLedger,
  type LocalEngineStatus,
  type ProviderInfo,
  type ProviderSettings,
  type TestProviderResult,
} from "@/lib/api";

type SettingsTab = "cloud" | "local" | "routing" | "budget";

const PROVIDER_BADGES: Record<string, { abbr: string; color: string; tier: string }> = {
  huggingface: {
    abbr: "HF",
    color: "from-emerald-500/25 to-green-500/10 text-emerald-300 border-emerald-500/30",
    tier: "Plan Gratis",
  },
  fal: {
    abbr: "FAL",
    color: "from-orange-500/25 to-amber-500/10 text-amber-300 border-amber-500/30",
    tier: "Todo en uno",
  },
  stability: {
    abbr: "STB",
    color: "from-indigo-500/25 to-violet-500/10 text-indigo-300 border-indigo-500/30",
    tier: "3D Rápido",
  },
  tripo: {
    abbr: "TRP",
    color: "from-cyan-500/25 to-sky-500/10 text-cyan-300 border-cyan-500/30",
    tier: "3D Directo",
  },
  meshy: {
    abbr: "MSH",
    color: "from-teal-500/25 to-emerald-500/10 text-teal-300 border-teal-500/30",
    tier: "3D PBR",
  },
  replicate: {
    abbr: "REP",
    color: "from-rose-500/25 to-pink-500/10 text-rose-300 border-rose-500/30",
    tier: "Multi-vista",
  },
  openai: {
    abbr: "OAI",
    color: "from-zinc-400/25 to-zinc-600/10 text-zinc-200 border-zinc-500/30",
    tier: "Render IA",
  },
};

const PROVIDER_PREFIX: Record<string, string> = {
  huggingface: "hf.",
  fal: "fal.",
  tripo: "tripo.",
  meshy: "meshy.",
  stability: "stability.",
  replicate: "replicate.",
  openai: "openai.",
};

const FLOW_CATEGORIES = [
  {
    section: "image_to_3d",
    kind: "image_to_3d",
    title: "Imagen a 3D",
    desc: "Reconstrucción de mallas GLB/OBJ/STL desde 1–4 vistas.",
  },
  {
    section: "image",
    kind: "render",
    title: "Render Arquitectónico",
    desc: "Photoreal, Clay, Linework, Re-light y variaciones.",
  },
  {
    section: "upscale",
    kind: "upscale",
    title: "Upscale / Mejorar",
    desc: "Incremento de resolución 2x–4K manteniendo detalle.",
  },
  {
    section: "video",
    kind: "video",
    title: "Video (Animar / Transición)",
    desc: "Animación de cámara y transiciones primer/último cuadro.",
  },
];

const FALLBACK_CLOUD_PROVIDERS: CloudProviderStatus[] = [
  {
    id: "huggingface",
    label: "Hugging Face (Plan Gratis · Sin tarjeta)",
    env_var: "HF_TOKEN",
    placeholder: "hf_...",
    models: "FLUX.1-schnell (render gratis con cuenta gratuita de Hugging Face)",
    docs_url: "https://huggingface.co/settings/tokens",
    short_url: "huggingface.co/tokens",
    pricing: "free",
    configured: false,
    preview: null,
  },
  {
    id: "fal",
    label: "fal.ai (Todo en uno: 3D, Render, Upscale y Video)",
    env_var: "FAL_KEY",
    placeholder: "key_id:key_secret",
    models: "TRELLIS.2, Pixal3D, Tripo H3.1, Hunyuan 3D 3.1 Pro, Flux, Clarity, Wan/LTX",
    docs_url: "https://fal.ai/dashboard/keys",
    short_url: "fal.ai/keys",
    pricing: "paid",
    configured: false,
    preview: null,
  },
  {
    id: "stability",
    label: "Stability AI (Stable Fast 3D)",
    env_var: "STABILITY_API_KEY",
    placeholder: "sk-...",
    models: "Stable Fast 3D (~5s, ~$0.05/modelo)",
    docs_url: "https://platform.stability.ai/account/keys",
    short_url: "stability.ai/keys",
    pricing: "paid",
    configured: false,
    preview: null,
  },
  {
    id: "tripo",
    label: "Tripo3D Directo (Imagen a 3D)",
    env_var: "TRIPO_API_KEY",
    placeholder: "tsk_...",
    models: "Tripo v2.5 / H3.1 PBR directo (~$0.20/modelo)",
    docs_url: "https://platform.tripo3d.ai/api-keys",
    short_url: "tripo3d.ai/keys",
    pricing: "paid",
    configured: false,
    preview: null,
  },
  {
    id: "meshy",
    label: "Meshy Directo (Imagen a 3D)",
    env_var: "MESHY_API_KEY",
    placeholder: "msy_...",
    models: "Meshy-5 / Meshy-6 PBR directo (~$0.35/modelo)",
    docs_url: "https://app.meshy.ai/api",
    short_url: "meshy.ai/api",
    pricing: "paid",
    configured: false,
    preview: null,
  },
  {
    id: "replicate",
    label: "Replicate (TRELLIS Multi-vista)",
    env_var: "REPLICATE_API_TOKEN",
    placeholder: "r8_...",
    models: "TRELLIS multi-vista y modelos open source en la nube",
    docs_url: "https://replicate.com/account/api-tokens",
    short_url: "replicate.com/tokens",
    pricing: "paid",
    configured: false,
    preview: null,
  },
  {
    id: "openai",
    label: "OpenAI (Render Arquitectónico)",
    env_var: "OPENAI_API_KEY",
    placeholder: "sk-proj-...",
    models: "gpt-image-1 (render y edición arquitectónica)",
    docs_url: "https://platform.openai.com/api-keys",
    short_url: "openai.com/keys",
    pricing: "paid",
    configured: false,
    preview: null,
  },
];

const FALLBACK_LOCAL_ENGINES: LocalEngineStatus[] = [
  {
    id: "comfyui",
    label: "ComfyUI Local / Remoto (GPU)",
    env_var: "COMFYUI_URL",
    url: "http://localhost:8188",
    models: "TRELLIS.2, Pixal3D, Flux/ControlNet, Wan 2.2, LTX-2.5 (gratis en tu GPU)",
    online: false,
  },
  {
    id: "ollama",
    label: "Ollama Local (Asistente de Prompts)",
    env_var: "OLLAMA_URL",
    url: "http://localhost:11434",
    models: "LLMs locales (Llama / Qwen) para enriquecer prompts arquitectónicos",
    online: false,
  },
  {
    id: "local_3d",
    label: "Servidor 3D Local (RunPod / Vast.ai / Gradio)",
    env_var: "LOCAL_3D_URL",
    url: "http://localhost:7860",
    models: "Instancia dedicada de TRELLIS.2 / Hunyuan3D / TripoSR",
    online: false,
  },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("cloud");
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [allProviders, setAllProviders] = useState<ProviderInfo[]>([]);
  const [ledger, setLedger] = useState<CostLedger | null>(null);

  const [selectedCloudId, setSelectedCloudId] = useState<string>("huggingface");
  const [showKey, setShowKey] = useState(false);
  const [cloudKeyInputs, setCloudKeyInputs] = useState<Record<string, string>>({});
  const [localUrlInputs, setLocalUrlInputs] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<Record<string, string>>({
    image_to_3d: "auto",
    image: "auto",
    upscale: "auto",
    video: "auto",
  });
  const [dailyLimit, setDailyLimit] = useState("5.0");
  const [freeOnlyMode, setFreeOnlyMode] = useState(false);

  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestProviderResult>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function loadAll() {
    setLoading(true);
    try {
      const [cfg, provs, costLedger] = await Promise.all([
        fetchProviderSettings(),
        fetchProviders(""),
        fetchCostLedger(),
      ]);
      setSettings(cfg);
      setAllProviders(provs);
      setLedger(costLedger);
      setDailyLimit(String(cfg.daily_cost_limit_usd));
      setFreeOnlyMode(cfg.free_only_mode);
      setDefaults(cfg.defaults);
      const urls: Record<string, string> = {};
      for (const eng of cfg.local_engines) {
        urls[eng.id] = eng.url;
      }
      setLocalUrlInputs(urls);
      setToast(null);
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : "No se pudo conectar con la API en :8000.",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function handleSaveAll(overrideFreeOnly?: boolean) {
    setSaving(true);
    setToast(null);
    try {
      const nonEmptyKeys: Record<string, string> = {};
      for (const [id, val] of Object.entries(cloudKeyInputs)) {
        if (val.trim()) nonEmptyKeys[id] = val.trim();
      }
      const nextFreeOnly = overrideFreeOnly ?? freeOnlyMode;
      const updated = await updateProviderSettings({
        cloud_keys: nonEmptyKeys,
        local_urls: localUrlInputs,
        defaults,
        daily_cost_limit_usd: Number.parseFloat(dailyLimit) || 5.0,
        free_only_mode: nextFreeOnly,
      });
      setSettings(updated);
      setFreeOnlyMode(updated.free_only_mode);
      setCloudKeyInputs({});
      const [provs, costLedger] = await Promise.all([fetchProviders(""), fetchCostLedger()]);
      setAllProviders(provs);
      setLedger(costLedger);
      setToast({
        kind: "ok",
        text: "Configuración guardada en .env y config/providers.yaml, aplicada en vivo.",
      });
    } catch (err) {
      setToast({
        kind: "err",
        text: err instanceof Error ? err.message : "Error guardando configuración.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(providerId: string) {
    setTestingId(providerId);
    try {
      const pendingKey = cloudKeyInputs[providerId]?.trim();
      const pendingUrl = localUrlInputs[providerId]?.trim();
      if (pendingKey || pendingUrl) {
        const updated = await updateProviderSettings({
          cloud_keys: pendingKey ? { [providerId]: pendingKey } : undefined,
          local_urls: pendingUrl ? { [providerId]: pendingUrl } : undefined,
        });
        setSettings(updated);
        if (pendingKey) {
          setCloudKeyInputs((prev) => ({ ...prev, [providerId]: "" }));
        }
      }

      const res = await testProviderConnection(providerId);
      setTestResults((prev) => ({ ...prev, [providerId]: res }));
      const [cfg, provs] = await Promise.all([fetchProviderSettings(), fetchProviders("")]);
      setSettings(cfg);
      setAllProviders(provs);
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          provider_id: providerId,
          ok: false,
          latency_ms: 0,
          detail: err instanceof Error ? err.message : "Error de red",
        },
      }));
    } finally {
      setTestingId(null);
    }
  }

  const readyModelsCount = useMemo(
    () => allProviders.filter((p) => p.available).length,
    [allProviders]
  );

  const cloudList = settings?.cloud_providers ?? FALLBACK_CLOUD_PROVIDERS;
  const localList = settings?.local_engines ?? FALLBACK_LOCAL_ENGINES;
  const selectedCloud = cloudList.find((c) => c.id === selectedCloudId) ?? cloudList[0] ?? null;

  const selectedCloudModels = useMemo(() => {
    if (!selectedCloud) return [];
    const prefix = PROVIDER_PREFIX[selectedCloud.id] ?? `${selectedCloud.id}.`;
    return allProviders.filter((p) => p.id.startsWith(prefix));
  }, [allProviders, selectedCloud]);

  const spentPct = ledger
    ? Math.min(100, (ledger.today_usd / Math.max(0.01, ledger.daily_limit_usd)) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#1E1E22] pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#F5F5F5]">
            Centro de Motores, Providers y Gastos
          </h1>
          <p className="mt-1 text-sm text-[#8A8A8F]">
            Prioriza motores gratis ($0 USD) y lleva la contabilidad exacta de cualquier API de pago.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => void loadAll()}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-[#232326] bg-[#111113] px-3.5 text-xs font-medium text-[#E4E4E7] transition hover:border-[#3A3A40]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-[#F97316]" : ""}`} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={saving}
            className="btn-primary inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-xs font-semibold transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </header>

      {/* KPI Strip */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[12px] border border-[#232326] bg-[#111113] p-4">
          <div className="flex items-center justify-between text-xs text-[#8A8A8F]">
            <span>Modo de gasto</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 text-lg font-semibold text-[#F5F5F5]">
            {freeOnlyMode ? "Solo Gratis ($0)" : "Gratis + APIs"}
          </p>
          <p className="mt-1 text-[11px] text-[#71717A]">
            {freeOnlyMode
              ? "APIs de pago bloqueadas"
              : `Tope diario: $${Number(dailyLimit || 5).toFixed(2)} USD`}
          </p>
        </div>

        <div className="rounded-[12px] border border-[#232326] bg-[#111113] p-4">
          <div className="flex items-center justify-between text-xs text-[#8A8A8F]">
            <span>Modelos listos</span>
            <Layers className="h-4 w-4 text-[#F97316]" />
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold text-[#F5F5F5]">
            {readyModelsCount}
            <span className="text-sm font-normal text-[#52525B]"> / {allProviders.length}</span>
          </p>
          <p className="mt-1 text-[11px] text-[#71717A]">Pollinations Flux gratis ya activo</p>
        </div>

        <div className="rounded-[12px] border border-[#232326] bg-[#111113] p-4">
          <div className="flex items-center justify-between text-xs text-[#8A8A8F]">
            <span>GPU Local (ComfyUI)</span>
            <HardDrive className="h-4 w-4 text-sky-400" />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${settings?.comfyui_online ? "bg-emerald-400" : "bg-zinc-600"
                }`}
            />
            <p className="text-lg font-semibold text-[#F5F5F5]">
              {settings?.comfyui_online ? "En línea ($0)" : "Sin conexión"}
            </p>
          </div>
          <p className="mt-1 truncate font-mono text-[11px] text-[#71717A]">
            {settings?.comfyui_url ?? "http://localhost:8188"}
          </p>
        </div>

        <div className="rounded-[12px] border border-[#232326] bg-[#111113] p-4">
          <div className="flex items-center justify-between text-xs text-[#8A8A8F]">
            <span>Gasto acumulado (Hoy / Total)</span>
            <DollarSign className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 font-mono text-xl font-semibold text-[#F5F5F5]">
            ${(ledger?.today_usd ?? 0).toFixed(2)}
            <span className="text-xs font-normal text-[#71717A]">
              {" "}
              / Total ${(ledger?.all_time_usd ?? 0).toFixed(2)}
            </span>
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#1E1E22]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-[#F97316]"
              style={{ width: `${spentPct}%` }}
            />
          </div>
        </div>
      </section>

      {toast && (
        <div
          className={`flex items-center justify-between rounded-[12px] border px-4 py-3 text-xs ${toast.kind === "ok"
            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            : "border-rose-500/30 bg-rose-500/10 text-rose-200"
            }`}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-[11px] underline opacity-75 hover:opacity-100"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Segmented Tabs */}
      <div className="flex flex-wrap gap-1.5 rounded-[12px] border border-[#232326] bg-[#0E0E10] p-1.5">
        {[
          { id: "cloud" as const, label: "Proveedores (Gratis y API)", icon: KeyRound },
          { id: "local" as const, label: "Motores Locales ($0 GPU)", icon: Server },
          { id: "routing" as const, label: "Enrutamiento y Prioridad", icon: SlidersHorizontal },
          { id: "budget" as const, label: "Contabilidad y Gastos", icon: Receipt },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-[9px] px-4 py-2.5 text-xs font-medium transition-all ${active
                ? "border border-[#2E2E34] bg-[#18181C] text-[#F5F5F5] shadow-sm"
                : "border border-transparent text-[#8A8A8F] hover:text-[#E4E4E7]"
                }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? "text-[#F97316]" : ""}`} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* TAB 1: CLOUD PROVIDERS */}
      {activeTab === "cloud" && (
        <div className="grid gap-5 lg:grid-cols-12">
          {/* Left provider rail */}
          <div className="space-y-2 lg:col-span-5">
            {cloudList.map((cp) => {
              const badge = PROVIDER_BADGES[cp.id] ?? {
                abbr: "API",
                color: "from-zinc-500/20 to-zinc-700/10 text-zinc-300 border-zinc-600/30",
                tier: "Cloud",
              };
              const isSelected = cp.id === selectedCloudId;
              return (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => {
                    setSelectedCloudId(cp.id);
                    setShowKey(false);
                  }}
                  className={`flex w-full items-center gap-3.5 rounded-[12px] border p-3.5 text-left transition-all ${isSelected
                    ? "border-[#F97316] bg-[#16161A] shadow-[0_0_0_1px_rgba(249,115,22,0.2)]"
                    : "border-[#232326] bg-[#111113] hover:border-[#323238]"
                    }`}
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border bg-gradient-to-br ${badge.color}`}
                  >
                    <ProviderIcon id={cp.id} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-[#F5F5F5]">
                        {cp.label.split("(")[0].trim()}
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${cp.pricing === "free"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-amber-500/15 text-amber-300"
                            }`}
                        >
                          {cp.pricing === "free" ? "Gratis" : "De pago"}
                        </span>
                        <span
                          className={`h-2 w-2 rounded-full ${cp.configured ? "bg-emerald-400" : "bg-zinc-600"
                            }`}
                          title={cp.configured ? "Conectado" : "Sin clave"}
                        />
                      </div>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-[#8A8A8F]">{cp.models}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right detail panel */}
          {selectedCloud && (
            <div className="flex flex-col justify-between space-y-6 rounded-[12px] border border-[#232326] bg-[#111113] p-6 lg:col-span-7">
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E1E22] pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border bg-gradient-to-br ${
                          (PROVIDER_BADGES[selectedCloud.id]?.color ??
                            "from-zinc-500/20 to-zinc-700/10 text-zinc-300 border-zinc-600/30")
                        }`}
                      >
                        <ProviderIcon id={selectedCloud.id} className="h-4 w-4" />
                      </div>
                      <h2 className="text-lg font-semibold text-[#F5F5F5]">
                        {selectedCloud.label.split("(")[0].trim()}
                      </h2>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${selectedCloud.pricing === "free"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-amber-500/15 text-amber-300"
                          }`}
                      >
                        {selectedCloud.pricing === "free" ? "Gratis · $0 USD" : "API de pago"}
                      </span>
                      {/* Link pequeño y directo al pulsar el proveedor */}
                      <a
                        href={selectedCloud.docs_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-full border border-[#2A2A2F] bg-[#16161A] px-2 py-0.5 font-mono text-[10px] text-[#F97316] transition hover:border-[#F97316]/60"
                      >
                        {selectedCloud.short_url}
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                    <p className="text-xs text-[#8A8A8F]">{selectedCloud.models}</p>
                  </div>
                </div>

                {/* API Key Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-medium text-[#E4E4E7]">
                      Clave <span className="font-mono text-[#F97316]">{selectedCloud.env_var}</span>
                    </label>
                    {selectedCloud.configured && (
                      <span className="font-mono text-[11px] text-emerald-400">
                        Activa: {selectedCloud.preview}
                      </span>
                    )}
                  </div>

                  <div className="relative">
                    <input
                      type={showKey ? "text" : "password"}
                      value={cloudKeyInputs[selectedCloud.id] ?? ""}
                      onChange={(e) =>
                        setCloudKeyInputs((prev) => ({
                          ...prev,
                          [selectedCloud.id]: e.target.value,
                        }))
                      }
                      placeholder={
                        selectedCloud.configured
                          ? "Escribe una nueva clave para reemplazar la actual"
                          : `Pega tu clave (${selectedCloud.placeholder})`
                      }
                      className="w-full rounded-[10px] border border-[#2A2A2F] bg-[#0A0A0B] py-2.5 pl-3.5 pr-10 font-mono text-xs text-[#F5F5F5] outline-none focus:border-[#F97316]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#71717A] hover:text-[#E4E4E7]"
                      title={showKey ? "Ocultar" : "Mostrar"}
                    >
                      {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => void handleTest(selectedCloud.id)}
                      disabled={testingId === selectedCloud.id}
                      className="inline-flex items-center gap-2 rounded-[10px] border border-[#2A2A2F] bg-[#16161A] px-4 py-2 text-xs font-medium text-[#F5F5F5] transition hover:border-[#F97316] disabled:opacity-50"
                    >
                      {testingId === selectedCloud.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F97316]" />
                      ) : (
                        <Activity className="h-3.5 w-3.5 text-[#F97316]" />
                      )}
                      Probar conexión
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSaveAll()}
                      disabled={saving}
                      className="btn-primary inline-flex items-center gap-1.5 rounded-[10px] px-4 py-2 text-xs font-semibold transition disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      Guardar clave
                    </button>
                  </div>

                  {testResults[selectedCloud.id] && (
                    <TestResultBanner result={testResults[selectedCloud.id]} />
                  )}
                </div>

                {/* Models unlocked */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#71717A]">
                    Modelos que habilita ({selectedCloudModels.length})
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedCloudModels.map((model) => (
                      <div
                        key={model.id}
                        className="rounded-[10px] border border-[#232326] bg-[#0C0C0E] p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold text-[#F5F5F5]">
                            {model.label}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${model.available
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-[#1E1E22] text-[#71717A]"
                              }`}
                          >
                            {model.available ? "Listo" : "Inactivo"}
                          </span>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 font-mono text-[10px] text-[#8A8A8F]">
                          <span className="uppercase">{model.kind}</span>
                          <span>
                            {model.est_cost_usd === 0
                              ? "GRATIS"
                              : `~$${(model.est_cost_usd ?? 0).toFixed(2)} USD`}
                          </span>
                          <span>~{model.est_seconds}s</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-[10px] border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 text-[11px] text-emerald-200/90">
                <Cloud className="mr-1.5 inline h-3.5 w-3.5 text-emerald-400" />
                <strong>Pollinations Flux (Gratis)</strong> ya funciona en{" "}
                <span className="font-mono">/render</span> sin necesidad de clave ni tarjeta.
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: LOCAL GPU ENGINES */}
      {activeTab === "local" && (
        <div className="grid gap-4 lg:grid-cols-3">
          {localList.map((eng) => (
            <div
              key={eng.id}
              className="flex flex-col justify-between space-y-4 rounded-[12px] border border-[#232326] bg-[#111113] p-5"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[#2A2A2F] bg-[#16161A] text-emerald-400">
                      <ProviderIcon id={eng.id} className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[#F5F5F5]">{eng.label}</h3>
                      <p className="font-mono text-[11px] text-[#71717A]">{eng.env_var} · $0 USD</p>
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium ${eng.online
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-[#1E1E22] text-[#8A8A8F]"
                      }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${eng.online ? "bg-emerald-400" : "bg-zinc-500"
                        }`}
                    />
                    {eng.online ? "En línea" : "Offline"}
                  </span>
                </div>

                <p className="text-xs leading-relaxed text-[#8A8A8F]">{eng.models}</p>

                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-[#A1A1AA]">URL del servidor</span>
                  <input
                    type="url"
                    value={localUrlInputs[eng.id] ?? eng.url}
                    onChange={(e) =>
                      setLocalUrlInputs((prev) => ({ ...prev, [eng.id]: e.target.value }))
                    }
                    className="w-full rounded-[10px] border border-[#2A2A2F] bg-[#0A0A0B] px-3 py-2 font-mono text-xs text-[#F5F5F5] outline-none focus:border-[#F97316]"
                  />
                </label>

                {testResults[eng.id] && <TestResultBanner result={testResults[eng.id]} />}
              </div>

              <button
                type="button"
                onClick={() => void handleTest(eng.id)}
                disabled={testingId === eng.id}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] border border-[#2A2A2F] bg-[#16161A] py-2 text-xs font-medium text-[#F5F5F5] transition hover:border-[#F97316] disabled:opacity-50"
              >
                {testingId === eng.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#F97316]" />
                ) : (
                  <Activity className="h-3.5 w-3.5 text-[#F97316]" />
                )}
                Probar servidor
              </button>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: ROUTING & FALLBACK */}
      {activeTab === "routing" && (
        <div className="grid gap-4 md:grid-cols-2">
          {FLOW_CATEGORIES.map((cat) => {
            const candidates = allProviders.filter((p) => p.kind === cat.kind);
            const chosen = defaults[cat.section] ?? "auto";
            return (
              <div
                key={cat.section}
                className="space-y-4 rounded-[12px] border border-[#232326] bg-[#111113] p-5"
              >
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-[#F5F5F5]">
                    <Cpu className="h-4 w-4 text-[#F97316]" />
                    {cat.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-[#8A8A8F]">{cat.desc}</p>
                </div>

                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => setDefaults((prev) => ({ ...prev, [cat.section]: "auto" }))}
                    className={`flex w-full items-center justify-between rounded-[10px] border px-3 py-2 text-xs transition ${chosen === "auto"
                      ? "border-[#F97316] bg-[#F97316]/10 text-[#F5F5F5]"
                      : "border-[#232326] bg-[#0C0C0E] text-[#8A8A8F] hover:border-[#3A3A40]"
                      }`}
                  >
                    <span className="font-medium">Auto (prioriza gratis primero)</span>
                    <span className="font-mono text-[10px] text-emerald-400">GRATIS 1º</span>
                  </button>

                  {candidates.map((p) => {
                    const selected = chosen === p.id;
                    const isFree = (p.est_cost_usd ?? 0) === 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setDefaults((prev) => ({ ...prev, [cat.section]: p.id }))}
                        className={`flex w-full items-center justify-between gap-2 rounded-[10px] border px-3 py-2 text-xs transition ${selected
                          ? "border-[#F97316] bg-[#F97316]/10 text-[#F5F5F5]"
                          : "border-[#232326] bg-[#0C0C0E] text-[#A1A1AA] hover:border-[#3A3A40]"
                          }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <span
                            className={`h-2 w-2 shrink-0 rounded-full ${p.available ? "bg-emerald-400" : "bg-zinc-600"
                              }`}
                          />
                          <span className="truncate font-medium">{p.label}</span>
                        </span>
                        <span
                          className={`shrink-0 font-mono text-[10px] ${isFree ? "text-emerald-400" : "text-amber-300"
                            }`}
                        >
                          {isFree ? "GRATIS" : `$${(p.est_cost_usd ?? 0).toFixed(2)}`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-[#71717A]">
                  <ArrowRight className="h-3 w-3 text-[#F97316]" />
                  <span>Si el principal falla o no está activo, pasa al siguiente disponible.</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TAB 4: CONTABILIDAD Y PRESUPUESTO */}
      {activeTab === "budget" && (
        <div className="space-y-5">
          {/* Resumen contable 4 columnas */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Hoy", val: ledger?.today_usd ?? 0 },
              { label: "Últimos 7 días", val: ledger?.last_7d_usd ?? 0 },
              { label: "Este mes", val: ledger?.month_usd ?? 0 },
              { label: "Total histórico", val: ledger?.all_time_usd ?? 0 },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-[12px] border border-[#232326] bg-[#111113] p-4"
              >
                <p className="text-xs text-[#8A8A8F]">{item.label}</p>
                <p className="mt-1.5 font-mono text-2xl font-semibold text-[#F5F5F5]">
                  ${item.val.toFixed(2)} <span className="text-xs text-[#71717A]">USD</span>
                </p>
              </div>
            ))}
          </div>

          {/* Controles de Solo Gratis + Tope Diario */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3 rounded-[12px] border border-[#232326] bg-[#111113] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-[#F5F5F5]">
                    Modo Solo Gratis (Cero gasto garantizado)
                  </h2>
                  <p className="mt-0.5 text-xs text-[#8A8A8F]">
                    Bloquea cualquier proveedor de pago para no gastar plata por error.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = !freeOnlyMode;
                    setFreeOnlyMode(next);
                    void handleSaveAll(next);
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${freeOnlyMode ? "bg-emerald-500" : "bg-[#2A2A2F]"
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition ${freeOnlyMode ? "translate-x-6" : "translate-x-1"
                      }`}
                  />
                </button>
              </div>
              <p className="text-[11px] text-[#71717A]">
                Trabajos completados: <strong className="text-emerald-400">{ledger?.free_jobs_count ?? 0} gratis</strong> ·{" "}
                <strong className="text-amber-300">{ledger?.paid_jobs_count ?? 0} de pago</strong>
              </p>
            </div>

            <div className="space-y-3 rounded-[12px] border border-[#232326] bg-[#111113] p-5">
              <h2 className="text-sm font-semibold text-[#F5F5F5]">
                Tope máximo de gasto diario (USD)
              </h2>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={100}
                  step={1}
                  value={Math.min(100, Math.max(1, Number(dailyLimit) || 5))}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="flex-1 accent-[#F97316]"
                />
                <div className="flex items-center gap-1.5 rounded-[10px] border border-[#2A2A2F] bg-[#0A0A0B] px-3 py-1.5">
                  <span className="text-xs text-[#8A8A8F]">$</span>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    max="500"
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(e.target.value)}
                    className="w-16 bg-transparent font-mono text-sm text-[#F5F5F5] outline-none"
                  />
                  <span className="font-mono text-[11px] text-[#71717A]">USD</span>
                </div>
              </div>
            </div>
          </div>

          {/* Desglose por proveedor + Historial detallado */}
          <div className="grid gap-5 lg:grid-cols-12">
            <div className="space-y-3 rounded-[12px] border border-[#232326] bg-[#111113] p-5 lg:col-span-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8A8A8F]">
                Gasto por proveedor
              </h3>
              {!ledger || ledger.by_provider.length === 0 ? (
                <p className="text-xs text-[#71717A]">
                  Aún no hay consumos registrados en la base de datos.
                </p>
              ) : (
                <div className="space-y-2">
                  {ledger.by_provider.map((row) => (
                    <div
                      key={row.provider_id}
                      className="flex items-center justify-between rounded-[8px] border border-[#1E1E22] bg-[#0C0C0E] px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-mono text-[#E4E4E7]">{row.provider_id}</p>
                        <p className="text-[10px] text-[#71717A]">{row.jobs_count} trabajo(s)</p>
                      </div>
                      <span
                        className={`font-mono font-semibold ${row.total_usd === 0 ? "text-emerald-400" : "text-amber-300"
                          }`}
                      >
                        ${row.total_usd.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-[12px] border border-[#232326] bg-[#111113] p-5 lg:col-span-7">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#8A8A8F]">
                Registro de movimientos recientes
              </h3>
              {!ledger || ledger.recent_items.length === 0 ? (
                <p className="text-xs text-[#71717A]">
                  Aquí aparecerá cada render, modelo 3D o video con su costo exacto en USD.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#1E1E22] text-[11px] text-[#71717A]">
                      <tr>
                        <th className="pb-2 pr-3">Módulo</th>
                        <th className="pb-2 pr-3">Proveedor</th>
                        <th className="pb-2 pr-3">Estado</th>
                        <th className="pb-2 text-right">Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1E1E22]">
                      {ledger.recent_items.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 pr-3 font-medium text-[#E4E4E7]">{item.kind}</td>
                          <td className="py-2 pr-3 font-mono text-[11px] text-[#8A8A8F]">
                            {item.provider_id}
                          </td>
                          <td className="py-2 pr-3 text-[11px] text-[#A1A1AA]">{item.status}</td>
                          <td
                            className={`py-2 text-right font-mono font-medium ${item.cost_usd === 0 ? "text-emerald-400" : "text-amber-300"
                              }`}
                          >
                            {item.cost_usd === 0 ? "Gratis" : `$${item.cost_usd.toFixed(2)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TestResultBanner({ result }: { result: TestProviderResult }) {
  return (
    <div
      className={`mt-2 flex items-center justify-between gap-2 rounded-[10px] border px-3.5 py-2.5 text-xs ${result.ok
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
        : "border-rose-500/30 bg-rose-500/10 text-rose-200"
        }`}
    >
      <span className="flex items-center gap-2">
        {result.ok ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
        ) : (
          <XCircle className="h-4 w-4 shrink-0 text-rose-400" />
        )}
        {result.detail}
      </span>
      <span className="shrink-0 font-mono text-[11px] opacity-80">{result.latency_ms} ms</span>
    </div>
  );
}
