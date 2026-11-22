"use client";

import {
  forwardRef,
  Suspense,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ComponentRef,
} from "react";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { Center, ContactShadows, Grid, Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { CameraSpec, CommentRecord } from "@/lib/api";

type OrbitControlsHandle = ComponentRef<typeof OrbitControls>;

export type SceneEnvironmentMode = "terrain" | "studio" | "grid";
export type SceneShadingMode = "textured" | "clay" | "wireframe";
export type SceneLightingPreset = "midday" | "golden_hour" | "overcast" | "night";

export interface OrbitCanvasHandle {
  captureView: () => Promise<{ blob: Blob; camera: CameraSpec } | null>;
  resetCamera: () => void;
  setHumanEyeView: () => void;
}

interface OrbitCanvasProps {
  glbUrl?: string | null;
  activeCamera?: CameraSpec | null;
  comments?: CommentRecord[];
  pinMode?: boolean;
  onPickPoint?: (point: [number, number, number]) => void;
  environmentMode?: SceneEnvironmentMode;
  shadingMode?: SceneShadingMode;
  lightingPreset?: SceneLightingPreset;
  heightClass?: string;
}

// Module-level singletons so switching back and forth to /scene takes <2ms (0 re-computation)
let _cachedGrassTexture: THREE.CanvasTexture | null = null;
let _cachedWoodTexture: THREE.CanvasTexture | null = null;
let _cachedTerrainGeometry: THREE.PlaneGeometry | null = null;
let _sharedTrunkGeometry: THREE.CylinderGeometry | null = null;
let _sharedFoliageGeometry: THREE.DodecahedronGeometry | null = null;

/**
 * Generates a realistic high-frequency grass & moss turf CanvasTexture using a fast ImageData buffer
 * once per browser session (<2ms instead of 20,000 Canvas 2D stroke calls on every mount).
 */
function useGrassTexture(): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    if (_cachedGrassTexture) return _cachedGrassTexture;

    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const patch = Math.sin(x * 0.09) * Math.cos(y * 0.09) * 12;
        const grain = (rand() - 0.5) * 28;
        data[idx] = Math.max(45, Math.min(165, Math.round(108 + patch + grain * 0.85)));
        data[idx + 1] = Math.max(58, Math.min(182, Math.round(125 + patch + grain)));
        data[idx + 2] = Math.max(36, Math.min(130, Math.round(83 + patch * 0.7 + grain * 0.65)));
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(42, 42);
    tex.anisotropy = 4;
    _cachedGrassTexture = tex;
    return tex;
  }, []);
}

/**
 * Generates a realistic architectural timber deck plank texture (cached at module level).
 */
function useWoodTexture(): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (typeof document === "undefined") return null;
    if (_cachedWoodTexture) return _cachedWoodTexture;

    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#8d5b3c";
    ctx.fillRect(0, 0, 128, 128);

    const planks = 8;
    const plankH = 128 / planks;
    for (let i = 0; i < planks; i++) {
      const y = i * plankH;
      ctx.fillStyle = i % 2 === 0 ? "rgba(156, 102, 68, 0.35)" : "rgba(120, 74, 48, 0.35)";
      ctx.fillRect(0, y, 128, plankH - 1.5);
      ctx.fillStyle = "rgba(42, 24, 14, 0.65)";
      ctx.fillRect(0, y + plankH - 1.5, 128, 1.5);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    _cachedWoodTexture = tex;
    return tex;
  }, []);
}

/**
 * Rolling textured grassy terrain with flat building pad in the center and soft horizon hills.
 */
function RollingTerrain({
  onPickPoint,
  pinMode,
}: {
  onPickPoint?: (point: [number, number, number]) => void;
  pinMode: boolean;
}) {
  const grassTexture = useGrassTexture();

  const geometry = useMemo(() => {
    if (_cachedTerrainGeometry) return _cachedTerrainGeometry;
    const geom = new THREE.PlaneGeometry(240, 240, 72, 72);
    geom.rotateX(-Math.PI / 2);
    const pos = geom.attributes.position;

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const dist = Math.sqrt(x * x + z * z);
      const flatten = Math.min(1, Math.max(0, (dist - 12) / 22));
      const y =
        flatten *
        (Math.sin(x * 0.032) * Math.cos(z * 0.035) * 3.4 +
          Math.sin(x * 0.08 + z * 0.06) * 0.9 -
          0.25);
      pos.setY(i, y);
    }
    geom.computeVertexNormals();
    _cachedTerrainGeometry = geom;
    return geom;
  }, []);

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (!pinMode || !onPickPoint) return;
    e.stopPropagation();
    const p = e.point;
    onPickPoint([Number(p.x.toFixed(2)), Number(p.y.toFixed(2)), Number(p.z.toFixed(2))]);
  }

  return (
    <mesh geometry={geometry} receiveShadow onClick={handleClick} position={[0, -0.02, 0]}>
      <meshStandardMaterial
        map={grassTexture ?? undefined}
        color={grassTexture ? "#ffffff" : "#6c7d53"}
        roughness={0.94}
        metalness={0.02}
      />
    </mesh>
  );
}

