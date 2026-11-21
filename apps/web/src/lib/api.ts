export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface FriendlyError {
  code: string;
  title: string;
  detail: string;
  hint?: string | null;
  action_url?: string | null;
  action_label?: string | null;
}

export class ApiClientError extends Error {
  readonly payload: FriendlyError;

  constructor(payload: FriendlyError) {
    super(payload.detail);
    this.name = "ApiClientError";
    this.payload = payload;
  }
}

export function parseFriendlyError(err: unknown): FriendlyError {
  if (err instanceof ApiClientError) {
    return err.payload;
  }
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const lower = raw.toLowerCase();

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("no se pudo conectar") ||
    lower.includes("aborted")
  ) {
    return {
      code: "BACKEND_OFFLINE",
      title: "Servidor local en espera",
      detail: "Aún no hay comunicación con el servicio local de Autem Render (:8000).",
      hint: "Inicia el servidor backend o verifica tu conexión local.",
    };
  }

  if (lower.includes("ningún provider") || lower.includes("503") || lower.includes("fal_key")) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      title: "Motor de IA pendiente de activar",
      detail:
        raw ||
        "Para generar necesitas encender ComfyUI en tu equipo o activar un proveedor externo.",
      hint: "Configura tu motor preferido en un par de clics.",
      action_url: "/settings",
      action_label: "Configurar motor",
    };
  }

  return {
    code: "CLIENT_ERROR",
    title: "Aviso del estudio",
    detail: raw || "Ocurrió un inconveniente al procesar la solicitud.",
    hint: "Intenta de nuevo o verifica el estado de tus motores en Configuración.",
  };
}

async function unwrapResponse<T>(res: Response, fallbackTitle = "Aviso del servidor"): Promise<T> {
  if (res.ok) {
    return (await res.json()) as T;
  }

  const body = await res
    .json()
    .catch(() => ({ detail: `El servidor respondió con estado ${res.status}.` }));

  if (body && typeof body === "object" && "error" in body && body.error) {
    const errObj = body.error as FriendlyError;
    throw new ApiClientError({
      code: errObj.code ?? `HTTP_${res.status}`,
      title: errObj.title ?? fallbackTitle,
      detail: errObj.detail ?? body.detail ?? fallbackTitle,
      hint: errObj.hint ?? null,
      action_url: errObj.action_url ?? null,
      action_label: errObj.action_label ?? null,
    });
  }

  const detailStr =
    typeof body?.detail === "string"
      ? body.detail
      : `${fallbackTitle} (código ${res.status}).`;

  throw new ApiClientError(parseFriendlyError(detailStr));
}

// Ultra-fast in-memory SWR cache so page transitions render in 0ms
interface CacheEntry<T> {
  data: T;
  ts: number;
}
const _apiCache = new Map<string, CacheEntry<unknown>>();
const _inflight = new Map<string, Promise<unknown>>();
const CACHE_TTL_MS = 15_000;

export function invalidateApiCache(prefix?: string): void {
  if (!prefix) {
    _apiCache.clear();
    return;
  }
  for (const key of _apiCache.keys()) {
    if (key.startsWith(prefix)) _apiCache.delete(key);
  }
}

async function cachedJsonGet<T>(path: string, errorLabel: string): Promise<T> {
  const now = Date.now();
  const hit = _apiCache.get(path) as CacheEntry<T> | undefined;

  const doFetch = async (): Promise<T> => {
    try {
      const res = await fetch(`${API_URL}${path}`, { cache: "no-store" });
      const data = await unwrapResponse<T>(res, errorLabel);
      _apiCache.set(path, { data, ts: Date.now() });
      return data;
    } catch (err) {
      throw err instanceof ApiClientError ? err : new ApiClientError(parseFriendlyError(err));
    }
  };

  // Fresh cache hit: return instantly in 0ms
  if (hit && now - hit.ts < CACHE_TTL_MS) {
    return hit.data;
  }

  // Deduplicate concurrent identical requests
  const existing = _inflight.get(path) as Promise<T> | undefined;
  if (existing) {
    return hit ? hit.data : existing;
  }

  const req = doFetch().finally(() => {
    _inflight.delete(path);
  });
  _inflight.set(path, req);

  // Stale-while-revalidate: return stale immediately while refreshing in background
  if (hit) {
    void req.catch(() => {});
    return hit.data;
  }
  return req;
}

