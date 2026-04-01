import type {
  ChannelSpec,
  ChannelDesignation,
  TrailerSpec,
  TrailerType,
  BundleSpec,
  StepBeamProfile,
  ProductMapping,
} from './types';
import { loadCustomTrailers } from './storage';

// ============================================================
// AISC C-channel specifications
// ============================================================
export const CHANNEL_SPECS: Record<ChannelDesignation, ChannelSpec> = {
  'C3x3.5': { designation: 'C3x3.5', depthInches: 3, weightPerFoot: 3.5, flangeWidth: 1.372, webThickness: 0.132 },
  'C4x4.5': { designation: 'C4x4.5', depthInches: 4, weightPerFoot: 4.5, flangeWidth: 1.584, webThickness: 0.184 },
  'C5x6.7': { designation: 'C5x6.7', depthInches: 5, weightPerFoot: 6.7, flangeWidth: 1.750, webThickness: 0.190 },
  'C6x8.2': { designation: 'C6x8.2', depthInches: 6, weightPerFoot: 8.2, flangeWidth: 1.920, webThickness: 0.200 },
  'C8x11.2': { designation: 'C8x11.2', depthInches: 8, weightPerFoot: 11.2, flangeWidth: 2.260, webThickness: 0.220 },
};

// ============================================================
// Trailer specifications
// ============================================================
export const TRAILER_SPECS: Record<TrailerType, TrailerSpec> = {
  '53-flatbed': {
    type: '53-flatbed',
    label: "53' Flatbed",
    deckLengthFt: 53,
    internalWidthIn: 102,
    internalHeightIn: 102, // legal max height ~8.5ft from deck
    maxPayloadLbs: 48000,
    kingpinPositionIn: 0,
    rearAxlePositionIn: 536,   // ~100" from rear of 636" deck
    maxKingpinWeightLbs: 12000,
    maxAxleWeightLbs: 34000,
  },
  '53-roll-tite': {
    type: '53-roll-tite',
    label: "53' Roll-Tite",
    deckLengthFt: 53,
    internalWidthIn: 100,
    internalHeightIn: 100,
    maxPayloadLbs: 44000,
    kingpinPositionIn: 0,
    rearAxlePositionIn: 536,
    maxKingpinWeightLbs: 12000,
    maxAxleWeightLbs: 34000,
  },
  'b-train': {
    type: 'b-train',
    label: 'B-Train',
    deckLengthFt: 60, // combined
    internalWidthIn: 102,
    internalHeightIn: 102,
    maxPayloadLbs: 90000,
    kingpinPositionIn: 0,
    rearAxlePositionIn: 236,   // lead trailer: axle ~100" from rear of 336" deck
    maxKingpinWeightLbs: 12000,
    maxAxleWeightLbs: 34000,
    isMultiDeck: true,
    leadDeckLengthFt: 28,
    pupDeckLengthFt: 32,
    pupAxlePositionIn: 284,    // pup: axle ~100" from rear of 384" deck
    pupMaxAxleWeightLbs: 34000,
  },
  '53-closed-van': {
    type: '53-closed-van',
    label: "53' Closed Van",
    deckLengthFt: 53,
    internalWidthIn: 99,
    internalHeightIn: 108, // ~9ft internal
    maxPayloadLbs: 43000,
    kingpinPositionIn: 0,
    rearAxlePositionIn: 536,
    maxKingpinWeightLbs: 12000,
    maxAxleWeightLbs: 34000,
  },
};

/**
 * Returns all trailer specs (built-in + user-created custom trailers).
 */
export function getAllTrailerSpecs(): Record<string, TrailerSpec> {
  const custom = loadCustomTrailers();
  const all: Record<string, TrailerSpec> = { ...TRAILER_SPECS };
  for (const t of custom) {
    all[t.type] = t;
  }
  return all;
}

// ============================================================
// Bundle quantities & dimension estimates
// ============================================================

