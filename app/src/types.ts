// ============================================================
// Core Types for the Shipping Estimator
// ============================================================

/** Category of upright frame construction */
export type FrameType = 'structural' | 'roll-formed';

/** Category of beam construction */
export type BeamType = 'step-beam' | 'structural-channel';

/** Component categories that can appear on an order */
export type ProductCategory = 'frame' | 'beam' | 'accessory';

/** Built-in trailer type IDs */
export type BuiltInTrailerType = '53-flatbed' | '53-roll-tite' | 'b-train' | '53-closed-van';

/** Truck trailer types supported (built-in + custom) */
export type TrailerType = BuiltInTrailerType | (string & {});

// ---- Channel profile lookup key (e.g. "C3x3.5") ----
export type ChannelDesignation = 'C3x3.5' | 'C4x4.5' | 'C5x6.7' | 'C6x8.2' | 'C8x11.2';

// ---- Roll-formed beam profile heights (inches) ----
export type StepBeamProfile = 3 | 3.5 | 4 | 4.25 | 4.5 | 5 | 6 | 6.5;

// ---- Roll-formed upright face widths (inches) ----
export type RollFormedWidth = 3 | 4;

// ============================================================
// Channel specification (from AISC tables)
// ============================================================
export interface ChannelSpec {
  designation: ChannelDesignation;
  depthInches: number;
  weightPerFoot: number; // lbs/ft
  flangeWidth: number;   // inches
  webThickness: number;  // inches
}

// ============================================================
// Trailer specification
// ============================================================
export interface TrailerSpec {
  type: TrailerType;
  label: string;
  deckLengthFt: number;       // total usable deck length (feet)
  internalWidthIn: number;    // usable internal width (inches)
  internalHeightIn: number;   // usable internal height (inches)
  maxPayloadLbs: number;      // legal payload limit
  /** Distance from front of deck to kingpin (inches) */
  kingpinPositionIn: number;
  /** Distance from front of deck to center of rear axle group (inches) */
  rearAxlePositionIn: number;
  /** Maximum weight on kingpin / fifth wheel (lbs) */
  maxKingpinWeightLbs: number;
  /** Maximum weight on rear axle group (lbs) */
  maxAxleWeightLbs: number;
  /** B-trains have two decks; lengths given separately */
  isMultiDeck?: boolean;
  leadDeckLengthFt?: number;
  pupDeckLengthFt?: number;
  /** B-train pup trailer axle position (from front of pup deck, inches) */
  pupAxlePositionIn?: number;
  /** B-train pup trailer max axle weight (lbs) */
  pupMaxAxleWeightLbs?: number;
  /** True if this is a user-created custom trailer */
  isCustom?: boolean;
}

// ============================================================
// Bundle specification – how many pieces per bundle & dimensions
// ============================================================
export interface BundleSpec {
  /** descriptive key */
  key: string;
  piecesPerBundle: number;
  /** Bundle footprint width (inches) – the wide, flat side the bundle sits on */
  bundleWidthIn: number;
  /** Height added per piece when stacked in a bundle (inches).
   *  Used for frames and as fallback when bundleHeightIn is not set. */
  stackingHeightPerPiece: number;
  /** Total bundle height (inches) for a full standard bundle.
   *  When set, overrides the per-piece calculation. Partial bundles
   *  are scaled proportionally. */
  bundleHeightIn?: number;
}

// ============================================================
// Order line item entered by user
// ============================================================
export interface OrderItem {
  id: string;
  category: ProductCategory;
  /** Human-readable description */
  description: string;

  // Frame-specific
  frameType?: FrameType;
  channelDesignation?: ChannelDesignation;
  rollFormedWidth?: RollFormedWidth;
  frameWidthIn?: number;       // overall frame width
  frameDepthIn?: number;       // overall frame depth
  frameHeightIn?: number;      // overall frame height

  // Beam-specific
  beamType?: BeamType;
  beamProfile?: StepBeamProfile;
  beamChannelDesignation?: ChannelDesignation;
  beamLengthIn?: number;       // cut length of beam

  // Accessory-specific
  accessoryName?: string;
  accessoryWeightLbs?: number;
  accessoryLengthIn?: number;
  accessoryWidthIn?: number;
  accessoryHeightIn?: number;

  // Common
  quantity: number;
  weightPerPieceLbs: number;
  lengthIn: number;           // shipping length (longest dimension)
  bundleKey?: string;         // explicit bundle spec key (set from product preset)

  // Stacking constraints
  nonStackable?: boolean;       // bundle cannot have anything stacked on top
  maxStackWeightLbs?: number;   // max weight that can be placed on top of this bundle
  keepUpright?: boolean;        // must remain in upright orientation
  orientationLock?: boolean;    // cannot be rotated from default orientation
}

