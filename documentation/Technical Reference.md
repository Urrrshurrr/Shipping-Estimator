# Racking Shipping Estimator — Complete Technical Reference

> **Purpose:** This document provides a complete, exhaustive reference for the entire Shipping Estimator codebase. It is designed so that any AI agent or developer can pick up work anywhere in the project with full understanding of the architecture, data models, algorithms, UI components, and extension points.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack & Dependencies](#2-technology-stack--dependencies)
3. [Directory Structure](#3-directory-structure)
4. [Build, Run & Deploy Commands](#4-build-run--deploy-commands)
5. [Configuration Files](#5-configuration-files)
6. [Type System (`types.ts`)](#6-type-system-typests)
7. [Industry Data & Constants (`data.ts`)](#7-industry-data--constants-datats)
8. [Core Algorithm (`algorithm.ts`)](#8-core-algorithm-algorithmts)
9. [PDF Export (`pdfExport.ts`)](#9-pdf-export-pdfexportts)
10. [UI Components](#10-ui-components)
11. [Application Shell (`App.tsx`)](#11-application-shell-apptsx)
12. [Styling (`index.css`)](#12-styling-indexcss)
13. [Data Flow & State Management](#13-data-flow--state-management)
14. [Industry Domain Knowledge](#14-industry-domain-knowledge)
15. [Known Limitations & Future Work](#15-known-limitations--future-work)

---

## 1. Project Overview

The Shipping Estimator is a **single-page web application** that helps a racking manufacturer estimate how many trucks are needed to ship an order of industrial racking components (frames, beams, and accessories).

### What the user does:
1. **Selects a trailer type** (or enables auto-selection).
2. **Adds order items** — frames, beams, or accessories — choosing from presets and entering dimensions/quantities.
3. **Clicks "Calculate Load Plan"** — the algorithm bundles items, then packs bundles onto trucks using a greedy bin-packing heuristic.
4. **Reviews results** — summary statistics, per-truck manifests, weight/area utilisation bars, and an interactive 3D visualization.
5. **Exports to PDF** — a formatted load plan with bundle manifests and (optionally) a snapshot of the 3D view.

### What the algorithm does:
1. Converts order items into **packed bundles** using industry-standard bundle quantities (e.g. 16 C3 structural frames per bundle, 96 step beams per bundle).
2. Estimates weight automatically from channel specifications when the user doesn't provide explicit weights.
3. Uses a **first-fit-decreasing bin packing** heuristic to assign bundles to trucks, respecting weight limits, deck length constraints, and floor area.
4. Optionally tries **all four trailer types** and picks the one that minimizes the total number of trucks (auto-optimization).

---

## 2. Technology Stack & Dependencies

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Framework | React | 19.x | UI component library |
| Language | TypeScript | 5.9.x | Type-safe JavaScript |
| Build Tool | Vite | 8.x | Fast bundler & dev server |
| 3D Rendering | Three.js | 0.183.x | WebGL 3D engine |
| 3D React Bindings | @react-three/fiber | 9.x | React renderer for Three.js |
| 3D Helpers | @react-three/drei | 10.x | Prebuilt Three.js components (OrbitControls, Line, etc.) |
| PDF Generation | jsPDF | 4.x | Client-side PDF creation |
| Canvas Capture | html2canvas | 1.x | Screenshot of DOM/canvas for PDF embedding |
| Icons | lucide-react | 0.577.x | SVG icon components |

All dependencies are listed in `app/package.json`. There is **no backend** — everything runs client-side in the browser.

---

## 3. Directory Structure

```
Shipping Estimator/
├── documentation/
│   ├── Analysis and Plan.md          # Original industry research & algorithmic roadmap
│   └── Technical Reference.md        # THIS FILE — complete codebase reference
│
└── app/                              # Vite + React application root
    ├── package.json                  # Dependencies & scripts
    ├── vite.config.ts                # Vite configuration
    ├── tsconfig.json                 # TypeScript project references
    ├── tsconfig.app.json             # TypeScript compiler options for app source
    ├── tsconfig.node.json            # TypeScript compiler options for Node tooling
    ├── eslint.config.js              # ESLint configuration
    ├── index.html                    # HTML entry point (mounts #root)
    ├── public/                       # Static assets served as-is
    ├── dist/                         # Production build output (generated)
    │
    └── src/
        ├── main.tsx                  # React entry point — renders <App /> into #root
        ├── App.tsx                   # Root component — layout, state, routing between panels
        ├── App.css                   # Empty (all styles in index.css)
        ├── index.css                 # Complete application stylesheet
        ├── types.ts                  # All TypeScript type/interface definitions
        ├── data.ts                   # Industry constants, specifications, product presets
        ├── algorithm.ts              # Bundle calculation + bin-packing + auto-optimization
        ├── pdfExport.ts              # PDF generation logic
        ├── assets/                   # Vite-managed assets (images, SVGs)
        │
        └── components/
            ├── TruckSelector.tsx     # Trailer type selection card with auto-toggle
            ├── OrderForm.tsx         # Order item entry form with presets
            ├── LoadPlanResults.tsx    # Results display: stats, truck cards, bundle tables
            └── TruckViewer3D.tsx     # Interactive 3D truck/bundle visualization
```

---

## 4. Build, Run & Deploy Commands

All commands run from the `app/` directory.

| Command | What it does |
|---------|-------------|
| `npm install` | Install all dependencies |
| `npm run dev` | Start Vite dev server (default: `http://localhost:5173/`) |
| `npm run build` | Type-check with `tsc -b` then bundle with `vite build` → output in `app/dist/` |
| `npm run preview` | Serve the production build locally for testing |
| `npm run lint` | Run ESLint |

### Deployment
The production build outputs static files to `app/dist/` (HTML + JS + CSS). These can be deployed to:
- Any static web host (Nginx, Apache, S3, Azure Blob Storage)
- SharePoint by uploading `dist/` contents to a document library and referencing `index.html`
- A SharePoint Framework (SPFx) web part wrapper (would require additional scaffolding)

---

## 5. Configuration Files

### `vite.config.ts`
Minimal — just enables the `@vitejs/plugin-react` plugin. No custom aliases, proxy settings, or output overrides.

### `tsconfig.app.json`
Key settings:
- **Target:** ES2023
- **Strict mode:** enabled (`strict: true`)
- **`noUnusedLocals` and `noUnusedParameters`:** both `true` — the build will fail on unused variables/imports
- **JSX:** `react-jsx` (automatic runtime, no need for `import React`)
- **Module resolution:** `bundler` mode

### `eslint.config.js`
Standard React + TypeScript ESLint configuration with `react-hooks` and `react-refresh` plugins.

---

## 6. Type System (`types.ts`)

This file defines every data structure used throughout the application. No runtime code — only type definitions and interfaces.

### Literal Union Types

| Type | Values | Purpose |
|------|--------|---------|
| `FrameType` | `'structural'` \| `'roll-formed'` | Upright frame construction method |
| `BeamType` | `'step-beam'` \| `'structural-channel'` | Beam construction method |
| `ProductCategory` | `'frame'` \| `'beam'` \| `'accessory'` | Order item classification |
| `TrailerType` | `'53-flatbed'` \| `'53-roll-tite'` \| `'b-train'` \| `'53-closed-van'` | Supported trailer types |
| `ChannelDesignation` | `'C3x3.5'` \| `'C4x4.5'` \| `'C5x6.7'` \| `'C6x8.2'` \| `'C8x11.2'` | AISC C-channel designations |
| `StepBeamProfile` | `3` \| `3.5` \| `4` \| `4.25` \| `4.5` \| `5` \| `6` \| `6.5` | Step beam face heights (inches) |
| `RollFormedWidth` | `3` \| `4` | Roll-formed upright face widths (inches) |

### Key Interfaces

#### `ChannelSpec`
AISC C-channel properties: `designation`, `depthInches`, `weightPerFoot` (lbs/ft), `flangeWidth`, `webThickness`.

#### `TrailerSpec`
Trailer physical properties:
- `type`, `label` — identifier and display name
- `deckLengthFt` — total usable deck length in feet
- `internalWidthIn` — usable width in inches
- `internalHeightIn` — usable height in inches
- `maxPayloadLbs` — legal weight limit
- `isMultiDeck?` — true for B-Trains
- `leadDeckLengthFt?`, `pupDeckLengthFt?` — individual deck lengths for B-Trains

#### `BundleSpec`
Defines how items are grouped into shipping bundles:
- `key` — lookup identifier
- `piecesPerBundle` — standard count
- `bundleWidthIn` — cross-sectional width when bundled
- `stackingHeightPerPiece` — vertical increment per piece (accounts for nesting or reversing)

#### `OrderItem`
A single line item the user enters. Contains:
- **Common fields:** `id`, `category`, `description`, `quantity`, `weightPerPieceLbs`, `lengthIn`
- **Frame fields:** `frameType`, `channelDesignation`, `rollFormedWidth`, `frameWidthIn`, `frameDepthIn`, `frameHeightIn`
- **Beam fields:** `beamType`, `beamProfile`, `beamChannelDesignation`, `beamLengthIn`
- **Accessory fields:** `accessoryName`, `accessoryWeightLbs`, `accessoryLengthIn`, `accessoryWidthIn`, `accessoryHeightIn`

#### `PackedBundle`
A calculated shipping bundle produced by the algorithm:
- `orderItemId` — traces back to the source `OrderItem`
- `description`, `pieces`, `totalWeightLbs`
- `lengthIn`, `widthIn`, `heightIn` — physical dimensions
- `isPartial` — true if this bundle has fewer than the standard count

#### `TruckLoad`
One truck in the load plan:
- `truckIndex` — 0-based position
- `trailerType`, `trailerLabel`
- `bundles` — array of `PackedBundle` assigned to this truck
- `totalWeightLbs`, `usedLengthIn`, `usedWidthIn`, `usedHeightIn`
- `weightUtilisation` — percentage of weight capacity used (0–100)
- `areaUtilisation` — percentage of floor area used (0–100)

#### `LoadPlan`
Complete result of the packing algorithm:
- `trucks` — array of `TruckLoad`
- `totalBundles`, `totalWeight`
- `unplacedBundles` — bundles that couldn't fit on any truck

---

## 7. Industry Data & Constants (`data.ts`)

### AISC Channel Specifications (`CHANNEL_SPECS`)
Record keyed by `ChannelDesignation`. Contains the 5 channel profiles used by the manufacturer:

| Designation | Depth | Weight/ft | Flange Width | Web Thickness |
|------------|-------|-----------|-------------|---------------|
| C3x3.5 | 3.0" | 3.5 lbs | 1.372" | 0.132" |
| C4x4.5 | 4.0" | 4.5 lbs | 1.584" | 0.184" |
| C5x6.7 | 5.0" | 6.7 lbs | 1.750" | 0.190" |
| C6x8.2 | 6.0" | 8.2 lbs | 1.920" | 0.200" |
| C8x11.2 | 8.0" | 11.2 lbs | 2.260" | 0.220" |

### Trailer Specifications (`TRAILER_SPECS`)
Record keyed by `TrailerType`:

| Type | Label | Deck Length | Internal Width | Internal Height | Max Payload |
|------|-------|------------|---------------|----------------|-------------|
| `53-flatbed` | 53' Flatbed | 53 ft | 102" | 102" | 48,000 lbs |
| `53-roll-tite` | 53' Roll-Tite | 53 ft | 100" | 100" | 44,000 lbs |
| `b-train` | B-Train | 60 ft combined (28' lead + 32' pup) | 102" | 102" | 90,000 lbs |
| `53-closed-van` | 53' Closed Van | 53 ft | 99" | 108" | 43,000 lbs |

### Bundle Specifications

Three separate records hold bundle specs per product category:

#### `STRUCTURAL_FRAME_BUNDLES` (reversed stacking)
| Key | Pieces/Bundle | Bundle Width | Stacking Height/Piece |
|-----|--------------|-------------|----------------------|
| `C3-structural` | 16 | 48" | 3.5" |
| `C4-structural-4.75bp` | 12 | 48" | 4.5" |
| `C4-structural-8bp` | 11 | 48" | 4.5" |
| `C5-structural` | 10 | 48" | 5.5" |

#### `ROLLFORMED_FRAME_BUNDLES` (nesting)
| Key | Pieces/Bundle | Bundle Width | Stacking Height/Piece |
|-----|--------------|-------------|----------------------|
| `rf-3.5bp` | 20 | 48" | 2.0" |
| `rf-4.25bp` | 20 | 48" | 2.0" |
| `rf-8bp` | 14 | 48" | 2.25" |

#### `BEAM_BUNDLES`
| Key | Pieces/Bundle | Bundle Width | Stacking Height/Piece |
|-----|--------------|-------------|----------------------|
| `step-beam-small` | 96 | 10" | 0.5" |
| `box-beam` | 100 | 10" | 0.5" |
| `channel-beam-small` | 100 | 12" | 0.6" |
| `channel-beam-large` | 46 | 16" | 1.0" |

### Step Beam Weight Estimates (`STEP_BEAM_WEIGHTS`)
Based on a reference 96" beam length. Keyed by `StepBeamProfile` (face height in inches):

| Profile | Min Weight (lbs) | Max Weight (lbs) |
|---------|-----------------|-----------------|
| 3" | 18 | 20 |
| 3.5" | 21.5 | 23 |
| 4" | 23 | 32.4 |
| 4.25" | 24 | 33 |
| 4.5" | 26 | 35 |
| 5" | 30 | 40 |
| 6" | 55.1 | 59.2 |
| 6.5" | 58 | 63 |

### Spacing Constants
- `DUNNAGE_HEIGHT_IN = 4` — vertical gap between stacked bundles (wood dunnage)
- `BUNDLE_BASE_HEIGHT_IN = 4` — wood skid base height added to each bundle

### Product Presets (`FRAME_OPTIONS`, `BEAM_OPTIONS`, `ACCESSORY_PRESETS`)
Arrays of `ProductOption` objects used to populate the order form dropdowns. Each preset stores:
- `id` — unique key (e.g. `'struct-c3'`, `'step-4.25'`, `'wire-deck-42x46'`)
- `label` — display text
- `category` — `'frame'`, `'beam'`, or `'accessory'`
- `defaults` — partial properties auto-applied when the preset is selected (e.g. `frameType`, `channelDesignation`, `bundleKey`, `weightPerPieceLbs`)

**Frame presets (5):** Structural C3, C4, C5; Roll-formed 3", 4"
**Beam presets (13):** Step beams 3"–6.5" (8 sizes); Channel beams C3, C4, C5, C6, C8 (5 sizes)
**Accessory presets (6):** Wire Deck 42×46, Wire Deck 42×52, Row Spacer, Column Guard, Shim Plates, Custom Accessory

---

## 8. Core Algorithm (`algorithm.ts`)

### Exported Functions

#### `orderItemsToBundles(items: OrderItem[]): PackedBundle[]`
Converts an array of order items into packed bundles.

**Logic per item:**
1. Calls `getBundleSpec(item)` to find the matching `BundleSpec`.
2. Calls `estimateWeight(item)` to determine per-piece weight.
3. Divides `item.quantity` by `spec.piecesPerBundle`, creating full bundles and one partial bundle for any remainder.
4. Each bundle's `heightIn` = `BUNDLE_BASE_HEIGHT_IN + (count × spec.stackingHeightPerPiece)`.
5. **Accessories** (no bundle spec) are grouped into pallets of up to 40 pieces each.

#### `calculateLoadPlan(items: OrderItem[], trailerType: TrailerType): LoadPlan`
The main public API. Converts items to bundles, then calls `packBundlesOntoTrailers`.

#### `calculateOptimizedLoadPlan(items: OrderItem[]): { plan: LoadPlan; selectedTrailer: TrailerType }`
Tries all 4 trailer types and picks the best one. Scoring: `truckCount × 1000 - avgWeightUtilisation`. Lowest score wins. Skips trailer types where the longest bundle exceeds the longest available deck.

#### `autoSelectBestTrailer(items: OrderItem[]): TrailerType`
Rule-based trailer selection (currently unused by UI, but exported):
1. Items > 32' long → 53' Flatbed (won't fit B-Train decks)
2. Total weight > 48,000 lbs and items ≤ 28' → B-Train
3. Roll-formed items and weight ≤ 43,000 lbs → 53' Closed Van
4. Roll-formed items, heavier → 53' Roll-Tite
5. Default → 53' Flatbed

### Internal Functions

#### `getBundleSpec(item: OrderItem): BundleSpec | null`
Selects the correct bundle specification based on item category, frame type, channel designation, and depth:
- **Structural frames:** Routes to `STRUCTURAL_FRAME_BUNDLES` by channel designation. For C4, uses depth ≥ 48" to distinguish 8" baseplate from 4.75" baseplate variants.
- **Roll-formed frames:** Routes to `ROLLFORMED_FRAME_BUNDLES`. Depth ≥ 48" → 8" baseplate variant; otherwise by `rollFormedWidth`.
- **Structural channel beams:** C5/C6/C8 → `channel-beam-large`; C3/C4 → `channel-beam-small`.
- **Step beams:** Always `step-beam-small`.
- **Accessories:** Returns `null` (handled separately).

#### `estimateWeight(item: OrderItem): number`
Returns `item.weightPerPieceLbs` if > 0. Otherwise estimates:
- **Structural frames:** `channelSpec.weightPerFoot × heightFt × 2 uprights × 1.3 (bracing factor)`
- **Roll-formed frames:** `(2.5 or 3.5 lbs/ft) × heightFt × 2 uprights × 1.3`
- **Structural channel beams:** `channelSpec.weightPerFoot × lengthFt`
- **Step beams:** `average(minLbs, maxLbs) × (lengthIn / 96)` — scales from the 96" reference
- **Accessories:** `item.accessoryWeightLbs ?? 10`

#### `packBundlesOntoTrailers(bundles, trailerType): LoadPlan`
1. Sorts bundles by `totalWeightLbs` descending (heaviest first = weight-based layering).
2. Gets deck configuration via `getDecks()` (single deck or B-Train lead + pup).
3. For each bundle, tries to place it on an existing truck via `tryPlaceBundle()`. If no truck has room, opens a new truck. If even a new truck can't fit it, the bundle goes into `unplacedBundles`.

#### `tryPlaceBundle(truck, bundle, trailer, decks): boolean`
Checks three constraints:
1. **Weight:** `truck.totalWeightLbs + bundle.totalWeightLbs ≤ trailer.maxPayloadLbs`
2. **Length:** Bundle must fit on at least one deck (`bundle.lengthIn ≤ deck.lengthIn`)
3. **Area:** `totalFootprintArea ≤ totalDeckLength × trailerWidth`
4. **Height:** `max stack height + DUNNAGE_HEIGHT_IN ≤ trailer.internalHeightIn`

If all pass, the bundle is added and utilisation is recalculated.

#### `recalcUsedDimensions(truck, trailerWidth): void`
Groups bundles by length, then simulates packing bundles widthwise in rows. When a row exceeds `trailerWidth`, a new row starts. Updates `truck.usedLengthIn` and `truck.usedWidthIn`.

---

## 9. PDF Export (`pdfExport.ts`)

### `exportLoadPlanPDF(plan: LoadPlan, title?: string): Promise<void>`

Uses **jsPDF** to build a multi-page PDF document. The function is `async` because it attempts a canvas screenshot.

**PDF structure:**
1. **Title** — "Racking Shipping Load Plan" (or custom title), blue, bold, 18pt
2. **Timestamp** — date and time of generation
3. **Summary section** — trucks required, total bundles, total weight, warning for unplaced bundles
4. **Per-truck sections** — each truck gets:
   - Header with truck number, trailer label
   - Weight utilisation line (e.g. "34,500 / 48,000 lbs (71.9%)")
   - Bundle count
   - Table with columns: #, Component, Pieces, Weight (lbs), L × W × H (in)
5. **3D visualization snapshot** (if `.viewer-container canvas` exists in DOM) — captures the WebGL canvas as PNG and embeds it

**Implementation details:**
- Page format: Letter size, portrait, mm units
- 15mm margins
- Automatic page breaks via `checkPage(neededMm)` — checks remaining space before each section
- Long descriptions truncated to 28 characters + "..."
- Column positions hardcoded at `margin`, `margin+8`, `margin+75`, `margin+95`, `margin+125`

---

## 10. UI Components

### `TruckSelector.tsx`
**Props:** `selected: TrailerType`, `autoMode: boolean`, `onSelect: (t) => void`, `onAutoToggle: (v) => void`

Renders a `.card` with:
- 2×2 grid of `.truck-option` cards, one for each trailer type in `trailerOrder` array
- Each shows `spec.label` and `"deckLengthFt' · maxPayloadLbs lbs"`
- Clicking a trailer type disables auto mode and selects it
- All options appear at 50% opacity when `autoMode` is true
- `.auto-select-toggle` checkbox at the bottom

### `OrderForm.tsx`
**Props:** `items: OrderItem[]`, `onChange: (items) => void`

Renders a `.card` with:
- Empty state message when `items.length === 0`
- One `.order-item` block per item containing:
  - Remove button (X icon, top-right)
  - Header showing category + description
  - Product dropdown (`<select>`) filtered by item category, populated from `FRAME_OPTIONS`, `BEAM_OPTIONS`, or `ACCESSORY_PRESETS`
  - Dimension inputs:
    - **Frames:** Height, Width, Depth (3-column grid). Height syncs to `lengthIn`.
    - **Beams:** Length, Weight/piece (2-column). Length syncs to `lengthIn`.
    - **Accessories:** Weight/piece, Length (2-column).
  - Quantity input
  - Frame items also get Weight/piece input
- Three "Add" buttons at the bottom: `+ Frame`, `+ Beam`, `+ Accessory`

**ID generation:** Uses a module-level counter `nextId` with `uid()` function producing `"item-1"`, `"item-2"`, etc.

**Preset application:** `applyPreset(itemId, presetId)` finds the matching `ProductOption`, merges its `defaults` into the `OrderItem`, and sets the description. For structural channel beams, it sets `weightPerPieceLbs = 0` to trigger auto-estimation.

### `LoadPlanResults.tsx`
**Props:** `plan: LoadPlan`, `selectedTrailer?: string`

Two sub-components:
- **`UtilBar`** — A small bar chart with label and percentage, coloured green (<70%), yellow (<90%), or red (≥90%).
- **`TruckCard`** — Collapsible card per truck. Header shows truck number, trailer label, bundle count, weight. Body shows weight/area utilisation bars and a bundle table.

Main component renders:
- Summary stats grid: trucks required, total bundles, total weight, trailer type
- Warning banner if `unplacedBundles.length > 0`
- One `TruckCard` per truck

### `TruckViewer3D.tsx`
**Props:** `truck: TruckLoad`

Uses `@react-three/fiber` `<Canvas>` and `@react-three/drei` components.

**Scale:** `SCALE = 0.01` → 1 inch = 0.01 Three.js units (keeps the scene manageable).

**Sub-components:**
- **`TrailerBed`** — Renders the trailer floor as a semi-transparent gray box + wireframe outline + dashed height limit line
- **`Bundles`** — Lays out bundles in rows:
  1. Sorts bundles by `lengthIn` descending
  2. Places bundles side-by-side widthwise (`z` axis) within the trailer width
  3. When a row overflows, advances lengthwise (`x` axis)
  4. Each bundle is a coloured box (solid + wireframe overlay) from a 10-colour palette
  5. Positions are computed via `useMemo` keyed on `[truck.bundles, maxWidth]`

**Camera:** positioned at `[centerX + 2, 2, centerZ + 3]` with 50° FOV, looking at trailer center.
**Controls:** `OrbitControls` for mouse-drag rotation/zoom/pan.
**Lighting:** ambient (0.6) + directional (0.8).
**Grid:** 10×20 gridHelper beneath the trailer.

---

## 11. Application Shell (`App.tsx`)

### State Variables

| Variable | Type | Purpose |
|----------|------|---------|
| `trailerType` | `TrailerType` | Currently selected trailer (default: `'53-flatbed'`) |
| `autoMode` | `boolean` | Whether auto-optimization is enabled (default: `false`) |
| `orderItems` | `OrderItem[]` | The user's order line items (default: `[]`) |
| `loadPlan` | `LoadPlan \| null` | The computed load plan result (default: `null`) |
| `selectedTrailerLabel` | `string` | Display label for the active trailer (default: `''`) |
| `viewingTruckIdx` | `number` | Which truck's 3D view is shown (default: `0`) |

### Event Handlers

- **`handleCalculate`** — Guards on `orderItems.length === 0`. If `autoMode`, calls `calculateOptimizedLoadPlan` and updates both the plan and the trailer type. Otherwise calls `calculateLoadPlan` with the selected trailer. Resets `viewingTruckIdx` to 0.
- **`handleReset`** — Clears all state to defaults.
- **`handleExportPDF`** — Calls `exportLoadPlanPDF(loadPlan, 'Racking Shipping Load Plan')`.

### Layout Structure

```
.app-container
├── .app-header (title + subtitle)
└── .main-grid (420px left | 1fr right)
    ├── Left column (.no-print)
    │   ├── TruckSelector
    │   ├── OrderForm
    │   ├── "Calculate Load Plan" button
    │   └── "Export PDF" + "Reset" buttons (shown after calculation)
    │
    └── Right column
        ├── .card "Load Plan Results"
        │   └── LoadPlanResults
        └── .card "3D Truck View"
            ├── Tab bar (if multiple trucks)
            └── TruckViewer3D
```

When no load plan exists, the right column shows an empty state with a Calculator icon.

---

## 12. Styling (`index.css`)

All styles are in `src/index.css` (imported by `main.tsx`). `App.css` exists but is empty.

### CSS Custom Properties (`:root`)
| Variable | Value | Usage |
|----------|-------|-------|
| `--color-bg` | `#f0f2f5` | Page background |
| `--color-surface` | `#ffffff` | Card backgrounds |
| `--color-primary` | `#1a56db` | Primary blue (buttons, selections, headings) |
| `--color-primary-hover` | `#1447b8` | Primary button hover |
| `--color-primary-light` | `#e8eefb` | Light blue (selected states, toggles) |
| `--color-danger` | `#dc2626` | Red (delete buttons, warnings) |
| `--color-success` | `#16a34a` | Green (utilisation bars <70%) |
| `--color-warning` | `#f59e0b` | Yellow (utilisation bars 70–90%) |
| `--color-text` | `#1f2937` | Primary text |
| `--color-text-secondary` | `#6b7280` | Labels, captions |
| `--color-border` | `#d1d5db` | Input borders |
| `--color-border-light` | `#e5e7eb` | Light dividers |
| `--radius` | `8px` | Card border radius |
| `--shadow` | subtle drop shadow | Card elevation |

### Key CSS Classes
| Class | Purpose |
|-------|---------|
| `.app-container` | Max-width 1400px centered layout with 24px padding |
| `.main-grid` | 2-column grid (420px + 1fr), responsive to 1-column at 960px |
| `.card` | White rounded card with shadow |
| `.btn`, `.btn-primary`, `.btn-danger`, `.btn-outline`, `.btn-sm`, `.btn-block` | Button variants |
| `.truck-options` | 2×2 grid for trailer selection |
| `.truck-option`, `.truck-option.selected` | Selectable trailer card |
| `.auto-select-toggle` | Checkbox toggle strip |
| `.order-item` | Bordered item block with relative positioning for X button |
| `.form-row`, `.form-row-3` | 2-column or 3-column input grids |
| `.summary-stats`, `.stat-card` | Summary statistics grid |
| `.truck-card`, `.truck-card-header`, `.truck-card-body` | Collapsible truck cards |
| `.utilisation-bar`, `.utilisation-fill.green/.yellow/.red` | Progress bars |
| `.bundle-table` | Compact data table |
| `.viewer-container` | 350px tall dark container for Three.js canvas |
| `.tab-bar`, `.tab`, `.tab.active` | Horizontal tab strip for multi-truck views |
| `.empty-state` | Centered placeholder text |
| `.no-print` | Hidden during `@media print` |
| `.action-bar` | Horizontal button group with gap |

---

## 13. Data Flow & State Management

The application uses **React `useState` only** — no external state library. All state lives in `App.tsx` and is passed down via props.

```
User Action Flow:
─────────────────

1. User clicks "+ Frame" in OrderForm
   → OrderForm calls onChange([...items, newItem])
   → App.tsx setOrderItems(newItems)

2. User selects a preset from dropdown
   → OrderForm.applyPreset() merges preset defaults into the OrderItem
   → OrderForm calls onChange(updatedItems)

3. User clicks "Calculate Load Plan"
   → App.handleCalculate()
   → algorithm.calculateLoadPlan(orderItems, trailerType)
       ├── orderItemsToBundles(items) → PackedBundle[]
       └── packBundlesOntoTrailers(bundles, trailerType) → LoadPlan
   → App.setLoadPlan(plan)

4. Load plan renders in right column
   → LoadPlanResults receives plan prop
   → TruckViewer3D receives truck prop (controlled by viewingTruckIdx)

5. User clicks "Export PDF"
   → pdfExport.exportLoadPlanPDF(loadPlan)
   → jsPDF generates and triggers browser download of "load-plan.pdf"
```

---

## 14. Industry Domain Knowledge

This section captures key racking industry facts embedded in the codebase, essential for making accurate modifications.

### Frame Types
- **Structural frames** use hot-rolled steel C-channel (C3x3.5, C4x4.5, C5x6.7). They are stronger, heavier, and used in high-impact environments.
- **Roll-formed frames** use cold-rolled steel coils (12–16 gauge) formed into profiles with 3" or 4" face widths. They are lighter and cheaper.

### Bundling Rules
- **Structural frames** are **reversed** (alternating 180° flip) in bundles — they cannot nest due to welded bracing and baseplates.
- **Roll-formed frames** **nest** — one column fits partially inside the next, reducing total height by a nesting offset (1.5–2.25" per piece).
- **Bundle quantities** vary by channel size and baseplate style (see tables in Section 7).

### Weight Estimation
- Frame weight is calculated as: `weightPerFoot × heightInFeet × 2 (uprights) × 1.3 (bracing/baseplate factor)`
- Step beam weight scales linearly from the 96" reference weights stored in `STEP_BEAM_WEIGHTS`

### Trailer Selection Rules
- Items longer than 32' require a 53' trailer (won't fit B-Train individual decks)
- Roll-formed/powder-coated items prefer enclosed trailers (closed van or roll-tite) to prevent weather damage
- Very heavy orders (>48,000 lbs) where items are short enough (≤28') benefit from B-Train's 90,000 lb capacity

### Dunnage
- 4" of vertical space is reserved between stacked bundles for wood dunnage / forklift access
- Each bundle starts with a 4" wood skid base

---

## 15. Known Limitations & Future Work

### Current Limitations
1. **Simplified bin packing** — The algorithm uses floor-area + weight constraints but does not track true 3D spatial positions. It cannot detect physical overlaps or optimize vertical stacking.
2. **No multi-deck assignment for B-Trains** — Bundles are placed based on combined deck area; the algorithm doesn't separately assign bundles to the lead vs. pup deck.
3. **Weight estimation is approximate** — Frame bracing factor is a flat 1.3×; roll-formed weight uses fixed lbs/ft estimates rather than exact gauge-based calculations.
4. **3D visualization is schematic** — Bundles are shown as coloured boxes in rows; they don't represent true nesting/reversing geometry.
5. **No persistence** — Orders are lost on page refresh. No database, local storage, or URL state.
6. **No user authentication** — The app runs entirely client-side with no login.
7. **ID generation** — `OrderForm.tsx` uses a module-level counter; IDs reset on hot reload during development.
8. **Accessory packaging** — Accessories are grouped into pallets of 40 with rough dimension estimates.
9. **No axle weight / center of gravity calculation** — Mentioned as a goal in the Analysis document but not yet implemented.

### Potential Enhancements
- **True 3D bin packing** — Implement a strip-packing or shelf algorithm that tracks exact (x, y, z) positions for each bundle.
- **B-Train deck splitting** — Assign bundles to lead and pup decks separately with individual weight/length constraints.
- **Center of gravity** — Calculate and display the CoG for each truck to assist with axle weight compliance.
- **Local storage persistence** — Save/restore orders using `localStorage` or IndexedDB.
- **SharePoint integration** — Wrap as an SPFx web part for native SharePoint embedding once SPFx scaffolding is added.
- **Strapping requirements** — Display the correct strap configuration per the height-based rules from the Analysis document.
- **More accurate weight estimation** — Allow users to specify steel gauge for roll-formed products; use per-gauge weight tables.
- **Order templates / saved configurations** — Let users save and reload common order patterns.
- **Print-optimized CSS** — The `@media print` rule hides `.no-print` but the results panel hasn't been specifically styled for print output.
- **Bundle labelling in 3D view** — Add text labels or tooltips to the 3D bundles for identification.
- **Multi-order comparison** — Allow comparing different order/trailer combinations side-by-side.
