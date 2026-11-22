"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Center, ContactShadows, Environment, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { Box, Maximize2, Minimize2, RotateCcw } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ShadingMode = "texture" | "solid" | "wireframe" | "normals";

interface GlbModelProps {
  url: string;
  shadingMode: ShadingMode;
}

function GlbModel({ url, shadingMode }: GlbModelProps) {
  const { scene } = useGLTF(url);
  const { cloned, fitScale } = useMemo(() => {
    const copy = scene.clone(true);
    const box = new THREE.Box3().setFromObject(copy);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    // Normalize any mesh so its longest dimension fits cleanly in a 2.8m studio inspection box
    const scale = 2.8 / maxDim;
    return { cloned: copy, fitScale: scale };
  }, [scene]);
  const originalMaterials = useRef<Map<string, THREE.Material | THREE.Material[]>>(new Map());

  useEffect(() => {
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        // Guarantee smooth vertex normals even if the GLB was exported without NORMAL attributes
        if (obj.geometry && !obj.geometry.attributes.normal) {
          obj.geometry.computeVertexNormals();
        }

        if (!originalMaterials.current.has(obj.uuid)) {
          originalMaterials.current.set(
            obj.uuid,
            Array.isArray(obj.material)
              ? obj.material.map((m) => m.clone())
              : obj.material.clone()
          );
        }

        const baseMat = originalMaterials.current.get(obj.uuid)!;
        const hasVertexColors = Boolean(obj.geometry?.attributes?.color);

        if (shadingMode === "normals") {
          obj.material = new THREE.MeshNormalMaterial({
            wireframe: false,
            flatShading: false,
          });
        } else if (shadingMode === "solid") {
          obj.material = new THREE.MeshStandardMaterial({
            color: "#d4d4d8",
            roughness: 0.45,
            metalness: 0.12,
            wireframe: false,
          });
        } else if (shadingMode === "wireframe") {
          obj.material = new THREE.MeshStandardMaterial({
            color: "#F97316",
            roughness: 0.4,
            wireframe: true,
          });
        } else {
          const restored = Array.isArray(baseMat)
            ? baseMat.map((m) => m.clone())
            : baseMat.clone();
          if (!Array.isArray(restored) && restored instanceof THREE.MeshStandardMaterial) {
            if (!restored.map && hasVertexColors) {
              restored.vertexColors = true;
            }
            restored.roughness = Math.min(restored.roughness, 0.75);
            restored.needsUpdate = true;
          }
          obj.material = restored;
        }
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [cloned, shadingMode]);

  return (
    <Center>
      <group scale={fitScale}>
        <primitive object={cloned} />
      </group>
    </Center>
  );
}

interface ModelViewer3DProps {
  glbUrl: string | null;
  heightClass?: string;
  compact?: boolean;
  autoRotate?: boolean;
  cameraSeed?: number;
}

const SHADING_TABS: { id: ShadingMode; label: string }[] = [
  { id: "texture", label: "Textura" },
  { id: "solid", label: "Sólido" },
  { id: "wireframe", label: "Wireframe" },
  { id: "normals", label: "Normales" },
];

export function ModelViewer3D({
  glbUrl,
  heightClass = "h-[480px]",
  compact = false,
  autoRotate = false,
  cameraSeed = 0,
}: ModelViewer3DProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shadingMode, setShadingMode] = useState<ShadingMode>("texture");
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  async function toggleFullscreen() {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <Card
      ref={containerRef}
      className={cn(
        "relative flex flex-col overflow-hidden py-0",
        isFullscreen && "h-screen w-screen rounded-none border-0"
      )}
    >
      {/* Top Floating Viewport Toolbar using shadcn Tabs & Button */}
      {!compact && glbUrl && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
          <div className="pointer-events-auto">
            <Tabs
              value={shadingMode}
              onValueChange={(val) => setShadingMode(val as ShadingMode)}
            >
              <TabsList className="border border-border bg-background/90 p-1 backdrop-blur-md">
                {SHADING_TABS.map((tab) => (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="px-3 text-xs data-active:border-primary data-active:bg-primary/15 data-active:text-foreground"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => setCameraResetKey((k) => k + 1)}
              className="bg-background/90 backdrop-blur-md"
              title="Reiniciar cámara"
            >
              <RotateCcw />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => void toggleFullscreen()}
              className="bg-background/90 backdrop-blur-md"
              title="Pantalla completa"
            >
              {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </div>
        </div>
      )}

      {compact && glbUrl && (
        <Button
          type="button"
          variant="outline"
          size="icon-xs"
          onClick={() => void toggleFullscreen()}
          className="absolute right-3 bottom-3 z-10 bg-background/90 backdrop-blur-md"
          title="Ampliar visor"
        >
          <Maximize2 />
        </Button>
      )}

      {/* 3D Canvas Viewport */}
      <div
        className={cn(
          "relative w-full bg-[radial-gradient(ellipse_at_center,#1b1d24_0%,#0d0e11_68%,#0A0A0B_100%)]",
          isFullscreen ? "flex-1" : heightClass
        )}
      >
        {glbUrl ? (
          <>
            <Canvas
              key={`${cameraResetKey}-${cameraSeed}-${glbUrl}`}
              camera={{ position: [1.8, 1.35, 3.8], fov: 36 }}
              shadows
              dpr={[1, 2]}
              gl={{
                antialias: true,
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.18,
              }}
            >
              <hemisphereLight args={["#ffffff", "#3f3f46", 0.95]} />
              <ambientLight intensity={0.65} />
              <directionalLight position={[6, 10, 8]} intensity={2.1} castShadow />
              <directionalLight position={[-7, 6, -5]} intensity={1.1} color="#dbeafe" />
              <directionalLight position={[0, 4, -8]} intensity={0.85} color="#fed7aa" />
              <Suspense fallback={null}>
                <Environment preset="studio" environmentIntensity={0.65} />
                <GlbModel url={glbUrl} shadingMode={shadingMode} />
                <ContactShadows
                  position={[0, -1.45, 0]}
                  opacity={0.5}
                  scale={10}
                  blur={2.4}
                  far={6}
                />
              </Suspense>
              <OrbitControls
                makeDefault
                autoRotate={autoRotate}
                autoRotateSpeed={0.9}
                minDistance={1.5}
                maxDistance={14}
              />
            </Canvas>

            {!compact && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute right-5 bottom-4 select-none"
              >
                <svg width="68" height="68" viewBox="0 0 68 68" fill="none">
                  <line x1="34" y1="38" x2="34" y2="12" stroke="#22C55E" strokeWidth="2.2" />
                  <polygon points="34,7 30.5,14 37.5,14" fill="#22C55E" />
                  <text
                    x="39"
                    y="14"
                    fill="#22C55E"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                  >
                    Y
                  </text>
                  <line x1="34" y1="38" x2="56" y2="48" stroke="#EF4444" strokeWidth="2.2" />
                  <polygon points="60,50 52.5,50.5 55,44" fill="#EF4444" />
                  <text
                    x="58"
                    y="58"
                    fill="#EF4444"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                  >
                    X
                  </text>
                  <line x1="34" y1="38" x2="14" y2="49" stroke="#3B82F6" strokeWidth="2.2" />
                  <polygon points="10,51 15,44.5 18,50.8" fill="#3B82F6" />
                  <text
                    x="4"
                    y="59"
                    fill="#3B82F6"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight="600"
                  >
                    Z
                  </text>
                  <circle cx="34" cy="38" r="3" fill="#E4E4E7" />
                </svg>
              </div>
            )}
          </>
        ) : (
          <Empty className="h-full border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Box />
              </EmptyMedia>
              <EmptyTitle>Sin malla 3D cargada</EmptyTitle>
              <EmptyDescription>
                El modelo 3D generado aparecerá aquí para orbitar, inspeccionar y descargar.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </div>
    </Card>
  );
}