export function prefetchRouteData(href: string): void {
  if (href === "/settings") {
    void fetchProviderSettings().catch(() => {});
    void fetchProviders("").catch(() => {});
    void fetchCostLedger().catch(() => {});
  } else if (href === "/image-to-3d") {
    void fetchProviders("image_to_3d").catch(() => {});
    void fetchCostSummary().catch(() => {});
  } else if (href === "/render") {
    void fetchProviders("render").catch(() => {});
  } else if (href === "/video") {
    void fetchProviders("video").catch(() => {});
  } else if (href === "/projects") {
    void fetchJobs().catch(() => {});
    void fetchScenes().catch(() => {});
  } else if (href === "/scene") {
    void fetchAssets("mesh").catch(() => {});
  }
}

export interface ProviderInfo {
  id: string;
  label: string;
  kind: string;
  where: string;
  available: boolean;
  est_cost_usd: number | null;
  est_seconds: number;
  outputs: string[];
  notes: string;
}

export interface AssetInfo {
  id: string;
  kind: string;
  filename: string;
  mime: string;
  size: number;
  url: string;
  created_at: string;
}

export interface MeshStats {
  vertices: number;
  faces: number;
  dimensions: {
    width_m: number;
    height_m: number;
    depth_m: number;
  };
  formats: string[];
  file_size_bytes?: number;
}

export interface JobRecord {
  id: string;
  kind: string;
  provider_id: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  progress: number;
  message: string;
  params: Record<string, unknown>;
  input_asset_ids: string[];
  output_assets: Record<string, string>;
  output_mesh_path: string | null;
  mesh_stats: MeshStats | null;
  cost_usd: number | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface CostSummary {
  day: string;
  spent_today_usd: number;
  daily_limit_usd: number;
  remaining_usd: number;
}

export function assetFileUrl(assetId: string): string {
  return `${API_URL}/api/v1/assets/${assetId}/file`;
}

export async function fetchProviders(kind = "image_to_3d"): Promise<ProviderInfo[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  return cachedJsonGet<ProviderInfo[]>(`/api/v1/providers${qs}`, "Error cargando providers");
}

export async function fetchCostSummary(): Promise<CostSummary> {
  return cachedJsonGet<CostSummary>("/api/v1/jobs/cost/summary", "Error cargando presupuesto");
}

export async function uploadImageAsset(file: File): Promise<AssetInfo> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_URL}/api/v1/assets`, {
    method: "POST",
    body: form,
  });
  const data = await unwrapResponse<AssetInfo>(res, "No se pudo subir el archivo");
  invalidateApiCache("/api/v1/assets");
  return data;
}

export async function createImageTo3DJob(params: {
  assetIds: string[];
  providerId: string;
  targetHeightM?: number | null;
  seed?: number | null;
  extra?: Record<string, unknown>;
}): Promise<JobRecord> {
  const res = await fetch(`${API_URL}/api/v1/jobs/image-to-3d`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      asset_ids: params.assetIds,
      provider_id: params.providerId,
      target_height_m: params.targetHeightM ?? null,
      seed: params.seed ?? null,
      export_formats: ["glb", "obj", "stl"],
      extra: params.extra ?? {},
    }),
  });
  return unwrapResponse<JobRecord>(res, "No se pudo iniciar la generación 3D");
}

export async function compareImageTo3DJobs(params: {
  assetIds: string[];
  providerIds: string[];
  targetHeightM?: number | null;
  seed?: number | null;
}): Promise<JobRecord[]> {
  const res = await fetch(`${API_URL}/api/v1/jobs/image-to-3d/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      asset_ids: params.assetIds,
      provider_ids: params.providerIds,
      target_height_m: params.targetHeightM ?? null,
      seed: params.seed ?? 42,
    }),
  });
  return unwrapResponse<JobRecord[]>(res, "No se pudo iniciar la comparación de modelos");
}

