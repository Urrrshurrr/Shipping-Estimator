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
        // Clamp drop position to truck bounds
        const clampedX = Math.max(0, Math.min(finalPos.x, totalDeckLengthIn - drag.bundle.lengthIn));
        const clampedZ = Math.max(0, Math.min(finalPos.z, maxWidth - drag.bundle.widthIn));
        const clampedY = Math.max(0, Math.min(finalPos.y, maxHeight - drag.bundle.heightIn));

        // Skip processing for negligible movement (prevents accidental repositioning on click)
        const dx = Math.abs(clampedX - drag.startPos.x);
        const dy = Math.abs(clampedY - drag.startPos.y);
        const dz = Math.abs(clampedZ - drag.startPos.z);
        if (dx + dy + dz < 2) {
          draggingRef.current = null;
          dragPosRef.current = null;
          shiftHeldRef.current = false;
          if (orbitRef.current) orbitRef.current.enabled = true;
          return;
        }

        // Build a mutable snapshot of all positions
        const posSnapshot = new Map<string, { x: number; y: number; z: number; bundle: PackedBundle }>();
        for (const p of positions) {
          posSnapshot.set(p.bundle.id, { x: p.x, y: p.y, z: p.z, bundle: p.bundle });
        }

        const movedIds = new Set<string>([drag.bundleId]);

        // Determine move type based on position delta
        const isVerticalMove = dy > 1 && dy > dx + dz;

        // Find all bundles that overlap in X/Z with the target position
        const overlappingIds = new Set<string>();
        for (const p of positions) {
          if (p.bundle.id === drag.bundleId) continue;
          const xOvlp = clampedX < p.x + p.bundle.lengthIn && clampedX + drag.bundle.lengthIn > p.x;
          const zOvlp = clampedZ < p.z + p.bundle.widthIn && clampedZ + drag.bundle.widthIn > p.z;
          if (xOvlp && zOvlp) overlappingIds.add(p.bundle.id);
        }

        if (isVerticalMove && overlappingIds.size > 0) {
          // ─── VERTICAL RESTACK ──────────────────────────────────
          // Skip gravity pre-settling — go directly to column restack
          // so both upward and downward drags work correctly.
          const columnIds = new Set<string>([drag.bundleId, ...overlappingIds]);

          // Gather non-dragged column members sorted by Y
          const others: Array<{ id: string; y: number; bundle: PackedBundle; x: number; z: number }> = [];
          for (const id of columnIds) {
            if (id === drag.bundleId) continue;
            const bp = posSnapshot.get(id)!;
            others.push({ id, y: bp.y, bundle: bp.bundle, x: bp.x, z: bp.z });
          }
          others.sort((a, b) => a.y - b.y);

          // Determine insertion index based on drop Y (direction-aware tie-breaking)
          const movingDown = clampedY < drag.startPos.y;
          let insertIdx = others.length;
          for (let i = 0; i < others.length; i++) {
            const midY = others[i].y + others[i].bundle.heightIn / 2;
            if (clampedY < midY || (Math.abs(clampedY - midY) < 2 && movingDown)) { insertIdx = i; break; }
          }

          const dragItem = { id: drag.bundleId, y: clampedY, bundle: drag.bundle, x: clampedX, z: clampedZ };
          const newOrder = [...others];
          newOrder.splice(insertIdx, 0, dragItem);

          // Find base Y from non-column bundles
          let baseY = 0;
          for (const [id, bp] of posSnapshot) {
            if (columnIds.has(id)) continue;
            const bx = newOrder[0].x;
            const bz = newOrder[0].z;
            const xOvlp = bx < bp.x + bp.bundle.lengthIn && bx + newOrder[0].bundle.lengthIn > bp.x;
            const zOvlp = bz < bp.z + bp.bundle.widthIn && bz + newOrder[0].bundle.widthIn > bp.z;
            if (xOvlp && zOvlp) {
              const top = bp.y + bp.bundle.heightIn + DUNNAGE_HEIGHT_IN;
              if (top > baseY) baseY = top;
            }
          }

          // Check if the entire restack fits within the truck height
          let totalStackHeight = baseY;
          for (const item of newOrder) totalStackHeight += item.bundle.heightIn + DUNNAGE_HEIGHT_IN;
          totalStackHeight -= DUNNAGE_HEIGHT_IN; // no dunnage above top bundle

          if (totalStackHeight <= maxHeight) {
            // Restack from baseY upward
            let currentY = baseY;
            for (const item of newOrder) {
              posSnapshot.set(item.id, { x: item.x, y: currentY, z: item.z, bundle: item.bundle });
              onBundleMove(item.id, { x: item.x, y: currentY, z: item.z });
              movedIds.add(item.id);
              currentY += item.bundle.heightIn + DUNNAGE_HEIGHT_IN;
            }
          }
          // If exceeds height, reject — bundle snaps back to start

        } else if (!isVerticalMove && overlappingIds.size > 0) {
          // ─── HORIZONTAL REORDER ────────────────────────────────
          // Determine dominant horizontal axis
          const isZDominant = dz >= dx;
          const Y_TOLERANCE = DUNNAGE_HEIGHT_IN + 1;

          // Update dragged bundle position in snapshot (preserve original Y tier)
          posSnapshot.set(drag.bundleId, { x: clampedX, y: drag.startPos.y, z: clampedZ, bundle: drag.bundle });

          // Find row/group members at the same Y tier
          const groupMembers: Array<{ id: string; bundle: PackedBundle }> = [{ id: drag.bundleId, bundle: drag.bundle }];
          for (const p of positions) {
            if (p.bundle.id === drag.bundleId) continue;
            const sameTier = Math.abs(p.y - drag.startPos.y) < Y_TOLERANCE;
            if (!sameTier) continue;
            if (isZDominant) {
              // Z-dominant: group by X overlap with ORIGINAL position (stable lane detection)
              const xOvlp = drag.startPos.x < p.x + p.bundle.lengthIn && drag.startPos.x + drag.bundle.lengthIn > p.x;
              if (xOvlp) groupMembers.push({ id: p.bundle.id, bundle: p.bundle });
            } else {
              // X-dominant: group by Z overlap with ORIGINAL position (stable lane detection)
              const zOvlp = drag.startPos.z < p.z + p.bundle.widthIn && drag.startPos.z + drag.bundle.widthIn > p.z;
              if (zOvlp) groupMembers.push({ id: p.bundle.id, bundle: p.bundle });
            }
          }

          let accepted = false;

          if (groupMembers.length > 1) {
            const others = groupMembers.filter(m => m.id !== drag.bundleId);

            if (isZDominant) {
              // ── Z-direction reorder (side-to-side) ──
              others.sort((a, b) => {
                const pa = posSnapshot.get(a.id)!;
                const pb = posSnapshot.get(b.id)!;
                return pa.z - pb.z;
              });
              const dragCenterZ = clampedZ + drag.bundle.widthIn / 2;
              const movingLeft = clampedZ < drag.startPos.z;
              let insertIdx = others.length;
              for (let i = 0; i < others.length; i++) {
                const pos = posSnapshot.get(others[i].id)!;
                const midZ = pos.z + others[i].bundle.widthIn / 2;
                if (dragCenterZ < midZ || (Math.abs(dragCenterZ - midZ) < 2 && movingLeft)) { insertIdx = i; break; }
              }
              const ordered = [...others];
              ordered.splice(insertIdx, 0, groupMembers[0]);

              // Check total width fits
              const totalW = ordered.reduce((sum, m) => sum + m.bundle.widthIn, 0);
              if (totalW <= maxWidth) {
                // Pack side by side from Z=0
                let currentZ = 0;
                for (const item of ordered) {
                  const entry = posSnapshot.get(item.id)!;
                  posSnapshot.set(item.id, { ...entry, z: currentZ });
                  onBundleMove(item.id, { x: entry.x, y: entry.y, z: currentZ });
                  movedIds.add(item.id);
                  currentZ += item.bundle.widthIn;
                }

                // Carry stacked bundles that were resting on reordered bundles
                for (const item of ordered) {
                  const origPos = positions.find(p => p.bundle.id === item.id);
                  if (!origPos) continue;
                  const newEntry = posSnapshot.get(item.id)!;
                  const deltaZ = newEntry.z - origPos.z;
                  if (Math.abs(deltaZ) < 0.01) continue;
                  for (const p of positions) {
                    if (movedIds.has(p.bundle.id)) continue;
                    if (p.y <= origPos.y) continue;
                    const xO = origPos.x < p.x + p.bundle.lengthIn && origPos.x + origPos.bundle.lengthIn > p.x;
                    const zO = origPos.z < p.z + p.bundle.widthIn && origPos.z + origPos.bundle.widthIn > p.z;
                    if (xO && zO) {
                      const se = posSnapshot.get(p.bundle.id)!;
                      const cz = Math.max(0, Math.min(se.z + deltaZ, maxWidth - se.bundle.widthIn));
                      posSnapshot.set(p.bundle.id, { ...se, z: cz });
                      onBundleMove(p.bundle.id, { x: se.x, y: se.y, z: cz });
                      movedIds.add(p.bundle.id);
                    }
                  }
                }
                accepted = true;
              }
            } else {
              // ── X-direction reorder (front-to-back) ──
              others.sort((a, b) => {
                const pa = posSnapshot.get(a.id)!;
                const pb = posSnapshot.get(b.id)!;
                return pa.x - pb.x;
              });
              const dragCenterX = clampedX + drag.bundle.lengthIn / 2;
              const movingBack = clampedX < drag.startPos.x;
              let insertIdx = others.length;
              for (let i = 0; i < others.length; i++) {
                const pos = posSnapshot.get(others[i].id)!;
                const midX = pos.x + others[i].bundle.lengthIn / 2;
                if (dragCenterX < midX || (Math.abs(dragCenterX - midX) < 2 && movingBack)) { insertIdx = i; break; }
              }
              const ordered = [...others];
              ordered.splice(insertIdx, 0, groupMembers[0]);

              // Pack from the group's current minimum X position
              const minX = Math.min(...ordered.map(m => {
                const p = posSnapshot.get(m.id);
                return p ? p.x : 0;
              }));
              const totalL = ordered.reduce((sum, m) => sum + m.bundle.lengthIn, 0);
              if (minX + totalL <= totalDeckLengthIn) {
                let currentX = minX;
                for (const item of ordered) {
                  const entry = posSnapshot.get(item.id)!;
                  posSnapshot.set(item.id, { ...entry, x: currentX });
                  onBundleMove(item.id, { x: currentX, y: entry.y, z: entry.z });
                  movedIds.add(item.id);
                  currentX += item.bundle.lengthIn;
                }

                // Carry stacked bundles that were resting on reordered bundles
                for (const item of ordered) {
                  const origPos = positions.find(p => p.bundle.id === item.id);
                  if (!origPos) continue;
                  const newEntry = posSnapshot.get(item.id)!;
                  const deltaX = newEntry.x - origPos.x;
                  if (Math.abs(deltaX) < 0.01) continue;
                  for (const p of positions) {
                    if (movedIds.has(p.bundle.id)) continue;
                    if (p.y <= origPos.y) continue;
                    const xO = origPos.x < p.x + p.bundle.lengthIn && origPos.x + origPos.bundle.lengthIn > p.x;
                    const zO = origPos.z < p.z + p.bundle.widthIn && origPos.z + origPos.bundle.widthIn > p.z;
                    if (xO && zO) {
                      const se = posSnapshot.get(p.bundle.id)!;
                      const cx = Math.max(0, Math.min(se.x + deltaX, totalDeckLengthIn - se.bundle.lengthIn));
                      posSnapshot.set(p.bundle.id, { ...se, x: cx });
                      onBundleMove(p.bundle.id, { x: cx, y: se.y, z: se.z });
                      movedIds.add(p.bundle.id);
                    }
                  }
                }
                accepted = true;
              }
            }
          }

          if (!accepted) {
            // Reorder failed (doesn't fit) or no group — simple gravity placement
            let gravityY = 0;
            for (const [id, bp] of posSnapshot) {
              if (id === drag.bundleId) continue;
              const xO = clampedX < bp.x + bp.bundle.lengthIn && clampedX + drag.bundle.lengthIn > bp.x;
              const zO = clampedZ < bp.z + bp.bundle.widthIn && clampedZ + drag.bundle.widthIn > bp.z;
              if (xO && zO) {
                const top = bp.y + bp.bundle.heightIn + DUNNAGE_HEIGHT_IN;
                if (top > gravityY) gravityY = top;
              }
            }
            gravityY = Math.min(gravityY, maxHeight - drag.bundle.heightIn);
            posSnapshot.set(drag.bundleId, { x: clampedX, y: gravityY, z: clampedZ, bundle: drag.bundle });
            onBundleMove(drag.bundleId, { x: clampedX, y: gravityY, z: clampedZ });
          }

        } else {
          // ─── SIMPLE GRAVITY PLACEMENT (no overlaps or vertical with no column) ─
          let gravityY = 0;
          for (const [id, bp] of posSnapshot) {
            if (id === drag.bundleId) continue;
            const xO = clampedX < bp.x + bp.bundle.lengthIn && clampedX + drag.bundle.lengthIn > bp.x;
            const zO = clampedZ < bp.z + bp.bundle.widthIn && clampedZ + drag.bundle.widthIn > bp.z;
            if (xO && zO) {
              const top = bp.y + bp.bundle.heightIn + DUNNAGE_HEIGHT_IN;
              if (top > gravityY) gravityY = top;
            }
          }
          gravityY = Math.min(gravityY, maxHeight - drag.bundle.heightIn);
          posSnapshot.set(drag.bundleId, { x: clampedX, y: gravityY, z: clampedZ, bundle: drag.bundle });
          onBundleMove(drag.bundleId, { x: clampedX, y: gravityY, z: clampedZ });
        }

        // ─── 3D OVERLAP RESOLUTION: push overlapping bundles apart vertically ─
        for (let iter = 0; iter < 30; iter++) {
          let overlapFound = false;
          const ovlEntries = [...posSnapshot.entries()];
          for (let i = 0; i < ovlEntries.length; i++) {
            const [idA, a] = ovlEntries[i];
            for (let j = i + 1; j < ovlEntries.length; j++) {
              const [idB, b] = ovlEntries[j];
              const xO = a.x + 0.5 < b.x + b.bundle.lengthIn && a.x + a.bundle.lengthIn > b.x + 0.5;
              const zO = a.z + 0.5 < b.z + b.bundle.widthIn && a.z + a.bundle.widthIn > b.z + 0.5;
              const yO = a.y + 0.5 < b.y + b.bundle.heightIn && a.y + a.bundle.heightIn > b.y + 0.5;
              if (!(xO && zO && yO)) continue;
              overlapFound = true;
              // Push the higher bundle up; at same Y keep the dragged bundle in place
              let lower, upper;
              if (Math.abs(a.y - b.y) < 0.5) {
                if (idA === drag.bundleId) { lower = a; upper = b; }
                else if (idB === drag.bundleId) { lower = b; upper = a; }
                else { lower = a; upper = b; }
              } else {
                [lower, upper] = a.y < b.y ? [a, b] : [b, a];
              }
              const reqY = lower.y + lower.bundle.heightIn + DUNNAGE_HEIGHT_IN;
              if (upper.y < reqY) upper.y = reqY;
            }
          }
          if (!overlapFound) break;
        }

        // ─── CASCADING GRAVITY: settle all bundles that lost support ─
        let changed = true;
        while (changed) {
          changed = false;
          const sortedByY = [...posSnapshot.values()].sort((a, b) => a.y - b.y);
          for (const bp of sortedByY) {
            if (bp.y <= 0) continue;
            let highestBelow = 0;
            for (const other of posSnapshot.values()) {
              if (other.bundle.id === bp.bundle.id) continue;
              const xOvlp = bp.x < other.x + other.bundle.lengthIn && bp.x + bp.bundle.lengthIn > other.x;
              const zOvlp = bp.z < other.z + other.bundle.widthIn && bp.z + bp.bundle.widthIn > other.z;
              if (xOvlp && zOvlp) {
                const top = other.y + other.bundle.heightIn + DUNNAGE_HEIGHT_IN;
                if (top <= bp.y + 0.5 && top > highestBelow) {
                  highestBelow = top;
                }
              }
            }
            if (highestBelow < bp.y - 0.5) {
              bp.y = highestBelow;
              changed = true;
            }
          }
        }

        // Emit final position updates for ALL bundles whose position changed
        // (re-emit even for previously moved bundles since overlap resolution may have adjusted them)
        for (const [id, bp] of posSnapshot) {
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