/**
 * Naturalistic architectural trees using shared geometry instances for instant mount.
 */
function ArchitecturalTree({
  position,
  scale = 1,
  seed = 1,
  shadingMode,
}: {
  position: [number, number, number];
  scale?: number;
  seed?: number;
  shadingMode: SceneShadingMode;
}) {
  const isWire = shadingMode === "wireframe";
  const isClay = shadingMode === "clay";

  const { trunkGeom, foliageGeom } = useMemo(() => {
    if (!_sharedTrunkGeometry) {
      _sharedTrunkGeometry = new THREE.CylinderGeometry(0.04, 0.14, 6.4, 7);
    }
    if (!_sharedFoliageGeometry) {
      _sharedFoliageGeometry = new THREE.DodecahedronGeometry(1, 0);
    }
    return { trunkGeom: _sharedTrunkGeometry, foliageGeom: _sharedFoliageGeometry };
  }, []);

  const foliageClusters = useMemo(() => {
    const list: { pos: [number, number, number]; r: number; color: string }[] = [];
    const palette = ["#5d7047", "#6f8256", "#4e603b", "#7d9164", "#64774d"];
    const layers = 9;
    for (let i = 0; i < layers; i++) {
      const t = i / layers;
      const height = 2.0 + t * 5.0;
      const spread = (1.0 - t * 0.7) * 1.55;
      const count = Math.max(2, Math.floor((1.05 - t * 0.55) * 5));
      for (let j = 0; j < count; j++) {
        const angle = j * ((Math.PI * 2) / count) + i * 1.15 + seed;
        const rad = spread * (0.45 + ((i * 7 + j * 13) % 10) * 0.055);
        const cx = Math.cos(angle) * rad;
        const cz = Math.sin(angle) * rad;
        const cy = height + (((i + j) % 3) - 1) * 0.2;
        const clusterRadius = 0.34 + (1.0 - t * 0.48) * 0.28;
        list.push({
          pos: [cx, cy, cz],
          r: clusterRadius,
          color: palette[(i + j) % palette.length],
        });
      }
    }
    return list;
  }, [seed]);

  return (
    <group position={position} scale={scale}>
      <mesh geometry={trunkGeom} position={[0, 3.2, 0]} castShadow>
        <meshStandardMaterial
          color={isClay ? "#d4d4d8" : "#5a4d41"}
          roughness={0.92}
          wireframe={isWire}
        />
      </mesh>

      {foliageClusters.map((c, idx) => (
        <mesh key={idx} geometry={foliageGeom} position={c.pos} scale={c.r} castShadow>
          <meshStandardMaterial
            color={isClay ? "#e4e4e7" : c.color}
            roughness={0.85}
            wireframe={isWire}
          />
        </mesh>
      ))}
    </group>
  );
}

function SiteTrees({ shadingMode }: { shadingMode: SceneShadingMode }) {
  const trees: { pos: [number, number, number]; scale: number; seed: number }[] = useMemo(
    () => [
      { pos: [-1.8, 0, 2.2], scale: 1.15, seed: 1 },
      { pos: [-6.2, 0, -0.5], scale: 0.95, seed: 2 },
      { pos: [-0.4, 0, -5.8], scale: 1.25, seed: 3 },
      { pos: [14.5, -0.1, 0.8], scale: 0.95, seed: 4 },
      { pos: [16.5, -0.4, 7.2], scale: 1.1, seed: 5 },
      { pos: [-15.0, 0.2, -9.0], scale: 1.2, seed: 6 },
    ],
    []
  );

  return (
    <group>
      {trees.map((t, i) => (
        <ArchitecturalTree
          key={i}
          position={t.pos}
          scale={t.scale}
          seed={t.seed}
          shadingMode={shadingMode}
        />
      ))}
    </group>
  );
}