// Structural frame bundles – reversed stacking
export const STRUCTURAL_FRAME_BUNDLES: Record<string, BundleSpec> = {
  'C3-structural': {
    key: 'C3-structural',
    piecesPerBundle: 8,   // 8,8,7 pattern across 102" truck width → 32"+32"+28.5"=92.5"
    bundleWidthIn: 48,    // ~frame depth
    stackingHeightPerPiece: 3.5,  // channel depth + clearance when reversed
  },
  'C4-structural-4.75bp': {
    key: 'C4-structural-4.75bp',
    piecesPerBundle: 8,   // 8,8,7 pattern across 102" truck width → 34"+34"+30.25"=98.25"
    bundleWidthIn: 48,
    stackingHeightPerPiece: 3.75, // C4 channel depth with nesting offset
  },
  'C4-structural-8bp': {
    key: 'C4-structural-8bp',
    piecesPerBundle: 8,   // same stacking as 4.75bp variant
    bundleWidthIn: 48,
    stackingHeightPerPiece: 3.75,
  },
  'C5-structural': {
    key: 'C5-structural',
    piecesPerBundle: 5,   // 5,5,4 pattern across 102" truck width → 31.5"+31.5"+26"=89"
    bundleWidthIn: 48,
    stackingHeightPerPiece: 5.5,
  },
};

// Roll-formed frame bundles – nesting
// Bundle sizes chosen so 3 bundles fit side-by-side on 102" truck width
export const ROLLFORMED_FRAME_BUNDLES: Record<string, BundleSpec> = {
  'rf-3.5bp': {
    key: 'rf-3.5bp',
    piecesPerBundle: 10, // 10,10,9 pattern across truck width → 34"+34"+31"=99"
    bundleWidthIn: 48,
    stackingHeightPerPiece: 3.0, // ~3" nesting offset per frame
  },
  'rf-4.25bp': {
    key: 'rf-4.25bp',
    piecesPerBundle: 8, // 8,8,7 pattern across truck width → 32"+32"+28.5"=92.5"
    bundleWidthIn: 48,
    stackingHeightPerPiece: 3.5, // ~3.5" nesting offset per frame
  },
  'rf-8bp': {
    key: 'rf-8bp',
    piecesPerBundle: 12, // 8" deep baseplate, per packaging drawing
    bundleWidthIn: 48,
    stackingHeightPerPiece: 2.5,
  },
};

// Beam bundles – standard quantities from packaging drawings
// Bundle sits FLAT on skid: widthIn is the wide footprint, bundleHeightIn is total height.
export const BEAM_BUNDLES: Record<string, BundleSpec> = {
  // Step beams 3" & 3.5": 22 deep x 2 tall x 3 levels = 132/bundle
  // Bundles are ~48" wide so 2 fit side-by-side on a 102" truck (one from each side)
  'step-beam-xs': {
    key: 'step-beam-xs',
    piecesPerBundle: 132,
    bundleWidthIn: 48,
    stackingHeightPerPiece: 0.21,
    bundleHeightIn: 28,
  },
  // Step beams 4" to 5": 16 deep x 2 tall x 3 levels = 96/bundle
  'step-beam-small': {
    key: 'step-beam-small',
    piecesPerBundle: 96,
    bundleWidthIn: 48,
    stackingHeightPerPiece: 0.35,
    bundleHeightIn: 34,
  },
  // Step beams 6" & 6.5": 16 deep x 2 tall x 2 levels = 64/bundle
  'step-beam-large': {
    key: 'step-beam-large',
    piecesPerBundle: 64,
    bundleWidthIn: 48,
    stackingHeightPerPiece: 0.47,
    bundleHeightIn: 30,
  },
  // Box beams: similar to step beams
  'box-beam': {
    key: 'box-beam',
    piecesPerBundle: 100,
    bundleWidthIn: 48,
    stackingHeightPerPiece: 0.32,
    bundleHeightIn: 32,
  },
  // Channel beams – small (C3, C4): nested in rows
  'channel-beam-small': {
    key: 'channel-beam-small',
    piecesPerBundle: 100,
    bundleWidthIn: 48,
    stackingHeightPerPiece: 0.30,
    bundleHeightIn: 30,
  },
  // Channel beams – large (C5, C6, C8): heavier, fewer per bundle
  'channel-beam-large': {
    key: 'channel-beam-large',
    piecesPerBundle: 46,
    bundleWidthIn: 48,
    stackingHeightPerPiece: 0.65,
    bundleHeightIn: 30,
  },
};

// Accessory bundles – for items with standard packaging
export const ACCESSORY_BUNDLES: Record<string, BundleSpec> = {
  'row-spacer-bundle': {
    key: 'row-spacer-bundle',
    piecesPerBundle: 25,
    bundleWidthIn: 12,
    stackingHeightPerPiece: 1.5,
    bundleHeightIn: 24,
  },
  'safety-bar-bundle': {
    key: 'safety-bar-bundle',
    piecesPerBundle: 25,
    bundleWidthIn: 12,
    stackingHeightPerPiece: 1.5,
    bundleHeightIn: 24,
  },
};