export async function createRenderJob(params: {
  assetId?: string | null;
  prompt: string;
  style: string;
  material: string;
  lighting: string;
  resolution: string;
  providerId: string;
  seed?: number | null;
}): Promise<JobRecord> {
  const res = await fetch(`${API_URL}/api/v1/jobs/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      asset_id: params.assetId ?? null,
      prompt: params.prompt,
      style: params.style,
      material: params.material,
      lighting: params.lighting,
      resolution: params.resolution,
      provider_id: params.providerId,
      seed: params.seed ?? null,
    }),
  });
  return unwrapResponse<JobRecord>(res, "No se pudo iniciar el render");
}

export async function createExploreRenderJobs(params: {
  assetId?: string | null;
  prompt: string;
  providerId: string;
  seed?: number | null;
}): Promise<JobRecord[]> {
  const res = await fetch(`${API_URL}/api/v1/jobs/render/explore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      asset_id: params.assetId ?? null,
      prompt: params.prompt,
      provider_id: params.providerId,
      seed: params.seed ?? 42,
    }),
  });
  return unwrapResponse<JobRecord[]>(res, "No se pudieron generar las variaciones");
}

export async function createUpscaleJob(params: {
  assetId: string;
  scale?: number;
  providerId?: string;
}): Promise<JobRecord> {
  const res = await fetch(`${API_URL}/api/v1/jobs/upscale`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      asset_id: params.assetId,
      scale: params.scale ?? 2,
      provider_id: params.providerId ?? "auto",
    }),
  });
  return unwrapResponse<JobRecord>(res, "No se pudo mejorar la imagen");
}

export async function createVideoAnimateJob(params: {
  assetId?: string | null;
  prompt: string;
  cameraMotion: string;
  seconds: number;
  providerId: string;
}): Promise<JobRecord> {
  const res = await fetch(`${API_URL}/api/v1/jobs/video/animate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      asset_id: params.assetId ?? null,
      prompt: params.prompt,
      camera_motion: params.cameraMotion,
      seconds: params.seconds,
      provider_id: params.providerId,
    }),
  });
  return unwrapResponse<JobRecord>(res, "No se pudo generar la animación de video");
}

export async function createVideoTransitionJob(params: {
  startAssetId?: string | null;
  endAssetId?: string | null;
  prompt: string;
  seconds: number;
  providerId: string;
}): Promise<JobRecord> {
  const res = await fetch(`${API_URL}/api/v1/jobs/video/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start_asset_id: params.startAssetId ?? null,
      end_asset_id: params.endAssetId ?? null,
      prompt: params.prompt,
      seconds: params.seconds,
      provider_id: params.providerId,
    }),
  });
  return unwrapResponse<JobRecord>(res, "No se pudo generar la transición de video");
}

