import type {
  OrderItem,
  PackedBundle,
  TruckLoad,
  LoadPlan,
  LoadingStep,
  TrailerType,
  TrailerSpec,
  AxleWeightResult,
  CenterOfGravity,
  StrappingRequirement,
} from './types';
import {
  CHANNEL_SPECS,
  STRUCTURAL_FRAME_BUNDLES,
  ROLLFORMED_FRAME_BUNDLES,
  BEAM_BUNDLES,
  ACCESSORY_BUNDLES,
  STEP_BEAM_WEIGHTS,
  TRAILER_SPECS,
  getAllTrailerSpecs,
  DUNNAGE_HEIGHT_IN,
  BUNDLE_BASE_HEIGHT_IN,
} from './data';

// ============================================================
// Constants
// ============================================================

/** Maximum bundle weight in lbs — industry standard ceiling */
const MAX_BUNDLE_WEIGHT_LBS = 5000;

/** Resolve a trailer spec by type, supporting both built-in and custom trailers */
function resolveTrailer(type: TrailerType): TrailerSpec {
  const all = getAllTrailerSpecs();
  return all[type] ?? TRAILER_SPECS['53-flatbed'];
}

// ============================================================
// 1. Convert order items into packed bundles
// ============================================================

function getBundleSpec(item: OrderItem) {
  // Check for explicit bundle key first (set from product preset)
  if (item.bundleKey) {
    const allSpecs = { ...STRUCTURAL_FRAME_BUNDLES, ...ROLLFORMED_FRAME_BUNDLES, ...BEAM_BUNDLES, ...ACCESSORY_BUNDLES };
    if (allSpecs[item.bundleKey]) return allSpecs[item.bundleKey];
  }

  if (item.category === 'frame') {
    if (item.frameType === 'structural') {
      if (item.channelDesignation === 'C3x3.5') return STRUCTURAL_FRAME_BUNDLES['C3-structural'];
      if (item.channelDesignation === 'C5x6.7') return STRUCTURAL_FRAME_BUNDLES['C5-structural'];
      // C4 – check baseplate size via depth heuristic
      if (item.frameDepthIn && item.frameDepthIn >= 48)
        return STRUCTURAL_FRAME_BUNDLES['C4-structural-8bp'];
      return STRUCTURAL_FRAME_BUNDLES['C4-structural-4.75bp'];
    }
    // Roll-formed
    if (item.frameDepthIn && item.frameDepthIn >= 48)
      return ROLLFORMED_FRAME_BUNDLES['rf-8bp'];
    if (item.rollFormedWidth === 4) return ROLLFORMED_FRAME_BUNDLES['rf-4.25bp'];
    return ROLLFORMED_FRAME_BUNDLES['rf-3.5bp'];
  }

  if (item.category === 'beam') {
    if (item.beamType === 'structural-channel') {
      const ch = item.beamChannelDesignation;
      if (ch === 'C5x6.7' || ch === 'C6x8.2' || ch === 'C8x11.2')
        return BEAM_BUNDLES['channel-beam-large'];
      return BEAM_BUNDLES['channel-beam-small'];
    }
    // Step beams – bundle size depends on profile height
    if (item.beamProfile) {
      if (item.beamProfile >= 6) return BEAM_BUNDLES['step-beam-large'];
      if (item.beamProfile >= 4) return BEAM_BUNDLES['step-beam-small'];
      return BEAM_BUNDLES['step-beam-xs'];
    }
    return BEAM_BUNDLES['step-beam-small'];
  }

  // Accessories without a bundle key – treat each piece as its own "bundle" of 1
  return null;
}

/** Estimate weight per piece if not explicitly provided */
function estimateWeight(item: OrderItem): number {
  if (item.weightPerPieceLbs > 0) return item.weightPerPieceLbs;

  const lengthFt = item.lengthIn / 12;

  if (item.category === 'frame' && item.frameType === 'structural' && item.channelDesignation) {
    const spec = CHANNEL_SPECS[item.channelDesignation];
    // A frame has 2 uprights + bracing. Rough estimate: 2 uprights + 30% for bracing/baseplates
    const frameHeightFt = (item.frameHeightIn ?? item.lengthIn) / 12;
    return spec.weightPerFoot * frameHeightFt * 2 * 1.3;
  }

  if (item.category === 'frame' && item.frameType === 'roll-formed') {
    // Roll-formed is lighter: ~2.5 lbs/ft per upright for 3", ~3.5 lbs/ft for 4"
    const lbsPerFt = item.rollFormedWidth === 4 ? 3.5 : 2.5;
    const frameHeightFt = (item.frameHeightIn ?? item.lengthIn) / 12;
    return lbsPerFt * frameHeightFt * 2 * 1.3;
  }

  if (item.category === 'beam') {
    if (item.beamType === 'structural-channel' && item.beamChannelDesignation) {
      const spec = CHANNEL_SPECS[item.beamChannelDesignation];
      return spec.weightPerFoot * lengthFt;
    }
    if (item.beamProfile) {
      const profile = item.beamProfile as keyof typeof STEP_BEAM_WEIGHTS;
      const w = STEP_BEAM_WEIGHTS[profile];
      if (w) {
        // Scale from 96" reference length
        return ((w.minLbs + w.maxLbs) / 2) * (item.lengthIn / 96);
      }
    }
    return 25 * (item.lengthIn / 96); // fallback
  }

  return item.accessoryWeightLbs ?? 10; // default accessory
}

