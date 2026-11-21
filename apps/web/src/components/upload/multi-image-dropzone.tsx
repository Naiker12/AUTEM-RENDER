"use client";

import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { cn } from "cn";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { API_URL, uploadImageAsset, type AssetInfo } from "@/lib/api";

interface MultiImageDropzoneProps {
  assets: AssetInfo[];
  onChange: (assets: AssetInfo[]) => void;
  maxImages?: number;
}

export function MultiImageDropzone({
  assets,
  onChange,
  maxImages = 4,
}: MultiImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = maxImages - assets.length;
    if (remaining <= 0) {
      setError(`Máximo ${maxImages} vista(s) por generación.`);
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const toUpload = Array.from(files).slice(0, remaining);
      const uploaded: AssetInfo[] = [];
      for (const file of toUpload) {
        const asset = await uploadImageAsset(file);
        uploaded.push(asset);
      }
      onChange([...assets, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error subiendo imagen");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function removeAsset(id: string) {
    onChange(assets.filter((item) => item.id !== id));
  }

  return (
    <div className="flex flex-col gap-3">
      <Card
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex min-h-[180px] cursor-pointer flex-col items-center justify-center border border-dashed text-center transition-colors",
          dragging
            ? "border-primary bg-primary/10"
            : "border-[#2F2F34] bg-background/60 hover:border-muted-foreground/50"
        )}
      >
        <CardContent className="flex flex-col items-center justify-center gap-2 py-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple={maxImages > 1}
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <div className="flex size-11 items-center justify-center rounded-full bg-secondary text-foreground">
            {uploading ? <Spinner className="size-5" /> : <ImagePlus className="size-5" />}
          </div>
          <p className="text-sm font-medium text-foreground">
            {uploading ? "Subiendo imagen..." : "Arrastra y suelta o haz clic para subir"}
          </p>
          <p className="text-xs text-muted-foreground">PNG · JPEG · WebP — hasta 20 MB</p>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {assets.length > 0 && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {assets.map((asset, index) => (
            <div
              key={asset.id}
              className="group relative overflow-hidden rounded-lg border border-border bg-secondary"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`${API_URL}${asset.url}`}
                alt={asset.filename}
                className="h-24 w-full object-cover"
              />
              <Badge
                variant="secondary"
                className="absolute bottom-1 left-1 text-[10px]"
              >
                Vista {index + 1}
              </Badge>
              <Button
                type="button"
                variant="destructive"
                size="icon-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAsset(asset.id);
                }}
                className="absolute top-1 right-1"
                title="Quitar imagen"
              >
                <X />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
