import { useMemo, useRef, useCallback, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { TruckLoad, PackedBundle } from '../types';
import { TRAILER_SPECS, getAllTrailerSpecs, DUNNAGE_HEIGHT_IN } from '../data';
import { computeBundleLayoutPositions } from '../algorithm';

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
// Position computation – delegated to algorithm.ts
// ============================================================
function computeBundlePositions(truck: TruckLoad): BundlePosition[] {
  const computed = computeBundleLayoutPositions(truck);
  return truck.bundles.map((bundle, index) => {
    const pos = computed[bundle.id] ?? { x: 0, y: 0, z: 0 };
    return {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      bundle,
      color: BUNDLE_COLORS[index % BUNDLE_COLORS.length],
    };
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
  truck, selectedBundleId, onBundleSelect, onBundleMove, orbitRef,
}: {
  truck: TruckLoad;
  selectedBundleId: string | null;
  onBundleSelect: (id: string | null) => void;
  onBundleMove?: (id: string, pos: { x: number; y: number; z: number }) => void;
  orbitRef: React.MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera, gl } = useThree();
  const trailer = getAllTrailerSpecs()[truck.trailerType] ?? TRAILER_SPECS['53-flatbed'];
  const maxWidth = trailer.internalWidthIn;
  const maxHeight = trailer.internalHeightIn;
  const totalDeckLengthIn = trailer.isMultiDeck
    ? ((trailer.leadDeckLengthFt ?? 28) + (trailer.pupDeckLengthFt ?? 32)) * 12
    : trailer.deckLengthFt * 12;

  const positions = useMemo(
    () => computeBundlePositions(truck),
    [truck],
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

        const eps = 0.5;
        const isVerticalMove = ady > 1 && ady > (adx + adz);

        const overlaps3D = (
          ax: number, ay: number, az: number, aBundle: PackedBundle,
          bx: number, by: number, bz: number, bBundle: PackedBundle,
        ) => {
          return ax + eps < bx + bBundle.lengthIn && ax + aBundle.lengthIn > bx + eps
              && ay + eps < by + bBundle.heightIn && ay + aBundle.heightIn > by + eps
              && az + eps < bz + bBundle.widthIn && az + aBundle.widthIn > bz + eps;
        };

        const overlapsXZ = (
          ax: number, az: number, aBundle: PackedBundle,
          bx: number, bz: number, bBundle: PackedBundle,
        ) => {
          return ax + eps < bx + bBundle.lengthIn && ax + aBundle.lengthIn > bx + eps
              && az + eps < bz + bBundle.widthIn && az + aBundle.widthIn > bz + eps;
        };

        const fitsDeckBoundary = (x: number, lengthIn: number): boolean => {
          if (!trailer.isMultiDeck) return true;
          const leadLenIn = (trailer.leadDeckLengthFt ?? 28) * 12;
          const pupLenIn = (trailer.pupDeckLengthFt ?? 32) * 12;
          const totalLenIn = leadLenIn + pupLenIn;
          const inLead = x >= 0 && x + lengthIn <= leadLenIn;
          const inPup = x >= leadLenIn && x + lengthIn <= totalLenIn;
          return inLead || inPup;
        };

        const snap = new Map<string, { x: number; y: number; z: number; bundle: PackedBundle }>();
        for (const p of positions) {
          snap.set(p.bundle.id, { x: p.x, y: p.y, z: p.z, bundle: p.bundle });
        }

        const computeGravityY = (
          x: number, z: number, bundle: PackedBundle, ignoreIds: Set<string>,
        ) => {
          let gY = 0;
          for (const [id, entry] of snap) {
            if (ignoreIds.has(id)) continue;
            if (overlapsXZ(x, z, bundle, entry.x, entry.z, entry.bundle)) {
              const top = entry.y + entry.bundle.heightIn + DUNNAGE_HEIGHT_IN;
              if (top > gY) gY = top;
            }
          }
          return Math.min(gY, maxHeight - bundle.heightIn);
        };

        if (!fitsDeckBoundary(clampedX, drag.bundle.lengthIn)) {
          window.alert('Invalid placement: bundles must remain fully on a single deck section.');
          draggingRef.current = null;
          dragPosRef.current = null;
          shiftHeldRef.current = false;
          if (orbitRef.current) orbitRef.current.enabled = true;
          return;
        }

        const targetY = isVerticalMove
          ? clampedY
          : computeGravityY(clampedX, clampedZ, drag.bundle, new Set([drag.bundleId]));

        // Reject collisions
        for (const [id, entry] of snap) {
          if (id === drag.bundleId) continue;
          if (overlaps3D(clampedX, targetY, clampedZ, drag.bundle, entry.x, entry.y, entry.z, entry.bundle)) {
            window.alert('Invalid placement: bundles cannot overlap.');
            draggingRef.current = null;
            dragPosRef.current = null;
            shiftHeldRef.current = false;
            if (orbitRef.current) orbitRef.current.enabled = true;
            return;
          }
        }

        // Validate support constraints for elevated placements
        if (targetY > eps) {
          const supportingEntries = [...snap.entries()].filter(([id, entry]) => {
            if (id === drag.bundleId) return false;
            const supportTop = entry.y + entry.bundle.heightIn + DUNNAGE_HEIGHT_IN;
            return Math.abs(supportTop - targetY) <= 1 && overlapsXZ(clampedX, clampedZ, drag.bundle, entry.x, entry.z, entry.bundle);
          });

          if (supportingEntries.length === 0) {
            window.alert('Invalid placement: elevated bundles must be fully supported.');
            draggingRef.current = null;
            dragPosRef.current = null;
            shiftHeldRef.current = false;
            if (orbitRef.current) orbitRef.current.enabled = true;
            return;
          }

          for (const [id, support] of supportingEntries) {
            if (support.bundle.nonStackable) {
              window.alert(`Invalid placement: "${support.bundle.description}" is marked non-stackable.`);
              draggingRef.current = null;
              dragPosRef.current = null;
              shiftHeldRef.current = false;
              if (orbitRef.current) orbitRef.current.enabled = true;
              return;
            }

            if (support.bundle.category !== drag.bundle.category) {
              window.alert('Invalid placement: category mixing is not allowed in stacked bundles.');
              draggingRef.current = null;
              dragPosRef.current = null;
              shiftHeldRef.current = false;
              if (orbitRef.current) orbitRef.current.enabled = true;
              return;
            }

            if (support.bundle.maxStackWeightLbs != null) {
              const supportTop = support.y + support.bundle.heightIn + DUNNAGE_HEIGHT_IN;
              let existingWeightAbove = 0;
              for (const [otherId, other] of snap) {
                if (otherId === drag.bundleId || otherId === id) continue;
                if (other.y + eps >= supportTop && overlapsXZ(support.x, support.z, support.bundle, other.x, other.z, other.bundle)) {
                  existingWeightAbove += other.bundle.totalWeightLbs;
                }
              }
              if (existingWeightAbove + drag.bundle.totalWeightLbs > support.bundle.maxStackWeightLbs) {
                window.alert(`Invalid placement: max stack weight exceeded for "${support.bundle.description}".`);
                draggingRef.current = null;
                dragPosRef.current = null;
                shiftHeldRef.current = false;
                if (orbitRef.current) orbitRef.current.enabled = true;
                return;
              }
            }
          }
        }

        onBundleMove(drag.bundleId, { x: clampedX, y: targetY, z: clampedZ });
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
  }, [
    gl,
    camera,
    dragPlane,
    verticalPlane,
    positions,
    maxWidth,
    maxHeight,
    totalDeckLengthIn,
    trailer.isMultiDeck,
    trailer.leadDeckLengthFt,
    trailer.pupDeckLengthFt,
    onBundleMove,
    orbitRef,
  ]);

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
  const orbitRef = useRef<OrbitControlsImpl | null>(null);

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