export interface CameraSpec {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface SceneViewRecord {
  id: string;
  scene_id: string;
  name: string;
  camera: CameraSpec;
  thumbnail_asset_id: string | null;
  render_job_id: string | null;
  created_at: string;
}

export interface SceneRecord {
  id: string;
  name: string;
  source_asset_id: string;
  share_token: string | null;
  views: SceneViewRecord[];
  created_at: string;
}

export interface CommentRecord {
  id: string;
  author: string;
  text: string;
  anchor: [number, number, number];
  created_at: string;
}

export async function fetchJobs(): Promise<JobRecord[]> {
  const res = await fetch(`${API_URL}/api/v1/jobs`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error cargando jobs (${res.status})`);
  return res.json();
}

export async function fetchJob(jobId: string): Promise<JobRecord> {
  const res = await fetch(`${API_URL}/api/v1/jobs/${jobId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error cargando job (${res.status})`);
  return res.json();
}

export async function cancelJob(jobId: string): Promise<JobRecord> {
  const res = await fetch(`${API_URL}/api/v1/jobs/${jobId}/cancel`, {
    method: "POST",
  });
  return unwrapResponse<JobRecord>(res, "No se pudo cancelar el trabajo");
}

export async function fetchScenes(): Promise<SceneRecord[]> {
  const res = await fetch(`${API_URL}/api/v1/scenes`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error cargando escenas (${res.status})`);
  return res.json();
}

export async function fetchAssets(kind?: string): Promise<AssetInfo[]> {
  const qs = kind ? `?kind=${encodeURIComponent(kind)}` : "";
  const res = await fetch(`${API_URL}/api/v1/assets${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Error cargando activos (${res.status})`);
  return res.json();
}

export interface CloudProviderStatus {
  id: string;
  label: string;
  env_var: string;
  placeholder: string;
  models: string;
  docs_url: string;
  short_url: string;
  pricing: "free" | "paid";
  configured: boolean;
  preview: string | null;
}

export interface LocalEngineStatus {
  id: string;
  label: string;
  env_var: string;
  url: string;
  models: string;
  online: boolean;
}

export interface ProviderSettings {
  fal_key_configured: boolean;
  fal_key_preview: string | null;
  comfyui_url: string;
  comfyui_online: boolean;
  daily_cost_limit_usd: number;
  free_only_mode: boolean;
  cloud_providers: CloudProviderStatus[];
  local_engines: LocalEngineStatus[];
  defaults: Record<string, string>;
  active_engines_count: number;
}

export interface CostLedger {
  today_usd: number;
  last_7d_usd: number;
  month_usd: number;
  all_time_usd: number;
  daily_limit_usd: number;
  remaining_today_usd: number;
  free_only_mode: boolean;
  paid_jobs_count: number;
  free_jobs_count: number;
  by_provider: { provider_id: string; jobs_count: number; total_usd: number }[];
  recent_items: {
    id: string;
    kind: string;
    provider_id: string;
    status: string;
    cost_usd: number;
    message: string;
    created_at: string;
  }[];
}

export interface TestProviderResult {
  provider_id: string;
  ok: boolean;
  latency_ms: number;
  detail: string;
}

export async function fetchCostLedger(): Promise<CostLedger> {
  return cachedJsonGet<CostLedger>("/api/v1/jobs/cost/ledger", "Error cargando contabilidad");
}

export async function fetchProviderSettings(): Promise<ProviderSettings> {
  return cachedJsonGet<ProviderSettings>("/api/v1/settings/providers", "Error cargando configuración");
}

export async function updateProviderSettings(params: {
  cloud_keys?: Record<string, string>;
  local_urls?: Record<string, string>;
  defaults?: Record<string, string>;
  daily_cost_limit_usd?: number;
  free_only_mode?: boolean;
}): Promise<ProviderSettings> {
  const res = await fetch(`${API_URL}/api/v1/settings/providers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await unwrapResponse<ProviderSettings>(res, "No se pudo guardar la configuración");
  invalidateApiCache();
  return data;
}

export async function testProviderConnection(providerId: string): Promise<TestProviderResult> {
  const res = await fetch(`${API_URL}/api/v1/settings/providers/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider_id: providerId }),
  });
  return unwrapResponse<TestProviderResult>(res, "No se pudo verificar la conexión");
}

export async function createScene(params: {
  name: string;
  assetId?: string | null;
}): Promise<SceneRecord> {
  const res = await fetch(`${API_URL}/api/v1/scenes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: params.name, asset_id: params.assetId ?? null }),
  });
  return unwrapResponse<SceneRecord>(res, "No se pudo crear la escena 3D");
}

export async function addSceneView(
  sceneId: string,
  params: {
    name: string;
    camera: CameraSpec;
    thumbnailAssetId?: string | null;
    triggerRender?: boolean;
    style?: string;
    material?: string;
    lighting?: string;
  }
): Promise<SceneViewRecord> {
  const res = await fetch(`${API_URL}/api/v1/scenes/${sceneId}/views`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      camera: params.camera,
      thumbnail_asset_id: params.thumbnailAssetId ?? null,
      trigger_render: params.triggerRender ?? true,
      style: params.style ?? "photoreal",
      material: params.material ?? "concrete",
      lighting: params.lighting ?? "golden_hour",
    }),
  });
  if (!res.ok) throw new Error(`Error guardando vista (${res.status})`);
  return res.json();
}

export async function createShareLink(
  sceneId: string
): Promise<{ token: string; share_path: string }> {
  const res = await fetch(`${API_URL}/api/v1/scenes/${sceneId}/share`, { method: "POST" });
  if (!res.ok) throw new Error(`Error creando link compartido (${res.status})`);
  return res.json();
}

export async function fetchSharedScene(
  token: string
): Promise<{ scene: SceneRecord; comments: CommentRecord[] }> {
  const res = await fetch(`${API_URL}/api/v1/share/${token}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Link compartido no encontrado (${res.status})`);
  return res.json();
}

export async function postSharedComment(
  token: string,
  params: { author: string; text: string; anchor: [number, number, number] }
): Promise<CommentRecord> {
  const res = await fetch(`${API_URL}/api/v1/share/${token}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Error enviando comentario (${res.status})`);
  return res.json();
}