// ============================================================
// Step beam weight estimates (lbs per piece for 96" beam)
// ============================================================
export const STEP_BEAM_WEIGHTS: Record<StepBeamProfile, { minLbs: number; maxLbs: number }> = {
  3:    { minLbs: 18, maxLbs: 20 },
  3.5:  { minLbs: 21.5, maxLbs: 23 },
  4:    { minLbs: 23, maxLbs: 32.4 },
  4.25: { minLbs: 24, maxLbs: 33 },
  4.5:  { minLbs: 26, maxLbs: 35 },
  5:    { minLbs: 30, maxLbs: 40 },
  6:    { minLbs: 55.1, maxLbs: 59.2 },
  6.5:  { minLbs: 58, maxLbs: 63 },
};

// ============================================================
// Dunnage / spacing constants
// ============================================================
export const DUNNAGE_HEIGHT_IN = 4; // vertical gap between stacked bundles
export const BUNDLE_BASE_HEIGHT_IN = 4; // wood skid base height

// ============================================================
// Predefined product options for the order form
// ============================================================

export interface ProductOption {
  id: string;
  label: string;
  category: 'frame' | 'beam' | 'accessory';
  defaults: Partial<{
    frameType: 'structural' | 'roll-formed';
    channelDesignation: ChannelDesignation;
    rollFormedWidth: 3 | 4;
    beamType: 'step-beam' | 'structural-channel';
    beamProfile: StepBeamProfile;
    beamChannelDesignation: ChannelDesignation;
    weightPerPieceLbs: number;
    bundleKey: string;
  }>;
}

export const FRAME_OPTIONS: ProductOption[] = [
  { id: 'struct-c3', label: 'Structural Frame – C3 x 3.5', category: 'frame', defaults: { frameType: 'structural', channelDesignation: 'C3x3.5', bundleKey: 'C3-structural' } },
  { id: 'struct-c4', label: 'Structural Frame – C4 x 4.5', category: 'frame', defaults: { frameType: 'structural', channelDesignation: 'C4x4.5', bundleKey: 'C4-structural-4.75bp' } },
  { id: 'struct-c5', label: 'Structural Frame – C5 x 6.7', category: 'frame', defaults: { frameType: 'structural', channelDesignation: 'C5x6.7', bundleKey: 'C5-structural' } },
  { id: 'rf-3in', label: 'Roll-Formed Frame – 3" Upright', category: 'frame', defaults: { frameType: 'roll-formed', rollFormedWidth: 3, bundleKey: 'rf-3.5bp' } },
  { id: 'rf-4in', label: 'Roll-Formed Frame – 4" Upright', category: 'frame', defaults: { frameType: 'roll-formed', rollFormedWidth: 4, bundleKey: 'rf-4.25bp' } },
];

export const BEAM_OPTIONS: ProductOption[] = [
  { id: 'step-3', label: 'Step Beam – 3"', category: 'beam', defaults: { beamType: 'step-beam', beamProfile: 3, bundleKey: 'step-beam-xs' } },
  { id: 'step-3.5', label: 'Step Beam – 3.5"', category: 'beam', defaults: { beamType: 'step-beam', beamProfile: 3.5, bundleKey: 'step-beam-xs' } },
  { id: 'step-4', label: 'Step Beam – 4"', category: 'beam', defaults: { beamType: 'step-beam', beamProfile: 4, bundleKey: 'step-beam-small' } },
  { id: 'step-4.25', label: 'Step Beam – 4.25"', category: 'beam', defaults: { beamType: 'step-beam', beamProfile: 4.25, bundleKey: 'step-beam-small' } },
  { id: 'step-4.5', label: 'Step Beam – 4.5"', category: 'beam', defaults: { beamType: 'step-beam', beamProfile: 4.5, bundleKey: 'step-beam-small' } },
  { id: 'step-5', label: 'Step Beam – 5"', category: 'beam', defaults: { beamType: 'step-beam', beamProfile: 5, bundleKey: 'step-beam-small' } },
  { id: 'step-6', label: 'Step Beam – 6"', category: 'beam', defaults: { beamType: 'step-beam', beamProfile: 6, bundleKey: 'step-beam-large' } },
  { id: 'step-6.5', label: 'Step Beam – 6.5"', category: 'beam', defaults: { beamType: 'step-beam', beamProfile: 6.5, bundleKey: 'step-beam-large' } },
  { id: 'chan-c3', label: 'Channel Beam – C3 x 3.5', category: 'beam', defaults: { beamType: 'structural-channel', beamChannelDesignation: 'C3x3.5', bundleKey: 'channel-beam-small' } },
  { id: 'chan-c4', label: 'Channel Beam – C4 x 4.5', category: 'beam', defaults: { beamType: 'structural-channel', beamChannelDesignation: 'C4x4.5', bundleKey: 'channel-beam-small' } },
  { id: 'chan-c5', label: 'Channel Beam – C5 x 6.7', category: 'beam', defaults: { beamType: 'structural-channel', beamChannelDesignation: 'C5x6.7', bundleKey: 'channel-beam-large' } },
  { id: 'chan-c6', label: 'Channel Beam – C6 x 8.2', category: 'beam', defaults: { beamType: 'structural-channel', beamChannelDesignation: 'C6x8.2', bundleKey: 'channel-beam-large' } },
  { id: 'chan-c8', label: 'Channel Beam – C8 x 11.2', category: 'beam', defaults: { beamType: 'structural-channel', beamChannelDesignation: 'C8x11.2', bundleKey: 'channel-beam-large' } },
];