/**
 * Calculate the effective bundle pieces count, respecting the 5000 lb max
 * bundle weight constraint. Reduces the standard count if necessary.
 */
function calcBundlePieces(specPieces: number, weightPerPiece: number): number {
  if (weightPerPiece <= 0) return specPieces;
  const maxByWeight = Math.floor(MAX_BUNDLE_WEIGHT_LBS / weightPerPiece);
  return Math.min(specPieces, Math.max(1, maxByWeight));
}

export function orderItemsToBundles(items: OrderItem[]): PackedBundle[] {
  const bundles: PackedBundle[] = [];
  let bundleIdx = 0;

  for (const item of items) {
    const weight = estimateWeight(item);
    const spec = getBundleSpec(item);

    if (!spec) {
      // Accessories: pack loosely – group into pallets of ~40 pieces or less
      const palletSize = 40;
      let remaining = item.quantity;
      while (remaining > 0) {
        const count = Math.min(remaining, palletSize);
        const rawW = item.accessoryWidthIn ?? 48;
        const rawH = Math.min(count * (item.accessoryHeightIn ?? 4), 48);
        bundles.push({
          id: `b-${bundleIdx++}`,
          orderItemId: item.id,
          description: item.description,
          category: item.category,
          pieces: count,
          totalWeightLbs: weight * count,
          lengthIn: item.accessoryLengthIn ?? item.lengthIn ?? 48,
          widthIn: Math.max(rawW, rawH),
          heightIn: Math.min(rawW, rawH),
          isPartial: count < palletSize,
          nonStackable: item.nonStackable,
          maxStackWeightLbs: item.maxStackWeightLbs,
          keepUpright: item.keepUpright,
          frameType: item.frameType,
        });
        remaining -= count;
      }
      continue;
    }

    // Determine effective pieces per bundle (constrained by 5000 lb max weight)
    const piecesPerBundle = calcBundlePieces(spec.piecesPerBundle, weight);

    if (item.category === 'frame') {
      // Frames are loaded 3 bundles across the truck width.
      // Standard row pattern: N, N, N-1 (e.g. 8,8,7 for C4).
      // Create bundles following this pattern so every row is uniform.
      const bundlesPerRow = 3;
      const rowPattern = [piecesPerBundle, piecesPerBundle, piecesPerBundle - 1];
      const frameWidth = item.frameWidthIn ?? 42;
      let remaining = item.quantity;
      let patternIdx = 0;

      while (remaining > 0) {
        const targetCount = rowPattern[patternIdx % bundlesPerRow];
        const count = Math.min(remaining, targetCount);
        const isPartial = count < targetCount;
        const stackingDepth = BUNDLE_BASE_HEIGHT_IN + count * spec.stackingHeightPerPiece;

        // Frames ship STANDING UP on the truck:
        //   lengthIn = frame height (runs along truck length)
        //   widthIn  = stacking depth (base + frames side-by-side, across truck width)
        //   heightIn = frame width (stands upright, e.g. 42" or 48")
        bundles.push({
          id: `b-${bundleIdx++}`,
          orderItemId: item.id,
          description: item.description,
          category: item.category,
          pieces: count,
          totalWeightLbs: weight * count,
          lengthIn: item.lengthIn,
          widthIn: stackingDepth,
          heightIn: frameWidth,
          isPartial,
          nonStackable: item.nonStackable,
          maxStackWeightLbs: item.maxStackWeightLbs,
          keepUpright: item.keepUpright,
          frameType: item.frameType,
        });
        remaining -= count;
        patternIdx++;
      }
    } else {
      // Beams and accessories: sequential full bundles, partial at the end
      let remaining = item.quantity;
      while (remaining > 0) {
        const count = Math.min(remaining, piecesPerBundle);
        const isPartial = count < piecesPerBundle;

        // Calculate bundle height: use total bundleHeightIn if available,
        // otherwise fall back to per-piece stacking.
        // Partial bundles scale proportionally from the full bundle height.
        let stackingDepth: number;
        if (spec.bundleHeightIn != null) {
          stackingDepth = isPartial
            ? BUNDLE_BASE_HEIGHT_IN + (spec.bundleHeightIn - BUNDLE_BASE_HEIGHT_IN) * (count / spec.piecesPerBundle)
            : spec.bundleHeightIn;
        } else {
          stackingDepth = BUNDLE_BASE_HEIGHT_IN + count * spec.stackingHeightPerPiece;
        }

        // Beams and other items MUST lay flat (widest side down) for stability.
        // Ensure the wider dimension is always the base; swap if needed so
        // bundles never stand on their narrow edge.
        const rawWidth = spec.bundleWidthIn;
        const rawHeight = stackingDepth;
        const flatWidth = Math.max(rawWidth, rawHeight);
        const flatHeight = Math.min(rawWidth, rawHeight);
        bundles.push({
          id: `b-${bundleIdx++}`,
          orderItemId: item.id,
          description: item.description,
          category: item.category,
          pieces: count,
          totalWeightLbs: weight * count,
          lengthIn: item.lengthIn,
          widthIn: flatWidth,
          heightIn: flatHeight,
          isPartial,
          nonStackable: item.nonStackable,
          maxStackWeightLbs: item.maxStackWeightLbs,
          keepUpright: item.keepUpright,
          frameType: item.frameType,
        });
        remaining -= count;
      }
    }
  }

  return bundles;
}

