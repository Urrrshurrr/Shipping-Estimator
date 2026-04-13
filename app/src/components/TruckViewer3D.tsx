import { useMemo, useRef, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { TruckLoad, PackedBundle } from '../types';
import { TRAILER_SPECS, getAllTrailerSpecs, DUNNAGE_HEIGHT_IN } from '../data';

interface Props {
  truck: TruckLoad;
  selectedBundleId: string | null;
  onBundleSelect: (bundleId: string | null) => void;
  onBundleMove?: (bundleId: string, newPos: { x: number; y: number; z: number }) => void;
  allTrucks?: TruckLoad[];
  currentTruckIndex: number;
  onMoveBundleToTruck?: (bundleId: string, targetTruckIndex: number) => void;
}

// Scale: 1 unit = 1 inch in Three.js, then scale everything down for display
const SCALE = 0.01; // 1 inch = 0.01 units

function TrailerBed({ truck, onDeselect }: { truck: TruckLoad; onDeselect: () => void }) {
  const trailer = getAllTrailerSpecs()[truck.trailerType] ?? TRAILER_SPECS['53-flatbed'];
  const lengthIn = trailer.deckLengthFt * 12;
  const widthIn = trailer.internalWidthIn;
  const heightIn = 4; // bed thickness

  const lS = lengthIn * SCALE;
  const wS = widthIn * SCALE;
  const hS = heightIn * SCALE;

  return (
    <group>
      {/* Bed */}
      <mesh position={[lS / 2, -hS / 2, wS / 2]} onClick={onDeselect}>
        <boxGeometry args={[lS, hS, wS]} />
        <meshStandardMaterial color="#4b5563" transparent opacity={0.4} />
      </mesh>

      {/* Outline wireframe */}
      <mesh position={[lS / 2, -hS / 2, wS / 2]}>
        <boxGeometry args={[lS, hS, wS]} />
        <meshBasicMaterial color="#9ca3af" wireframe />
      </mesh>

      {/* Max height outline – full cargo envelope wireframe */}
      {(() => {
        const hMax = trailer.internalHeightIn * SCALE;
        return (
          <>
            {/* Bottom edges (deck level) */}
            <Line points={[[0, 0, 0], [lS, 0, 0]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            <Line points={[[lS, 0, 0], [lS, 0, wS]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            <Line points={[[lS, 0, wS], [0, 0, wS]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            <Line points={[[0, 0, wS], [0, 0, 0]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            {/* Top edges */}
            <Line points={[[0, hMax, 0], [lS, hMax, 0]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            <Line points={[[lS, hMax, 0], [lS, hMax, wS]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            <Line points={[[lS, hMax, wS], [0, hMax, wS]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            <Line points={[[0, hMax, wS], [0, hMax, 0]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            {/* Vertical edges */}
            <Line points={[[0, 0, 0], [0, hMax, 0]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            <Line points={[[lS, 0, 0], [lS, hMax, 0]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            <Line points={[[lS, 0, wS], [lS, hMax, wS]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
            <Line points={[[0, 0, wS], [0, hMax, wS]]} color="#6b7280" lineWidth={1} dashed dashSize={0.05} gapSize={0.03} />
          </>
        );
      })()}

    </group>
  );
}

const BUNDLE_COLORS = [
  '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

// Reusable Three.js objects for raycasting (avoid GC pressure)
const _raycaster = new THREE.Raycaster();
const _mouse = new THREE.Vector2();
const _intersection = new THREE.Vector3();
const SNAP_INCHES = 1;

interface BundlePosition {
  x: number;
  y: number;
  z: number;
  bundle: PackedBundle;
  color: string;
}

interface DragState {
  bundleId: string;
  offsetX: number;
  offsetZ: number;
  offsetY: number;
  startPos: { x: number; y: number; z: number };
  bundle: PackedBundle;
}

// ============================================================
// Position computation – extracted layout algorithm
// ============================================================
function computeBundlePositions(
  bundles: PackedBundle[],
  maxWidth: number,
  maxHeight: number,
  totalDeckLengthIn: number,
  positionOverrides?: Record<string, { x: number; y: number; z: number }>,
): BundlePosition[] {
  const result: BundlePosition[] = [];

  interface Slot {
    x: number; z: number; lengthIn: number; widthIn: number;
    stackHeight: number; category: string;
  }
  const slots: Slot[] = [];

  interface Row {
    x: number; lengthIn: number; usedWidth: number; category: string;
  }
  const rows: Row[] = [];

  const categoryOrder: Record<string, number> = { frame: 0, beam: 1, accessory: 2 };
  const sorted = [...bundles].sort((a, b) => {
    const catA = categoryOrder[a.category] ?? 9;
    const catB = categoryOrder[b.category] ?? 9;
    if (catA !== catB) return catA - catB;
    if (Math.abs(a.lengthIn - b.lengthIn) > 6) return b.lengthIn - a.lengthIn;
    return b.totalWeightLbs - a.totalWeightLbs;
  });

  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    let placed = false;

    for (const row of rows) {
      if (row.category !== b.category) continue;
      if (b.lengthIn <= row.lengthIn && row.usedWidth + b.widthIn <= maxWidth) {
        slots.push({ x: row.x, z: row.usedWidth, lengthIn: b.lengthIn, widthIn: b.widthIn, stackHeight: b.heightIn, category: b.category });
        result.push({ x: row.x, y: 0, z: row.usedWidth, bundle: b, color: BUNDLE_COLORS[i % BUNDLE_COLORS.length] });
        row.usedWidth += b.widthIn;
        placed = true;
        break;
      }
    }
    if (placed) continue;

    let bestSlotIdx = -1;
    let bestIsSameCategory = false;
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si];
      if (b.lengthIn <= slot.lengthIn && b.widthIn <= slot.widthIn) {
        const newHeight = slot.stackHeight + DUNNAGE_HEIGHT_IN + b.heightIn;
        if (newHeight <= maxHeight) {
          const sameCategory = slot.category === b.category;
          if (bestSlotIdx < 0 || (sameCategory && !bestIsSameCategory)) {
            bestSlotIdx = si;
            bestIsSameCategory = sameCategory;
          }
        }
      }
    }
    if (bestSlotIdx >= 0) {
      const slot = slots[bestSlotIdx];
      result.push({ x: slot.x, y: slot.stackHeight + DUNNAGE_HEIGHT_IN, z: slot.z, bundle: b, color: BUNDLE_COLORS[i % BUNDLE_COLORS.length] });
      slot.stackHeight += DUNNAGE_HEIGHT_IN + b.heightIn;
      placed = true;
    }
    if (placed) continue;

    const currentUsedLength = rows.reduce((max, r) => Math.max(max, r.x + r.lengthIn), 0);
    if (currentUsedLength + b.lengthIn <= totalDeckLengthIn) {
      rows.push({ x: currentUsedLength, lengthIn: b.lengthIn, usedWidth: b.widthIn, category: b.category });
      slots.push({ x: currentUsedLength, z: 0, lengthIn: b.lengthIn, widthIn: b.widthIn, stackHeight: b.heightIn, category: b.category });
      result.push({ x: currentUsedLength, y: 0, z: 0, bundle: b, color: BUNDLE_COLORS[i % BUNDLE_COLORS.length] });
    }
  }

  // Apply manual position overrides (from drag-and-drop)
  return result.map(pos => {
    const override = positionOverrides?.[pos.bundle.id];
    if (override) return { ...pos, x: override.x, y: override.y, z: override.z };
    return pos;
  });
}

// ============================================================
// BundleMesh – individual bundle with selection highlight + label
// ============================================================
function BundleMesh({ pos, isSelected, onClick, onDragStart, draggingRef, dragPosRef }: {
  pos: BundlePosition;
  isSelected: boolean;
  onClick: () => void;
  onDragStart: (e: PointerEvent) => void;
  draggingRef: React.MutableRefObject<DragState | null>;
  dragPosRef: React.MutableRefObject<{ x: number; y: number; z: number } | null>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const b = pos.bundle;
  const lS = b.lengthIn * SCALE;
  const wS = b.widthIn * SCALE;
  const hS = b.heightIn * SCALE;

  // Smooth drag: update Three.js transform directly in animation loop
  useFrame(() => {
    if (!groupRef.current) return;
    if (draggingRef.current?.bundleId === b.id && dragPosRef.current) {
      groupRef.current.position.x = dragPosRef.current.x * SCALE;
      groupRef.current.position.y = dragPosRef.current.y * SCALE;
      groupRef.current.position.z = dragPosRef.current.z * SCALE;
    } else {
      groupRef.current.position.x = pos.x * SCALE;
      groupRef.current.position.y = pos.y * SCALE;
      groupRef.current.position.z = pos.z * SCALE;
    }
  });

  const desc = b.description.length > 20 ? b.description.slice(0, 18) + '\u2026' : b.description;
  const detail = `${b.pieces}pc \u00b7 ${Math.round(b.totalWeightLbs).toLocaleString()}lbs`;
  const showLabel = lS > 0.3 && wS > 0.15;
  const fontSize = Math.min(lS * 0.1, wS * 0.22, 0.06);
  const fontSizeSm = fontSize * 0.75;

  return (
    <group ref={groupRef} position={[pos.x * SCALE, pos.y * SCALE, pos.z * SCALE]}>
      {/* Bundle body */}
      <mesh
        position={[lS / 2, hS / 2, wS / 2]}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerDown={(e) => {
          if (isSelected) {
            e.stopPropagation();
            const ne = (e as unknown as { nativeEvent: PointerEvent }).nativeEvent;
            onDragStart(ne);
          }
        }}
        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
      >
        <boxGeometry args={[lS * 0.98, hS * 0.95, wS * 0.98]} />
        <meshStandardMaterial
          color={isSelected ? '#93c5fd' : pos.color}
          emissive={isSelected ? '#3b82f6' : '#000000'}
          emissiveIntensity={isSelected ? 0.4 : 0}
          transparent
          opacity={isSelected ? 0.95 : 0.8}
        />
      </mesh>

      {/* Wireframe outline */}
      <mesh position={[lS / 2, hS / 2, wS / 2]}>
        <boxGeometry args={[lS * 0.98, hS * 0.95, wS * 0.98]} />
        <meshBasicMaterial color={isSelected ? '#60a5fa' : '#000'} wireframe transparent opacity={isSelected ? 0.6 : 0.3} />
      </mesh>

      {/* Labels on top face */}
      {showLabel && (
        <>
          <Text
            position={[lS / 2, hS + 0.01, wS / 2]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={fontSize}
            maxWidth={lS * 0.9}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            outlineWidth={fontSize * 0.08}
            outlineColor="#000000"
          >
            {desc}
          </Text>
          <Text
            position={[lS / 2, hS + 0.005, wS / 2 + fontSize * 1.3]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={fontSizeSm}
            maxWidth={lS * 0.9}
            color="#d1d5db"
            anchorX="center"
            anchorY="middle"
            outlineWidth={fontSizeSm * 0.08}
            outlineColor="#000000"
          >
            {detail}
          </Text>
        </>
      )}
    </group>
  );
}

// ============================================================
// BundlesScene – manages all bundles, drag logic, pointer events
// ============================================================
function BundlesScene({
  truck, selectedBundleId, onBundleSelect, onBundleMove, orbitRef, positionOverrides,
}: {
  truck: TruckLoad;
  selectedBundleId: string | null;
  onBundleSelect: (id: string | null) => void;
  onBundleMove?: (id: string, pos: { x: number; y: number; z: number }) => void;
  orbitRef: React.MutableRefObject<unknown>;
  positionOverrides?: Record<string, { x: number; y: number; z: number }>;
}) {
  const { camera, gl } = useThree();
  const trailer = getAllTrailerSpecs()[truck.trailerType] ?? TRAILER_SPECS['53-flatbed'];
  const maxWidth = trailer.internalWidthIn;
  const maxHeight = trailer.internalHeightIn;
  const totalDeckLengthIn = trailer.deckLengthFt * 12;

  const positions = useMemo(
    () => computeBundlePositions(truck.bundles, maxWidth, maxHeight, totalDeckLengthIn, positionOverrides),
    [truck.bundles, maxWidth, maxHeight, totalDeckLengthIn, positionOverrides],
  );

  const draggingRef = useRef<DragState | null>(null);
  const dragPosRef = useRef<{ x: number; y: number; z: number } | null>(null);
  const dragPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), []);
  const verticalPlane = useMemo(() => new THREE.Plane(), []);
  const shiftHeldRef = useRef(false);

  const handleDragStart = useCallback((bundleId: string, nativeEvent: PointerEvent) => {
    const pos = positions.find(p => p.bundle.id === bundleId);
    if (!pos) return;

    dragPlane.set(new THREE.Vector3(0, 1, 0), -(pos.y * SCALE));

    const rect = gl.domElement.getBoundingClientRect();
    _mouse.set(
      ((nativeEvent.clientX - rect.left) / rect.width) * 2 - 1,
      -((nativeEvent.clientY - rect.top) / rect.height) * 2 + 1,
    );
    _raycaster.setFromCamera(_mouse, camera);

    if (_raycaster.ray.intersectPlane(dragPlane, _intersection)) {
      draggingRef.current = {
        bundleId,
        offsetX: _intersection.x - pos.x * SCALE,
        offsetZ: _intersection.z - pos.z * SCALE,
        offsetY: 0,
        startPos: { x: pos.x, y: pos.y, z: pos.z },
        bundle: pos.bundle,
      };
      dragPosRef.current = { x: pos.x, y: pos.y, z: pos.z };
      if (orbitRef.current) orbitRef.current.enabled = false;
    }
  }, [positions, gl, camera, dragPlane, orbitRef]);

  useEffect(() => {
    const canvas = gl.domElement;

    const handleMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const drag = draggingRef.current;
      const rect = canvas.getBoundingClientRect();
      _mouse.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      _raycaster.setFromCamera(_mouse, camera);

      if (shiftHeldRef.current) {
        // Vertical mode: use a camera-facing vertical plane through the bundle
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();
        const curPos = dragPosRef.current ?? drag.startPos;
        const bundleCenterX = (curPos.x + drag.bundle.lengthIn / 2) * SCALE;
        const bundleCenterZ = (curPos.z + drag.bundle.widthIn / 2) * SCALE;
        verticalPlane.setFromNormalAndCoplanarPoint(
          camDir,
          new THREE.Vector3(bundleCenterX, curPos.y * SCALE, bundleCenterZ),
        );
        if (_raycaster.ray.intersectPlane(verticalPlane, _intersection)) {
          if (drag.offsetY === 0) {
            drag.offsetY = _intersection.y - curPos.y * SCALE;
          }
          let newY = (_intersection.y - drag.offsetY) / SCALE;
          newY = Math.round(newY / SNAP_INCHES) * SNAP_INCHES;
          newY = Math.max(0, Math.min(newY, maxHeight - drag.bundle.heightIn));
          dragPosRef.current = { x: curPos.x, y: newY, z: curPos.z };
        }
      } else {
        // Horizontal mode: move X/Z on the drag plane
        drag.offsetY = 0; // reset vertical offset when shift released
        if (_raycaster.ray.intersectPlane(dragPlane, _intersection)) {
          let newX = (_intersection.x - drag.offsetX) / SCALE;
          let newZ = (_intersection.z - drag.offsetZ) / SCALE;
          newX = Math.round(newX / SNAP_INCHES) * SNAP_INCHES;
          newZ = Math.round(newZ / SNAP_INCHES) * SNAP_INCHES;
          newX = Math.max(0, Math.min(newX, totalDeckLengthIn - drag.bundle.lengthIn));
          newZ = Math.max(0, Math.min(newZ, maxWidth - drag.bundle.widthIn));
          const curY = dragPosRef.current?.y ?? drag.startPos.y;
          dragPosRef.current = { x: newX, y: curY, z: newZ };
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = false;
    };

    const handleUp = () => {
      if (!draggingRef.current) return;
      const drag = draggingRef.current;
      const finalPos = dragPosRef.current;

      if (finalPos && onBundleMove) {
        const clampedX = Math.max(0, Math.min(finalPos.x, totalDeckLengthIn - drag.bundle.lengthIn));
        const clampedZ = Math.max(0, Math.min(finalPos.z, maxWidth - drag.bundle.widthIn));
        const clampedY = Math.max(0, Math.min(finalPos.y, maxHeight - drag.bundle.heightIn));

        const adx = Math.abs(clampedX - drag.startPos.x);
        const ady = Math.abs(clampedY - drag.startPos.y);
        const adz = Math.abs(clampedZ - drag.startPos.z);
        if (adx + ady + adz < 2) {
          draggingRef.current = null;
          dragPosRef.current = null;
          shiftHeldRef.current = false;
          if (orbitRef.current) orbitRef.current.enabled = true;
          return;
        }

        // Build mutable snapshot of all bundle positions
        const snap = new Map<string, { x: number; y: number; z: number; bundle: PackedBundle }>();
        for (const p of positions) {
          snap.set(p.bundle.id, { x: p.x, y: p.y, z: p.z, bundle: p.bundle });
        }

        const eps = 0.5;
        const isVerticalMove = ady > 1 && ady > (adx + adz);

        // Helper: check if two bounding boxes overlap in 3D
        const overlaps3D = (
          ax: number, ay: number, az: number, aBundle: PackedBundle,
          bx: number, by: number, bz: number, bBundle: PackedBundle,
        ) => {
          return ax + eps < bx + bBundle.lengthIn && ax + aBundle.lengthIn > bx + eps
              && ay + eps < by + bBundle.heightIn && ay + aBundle.heightIn > by + eps
              && az + eps < bz + bBundle.widthIn && az + aBundle.widthIn > bz + eps;
        };

        // Helper: compute gravity Y for a given bundle at (x, z), ignoring certain IDs
        const computeGravityY = (
          x: number, z: number, bundle: PackedBundle, ignoreIds: Set<string>,
        ) => {
          let gY = 0;
          for (const [id, o] of snap) {
            if (ignoreIds.has(id)) continue;
            if (x + eps < o.x + o.bundle.lengthIn && x + bundle.lengthIn > o.x + eps
             && z + eps < o.z + o.bundle.widthIn && z + bundle.widthIn > o.z + eps) {
              const top = o.y + o.bundle.heightIn + DUNNAGE_HEIGHT_IN;
              if (top > gY) gY = top;
            }
          }
          return Math.min(gY, maxHeight - bundle.heightIn);
        };

        // Find bundles that the dragged bundle would overlap at the drop position
        const findOverlapping = (tx: number, ty: number, tz: number) => {
          const result: string[] = [];
          for (const [id, o] of snap) {
            if (id === drag.bundleId) continue;
            if (overlaps3D(tx, ty, tz, drag.bundle, o.x, o.y, o.z, o.bundle)) {
              result.push(id);
            }
          }
          return result;
        };

        // Determine the target position for the dragged bundle
        let targetX = clampedX;
        let targetZ = clampedZ;
        let targetY = clampedY;

        if (!isVerticalMove) {
          // Horizontal: compute gravity Y at drop XZ
          targetY = computeGravityY(targetX, targetZ, drag.bundle, new Set([drag.bundleId]));
        }

        // Find which bundles we'd collide with
        const overlapping = findOverlapping(targetX, targetY, targetZ);

        if (overlapping.length === 0) {
          // ── FREE SPACE: just place the bundle ──
          snap.set(drag.bundleId, { x: targetX, y: targetY, z: targetZ, bundle: drag.bundle });
          onBundleMove(drag.bundleId, { x: targetX, y: targetY, z: targetZ });

        } else if (isVerticalMove) {
          // ── VERTICAL RESTACK ──
          // Gather all bundles in the same column (overlapping XZ footprint)
          const columnIds = new Set<string>([drag.bundleId]);
          for (const [id, o] of snap) {
            if (id === drag.bundleId) continue;
            const xO = drag.startPos.x + eps < o.x + o.bundle.lengthIn && drag.startPos.x + drag.bundle.lengthIn > o.x + eps;
            const zO = drag.startPos.z + eps < o.z + o.bundle.widthIn && drag.startPos.z + drag.bundle.widthIn > o.z + eps;
            if (xO && zO) columnIds.add(id);
          }

          // Sort column members by Y (excluding dragged bundle)
          const others: Array<{ id: string; entry: typeof snap extends Map<string, infer V> ? V : never }> = [];
          for (const id of columnIds) {
            if (id === drag.bundleId) continue;
            others.push({ id, entry: snap.get(id)! });
          }
          others.sort((a, b) => a.entry.y - b.entry.y);

          // Determine insertion index based on where the user dropped
          const movingDown = clampedY < drag.startPos.y;
          let insertIdx = others.length;
          for (let i = 0; i < others.length; i++) {
            const midY = others[i].entry.y + others[i].entry.bundle.heightIn / 2;
            if (clampedY < midY || (Math.abs(clampedY - midY) < 2 && movingDown)) {
              insertIdx = i;
              break;
            }
          }

          // Build new order with dragged bundle inserted
          const ordered = others.map(o => o.id);
          ordered.splice(insertIdx, 0, drag.bundleId);

          // Find base Y (top of non-column bundles under this footprint)
          let baseY = 0;
          for (const [id, o] of snap) {
            if (columnIds.has(id)) continue;
            const first = snap.get(ordered[0])!;
            const xO = first.x + eps < o.x + o.bundle.lengthIn && first.x + first.bundle.lengthIn > o.x + eps;
            const zO = first.z + eps < o.z + o.bundle.widthIn && first.z + first.bundle.widthIn > o.z + eps;
            if (xO && zO) {
              const top = o.y + o.bundle.heightIn + DUNNAGE_HEIGHT_IN;
              if (top > baseY) baseY = top;
            }
          }

          // Check total height fits
          let totalH = baseY;
          for (const id of ordered) {
            totalH += snap.get(id)!.bundle.heightIn + DUNNAGE_HEIGHT_IN;
          }
          totalH -= DUNNAGE_HEIGHT_IN;

          if (totalH <= maxHeight) {
            let curY = baseY;
            for (const id of ordered) {
              const entry = snap.get(id)!;
              entry.y = curY;
              onBundleMove(id, { x: entry.x, y: curY, z: entry.z });
              curY += entry.bundle.heightIn + DUNNAGE_HEIGHT_IN;
            }
          }
          // If doesn't fit, bundle snaps back (no changes committed for it)

        } else {
          // ── HORIZONTAL SWAP ──
          // Find the single most-overlapping bundle to swap with
          let bestSwapId: string | null = null;
          let bestArea = 0;
          for (const ovId of overlapping) {
            const o = snap.get(ovId)!;
            const xOvlp = Math.max(0, Math.min(targetX + drag.bundle.lengthIn, o.x + o.bundle.lengthIn) - Math.max(targetX, o.x));
            const zOvlp = Math.max(0, Math.min(targetZ + drag.bundle.widthIn, o.z + o.bundle.widthIn) - Math.max(targetZ, o.z));
            const area = xOvlp * zOvlp;
            if (area > bestArea) { bestArea = area; bestSwapId = ovId; }
          }

          if (bestSwapId) {
            const swapEntry = snap.get(bestSwapId)!;
            const dragEntry = snap.get(drag.bundleId)!;

            // Save original positions of both bundles
            const origDragX = dragEntry.x, origDragY = dragEntry.y, origDragZ = dragEntry.z;
            const origSwapX = swapEntry.x, origSwapY = swapEntry.y, origSwapZ = swapEntry.z;

            // Move swap bundle to dragged bundle's original position, with gravity
            const swapNewX = Math.max(0, Math.min(origDragX, totalDeckLengthIn - swapEntry.bundle.lengthIn));
            const swapNewZ = Math.max(0, Math.min(origDragZ, maxWidth - swapEntry.bundle.widthIn));
            // Temporarily remove both bundles from snap for gravity calc
            const bothIds = new Set([drag.bundleId, bestSwapId]);
            const swapNewY = computeGravityY(swapNewX, swapNewZ, swapEntry.bundle, bothIds);

            // Move dragged bundle to target position, with gravity (excluding both)
            const dragNewY = computeGravityY(targetX, targetZ, drag.bundle, bothIds);

            // Apply both positions
            swapEntry.x = swapNewX; swapEntry.y = swapNewY; swapEntry.z = swapNewZ;
            dragEntry.x = targetX; dragEntry.y = dragNewY; dragEntry.z = targetZ;

            // Check for remaining overlap between the TWO swapped bundles
            if (overlaps3D(dragEntry.x, dragEntry.y, dragEntry.z, drag.bundle,
                           swapEntry.x, swapEntry.y, swapEntry.z, swapEntry.bundle)) {
              // They still overlap (same footprint) — stack the higher one
              if (dragNewY <= swapNewY) {
                swapEntry.y = dragEntry.y + drag.bundle.heightIn + DUNNAGE_HEIGHT_IN;
              } else {
                dragEntry.y = swapEntry.y + swapEntry.bundle.heightIn + DUNNAGE_HEIGHT_IN;
              }
            }

            // Validate both fit in truck
            if (swapEntry.y + swapEntry.bundle.heightIn <= maxHeight + 0.5
             && dragEntry.y + drag.bundle.heightIn <= maxHeight + 0.5) {
              onBundleMove(bestSwapId, { x: swapEntry.x, y: swapEntry.y, z: swapEntry.z });
              onBundleMove(drag.bundleId, { x: dragEntry.x, y: dragEntry.y, z: dragEntry.z });
            } else {
              // Revert — doesn't fit
              swapEntry.x = origSwapX; swapEntry.y = origSwapY; swapEntry.z = origSwapZ;
              dragEntry.x = origDragX; dragEntry.y = origDragY; dragEntry.z = origDragZ;
            }
          }
        }

        // ── CASCADING GRAVITY: settle any bundles that lost support ──
        let gravChanged = true;
        let gravIters = 0;
        while (gravChanged && gravIters < 50) {
          gravChanged = false;
          gravIters++;
          const sorted = [...snap.entries()].sort((a, b) => a[1].y - b[1].y);
          for (const [bId, bp] of sorted) {
            if (bp.y <= 0) continue;
            let highestBelow = 0;
            for (const [otherId, other] of snap) {
              if (otherId === bId) continue;
              const xO = bp.x + eps < other.x + other.bundle.lengthIn && bp.x + bp.bundle.lengthIn > other.x + eps;
              const zO = bp.z + eps < other.z + other.bundle.widthIn && bp.z + bp.bundle.widthIn > other.z + eps;
              if (xO && zO) {
                const top = other.y + other.bundle.heightIn + DUNNAGE_HEIGHT_IN;
                if (top <= bp.y + eps && top > highestBelow) highestBelow = top;
              }
            }
            if (highestBelow < bp.y - 0.5) {
              bp.y = highestBelow;
              gravChanged = true;
            }
          }
        }

        // Emit final updates for any gravity-adjusted bundles
        for (const [id, bp] of snap) {
          const orig = positions.find(p => p.bundle.id === id);
          if (orig && (Math.abs(orig.y - bp.y) > 0.01 || Math.abs(orig.x - bp.x) > 0.01 || Math.abs(orig.z - bp.z) > 0.01)) {
            onBundleMove(id, { x: bp.x, y: bp.y, z: bp.z });
          }
        }
      }

      draggingRef.current = null;
      dragPosRef.current = null;
      shiftHeldRef.current = false;
      if (orbitRef.current) orbitRef.current.enabled = true;
    };

    canvas.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      canvas.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gl, camera, dragPlane, verticalPlane, positions, maxWidth, maxHeight, totalDeckLengthIn, onBundleMove, orbitRef]);

  return (
    <group>
      {positions.map(pos => (
        <BundleMesh
          key={pos.bundle.id}
          pos={pos}
          isSelected={pos.bundle.id === selectedBundleId}
          onClick={() => onBundleSelect(pos.bundle.id === selectedBundleId ? null : pos.bundle.id)}
          onDragStart={(e) => handleDragStart(pos.bundle.id, e)}
          draggingRef={draggingRef}
          dragPosRef={dragPosRef}
        />
      ))}
    </group>
  );
}

// ============================================================
// Main component
// ============================================================
export default function TruckViewer3D({
  truck, selectedBundleId, onBundleSelect, onBundleMove,
  allTrucks, currentTruckIndex, onMoveBundleToTruck,
}: Props) {
  const trailer = getAllTrailerSpecs()[truck.trailerType] ?? TRAILER_SPECS['53-flatbed'];
  const centerX = (trailer.deckLengthFt * 12 * SCALE) / 2;
  const centerZ = (trailer.internalWidthIn * SCALE) / 2;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orbitRef = useRef<any>(null);

  // Escape key to deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onBundleSelect(null); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onBundleSelect]);

  const selectedBundle = selectedBundleId ? truck.bundles.find(b => b.id === selectedBundleId) : null;

  return (
    <div className="viewer-wrapper">
      <div className="viewer-container">
        <Canvas
          camera={{
            position: [centerX + 2, 2, centerZ + 3],
            fov: 50,
            near: 0.1,
            far: 100,
          }}
        >
          <ambientLight intensity={0.6} />
          <directionalLight position={[5, 8, 5]} intensity={0.8} />
          <TrailerBed truck={truck} onDeselect={() => onBundleSelect(null)} />
          <BundlesScene
            truck={truck}
            selectedBundleId={selectedBundleId}
            onBundleSelect={onBundleSelect}
            onBundleMove={onBundleMove}
            orbitRef={orbitRef}
            positionOverrides={truck.bundlePositions}
          />
          <OrbitControls ref={orbitRef} target={[centerX, 0.3, centerZ]} />
          <gridHelper args={[10, 20, '#333', '#222']} position={[centerX, -0.05, centerZ]} />
        </Canvas>
      </div>

      {/* Bundle info panel overlay */}
      {selectedBundle && (
        <div className="bundle-info-panel">
          <button className="info-panel-close" onClick={() => onBundleSelect(null)}>&times;</button>
          <div className="bundle-info-header">
            <strong>{selectedBundle.description}</strong>
            {selectedBundle.isPartial && <span className="badge badge-warning">Partial</span>}
          </div>
          <div className="bundle-info-details">
            <div className="info-row"><span>Category</span><span style={{ textTransform: 'capitalize' }}>{selectedBundle.category}</span></div>
            <div className="info-row"><span>Pieces</span><span>{selectedBundle.pieces}</span></div>
            <div className="info-row"><span>Weight</span><span>{Math.round(selectedBundle.totalWeightLbs).toLocaleString()} lbs</span></div>
            <div className="info-row"><span>Dimensions</span><span>{Math.round(selectedBundle.lengthIn)}&quot; &times; {Math.round(selectedBundle.widthIn)}&quot; &times; {Math.round(selectedBundle.heightIn)}&quot;</span></div>
          </div>
          <p className="info-hint">Drag to reposition · Hold <kbd>Shift</kbd>+drag for vertical</p>
          {allTrucks && allTrucks.length > 1 && onMoveBundleToTruck && (
            <div className="bundle-move-controls">
              <label>Move to:</label>
              <div className="move-buttons">
                {allTrucks.map((_, i) =>
                  i !== currentTruckIndex ? (
                    <button key={i} className="btn btn-sm btn-outline" onClick={() => onMoveBundleToTruck(selectedBundle.id, i)}>
                      Truck #{i + 1}
                    </button>
                  ) : null,
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
