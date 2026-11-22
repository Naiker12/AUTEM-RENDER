"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpDown,
  Box,
  Clapperboard,
  ExternalLink,
  Folder,
  Image as ImageIcon,
  Layers3,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { StudioContextMenu, type ContextMenuItem } from "@/components/ui/studio-context-menu";
import {
  assetFileUrl,
  createProjectFolder,
  deleteJob,
  deleteProjectFolder,
  deleteScene,
  fetchJobs,
  fetchProjectFolders,
  fetchScenes,
  isApiCircuitOffline,
  peekApiCache,
  type JobRecord,
  type ProjectFolderRecord,
  type SceneRecord,
} from "@/lib/api";
import { toast } from "@/stores/toast-store";

interface FolderRecord {
  id: string;
  name: string;
  createdAt: string;
}

interface RealProjectCard {
  id: string;
  title: string;
  kind: "3D" | "Render" | "Video" | "Escena 3D";
  href: string;
  thumbUrl: string | null;
  createdAt: string;
  status: string;
}

function mapJobsAndScenesToCards(
  jobs: JobRecord[],
  scenes: SceneRecord[]
): RealProjectCard[] {
  const mappedJobs: RealProjectCard[] = jobs.map((job) => {
    const is3D = job.kind === "image_to_3d";
    const isVideo = job.kind === "video";
    const thumbId =
      job.output_assets.png ??
      job.output_assets.webp ??
      job.input_asset_ids[0] ??
      null;

    return {
      id: job.id,
      title: String(
        job.params.label ??
          (is3D
            ? `Modelo 3D · ${job.provider_id}`
            : isVideo
              ? `Video · ${job.provider_id}`
              : `Render · ${job.provider_id}`)
      ),
      kind: is3D ? "3D" : isVideo ? "Video" : "Render",
      href: is3D
        ? `/image-to-3d?jobId=${encodeURIComponent(job.id)}`
        : isVideo
          ? `/video?jobId=${encodeURIComponent(job.id)}`
          : `/render?jobId=${encodeURIComponent(job.id)}`,
      thumbUrl: thumbId ? assetFileUrl(thumbId) : null,
      createdAt: job.created_at,
      status: job.status,
    };
  });

  const mappedScenes: RealProjectCard[] = scenes.map((scene) => ({
    id: scene.id,
    title: scene.name,
    kind: "Escena 3D",
    href: `/scene?sceneId=${encodeURIComponent(scene.id)}`,
    thumbUrl: scene.views[0]?.thumbnail_asset_id
      ? assetFileUrl(scene.views[0].thumbnail_asset_id)
      : null,
    createdAt: scene.created_at,
    status: "succeeded",
  }));

  return [...mappedScenes, ...mappedJobs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function formatRelativeTime(isoDate: string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000));
  if (diffSec < 60) return "hace unos seg";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `hace ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `hace ${diffDays} días`;
}

export default function ProjectsPage() {
  const [folders, setFolders] = useState<FolderRecord[]>([]);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  const [projects, setProjects] = useState<RealProjectCard[]>(() => {
    const cachedJobs = peekApiCache<JobRecord[]>("/api/v1/jobs") ?? [];
    const cachedScenes = peekApiCache<SceneRecord[]>("/api/v1/scenes") ?? [];
    return mapJobsAndScenesToCards(cachedJobs, cachedScenes);
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const hasCache =
      peekApiCache("/api/v1/jobs") !== undefined ||
      peekApiCache("/api/v1/scenes") !== undefined;
    return !hasCache && !isApiCircuitOffline();
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    project?: RealProjectCard;
    folder?: FolderRecord;
  } | null>(null);
  const [projectPendingDelete, setProjectPendingDelete] = useState<RealProjectCard | null>(null);
  const [folderPendingDelete, setFolderPendingDelete] = useState<FolderRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetchJobs().catch(() => [] as JobRecord[]),
      fetchScenes().catch(() => [] as SceneRecord[]),
      fetchProjectFolders().catch(() => [] as ProjectFolderRecord[]),
    ])
      .then(([jobs, scenes, serverFolders]) => {
        if (!mounted) return;
        setProjects(mapJobsAndScenesToCards(jobs, scenes));
        setFolders(
          serverFolders.map((f) => ({ id: f.id, name: f.name, createdAt: f.created_at }))
        );
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    try {
      const created = await createProjectFolder(trimmed);
      setFolders((prev) => [
        { id: created.id, name: created.name, createdAt: created.created_at },
        ...prev,
      ]);
      setNewFolderName("");
      setFolderDialogOpen(false);
      toast.success({
        title: "Carpeta creada",
        description: `"${created.name}" guardada en el servidor.`,
      });
    } catch (err) {
      toast.error({
        title: "No se pudo crear la carpeta",
        description: err instanceof Error ? err.message : "Inténtalo nuevamente.",
      });
    }
  }

  async function handleDeleteFolderConfirmed() {
    if (!folderPendingDelete) return;
    const target = folderPendingDelete;
    setDeleting(true);
    try {
      await deleteProjectFolder(target.id);
      setFolders((prev) => prev.filter((f) => f.id !== target.id));
      setFolderPendingDelete(null);
      toast.success({
        title: "Carpeta eliminada",
        description: `Se eliminó la carpeta "${target.name}".`,
      });
    } catch (err) {
      toast.error({
        title: "No se pudo eliminar la carpeta",
        description: err instanceof Error ? err.message : "Inténtalo nuevamente.",
      });
    } finally {
      setDeleting(false);
    }
  }

  async function handleDeleteProjectConfirmed() {
    if (!projectPendingDelete) return;
    const target = projectPendingDelete;
    setDeleting(true);
    try {
      if (target.kind === "Escena 3D") {
        await deleteScene(target.id);
      } else {
        await deleteJob(target.id);
      }
      setProjects((prev) => prev.filter((p) => p.id !== target.id));
      setProjectPendingDelete(null);
      toast.success({
        title: "Proyecto eliminado",
        description: `"${target.title}" se eliminó permanentemente.`,
      });
    } catch (err) {
      toast.error({
        title: "No se pudo eliminar",
        description: err instanceof Error ? err.message : "Inténtalo nuevamente.",
      });
    } finally {
      setDeleting(false);
    }
  }

  const contextMenuItems: ContextMenuItem[] = contextMenu?.project
    ? [
        {
          id: "open",
          label: `Abrir ${contextMenu.project.kind}`,
          icon: <ExternalLink className="size-3.5" />,
          onSelect: () => {
            if (contextMenu.project) window.location.href = contextMenu.project.href;
          },
        },
        {
          id: "open-tab",
          label: "Abrir en nueva pestaña",
          icon: <ExternalLink className="size-3.5" />,
          onSelect: () => {
            if (contextMenu.project) window.open(contextMenu.project.href, "_blank");
          },
        },
        {
          id: "delete-project",
          label: "Eliminar proyecto...",
          icon: <Trash2 className="size-3.5" />,
          danger: true,
          dividerBefore: true,
          onSelect: () => {
            if (contextMenu.project) setProjectPendingDelete(contextMenu.project);
          },
        },
      ]
    : contextMenu?.folder
      ? [
          {
            id: "delete-folder",
            label: "Eliminar carpeta...",
            icon: <Trash2 className="size-3.5" />,
            danger: true,
            onSelect: () => {
              if (contextMenu.folder) setFolderPendingDelete(contextMenu.folder);
            },
          },
        ]
      : [];

  const filteredProjects = projects.filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase())
  );
  const displayedProjects = sortAsc
    ? [...filteredProjects].sort((a, b) => a.title.localeCompare(b.title))
    : filteredProjects;

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <header className="flex flex-col gap-4">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Proyectos</h1>

        <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
          <Button
            render={<Link href="/image-to-3d" />}
            className="h-11 rounded-[10px] bg-foreground px-5 text-sm font-semibold text-background hover:bg-foreground/90"
          >
            <Plus data-icon="inline-start" />
            Nuevo proyecto
          </Button>

          <div className="flex items-center gap-2.5">
            {searchOpen && (
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre..."
                className="h-10 w-56"
              />
            )}
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              onClick={() => setSearchOpen((v) => !v)}
              title="Buscar"
            >
              <Search />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              onClick={() => setSortAsc((v) => !v)}
              title="Ordenar alfabéticamente"
            >
              <ArrowUpDown />
            </Button>
          </div>
        </div>
      </header>

      <Separator />

      {/* CARPETAS Section */}
      <section className="flex flex-col gap-3.5">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          CARPETAS
        </h2>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <Card
              key={folder.id}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, folder });
              }}
              className="flex flex-row items-center justify-between p-4"
            >
              <div className="flex items-center gap-3.5">
                <div className="flex size-11 items-center justify-center rounded-lg bg-secondary text-foreground">
                  <Folder className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{folder.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Creada {formatRelativeTime(folder.createdAt)}
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setFolderPendingDelete(folder)}
                title="Eliminar carpeta"
              >
                <Trash2 className="text-muted-foreground hover:text-rose-400" />
              </Button>
            </Card>
          ))}

          <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
            <DialogTrigger
              render={
                <button
                  type="button"
                  className="flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#2F2F34] bg-card/50 p-4 text-center transition-colors hover:border-muted-foreground/50 hover:bg-card"
                />
              }
            >
              <Plus className="size-5 text-foreground" />
              <span className="text-sm font-semibold text-foreground">Nueva carpeta</span>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateFolder} className="flex flex-col gap-4">
                <DialogHeader>
                  <DialogTitle>Crear nueva carpeta</DialogTitle>
                  <DialogDescription>
                    Organiza tus modelos 3D, renders y recorridos por proyecto arquitectónico.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="Nombre de la carpeta..."
                />
                <DialogFooter showCloseButton>
                  <Button type="submit" disabled={!newFolderName.trim()}>
                    Crear carpeta
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <Separator />

      {/* GENERACIONES Y PROYECTOS REALES */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          SIN CARPETA ({displayedProjects.length})
        </h2>

        {loading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-60 rounded-xl" />
            ))}
          </div>
        ) : displayedProjects.length === 0 ? (
          <Card>
            <CardContent>
              <Empty className="border-0 py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Box />
                  </EmptyMedia>
                  <EmptyTitle>Aún no tienes proyectos generados</EmptyTitle>
                  <EmptyDescription>
                    Sube una imagen en Imagen a 3D, crea un Render o importa una Escena 3D para
                    verlos aquí.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button render={<Link href="/image-to-3d" />} variant="outline">
                    Ir a Imagen a 3D
                  </Button>
                </EmptyContent>
              </Empty>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {displayedProjects.map((project) => (
              <div
                key={project.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ x: e.clientX, y: e.clientY, project });
                }}
                className="group relative"
              >
                <Link href={project.href} className="block h-full">
                  <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:ring-muted-foreground/40">
                    <CardHeader className="pb-0">
                      <div className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
                        {project.thumbUrl && !brokenThumbs[project.id] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={project.thumbUrl}
                            alt={project.title}
                            onError={() =>
                              setBrokenThumbs((prev) => ({ ...prev, [project.id]: true }))
                            }
                            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : project.kind === "3D" ? (
                          <Box className="size-8 text-muted-foreground" />
                        ) : project.kind === "Escena 3D" ? (
                          <Layers3 className="size-8 text-muted-foreground" />
                        ) : project.kind === "Video" ? (
                          <Clapperboard className="size-8 text-muted-foreground" />
                        ) : (
                          <ImageIcon className="size-8 text-muted-foreground" />
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="flex flex-col gap-3">
                      <CardTitle className="truncate text-base font-bold">
                        {project.title}
                      </CardTitle>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="gap-1.5">
                            {project.kind === "3D" ? (
                              <Box data-icon="inline-start" />
                            ) : project.kind === "Escena 3D" ? (
                              <Layers3 data-icon="inline-start" />
                            ) : project.kind === "Video" ? (
                              <Clapperboard data-icon="inline-start" />
                            ) : (
                              <ImageIcon data-icon="inline-start" />
                            )}
                            {project.kind}
                          </Badge>
                          <Separator orientation="vertical" className="h-3.5" />
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeTime(project.createdAt)}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>

                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setProjectPendingDelete(project);
                  }}
                  title="Eliminar proyecto"
                  aria-label="Eliminar proyecto"
                  className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-lg border border-rose-500/35 bg-[#111114]/90 text-rose-300 opacity-0 shadow-md backdrop-blur-md transition hover:border-rose-500/70 hover:bg-rose-500/20 hover:text-rose-200 group-hover:opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <StudioContextMenu
        position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        items={contextMenuItems}
        onClose={() => setContextMenu(null)}
      />

      <ConfirmDeleteDialog
        open={projectPendingDelete !== null}
        title={`¿Eliminar ${projectPendingDelete?.kind ?? "proyecto"}?`}
        description="Se eliminará permanentemente de tu espacio de trabajo."
        itemName={projectPendingDelete?.title}
        itemMeta={
          projectPendingDelete
            ? `${projectPendingDelete.kind} · ${formatRelativeTime(projectPendingDelete.createdAt)}`
            : undefined
        }
        previewUrl={projectPendingDelete?.thumbUrl}
        deleting={deleting}
        confirmLabel="Eliminar definitivamente"
        onClose={() => {
          if (!deleting) setProjectPendingDelete(null);
        }}
        onConfirm={handleDeleteProjectConfirmed}
      />

      <ConfirmDeleteDialog
        open={folderPendingDelete !== null}
        title="¿Eliminar esta carpeta?"
        description="La carpeta se eliminará de tu lista (tus proyectos seguirán disponibles)."
        itemName={folderPendingDelete?.name}
        confirmLabel="Eliminar carpeta"
        onClose={() => setFolderPendingDelete(null)}
        onConfirm={handleDeleteFolderConfirmed}
      />
    </div>
  );
}