// ============================================================
// 2. Greedy bin packing with true vertical stacking
// ============================================================

/**
 * A "stack slot" represents a position on the trailer floor.
 * Bundles can be stacked vertically in the same slot if their
 * length and width are compatible and the total height fits.
 */
interface StackSlot {
  /** Position along trailer length (inches from front) */
  x: number;
  /** Position across trailer width (inches from left) */
  z: number;
  /** Bundles stacked at this position, bottom to top */
  bundles: PackedBundle[];
  /** Total height of all bundles + dunnage at this slot */
  totalHeight: number;
  /** Length this slot occupies along the trailer */
  lengthIn: number;
  /** Width this slot occupies across the trailer */
  widthIn: number;
  /** Which deck this slot belongs to (0=lead/single, 1=pup) */
  deckIndex: number;
}

interface TruckPacking {
  truck: TruckLoad;
  slots: StackSlot[];
}

function packBundlesOntoTrailers(
  bundles: PackedBundle[],
  trailerType: TrailerType,
): LoadPlan {
  const trailer = resolveTrailer(trailerType);
  const packings: TruckPacking[] = [];
  const unplaced: PackedBundle[] = [];

  // Sort bundles: group by category (frames first, then beams, then accessories)
  // so similar bundles are placed side-by-side for load stability.
  // Within each category, sort by length (group same-length bundles) then heaviest first.
  const categoryOrder: Record<string, number> = { frame: 0, beam: 1, accessory: 2 };
  const sorted = [...bundles].sort((a, b) => {
    const catA = categoryOrder[a.category] ?? 9;
    const catB = categoryOrder[b.category] ?? 9;
    if (catA !== catB) return catA - catB;
    // Same category: group by similar length, then heaviest first
    if (Math.abs(a.lengthIn - b.lengthIn) > 6) return b.lengthIn - a.lengthIn;
    return b.totalWeightLbs - a.totalWeightLbs;
  });

  const decks = getDecks(trailer);

  for (const bundle of sorted) {
    let placed = false;

    // Try existing trucks in order — fill each truck before opening the next
    for (const packing of packings) {
      if (tryPlaceBundleWithStacking(packing, bundle, trailer, decks)) {
        placed = true;
        break;
      }
    }

    if (!placed) {
      // Open a new truck
      const newPacking: TruckPacking = {
        truck: createEmptyTruck(packings.length, trailer),
        slots: [],
      };
      if (tryPlaceBundleWithStacking(newPacking, bundle, trailer, decks)) {
        packings.push(newPacking);
        placed = true;
      }
    }

    if (!placed) {
      unplaced.push(bundle);
    }
  }

  // Finalize trucks
  const trucks = packings.map(p => {
    recalcTruckStats(p, trailer);
    return p.truck;
  });

  return {
    trucks,
    totalBundles: bundles.length,
    totalWeight: bundles.reduce((s, b) => s + b.totalWeightLbs, 0),
    unplacedBundles: unplaced,
  };
}

function getDecks(trailer: TrailerSpec): { startIn: number; lengthIn: number }[] {
  if (trailer.isMultiDeck) {
    const leadLen = (trailer.leadDeckLengthFt ?? 28) * 12;
    const pupLen = (trailer.pupDeckLengthFt ?? 32) * 12;
    return [
      { startIn: 0, lengthIn: leadLen },
      { startIn: leadLen, lengthIn: pupLen },
    ];
  }
  return [{ startIn: 0, lengthIn: trailer.deckLengthFt * 12 }];
}

function createEmptyTruck(index: number, trailer: TrailerSpec): TruckLoad {
  return {
    truckIndex: index,
    trailerType: trailer.type,
    trailerLabel: trailer.label,
    bundles: [],
    totalWeightLbs: 0,
    usedLengthIn: 0,
    usedWidthIn: 0,
    usedHeightIn: 0,
    weightUtilisation: 0,
    areaUtilisation: 0,
  };
}

/**
 * Try to place a bundle on a truck, considering:
 * 1. Weight limit
 * 2. Placing alongside existing slots in ANY row (fill floor width first)
 * 3. Stacking on top of existing bundles (fill height before length)
 * 4. Starting a new row within deck length constraints (last resort)
 *
 * Width is filled first, then bundles stack upward, and only when
 * stacking isn't possible is a new floor row started. This matches
 * real-world loading: beams are loaded 2-wide from each side of the
 * truck and stacked up before starting the next row.
 */
