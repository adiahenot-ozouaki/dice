import { Canvas, useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import type { Group } from "three";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  InstancedMesh,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import type { Face } from "@/lib/faces";

const SIZE = 1.45;
const HALF = SIZE / 2;
const PIP_R = 0.092;
const SPREAD = 0.28;
const SURFACE = HALF + 0.008;

const UP = new Vector3(0, 1, 0);
const Y_AXIS = new Vector3(0, 1, 0);

const NORMALS: Record<Face, Vector3> = {
  1: new Vector3(0, 1, 0),
  6: new Vector3(0, -1, 0),
  2: new Vector3(0, 0, 1),
  5: new Vector3(0, 0, -1),
  3: new Vector3(1, 0, 0),
  4: new Vector3(-1, 0, 0),
};

const FACES: Face[] = [1, 2, 3, 4, 5, 6];

function pipLayout(face: Face): Array<[number, number]> {
  const a = SPREAD;
  const corners: Array<[number, number]> = [
    [-a, a],
    [a, a],
    [-a, -a],
    [a, -a],
  ];
  switch (face) {
    case 1:
      return [[0, 0]];
    case 2:
      return [
        [-a, a],
        [a, -a],
      ];
    case 3:
      return [
        [-a, a],
        [0, 0],
        [a, -a],
      ];
    case 4:
      return corners;
    case 5:
      return [...corners, [0, 0]];
    case 6:
      return [
        [-a, a],
        [-a, 0],
        [-a, -a],
        [a, a],
        [a, 0],
        [a, -a],
      ];
  }
}

function faceAxes(normal: Vector3, uOut: Vector3, vOut: Vector3) {
  const forward = normal.clone().negate();
  const hint = Math.abs(forward.dot(UP)) > 0.9 ? new Vector3(0, 0, -1) : UP.clone();
  uOut.crossVectors(forward, hint).normalize();
  vOut.crossVectors(uOut, forward).normalize();
}

function faceQuaternion(face: Face, twist: number, out: Quaternion) {
  const align = new Quaternion().setFromUnitVectors(NORMALS[face], UP);
  const spin = new Quaternion().setFromAxisAngle(UP, twist);
  return out.copy(spin).multiply(align);
}

function readTop(q: Quaternion, n: Vector3): Face {
  let best: Face = 1;
  let bestDot = -Infinity;
  for (const face of FACES) {
    n.copy(NORMALS[face]).applyQuaternion(q);
    if (n.y > bestDot) {
      bestDot = n.y;
      best = face;
    }
  }
  return best;
}

const BASE_Y = 0.39;

function hopHeight(t: number) {
  if (t < 0.74) return Math.sin((t / 0.74) * Math.PI) * 0.72;
  return Math.sin(((t - 0.74) / 0.26) * Math.PI) * 0.1;
}

function makeFeltMap() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext("2d");
  if (!g) throw new Error("canvas");
  const grad = g.createRadialGradient(256, 256, 30, 256, 256, 280);
  grad.addColorStop(0, "#1c4332");
  grad.addColorStop(0.62, "#143226");
  grad.addColorStop(1, "#0d2218");
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 5000; i++) {
    const v = 16 + Math.random() * 30;
    g.fillStyle = `rgba(${v}, ${46 + Math.random() * 24}, ${v + 8}, 0.28)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 1, 2);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

type Anim = {
  seen: number;
  active: boolean;
  reduce: boolean;
  t0: number;
  duration: number;
  turns: number;
  axis: Vector3;
  start: Quaternion;
  end: Quaternion;
  spin: Quaternion;
  blend: Quaternion;
  yaw: Quaternion;
  n: Vector3;
};

function Pips() {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const u = new Vector3();
    const v = new Vector3();
    let i = 0;
    for (const face of FACES) {
      const normal = NORMALS[face];
      faceAxes(normal, u, v);
      for (const [pu, pv] of pipLayout(face)) {
        dummy.position
          .copy(normal)
          .multiplyScalar(SURFACE)
          .addScaledVector(u, pu)
          .addScaledVector(v, pv);
        dummy.quaternion.setFromUnitVectors(Y_AXIS, normal);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, []);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 21]} frustumCulled={false}>
      <cylinderGeometry args={[PIP_R, PIP_R, 0.03, 22]} />
      <meshStandardMaterial color="#1a120c" roughness={0.38} metalness={0.18} />
    </instancedMesh>
  );
}

function Die({
  target,
  spinId,
  onSettled,
}: {
  target: Face | null;
  spinId: number;
  onSettled: (top: Face) => void;
}) {
  const group = useRef<Group>(null);
  const anim = useRef<Anim | null>(null);
  if (!anim.current) {
    anim.current = {
      seen: -1,
      active: false,
      reduce:
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      t0: 0,
      duration: 1,
      turns: 0,
      axis: new Vector3(1, 0, 0),
      start: new Quaternion(),
      end: new Quaternion(),
      spin: new Quaternion(),
      blend: new Quaternion(),
      yaw: new Quaternion(),
      n: new Vector3(),
    };
  }

  useFrame((state, delta) => {
    const g = group.current;
    const a = anim.current;
    if (!g || !a) return;
    const d = Math.min(delta, 0.1);

    if (a.seen < 0) {
      a.seen = spinId;
    } else if (spinId !== a.seen && target != null) {
      a.seen = spinId;
      a.active = true;
      a.t0 = state.clock.elapsedTime;
      a.duration = a.reduce ? 0.16 : 1.02 + Math.random() * 0.22;
      a.turns = a.reduce ? 0 : 2 + Math.floor(Math.random() * 3);
      a.axis.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (a.axis.lengthSq() < 1e-4) a.axis.set(0.4, 1, 0.2);
      a.axis.normalize();
      a.start.copy(g.quaternion);
      faceQuaternion(target, Math.random() * Math.PI * 2, a.end);
    }

    if (!a.active) {
      if (!a.reduce) {
        a.yaw.setFromAxisAngle(UP, d * 0.15);
        g.quaternion.premultiply(a.yaw);
        g.position.y = BASE_Y + Math.sin(state.clock.elapsedTime * 1.3) * 0.006;
      }
      return;
    }

    const t = Math.min(1, (state.clock.elapsedTime - a.t0) / a.duration);
    const ease = 1 - Math.pow(1 - Math.min(1, t / 0.84), 3);
    g.position.y = BASE_Y + (a.reduce ? 0 : hopHeight(t));
    a.spin.setFromAxisAngle(a.axis, ease * a.turns * Math.PI * 2);
    a.blend.copy(a.start).slerp(a.end, ease);
    g.quaternion.copy(a.spin).multiply(a.blend);

    if (t >= 1) {
      a.active = false;
      g.quaternion.copy(a.end);
      g.position.y = BASE_Y;
      onSettled(readTop(g.quaternion, a.n));
    }
  });

  return (
    <group ref={group} position={[0, 0.42, 0]}>
      <RoundedBox
        args={[SIZE, SIZE, SIZE]}
        radius={0.14}
        smoothness={5}
        bevelSegments={3}
        creaseAngle={0.4}
        castShadow
        receiveShadow
      >
        <meshPhysicalMaterial
          color="#f3e6cc"
          roughness={0.4}
          metalness={0}
          clearcoat={0.14}
          clearcoatRoughness={0.5}
          sheen={0.5}
          sheenColor="#fff3dc"
          sheenRoughness={0.65}
        />
      </RoundedBox>
      <Pips />
    </group>
  );
}

function Table() {
  const map = useMemo(() => makeFeltMap(), []);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.34, 0]} receiveShadow>
        <circleGeometry args={[3.6, 96]} />
        <meshStandardMaterial map={map} roughness={1} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.332, 0]}>
        <ringGeometry args={[1.72, 1.78, 80]} />
        <meshStandardMaterial color="#d4b15a" metalness={0.62} roughness={0.34} />
      </mesh>
      <mesh position={[0, -0.46, 0]} receiveShadow>
        <cylinderGeometry args={[3.55, 3.7, 0.22, 72]} />
        <meshStandardMaterial color="#0c1c14" roughness={0.92} />
      </mesh>
    </group>
  );
}

function Rig({ impulse }: { impulse: number }) {
  const kick = useRef(0);
  const last = useRef(impulse);
  useFrame((state, delta) => {
    const d = Math.min(delta, 0.1);
    if (impulse !== last.current) {
      last.current = impulse;
      kick.current = 1;
    }
    kick.current = Math.max(0, kick.current - d * 2.4);
    const s = kick.current;
    const t = state.clock.elapsedTime;
    state.camera.position.set(
      2.05 + Math.sin(t * 43) * 0.05 * s,
      2.55 + Math.cos(t * 37) * 0.04 * s,
      5.8,
    );
    state.camera.lookAt(0, 0.05, 0);
  });
  return null;
}

export function DiceStage({
  target,
  spinId,
  impulse,
  onSettled,
  onReady,
}: {
  target: Face | null;
  spinId: number;
  impulse: number;
  onSettled: (top: Face) => void;
  onReady: () => void;
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: [2.05, 2.55, 5.8], fov: 30, near: 0.1, far: 40 }}
      gl={{
        antialias: true,
        toneMapping: ACESFilmicToneMapping,
        toneMappingExposure: 1.2,
      }}
      onCreated={() => {
        document.documentElement.dataset.die = "ready";
        onReady();
      }}
    >
      <color attach="background" args={["#07140f"]} />
      <ambientLight intensity={0.55} color="#fff6ea" />
      <hemisphereLight args={["#fff4e4", "#163528", 0.72]} />
      <directionalLight
        position={[4.2, 7.2, 3.2]}
        intensity={2.6}
        color="#fff8ee"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-camera-far={18}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />
      <directionalLight position={[-3.4, 2.4, -3.6]} intensity={1.15} color="#e7d7a4" />
      <directionalLight position={[0.4, 1.2, 5]} intensity={0.45} color="#f4efe4" />
      <Table />
      <Die target={target} spinId={spinId} onSettled={onSettled} />
      <Rig impulse={impulse} />
    </Canvas>
  );
}
