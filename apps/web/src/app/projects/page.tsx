"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowUpDown,
  Box,
  Clapperboard,
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
import {
  assetFileUrl,
  fetchJobs,
  fetchScenes,
  type JobRecord,
  type SceneRecord,
} from "@/lib/api";

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

const FOLDERS_STORAGE_KEY = "autem_render_folders_v1";

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

  const [projects, setProjects] = useState<RealProjectCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FOLDERS_STORAGE_KEY);
      if (raw) {
        setFolders(JSON.parse(raw));
      }
    } catch {
      // Ignore storage error
    }

    let mounted = true;
    Promise.all([
      fetchJobs().catch(() => [] as JobRecord[]),
      fetchScenes().catch(() => [] as SceneRecord[]),
    ])
      .then(([jobs, scenes]) => {
        if (!mounted) return;
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

        const combined = [...mappedScenes, ...mappedJobs].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setProjects(combined);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  function saveFolders(next: FolderRecord[]) {
    setFolders(next);
    try {
      localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  }

  function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    const next: FolderRecord[] = [
      ...folders,
      { id: `folder-${Date.now()}`, name: trimmed, createdAt: new Date().toISOString() },
    ];
    saveFolders(next);
    setNewFolderName("");
    setFolderDialogOpen(false);
  }

  function handleDeleteFolder(id: string) {
    saveFolders(folders.filter((f) => f.id !== id));
  }

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
            <Card key={folder.id} className="flex flex-row items-center justify-between p-4">
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
                onClick={() => handleDeleteFolder(folder.id)}
                title="Eliminar carpeta"
              >
                <Trash2 className="text-muted-foreground" />
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
              <Link key={project.id} href={project.href} className="group">
                <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:ring-muted-foreground/40">
                  <CardHeader className="pb-0">
                    <div className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
                      {project.thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={project.thumbUrl}
                          alt={project.title}
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
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