function tryPlaceBundleWithStacking(
  packing: TruckPacking,
  bundle: PackedBundle,
  trailer: TrailerSpec,
  decks: { startIn: number; lengthIn: number }[],
): boolean {
  const maxWidth = trailer.internalWidthIn;
  const maxHeight = trailer.internalHeightIn;

  if (bundle.widthIn > maxWidth || bundle.heightIn > maxHeight) {
    return false;
  }

  // Weight check
  if (packing.truck.totalWeightLbs + bundle.totalWeightLbs > trailer.maxPayloadLbs) {
    return false;
  }

  // Length check: bundle must fit on at least one deck
  const fitsOnADeck = decks.some(d => bundle.lengthIn <= d.lengthIn);
  if (!fitsOnADeck) return false;

  // Strategy 1: Place alongside existing slots — fill floor width first
  const rows = new Map<number, StackSlot[]>();
  for (const slot of packing.slots) {
    if (!rows.has(slot.x)) rows.set(slot.x, []);
    rows.get(slot.x)!.push(slot);
  }

  for (const [x, rowSlots] of rows) {
    // Don't mix categories in the same row — frames stay at front, beams behind
    const rowCategory = rowSlots[0]?.bundles[0]?.category;
    if (rowCategory && rowCategory !== bundle.category) {
      continue;
    }

    // Multi-deck: verify the bundle fits on the same deck as this row
    const rowDeck = rowSlots[0]?.deckIndex ?? 0;
    const deck = decks[rowDeck];
    if (deck && bundle.lengthIn > deck.lengthIn) continue;

    const rowLength = Math.max(...rowSlots.map(s => s.lengthIn));
    if (bundle.lengthIn <= rowLength) {
      const usedWidth = rowSlots.reduce((s, sl) => s + sl.widthIn, 0);
      if (usedWidth + bundle.widthIn <= maxWidth) {
        const newSlot: StackSlot = {
          x,
          z: usedWidth,
          bundles: [bundle],
          totalHeight: bundle.heightIn,
          lengthIn: bundle.lengthIn,
          widthIn: bundle.widthIn,
          deckIndex: rowDeck,
        };
        packing.slots.push(newSlot);
        packing.truck.bundles.push(bundle);
        packing.truck.totalWeightLbs += bundle.totalWeightLbs;
        return true;
      }
    }
  }

  // Strategy 2: Stack on top of an existing slot (fill height before length).
  // Only same-category stacks are allowed for load stability.
  // Respects stacking constraints: nonStackable, maxStackWeightLbs (cumulative).
  let bestSlot: StackSlot | null = null;
  for (const slot of packing.slots) {
    const slotCategory = slot.bundles[0]?.category;
    if (slotCategory !== bundle.category) continue;

    // Check stacking constraints: top bundle must allow stacking
    const topBundle = slot.bundles[slot.bundles.length - 1];
    if (topBundle?.nonStackable) continue;

    // Check cumulative weight on every bundle in the stack.
    // Each bundle's maxStackWeightLbs limits the TOTAL weight above it.
    let canStack = true;
    for (let i = 0; i < slot.bundles.length; i++) {
      const b = slot.bundles[i];
      if (b.maxStackWeightLbs != null) {
        const weightAbove = slot.bundles.slice(i + 1).reduce((sum, sb) => sum + sb.totalWeightLbs, 0) + bundle.totalWeightLbs;
        if (weightAbove > b.maxStackWeightLbs) { canStack = false; break; }
      }
    }
    if (!canStack) continue;

    if (bundle.lengthIn <= slot.lengthIn && bundle.widthIn <= slot.widthIn) {
      const newHeight = slot.totalHeight + DUNNAGE_HEIGHT_IN + bundle.heightIn;
      if (newHeight <= maxHeight) {
        // Choose the lowest eligible stack for better stability.
        if (!bestSlot || slot.totalHeight < bestSlot.totalHeight) {
          bestSlot = slot;
        }
      }
    }
  }
  if (bestSlot) {
    bestSlot.bundles.push(bundle);
    bestSlot.totalHeight = bestSlot.totalHeight + DUNNAGE_HEIGHT_IN + bundle.heightIn;
    packing.truck.bundles.push(bundle);
    packing.truck.totalWeightLbs += bundle.totalWeightLbs;
    return true;
  }

  // Strategy 3: Start a new row — find first deck with available space.
  // For multi-deck trailers, each deck is packed independently.
  for (let di = 0; di < decks.length; di++) {
    const deck = decks[di];
    if (bundle.lengthIn > deck.lengthIn) continue;
    if (bundle.widthIn > maxWidth) continue;

    // Calculate used length on this specific deck
    const deckSlots = packing.slots.filter(s => s.deckIndex === di);
    const usedOnDeck = deckSlots.length > 0
      ? Math.max(...deckSlots.map(s => (s.x - deck.startIn) + s.lengthIn))
      : 0;

    if (usedOnDeck + bundle.lengthIn <= deck.lengthIn) {
      const newSlot: StackSlot = {
        x: deck.startIn + usedOnDeck,
        z: 0,
        bundles: [bundle],
        totalHeight: bundle.heightIn,
        lengthIn: bundle.lengthIn,
        widthIn: bundle.widthIn,
        deckIndex: di,
      };
      packing.slots.push(newSlot);
      packing.truck.bundles.push(bundle);
      packing.truck.totalWeightLbs += bundle.totalWeightLbs;
      return true;
    }
  }

  return false;
}

