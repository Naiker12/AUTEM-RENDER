"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Box,
  Camera,
  Check,
  ChevronDown,
  Cloud,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FolderOpen,
  Globe,
  Layers,
  Maximize2,
  Minimize2,
  Moon,
  PersonStanding,
  RotateCcw,
  Share2,
  Sparkles,
  Sun,
  Sunrise,
  Upload,
  X,
} from "lucide-react";
import { cn } from "cn";
import { AutemLoader } from "@/components/brand/autem-loader";
import type {
  OrbitCanvasHandle,
  SceneEnvironmentMode,
  SceneLightingPreset,
  SceneShadingMode,
} from "@/components/viewer3d/orbit-canvas";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FriendlyErrorAlert } from "@/components/ui/friendly-error";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  API_URL,
  addSceneView,
  assetFileUrl,
  createScene,
  createShareLink,
  fetchJob,
  fetchScenes,
  sceneExportHtmlUrl,
  uploadImageAsset,
  type CameraSpec,
  type JobRecord,
  type SceneRecord,
  type SceneViewRecord,
} from "@/lib/api";

const OrbitCanvas = dynamic(
  () => import("@/components/viewer3d/orbit-canvas").then((m) => m.OrbitCanvas),
  { ssr: false }
);

type SoftwareTabId = "sketchup" | "revit" | "rhino" | "other";

const SOFTWARE_GUIDES: {
  id: SoftwareTabId;
  label: string;
  steps: React.ReactNode[];
  helpQuestion: string;
  helpAnswer: string;
}[] = [
  {
    id: "sketchup",
    label: "SketchUp",
    steps: [
      <>
        En la barra de menú ve a <strong className="text-white">Archivo → Guardar</strong> o{" "}
        <strong className="text-white">Exportar → Modelo 3D (.glb / .obj)</strong>
      </>,
      <>
        Sube tu archivo <strong className="text-white">.glb / .obj</strong> directamente para
        orbitarlo sobre el terreno.
      </>,
    ],
    helpQuestion: "¿No puedes subir tu .skp?",
    helpAnswer:
      "En SketchUp ve a Archivo → Exportar → Modelo 3D y selecciona archivo GLB (*.glb) u OBJ (*.obj) para conservar todos tus materiales.",
  },
  {
    id: "revit",
    label: "Revit",
    steps: [
      <>
        Abre una vista 3D y ve a{" "}
        <strong className="text-white">Archivo → Exportar → Formatos CAD → OBJ</strong>
      </>,
      <>
        Elige <strong className="text-white">Metros</strong> como unidad y sube el archivo (o un
        ZIP con sus texturas).
      </>,
    ],
    helpQuestion: "¿Cómo incluir las texturas desde Revit?",
    helpAnswer:
      "Comprime en un archivo .ZIP el archivo .obj, el .mtl y la carpeta de texturas exportada por Revit y súbelo directamente.",
  },
  {
    id: "rhino",
    label: "Rhino",
    steps: [
      <>
        Selecciona tu geometría y ve a{" "}
        <strong className="text-white">Archivo → Exportar selección</strong>
      </>,
      <>
        Elige formato <strong className="text-white">glTF / GLB (.glb)</strong> o{" "}
        <strong className="text-white">OBJ (.obj)</strong> y súbelo al visor.
      </>,
    ],
    helpQuestion: "¿Cómo se orienta el modelo en el terreno?",
    helpAnswer:
      "Autem Render centra automáticamente tu geometría y apoya su base sobre la cota 0 del terreno.",
  },
  {
    id: "other",
    label: "Otro",
    steps: [
      <>
        Desde Blender, Archicad, 3ds Max o AutoCAD exporta tu proyecto a{" "}
        <strong className="text-white">.glb, .gltf, .obj</strong> o{" "}
        <strong className="text-white">.stl</strong>
      </>,
      <>
        Para incluir texturas de un OBJ, sube un <strong className="text-white">ZIP</strong> con
        el OBJ, el MTL y las imágenes.
      </>,
    ],
    helpQuestion: "¿Cuál formato da mejor calidad visual?",
    helpAnswer:
      "El formato .GLB empaqueta geometría, materiales PBR y texturas en un único archivo ligero.",
  },
];