// ============================================================
// Computed bundle ready for packing
// ============================================================
export interface PackedBundle {
  id: string;
  orderItemId: string;
  description: string;
  category: ProductCategory;
  pieces: number;
  totalWeightLbs: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
  /** Is this a partial (remainder) bundle? */
  isPartial: boolean;
  /** Stacking constraints inherited from the order item */
  nonStackable?: boolean;
  maxStackWeightLbs?: number;
  keepUpright?: boolean;
  /** Frame type for strapping calculations */
  frameType?: FrameType;
}

// ============================================================
// Strapping requirements for a bundle
// ============================================================
export interface StrappingRequirement {
  endStraps: number;
  midStraps: number;
  safetyStraps: number;
  totalStraps: number;
  /** Human-readable summary */
  description: string;
}

// ============================================================
// A single truck assignment in the load plan
// ============================================================
export interface TruckLoad {
  truckIndex: number;
  trailerType: TrailerType;
  trailerLabel: string;
  bundles: PackedBundle[];
  totalWeightLbs: number;
  usedLengthIn: number;
  usedWidthIn: number;
  usedHeightIn: number;
  /** Percentage of weight capacity used */
  weightUtilisation: number;
  /** Percentage of floor area used (length × width) */
  areaUtilisation: number;
  /** Manual position overrides for bundles (drag-and-drop) */
  bundlePositions?: Record<string, { x: number; y: number; z: number }>;
}

// ============================================================
// Full result of the load-planning algorithm
// ============================================================
// ============================================================
// Axle weight and center of gravity results
// ============================================================
export interface CenterOfGravity {
  /** Longitudinal CG position from front of deck (inches) */
  longitudinalIn: number;
  /** Lateral CG position from left side of deck (inches) */
  lateralIn: number;
  /** Vertical CG height from deck surface (inches) */
  verticalIn: number;
  /** CG as percentage of deck length from front (0-100) */
  longitudinalPct: number;
}

export interface AxleWeightResult {
  /** Weight on kingpin / fifth wheel (lbs) */
  kingpinWeightLbs: number;
  /** Weight on rear axle group (lbs) – for B-train this is the lead rear axle */
  rearAxleWeightLbs: number;
  /** Kingpin weight as percentage of limit */
  kingpinUtilisation: number;
  /** Rear axle weight as percentage of limit */
  rearAxleUtilisation: number;
  /** Whether kingpin weight exceeds limit */
  kingpinOverweight: boolean;
  /** Whether rear axle weight exceeds limit */
  rearAxleOverweight: boolean;
  /** Center of gravity data */
  centerOfGravity: CenterOfGravity;
  /** B-train pup trailer axle weight (lbs) */
  pupAxleWeightLbs?: number;
  /** B-train pup axle weight as percentage of limit */
  pupAxleUtilisation?: number;
  /** Whether pup axle weight exceeds limit */
  pupAxleOverweight?: boolean;
}

export interface LoadPlan {
  trucks: TruckLoad[];
  totalBundles: number;
  totalWeight: number;
  unplacedBundles: PackedBundle[];
}

// ============================================================
// Loading sequence step (Phase 4 – Loading Instructions)
// ============================================================
export interface LoadingStep {
  /** 1-based sequence number */
  stepNumber: number;
  /** The bundle being loaded */
  bundle: PackedBundle;
  /** Position on the deck (inches from origin) */
  position: { x: number; y: number; z: number };
  /** Human-readable position description e.g. "Row 1, left side, floor level" */
  positionDescription: string;
  /** Row number (1-based, front-to-back) */
  row: number;
  /** Whether this bundle is stacked on another */
  isStacked: boolean;
  /** Layer number within a stack (1 = floor level) */
  layer: number;
}

// ============================================================
// Quote parsing types (Phase 1 – Quote Upload)
// ============================================================

/** A single line item parsed from a sales quote PDF or Excel */
export interface ParsedLineItem {
  productNumber: string;
  description: string;
  quantity: number;
  colour?: string;
  weightPerPiece: number;
  netPrice?: number;
  lineAmount?: number;
}

/** Header + line items parsed from a sales quote file */
export interface ParsedQuote {
  quoteNumber: string;
  documentDate?: string;
  salesperson?: string;
  customerName?: string;
  shipToName?: string;
  shipToAddress?: string;
  totalWeight?: number;
  lineItems: ParsedLineItem[];
}

/** Maps a product number to its category and default properties */
export interface ProductMapping {
  productNumber: string;
  category: ProductCategory;
  description?: string;
  frameType?: FrameType;
  channelDesignation?: ChannelDesignation;
  rollFormedWidth?: RollFormedWidth;
  beamType?: BeamType;
  beamProfile?: StepBeamProfile;
  beamChannelDesignation?: ChannelDesignation;
  bundleKey?: string;
  defaultWeightLbs?: number;
  /** If true, this line represents a service (installation, freight, etc.) and should be filtered out */
  isService?: boolean;
}