/**
 * Recalculate truck stats from the packing slots.
 */
function recalcTruckStats(packing: TruckPacking, trailer: TrailerSpec) {
  const truck = packing.truck;
  const slots = packing.slots;
  const totalDeckLength = trailer.isMultiDeck
    ? ((trailer.leadDeckLengthFt ?? 28) + (trailer.pupDeckLengthFt ?? 32)) * 12
    : trailer.deckLengthFt * 12;
  const maxWidth = trailer.internalWidthIn;

  // Used length
  if (slots.length === 0) {
    truck.usedLengthIn = 0;
    truck.usedWidthIn = 0;
    truck.usedHeightIn = 0;
  } else {
    truck.usedLengthIn = Math.max(...slots.map(s => s.x + s.lengthIn));
    truck.usedWidthIn = Math.max(...slots.map(s => s.z + s.widthIn));
    truck.usedHeightIn = Math.max(...slots.map(s => s.totalHeight));
  }

  // Utilisation
  const totalArea = totalDeckLength * maxWidth;
  const usedArea = slots.reduce((s, sl) => s + sl.lengthIn * sl.widthIn, 0);
  truck.weightUtilisation = (truck.totalWeightLbs / trailer.maxPayloadLbs) * 100;
  truck.areaUtilisation = totalArea > 0 ? (usedArea / totalArea) * 100 : 0;
}

// ============================================================
// 3. Public API
// ============================================================

export function calculateLoadPlan(
  items: OrderItem[],
  trailerType: TrailerType,
): LoadPlan {
  const bundles = orderItemsToBundles(items);
  return packBundlesOntoTrailers(bundles, trailerType);
}

// ============================================================
// 4. Automatic truck type optimiser
// ============================================================

export function autoSelectBestTrailer(items: OrderItem[]): TrailerType {
  const bundles = orderItemsToBundles(items);
  const totalWeight = bundles.reduce((s, b) => s + b.totalWeightLbs, 0);
  const maxLength = Math.max(...bundles.map(b => b.lengthIn), 0);

  // Rule 1: Very long items (>32') must go on 53' flatbed
  if (maxLength > 32 * 12) return '53-flatbed';

  // Rule 2: Very heavy orders benefit from B-Train
  if (totalWeight > 48000 && maxLength <= 28 * 12) return 'b-train';

  // Rule 3: Roll-formed / powder-coated items prefer enclosed trailers
  const hasRollFormed = items.some(i => i.frameType === 'roll-formed');
  if (hasRollFormed && totalWeight <= 43000) return '53-closed-van';
  if (hasRollFormed) return '53-roll-tite';

  // Default: flatbed is most versatile
  return '53-flatbed';
}

export function calculateOptimizedLoadPlan(items: OrderItem[]): {
  plan: LoadPlan;
  selectedTrailer: TrailerType;
} {
  // Try all trailer types (built-in + custom) and pick the one needing fewest trucks
  const allSpecs = getAllTrailerSpecs();
  const trailerTypes = Object.keys(allSpecs);
  const bundles = orderItemsToBundles(items);

  let bestPlan: LoadPlan | null = null;
  let bestTrailer: TrailerType = '53-flatbed';
  let bestScore = Infinity;

  for (const tt of trailerTypes) {
    const trailer = resolveTrailer(tt);
    // Skip if any bundle is too long for this trailer
    const maxBundleLen = Math.max(...bundles.map(b => b.lengthIn));
    const deckLengths = trailer.isMultiDeck
      ? [trailer.leadDeckLengthFt! * 12, trailer.pupDeckLengthFt! * 12]
      : [trailer.deckLengthFt * 12];
    const maxDeck = Math.max(...deckLengths);
    if (maxBundleLen > maxDeck) continue;

    const plan = packBundlesOntoTrailers(bundles, tt);
    // Score = number of trucks (lower is better), break ties by weight utilisation
    const avgUtil = plan.trucks.length > 0
      ? plan.trucks.reduce((s, t) => s + t.weightUtilisation, 0) / plan.trucks.length
      : 0;
    const score = plan.trucks.length * 1000 - avgUtil;

    if (score < bestScore) {
      bestScore = score;
      bestPlan = plan;
      bestTrailer = tt;
    }
  }

  return {
    plan: bestPlan ?? packBundlesOntoTrailers(bundles, '53-flatbed'),
    selectedTrailer: bestTrailer,
  };
}

// ============================================================
// 5. Center of Gravity & Axle Weight Distribution
// ============================================================

/**
 * Compute layout positions for bundles on a truck.
 * Uses the same greedy row/stack logic as the packing algorithm.
 * Returns a map of bundleId → { x, y, z } in inches from deck origin.
 */