/**
 * High-detail modular architectural residence matching the Render a House reference scene:
 * Multi-module white stucco volumes, three sloped clerestory roofs with wood soffits,
 * cantilevered front glass pavilion on concrete piers, timber terraces with stairs, and steel handrail.
 */
function DefaultArchitecturalPavilion({
  shadingMode,
  pinMode,
  onPickPoint,
}: {
  shadingMode: SceneShadingMode;
  pinMode: boolean;
  onPickPoint?: (point: [number, number, number]) => void;
}) {
  const woodTexture = useWoodTexture();
  const isWire = shadingMode === "wireframe";
  const isClay = shadingMode === "clay";

  const stuccoColor = isClay ? "#e4e4e7" : "#d8dadf";
  const trimColor = isClay ? "#a1a1aa" : "#494e56";
  const woodColor = isClay ? "#d4d4d8" : "#a66c46";
  const roofTopColor = isClay ? "#e4e4e7" : "#cfd2d6";
  const glassColor = isClay ? "#cbd5e1" : "#b8d0de";

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (!pinMode || !onPickPoint) return;
    e.stopPropagation();
    const p = e.point;
    onPickPoint([Number(p.x.toFixed(2)), Number(p.y.toFixed(2)), Number(p.z.toFixed(2))]);
  }

  return (
    <group onClick={handleClick}>
      {/* 1. Rear & Side Timber Decks */}
      <mesh position={[0.6, 0.22, -0.4]} receiveShadow castShadow>
        <boxGeometry args={[11.4, 0.44, 6.6]} />
        <meshStandardMaterial
          map={!isClay ? (woodTexture ?? undefined) : undefined}
          color={woodColor}
          roughness={0.78}
          wireframe={isWire}
        />
      </mesh>

      {/* Right timber deck steps (2 staircases matching reference screenshot) */}
      {[0.6, -1.6].map((zOff, sIdx) => (
        <group key={sIdx} position={[6.55, 0, zOff]}>
          {[0, 1, 2, 3].map((step) => (
            <mesh
              key={step}
              position={[step * 0.28, 0.36 - step * 0.09, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.3, 0.08, 0.95]} />
              <meshStandardMaterial color="#594335" roughness={0.85} wireframe={isWire} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Left deck & minimal black steel railing */}
      <mesh position={[-6.4, 0.22, 0.5]} receiveShadow castShadow>
        <boxGeometry args={[3.2, 0.44, 4.2]} />
        <meshStandardMaterial
          map={!isClay ? (woodTexture ?? undefined) : undefined}
          color={woodColor}
          roughness={0.78}
          wireframe={isWire}
        />
      </mesh>
      <group position={[-7.2, 0.85, 2.2]}>
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[1.4, 0.04, 0.04]} />
          <meshStandardMaterial color="#27272a" wireframe={isWire} />
        </mesh>
        <mesh position={[-0.68, -0.32, 0]}>
          <boxGeometry args={[0.04, 0.65, 0.04]} />
          <meshStandardMaterial color="#27272a" wireframe={isWire} />
        </mesh>
        <mesh position={[0.68, -0.32, 0]}>
          <boxGeometry args={[0.04, 0.65, 0.04]} />
          <meshStandardMaterial color="#27272a" wireframe={isWire} />
        </mesh>
      </group>

      {/* 2. Left Architectural Wing (with vertical window slots) */}
      <group position={[-4.5, 1.85, -0.4]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[3.8, 2.9, 5.4]} />
          <meshStandardMaterial color={stuccoColor} roughness={0.72} wireframe={isWire} />
        </mesh>
        {/* Left facade tall narrow windows */}
        {[-0.9, 0.4].map((zWin, idx) => (
          <group key={idx} position={[-1.91, -0.1, zWin]}>
            <mesh>
              <boxGeometry args={[0.06, 2.1, 0.65]} />
              <meshStandardMaterial color={trimColor} wireframe={isWire} />
            </mesh>
            <mesh position={[-0.01, 0, 0]}>
              <boxGeometry args={[0.06, 1.95, 0.52]} />
              <meshStandardMaterial
                color={glassColor}
                roughness={0.15}
                metalness={0.25}
                wireframe={isWire}
              />
            </mesh>
          </group>
        ))}
      </group>

      {/* 3. Center & Right Main Residence Wings */}
      <mesh position={[0.2, 1.9, -1.1]} castShadow receiveShadow>
        <boxGeometry args={[5.8, 3.0, 4.8]} />
        <meshStandardMaterial color={stuccoColor} roughness={0.72} wireframe={isWire} />
      </mesh>
      <mesh position={[4.1, 1.9, -1.2]} castShadow receiveShadow>
        <boxGeometry args={[4.2, 3.0, 4.6]} />
        <meshStandardMaterial color={stuccoColor} roughness={0.72} wireframe={isWire} />
      </mesh>

      {/* 4. Front Cantilevered Glass Pavilion on Concrete Piers */}
      <group position={[0.5, 1.55, 3.1]}>
        {/* Concrete support piers */}
        <mesh position={[-1.75, -1.18, 1.85]} castShadow>
          <boxGeometry args={[0.24, 0.85, 0.45]} />
          <meshStandardMaterial color="#9ca3af" roughness={0.8} wireframe={isWire} />
        </mesh>
        <mesh position={[1.75, -1.18, 1.85]} castShadow>
          <boxGeometry args={[0.24, 0.85, 0.45]} />
          <meshStandardMaterial color="#9ca3af" roughness={0.8} wireframe={isWire} />
        </mesh>

        {/* Pavilion shell */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[3.8, 2.45, 4.2]} />
          <meshStandardMaterial color={stuccoColor} roughness={0.68} wireframe={isWire} />
        </mesh>

        {/* Dark Charcoal Aluminum Storefront Frame */}
        <mesh position={[0, -0.04, 2.11]}>
          <boxGeometry args={[3.62, 2.22, 0.08]} />
          <meshStandardMaterial color={trimColor} roughness={0.5} wireframe={isWire} />
        </mesh>

        {/* Left & Right large window panes + upper transom mullion */}
        {[-0.88, 0.88].map((xPane, idx) => (
          <mesh key={idx} position={[xPane, -0.04, 2.13]}>
            <boxGeometry args={[1.64, 2.02, 0.06]} />
            <meshStandardMaterial
              color={glassColor}
              roughness={0.12}
              metalness={0.25}
              transparent
              opacity={0.84}
              wireframe={isWire}
            />
          </mesh>
        ))}
        {/* Horizontal upper transom bar */}
        <mesh position={[0, 0.62, 2.15]}>
          <boxGeometry args={[3.55, 0.06, 0.06]} />
          <meshStandardMaterial color={trimColor} wireframe={isWire} />
        </mesh>
      </group>

      {/* 5. Three Angled Clerestory Shed Roofs with Exposed Timber Rafters */}
      {[
        { pos: [-4.5, 3.72, -0.3] as [number, number, number], size: [4.4, 5.8] as [number, number] },
        { pos: [-0.2, 3.85, -1.0] as [number, number, number], size: [4.8, 5.4] as [number, number] },
        { pos: [4.1, 3.85, -1.1] as [number, number, number], size: [4.6, 5.2] as [number, number] },
      ].map((roof, idx) => (
        <group key={idx} position={roof.pos} rotation={[0.16, 0, -0.14]}>
          {/* Top roof membrane */}
          <mesh castShadow receiveShadow>
            <boxGeometry args={[roof.size[0], 0.14, roof.size[1]]} />
            <meshStandardMaterial color={roofTopColor} roughness={0.65} wireframe={isWire} />
          </mesh>
          {/* Warm wood soffit underside */}
          <mesh position={[0, -0.09, 0]}>
            <boxGeometry args={[roof.size[0] - 0.15, 0.05, roof.size[1] - 0.15]} />
            <meshStandardMaterial color={woodColor} roughness={0.75} wireframe={isWire} />
          </mesh>
          {/* Clerestory glass band beneath the roof slope */}
          <mesh position={[0, -0.32, roof.size[1] * 0.38]}>
            <boxGeometry args={[roof.size[0] - 0.5, 0.42, 0.08]} />
            <meshStandardMaterial
              color={glassColor}
              roughness={0.15}
              metalness={0.3}
              wireframe={isWire}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function UploadedGlbModel({
  url,
  shadingMode,
  pinMode,
  onPickPoint,
}: {
  url: string;
  shadingMode: SceneShadingMode;
  pinMode: boolean;
  onPickPoint?: (point: [number, number, number]) => void;
}) {
  const { scene } = useGLTF(url);
  const { cloned, fitScale } = useMemo(() => {
    const copy = scene.clone(true);
    const box = new THREE.Box3().setFromObject(copy);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const scale = maxDim < 2.5 ? 4.5 / maxDim : maxDim > 28 ? 14 / maxDim : 1;
    return { cloned: copy, fitScale: scale };
  }, [scene]);
  const originalMaterials = useRef<Map<string, THREE.Material | THREE.Material[]>>(new Map());

  useEffect(() => {
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
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
        const base = originalMaterials.current.get(obj.uuid)!;
        const hasVertexColors = Boolean(obj.geometry?.attributes?.color);
        if (shadingMode === "clay") {
          obj.material = new THREE.MeshStandardMaterial({
            color: "#e4e4e7",
            roughness: 0.5,
            metalness: 0.08,
          });
        } else if (shadingMode === "wireframe") {
          obj.material = new THREE.MeshStandardMaterial({
            color: "#F97316",
            wireframe: true,
          });
        } else {
          const restored = Array.isArray(base) ? base.map((m) => m.clone()) : base.clone();
          if (!Array.isArray(restored) && restored instanceof THREE.MeshStandardMaterial) {
            if (!restored.map && hasVertexColors) {
              restored.vertexColors = true;
            }
          }
          obj.material = restored;
        }
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }, [cloned, shadingMode]);

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (!pinMode || !onPickPoint) return;
    e.stopPropagation();
    const p = e.point;
    onPickPoint([Number(p.x.toFixed(2)), Number(p.y.toFixed(2)), Number(p.z.toFixed(2))]);
  }

  return (
    <Center top>
      <group scale={fitScale}>
        <primitive object={cloned} onClick={handleClick} />
      </group>
    </Center>
  );
}

function CameraBridge({
  activeCamera,
  controlsRef,
  registerActions,
}: {
  activeCamera?: CameraSpec | null;
  controlsRef: React.RefObject<OrbitControlsHandle | null>;
  registerActions: (actions: {
    capture: () => Promise<{ blob: Blob; camera: CameraSpec } | null>;
    reset: () => void;
    humanEye: () => void;
  }) => void;
}) {
  const { camera, gl, scene } = useThree();

  useEffect(() => {
    if (!activeCamera) return;
    camera.position.set(...activeCamera.position);
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = activeCamera.fov;
      camera.updateProjectionMatrix();
    }
    if (controlsRef.current) {
      controlsRef.current.target.set(...activeCamera.target);
      controlsRef.current.update();
    }
  }, [activeCamera, camera, controlsRef]);

  useEffect(() => {
    registerActions({
      capture: async () => {
        gl.render(scene, camera);
        const canvas = gl.domElement;
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob((b) => resolve(b), "image/png")
        );
        if (!blob) return null;
        const tgt = controlsRef.current?.target ?? new THREE.Vector3(0, 1.5, 0);
        const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 36;
        return {
          blob,
          camera: {
            position: [
              Number(camera.position.x.toFixed(2)),
              Number(camera.position.y.toFixed(2)),
              Number(camera.position.z.toFixed(2)),
            ],
            target: [
              Number(tgt.x.toFixed(2)),
              Number(tgt.y.toFixed(2)),
              Number(tgt.z.toFixed(2)),
            ],
            fov: Number(fov.toFixed(1)),
          },
        };
      },
      reset: () => {
        camera.position.set(-14.5, 6.8, 16.5);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.fov = 36;
          camera.updateProjectionMatrix();
        }
        if (controlsRef.current) {
          controlsRef.current.target.set(0.2, 1.6, 0.2);
          controlsRef.current.update();
        }
      },
      humanEye: () => {
        camera.position.set(-4.2, 1.68, 12.5);
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.fov = 48;
          camera.updateProjectionMatrix();
        }
        if (controlsRef.current) {
          controlsRef.current.target.set(0.4, 1.75, 0);
          controlsRef.current.update();
        }
      },
    });
  }, [camera, controlsRef, gl, registerActions, scene]);

  return null;
}

const LIGHTING_CONFIGS: Record<
  SceneLightingPreset,
  {
    sunPos: [number, number, number];
    ambient: number;
    sunIntensity: number;
    sunColor: string;
    skyTop: string;
    skyHorizon: string;
    fogColor: string;
  }
> = {
  midday: {
    sunPos: [20, 32, 18],
    ambient: 0.9,
    sunIntensity: 1.5,
    sunColor: "#fffdf9",
    skyTop: "#c5c9ce",
    skyHorizon: "#9fa3a8",
    fogColor: "#9fa3a8",
  },
  golden_hour: {
    sunPos: [-26, 10, 18],
    ambient: 0.7,
    sunIntensity: 1.65,
    sunColor: "#ffb067",
    skyTop: "#b89f8d",
    skyHorizon: "#9c8270",
    fogColor: "#9c8270",
  },
  overcast: {
    sunPos: [8, 26, 10],
    ambient: 1.1,
    sunIntensity: 0.7,
    sunColor: "#e2e8f0",
    skyTop: "#adb2b8",
    skyHorizon: "#8e9399",
    fogColor: "#8e9399",
  },
  night: {
    sunPos: [-14, 20, -14],
    ambient: 0.35,
    sunIntensity: 0.6,
    sunColor: "#60a5fa",
    skyTop: "#0d121a",
    skyHorizon: "#17202e",
    fogColor: "#17202e",
  },
};

export const OrbitCanvas = forwardRef<OrbitCanvasHandle, OrbitCanvasProps>(function OrbitCanvas(
  {
    glbUrl = null,
    activeCamera,
    comments = [],
    pinMode = false,
    onPickPoint,
    environmentMode = "terrain",
    shadingMode = "textured",
    lightingPreset = "midday",
    heightClass = "h-full",
  },
  ref
) {
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const actionsRef = useRef<{
    capture: () => Promise<{ blob: Blob; camera: CameraSpec } | null>;
    reset: () => void;
    humanEye: () => void;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    captureView: async () => {
      if (!actionsRef.current) return null;
      return actionsRef.current.capture();
    },
    resetCamera: () => {
      actionsRef.current?.reset();
    },
    setHumanEyeView: () => {
      actionsRef.current?.humanEye();
    },
  }));

  const lightCfg = LIGHTING_CONFIGS[lightingPreset];
  const isTerrain = environmentMode === "terrain";

  return (
    <div
      className={`relative w-full overflow-hidden ${heightClass} ${
        pinMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
      }`}
      style={{
        background: isTerrain
          ? `linear-gradient(180deg, ${lightCfg.skyTop} 0%, ${lightCfg.skyHorizon} 48%, ${lightCfg.fogColor} 100%)`
          : "radial-gradient(circle at top, #1f2430, #09090b 75%)",
      }}
    >
      <Canvas
        shadows
        camera={{ position: [-14.5, 6.8, 16.5], fov: 36 }}
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        {isTerrain && <fog attach="fog" args={[lightCfg.fogColor, 52, 145]} />}

        <ambientLight intensity={lightCfg.ambient} />
        <directionalLight
          position={lightCfg.sunPos}
          intensity={lightCfg.sunIntensity}
          color={lightCfg.sunColor}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <directionalLight position={[-14, 10, -12]} intensity={0.4} color="#cbd5e1" />

        <Suspense fallback={null}>
          {glbUrl ? (
            <UploadedGlbModel
              url={glbUrl}
              shadingMode={shadingMode}
              pinMode={pinMode}
              onPickPoint={onPickPoint}
            />
          ) : (
            <DefaultArchitecturalPavilion
              shadingMode={shadingMode}
              pinMode={pinMode}
              onPickPoint={onPickPoint}
            />
          )}

          {isTerrain && (
            <>
              <RollingTerrain pinMode={pinMode} onPickPoint={onPickPoint} />
              <SiteTrees shadingMode={shadingMode} />
            </>
          )}

          {!isTerrain && (
            <ContactShadows
              position={[0, -0.01, 0]}
              opacity={0.55}
              scale={28}
              blur={2.4}
              far={10}
            />
          )}
        </Suspense>

        {environmentMode === "grid" && (
          <Grid
            args={[40, 40]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#27272a"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#F97316"
            fadeDistance={42}
          />
        )}

        {comments.map((comment, idx) => (
          <Html key={comment.id} position={comment.anchor} center distanceFactor={14}>
            <div className="group relative">
              <div className="btn-primary flex size-6 items-center justify-center rounded-full border-2 border-background text-[11px] font-bold shadow-lg">
                {idx + 1}
              </div>
              <div className="pointer-events-none absolute top-0 left-7 z-20 hidden w-48 rounded-lg border border-border bg-card/95 p-2 text-xs text-foreground shadow-xl group-hover:block">
                <p className="font-semibold text-primary">{comment.author}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{comment.text}</p>
              </div>
            </div>
          </Html>
        ))}

        <OrbitControls
          ref={controlsRef}
          makeDefault
          target={[0.2, 1.6, 0.2]}
          minDistance={3}
          maxDistance={65}
          maxPolarAngle={Math.PI / 2 - 0.02}
        />
        <CameraBridge
          activeCamera={activeCamera}
          controlsRef={controlsRef}
          registerActions={(acts) => {
            actionsRef.current = acts;
          }}
        />
      </Canvas>
    </div>
  );
});
