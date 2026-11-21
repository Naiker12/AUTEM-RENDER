"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeftRight,
  Clapperboard,
  Download,
  Film,
  Play,
} from "lucide-react";
import { cn } from "cn";
import { AutemLoader } from "@/components/brand/autem-loader";
import { FriendlyErrorAlert } from "@/components/ui/friendly-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MultiImageDropzone } from "@/components/upload/multi-image-dropzone";
import {
  API_URL,
  assetFileUrl,
  createVideoAnimateJob,
  createVideoTransitionJob,
  fetchAssets,
  fetchJobs,
  fetchProviders,
  type AssetInfo,
  type JobRecord,
  type ProviderInfo,
} from "@/lib/api";

const MOTIONS = [
  { id: "push_in", label: "Zoom suave (Push-in)" },
  { id: "pan_right", label: "Paneo lateral" },
  { id: "orbit", label: "Órbita arquitectónica" },
];

function VideoWorkspace() {
  const searchParams = useSearchParams();
  const initialAssetId = searchParams.get("assetId");
  const initialJobId = searchParams.get("jobId");

  const [mode, setMode] = useState<"animate" | "transition">("animate");
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [startAssets, setStartAssets] = useState<AssetInfo[]>([]);
  const [endAssets, setEndAssets] = useState<AssetInfo[]>([]);
  const [cameraMotion, setCameraMotion] = useState("push_in");
  const [seconds, setSeconds] = useState(5);
  const [prompt, setPrompt] = useState(
    "Movimiento cinematográfico de cámara arquitectónica, luz natural fluida"
  );
  const [selectedProvider, setSelectedProvider] = useState("auto");
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(initialJobId);
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetchProviders("video"),
      fetchJobs().catch(() => [] as JobRecord[]),
      initialAssetId ? fetchAssets().catch(() => [] as AssetInfo[]) : Promise.resolve([]),
    ])
      .then(([list, jobList, allAssets]) => {
        setProviders(list);
        const videoJobs = jobList.filter((j) => j.kind === "video");
        setJobs(videoJobs);
        if (initialJobId) {
          setActiveJobId(initialJobId);
        } else if (videoJobs[0]) {
          setActiveJobId(videoJobs[0].id);
        }
        if (initialAssetId) {
          const foundAsset = allAssets.find((a) => a.id === initialAssetId);
          if (foundAsset) setStartAssets([foundAsset]);
        }
        setApiError(null);
      })
      .catch(() => {
        setApiError(`No se pudo conectar con la API en ${API_URL}.`);
      });
  }, [initialAssetId, initialJobId]);

  function subscribeJob(jobId: string, onDone: () => void) {
    const source = new EventSource(`${API_URL}/api/v1/jobs/${jobId}/events`);
    source.onmessage = (event) => {
      const snapshot: JobRecord = JSON.parse(event.data);
      setJobs((prev) =>
        prev.some((j) => j.id === snapshot.id)
          ? prev.map((j) => (j.id === snapshot.id ? snapshot : j))
          : [snapshot, ...prev]
      );
      if (["succeeded", "failed", "canceled"].includes(snapshot.status)) {
        source.close();
        onDone();
      }
    };
    source.onerror = () => {
      source.close();
      onDone();
    };
  }

  async function handleGenerate() {
    setSubmitting(true);
    setApiError(null);
    try {
      const job =
        mode === "animate"
          ? await createVideoAnimateJob({
              assetId: startAssets[0]?.id ?? null,
              prompt,
              cameraMotion,
              seconds,
              providerId: selectedProvider,
            })
          : await createVideoTransitionJob({
              startAssetId: startAssets[0]?.id ?? null,
              endAssetId: endAssets[0]?.id ?? null,
              prompt,
              seconds,
              providerId: selectedProvider,
            });
      setJobs((prev) => [job, ...prev]);
      setActiveJobId(job.id);
      subscribeJob(job.id, () => setSubmitting(false));
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Error generando video");
      setSubmitting(false);
    }
  }

  const activeJob = jobs.find((j) => j.id === activeJobId) ?? jobs[0] ?? null;
  const mp4AssetId = activeJob?.output_assets.mp4 ?? null;
  const webpAssetId = activeJob?.output_assets.webp ?? null;
  const activeMediaId = mp4AssetId ?? webpAssetId;
  const activeMediaExt = mp4AssetId ? "MP4" : webpAssetId ? "WEBP" : null;

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">
            Video Arquitectónico
          </h1>
          <p className="text-sm text-muted-foreground">
            Anima un render o crea transiciones cinematográficas entre dos vistas (Wan 2.2 /
            LTX-2.5 / API).
          </p>
        </div>

        <Tabs
          value={mode}
          onValueChange={(val) => setMode(val as "animate" | "transition")}
        >
          <TabsList>
            <TabsTrigger value="animate" className="gap-1.5 px-3 text-xs">
              <Film className="size-3.5" />
              Animar (1 imagen)
            </TabsTrigger>
            <TabsTrigger value="transition" className="gap-1.5 px-3 text-xs">
              <ArrowLeftRight className="size-3.5" />
              Transición (2 renders)
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      {Boolean(apiError) && (
        <FriendlyErrorAlert error={apiError} onDismiss={() => setApiError(null)} />
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Controles */}
        <div className="flex flex-col gap-4 lg:col-span-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                {mode === "animate" ? "1. Imagen inicial" : "1. Primer y último cuadro"}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-muted-foreground">
                  {mode === "animate" ? "Render o foto" : "Cuadro inicial (Start)"}
                </p>
                <MultiImageDropzone
                  assets={startAssets}
                  onChange={setStartAssets}
                  maxImages={1}
                />
              </div>

              {mode === "transition" && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs text-muted-foreground">Cuadro final (End)</p>
                  <MultiImageDropzone assets={endAssets} onChange={setEndAssets} maxImages={1} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                2. Cámara, Duración y Modelo
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {mode === "animate" && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Movimiento de cámara</span>
                  <div className="grid grid-cols-3 gap-2">
                    {MOTIONS.map((m) => (
                      <Button
                        key={m.id}
                        type="button"
                        variant="outline"
                        size="xs"
                        onClick={() => setCameraMotion(m.id)}
                        className={cn(
                          "h-8",
                          cameraMotion === m.id && "border-primary bg-primary/15 text-foreground"
                        )}
                      >
                        {m.label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Prompt de movimiento</span>
                <textarea
                  rows={2}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Duración</span>
                  <Select
                    value={String(seconds)}
                    onValueChange={(v) => {
                      if (v) setSeconds(Number(v));
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="3">3 segundos</SelectItem>
                        <SelectItem value="5">5 segundos (Recomendado)</SelectItem>
                        <SelectItem value="8">8 segundos</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Motor</span>
                  <Select
                    value={selectedProvider}
                    onValueChange={(v) => {
                      if (v) setSelectedProvider(v);
                    }}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="auto">Auto (fallback)</SelectItem>
                        {providers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label} {p.available ? "" : "(inactivo)"}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="button"
                size="lg"
                onClick={() => void handleGenerate()}
                disabled={submitting}
                className="btn-primary h-11 w-full rounded-[10px] font-semibold"
              >
                {submitting ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <Play data-icon="inline-start" />
                )}
                {submitting
                  ? "Generando clip..."
                  : mode === "animate"
                    ? "Animar imagen"
                    : "Generar transición"}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Reproductor */}
        <div className="flex flex-col gap-4 lg:col-span-7">
          <Card className="overflow-hidden py-0">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-secondary/40 py-3">
              <div>
                <CardTitle className="text-xs font-semibold">
                  {activeJob
                    ? String(activeJob.params.label ?? "Video generado")
                    : "Reproductor de Video"}
                </CardTitle>
                <CardDescription className="text-[11px]">
                  {activeJob
                    ? `${activeJob.provider_id} · ${activeJob.message}`
                    : "Genera una animación o transición para verla aquí"}
                </CardDescription>
              </div>
              {activeMediaId && activeMediaExt && (
                <Button
                  render={<a href={assetFileUrl(activeMediaId)} download />}
                  variant="outline"
                  size="xs"
                >
                  <Download data-icon="inline-start" />
                  {activeMediaExt}
                </Button>
              )}
            </CardHeader>

            <CardContent className="flex h-[420px] items-center justify-center bg-background p-0">
              {submitting ||
              (activeJob !== null && ["queued", "running"].includes(activeJob.status)) ? (
                <AutemLoader
                  title="Generando recorrido de cámara..."
                  subtitle={activeJob?.message ?? "PROCESANDO CUADROS DE VIDEO"}
                  progress={activeJob ? Math.round(activeJob.progress * 100) : null}
                />
              ) : mp4AssetId ? (
                <video
                  src={assetFileUrl(mp4AssetId)}
                  controls
                  autoPlay
                  loop
                  className="size-full object-contain"
                />
              ) : webpAssetId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={assetFileUrl(webpAssetId)}
                  alt="Clip animado generado"
                  className="size-full object-contain"
                />
              ) : (
                <Empty className="h-full border-0">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <Clapperboard />
                    </EmptyMedia>
                    <EmptyTitle>Sin clip generado todavía</EmptyTitle>
                    <EmptyDescription>
                      Soporta Animar (1 imagen) y Transición FLF2V (2 imágenes) con Wan 2.2 y
                      LTX-2.5.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </CardContent>
          </Card>

          {jobs.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {jobs.slice(0, 6).map((item) => (
                <Card
                  key={item.id}
                  size="sm"
                  onClick={() => setActiveJobId(item.id)}
                  className={cn(
                    "cursor-pointer transition",
                    activeJob?.id === item.id && "ring-2 ring-primary"
                  )}
                >
                  <CardContent>
                    <p className="truncate text-xs font-medium text-foreground">
                      {String(item.params.label ?? item.provider_id)}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {item.message}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VideoPage() {
  return (
    <Suspense fallback={<AutemLoader title="Inicializando estudio de Video..." />}>
      <VideoWorkspace />
    </Suspense>
  );
}
