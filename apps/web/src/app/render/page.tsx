"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Cloud,
  Columns2,
  Download,
  Film,
  FolderOpen,
  Grid2x2,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Loader2,
  MapPin,
  Mic,
  MicOff,
  Moon,
  Plus,
  SlidersHorizontal,
  SquareDashedMousePointer,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { AutemLoader } from "@/components/brand/autem-loader";
import { AutemLogo } from "@/components/brand/autem-logo";
import { BeforeAfterSlider } from "@/components/render/before-after-slider";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { StudioContextMenu, type ContextMenuItem } from "@/components/ui/studio-context-menu";
import {
  API_URL,
  assetFileUrl,
  createExploreRenderJobs,
  createRenderJob,
  createUpscaleJob,
  createVideoAnimateJob,
  deleteAsset,
  fetchAssets,
  fetchProviders,
  peekApiCache,
  uploadImageAsset,
  type AssetInfo,
  type JobRecord,
  type ProviderInfo,
} from "@/lib/api";
import { toast } from "@/stores/toast-store";

const STYLES = [
  { id: "photoreal", label: "Photoreal" },
  { id: "clay", label: "Clay" },
  { id: "linework", label: "Linework" },
];

const MATERIALS = [
  { id: "concrete", label: "Hormigón" },
  { id: "timber", label: "Madera" },
  { id: "brick", label: "Ladrillo" },
  { id: "stone", label: "Piedra" },
  { id: "glass_steel", label: "Vidrio y Acero" },
];

const TIME_SLOTS = [
  { id: "overcast", label: "Mañana nublada", short: "Nublado", icon: Cloud, t: 0.14 },
  { id: "midday", label: "Mediodía", short: "Mediodía", icon: Sun, t: 0.38 },
  { id: "golden_hour", label: "Atardecer", short: "Atardecer", icon: Sunset, t: 0.68 },
  { id: "night", label: "Noche", short: "Noche", icon: Moon, t: 0.9 },
];

const ENV_CHIPS = [
  "En un barrio residencial",
  "En una zona rural",
  "Frente al mar",
  "En la montaña con pinos",
  "Con jardín minimalista",
];