export const ACCESSORY_PRESETS: ProductOption[] = [
  { id: 'wire-deck-42x46', label: 'Wire Deck 42" x 46"', category: 'accessory', defaults: { weightPerPieceLbs: 25 } },
  { id: 'wire-deck-42x52', label: 'Wire Deck 42" x 52"', category: 'accessory', defaults: { weightPerPieceLbs: 30 } },
  { id: 'row-spacer', label: 'Row Spacer', category: 'accessory', defaults: { weightPerPieceLbs: 8, bundleKey: 'row-spacer-bundle' } },
  { id: 'safety-bar', label: 'Safety Bar', category: 'accessory', defaults: { weightPerPieceLbs: 8, bundleKey: 'safety-bar-bundle' } },
  { id: 'column-guard', label: 'Column Guard / Protector', category: 'accessory', defaults: { weightPerPieceLbs: 35 } },
  { id: 'shims', label: 'Shim Plates', category: 'accessory', defaults: { weightPerPieceLbs: 2 } },
  { id: 'custom', label: 'Custom Accessory', category: 'accessory', defaults: {} },
];

// ============================================================
// Product catalog – maps NAS product numbers to categories
// and default properties for the quote upload parser.
// Seeded from the 4 sample Business Central sales quotes.
// ============================================================

