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
import { Center, Grid, Html, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { CameraSpec, CommentRecord } from "@/lib/api";

type OrbitControlsHandle = ComponentRef<typeof OrbitControls>;

export interface OrbitCanvasHandle {
  captureView: () => Promise<{ blob: Blob; camera: CameraSpec } | null>;
}

interface OrbitCanvasProps {
  glbUrl: string;
  activeCamera?: CameraSpec | null;
  comments?: CommentRecord[];
  pinMode?: boolean;
  onPickPoint?: (point: [number, number, number]) => void;
  heightClass?: string;
}

function InteractiveModel({
  url,
  pinMode,
  onPickPoint,
}: {
  url: string;
  pinMode: boolean;
  onPickPoint?: (point: [number, number, number]) => void;
}) {
  const { scene } = useGLTF(url);
  const cloned = useMemo(() => scene.clone(true), [scene]);

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (!pinMode || !onPickPoint) return;
    e.stopPropagation();
    const p = e.point;
    onPickPoint([Number(p.x.toFixed(2)), Number(p.y.toFixed(2)), Number(p.z.toFixed(2))]);
  }

  return (
    <Center top>
      <primitive object={cloned} onClick={handleClick} />
    </Center>
  );
}

function CameraBridge({
  activeCamera,
  controlsRef,
  registerCapture,
}: {
  activeCamera?: CameraSpec | null;
  controlsRef: React.RefObject<OrbitControlsHandle | null>;
  registerCapture: (fn: () => Promise<{ blob: Blob; camera: CameraSpec } | null>) => void;
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
    registerCapture(async () => {
      gl.render(scene, camera);
      const canvas = gl.domElement;
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/png")
      );
      if (!blob) return null;
      const tgt = controlsRef.current?.target ?? new THREE.Vector3(0, 1.5, 0);
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 42;
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
    });
  }, [camera, controlsRef, gl, registerCapture, scene]);

  return null;
}

export const OrbitCanvas = forwardRef<OrbitCanvasHandle, OrbitCanvasProps>(function OrbitCanvas(
  { glbUrl, activeCamera, comments = [], pinMode = false, onPickPoint, heightClass = "h-[500px]" },
  ref
) {
  const controlsRef = useRef<OrbitControlsHandle | null>(null);
  const captureFnRef = useRef<(() => Promise<{ blob: Blob; camera: CameraSpec } | null>) | null>(
    null
  );

  useImperativeHandle(ref, () => ({
    captureView: async () => {
      if (!captureFnRef.current) return null;
      return captureFnRef.current();
    },
  }));

  return (
    <div
      className={`relative w-full overflow-hidden rounded-xl border border-zinc-800 ${heightClass} bg-[radial-gradient(circle_at_top,#1f2430,#09090b_72%)] ${
        pinMode ? "cursor-crosshair" : ""
      }`}
    >
      <Canvas
        camera={{ position: [9, 6, 9], fov: 42 }}
        gl={{ preserveDrawingBuffer: true, antialias: true }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.75} />
        <directionalLight position={[10, 14, 8]} intensity={1.35} />
        <directionalLight position={[-8, 6, -6]} intensity={0.45} color="#cbd5e1" />

        <Suspense fallback={null}>
          <InteractiveModel url={glbUrl} pinMode={pinMode} onPickPoint={onPickPoint} />
        </Suspense>

        {comments.map((comment, idx) => (
          <Html key={comment.id} position={comment.anchor} center distanceFactor={14}>
            <div className="group relative">
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-zinc-950 bg-amber-400 text-[11px] font-bold text-zinc-950 shadow-lg">
                {idx + 1}
              </div>
              <div className="pointer-events-none absolute left-7 top-0 z-20 hidden w-48 rounded-lg border border-zinc-700 bg-zinc-950/95 p-2 text-xs text-zinc-100 shadow-xl group-hover:block">
                <p className="font-semibold text-amber-300">{comment.author}</p>
                <p className="mt-0.5 text-[11px] text-zinc-300">{comment.text}</p>
              </div>
            </div>
          </Html>
        ))}

        <Grid
          args={[28, 28]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#27272a"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#52525b"
          fadeDistance={32}
        />

        <OrbitControls ref={controlsRef} makeDefault />
        <CameraBridge
          activeCamera={activeCamera}
          controlsRef={controlsRef}
          registerCapture={(fn) => {
            captureFnRef.current = fn;
          }}
        />
      </Canvas>
    </div>
  );
});