function SoftwareTabIcon({ id }: { id: SoftwareTabId }) {
  if (id === "sketchup") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0">
        <path
          d="M8 1.5L14 4.8V11.2L8 14.5L2 11.2V4.8L8 1.5Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M2 4.8L8 8.1L14 4.8M8 8.1V14.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "revit") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0">
        <rect x="2.5" y="2" width="11" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" />
        <path
          d="M6 11V5H8.5C9.6 5 10.2 5.6 10.2 6.6C10.2 7.5 9.6 8.1 8.5 8.1H6M8.2 8.1L10.3 11"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "rhino") {
    return (
      <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0">
        <path
          d="M2.5 11.5C4.5 6.5 7 4 13.5 3.5C11.5 7.5 10.5 9.5 13 12.5C9.5 11.5 5.5 11.5 2.5 11.5Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}

function SceneWorkspace() {
  const searchParams = useSearchParams();
  const initialAssetId = searchParams.get("assetId");
  const initialSceneId = searchParams.get("sceneId");

  const viewportContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<OrbitCanvasHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [scene, setScene] = useState<SceneRecord | null>(null);
  const [savedScenes, setSavedScenes] = useState<SceneRecord[]>([]);
  const [activeCamera, setActiveCamera] = useState<CameraSpec | null>(null);

  const [importCardOpen, setImportCardOpen] = useState<boolean>(!initialAssetId && !initialSceneId);
  const [activeSoftwareTab, setActiveSoftwareTab] = useState<SoftwareTabId>("sketchup");
  const [helpExpanded, setHelpExpanded] = useState<boolean>(false);
  const [viewsPanelOpen, setViewsPanelOpen] = useState<boolean>(false);
  const [scenesMenuOpen, setScenesMenuOpen] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [draggingOver, setDraggingOver] = useState<boolean>(false);

  const [environmentMode, setEnvironmentMode] = useState<SceneEnvironmentMode>("terrain");
  const [shadingMode, setShadingMode] = useState<SceneShadingMode>("textured");
  const [lightingPreset, setLightingPreset] = useState<SceneLightingPreset>("midday");

  const [viewName, setViewName] = useState("Fachada Principal");
  const [style, setStyle] = useState("photoreal");
  const [viewJobs, setViewJobs] = useState<Record<string, JobRecord>>({});
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  useEffect(() => {
    let mounted = true;
    fetchScenes()
      .then(async (list) => {
        if (!mounted) return;
        setSavedScenes(list);

        if (initialSceneId) {
          const found = list.find((s) => s.id === initialSceneId);
          if (found) {
            setScene(found);
            setImportCardOpen(false);
            setSharePath(found.share_token ? `/share/${found.share_token}` : null);
            return;
          }
        }

        if (initialAssetId) {
          const existingForAsset = list.find((s) => s.source_asset_id === initialAssetId);
          if (existingForAsset) {
            setScene(existingForAsset);
            setImportCardOpen(false);
            setSharePath(
              existingForAsset.share_token ? `/share/${existingForAsset.share_token}` : null
            );
          } else {
            try {
              setBusy(true);
              const created = await createScene({
                name: "Escena Arquitectónica 3D",
                assetId: initialAssetId,
              });
              if (!mounted) return;
              setScene(created);
              setSavedScenes((prev) => [created, ...prev]);
              setImportCardOpen(false);
            } catch (err) {
              if (mounted) setError(err);
            } finally {
              if (mounted) setBusy(false);
            }
          }
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [initialAssetId, initialSceneId]);

  async function handleUploadMesh(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const asset = await uploadImageAsset(file);
      const cleanName = file.name.replace(/\.[^.]+$/, "") || "Escena Arquitectónica";
      const created = await createScene({
        name: cleanName,
        assetId: asset.id,
      });
      setScene(created);
      setSavedScenes((prev) => [created, ...prev]);
      setSharePath(null);
      setImportCardOpen(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function pollRenderJob(viewId: string, jobId: string) {
    const source = new EventSource(`${API_URL}/api/v1/jobs/${jobId}/events`);
    source.onmessage = (event) => {
      const snapshot: JobRecord = JSON.parse(event.data);
      setViewJobs((prev) => ({ ...prev, [viewId]: snapshot }));
      if (["succeeded", "failed", "canceled"].includes(snapshot.status)) {
        source.close();
      }
    };
    source.onerror = () => {
      source.close();
      void fetchJob(jobId)
        .then((job) => setViewJobs((prev) => ({ ...prev, [viewId]: job })))
        .catch(() => {});
    };
  }

  async function handleSaveViewAndRender() {
    if (!canvasRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const captured = await canvasRef.current.captureView();
      if (!captured) throw new Error("No se pudo capturar la cámara actual.");

      if (!scene) {
        const url = URL.createObjectURL(captured.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${viewName || "vista_3d"}.png`;
        a.click();
        URL.revokeObjectURL(url);
        setBusy(false);
        return;
      }

      const file = new File([captured.blob], `${viewName}.png`, { type: "image/png" });
      const thumbAsset = await uploadImageAsset(file);

      const view = await addSceneView(scene.id, {
        name: viewName,
        camera: captured.camera,
        thumbnailAssetId: thumbAsset.id,
        triggerRender: true,
        style,
        lighting: lightingPreset,
      });

      setScene((prev) => (prev ? { ...prev, views: [...prev.views, view] } : prev));
      setViewName(`Vista ${scene.views.length + 2}`);
      setViewsPanelOpen(true);

      if (view.render_job_id) {
        pollRenderJob(view.id, view.render_job_id);
      }
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadSnapshot() {
    if (!canvasRef.current) return;
    const captured = await canvasRef.current.captureView();
    if (!captured) return;
    const url = URL.createObjectURL(captured.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${scene?.name ?? "autem_escena_3d"}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleShare() {
    if (!scene) {
      setImportCardOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createShareLink(scene.id);
      setSharePath(res.share_path);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function copyShareLink() {
    if (!sharePath) return;
    const fullUrl = `${window.location.origin}${sharePath}`;
    void navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function cycleEnvironment() {
    const order: SceneEnvironmentMode[] = ["terrain", "studio", "grid"];
    const next = order[(order.indexOf(environmentMode) + 1) % order.length];
    setEnvironmentMode(next);
  }

  function cycleShading() {
    const order: SceneShadingMode[] = ["textured", "clay", "wireframe"];
    const next = order[(order.indexOf(shadingMode) + 1) % order.length];
    setShadingMode(next);
  }

  function cycleLighting() {
    const order: SceneLightingPreset[] = ["midday", "golden_hour", "overcast", "night"];
    const next = order[(order.indexOf(lightingPreset) + 1) % order.length];
    setLightingPreset(next);
  }

  async function toggleFullscreen() {
    if (!viewportContainerRef.current) return;
    if (!document.fullscreenElement) {
      await viewportContainerRef.current.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }

  const lightingLabels: Record<SceneLightingPreset, string> = {
    midday: "Sol de Mediodía",
    golden_hour: "Atardecer",
    overcast: "Nublado",
    night: "Noche",
  };

  const envLabels: Record<SceneEnvironmentMode, string> = {
    terrain: "Terreno Natural",
    studio: "Estudio Oscuro",
    grid: "Retícula Técnica",
  };

  const shadingLabels: Record<SceneShadingMode, string> = {
    textured: "Materiales",
    clay: "Maqueta Clay",
    wireframe: "Wireframe",
  };

  const currentSoftwareGuide =
    SOFTWARE_GUIDES.find((g) => g.id === activeSoftwareTab) ?? SOFTWARE_GUIDES[0];

  return (
    <div className="-m-8 flex h-[calc(100vh-56px)] w-[calc(100%+4rem)] flex-col overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf,.obj,.stl,.zip,.skp"
        className="hidden"
        onChange={(e) => void handleUploadMesh(e.target.files?.[0])}
      />

      {/* Full-Bleed 3D Viewport Container (Edge-to-Edge from Sidebar to Right Wall) */}
      <div
        ref={viewportContainerRef}
        onDragOver={(e) => {
          e.preventDefault();
          setDraggingOver(true);
        }}
        onDragLeave={() => setDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDraggingOver(false);
          void handleUploadMesh(e.dataTransfer.files?.[0]);
        }}
        className="relative flex-1 overflow-hidden"
      >
        <OrbitCanvas
          ref={canvasRef}
          glbUrl={scene ? assetFileUrl(scene.source_asset_id) : null}
          activeCamera={activeCamera}
          environmentMode={environmentMode}
          shadingMode={shadingMode}
          lightingPreset={lightingPreset}
          heightClass="h-full"
        />

        {draggingOver && (
          <div className="pointer-events-none absolute inset-4 z-40 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-background/80 backdrop-blur-md">
            <Upload className="size-10 text-primary" />
            <p className="text-lg font-bold text-foreground">
              Suelta tu archivo 3D (.GLB, .GLTF, .OBJ, .STL o .ZIP)
            </p>
          </div>
        )}

        {/* Top overlay ONLY when user has saved scenes or a notice/share link (keeps sky clean) */}
        {(savedScenes.length > 0 || Boolean(error) || Boolean(sharePath)) && (
          <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex flex-wrap items-start justify-between gap-3">
            <div className="pointer-events-auto">
              {savedScenes.length > 0 && (
                <div className="relative">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setScenesMenuOpen((v) => !v)}
                    className="border-white/15 bg-[#1E201C]/85 text-white shadow-lg backdrop-blur-md hover:bg-[#1E201C]"
                  >
                    <FolderOpen data-icon="inline-start" />
                    {scene ? scene.name : `Escenas (${savedScenes.length})`}
                    <ChevronDown data-icon="inline-end" />
                  </Button>

                  {scenesMenuOpen && (
                    <div className="absolute top-10 left-0 z-30 w-64 rounded-xl border border-white/15 bg-[#1C1D1A]/95 p-1.5 shadow-2xl backdrop-blur-xl">
                      {savedScenes.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setScene(item);
                            setSharePath(item.share_token ? `/share/${item.share_token}` : null);
                            setScenesMenuOpen(false);
                            setImportCardOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors",
                            scene?.id === item.id
                              ? "bg-white/15 font-semibold text-white"
                              : "text-zinc-300 hover:bg-white/10 hover:text-white"
                          )}
                        >
                          <span className="truncate">{item.name}</span>
                          <span className="font-mono text-[10px]">{item.views.length} vistas</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pointer-events-auto flex max-w-md flex-col gap-2">
              {Boolean(error) && (
                <FriendlyErrorAlert error={error} onDismiss={() => setError(null)} />
              )}

              {sharePath && (
                <div className="flex items-center gap-2.5 rounded-xl border border-[#22C55E]/40 bg-[#1C1D1A]/95 px-3.5 py-2 text-xs shadow-xl backdrop-blur-md">
                  <span className="font-mono text-foreground">{sharePath}</span>
                  <Button type="button" variant="outline" size="xs" onClick={copyShareLink}>
                    {copied ? (
                      <Check data-icon="inline-start" />
                    ) : (
                      <Copy data-icon="inline-start" />
                    )}
                    {copied ? "Copiado" : "Copiar"}
                  </Button>
                  {scene && (
                    <Button
                      render={<a href={sceneExportHtmlUrl(scene.id)} download />}
                      variant="outline"
                      size="xs"
                      title="Descargar visor 3D autocontenido (.html) sin servidor"
                    >
                      <Download data-icon="inline-start" />
                      HTML offline
                    </Button>
                  )}
                  <Button render={<Link href={sharePath} />} size="xs" className="btn-primary">
                    Abrir
                    <ExternalLink data-icon="inline-end" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            FLOATING "IMPORTAR UN MODELO 3D" POPOVER CARD (Exact Render a House Aesthetic)
           ===================================================================== */}
        {importCardOpen && (
          <div className="absolute bottom-[60px] left-4 z-30 w-[calc(100%-2rem)] max-w-[430px] rounded-2xl border border-white/10 bg-[#22241F]/92 p-5 text-white shadow-[0_24px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-bold tracking-tight text-white">
                  Importar un modelo 3D
                </h2>
                <p className="mt-1.5 text-xs leading-relaxed text-zinc-300/90">
                  Este visor acepta <strong className="font-semibold text-white">.skp, .glb, .gltf</strong>{" "}
                  y <strong className="font-semibold text-white">.obj</strong> archivos. Desde otros
                  programas 3D, exporta a uno de estos formatos antes de subirlo. Para incluir las
                  texturas del OBJ, sube un <strong className="font-semibold text-white">ZIP</strong>{" "}
                  con el OBJ, el MTL y la carpeta de texturas.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setImportCardOpen(false)}
                className="rounded-lg p-1 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
                title="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Software Selector Pills with CAD Icons: SketchUp | Revit | Rhino | Otro */}
            <div className="mt-4 grid grid-cols-4 gap-1.5">
              {SOFTWARE_GUIDES.map((sw) => {
                const active = activeSoftwareTab === sw.id;
                return (
                  <button
                    key={sw.id}
                    type="button"
                    onClick={() => {
                      setActiveSoftwareTab(sw.id);
                      setHelpExpanded(false);
                    }}
                    className={cn(
                      "flex h-8 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-medium transition-all",
                      active
                        ? "bg-[#0C0C0E] text-white shadow-sm ring-1 ring-white/15"
                        : "bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                    )}
                  >
                    <SoftwareTabIcon id={sw.id} />
                    <span>{sw.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Numbered Steps for Selected Software */}
            <div className="mt-4 flex flex-col gap-2.5">
              {currentSoftwareGuide.steps.map((stepNode, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/12 font-mono text-[11px] font-semibold text-zinc-200">
                    {idx + 1}
                  </span>
                  <p className="pt-0.5 leading-relaxed text-zinc-300">{stepNode}</p>
                </div>
              ))}

              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => setHelpExpanded((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] text-zinc-400 transition-colors hover:text-zinc-200"
                >
                  <ChevronDown
                    className={cn(
                      "size-3.5 transition-transform",
                      helpExpanded && "rotate-180"
                    )}
                  />
                  <span>{currentSoftwareGuide.helpQuestion}</span>
                </button>
                {helpExpanded && (
                  <p className="mt-1.5 rounded-lg border border-white/10 bg-black/30 p-2.5 text-[11px] leading-relaxed text-zinc-300">
                    {currentSoftwareGuide.helpAnswer}
                  </p>
                )}
              </div>
            </div>

            {/* Full-width crisp white "Subir" button */}
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white text-xs font-semibold text-[#0A0A0B] shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-50"
            >
              {busy ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />}
              <span>{busy ? "Subiendo modelo 3D..." : "Subir"}</span>
            </button>

            {/* Little bottom pointer triangle pointing to the Cube icon in the dock */}
            <div
              aria-hidden="true"
              className="absolute -bottom-1.5 left-[54px] size-3 rotate-45 border-r border-b border-white/10 bg-[#22241F]"
            />
          </div>
        )}

        {/* =====================================================================
            FLOATING CAMERA VIEWS & AI RENDER DRAWER (Right side when toggled)
           ===================================================================== */}
        {viewsPanelOpen && (
          <div className="absolute top-16 right-4 bottom-[60px] z-30 flex w-88 flex-col justify-between overflow-hidden rounded-2xl border border-white/10 bg-[#1E201C]/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex flex-col gap-3 overflow-y-auto pr-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Camera className="size-4 text-primary" />
                  <h3 className="text-sm font-bold text-white">
                    Vistas de Cámara ({scene?.views.length ?? 0})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setViewsPanelOpen(false)}
                  className="rounded-lg p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2.5 rounded-xl border border-white/10 bg-black/30 p-3">
                <Input
                  type="text"
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  placeholder="Nombre de la cámara (ej. Fachada Sur)"
                  className="h-8 text-xs"
                />
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: "photoreal", label: "Photoreal" },
                    { id: "clay", label: "Clay" },
                    { id: "linework", label: "Linework" },
                  ].map((st) => (
                    <Button
                      key={st.id}
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setStyle(st.id)}
                      className={cn(
                        style === st.id && "border-primary bg-primary/15 text-foreground"
                      )}
                    >
                      {st.label}
                    </Button>
                  ))}
                </div>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleSaveViewAndRender()}
                  className="btn-primary h-9 w-full text-xs font-semibold"
                >
                  {busy ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Sparkles data-icon="inline-start" />
                  )}
                  {scene ? "Guardar cámara + Render IA" : "Capturar vista PNG"}
                </Button>
              </div>

              {scene && scene.views.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {scene.views.map((view: SceneViewRecord) => {
                    const rJob = viewJobs[view.id];
                    const renderedPngId = rJob?.output_assets.png ?? null;
                    return (
                      <Card
                        key={view.id}
                        size="sm"
                        onClick={() => setActiveCamera({ ...view.camera })}
                        className="cursor-pointer overflow-hidden py-0 transition hover:ring-primary"
                      >
                        <div className="grid grid-cols-2 gap-0.5 bg-background">
                          <div className="relative h-24 bg-secondary">
                            {view.thumbnail_asset_id && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={assetFileUrl(view.thumbnail_asset_id)}
                                alt="Cámara 3D"
                                className="size-full object-cover"
                              />
                            )}
                            <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] text-white">
                              3D
                            </span>
                          </div>
                          <div className="relative flex h-24 items-center justify-center bg-secondary">
                            {renderedPngId ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={assetFileUrl(renderedPngId)}
                                alt="Render IA"
                                className="size-full object-cover"
                              />
                            ) : (
                              <Spinner className="size-4 text-primary" />
                            )}
                            <span className="btn-primary absolute right-1 bottom-1 rounded px-1.5 py-0.5 text-[9px] font-semibold">
                              IA
                            </span>
                          </div>
                        </div>
                        <CardContent className="py-2">
                          <p className="truncate text-xs font-semibold text-foreground">
                            {view.name}
                          </p>
                          <p className="font-mono text-[10px] text-muted-foreground">
                            FOV {view.camera.fov}° · {rJob?.message ?? "Cámara guardada"}
                          </p>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <p className="py-6 text-center text-xs text-zinc-400">
                  Orbita hasta el ángulo deseado y captura la vista para generar un render con esa
                  geometría exacta.
                </p>
              )}
            </div>
          </div>
        )}

        {/* =====================================================================
            BOTTOM-LEFT FLOATING DOCK (Clean translucent dark dock like Render a House)
           ===================================================================== */}
        <div className="absolute bottom-3 left-4 z-20 flex items-center gap-1 rounded-xl border border-white/10 bg-[#22241F]/90 p-1 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={cycleEnvironment}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg transition-colors",
              environmentMode === "terrain"
                ? "bg-white/12 text-white"
                : "text-zinc-400 hover:bg-white/10 hover:text-white"
            )}
            title={`Entorno: ${envLabels[environmentMode]}`}
          >
            <Globe className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => setImportCardOpen((v) => !v)}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg transition-colors",
              importCardOpen
                ? "bg-white/15 text-white ring-1 ring-white/20"
                : "text-zinc-400 hover:bg-white/10 hover:text-white"
            )}
            title="Importar un modelo 3D"
          >
            <Box className="size-4" />
          </button>

          <button
            type="button"
            onClick={cycleShading}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg transition-colors",
              shadingMode !== "textured"
                ? "bg-white/15 text-white"
                : "text-zinc-400 hover:bg-white/10 hover:text-white"
            )}
            title={`Estilo visual: ${shadingLabels[shadingMode]}`}
          >
            <Layers className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => canvasRef.current?.resetCamera()}
            className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            title="Reiniciar cámara"
          >
            <RotateCcw className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            title="Pantalla completa"
          >
            {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>

          <button
            type="button"
            onClick={() => canvasRef.current?.setHumanEyeView()}
            className="flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/10 hover:text-white"
            title="Perspectiva a nivel de peatón (1.68 m)"
          >
            <PersonStanding className="size-4" />
          </button>
        </div>

        {/* =====================================================================
            BOTTOM-RIGHT FLOATING DOCK (Sun, Camera Views, Download)
           ===================================================================== */}
        <div className="absolute right-4 bottom-3 z-20 flex items-center gap-1 rounded-xl border border-white/10 bg-[#22241F]/90 p-1 shadow-xl backdrop-blur-md">
          <button
            type="button"
            onClick={cycleLighting}
            className="flex size-8 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            title={`Iluminación solar: ${lightingLabels[lightingPreset]}`}
          >
            {lightingPreset === "midday" ? (
              <Sun className="size-4" />
            ) : lightingPreset === "golden_hour" ? (
              <Sunrise className="size-4" />
            ) : lightingPreset === "overcast" ? (
              <Cloud className="size-4" />
            ) : (
              <Moon className="size-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => setViewsPanelOpen((v) => !v)}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg transition-colors",
              viewsPanelOpen
                ? "bg-white/15 text-white ring-1 ring-white/20"
                : "text-zinc-300 hover:bg-white/10 hover:text-white"
            )}
            title="Vistas de cámara y Render IA"
          >
            <Eye className="size-4" />
          </button>

          {scene && (
            <button
              type="button"
              onClick={() => void handleShare()}
              className="flex size-8 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
              title="Compartir escena 3D con cliente"
            >
              <Share2 className="size-4" />
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleDownloadSnapshot()}
            className="flex size-8 items-center justify-center rounded-lg text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
            title="Descargar captura PNG"
          >
            <Download className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ScenePage() {
  return (
    <Suspense fallback={null}>
      <SceneWorkspace />
    </Suspense>
  );
}