export const PRODUCT_CATALOG: Record<string, ProductMapping> = {
  // ---- Frames ----
  'KN301': { productNumber: 'KN301', category: 'frame', description: 'KN433 Frame', frameType: 'roll-formed', rollFormedWidth: 3, bundleKey: 'rf-3.5bp' },
  '301':   { productNumber: '301',   category: 'frame', description: 'NAS EF413 Frame', frameType: 'roll-formed', rollFormedWidth: 3, bundleKey: 'rf-3.5bp' },
  '302':   { productNumber: '302',   category: 'frame', description: 'NAS EF413 Frame', frameType: 'roll-formed', rollFormedWidth: 3, bundleKey: 'rf-3.5bp' },
  '901':   { productNumber: '901',   category: 'frame', description: 'STR Rack Frame', frameType: 'structural', channelDesignation: 'C4x4.5', bundleKey: 'C4-structural-4.75bp' },
  '902':   { productNumber: '902',   category: 'frame', description: 'STR Rack Frame', frameType: 'structural', channelDesignation: 'C4x4.5', bundleKey: 'C4-structural-4.75bp' },
  '903':   { productNumber: '903',   category: 'frame', description: 'STR Boxed Post', frameType: 'structural', channelDesignation: 'C4x4.5', bundleKey: 'C4-structural-4.75bp' },

  // ---- Beams ----
  '3442':  { productNumber: '3442',  category: 'beam', description: 'Step Beam', beamType: 'step-beam', beamProfile: 4, bundleKey: 'step-beam-small' },
  '3443':  { productNumber: '3443',  category: 'beam', description: 'Step Beam', beamType: 'step-beam', beamProfile: 4, bundleKey: 'step-beam-small' },
  '3352':  { productNumber: '3352',  category: 'beam', description: 'Step Beam', beamType: 'step-beam', beamProfile: 4.5, bundleKey: 'step-beam-small' },
  '3446S': { productNumber: '3446S', category: 'beam', description: 'Structural Beam', beamType: 'structural-channel', bundleKey: 'channel-beam-large' },
  '3268':  { productNumber: '3268',  category: 'beam', description: 'Seamweld Beam', beamType: 'step-beam', beamProfile: 6.5, bundleKey: 'step-beam-large' },
  '915':   { productNumber: '915',   category: 'beam', description: 'Structural Beam', beamType: 'structural-channel', beamChannelDesignation: 'C6x8.2', bundleKey: 'channel-beam-large' },
  '916':   { productNumber: '916',   category: 'beam', description: 'Structural Beam', beamType: 'structural-channel', beamChannelDesignation: 'C8x11.2', bundleKey: 'channel-beam-large' },
  '930':   { productNumber: '930',   category: 'beam', description: 'Floor Support', beamType: 'structural-channel', bundleKey: 'channel-beam-large' },

  // ---- Accessories ----
  '3523G': { productNumber: '3523G', category: 'accessory', description: '8" Rowspacer Galv', defaultWeightLbs: 1.7, bundleKey: 'row-spacer-bundle' },
  '3524G': { productNumber: '3524G', category: 'accessory', description: '12" Rowspacer Galv', defaultWeightLbs: 2.5, bundleKey: 'row-spacer-bundle' },
  '3529G': { productNumber: '3529G', category: 'accessory', description: 'Rowspacer Galv', bundleKey: 'row-spacer-bundle' },
  '3528G': { productNumber: '3528G', category: 'accessory', description: 'Rowspacer Galv', bundleKey: 'row-spacer-bundle' },
  '3877':  { productNumber: '3877',  category: 'accessory', description: 'Plastic Shim', defaultWeightLbs: 0.3 },
  '3584':  { productNumber: '3584',  category: 'accessory', description: 'Wedge Anchors', defaultWeightLbs: 0.4 },
  '3595':  { productNumber: '3595',  category: 'accessory', description: 'Wedge Anchors', defaultWeightLbs: 0.4 },
  '3241':  { productNumber: '3241',  category: 'accessory', description: 'Safety Pins', defaultWeightLbs: 0.5 },
  '3604FG':{ productNumber: '3604FG',category: 'accessory', description: 'Flange Safety Bar Galv', defaultWeightLbs: 4, bundleKey: 'safety-bar-bundle' },
  '3690S': { productNumber: '3690S', category: 'accessory', description: 'Wire Deck', defaultWeightLbs: 18.9 },
  '3905':  { productNumber: '3905',  category: 'accessory', description: 'End of Aisle Guard', defaultWeightLbs: 100.35 },
  '3912':  { productNumber: '3912',  category: 'accessory', description: 'End of Aisle Guard', defaultWeightLbs: 100 },
  '3948':  { productNumber: '3948',  category: 'accessory', description: 'Post Protector', defaultWeightLbs: 10.1 },
  '931':   { productNumber: '931',   category: 'accessory', description: 'Angle Connection', defaultWeightLbs: 5 },
  '3495':  { productNumber: '3495',  category: 'accessory', description: 'Bolts', defaultWeightLbs: 0.3 },
  '3593':  { productNumber: '3593',  category: 'accessory', description: 'Bolts', defaultWeightLbs: 0.3 },
  '3586':  { productNumber: '3586',  category: 'accessory', description: 'Bolts', defaultWeightLbs: 0.3 },
  '3590':  { productNumber: '3590',  category: 'accessory', description: 'Bolts', defaultWeightLbs: 0.3 },
  '3984S': { productNumber: '3984S', category: 'accessory', description: 'Seismic Footplate', defaultWeightLbs: 5 },
  '970':   { productNumber: '970',   category: 'accessory', description: 'Tunnel Guard', defaultWeightLbs: 30 },
  '971':   { productNumber: '971',   category: 'accessory', description: 'Tunnel Guard', defaultWeightLbs: 30 },
  '972':   { productNumber: '972',   category: 'accessory', description: 'Tunnel Guard', defaultWeightLbs: 30 },

  // ---- Services (filtered out during import) ----
  '9197':  { productNumber: '9197', category: 'accessory', isService: true, description: 'Installation' },
  '9198':  { productNumber: '9198', category: 'accessory', isService: true, description: 'Freight' },
  '9195':  { productNumber: '9195', category: 'accessory', isService: true, description: 'Engineering' },
  '0001':  { productNumber: '0001', category: 'accessory', isService: true, description: 'Engineering Drawing' },
  '0003':  { productNumber: '0003', category: 'accessory', isService: true, description: 'Installation Drawing' },
};
