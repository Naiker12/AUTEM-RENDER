"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Box,
  Clapperboard,
  Download,
  Image as ImageIcon,
  MoveHorizontal,
} from "lucide-react";
import { AutemLoader } from "@/components/brand/autem-loader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";

interface BeforeAfterSliderProps {
  beforeUrl: string | null;
  afterUrl: string | null;
  outputAssetId?: string | null;
  loading?: boolean;
  progress?: number | null;
  statusMessage?: string;
  title?: string;
  subtitle?: string;
  onUpscale?: () => void;
  upscaling?: boolean;
}

export function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
  outputAssetId = null,
  loading = false,
  progress = null,
  statusMessage,
  title = "Visor de Render (Antes / Después)",
  subtitle,
  onUpscale,
  upscaling = false,
}: BeforeAfterSliderProps) {
  const [split, setSplit] = useState(50);

  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/40 py-3">
        <div>
          <CardTitle className="text-xs font-semibold">{title}</CardTitle>
          {subtitle && (
            <CardDescription className="text-[11px]">{subtitle}</CardDescription>
          )}
        </div>

        {afterUrl && (
          <div className="flex flex-wrap items-center gap-1.5">
            {onUpscale && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={onUpscale}
                disabled={upscaling}
                className="border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
              >
                {upscaling ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <ArrowUpRight data-icon="inline-start" />
                )}
                {upscaling ? "Mejorando 2x..." : "Mejorar 2x"}
              </Button>
            )}

            {outputAssetId && (
              <>
                <Button
                  render={
                    <Link href={`/image-to-3d?assetId=${encodeURIComponent(outputAssetId)}`} />
                  }
                  variant="outline"
                  size="xs"
                >
                  <Box data-icon="inline-start" />
                  Pasar a 3D
                </Button>
                <Button
                  render={
                    <Link href={`/video?assetId=${encodeURIComponent(outputAssetId)}`} />
                  }
                  variant="outline"
                  size="xs"
                >
                  <Clapperboard data-icon="inline-start" />
                  Animar
                </Button>
              </>
            )}

            <Button
              render={<a href={afterUrl} download />}
              variant="outline"
              size="xs"
            >
              <Download data-icon="inline-start" />
              PNG
            </Button>
          </div>
        )}
      </CardHeader>

      <CardContent className="relative flex h-[430px] w-full items-center justify-center overflow-hidden bg-background p-0">
        {loading ? (
          <AutemLoader
            title="Sintetizando render arquitectónico..."
            subtitle={statusMessage ?? "RESPETANDO GEOMETRÍA Y MATERIALES"}
            progress={progress}
          />
        ) : afterUrl ? (
          <div className="relative size-full select-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={afterUrl}
              alt="Render generado"
              className="size-full object-contain"
            />

            {beforeUrl && (
              <>
                <div
                  className="pointer-events-none absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={beforeUrl}
                    alt="Imagen original"
                    className="size-full object-contain"
                  />
                </div>

                <div
                  className="btn-primary pointer-events-none absolute top-0 bottom-0 w-0.5 shadow-[0_0_12px_rgba(249,115,22,0.8)]"
                  style={{ left: `${split}%` }}
                >
                  <div className="absolute top-1/2 left-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-primary bg-background/95 text-primary shadow-md">
                    <MoveHorizontal className="size-4" />
                  </div>
                </div>

                <Badge
                  variant="secondary"
                  className="pointer-events-none absolute top-3 left-3"
                >
                  Original
                </Badge>
                <Badge className="btn-primary pointer-events-none absolute top-3 right-3">
                  Render IA
                </Badge>

                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  onChange={(e) => setSplit(Number(e.target.value))}
                  aria-label="Comparar original y render"
                  className="absolute inset-0 size-full cursor-ew-resize opacity-0"
                />
              </>
            )}
          </div>
        ) : (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ImageIcon />
              </EmptyMedia>
              <EmptyTitle>Sin render generado todavía</EmptyTitle>
              <EmptyDescription>
                Sube un boceto o foto arquitectónica y pulsa Generar Render para comparar el
                Antes y Después.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
