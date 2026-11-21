"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Camera,
  Check,
  Copy,
  ExternalLink,
  Layers3,
  Share2,
  Upload,
} from "lucide-react";
import type { OrbitCanvasHandle } from "@/components/viewer3d/orbit-canvas";
import { FriendlyErrorAlert } from "@/components/ui/friendly-error";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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

function SceneWorkspace() {
  const searchParams = useSearchParams();
  const initialAssetId = searchParams.get("assetId");
  const initialSceneId = searchParams.get("sceneId");

  const canvasRef = useRef<OrbitCanvasHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [scene, setScene] = useState<SceneRecord | null>(null);
  const [savedScenes, setSavedScenes] = useState<SceneRecord[]>([]);
  const [sceneName, setSceneName] = useState("Escena Arquitectónica 3D");
  const [activeCamera, setActiveCamera] = useState<CameraSpec | null>(null);
  const [viewName, setViewName] = useState("Fachada Principal");
  const [style, setStyle] = useState("photoreal");
  const [lighting, setLighting] = useState("golden_hour");
  const [viewJobs, setViewJobs] = useState<Record<string, JobRecord>>({});
  const [sharePath, setSharePath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            setSharePath(found.share_token ? `/share/${found.share_token}` : null);
            return;
          }
        }

        if (initialAssetId) {
          const existingForAsset = list.find((s) => s.source_asset_id === initialAssetId);
          if (existingForAsset) {
            setScene(existingForAsset);
            setSharePath(
              existingForAsset.share_token ? `/share/${existingForAsset.share_token}` : null
            );
          } else {
            try {
              setBusy(true);
              const created = await createScene({
                name: sceneName,
                assetId: initialAssetId,
              });
              if (!mounted) return;
              setScene(created);
              setSavedScenes((prev) => [created, ...prev]);
            } catch (err) {
              if (mounted) {
                setError(
                  err instanceof Error ? err.message : "No se pudo cargar el modelo en Escena 3D."
                );
              }
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
  }, [initialAssetId, initialSceneId, sceneName]);

  async function handleUploadMesh(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const asset = await uploadImageAsset(file);
      const created = await createScene({
        name: file.name.replace(/\.[^.]+$/, "") || sceneName,
        assetId: asset.id,
      });
      setScene(created);
      setSavedScenes((prev) => [created, ...prev]);
      setSharePath(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error importando modelo 3D");
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
    if (!scene || !canvasRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const captured = await canvasRef.current.captureView();
      if (!captured) throw new Error("No se pudo capturar la cámara actual.");

      const file = new File([captured.blob], `${viewName}.png`, { type: "image/png" });
      const thumbAsset = await uploadImageAsset(file);

      const view = await addSceneView(scene.id, {
        name: viewName,
        camera: captured.camera,
        thumbnailAssetId: thumbAsset.id,
        triggerRender: true,
        style,
        lighting,
      });

      setScene((prev) => (prev ? { ...prev, views: [...prev.views, view] } : prev));
      setViewName(`Vista ${scene.views.length + 2}`);

      if (view.render_job_id) {
        pollRenderJob(view.id, view.render_job_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando vista");
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (!scene) return;
    setBusy(true);
    setError(null);
    try {
      const res = await createShareLink(scene.id);
      setSharePath(res.share_path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creando link");
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

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[28px] font-bold tracking-tight text-foreground">
            Escena 3D (Orbit)
          </h1>
          <p className="text-sm text-muted-foreground">
            Importa un modelo GLB, GLTF, OBJ o STL, guarda cámaras con render IA y comparte la
            escena.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf,.obj,.stl"
            className="hidden"
            onChange={(e) => void handleUploadMesh(e.target.files?.[0])}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Spinner data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
            Importar GLB / OBJ / STL
          </Button>

          {scene && (
            <Button
              type="button"
              onClick={() => void handleShare()}
              disabled={busy}
              className="btn-primary font-semibold"
            >
              <Share2 data-icon="inline-start" />
              Compartir con cliente
            </Button>
          )}
        </div>
      </header>

      {Boolean(error) && (
        <FriendlyErrorAlert error={error} onDismiss={() => setError(null)} />
      )}

      {sharePath && (
        <Alert>
          <AlertTitle>Link público listo para comentarios 3D anclados</AlertTitle>
          <AlertDescription className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <span className="font-mono text-xs text-foreground">{sharePath}</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copyShareLink}>
                {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
                {copied ? "Copiado" : "Copiar URL"}
              </Button>
              <Button render={<Link href={sharePath} />} size="sm" className="btn-primary">
                Abrir vista cliente
                <ExternalLink data-icon="inline-end" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {!scene ? (
        <div className="flex flex-col gap-6">
          <Card>
            <CardContent>
              <Empty className="border-0 py-12">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Layers3 />
                  </EmptyMedia>
                  <EmptyTitle>Ninguna escena 3D abierta</EmptyTitle>
                  <EmptyDescription>
                    Importa un archivo 3D (.glb, .gltf, .obj, .stl) desde tu equipo o envía un
                    modelo generado desde Imagen a 3D.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent className="flex flex-col items-center gap-3">
                  <Input
                    type="text"
                    value={sceneName}
                    onChange={(e) => setSceneName(e.target.value)}
                    placeholder="Nombre de la escena..."
                    className="w-72 text-center"
                  />
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={busy}
                    className="btn-primary font-semibold"
                  >
                    <Upload data-icon="inline-start" />
                    Subir archivo 3D
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>

          {savedScenes.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                Escenas guardadas ({savedScenes.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-3">
                {savedScenes.map((item) => (
                  <Card
                    key={item.id}
                    onClick={() => {
                      setScene(item);
                      setSharePath(item.share_token ? `/share/${item.share_token}` : null);
                    }}
                    className="cursor-pointer transition-colors hover:ring-primary"
                  >
                    <CardHeader>
                      <CardTitle className="text-sm font-semibold">{item.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs text-muted-foreground">
                      {item.views.length} vista(s) guardada(s)
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-8">
            <OrbitCanvas
              ref={canvasRef}
              glbUrl={assetFileUrl(scene.source_asset_id)}
              activeCamera={activeCamera}
            />

            <Card>
              <CardContent className="flex flex-wrap items-end gap-3 pt-2">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Nombre de la vista</span>
                  <Input
                    type="text"
                    value={viewName}
                    onChange={(e) => setViewName(e.target.value)}
                  />
                </label>

                <label className="flex w-36 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Estilo</span>
                  <select
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground"
                  >
                    <option value="photoreal">Photoreal</option>
                    <option value="clay">Clay</option>
                    <option value="linework">Linework</option>
                  </select>
                </label>

                <label className="flex w-36 flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">Iluminación</span>
                  <select
                    value={lighting}
                    onChange={(e) => setLighting(e.target.value)}
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-xs text-foreground"
                  >
                    <option value="midday">Mediodía</option>
                    <option value="golden_hour">Atardecer</option>
                    <option value="night">Noche</option>
                    <option value="overcast">Nublado</option>
                  </select>
                </label>

                <Button
                  type="button"
                  onClick={() => void handleSaveViewAndRender()}
                  disabled={busy}
                  className="btn-primary font-semibold"
                >
                  {busy ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <Camera data-icon="inline-start" />
                  )}
                  Guardar vista + Renderizar
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-3 lg:col-span-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">
                Vistas guardadas ({scene.views.length})
              </h2>
              <span className="text-[11px] text-muted-foreground">Clic para ir a cámara</span>
            </div>

            {scene.views.length === 0 ? (
              <Card>
                <CardContent className="py-6 text-center text-xs text-muted-foreground">
                  Orbita el modelo y pulsa <strong>Guardar vista + Renderizar</strong> para
                  capturar una cámara exacta.
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-3">
                {scene.views.map((view: SceneViewRecord) => {
                  const rJob = viewJobs[view.id];
                  const renderedPngId = rJob?.output_assets.png ?? null;
                  return (
                    <Card
                      key={view.id}
                      onClick={() => setActiveCamera({ ...view.camera })}
                      className="cursor-pointer overflow-hidden py-0 transition hover:ring-primary"
                    >
                      <div className="grid grid-cols-2 gap-0.5 bg-background">
                        <div className="relative h-28 bg-secondary">
                          {view.thumbnail_asset_id && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={assetFileUrl(view.thumbnail_asset_id)}
                              alt="Captura 3D"
                              className="size-full object-cover"
                            />
                          )}
                          <Badge
                            variant="secondary"
                            className="absolute bottom-1.5 left-1.5 text-[10px]"
                          >
                            Cámara 3D
                          </Badge>
                        </div>
                        <div className="relative flex h-28 items-center justify-center bg-secondary">
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
                          <Badge className="btn-primary absolute right-1.5 bottom-1.5 text-[10px]">
                            Render IA
                          </Badge>
                        </div>
                      </div>
                      <CardContent className="py-2.5">
                        <p className="text-xs font-medium text-foreground">{view.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          Pos: [{view.camera.position.join(", ")}] ·{" "}
                          {rJob?.message ?? "En espera / Renderizando"}
                        </p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
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