interface SelectionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function RenderPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const refInputRef = useRef<HTMLInputElement | null>(null);
  const imageWrapRef = useRef<HTMLDivElement | null>(null);

  const [providers, setProviders] = useState<ProviderInfo[]>(
    () => peekApiCache<ProviderInfo[]>("/api/v1/providers?kind=render") ?? []
  );
  const [libraryAssets, setLibraryAssets] = useState<AssetInfo[]>(
    () => peekApiCache<AssetInfo[]>("/api/v1/assets?kind=image") ?? []
  );
  const [showLibrary, setShowLibrary] = useState(false);

  const [projectName, setProjectName] = useState("Proyecto Exterior");
  const [folder, setFolder] = useState("Sin carpeta");

  // Source uploaded image -> automatically opens fullscreen Studio
  const [sourceAsset, setSourceAsset] = useState<AssetInfo | null>(null);
  const [referenceAssets, setReferenceAssets] = useState<AssetInfo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Studio layout controls
  const [studioMode, setStudioMode] = useState<"render" | "video">("render");
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [viewMode, setViewMode] = useState<"single" | "compare">("single");

  // Render & Real Site controls
  const [selectedProvider, setSelectedProvider] = useState("auto");
  const [resolution, setResolution] = useState("2k");
  const [style, setStyle] = useState("photoreal");
  const [material, setMaterial] = useState("concrete");
  const [lighting, setLighting] = useState("midday");
  const [location, setLocation] = useState("");
  const [prompt, setPrompt] = useState("");
  const [videoMotion, setVideoMotion] = useState("push_in");

  // Region selection (inpaint target area)
  const [selectMode, setSelectMode] = useState(false);
  const [selectionRect, setSelectionRect] = useState<SelectionRect | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);

  // Voice dictation (Web Speech API)
  const [listening, setListening] = useState(false);

  // Jobs
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [upscaling, setUpscaling] = useState(false);

  // Context menu & delete dialog
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    asset: AssetInfo;
  } | null>(null);
  const [assetPendingDelete, setAssetPendingDelete] = useState<AssetInfo | null>(null);
  const [deletingAsset, setDeletingAsset] = useState(false);

  useEffect(() => {
    Promise.all([fetchProviders("render"), fetchAssets("image")])
      .then(([provList, imgs]) => {
        setProviders(provList);
        setLibraryAssets(imgs);
      })
      .catch(() => {
        // TopBar displays connection status without spamming error toasts on route change
      });
  }, []);

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const asset = await uploadImageAsset(files[0]);
      setSourceAsset(asset);
      setLibraryAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)]);
      setProjectName(asset.filename.replace(/\.[^.]+$/, ""));
      setActiveJobId(null);
      setSelectionRect(null);
      setViewMode("single");
      toast.success({
        title: "Vista cargada en pantalla completa",
        description: "Usa el panel izquierdo o la barra inferior para editar y renderizar.",
      });
    } catch (err) {
      toast.error({
        title: "Error subiendo imagen",
        description: err instanceof Error ? err.message : "No se pudo subir el archivo.",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleReferenceUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const uploaded: AssetInfo[] = [];
      for (const file of Array.from(files).slice(0, 3 - referenceAssets.length)) {
        const asset = await uploadImageAsset(file);
        uploaded.push(asset);
      }
      setReferenceAssets((prev) => [...prev, ...uploaded].slice(0, 3));
      toast.success({
        title: "Referencia agregada",
        description: "Se usará como guía visual en tu siguiente render.",
      });
    } catch (err) {
      toast.error({
        title: "Error subiendo referencia",
        description: err instanceof Error ? err.message : "No se pudo cargar la referencia.",
      });
    } finally {
      if (refInputRef.current) refInputRef.current.value = "";
    }
  }

  function toggleVoiceDictation() {
    type SpeechRecCtor = new () => {
      lang: string;
      interimResults: boolean;
      onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
      onerror: () => void;
      onend: () => void;
      start: () => void;
    };
    const win = window as unknown as {
      SpeechRecognition?: SpeechRecCtor;
      webkitSpeechRecognition?: SpeechRecCtor;
    };
    const Rec = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Rec) {
      toast.warning({
        title: "Dictado no disponible",
        description: "Tu navegador no soporta Web Speech API. Escribe el prompt directamente.",
      });
      return;
    }
    const recognition = new Rec();
    recognition.lang = "es-ES";
    recognition.interimResults = false;
    setListening(true);
    recognition.onresult = (e) => {
      const spoken = e.results[0]?.[0]?.transcript ?? "";
      if (spoken) {
        setPrompt((prev) => (prev ? `${prev}, ${spoken}` : spoken));
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
  }

  function subscribeJob(jobId: string, onDone: () => void) {
    const source = new EventSource(`${API_URL}/api/v1/jobs/${jobId}/events`);
    source.onmessage = (event) => {
      const snapshot: JobRecord = JSON.parse(event.data);
      setJobs((prev) =>
        prev.some((j) => j.id === snapshot.id)
          ? prev.map((j) => (j.id === snapshot.id ? snapshot : j))
          : [snapshot, ...prev]
      );
      if (snapshot.status === "succeeded") {
        source.close();
        onDone();
        toast.success({
          title: snapshot.kind === "video" ? "Video animado listo" : "Render listo",
          description: `${snapshot.provider_id} · ${snapshot.message}`,
        });
      } else if (snapshot.status === "failed" || snapshot.status === "canceled") {
        source.close();
        onDone();
        if (snapshot.error) {
          toast.error({
            title: "Error en la generación",
            description: snapshot.error,
            actionLabel: "Configurar proveedor",
            actionHref: "/settings",
          });
        }
      }
    };
    source.onerror = () => {
      source.close();
      onDone();
    };
  }

  function buildFullPrompt(): string {
    const parts: string[] = [];
    parts.push(
      prompt.trim() ||
        `Architectural visualization of ${projectName}, sharp reflections, realistic proportions`
    );
    if (location.trim()) parts.push(`Site location and environment: ${location.trim()}`);
    if (selectionRect) {
      parts.push(
        `Focus edits on selected region (${Math.round(selectionRect.x)}%, ${Math.round(
          selectionRect.y
        )}%)`
      );
    }
    if (referenceAssets.length > 0) {
      parts.push(`Match material palette of ${referenceAssets.length} reference image(s)`);
    }
    return parts.join(". ");
  }

  async function handleGenerate() {
    if (!sourceAsset) return;

    if (studioMode === "video") {
      setSubmitting(true);
      try {
        const targetId = activeOutputPngId ?? sourceAsset.id;
        const created = await createVideoAnimateJob({
          assetId: targetId,
          prompt: buildFullPrompt(),
          cameraMotion: videoMotion,
          seconds: 5,
          providerId: "auto",
        });
        setJobs((prev) => [created, ...prev]);
        setActiveJobId(created.id);
        subscribeJob(created.id, () => setSubmitting(false));
      } catch (err) {
        toast.error({
          title: "Motor de video no configurado",
          description: err instanceof Error ? err.message : "Configura FAL_KEY o ComfyUI local.",
          actionLabel: "Configurar proveedor",
          actionHref: "/settings",
        });
        setSubmitting(false);
      }
      return;
    }

    const chosen =
      selectedProvider === "auto"
        ? providers.find((p) => p.available)
        : providers.find((p) => p.id === selectedProvider && p.available);

    if (!chosen) {
      toast.warning({
        title: "Proveedor no configurado",
        description: "El motor elegido no está activo. Configura su clave o selecciona Auto.",
        actionLabel: "Configurar proveedor",
        actionHref: "/settings",
      });
      return;
    }

    setSubmitting(true);
    try {
      const created = await createRenderJob({
        assetId: sourceAsset.id,
        prompt: buildFullPrompt(),
        style,
        material,
        lighting,
        resolution,
        providerId: selectedProvider,
      });
      setJobs((prev) => [created, ...prev]);
      setActiveJobId(created.id);
      subscribeJob(created.id, () => setSubmitting(false));
    } catch (err) {
      toast.error({
        title: "No se pudo lanzar el render",
        description: err instanceof Error ? err.message : "Error iniciando el render.",
        actionLabel: "Configurar proveedor",
        actionHref: "/settings",
      });
      setSubmitting(false);
    }
  }

  async function handleExplore4x() {
    if (!sourceAsset) return;
    setSubmitting(true);
    try {
      const created = await createExploreRenderJobs({
        assetId: sourceAsset.id,
        prompt: buildFullPrompt(),
        providerId: selectedProvider,
      });
      setJobs((prev) => [...created, ...prev]);
      setActiveJobId(created[0]?.id ?? null);
      let remaining = created.length;
      for (const item of created) {
        subscribeJob(item.id, () => {
          remaining -= 1;
          if (remaining <= 0) setSubmitting(false);
        });
      }
    } catch (err) {
      toast.error({
        title: "Error generando variaciones",
        description: err instanceof Error ? err.message : "Error lanzando Explore 4x.",
        actionLabel: "Configurar proveedor",
        actionHref: "/settings",
      });
      setSubmitting(false);
    }
  }

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? null;
  const activeOutputPngId = activeJob?.output_assets.png ?? null;
  const activeOutputMp4Id = activeJob?.output_assets.mp4 ?? activeJob?.output_assets.webp ?? null;
  const isJobRunning =
    activeJob !== null && ["queued", "running"].includes(activeJob.status);

  async function handleConfirmDeleteAsset() {
    if (!assetPendingDelete) return;
    const target = assetPendingDelete;
    setDeletingAsset(true);
    try {
      await deleteAsset(target.id);
      setLibraryAssets((prev) => prev.filter((a) => a.id !== target.id));
      if (sourceAsset?.id === target.id) {
        setSourceAsset(null);
        setActiveJobId(null);
      }
      setAssetPendingDelete(null);
      toast.success({
        title: "Imagen eliminada",
        description: `${target.filename} se eliminó de tu biblioteca.`,
      });
    } catch (err) {
      toast.error({
        title: "No se pudo eliminar la imagen",
        description: err instanceof Error ? err.message : "Inténtalo nuevamente.",
      });
    } finally {
      setDeletingAsset(false);
    }
  }

  function openAssetContextMenu(e: React.MouseEvent, asset: AssetInfo) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, asset });
  }

  const contextMenuItems: ContextMenuItem[] = contextMenu
    ? [
        {
          id: "replace",
          label: "Cambiar imagen",
          icon: <ImageIcon className="size-3.5" />,
          onSelect: () => fileInputRef.current?.click(),
        },
        {
          id: "download",
          label: "Descargar imagen",
          icon: <Download className="size-3.5" />,
          onSelect: () => {
            const link = document.createElement("a");
            link.href = assetFileUrl(contextMenu.asset.id);
            link.download = contextMenu.asset.filename;
            link.click();
          },
        },
        ...(sourceAsset && sourceAsset.id === contextMenu.asset.id
          ? [
              {
                id: "detach",
                label: "Salir a selección de imagen",
                icon: <X className="size-3.5" />,
                dividerBefore: true,
                onSelect: () => {
                  setSourceAsset(null);
                  setActiveJobId(null);
                },
              },
            ]
          : []),
        {
          id: "delete",
          label: "Eliminar imagen...",
          icon: <Trash2 className="size-3.5" />,
          danger: true,
          dividerBefore: !(sourceAsset && sourceAsset.id === contextMenu.asset.id),
          onSelect: () => setAssetPendingDelete(contextMenu.asset),
        },
      ]
    : [];

  async function handleUpscale() {
    const targetId = activeOutputPngId ?? sourceAsset?.id;
    if (!targetId) return;
    setUpscaling(true);
    try {
      const upJob = await createUpscaleJob({ assetId: targetId, scale: 2 });
      setJobs((prev) => [upJob, ...prev]);
      setActiveJobId(upJob.id);
      subscribeJob(upJob.id, () => setUpscaling(false));
    } catch (err) {
      toast.error({
        title: "Upscale no disponible",
        description: err instanceof Error ? err.message : "Configura FAL_KEY para Clarity Upscaler.",
        actionLabel: "Configurar proveedor",
        actionHref: "/settings",
      });
      setUpscaling(false);
    }
  }

  function handleCanvasMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!selectMode || !imageWrapRef.current) return;
    const rect = imageWrapRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDragStart({ x, y });
    setSelectionRect({ x, y, w: 0, h: 0 });
  }

  function handleCanvasMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!selectMode || !dragStart || !imageWrapRef.current) return;
    const rect = imageWrapRef.current.getBoundingClientRect();
    const curX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const curY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setSelectionRect({
      x: Math.min(dragStart.x, curX),
      y: Math.min(dragStart.y, curY),
      w: Math.abs(curX - dragStart.x),
      h: Math.abs(curY - dragStart.y),
    });
  }

  function handleCanvasMouseUp() {
    if (!dragStart) return;
    setDragStart(null);
    if (selectionRect && (selectionRect.w < 2 || selectionRect.h < 2)) {
      setSelectionRect(null);
    }
  }

  const activeProviderInfo =
    selectedProvider === "auto"
      ? providers.find((p) => p.available) ?? providers[0] ?? null
      : providers.find((p) => p.id === selectedProvider) ?? null;

  const currentTimeSlot = TIME_SLOTS.find((s) => s.id === lighting) ?? TIME_SLOTS[1];

  // =========================================================================
  // PANTALLA 1: SUBIR VISTA DE TU MODELO
  // =========================================================================
  if (!sourceAsset) {
    return (
      <div className="mx-auto flex min-h-[78vh] max-w-2xl flex-col items-center justify-center py-8">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => void handleFileUpload(e.target.files)}
        />

        <div className="mb-6 flex items-center justify-center">
          <div className="relative flex h-20 w-44 items-center justify-center">
            <div className="absolute left-3 -rotate-6 rounded-[10px] border border-[#2A2A2F] bg-[#141418] p-3.5 shadow-xl">
              <Layers className="h-6 w-6 text-[#71717A]" />
            </div>
            <div className="relative z-10 rounded-[12px] border border-[#F97316]/40 bg-gradient-to-b from-[#1A1816] to-[#111113] p-4 shadow-[0_12px_32px_rgba(249,115,22,0.18)]">
              <ImageIcon className="h-7 w-7 text-[#FF9F0A]" />
            </div>
            <div className="absolute right-3 rotate-6 rounded-[10px] border border-[#2A2A2F] bg-[#141418] p-3.5 shadow-xl">
              <Sunrise className="h-6 w-6 text-[#71717A]" />
            </div>
          </div>
        </div>

        <h1 className="text-center text-3xl font-bold tracking-tight text-[#F5F5F5]">
          Sube una vista de tu modelo
        </h1>
        <p className="mt-2 text-center text-sm text-[#8A8A8F]">
          Bocetos a mano · Vistas 3D · Mejora de renders
        </p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5 text-xs text-[#A1A1AA]">
          <span>Guardar en</span>
          <select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className="rounded-[8px] border border-[#27272A] bg-[#111113] px-2.5 py-1.5 text-xs text-[#F5F5F5] outline-none focus:border-[#F97316]"
          >
            <option value="Sin carpeta">Sin carpeta</option>
            <option value="Exteriores">Exteriores</option>
            <option value="Interiores">Interiores</option>
            <option value="Anteproyecto">Anteproyecto</option>
          </select>
          <span>como</span>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Nombre del proyecto"
            className="w-48 rounded-[8px] border border-[#27272A] bg-[#111113] px-3 py-1.5 text-xs text-[#F5F5F5] outline-none focus:border-[#F97316]"
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFileUpload(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`mt-6 flex h-48 w-full cursor-pointer flex-col items-center justify-center rounded-[14px] border border-dashed px-6 text-center transition-all ${
            dragging
              ? "border-[#F97316] bg-[#F97316]/10"
              : "border-[#2F2F35] bg-[#0F0F12]/90 hover:border-[#52525B] hover:bg-[#131317]"
          }`}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-full border border-[#2A2A2F] bg-[#18181C] text-[#F5F5F5]">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-[#F97316]" />
            ) : (
              <Upload className="h-5 w-5" />
            )}
          </div>
          <p className="mt-3 text-sm font-semibold text-[#F5F5F5]">
            {uploading ? "Cargando imagen al estudio..." : "Arrastra y suelta o haz clic para subir"}
          </p>
          <p className="mt-1 font-mono text-[11px] text-[#71717A]">
            PNG · JPEG · WebP — hasta 20 MB
          </p>
        </div>

        <div className="mt-4 flex items-center gap-5 text-xs text-[#8A8A8F]">
          <button
            type="button"
            onClick={() => setShowLibrary((v) => !v)}
            className="inline-flex items-center gap-1.5 transition hover:text-[#F5F5F5]"
          >
            <FolderOpen className="h-3.5 w-3.5 text-[#F97316]" />
            Elegir de tu biblioteca ({libraryAssets.length})
          </button>
        </div>

        {showLibrary && (
          <div className="mt-4 w-full rounded-[12px] border border-[#232326] bg-[#111113] p-4">
            {libraryAssets.length === 0 ? (
              <p className="text-center text-xs text-[#71717A]">
                Todavía no has subido imágenes a tu biblioteca.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {libraryAssets.slice(0, 8).map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => {
                      setSourceAsset(asset);
                      setProjectName(asset.filename.replace(/\.[^.]+$/, ""));
                    }}
                    onContextMenu={(e) => openAssetContextMenu(e, asset)}
                    title={`${asset.filename} (clic derecho para más opciones)`}
                    className="group overflow-hidden rounded-[8px] border border-[#232326] bg-[#0A0A0B] transition hover:border-[#F97316]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetFileUrl(asset.id)}
                      alt={asset.filename}
                      className="h-20 w-full object-cover transition group-hover:scale-105"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <StudioContextMenu
          position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
        <ConfirmDeleteDialog
          open={assetPendingDelete !== null}
          title="¿Eliminar esta imagen?"
          description="Se eliminará permanentemente de tu biblioteca y del servidor."
          itemName={assetPendingDelete?.filename}
          itemMeta={
            assetPendingDelete
              ? `${(assetPendingDelete.size / (1024 * 1024)).toFixed(2)} MB · ${assetPendingDelete.mime.replace("image/", "").toUpperCase()}`
              : undefined
          }
          previewUrl={assetPendingDelete ? assetFileUrl(assetPendingDelete.id) : null}
          deleting={deletingAsset}
          confirmLabel="Eliminar del servidor"
          onClose={() => {
            if (!deletingAsset) setAssetPendingDelete(null);
          }}
          onConfirm={handleConfirmDeleteAsset}
        />
      </div>
    );
  }

  // =========================================================================
  // PANTALLA 2: ESTUDIO FULLSCREEN CON PANEL COLAPSABLE + BARRA INFERIOR
  // =========================================================================
  const displayedImageUrl = activeOutputPngId
    ? assetFileUrl(activeOutputPngId)
    : assetFileUrl(sourceAsset.id);

  return (
    <div className="fixed inset-0 z-40 flex h-screen w-screen flex-col overflow-hidden bg-[#0A0A0B]">
      {/* Cuadrícula arquitectónica sutil del estudio Autem Render */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-45"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void handleFileUpload(e.target.files)}
      />
      <input
        ref={refInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void handleReferenceUpload(e.target.files)}
      />

      <StudioContextMenu
        position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        items={contextMenuItems}
        onClose={() => setContextMenu(null)}
      />
      <ConfirmDeleteDialog
        open={assetPendingDelete !== null}
        title="¿Eliminar esta imagen?"
        description="Puedes salir a la selección de imagen o eliminarla permanentemente del servidor."
        itemName={assetPendingDelete?.filename}
        itemMeta={
          assetPendingDelete
            ? `${(assetPendingDelete.size / (1024 * 1024)).toFixed(2)} MB · ${assetPendingDelete.mime.replace("image/", "").toUpperCase()}`
            : undefined
        }
        previewUrl={assetPendingDelete ? assetFileUrl(assetPendingDelete.id) : null}
        deleting={deletingAsset}
        secondaryLabel="Solo quitar de aquí"
        confirmLabel="Eliminar del servidor"
        onClose={() => {
          if (!deletingAsset) setAssetPendingDelete(null);
        }}
        onSecondaryAction={() => {
          setSourceAsset(null);
          setActiveJobId(null);
          setAssetPendingDelete(null);
        }}
        onConfirm={handleConfirmDeleteAsset}
      />

      {/* Barra superior flotante edge-to-edge con identidad Autem Render */}
      <div className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b border-[#1E1E22] bg-[#0C0C0E]/95 px-5 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setSourceAsset(null);
              setActiveJobId(null);
            }}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#232326] bg-[#111113] text-[#A1A1AA] transition hover:border-[#3A3A40] hover:text-[#F5F5F5]"
            title="Salir a selección de imagen"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <AutemLogo size={26} />

          <button
            type="button"
            onClick={() => setShowLeftPanel((v) => !v)}
            className={`flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-xs font-medium transition ${
              showLeftPanel
                ? "border-[#F97316]/50 bg-[#F97316]/15 text-[#FF9F0A]"
                : "border-[#232326] bg-[#111113] text-[#A1A1AA] hover:text-[#F5F5F5]"
            }`}
            title="Mostrar u ocultar panel de parámetros"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Ajustes
          </button>

          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="rounded-[8px] border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-[#F5F5F5] outline-none focus:border-[#232326] focus:bg-[#111113]"
          />
        </div>

        {/* Selector central Render / Video / Comparar / Explorar */}
        <div className="flex items-center gap-1 rounded-full border border-[#27272A] bg-[#111113]/95 p-1">
          <button
            type="button"
            onClick={() => {
              setStudioMode("render");
              setViewMode("single");
            }}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              studioMode === "render" && viewMode === "single"
                ? "bg-[#232329] text-[#F5F5F5]"
                : "text-[#8A8A8F] hover:text-[#E4E4E7]"
            }`}
          >
            Render
          </button>
          <button
            type="button"
            onClick={() => {
              setStudioMode("video");
              setViewMode("single");
            }}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition ${
              studioMode === "video"
                ? "bg-[#232329] text-[#F5F5F5]"
                : "text-[#8A8A8F] hover:text-[#E4E4E7]"
            }`}
          >
            <Film className="h-3.5 w-3.5" />
            Video
          </button>
          <button
            type="button"
            disabled={!activeOutputPngId}
            onClick={() => {
              setStudioMode("render");
              setViewMode("compare");
            }}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-40 ${
              viewMode === "compare"
                ? "bg-[#232329] text-[#F5F5F5]"
                : "text-[#8A8A8F] hover:text-[#E4E4E7]"
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            Antes / Después
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleExplore4x()}
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium text-[#8A8A8F] transition hover:text-[#FF9F0A] disabled:opacity-40"
          >
            <Grid2x2 className="h-3.5 w-3.5" />
            Explorar 4x
          </button>
        </div>

        {/* Acciones derecha */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleUpscale()}
            disabled={upscaling || submitting}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#27272A] bg-[#16161A] px-3 text-xs font-medium text-[#E4E4E7] transition hover:border-[#F97316] disabled:opacity-50"
          >
            <ArrowUpRight className="h-3.5 w-3.5 text-[#F97316]" />
            {upscaling ? "Mejorando..." : "Upscale 2x"}
          </button>
          <a
            href={activeOutputMp4Id ? assetFileUrl(activeOutputMp4Id) : displayedImageUrl}
            download={`${projectName}.${activeOutputMp4Id ? "mp4" : "png"}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#27272A] bg-[#16161A] px-3 text-xs font-medium text-[#F5F5F5] transition hover:border-[#F97316]"
          >
            <Download className="h-3.5 w-3.5 text-[#F97316]" />
            {activeOutputMp4Id ? "MP4" : "PNG"}
          </a>
        </div>
      </div>

      {/* Área principal del Estudio */}
      <div className="relative z-10 flex min-h-0 flex-1 items-center justify-center px-5 pb-28 pt-4">
        {/* PANEL FLOTANTE IZQUIERDO (COLAPSABLE) */}
        {showLeftPanel && (
          <aside className="absolute left-5 top-1/2 z-20 hidden w-[290px] -translate-y-1/2 space-y-3.5 rounded-[14px] border border-white/[0.08] bg-[#111114]/92 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.55)] backdrop-blur-xl lg:block">
            {studioMode === "render" ? (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    className="rounded-[8px] border border-[#27272A] bg-[#18181D] px-2 py-1.5 text-[11px] font-medium text-[#F5F5F5] outline-none focus:border-[#F97316]"
                  >
                    {STYLES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>

                  <select
                    value={resolution}
                    onChange={(e) => setResolution(e.target.value)}
                    className="rounded-[8px] border border-[#27272A] bg-[#18181D] px-2 py-1.5 text-[11px] font-medium text-[#F5F5F5] outline-none focus:border-[#F97316]"
                  >
                    <option value="1k">1K</option>
                    <option value="2k">2K</option>
                    <option value="4k">4K</option>
                  </select>

                  <select
                    value={selectedProvider}
                    onChange={(e) => setSelectedProvider(e.target.value)}
                    className="rounded-[8px] border border-[#27272A] bg-[#18181D] px-2 py-1.5 text-[11px] font-medium text-[#F5F5F5] outline-none focus:border-[#F97316]"
                  >
                    <option value="auto">Auto</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label.split("(")[0].trim()}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Establecer ubicación (Real Site) */}
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Establecer ubicación (ej. Medellín, costa...)"
                    className="w-full rounded-[8px] border border-[#27272A] bg-[#0B0B0E] py-1.5 pl-8 pr-3 text-xs text-[#F5F5F5] placeholder-[#71717A] outline-none focus:border-[#F97316]"
                  />
                </div>

                {/* Curva solar interactiva */}
                <div className="space-y-1.5 rounded-[10px] border border-[#232329] bg-[#0B0B0E]/80 p-3">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#8A8A8F]">Hora del día</span>
                    <span className="font-semibold text-[#F5F5F5]">{currentTimeSlot.label}</span>
                  </div>

                  <svg viewBox="0 0 240 42" className="h-8 w-full overflow-visible">
                    <defs>
                      <linearGradient id="sunArc" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#94A3B8" />
                        <stop offset="40%" stopColor="#FBBF24" />
                        <stop offset="70%" stopColor="#F97316" />
                        <stop offset="100%" stopColor="#3B82F6" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M 10 34 Q 120 2 230 34"
                      fill="none"
                      stroke="url(#sunArc)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    {(() => {
                      const t = currentTimeSlot.t;
                      const x = (1 - t) * (1 - t) * 10 + 2 * (1 - t) * t * 120 + t * t * 230;
                      const y = (1 - t) * (1 - t) * 34 + 2 * (1 - t) * t * 2 + t * t * 34;
                      return (
                        <g>
                          <circle cx={x} cy={y} r="9" fill="#FF9F0A" fillOpacity="0.22" />
                          <circle
                            cx={x}
                            cy={y}
                            r="4.5"
                            fill="#FFF7ED"
                            stroke="#F97316"
                            strokeWidth="1.5"
                          />
                        </g>
                      );
                    })()}
                  </svg>

                  <div className="grid grid-cols-4 gap-1">
                    {TIME_SLOTS.map((slot) => {
                      const Icon = slot.icon;
                      const active = lighting === slot.id;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setLighting(slot.id)}
                          className={`flex flex-col items-center gap-0.5 rounded-[8px] py-1 text-[10px] transition ${
                            active
                              ? "bg-[#F97316]/15 font-semibold text-[#FF9F0A]"
                              : "text-[#71717A] hover:bg-[#18181E] hover:text-[#E4E4E7]"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {slot.short}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Materiales */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-[#8A8A8F]">Material predominante</span>
                  <div className="flex flex-wrap gap-1.5">
                    {MATERIALS.map((mat) => (
                      <button
                        key={mat.id}
                        type="button"
                        onClick={() => setMaterial(mat.id)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                          material === mat.id
                            ? "border-[#F97316] bg-[#F97316]/15 font-medium text-[#FF9F0A]"
                            : "border-[#27272A] bg-[#16161B] text-[#A1A1AA] hover:border-[#3F3F46]"
                        }`}
                      >
                        {mat.label}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[#F5F5F5]">Animar este render (5s)</p>
                <div className="space-y-1.5">
                  {[
                    { id: "push_in", label: "Zoom suave (Push-in)" },
                    { id: "pan_right", label: "Paneo lateral" },
                    { id: "orbit", label: "Órbita arquitectónica" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setVideoMotion(m.id)}
                      className={`w-full rounded-[8px] border px-3 py-2 text-left text-xs transition ${
                        videoMotion === m.id
                          ? "border-[#F97316] bg-[#F97316]/15 font-medium text-[#FF9F0A]"
                          : "border-[#27272A] bg-[#16161B] text-[#A1A1AA]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="border-t border-[#1E1E22] pt-2.5 text-center font-mono text-[10px] text-[#71717A]">
              {activeProviderInfo
                ? `${activeProviderInfo.label.split("(")[0].trim()} · ${
                    activeProviderInfo.est_cost_usd === 0
                      ? "Gratis ($0.00)"
                      : `~$${(activeProviderInfo.est_cost_usd ?? 0).toFixed(2)} USD`
                  }`
                : "Sin proveedor activo"}
            </p>
          </aside>
        )}

        {/* CANVAS CENTRAL */}
        <div className="relative flex h-full w-full items-center justify-center">
          {viewMode === "compare" && activeOutputPngId ? (
            <div className="w-full max-w-4xl">
              <BeforeAfterSlider
                beforeUrl={assetFileUrl(sourceAsset.id)}
                afterUrl={assetFileUrl(activeOutputPngId)}
                title={projectName}
                subtitle={activeJob ? `${activeJob.provider_id} · ${activeJob.message}` : undefined}
                onUpscale={() => void handleUpscale()}
                upscaling={upscaling}
              />
            </div>
          ) : activeOutputMp4Id && studioMode === "video" ? (
            <video
              src={assetFileUrl(activeOutputMp4Id)}
              controls
              autoPlay
              loop
              className="max-h-[74vh] rounded-[16px] border border-white/[0.08] shadow-[0_30px_80px_rgba(0,0,0,0.65)]"
            />
          ) : (
            <div
              ref={imageWrapRef}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onContextMenu={(e) => openAssetContextMenu(e, sourceAsset)}
              className={`relative select-none overflow-hidden rounded-[16px] border border-white/[0.08] bg-[#0B0B0E] shadow-[0_30px_80px_rgba(0,0,0,0.65)] ${
                selectMode ? "cursor-crosshair" : ""
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={displayedImageUrl}
                alt={projectName}
                draggable={false}
                className="max-h-[72vh] w-auto max-w-full object-contain"
              />

              {/* Caja de selección de región (Inpaint / Editar zona) */}
              {selectionRect && selectionRect.w > 1 && selectionRect.h > 1 && (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-[#FF9F0A] bg-[#F97316]/15 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
                  style={{
                    left: `${selectionRect.x}%`,
                    top: `${selectionRect.y}%`,
                    width: `${selectionRect.w}%`,
                    height: `${selectionRect.h}%`,
                  }}
                >
                  <span className="absolute -top-6 left-0 rounded bg-[#F97316] px-1.5 py-0.5 text-[10px] font-semibold text-[#0A0A0B]">
                    Zona seleccionada
                  </span>
                </div>
              )}

              {/* Overlay AutemLoader mientras procesa */}
              {isJobRunning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0A0A0B]/80 backdrop-blur-sm">
                  <AutemLoader
                    title={activeJob?.message ?? "Generando render arquitectónico..."}
                    subtitle={activeJob?.provider_id}
                    progress={Math.round((activeJob?.progress ?? 0.2) * 100)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* RAIL FLOTANTE DERECHO */}
        <aside className="absolute right-5 top-1/2 z-20 hidden w-[96px] -translate-y-1/2 flex-col gap-2 rounded-[14px] border border-white/[0.08] bg-[#111114]/92 p-2 shadow-xl backdrop-blur-xl lg:flex">
          <button
            type="button"
            onClick={() => {
              setActiveJobId(null);
              setViewMode("single");
            }}
            className={`relative h-[74px] w-full overflow-hidden rounded-[10px] border transition ${
              activeJobId === null
                ? "border-[#F97316] ring-1 ring-[#F97316]/50"
                : "border-[#27272A] opacity-80 hover:opacity-100"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assetFileUrl(sourceAsset.id)}
              alt="Original"
              className="h-full w-full object-cover"
            />
            <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] font-medium text-[#F5F5F5]">
              Original
            </span>
          </button>

          {jobs.slice(0, 5).map((item, idx) => {
            const pngId = item.output_assets.png;
            const isSel = activeJobId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveJobId(item.id)}
                className={`relative flex h-[74px] w-full items-center justify-center overflow-hidden rounded-[10px] border bg-[#18181D] transition ${
                  isSel
                    ? "border-[#F97316] ring-1 ring-[#F97316]/50"
                    : "border-[#27272A] opacity-85 hover:opacity-100"
                }`}
              >
                {pngId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetFileUrl(pngId)}
                    alt={`Render ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-[#F97316]" />
                )}
                <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[9px] text-[#FF9F0A]">
                  #{jobs.length - idx}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-[74px] w-full flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-[#32323A] bg-[#16161B] text-[10px] font-medium text-[#A1A1AA] transition hover:border-[#F97316] hover:text-[#F5F5F5]"
          >
            <Plus className="h-4 w-4" />
            Perspectiva
          </button>
        </aside>

        {/* BARRA FLOTANTE INFERIOR CONVERSACIONAL (DOCK 2-TIER LIMPIO) */}
        <div className="absolute bottom-4 left-1/2 z-30 flex w-[94%] max-w-[780px] -translate-x-1/2 flex-col gap-2">
          {/* Chips sutiles de entorno rápido flotando arriba del dock */}
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {ENV_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setPrompt((prev) => (prev ? `${prev}, ${chip}` : chip))}
                className="rounded-full border border-white/[0.08] bg-[#111114]/85 px-2.5 py-1 text-[11px] text-[#A1A1AA] backdrop-blur-md transition hover:border-[#F97316]/60 hover:bg-[#18181D] hover:text-[#F5F5F5]"
              >
                + {chip}
              </button>
            ))}
          </div>

          {/* Tarjeta principal del compositor: Fila 1 = Input ancho completo | Fila 2 = Herramientas + CTA */}
          <div className="overflow-hidden rounded-[16px] border border-white/[0.1] bg-[#111114]/95 shadow-[0_24px_64px_rgba(0,0,0,0.8)] backdrop-blur-xl">
            {/* Badges de contexto activo (Referencias / Región) */}
            {(referenceAssets.length > 0 || selectionRect) && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-white/[0.06] bg-[#0D0D10]/70 px-3.5 py-2">
                {referenceAssets.map((ref) => (
                  <span
                    key={ref.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#F97316]/40 bg-[#F97316]/10 py-0.5 pl-1 pr-2 text-[11px] text-[#FF9F0A]"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={assetFileUrl(ref.id)}
                      alt={ref.filename}
                      className="h-4 w-4 rounded-full object-cover"
                    />
                    <span className="max-w-[110px] truncate">{ref.filename}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setReferenceAssets((prev) => prev.filter((item) => item.id !== ref.id))
                      }
                      className="hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}

                {selectionRect && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F97316]/40 bg-[#F97316]/15 px-2.5 py-0.5 text-[11px] font-medium text-[#FF9F0A]">
                    Zona seleccionada ({Math.round(selectionRect.w)}% × {Math.round(selectionRect.h)}%)
                    <button
                      type="button"
                      onClick={() => setSelectionRect(null)}
                      className="hover:text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
            )}

            {/* Fila 1: Input limpio de ancho completo (nunca se corta el texto) */}
            <div className="px-4 pt-3 pb-2.5">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !submitting) {
                    e.preventDefault();
                    void handleGenerate();
                  }
                }}
                placeholder={
                  studioMode === "video"
                    ? "Describe el movimiento de cámara o ambiente del video..."
                    : "Describe los cambios arquitectónicos (ej. fachada en madera cálida, jardín minimalista, atardecer)..."
                }
                className="w-full bg-transparent text-sm text-[#F5F5F5] placeholder-[#71717A] outline-none"
              />
            </div>

            {/* Fila 2: Barra de herramientas separada a la izquierda + Motor y botón Generar a la derecha */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-[#0D0D10]/60 px-3 py-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => refInputRef.current?.click()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#27272A] bg-[#16161B] px-2.5 text-xs font-medium text-[#D4D4D8] transition hover:border-[#F97316]/60 hover:text-[#F5F5F5]"
                  title="Subir imagen de referencia de material o estilo"
                >
                  <ImagePlus className="h-3.5 w-3.5 text-[#F97316]" />
                  Referencias
                </button>

                <button
                  type="button"
                  onClick={() => setSelectMode((v) => !v)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-xs font-medium transition ${
                    selectMode
                      ? "border-[#F97316] bg-[#F97316]/20 text-[#FF9F0A]"
                      : "border-[#27272A] bg-[#16161B] text-[#D4D4D8] hover:border-[#F97316]/60 hover:text-[#F5F5F5]"
                  }`}
                  title="Arrastra sobre la imagen para marcar una zona a editar"
                >
                  <SquareDashedMousePointer className="h-3.5 w-3.5" />
                  {selectMode ? "Marcando zona..." : "Seleccionar zona"}
                </button>

                <button
                  type="button"
                  onClick={toggleVoiceDictation}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-[8px] border px-2.5 text-xs font-medium transition ${
                    listening
                      ? "border-rose-500 bg-rose-500/20 text-rose-300"
                      : "border-[#27272A] bg-[#16161B] text-[#A1A1AA] hover:text-[#F5F5F5]"
                  }`}
                  title="Dictar cambios por voz"
                >
                  {listening ? (
                    <MicOff className="h-3.5 w-3.5" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
                  <span className="hidden sm:inline">{listening ? "Escuchando..." : "Voz"}</span>
                </button>
              </div>

              <div className="flex items-center gap-2.5">
                {activeProviderInfo && (
                  <span className="hidden font-mono text-[11px] text-[#71717A] sm:inline">
                    {activeProviderInfo.label.split("(")[0].trim()} ·{" "}
                    <span
                      className={
                        activeProviderInfo.est_cost_usd === 0
                          ? "text-emerald-400"
                          : "text-amber-300"
                      }
                    >
                      {activeProviderInfo.est_cost_usd === 0
                        ? "Gratis"
                        : `$${(activeProviderInfo.est_cost_usd ?? 0).toFixed(2)}`}
                    </span>
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => void handleGenerate()}
                  disabled={submitting}
                  className="btn-primary inline-flex h-8 items-center gap-1.5 rounded-[8px] px-4 text-xs font-semibold transition disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <>
                      {studioMode === "video" ? "Animar" : "Generar"}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