export function computeBundleLayoutPositions(
  truck: TruckLoad,
): Record<string, { x: number; y: number; z: number }> {
  const trailer = resolveTrailer(truck.trailerType);
  const maxWidth = trailer.internalWidthIn;
  const maxHeight = trailer.internalHeightIn;
  const decks = getDecks(trailer);

  const positions: Record<string, { x: number; y: number; z: number }> = {};

  // Layout all bundles first, then overlay any manual overrides.
  // This avoids partial-override states where auto-laid bundles ignore moved bundle occupancy.
  const needsLayout = truck.bundles;
  if (needsLayout.length === 0) return positions;

  interface Slot {
    x: number; z: number; lengthIn: number; widthIn: number;
    stackHeight: number; category: string; deckIndex: number;
    topBundle?: PackedBundle;
  }
  const slots: Slot[] = [];

  interface Row {
    x: number; lengthIn: number; usedWidth: number; category: string; deckIndex: number;
  }
  const rows: Row[] = [];

  const categoryOrder: Record<string, number> = { frame: 0, beam: 1, accessory: 2 };
  const sorted = [...needsLayout].sort((a, b) => {
    const catA = categoryOrder[a.category] ?? 9;
    const catB = categoryOrder[b.category] ?? 9;
    if (catA !== catB) return catA - catB;
    if (Math.abs(a.lengthIn - b.lengthIn) > 6) return b.lengthIn - a.lengthIn;
    return b.totalWeightLbs - a.totalWeightLbs;
  });

  for (const b of sorted) {
    let placed = false;

    // Try existing rows — fill width first
    for (const row of rows) {
      if (row.category !== b.category) continue;
      if (b.lengthIn <= row.lengthIn && row.usedWidth + b.widthIn <= maxWidth) {
        slots.push({ x: row.x, z: row.usedWidth, lengthIn: b.lengthIn, widthIn: b.widthIn, stackHeight: b.heightIn, category: b.category, deckIndex: row.deckIndex, topBundle: b });
        positions[b.id] = { x: row.x, y: 0, z: row.usedWidth };
        row.usedWidth += b.widthIn;
        placed = true;
        break;
      }
    }
    if (placed) continue;

    // Try stacking on existing slots (respects stacking constraints)
    let bestSlotIdx = -1;
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si];
      if (slot.category !== b.category) continue;

      // Check stacking constraints
      if (slot.topBundle?.nonStackable) continue;
      if (slot.topBundle?.maxStackWeightLbs != null && b.totalWeightLbs > slot.topBundle.maxStackWeightLbs) continue;

      if (b.lengthIn <= slot.lengthIn && b.widthIn <= slot.widthIn) {
        const newHeight = slot.stackHeight + DUNNAGE_HEIGHT_IN + b.heightIn;
        if (newHeight <= maxHeight) {
          if (bestSlotIdx < 0 || slot.stackHeight < slots[bestSlotIdx].stackHeight) {
            bestSlotIdx = si;
          }
        }
      }
    }
    if (bestSlotIdx >= 0) {
      const slot = slots[bestSlotIdx];
      positions[b.id] = { x: slot.x, y: slot.stackHeight + DUNNAGE_HEIGHT_IN, z: slot.z };
      slot.stackHeight += DUNNAGE_HEIGHT_IN + b.heightIn;
      slot.topBundle = b;
      continue;
    }

    // New row — find first deck with space (respects deck boundaries)
    for (let di = 0; di < decks.length; di++) {
      const deck = decks[di];
      if (b.lengthIn > deck.lengthIn) continue;
      if (b.widthIn > maxWidth) continue;

      const deckRows = rows.filter(r => r.deckIndex === di);
      const usedOnDeck = deckRows.length > 0
        ? Math.max(...deckRows.map(r => (r.x - deck.startIn) + r.lengthIn))
        : 0;

      if (usedOnDeck + b.lengthIn <= deck.lengthIn) {
        const x = deck.startIn + usedOnDeck;
        rows.push({ x, lengthIn: b.lengthIn, usedWidth: b.widthIn, category: b.category, deckIndex: di });
        slots.push({ x, z: 0, lengthIn: b.lengthIn, widthIn: b.widthIn, stackHeight: b.heightIn, category: b.category, deckIndex: di, topBundle: b });
        positions[b.id] = { x, y: 0, z: 0 };
        placed = true;
        break;
      }
    }
  }

  if (truck.bundlePositions) {
    const bundleIds = new Set(truck.bundles.map((b) => b.id));
    for (const [id, pos] of Object.entries(truck.bundlePositions)) {
      if (bundleIds.has(id)) {
        positions[id] = pos;
      }
    }
  }

  return positions;
}

/**
 * Calculate the center of gravity for a truck load.
 * Each bundle's CG is at the center of its bounding box.
 */
export function calculateCenterOfGravity(
  truck: TruckLoad,
  positions: Record<string, { x: number; y: number; z: number }>,
): CenterOfGravity {
  const trailer = resolveTrailer(truck.trailerType);
  const deckLengthIn = trailer.deckLengthFt * 12;

  let totalWeight = 0;
  let weightedX = 0;
  let weightedZ = 0;
  let weightedY = 0;

  for (const bundle of truck.bundles) {
    const pos = positions[bundle.id];
    if (!pos) continue;

    const cx = pos.x + bundle.lengthIn / 2;  // center along length
    const cz = pos.z + bundle.widthIn / 2;   // center across width
    const cy = pos.y + bundle.heightIn / 2;  // center vertically

    weightedX += bundle.totalWeightLbs * cx;
    weightedZ += bundle.totalWeightLbs * cz;
    weightedY += bundle.totalWeightLbs * cy;
    totalWeight += bundle.totalWeightLbs;
  }

  if (totalWeight === 0) {
    return { longitudinalIn: 0, lateralIn: 0, verticalIn: 0, longitudinalPct: 0 };
  }

  const longitudinalIn = weightedX / totalWeight;
  const lateralIn = weightedZ / totalWeight;
  const verticalIn = weightedY / totalWeight;
  const longitudinalPct = (longitudinalIn / deckLengthIn) * 100;

  return { longitudinalIn, lateralIn, verticalIn, longitudinalPct };
}

