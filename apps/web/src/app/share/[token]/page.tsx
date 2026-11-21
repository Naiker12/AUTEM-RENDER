"use client";

import dynamic from "next/dynamic";
import { use, useEffect, useState } from "react";
import { AlertTriangle, Camera, MapPin, MessageSquarePlus, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  assetFileUrl,
  fetchSharedScene,
  postSharedComment,
  type CameraSpec,
  type CommentRecord,
  type SceneRecord,
} from "@/lib/api";

const OrbitCanvas = dynamic(
  () => import("@/components/viewer3d/orbit-canvas").then((m) => m.OrbitCanvas),
  { ssr: false }
);

export default function ShareScenePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [scene, setScene] = useState<SceneRecord | null>(null);
  const [comments, setComments] = useState<CommentRecord[]>([]);
  const [activeCamera, setActiveCamera] = useState<CameraSpec | null>(null);
  const [pinMode, setPinMode] = useState(false);
  const [draftAnchor, setDraftAnchor] = useState<[number, number, number] | null>(null);
  const [author, setAuthor] = useState("Cliente");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSharedScene(token)
      .then((data) => {
        setScene(data.scene);
        setComments(data.comments);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Escena no encontrada");
      });
  }, [token]);

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault();
    if (!draftAnchor || !text.trim()) return;
    try {
      const created = await postSharedComment(token, {
        author,
        text,
        anchor: draftAnchor,
      });
      setComments((prev) => [...prev, created]);
      setText("");
      setDraftAnchor(null);
      setPinMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error guardando comentario");
    }
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>No se pudo abrir la escena compartida</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!scene) {
    return (
      <div className="flex h-96 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-5 text-primary" />
        Cargando escena compartida...
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div className="flex flex-col gap-1">
          <Badge variant="outline" className="w-fit text-primary">
            Autem Render · Revisión de Cliente
          </Badge>
          <h1 className="text-xl font-semibold text-foreground">{scene.name}</h1>
        </div>

        <Button
          type="button"
          variant={pinMode ? "default" : "outline"}
          onClick={() => setPinMode((v) => !v)}
          className={pinMode ? "btn-primary font-semibold" : ""}
        >
          <MessageSquarePlus data-icon="inline-start" />
          {pinMode ? "Haz clic sobre el modelo 3D..." : "Dejar comentario anclado"}
        </Button>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-3 lg:col-span-8">
          <OrbitCanvas
            glbUrl={assetFileUrl(scene.source_asset_id)}
            activeCamera={activeCamera}
            comments={comments}
            pinMode={pinMode}
            onPickPoint={(pt) => setDraftAnchor(pt)}
          />

          {scene.views.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {scene.views.map((view) => (
                <Button
                  key={view.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveCamera({ ...view.camera })}
                >
                  <Camera data-icon="inline-start" />
                  {view.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          {draftAnchor && (
            <Card className="border-primary/50 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <MapPin className="size-3.5" />
                  Nuevo pin en [{draftAnchor.join(", ")}]
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmitComment} className="flex flex-col gap-2.5">
                  <Input
                    type="text"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Tu nombre"
                  />
                  <textarea
                    rows={2}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Escribe tu comentario sobre este punto..."
                    className="w-full rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground"
                  />
                  <Button type="submit" className="btn-primary w-full font-semibold">
                    <Send data-icon="inline-start" />
                    Publicar comentario
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold">
                Comentarios anclados ({comments.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {comments.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Aún no hay comentarios. Pulsa <strong>Dejar comentario anclado</strong> y haz
                  clic en cualquier punto del modelo.
                </p>
              ) : (
                comments.map((c, idx) => (
                  <Card key={c.id} size="sm" className="bg-secondary/40">
                    <CardContent className="flex flex-col gap-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-primary">
                          #{idx + 1} · {c.author}
                        </span>
                        <span className="font-mono text-[10px] text-muted-foreground">
                          [{c.anchor.join(", ")}]
                        </span>
                      </div>
                      <p className="text-foreground">{c.text}</p>
                    </CardContent>
                  </Card>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
