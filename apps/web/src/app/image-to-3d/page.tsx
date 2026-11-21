"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AutemLoader } from "@/components/brand/autem-loader";
import { FriendlyErrorAlert } from "@/components/ui/friendly-error";
import { toast } from "@/stores/toast-store";
import {
  AlertTriangle,
  ArrowLeft,
  Box,
  Check,
  ChevronRight,
  Clock,
  Columns2,
  Cpu,
  Database,
  Download,
  FileCode2,
  Image as ImageIcon,
  Layers,
  Play,
  Plus,
  Triangle,
  Upload,
  X,
} from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  API_URL,
  assetFileUrl,
  cancelJob,
  compareImageTo3DJobs,
  createImageTo3DJob,
  fetchAssets,
  fetchJob,
  fetchJobs,
  fetchProviders,
  parseFriendlyError,
  uploadImageAsset,
  type AssetInfo,
  type JobRecord,
  type ProviderInfo,
} from "@/lib/api";

const ModelViewer3D = dynamic(
  () => import("@/components/viewer3d/model-viewer").then((m) => m.ModelViewer3D),
  { ssr: false }
);

function formatElapsed(sec: number): string {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.max(0, sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

function formatRelativeTime(isoDate: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 60) return "hace unos seg";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} d`;
}

function getJobDurationSec(job: JobRecord): number | null {
  if (!job.started_at || !job.finished_at) return null;
  const ms = new Date(job.finished_at).getTime() - new Date(job.started_at).getTime();
  return Math.max(1, Math.round(ms / 1000));
}

function ImageTo3DWorkspace() {
  const searchParams = useSearchParams();
  const initialAssetId = searchParams.get("assetId");
  const initialJobId = searchParams.get("jobId");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const eventSourcesRef = useRef<EventSource[]>([]);

  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [uploadedAssets, setUploadedAssets] = useState<AssetInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const [selectedProvider, setSelectedProvider] = useState<string>("auto");
  const [removeBg, setRemoveBg] = useState<boolean>(true);
  const [pbrTexture, setPbrTexture] = useState<boolean>(true);
  const [polygonLimit, setPolygonLimit] = useState<number>(1000000);
  const [seed, setSeed] = useState<string>("123456789");

  const [activeJob, setActiveJob] = useState<JobRecord | null>(null);
  const [compareJobs, setCompareJobs] = useState<JobRecord[]>([]);
  const [isComparing, setIsComparing] = useState(false);
  const [syncCamera, setSyncCamera] = useState(true);
  const [cameraSyncTick, setCameraSyncTick] = useState(0);

  const [history, setHistory] = useState<JobRecord[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let mounted = true;
    Promise.all([fetchProviders("image_to_3d"), fetchJobs()])
      .then(async ([provList, jobList]) => {
        if (!mounted) return;
        setProviders(provList);
        const completed3D = jobList.filter((j) => j.kind === "image_to_3d");
        setHistory(completed3D.slice(0, 5));

        if (initialJobId) {
          const found = jobList.find((j) => j.id === initialJobId);
          if (found) {
            setActiveJob(found);
          } else {
            const loadedJob = await fetchJob(initialJobId).catch(() => null);
            if (mounted && loadedJob) setActiveJob(loadedJob);
          }
        } else if (initialAssetId) {
          const allAssets = await fetchAssets().catch(() => [] as AssetInfo[]);
          const targetAsset = allAssets.find((a) => a.id === initialAssetId);
          if (mounted && targetAsset) {
            setUploadedAssets([targetAsset]);
          }
        }
        if (provList.length > 0 && !provList.some((p) => p.available)) {
          toast.warning({
            title: "Configura un proveedor antes de empezar",
            description:
              "Conecta una clave en Configuración o inicia ComfyUI local para generar modelos 3D.",
            actionLabel: "Configurar proveedor",
            actionHref: "/settings",
          });
        }
      })
      .catch(() => {
        if (!mounted) return;
        toast.error({
          title: "No se pudo conectar con la API",
          description: `Verifica que FastAPI esté corriendo en ${API_URL}.`,
          actionLabel: "Revisar Configuración",
          actionHref: "/settings",
        });
      })
      .finally(() => {
        if (mounted) setLoadingProviders(false);
      });

    return () => {
      mounted = false;
      for (const es of eventSourcesRef.current) {
        es.close();
      }
    };
  }, []);

  // Real elapsed timer while a job is queued/running
  useEffect(() => {
    if (!activeJob || !["queued", "running"].includes(activeJob.status)) return;
    const startMs = new Date(activeJob.started_at ?? activeJob.created_at).getTime();
    const updateTimer = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [activeJob]);

  function subscribeToJob(jobId: string, onUpdate: (snapshot: JobRecord) => void) {
    const source = new EventSource(`${API_URL}/api/v1/jobs/${jobId}/events`);
    eventSourcesRef.current.push(source);

    source.onmessage = (event) => {
      const snapshot: JobRecord = JSON.parse(event.data);
      onUpdate(snapshot);
      if (["succeeded", "failed", "canceled"].includes(snapshot.status)) {
        source.close();
        setHistory((prev) => {
          const filtered = prev.filter((item) => item.id !== snapshot.id);
          return [snapshot, ...filtered].slice(0, 5);
        });
      }
    };
    source.onerror = () => {
      source.close();
    };
  }

  async function handleFiles(files: FileList | null, replaceExisting = false) {
    if (!files || files.length === 0) return;

    // Avisar ANTES de subir la imagen si no hay ningún proveedor 3D activo
    if (!loadingProviders && providers.length > 0 && !providers.some((p) => p.available)) {
      toast.warning({
        title: "Primero configura un proveedor 3D",
        description:
          "No hay ningún motor 3D activo. Conecta un proveedor gratis o API antes de subir tu imagen.",
        actionLabel: "Configurar proveedor",
        actionHref: "/settings",
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const baseList = replaceExisting ? [] : uploadedAssets;
      const remaining = Math.max(0, 4 - baseList.length);
      const slice = Array.from(files).slice(0, remaining || 1);
      const newlyUploaded: AssetInfo[] = [];
      for (const file of slice) {
        const asset = await uploadImageAsset(file);
        newlyUploaded.push(asset);
      }
      setUploadedAssets(replaceExisting ? newlyUploaded : [...baseList, ...newlyUploaded]);
      setActiveJob(null);
      setIsComparing(false);
      toast.success({
        title: `${newlyUploaded.length} imagen(es) cargada(s)`,
        description: "Lista para reconstruir en 3D.",
      });
    } catch (err) {
      toast.error({
        title: "Error subiendo imagen",
        description: err instanceof Error ? err.message : "No se pudo subir la imagen al servidor.",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleGenerate() {
    if (uploadedAssets.length === 0) return;

    const chosen =
      selectedProvider === "auto"
        ? providers.find((p) => p.available)
        : providers.find((p) => p.id === selectedProvider && p.available);

    if (!chosen) {
      toast.warning({
        title: "Proveedor no configurado",
        description:
          "El motor seleccionado no tiene clave o servidor activo. Configúralo o elige Auto.",
        actionLabel: "Configurar proveedor",
        actionHref: "/settings",
      });
      return;
    }

    setSubmitting(true);
    setIsComparing(false);

    const parsedSeed = Number.parseInt(seed, 10);
    try {
      const created = await createImageTo3DJob({
        assetIds: uploadedAssets.map((a) => a.id),
        providerId: selectedProvider,
        seed: Number.isFinite(parsedSeed) ? parsedSeed : null,
        extra: {
          remove_bg: removeBg,
          pbr: pbrTexture,
          polygon_limit: polygonLimit,
        },
      });
      setActiveJob(created);
      setElapsedSeconds(0);
      subscribeToJob(created.id, (snapshot) => {
        setActiveJob(snapshot);
        if (snapshot.status === "succeeded") {
          setSubmitting(false);
          toast.success({
            title: "Modelo 3D generado",
            description: `Listo con ${snapshot.provider_id} en GLB, OBJ y STL.`,
          });
        } else if (snapshot.status === "failed" || snapshot.status === "canceled") {
          setSubmitting(false);
          if (snapshot.error) {
            toast.error({
              title: "Error en la generación 3D",
              description: snapshot.error,
              actionLabel: "Revisar Configuración",
              actionHref: "/settings",
            });
          }
        }
      });
    } catch (err) {
      const friendly = parseFriendlyError(err);
      toast.error({
        title: friendly.title,
        description: friendly.detail,
        actionLabel: friendly.action_label ?? "Configurar motor",
        actionHref: friendly.action_url ?? "/settings",
      });
      setSubmitting(false);
    }
  }

  async function handleCompareModels() {
    if (uploadedAssets.length === 0) return;
    const availableIds = providers.filter((p) => p.available).map((p) => p.id);
    const targetProviders =
      availableIds.length >= 2
        ? availableIds.slice(0, 3)
        : providers.slice(0, 3).map((p) => p.id);

    if (targetProviders.length < 2) {
      toast.warning({
        title: "Se necesitan al menos 2 proveedores activos",
        description: "Conecta un segundo proveedor en Configuración para comparar lado a lado.",
        actionLabel: "Configurar proveedor",
        actionHref: "/settings",
      });
      return;
    }

    setSubmitting(true);
    const parsedSeed = Number.parseInt(seed, 10);

    try {
      const createdList = await compareImageTo3DJobs({
        assetIds: uploadedAssets.map((a) => a.id),
        providerIds: targetProviders,
        seed: Number.isFinite(parsedSeed) ? parsedSeed : 42,
      });
      setCompareJobs(createdList);
      setIsComparing(true);
      setActiveJob(null);

      let remaining = createdList.length;
      for (const job of createdList) {
        subscribeToJob(job.id, (snapshot) => {
          setCompareJobs((prev) => prev.map((item) => (item.id === snapshot.id ? snapshot : item)));
          if (["succeeded", "failed", "canceled"].includes(snapshot.status)) {
            remaining -= 1;
            if (remaining <= 0) setSubmitting(false);
          }
        });
      }
    } catch (err) {
      const friendly = parseFriendlyError(err);
      toast.error({
        title: friendly.title,
        description: friendly.detail,
        actionLabel: friendly.action_label ?? "Configurar motor",
        actionHref: friendly.action_url ?? "/settings",
      });
      setSubmitting(false);
    }
  }

  async function handleCancelActiveJob() {
    if (!activeJob) return;
    try {
      const canceled = await cancelJob(activeJob.id);
      setActiveJob(canceled);
      setSubmitting(false);
      toast.info({ title: "Trabajo cancelado" });
    } catch (err) {
      toast.error({
        title: "No se pudo cancelar",
        description: err instanceof Error ? err.message : "Error cancelando el trabajo.",
      });
    }
  }

  function providerLabelById(id: string): string {
    if (id === "auto") return "Auto (con fallback)";
    return providers.find((p) => p.id === id)?.label ?? id;
  }

  const selectedProviderInfo =
    selectedProvider === "auto"
      ? providers.find((p) => p.available) ?? providers[0] ?? null
      : providers.find((p) => p.id === selectedProvider) ?? null;

  const isGeneratingView =
    !isComparing && activeJob !== null && ["queued", "running"].includes(activeJob.status);
  const isResultView =
    !isComparing &&
    activeJob !== null &&
    ["succeeded", "failed", "canceled"].includes(activeJob.status);
  const isConfigView = !isComparing && activeJob === null && uploadedAssets.length > 0;
  const isEmptyView = !isComparing && activeJob === null && uploadedAssets.length === 0;

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files, uploadedAssets.length > 0)}
      />

      {/* =====================================================================
          1. ESTADO VACÍO — SUBIR IMAGEN REAL
         ===================================================================== */}
      {isEmptyView && (
        <div className="flex flex-col gap-6">
          <header className="flex flex-col gap-1.5">
            <h1 className="text-[28px] font-bold tracking-tight text-foreground">Imagen a 3D</h1>
            <p className="text-sm text-muted-foreground">
              Convierte una foto o render en un modelo 3D descargable
            </p>
          </header>

          {/* Dropzone Card */}
          <Card
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files, true);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex h-[300px] cursor-pointer flex-col items-center justify-center border border-dashed transition-colors",
              dragging
                ? "border-primary bg-primary/10"
                : "border-[#2F2F34] bg-card hover:border-muted-foreground/50"
            )}
          >
            <CardContent className="flex flex-col items-center justify-center gap-3 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-secondary text-foreground">
                {uploading ? <Spinner className="size-6" /> : <Upload className="size-7" />}
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-lg font-semibold text-foreground">
                  {uploading
                    ? "Subiendo imagen al servidor..."
                    : "Arrastra y suelta o haz clic para subir"}
                </p>
                <p className="text-sm text-muted-foreground">PNG · JPEG · WebP — hasta 20 MB</p>
              </div>
              <Button
                type="button"
                variant="link"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                className="text-primary"
              >
                Subir varias vistas (2–4)
              </Button>
            </CardContent>
          </Card>

          {/* Bottom Bar: Select provider + output info + disabled Generate button */}
          <div className="grid grid-cols-1 items-center gap-4 md:grid-cols-12">
            <div className="md:col-span-5">
              <Select
                value={selectedProvider}
                onValueChange={(val) => {
                  if (val) setSelectedProvider(val);
                }}
              >
                <SelectTrigger className="h-12 w-full bg-card px-4">
                  <span className="flex items-center gap-2.5">
                    <Layers className="size-4 text-muted-foreground" />
                    <SelectValue placeholder="Selecciona un proveedor" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="auto">Auto (con fallback)</SelectItem>
                    {providers.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label} {p.available ? "" : "(inactivo)"}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <Card className="flex h-12 justify-center py-0 md:col-span-4">
              <CardContent className="flex items-center font-mono text-sm text-foreground">
                Salida GLB · ~{selectedProviderInfo?.est_seconds ?? 75} s
              </CardContent>
            </Card>

            <div className="md:col-span-3">
              <Button
                type="button"
                disabled
                className="btn-primary h-12 w-full rounded-[10px] text-sm font-semibold opacity-40"
              >
                <Play data-icon="inline-start" />
                Generar 3D
              </Button>
            </div>
          </div>

          {/* Real History section if the user has past generations */}
          <HistoryCard
            history={history}
            activeJobId={null}
            providerLabelById={providerLabelById}
            onSelectJob={(job) => setActiveJob(job)}
          />
        </div>
      )}

      {/* =====================================================================
          2. CONFIGURACIÓN — IMAGEN REAL CARGADA
         ===================================================================== */}
      {isConfigView && (
        <div className="flex flex-col gap-6">
          <header className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setUploadedAssets([])}
                title="Quitar imagen y volver"
              >
                <ArrowLeft />
              </Button>
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">Imagen a 3D</h1>
            </div>
          </header>

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left Column (40%): Uploaded Image Preview on Checkerboard */}
            <Card className="flex flex-col justify-between lg:col-span-5">
              <CardContent className="flex flex-col gap-4 pt-2">
                <div className="bg-checkerboard relative aspect-square w-full overflow-hidden rounded-xl border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${API_URL}${uploadedAssets[0].url}`}
                    alt={uploadedAssets[0].filename}
                    className="size-full object-contain"
                  />
                </div>

                {/* Multi-view strip if > 1 image or allow adding up to 4 views */}
                {uploadedAssets.length > 1 && (
                  <div className="grid grid-cols-4 gap-2">
                    {uploadedAssets.map((asset, idx) => (
                      <div
                        key={asset.id}
                        className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-secondary"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`${API_URL}${asset.url}`}
                          alt={asset.filename}
                          className="size-full object-cover"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon-xs"
                          onClick={() =>
                            setUploadedAssets((prev) => prev.filter((a) => a.id !== asset.id))
                          }
                          className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
                          title={`Quitar vista ${idx + 1}`}
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex items-center justify-between gap-4 border-t border-border bg-transparent">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon data-icon="inline-start" />
                    Cambiar imagen
                  </Button>
                  {uploadedAssets.length < 4 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "image/png,image/jpeg,image/webp";
                        input.multiple = true;
                        input.onchange = () =>
                          void handleFiles((input as HTMLInputElement).files, false);
                        input.click();
                      }}
                    >
                      <Plus data-icon="inline-start" />
                      Vista ({uploadedAssets.length}/4)
                    </Button>
                  )}
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 text-xs text-muted-foreground">
                  <span>Quitar fondo</span>
                  <Switch checked={removeBg} onCheckedChange={setRemoveBg} />
                </label>
              </CardFooter>
            </Card>

            {/* Right Column (60%): Provider Cards + Controls + CTA */}
            <div className="flex flex-col justify-between gap-6 lg:col-span-7">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Modelo</CardTitle>
                  <CardDescription>
                    Selecciona un motor local (ComfyUI) o API conectada para reconstruir la malla
                    3D.
                  </CardDescription>
                </CardHeader>

                <CardContent className="flex flex-col gap-5">
                  {/* 3x2 Grid of Real Providers */}
                  <div className="grid gap-3.5 sm:grid-cols-3">
                    {/* Auto (con fallback) Card */}
                    <button
                      type="button"
                      onClick={() => setSelectedProvider("auto")}
                      className={cn(
                        "flex flex-col justify-between rounded-xl border p-4 text-left transition-all",
                        selectedProvider === "auto"
                          ? "border-2 border-primary bg-primary/5"
                          : "border-border bg-secondary/40 hover:border-muted-foreground/40"
                      )}
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex items-start gap-2">
                          <Layers className="mt-0.5 size-4 shrink-0 text-foreground" />
                          <div className="flex flex-col gap-1">
                            <p className="text-xs font-semibold text-foreground">
                              Auto (con fallback)
                            </p>
                            <Badge className="border border-[#22C55E]/30 bg-[#22C55E]/15 text-[10px] text-[#22C55E]">
                              Recomendado
                            </Badge>
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5 text-xs">
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <Clock className="size-3.5" />
                              Tiempo
                            </span>
                            <span className="font-mono text-foreground">
                              ~{selectedProviderInfo?.est_seconds ?? 75} s
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-muted-foreground">
                            <span className="flex items-center gap-1.5">
                              <FileCode2 className="size-3.5" />
                              Salida
                            </span>
                            <span className="font-mono text-foreground">GLB</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-1">
                        <Badge
                          className={cn(
                            "h-6 px-2.5 text-[11px]",
                            providers.some((p) => p.available)
                              ? "border border-[#22C55E]/30 bg-[#22C55E]/15 text-[#22C55E]"
                              : "border border-border bg-secondary text-muted-foreground"
                          )}
                        >
                          {providers.some((p) => p.available) ? (
                            <>
                              <Check data-icon="inline-start" />
                              Disponible
                            </>
                          ) : (
                            "Configurar motor"
                          )}
                        </Badge>
                      </div>
                    </button>

                    {/* Real Registered Providers from API */}
                    {loadingProviders
                      ? Array.from({ length: 4 }).map((_, i) => (
                          <div
                            key={i}
                            className="h-44 rounded-xl border border-border bg-secondary/30"
                          />
                        ))
                      : providers.map((provider) => {
                          const selected = selectedProvider === provider.id;
                          return (
                            <button
                              key={provider.id}
                              type="button"
                              onClick={() => setSelectedProvider(provider.id)}
                              className={cn(
                                "flex flex-col justify-between rounded-xl border p-4 text-left transition-all",
                                selected
                                  ? "border-2 border-primary bg-primary/5"
                                  : "border-border bg-secondary/40 hover:border-muted-foreground/40"
                              )}
                            >
                              <div className="flex flex-col gap-3">
                                <div className="flex items-start gap-2">
                                  {provider.id.includes("tripo") ? (
                                    <Triangle className="mt-0.5 size-4 shrink-0 text-foreground" />
                                  ) : (
                                    <Box className="mt-0.5 size-4 shrink-0 text-foreground" />
                                  )}
                                  <p className="text-xs font-semibold leading-snug text-foreground">
                                    {provider.label}
                                  </p>
                                </div>

                                <div className="flex flex-col gap-1.5 text-xs">
                                  <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="flex items-center gap-1.5">
                                      <Clock className="size-3.5" />
                                      Tiempo
                                    </span>
                                    <span className="font-mono text-foreground">
                                      ~{provider.est_seconds} s
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-muted-foreground">
                                    <span className="flex items-center gap-1.5">
                                      <FileCode2 className="size-3.5" />
                                      Salida
                                    </span>
                                    <span className="font-mono text-foreground">
                                      {(provider.outputs[0] ?? "glb").toUpperCase()}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 pt-1">
                                <Badge
                                  className={cn(
                                    "h-6 px-2.5 text-[11px]",
                                    provider.available
                                      ? "border border-[#22C55E]/30 bg-[#22C55E]/15 text-[#22C55E]"
                                      : "border border-border bg-secondary text-muted-foreground"
                                  )}
                                >
                                  {provider.available ? (
                                    <>
                                      <Check data-icon="inline-start" />
                                      Disponible
                                    </>
                                  ) : provider.where === "local" ? (
                                    "ComfyUI offline"
                                  ) : (
                                    "Falta key"
                                  )}
                                </Badge>
                              </div>
                            </button>
                          );
                        })}
                  </div>

                  {/* Controls Sub-card: Textura PBR | Límite de polígonos | Seed */}
                  <Card size="sm" className="bg-background/60">
                    <CardContent className="grid grid-cols-1 items-center gap-4 sm:grid-cols-12">
                      <label className="flex cursor-pointer items-center gap-2.5 sm:col-span-3">
                        <Switch checked={pbrTexture} onCheckedChange={setPbrTexture} />
                        <span className="text-xs font-medium text-foreground">Textura PBR</span>
                      </label>

                      <div className="flex flex-col gap-2 sm:col-span-6">
                        <span className="text-xs text-muted-foreground">Límite de polígonos</span>
                        <div className="flex items-center gap-3">
                          <Slider
                            min={100000}
                            max={2000000}
                            step={50000}
                            value={[polygonLimit]}
                            onValueChange={(vals) => {
                              const nextVal = Array.isArray(vals) ? vals[0] : vals;
                              if (typeof nextVal === "number") setPolygonLimit(nextVal);
                            }}
                            className="flex-1"
                          />
                          <Badge variant="outline" className="h-8 px-2.5 font-mono text-xs">
                            {polygonLimit.toLocaleString("en-US")}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 sm:col-span-3">
                        <label className="text-xs text-muted-foreground" htmlFor="seed-input">
                          Seed
                        </label>
                        <Input
                          id="seed-input"
                          type="text"
                          value={seed}
                          onChange={(e) => setSeed(e.target.value)}
                          className="h-8 font-mono text-xs"
                        />
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>

              {/* Action Row: Secondary "Comparar modelos" + Single solid orange "Generar 3D" */}
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  disabled={submitting}
                  onClick={() => void handleCompareModels()}
                  className="h-12 px-5"
                >
                  <Columns2 data-icon="inline-start" />
                  Comparar modelos
                </Button>

                <Button
                  type="button"
                  size="lg"
                  disabled={submitting}
                  onClick={() => void handleGenerate()}
                  className="btn-primary h-12 rounded-[10px] px-7 text-sm font-semibold"
                >
                  {submitting ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Play data-icon="inline-start" />
                  )}
                  Generar 3D
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          3. GENERANDO — STEPPER EN VIVO CON SSE REAL
         ===================================================================== */}
      {isGeneratingView && activeJob && (
        <div className="flex flex-col gap-6">
          <header className="flex items-center gap-3.5">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => void handleCancelActiveJob()}
              title="Cancelar y volver"
            >
              <ArrowLeft />
            </Button>
            <h1 className="text-[28px] font-bold tracking-tight text-foreground">Imagen a 3D</h1>
          </header>

          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <Box className="mt-1 size-6 text-foreground" />
                <div>
                  <CardTitle className="text-xl font-bold">Generando modelo</CardTitle>
                  <CardDescription>
                    Estamos convirtiendo tu imagen en un modelo 3D. Esto puede tardar unos minutos.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex flex-col gap-8">
              <div className="grid items-center gap-8 lg:grid-cols-12">
                {/* Left Input Image on Checkerboard + Signature AutemLoader overlay */}
                <div className="lg:col-span-5">
                  <div className="bg-checkerboard relative mx-auto aspect-square max-w-[340px] overflow-hidden rounded-xl border border-border">
                    {uploadedAssets[0] || activeJob.input_asset_ids[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={
                          uploadedAssets[0]
                            ? `${API_URL}${uploadedAssets[0].url}`
                            : assetFileUrl(activeJob.input_asset_ids[0])
                        }
                        alt="Imagen de entrada"
                        className="size-full object-contain opacity-45"
                      />
                    ) : null}
                    <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[2px]">
                      <AutemLoader
                        compact
                        title="Reconstruyendo malla 3D"
                        subtitle={providerLabelById(activeJob.provider_id)}
                        progress={Math.round(activeJob.progress * 100)}
                      />
                    </div>
                  </div>
                </div>

                {/* Right 4-Step Vertical Stepper driven by real activeJob.progress */}
                <div className="lg:col-span-7">
                  {(() => {
                    const p = activeJob.progress;
                    const step1Done = p >= 0.05;
                    const step2Done = p >= 0.2;
                    const step3Done = p >= 0.88;
                    const step4Done = p >= 1.0;

                    return (
                      <div className="flex flex-col">
                        {/* Step 1 */}
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center">
                            <span className="flex size-8 items-center justify-center rounded-full bg-[#22C55E]/20 text-[#22C55E] ring-1 ring-[#22C55E]/50">
                              <Check className="size-4" />
                            </span>
                            <span
                              className={cn(
                                "mt-1 h-8 w-0.5",
                                step1Done ? "bg-[#22C55E]" : "bg-border"
                              )}
                            />
                          </div>
                          <div className="pt-0.5">
                            <p className="text-base font-semibold text-foreground">
                              Imagen subida
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Archivo recibido y validado.
                            </p>
                          </div>
                        </div>

                        {/* Step 2 */}
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center">
                            {step2Done ? (
                              <span className="flex size-8 items-center justify-center rounded-full bg-[#22C55E]/20 text-[#22C55E] ring-1 ring-[#22C55E]/50">
                                <Check className="size-4" />
                              </span>
                            ) : (
                              <span className="btn-primary flex size-8 items-center justify-center rounded-full">
                                <Spinner className="size-4" />
                              </span>
                            )}
                            <span
                              className={cn(
                                "mt-1 h-8 w-0.5",
                                step2Done ? "bg-[#22C55E]" : "bg-border"
                              )}
                            />
                          </div>
                          <div className="pt-0.5">
                            <p className="text-base font-semibold text-foreground">
                              Fondo eliminado
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Fondo removido correctamente.
                            </p>
                          </div>
                        </div>

                        {/* Step 3 */}
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center">
                            {step3Done ? (
                              <span className="flex size-8 items-center justify-center rounded-full bg-[#22C55E]/20 text-[#22C55E] ring-1 ring-[#22C55E]/50">
                                <Check className="size-4" />
                              </span>
                            ) : step2Done ? (
                              <span className="btn-primary flex size-8 items-center justify-center rounded-full">
                                <Spinner className="size-4" />
                              </span>
                            ) : (
                              <span className="flex size-8 items-center justify-center rounded-full border-2 border-muted-foreground/40 bg-secondary" />
                            )}
                            <span
                              className={cn(
                                "mt-1 h-8 w-0.5",
                                step3Done ? "bg-[#22C55E]" : "bg-border"
                              )}
                            />
                          </div>
                          <div className="pt-0.5">
                            <p className="text-base font-semibold text-foreground">
                              Generando en {providerLabelById(activeJob.provider_id)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {activeJob.message || "Creando la geometría del modelo 3D…"}
                            </p>
                          </div>
                        </div>

                        {/* Step 4 */}
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center">
                            {step4Done ? (
                              <span className="flex size-8 items-center justify-center rounded-full bg-[#22C55E]/20 text-[#22C55E] ring-1 ring-[#22C55E]/50">
                                <Check className="size-4" />
                              </span>
                            ) : step3Done ? (
                              <span className="btn-primary flex size-8 items-center justify-center rounded-full">
                                <Spinner className="size-4" />
                              </span>
                            ) : (
                              <span className="flex size-8 items-center justify-center rounded-full border-2 border-muted-foreground/40 bg-secondary" />
                            )}
                          </div>
                          <div className="pt-0.5">
                            <p className="text-base font-semibold text-foreground">
                              Procesando malla
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Optimizando la malla y generando el GLB.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Real Progress Bar */}
              <div className="flex items-center gap-4">
                <Progress
                  value={Math.round(activeJob.progress * 100)}
                  className="flex-1 [&_[data-slot=progress-track]]:h-3.5"
                />
                <span className="font-mono text-base font-medium text-foreground">
                  {Math.round(activeJob.progress * 100)}%
                </span>
              </div>
            </CardContent>

            <CardFooter className="flex flex-wrap items-center justify-between gap-4 border-t border-border bg-transparent">
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span>Job ID</span>
                  <Badge variant="outline" className="font-mono">
                    {activeJob.id.slice(0, 12)}
                  </Badge>
                </div>

                <Separator orientation="vertical" className="h-4" />

                <div className="flex items-center gap-2">
                  <span>Tiempo transcurrido</span>
                  <Badge variant="outline" className="font-mono">
                    {formatElapsed(elapsedSeconds)}
                  </Badge>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCancelActiveJob()}
              >
                <X data-icon="inline-start" />
                Cancelar
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {/* =====================================================================
          4. RESULTADO — VISOR 3D REAL + DETALLES + HISTORIAL REAL
         ===================================================================== */}
      {isResultView && activeJob && (
        <div className="flex flex-col gap-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setActiveJob(null)}
                title="Volver"
              >
                <ArrowLeft />
              </Button>
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">Imagen a 3D</h1>
              {activeJob.status === "succeeded" ? (
                <Badge className="h-7 gap-1.5 border border-[#22C55E]/30 bg-[#22C55E]/15 px-3 text-xs text-[#22C55E]">
                  <Check data-icon="inline-start" />
                  Modelo generado
                </Badge>
              ) : (
                <Badge variant="destructive" className="h-7 px-3 text-xs">
                  {activeJob.status === "canceled" ? "Cancelado" : "Falló la generación"}
                </Badge>
              )}
            </div>

            {uploadedAssets.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleCompareModels()}
              >
                <Columns2 data-icon="inline-start" />
                Comparar modelos
              </Button>
            )}
          </header>

          {activeJob.error && <FriendlyErrorAlert error={activeJob.error} />}

          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left 70%: Real 3D Viewport */}
            <div className="lg:col-span-8">
              <ModelViewer3D
                glbUrl={
                  activeJob.output_assets.glb
                    ? assetFileUrl(activeJob.output_assets.glb)
                    : null
                }
                heightClass="h-[460px]"
              />
            </div>

            {/* Right 30%: Real Mesh Details + Export + Usar en Escena 3D */}
            <Card className="flex flex-col justify-between lg:col-span-4">
              <CardHeader>
                <CardTitle className="text-lg font-bold">Detalles</CardTitle>
              </CardHeader>

              <CardContent className="flex flex-col gap-5">
                <dl className="flex flex-col divide-y divide-border text-xs">
                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2.5 text-muted-foreground">
                      <Cpu className="size-4" />
                      <span>Proveedor</span>
                    </dt>
                    <dd className="font-mono text-foreground">
                      {providerLabelById(activeJob.provider_id)}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2.5 text-muted-foreground">
                      <Clock className="size-4" />
                      <span>Tiempo de generación</span>
                    </dt>
                    <dd className="font-mono text-foreground">
                      {getJobDurationSec(activeJob) !== null
                        ? `${getJobDurationSec(activeJob)} s`
                        : "—"}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2.5 text-muted-foreground">
                      <Triangle className="size-4" />
                      <span>Polígonos</span>
                    </dt>
                    <dd className="font-mono text-foreground">
                      {activeJob.mesh_stats
                        ? activeJob.mesh_stats.faces.toLocaleString("en-US")
                        : "—"}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2.5 text-muted-foreground">
                      <Box className="size-4" />
                      <span>Dimensiones (L × A × H)</span>
                    </dt>
                    <dd className="font-mono text-foreground">
                      {activeJob.mesh_stats
                        ? `${activeJob.mesh_stats.dimensions.width_m} × ${activeJob.mesh_stats.dimensions.depth_m} × ${activeJob.mesh_stats.dimensions.height_m} m`
                        : "—"}
                    </dd>
                  </div>

                  <div className="flex items-center justify-between py-2.5">
                    <dt className="flex items-center gap-2.5 text-muted-foreground">
                      <Database className="size-4" />
                      <span>Tamaño del archivo</span>
                    </dt>
                    <dd className="font-mono text-foreground">
                      {activeJob.mesh_stats?.file_size_bytes
                        ? `${(activeJob.mesh_stats.file_size_bytes / (1024 * 1024)).toFixed(2)} MB`
                        : activeJob.mesh_stats
                          ? `${activeJob.mesh_stats.vertices.toLocaleString("en-US")} vértices`
                          : "—"}
                    </dd>
                  </div>
                </dl>

                {/* Exportar modelo (Real asset download links) */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold text-foreground">Exportar modelo</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {(["glb", "obj", "stl"] as const).map((fmt) => {
                      const assetId = activeJob.output_assets[fmt];
                      return (
                        <Button
                          key={fmt}
                          type="button"
                          variant="outline"
                          disabled={!assetId}
                          onClick={() => {
                            if (!assetId) return;
                            const link = document.createElement("a");
                            link.href = assetFileUrl(assetId);
                            link.download = `autem_${activeJob.id.slice(0, 8)}.${fmt}`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                          className={cn(
                            "font-mono text-xs uppercase",
                            fmt === "glb" && assetId && "border-primary bg-primary/10"
                          )}
                        >
                          <Download data-icon="inline-start" />
                          {fmt}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>

              <CardFooter className="border-t border-border bg-transparent">
                {activeJob.output_assets.glb ? (
                  <Link
                    href={`/scene?assetId=${encodeURIComponent(activeJob.output_assets.glb)}`}
                    className="btn-primary flex h-11 w-full items-center justify-center gap-2 rounded-[10px] text-sm font-semibold"
                  >
                    <ChevronRight className="size-4" />
                    Usar en Escena 3D
                  </Link>
                ) : (
                  <Button disabled className="btn-primary h-11 w-full rounded-[10px] opacity-40">
                    Usar en Escena 3D
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>

          {/* Real History Card */}
          <HistoryCard
            history={history}
            activeJobId={activeJob.id}
            providerLabelById={providerLabelById}
            onSelectJob={(job) => setActiveJob(job)}
          />
        </div>
      )}

      {/* =====================================================================
          5. COMPARADOR DE MODELOS REAL
         ===================================================================== */}
      {isComparing && (
        <div className="flex flex-col gap-6">
          <header className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => setIsComparing(false)}
                title="Volver"
              >
                <ArrowLeft />
              </Button>
              <h1 className="text-[28px] font-bold tracking-tight text-foreground">
                Comparar modelos
              </h1>
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-foreground">
              <span className="text-muted-foreground">Sincronizar cámara</span>
              <Switch
                checked={syncCamera}
                onCheckedChange={(next) => {
                  setSyncCamera(next);
                  if (next) setCameraSyncTick((t) => t + 1);
                }}
              />
            </label>
          </header>

          <div className="grid gap-5 lg:grid-cols-12">
            {/* Source Strip */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-xs font-semibold">Imagen original</CardTitle>
              </CardHeader>
              <CardContent>
                {uploadedAssets[0] && (
                  <div className="bg-checkerboard aspect-square w-full overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`${API_URL}${uploadedAssets[0].url}`}
                      alt={uploadedAssets[0].filename}
                      className="size-full object-contain"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Real Comparison Cards */}
            <div className="grid gap-5 md:grid-cols-3 lg:col-span-10">
              {compareJobs.map((job, idx) => {
                const glbId = job.output_assets.glb;
                const duration = getJobDurationSec(job);
                return (
                  <Card
                    key={job.id}
                    className={cn(
                      "flex flex-col justify-between",
                      idx === 0 && "border-2 border-primary"
                    )}
                  >
                    <CardHeader className="flex flex-row items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Box className="size-4 text-foreground" />
                        <CardTitle className="text-sm font-bold">
                          {providerLabelById(job.provider_id)}
                        </CardTitle>
                      </div>
                      <Badge variant="outline" className="font-mono text-[11px]">
                        {job.status}
                      </Badge>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-4">
                      {["queued", "running"].includes(job.status) ? (
                        <div className="flex h-[220px] flex-col items-center justify-center rounded-xl border border-border bg-secondary/30">
                          <AutemLoader
                            compact
                            title={job.message}
                            progress={Math.round(job.progress * 100)}
                          />
                        </div>
                      ) : (
                        <ModelViewer3D
                          glbUrl={glbId ? assetFileUrl(glbId) : null}
                          heightClass="h-[220px]"
                          compact
                          autoRotate={syncCamera}
                          cameraSeed={cameraSyncTick}
                        />
                      )}

                      <dl className="flex flex-col divide-y divide-border text-xs">
                        <div className="flex items-center justify-between py-2">
                          <dt className="flex items-center gap-2 text-muted-foreground">
                            <Triangle className="size-3.5" />
                            <span>Polígonos</span>
                          </dt>
                          <dd className="font-mono text-foreground">
                            {job.mesh_stats ? job.mesh_stats.faces.toLocaleString("en-US") : "—"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <dt className="flex items-center gap-2 text-muted-foreground">
                            <Database className="size-3.5" />
                            <span>Vértices</span>
                          </dt>
                          <dd className="font-mono text-foreground">
                            {job.mesh_stats ? job.mesh_stats.vertices.toLocaleString("en-US") : "—"}
                          </dd>
                        </div>
                        <div className="flex items-center justify-between py-2">
                          <dt className="flex items-center gap-2 text-muted-foreground">
                            <Clock className="size-3.5" />
                            <span>Tiempo</span>
                          </dt>
                          <dd className="font-mono text-foreground">
                            {duration !== null ? `${duration} s` : "—"}
                          </dd>
                        </div>
                      </dl>
                    </CardContent>

                    <CardFooter className="border-t border-border bg-transparent">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={job.status !== "succeeded"}
                        onClick={() => {
                          setIsComparing(false);
                          setActiveJob(job);
                        }}
                        className="w-full"
                      >
                        Elegir este
                      </Button>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ImageTo3DPage() {
  return (
    <Suspense fallback={<AutemLoader title="Inicializando módulo 3D..." />}>
      <ImageTo3DWorkspace />
    </Suspense>
  );
}

function HistoryCard({
  history,
  activeJobId,
  providerLabelById,
  onSelectJob,
}: {
  history: JobRecord[];
  activeJobId: string | null;
  providerLabelById: (id: string) => string;
  onSelectJob: (job: JobRecord) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-base font-semibold text-foreground">
            <Clock className="size-4 text-muted-foreground" />
            <span>Historial</span>
          </div>
          {history.length > 0 && (
            <>
              <Separator orientation="vertical" className="h-4" />
              <span className="text-xs text-muted-foreground">
                Últimas generaciones ({history.length})
              </span>
            </>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {history.length === 0 ? (
          <Empty className="border-0 py-6">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Box className="size-6" />
              </EmptyMedia>
              <EmptyTitle className="text-base font-semibold">
                Aún no has generado modelos
              </EmptyTitle>
              <EmptyDescription className="text-xs">
                Tus últimas generaciones aparecerán aquí
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            {history.map((item) => {
              const active = item.id === activeJobId;
              const thumbAssetId = item.input_asset_ids[0];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectJob(item)}
                  className={cn(
                    "group flex flex-col overflow-hidden rounded-xl border bg-background/60 p-2 text-left transition-all",
                    active ? "border-2 border-primary" : "border-border hover:border-muted-foreground/50"
                  )}
                >
                  <div className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-lg bg-secondary">
                    {thumbAssetId ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={assetFileUrl(thumbAssetId)}
                        alt={providerLabelById(item.provider_id)}
                        className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <Box className="size-6 text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted-foreground">
                    <span className="truncate font-medium text-foreground">
                      {providerLabelById(item.provider_id)}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <Clock className="size-3" />
                      {formatRelativeTime(item.created_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