/**
 * Calculate axle weight distribution using moment balance.
 *
 * For a standard trailer:
 *   Taking moments about the rear axle: R_kp × (axle - kp) = Σ W_i × (axle - x_i)
 *   R_rear = totalWeight - R_kp
 *
 * For B-train:
 *   1. Pup deck: moment balance between pintle hitch and pup rear axle
 *   2. Pintle reaction transfers to lead deck as a point load
 *   3. Lead deck: moment balance between kingpin and lead rear axle,
 *      including the pintle load at the rear of the lead deck
 */
export function calculateAxleWeights(
  truck: TruckLoad,
  positions?: Record<string, { x: number; y: number; z: number }>,
): AxleWeightResult {
  const trailer = resolveTrailer(truck.trailerType);
  const resolvedPositions = positions ?? computeBundleLayoutPositions(truck);
  const cg = calculateCenterOfGravity(truck, resolvedPositions);

  const kp = trailer.kingpinPositionIn;
  const axle = trailer.rearAxlePositionIn;
  const leverArm = axle - kp; // distance between kingpin and rear axle

  if (leverArm <= 0 || truck.totalWeightLbs === 0) {
    return {
      kingpinWeightLbs: 0,
      rearAxleWeightLbs: 0,
      kingpinUtilisation: 0,
      rearAxleUtilisation: 0,
      kingpinOverweight: false,
      rearAxleOverweight: false,
      centerOfGravity: cg,
    };
  }

  // B-train: 3-point calculation with lead and pup decks
  if (trailer.isMultiDeck && trailer.pupAxlePositionIn != null && trailer.pupMaxAxleWeightLbs != null) {
    const leadLenIn = (trailer.leadDeckLengthFt ?? 28) * 12;
    const pupAxleAbsolute = leadLenIn + trailer.pupAxlePositionIn; // from combined front

    // Separate bundles into lead and pup by position
    let pupWeight = 0;
    let pupMoment = 0; // moment about the pup axle
    let leadWeight = 0;
    let leadMoment = 0; // moment about the lead axle

    for (const bundle of truck.bundles) {
      const pos = resolvedPositions[bundle.id];
      if (!pos) continue;
      const bundleCGx = pos.x + bundle.lengthIn / 2; // center of bundle

      if (bundleCGx >= leadLenIn) {
        // Pup deck bundle
        pupWeight += bundle.totalWeightLbs;
        pupMoment += bundle.totalWeightLbs * (pupAxleAbsolute - bundleCGx);
      } else {
        // Lead deck bundle
        leadWeight += bundle.totalWeightLbs;
        leadMoment += bundle.totalWeightLbs * (axle - bundleCGx);
      }
    }

    // Pup deck: moment balance between pintle (at leadLenIn) and pup axle
    const pupLeverArm = pupAxleAbsolute - leadLenIn;
    let pintleLoad = 0;
    let pupAxleWeight = 0;
    if (pupLeverArm > 0 && pupWeight > 0) {
      pintleLoad = pupMoment / pupLeverArm;
      pupAxleWeight = pupWeight - pintleLoad;
    }

    // Lead deck: moment balance between kingpin and lead axle,
    // including the pintle load acting downward at position leadLenIn
    const pintleMomentAboutLeadAxle = pintleLoad * (axle - leadLenIn); // negative if pintle is behind axle
    const kingpinWeightLbs = (leadMoment + pintleMomentAboutLeadAxle) / leverArm;
    const rearAxleWeightLbs = leadWeight + pintleLoad - kingpinWeightLbs;

    return {
      kingpinWeightLbs: Math.max(0, kingpinWeightLbs),
      rearAxleWeightLbs: Math.max(0, rearAxleWeightLbs),
      kingpinUtilisation: (Math.max(0, kingpinWeightLbs) / trailer.maxKingpinWeightLbs) * 100,
      rearAxleUtilisation: (Math.max(0, rearAxleWeightLbs) / trailer.maxAxleWeightLbs) * 100,
      kingpinOverweight: kingpinWeightLbs > trailer.maxKingpinWeightLbs,
      rearAxleOverweight: rearAxleWeightLbs > trailer.maxAxleWeightLbs,
      centerOfGravity: cg,
      pupAxleWeightLbs: Math.max(0, pupAxleWeight),
      pupAxleUtilisation: (Math.max(0, pupAxleWeight) / trailer.pupMaxAxleWeightLbs) * 100,
      pupAxleOverweight: pupAxleWeight > trailer.pupMaxAxleWeightLbs,
    };
  }

  // Standard trailer: 2-point moment balance about rear axle
  const cgX = cg.longitudinalIn;
  const kingpinWeightLbs = truck.totalWeightLbs * (axle - cgX) / leverArm;
  const rearAxleWeightLbs = truck.totalWeightLbs - kingpinWeightLbs;

  return {
    kingpinWeightLbs: Math.max(0, kingpinWeightLbs),
    rearAxleWeightLbs: Math.max(0, rearAxleWeightLbs),
    kingpinUtilisation: (Math.max(0, kingpinWeightLbs) / trailer.maxKingpinWeightLbs) * 100,
    rearAxleUtilisation: (Math.max(0, rearAxleWeightLbs) / trailer.maxAxleWeightLbs) * 100,
    kingpinOverweight: kingpinWeightLbs > trailer.maxKingpinWeightLbs,
    rearAxleOverweight: rearAxleWeightLbs > trailer.maxAxleWeightLbs,
    centerOfGravity: cg,
  };
}

// ============================================================
// 6. Loading Sequence Generation (Phase 4)
// ============================================================

/**
 * Generate a step-by-step loading sequence for a truck.
 * Bundles are ordered: floor level first (front-to-back, left-to-right),
 * then stacked bundles in the same order. This ensures forklift operators
 * load bottom layers before upper layers.
 */
export function generateLoadingSequence(truck: TruckLoad): LoadingStep[] {
  const positions = computeBundleLayoutPositions(truck);
  const trailer = resolveTrailer(truck.trailerType);
  const maxWidth = trailer.internalWidthIn;

  // Build position data for each bundle
  const bundleData = truck.bundles.map(bundle => {
    const pos = positions[bundle.id] ?? { x: 0, y: 0, z: 0 };
    return { bundle, pos };
  });

  // Sort: by Y (floor first), then by X (front-to-back), then by Z (left-to-right)
  bundleData.sort((a, b) => {
    if (Math.abs(a.pos.y - b.pos.y) > 1) return a.pos.y - b.pos.y;
    if (Math.abs(a.pos.x - b.pos.x) > 1) return a.pos.x - b.pos.x;
    return a.pos.z - b.pos.z;
  });

  // Identify rows by grouping bundles at similar X positions
  const rowXValues: number[] = [];
  for (const d of bundleData) {
    if (!rowXValues.some(rx => Math.abs(rx - d.pos.x) < 6)) {
      rowXValues.push(d.pos.x);
    }
  }
  rowXValues.sort((a, b) => a - b);

  return bundleData.map((d, idx) => {
    const { bundle, pos } = d;
    const row = rowXValues.findIndex(rx => Math.abs(rx - pos.x) < 6) + 1;
    const isStacked = pos.y > 1;
    const layer = isStacked ? Math.round(pos.y / 20) + 1 : 1; // rough layer estimate

    // Determine lateral position description
    const centerZ = pos.z + bundle.widthIn / 2;
    let lateral: string;
    if (centerZ < maxWidth * 0.33) lateral = 'left side';
    else if (centerZ > maxWidth * 0.67) lateral = 'right side';
    else lateral = 'center';

    // Determine vertical position description
    let vertical: string;
    if (!isStacked) vertical = 'floor level';
    else if (layer === 2) vertical = 'stacked (2nd level)';
    else vertical = `stacked (level ${layer})`;

    const positionDescription = `Row ${row}, ${lateral}, ${vertical}`;

    return {
      stepNumber: idx + 1,
      bundle,
      position: pos,
      positionDescription,
      row,
      isStacked,
      layer,
    };
  });
}

// ============================================================
// Strapping requirement calculation
// ============================================================

/**
 * Calculate strapping requirements for a bundle based on its height and frame type.
 *
 * Rules (from Analysis and Plan):
 *  - ≤96":       2 end straps, 1 mid strap
 *  - 108"–180":  2 end straps, 1 mid strap, 1 safety strap
 *                (structural frames: 2 safety straps instead of 1)
 *  - ≥192":      2 end straps, 1 mid strap, 2 safety straps
 *
 * For non-frame bundles (beams, accessories) the basic rule applies using
 * the bundle's length as the governing dimension.
 */
export function calculateStrappingRequirements(bundle: PackedBundle): StrappingRequirement {
  // For frames the governing dimension is the frame height (= bundle lengthIn
  // since frames ship standing up). For beams/accessories use lengthIn directly.
  const heightIn = bundle.lengthIn;
  const isStructural = bundle.frameType === 'structural';

  const endStraps = 2;
  const midStraps = 1;
  let safetyStraps = 0;
  let description: string;

  if (heightIn <= 108) {
    description = `≤108": 2 end, 1 mid`;
  } else if (heightIn <= 192) {
    safetyStraps = isStructural ? 2 : 1;
    description = `108"–192": 2 end, 1 mid, ${safetyStraps} safety${isStructural ? ' (structural)' : ''}`;
  } else {
    safetyStraps = 2;
    description = `>192": 2 end, 1 mid, 2 safety`;
  }

  return {
    endStraps,
    midStraps,
    safetyStraps,
    totalStraps: endStraps + midStraps + safetyStraps,
    description,
  };
}
