# Competitive Analysis & Feature Improvement Roadmap

## TL;DR

After analyzing 4 competing platforms (Cargo-Planner, EasyCargo, Goodloading, CubeMaster/Logensol) and comparing them against the current NASECO Shipping Estimator, this plan identifies 6 priority improvement phases across 25 implementation steps. The biggest competitive differentiator is **automated quote-to-load-plan generation** from Business Central PDF/Excel uploads — a capability no competitor offers. Other high-value gaps include interactive 3D editing, axle weight distribution, step-by-step loading instructions, and persistent product/plan libraries.

---

## Competitive Landscape Analysis

### 1. Cargo-Planner (cargo-planner.com)

- **Pricing:** $59–$99/mo (Lite/Standard), Enterprise custom
- **Strengths we lack:**
  - **Interactive planner mode** — drag cargoes between containers, reorder within the same container, unload/reload from sidebar
  - **Axle weight limitations** — front/rear axle group constraints with automatic cargo reorganization
  - **Routing / multi-stop** — cargoes assigned to destinations, auto-optimized load order for sequential drop-offs
  - **Custom container builder** — add/remove walls, doors, shelves, custom contours, multi-axle configurations
  - **Road trains / set builder** — configurable multi-trailer combinations
  - **Cargo Library / SKU database** — persistent product catalog with single-click import
  - **Excel import/export** and API integration
  - **Shareable URL links** for load plans
  - **Step-by-step loading instructions** — grouped by number or layer-by-layer
  - **Annotations** — loading/handling instructions on the plan
  - **Calendar view** — recurring schedules for shipments
  - **Segregation table** — items that cannot be stored together
  - **Quantity recommendations** — "how many can fit" mode + filler items for remaining space
  - **Custom rules engine** — which cargoes support which, loading order constraints
  - **Priority / consignment grouping** — ensure groups stay on the same truck

### 2. EasyCargo (easycargo3d.com)

- **Pricing:** $9.70/day ticket, $79/mo, $799/yr
- **Strengths we lack:**
  - **Manual load plan editor** — drag & drop with auto-snap alignment in 3D
  - **Descriptions shown directly on 3D boxes**
  - **Non-stackable groups** and virtual wall dividers
  - **Priority groups** for sorting by destination
  - **Excel import template** + **Excel export** of results
  - **API interface** for system-to-system integration
  - **SAP ERP integration** (via status-c)
  - **make.com integration** for workflow automation
  - **Adjustable loading size** (create overhangs for oversized cargo)
  - **Step-by-step load report** — exact loading sequence
  - **Print reports from any 3D viewpoint** — including inside the container
  - **Axle weight distribution** verification with compliance checks
  - **Multi-cargo space** step-by-step planning (load across multiple trucks in sequence)
  - **Cargo items database** — persistent item storage
  - **Public link sharing** for interactive 3D load plans

### 3. Goodloading (goodloading.com)

- **Pricing:** Free demo, paid subscription
- **Strengths we lack:**
  - **Axle load compliance** — loading in accordance with maximum capacity and axle loads
  - **Angled load placement** — arrange loads at angles
  - **Multistops** — multiple loading/unloading locations, goods separated by destination
  - **Space recommendation** — program suggests which vehicle from your fleet is best
  - **Load summary** showing remaining space in m²/m³/LDM for taking additional cargo
  - **Loading animation** — animated sequence showing how to load
  - **Share as link or PDF** with visible loading sequence
  - **Stacking functionality** — extensive rules for faster, safer placement

### 4. CubeMaster / Logensol (logensol.com)

- **Pricing:** Windows desktop app, free 30-day trial, online SaaS version
- **Strengths we lack:**
  - **Palletizing before loading** — auto-builds pallet loads from loose items, then loads pallets into trailers
  - **Carton optimization** — finds best boxes from standard sizes for order picking
  - **Set Load mode** — maintains relational ratios between multi-component products
  - **Unit Load mode** — calculates max full-load quantity (no quantity input needed)
  - **External DBMS Import Wizard** — connects to MS SQL, Oracle, DB2 for direct order import
  - **Excel/CSV Import Wizard** with field mapping
  - **Export to Excel, PDF, HTML, XML, and database**
  - **SDK & API** for embedding optimization engine in external apps (ERP, WMS, SAP)
  - **Multiple vehicle type optimization** — finds best combination of different truck types
  - **Special equipment** — Open Top, Goose-Neck, Center-Beam, Railcar, Flat Rack
  - **ISO standard built-in database** for trucks/containers/pallets

---

## Feature Gap Summary (Our App vs. Competitors)

| Feature | Us | Cargo-Planner | EasyCargo | Goodloading | CubeMaster |
|---|:---:|:---:|:---:|:---:|:---:|
| Quote/order file upload → auto load plan | **Yes** | — | — | — | — |
| Interactive 3D drag-drop editing | **Yes** | Yes | Yes | — | Yes |
| Axle weight distribution | **Yes** | Yes | Yes | Yes | — |
| Step-by-step loading instructions | — | Yes | Yes | Yes | — |
| Persistent product/SKU library | — | Yes | Yes | — | Yes |
| Excel import/export | **Yes** | Yes | Yes | Yes | Yes |
| Shareable URL/link for plans | — | Yes | Yes | Yes | Yes |
| Multi-stop routing | — | Yes | — | Yes | — |
| Custom vehicle builder | — | Yes | — | — | Yes |
| API for external integration | — | Yes | Yes | Yes | Yes |
| Save/load plans | **Yes** | Yes | Yes | Yes | Yes |
| Bundle labels on 3D view | **Yes** | Yes | Yes | — | Yes |
| Stacking constraints UI | — | Yes | Yes | Yes | Yes |
| Priority/destination grouping | — | Yes | Yes | Yes | — |
| PDF export with 3D views | Partial | Yes | Yes | Yes | Yes |
| Industry-specific bundling logic | **Yes** | — | — | — | — |
| NASECO product knowledge | **Yes** | — | — | — | — |
| B-Train / Canadian trailer support | Partial | — | — | — | — |

**Key insight:** Our **industry-specific bundling intelligence** (N,N,N-1 frame patterns, nesting vs. reversing, dunnage rules, weight-based dynamic bundle sizing) is a genuine competitive advantage that no general-purpose tool replicates. The quote upload feature would be **completely unique** in this space.

---

## Implementation Phases

### Phase 1: Quote Upload & Auto-Parse (HIGHEST PRIORITY — Unique Differentiator) ✅ COMPLETED

*No competitor offers this. This is our biggest opportunity.*

1. ~~**Build PDF parser** for NASECO Business Central sales quotes using pdf.js (client-side)~~ ✅
   - ~~Extract header fields: quote number, customer, ship-to, date, total weight~~ ✅
   - ~~Extract line item table: No., Description, Quantity, Colour, Weight, Net Price, Line Amount~~ ✅
   - ~~Handle multi-page quotes (QMM8163 spans 3 pages)~~ ✅
   - ~~Filter out service lines (9197 Installation, 9198 Freight, 9195 Engineering, etc.)~~ ✅

2. ~~**Build Excel parser** for Business Central exported .xlsx files using SheetJS~~ ✅
   - ~~Parse the Lines spreadsheet format from the attached template~~ ✅
   - ~~Map column headers to OrderItem fields~~ ✅

3. ~~**Create product-number-to-category mapping table** in `app/src/data.ts`~~ ✅
   - From the 4 sample quotes, known mappings include:
     - **Frames:** 901, 902, 903 (structural), 301, 302 (EF413), KN301 (KN433)
     - **Beams:** 3443 (step beam), 3442 (step beam), 3352 (step beam), 3446S (structural beam), 915 (structural beam), 3268 (seamweld beam), 930 (floor support)
     - **Accessories:** 3584 (wedge anchors), 3595 (wedge anchors), 3877 (shims), 3241 (safety pins), 3604FG (safety bars), 3690S (wire decks), 3524G/3523G/3529G/3528G (row spacers), 3905/3912 (end-of-aisle guards), 970/971/972 (tunnel guards), 3948 (post protectors), 931 (angle connections), 3495/3593/3586/3590 (bolts), 3984S (seismic footplates)
   - Extensible via Product Data Reference.xlsx once filled out

4. ~~**Auto-populate OrderForm** from parsed data — map each recognized line to an OrderItem with correct category, dimensions from description parsing (e.g., "42" X 408"" → width=42, height=408)~~ ✅

5. ~~**One-click workflow**: Upload button → file picker → parse → populate form → user reviews → Calculate~~ ✅

**Implementation notes (completed March 30, 2026):**
- Created `app/src/quoteParser.ts` — PDF text extraction (pdfjs-dist v5.6) + Excel parsing (xlsx/SheetJS) + description parsing with column-position-based table extraction
- Added `PRODUCT_CATALOG` to `app/src/data.ts` — 40+ product mappings with category, frame/beam type, channel designation, bundle keys, and default weights
- Added `ParsedQuote`, `ParsedLineItem`, `ProductMapping` interfaces to `app/src/types.ts`
- Updated `app/src/components/OrderForm.tsx` with "Upload Quote" button accepting .pdf/.xlsx/.xls/.csv files, with import status feedback
- Updated `app/src/App.tsx` to wire quote upload handler
- Tested all 4 sample PDFs (QMM8017: 13 items, QMM8163: 29 items multi-page, QDG9180: 15 items, QWU1550: 12 items) and Excel file (12 items) — all parse correctly
- End-to-end verified: Upload → Parse → Auto-populate → Calculate → Load Plan generated successfully

### Phase 2: Interactive 3D Editing & Manual Adjustments ✅ COMPLETED

*Cargo-Planner and EasyCargo both offer this — it's expected by users.*

6. ~~**Bundle selection** — click a bundle in 3D view to highlight it and show info panel (component name, weight, dimensions, piece count)~~ ✅
7. ~~**Bundle labels** — render description text on 3D bundle boxes (like EasyCargo)~~ ✅
8. ~~**Drag-and-drop repositioning** — move bundles within a truck with auto-snap to grid and collision detection~~ ✅
9. ~~**Cross-truck reassignment** — drag bundles between truck tabs or use a sidebar panel to reassign~~ ✅

**Implementation notes (completed March 30, 2026):**
- Rewrote `app/src/components/TruckViewer3D.tsx` with new architecture: `BundleMesh` (per-bundle rendering), `BundlesScene` (drag/selection management), `computeBundlePositions` (extracted layout algorithm)
- **Bundle selection**: Click any bundle to highlight it (blue glow + emissive lighting). Info panel overlay shows description, category, pieces, weight, and dimensions. Click trailer bed or press Escape to deselect.
- **Bundle labels**: `Text` from `@react-three/drei` renders description + piece/weight details on top face of each bundle, auto-sized relative to bundle dimensions, with outline for readability.
- **Drag-and-drop**: Click-to-select, then click-and-drag to reposition. Uses invisible drag plane at bundle Y-level with raycaster intersection. 1-inch snap grid. Clamped to trailer bounds. AABB collision detection on drop prevents overlap — invalid drops revert to original position. OrbitControls auto-disabled during drag.
- **Cross-truck reassignment**: Info panel shows "Move to: Truck #N" buttons when multiple trucks exist. Validates weight capacity before transfer. Auto-removes empty trucks and re-indexes. View auto-switches to target truck after move.
- Added `id: string` to `PackedBundle` type, generated as `b-0`, `b-1`, etc. in `orderItemsToBundles()`
- Added `bundlePositions?: Record<string, {x,y,z}>` to `TruckLoad` for manual position overrides
- Updated `App.tsx` with selection state, position override tracking, and `handleMoveBundleToTruck` with stat recalculation
- Updated `LoadPlanResults.tsx` with clickable bundle rows and selection highlighting
- Added CSS styles for `.bundle-info-panel`, `.info-row`, `.move-buttons`, `.badge`, `.selected-row`

### Phase 3: Axle Weight & Center of Gravity ✅ COMPLETED

*All 3 web-based competitors offer this — it's a safety/compliance feature.*

10. ~~**Center of gravity calculation** — for each truck, compute longitudinal CG based on bundle positions and weights~~ ✅
11. ~~**Axle weight distribution** — given trailer geometry (kingpin position, axle positions), calculate front/rear axle loads using moment balance~~ ✅
12. ~~**Visual overlay** — weight distribution bar chart below 3D view (like EasyCargo's diagram)~~ ✅
13. ~~**Compliance warnings** — red alert when axle weight exceeds legal limits~~ ✅

**Relevant files:**
- `app/src/algorithm.ts` — Add `calculateAxleWeights()` and `calculateCenterOfGravity()` functions
- `app/src/data.ts` — Add axle position data to `TrailerSpec` (kingpin offset, rear axle offset)
- `app/src/components/LoadPlanResults.tsx` — Add weight distribution visualization

**Implementation notes (completed March 30, 2026):**
- Added `kingpinPositionIn`, `rearAxlePositionIn`, `maxKingpinWeightLbs`, `maxAxleWeightLbs` to `TrailerSpec` in `app/src/types.ts`
- Added B-train specific `pupAxlePositionIn` and `pupMaxAxleWeightLbs` fields
- Added `CenterOfGravity` and `AxleWeightResult` interfaces to `app/src/types.ts`
- Updated all 4 trailer specs in `app/src/data.ts` with real-world axle geometry: kingpin at front, rear axle ~100" from rear of deck, 12,000 lb kingpin limit, 34,000 lb tandem axle limit
- Added `computeBundleLayoutPositions()` to `app/src/algorithm.ts` — re-computes bundle positions using the same greedy row/stack logic as the packing algorithm, respects manual drag-and-drop overrides
- Added `calculateCenterOfGravity()` — computes weighted average of bundle CG positions (longitudinal, lateral, vertical) relative to deck origin
- Added `calculateAxleWeights()` — moment balance about rear axle: R_kp = totalWeight × (axle - CG_x) / (axle - kp), R_rear = totalWeight - R_kp. Returns utilisation percentages and overweight flags
- Added `WeightDistributionDiagram` SVG component in `LoadPlanResults.tsx` — shows trailer side profile with kingpin/axle positions, CG marker (yellow triangle), weight values at each support point, color-coded green/red for compliance
- Added `axle-warning` component — red alert box with AlertTriangle icon when any axle exceeds its weight limit, with actionable advice ("move cargo toward the rear/front")
- Added CSS styles for `.weight-distribution-diagram` and `.axle-warning` in `app/src/index.css`

### Phase 4: Loading Instructions & Enhanced Reports ✅ COMPLETED

*Step-by-step reports are offered by Cargo-Planner, EasyCargo, and Goodloading.*

14. ~~**Loading sequence generation** — number bundles in placement order with position descriptions ("Row 1, left side, floor level")~~ ✅
15. ~~**Step-by-step PDF section** — numbered instructions with mini-diagrams showing where each bundle goes~~ ✅
16. ~~**Multi-viewpoint 3D snapshots** — capture front, side, top, and perspective views for PDF~~ ✅
17. ~~**Branded PDF template** — company logo, quote reference number, customer name/address, sign-off line~~ ✅

**Relevant files:**
- `app/src/pdfExport.ts` — Add step-by-step pages, multi-view captures, header/footer branding
- `app/src/algorithm.ts` — Add `generateLoadingSequence()` method that returns ordered steps

**Implementation notes (completed March 30, 2026):**
- Added `LoadingStep` interface to `app/src/types.ts` — step number, bundle, position, row/layer info, human-readable position description
- Added `generateLoadingSequence()` to `app/src/algorithm.ts` — computes layout positions, sorts floor-level first then stacked, assigns row numbers and lateral/vertical position descriptions (e.g., "Row 1, left side, floor level", "Row 2, center, stacked (2nd level)")
- Rewrote `app/src/pdfExport.ts` with enhanced PDF export:
  - **Branded header**: NASECO company name with blue branding, coloured header bar, page footers on every page with "NASECO Shipping Estimator" branding and page numbers
  - **Quote metadata**: Two-column layout showing quote reference, customer name, ship-to address, date, and salesperson when a quote was uploaded
  - **Per-truck loading instructions**: Numbered step sequence with blue step-number circles, component descriptions, position descriptions, and weight
  - **Top-view mini-diagram**: SVG-style rendering of each truck's floor plan showing bundle positions with color-coded rectangles, step numbers, and floor/stacked legend. Dashed outlines for stacked bundles
  - **3D viewport snapshot**: Captures current camera angle perspective view with caption
  - **Axle weight info**: Kingpin and rear axle weights with compliance coloring (green/red) and CG position shown in each truck section
  - **Sign-off section**: "Prepared by" and "Approved by" signature lines with date fields
  - **Smart filename**: PDF named `load-plan-{quoteNumber}.pdf` when a quote was uploaded
- Updated `app/src/App.tsx` — stores `ParsedQuote` in state, passes it to `exportLoadPlanPDF()` via new options interface
- Added `LoadingSequenceSection` component to `app/src/components/LoadPlanResults.tsx` — collapsible "Show/Hide Loading Instructions" panel inside each truck card showing the loading sequence table with step badges, position descriptions, and stacked indicators
- Added CSS for `.step-badge` (numbered circle) and `.badge-info` (blue badge for stacked indicator) in `app/src/index.css`

### Phase 5: Product Library & Plan Persistence ✅ COMPLETED

*Every competitor offers save/load and product databases.*

18. ~~**Persistent product library** — save custom products to localStorage/IndexedDB, quick-add to orders~~ ✅
19. ~~**Plan save/load** — auto-save current plan, named plan management with list view~~ ✅
20. ~~**Excel import for orders** — map Excel columns to OrderItem fields (not just quote format, also generic)~~ ✅
21. ~~**Excel export of results** — export load plan as structured spreadsheet (truck assignments, bundle details, utilization)~~ ✅

**Relevant files:**
- New: `app/src/storage.ts` — localStorage wrapper with plan and product library CRUD
- New: `app/src/components/ProductLibrary.tsx` — UI for managing saved products
- New: `app/src/components/SavedPlans.tsx` — UI for saving, loading, and deleting named plans
- New: `app/src/components/GenericExcelImport.tsx` — Generic Excel import with column mapping dialog
- New: `app/src/excelExport.ts` — Export load plan results to structured Excel workbook
- `app/src/components/OrderForm.tsx` — "Import from library" button, generic Excel import button
- `app/src/App.tsx` — Plan persistence state management, auto-save/restore, Excel export button

**Implementation notes (completed March 30, 2026):**
- Created `app/src/storage.ts` — localStorage CRUD for three scopes:
  - **Product Library** (`naseco-product-library`): `LibraryProduct` records with name, category, and OrderItem defaults. Functions: `loadProductLibrary()`, `saveProductLibrary()`, `addProductToLibrary()`, `removeProductFromLibrary()`, `updateProductInLibrary()`
  - **Saved Plans** (`naseco-saved-plans`): `SavedPlan` records containing full order state (trailer type, auto mode, order items, load plan, parsed quote). Functions: `loadSavedPlans()`, `savePlan()`, `deleteSavedPlan()`
  - **Auto-save** (`naseco-autosave`): single `AutoSaveState` object automatically persisted on every state change. Functions: `loadAutoSave()`, `saveAutoSave()`, `clearAutoSave()`
- Created `app/src/components/ProductLibrary.tsx` — collapsible panel inside OrderForm:
  - Shows library item count on button badge
  - "Save Current Item to Library" form (select an order item, enter name, save)
  - Quick-add list with "Add" button to insert library product into order with defaults pre-filled
  - Remove button to delete products from library
  - Selected order item highlighting with blue border via `.order-item-selected` CSS class
- Created `app/src/components/SavedPlans.tsx` — Save/Load plan management:
  - "Save Plan" button opens inline name input, auto-suggests name from quote number or date
  - "Load Plan" button toggles saved plans list with name, timestamp, item/truck counts
  - Click any saved plan to restore full application state (trailer type, order items, load plan, quote data)
  - Delete button to remove saved plans
- Created `app/src/components/GenericExcelImport.tsx` — generic Excel column mapping:
  - File picker for .xlsx/.xls/.csv files
  - Sheet selector (when workbook has multiple sheets)
  - Auto-detects column names and auto-maps common field names (description, quantity, weight, length, category)
  - Manual column mapping UI with five fields: Description*, Quantity*, Weight, Length, Category
  - Data preview table showing first 5 rows
  - Import button creates OrderItem[] from mapped columns and appends to current order
- Created `app/src/excelExport.ts` — multi-sheet Excel workbook export:
  - **Summary** sheet: quote reference, customer info, truck/bundle/weight totals
  - **Bundle Details** sheet: all bundles across all trucks — truck #, trailer type, component, category, pieces, weight, dimensions, partial flag
  - **Truck Utilization** sheet: per-truck weight/area utilisation percentages, axle weights, kingpin/rear utilisation, CG position
  - **Loading Sequence** sheet: step-by-step instructions per truck — component, pieces, weight, position description, row, stacked flag
  - Smart filename: `load-plan-{quoteNumber}.xlsx` when quote was uploaded
- Updated `app/src/App.tsx`:
  - Auto-save on mount restore: loads last working state from localStorage on page load
  - Auto-save effect: persists state whenever trailerType, autoMode, orderItems, loadPlan, or parsedQuote change
  - Integrated `SavedPlans` component between OrderForm and action buttons
  - Added `handleLoadSavedPlan()` — restores all state from a saved plan
  - Added `handleExportExcel()` — triggers Excel workbook download
  - Added "Export Excel" button with FileSpreadsheet icon next to Export PDF
  - `handleReset()` now calls `clearAutoSave()` to clear persisted state
- Updated `app/src/components/OrderForm.tsx`:
  - Added `ProductLibrary` component in action bar alongside add buttons
  - Added `GenericExcelImport` component next to "Upload Quote" button
  - Added `selectedItemId` state for product library save-to-library feature
  - Click-to-select order items (highlighted with `.order-item-selected` class)
  - Added `addItemFromLibrary()` handler for library quick-add
- Added CSS in `app/src/index.css`:
  - `.product-library-panel`, `.product-library-list`, `.product-library-item` styles
  - `.saved-plans-section`, `.saved-plans-list`, `.saved-plan-item` styles
  - `.excel-import-overlay`, `.excel-import-dialog` modal overlay styles
  - `.order-item-selected` blue border highlight for selected items

### Phase 6: Advanced Constraints & Configuration ✅

*These are power-user features that round out the platform.*

22. **Custom trailer definitions** ✅ — UI form to create/edit trailer specs (dimensions, axle positions, payload)
23. **B-Train multi-deck splitting** ✅ — separate lead (28') and pup (32') deck assignment in algorithm
24. **Stacking constraints UI** ✅ — per-item flags: non-stackable, max stack weight, orientation lock, keep upright
25. **Strapping requirement display** ✅ — auto-calculate and show required straps per bundle based on height rules from Analysis and Plan.md

**Implementation notes:**
- **#22:** Relaxed `TrailerType` to accept custom strings. Added `TrailerEditor` component in TruckSelector with full form (deck length, payload, width, height, kingpin/axle positions, multi-deck toggle). Custom trailers persist in localStorage via `storage.ts`. All `TRAILER_SPECS[...]` lookups replaced with `getAllTrailerSpecs()` or `resolveTrailer()`.
- **#23:** `StackSlot` now tracks `deckIndex`. `getDecks()` returns `{ startIn, lengthIn }[]`. Packing and layout functions iterate per-deck when placing new rows, preventing bundles from spanning deck boundaries on multi-deck trailers.
- **#24:** Added `nonStackable`, `maxStackWeightLbs`, `keepUpright`, `orientationLock` fields to `OrderItem`. Constraint toggles added to OrderForm UI. Algorithm enforces constraints in both `tryPlaceBundleWithStacking()` and `computeBundleLayoutPositions()`. Constraint badges shown in LoadPlanResults loading sequence table.
- **#25:** Added `calculateStrappingRequirements(bundle)` to algorithm.ts implementing height-based rules (≤96": 2E+1M, 108–180": +1S or +2S for structural, ≥192": +2S). Strapping column added to loading sequence table in LoadPlanResults. Strapping summary badges shown per truck. Strapping columns added to PDF export bundle table and Excel export Bundle Details sheet.

**Files modified:**
- `app/src/types.ts` — `TrailerType` relaxed, stacking constraint fields, `StrappingRequirement` interface, `frameType` on `PackedBundle`
- `app/src/data.ts` — `getAllTrailerSpecs()` merges built-in + custom trailers
- `app/src/storage.ts` — Custom trailer CRUD (`loadCustomTrailers`, `saveCustomTrailers`, `addCustomTrailer`, `updateCustomTrailer`, `deleteCustomTrailer`)
- `app/src/algorithm.ts` — `resolveTrailer()`, deck-aware packing, stacking constraint enforcement, `calculateStrappingRequirements()`
- `app/src/components/TruckSelector.tsx` — Rewritten with `TrailerEditor` component
- `app/src/components/OrderForm.tsx` — Stacking constraint toggles (non-stackable, keep upright, lock orientation, max stack weight)
- `app/src/components/LoadPlanResults.tsx` — Constraint badges, strapping column in loading sequence, strapping summary section
- `app/src/pdfExport.ts` — Strapping column in bundle table
- `app/src/excelExport.ts` — Strapping columns (end, mid, safety, total) in Bundle Details sheet
- `app/src/index.css` — Trailer editor, constraint toggle, strapping badge/summary styles

**Relevant files:**
- `app/src/data.ts` — Make trailer specs editable, add strapping rules
- `app/src/algorithm.ts` — B-Train deck splitting logic, stacking constraint enforcement
- `app/src/components/TruckSelector.tsx` — Custom trailer editor UI

---

## Quote Format Analysis (for Phase 1 Implementation)

From the 4 sample PDFs, Business Central quotes follow a consistent structure:

**Header pattern:**
```
Sales Quote
{QuoteNumber}
...
Document Date    Salesperson    Payment Terms    Shipment Method
{date}           {name}         Net 30 days
Valid to         Total Weight                    F.O.B
{date}           {weight}                        WHITBY COLBORNE
```

**Line item table pattern (consistent columns):**
```
No.  Description  Quantity  Colour  Weight  Net Price  Line Amount
```

**Service lines to filter out** (weight = 0, no physical product):
- 9197 (Installation), 9198 (Freight), 9195 (Engineering), 970 with "PERMIT FEE", 0001 (Engineering Drawing), 0003 (Installation Drawing)

**Duplicate product numbers:** Some quotes have the same product number appearing twice (e.g., 3584 WEDGE ANCHORS appears twice in QDG9180 and QMM8017). Parser must aggregate or keep as separate line items.

**Description parsing for dimensions:** Frame descriptions include dimensions like "48" X 216"" or "42" X 408"" — parser can extract width × height from these patterns.

---

## Verification Plan

1. **Quote parsing accuracy:** Upload each of the 4 sample PDF quotes → verify every line item is correctly parsed (quantity, weight, description match original)
2. **Excel parsing:** Upload Lines (2).xlsx → verify parsed output matches PDF equivalent
3. **End-to-end test:** Parse quote → auto-populate order → calculate load plan → verify trucks assigned with valid weight/dimension constraints
4. **3D editing:** Drag a bundle to new position → verify constraints still hold (weight, height, width)
5. **Axle weights:** Create known load → verify axle distribution matches hand calculation
6. **PDF quality:** Export branded PDF with step-by-step instructions → compare against EasyCargo/Cargo-Planner report quality
7. **Persistence:** Save plan → close browser → reopen → verify full plan restoration

---

## Decisions & Scope

- **Client-side only:** Maintain the zero-backend architecture — use pdf.js and SheetJS for client-side file parsing
- **Product Data Reference.xlsx:** Will ultimately be the master product catalog. Until filled out, use mappings extracted from the 4 sample quotes as seed data
- **No user auth initially:** Continue as a single-user local tool; multi-user/cloud features are out of scope
- **No API initially:** Focus on the standalone web app first; API integration (like competitors offer) is a future phase
- **No multi-stop routing:** Out of scope — NASECO ships from one factory (Whitby Colborne), not multi-destination
- **No air/sea/pallet modes:** Only road trailers are relevant to this business

---

## Further Considerations

1. **Product Data Reference.xlsx format:** The Excel product catalog needs a defined schema — recommend columns: Product Number, Description, Category (frame/beam/accessory), Bundle Size, Weight/Piece, Dimensions (L×W×H), Channel Spec, Stacking Type. Should we define this schema now or wait until the user fills it out?

2. ~~**Offline PWA capability:** Since this tool runs client-side, adding a service worker for offline use would let warehouse staff use it on shop floor tablets without internet. This is low effort and high value.~~ ✅ COMPLETED

**Implementation notes (completed March 30, 2026):**
- Created `app/public/manifest.json` — web app manifest with app name, theme color (#2563eb), standalone display mode, and SVG icons (192px, 512px, maskable)
- Created `app/public/icon-192.svg`, `app/public/icon-512.svg`, `app/public/icon-maskable.svg` — truck-themed PWA icons with cargo boxes
- Created `app/public/sw.js` — service worker with stale-while-revalidate strategy:
  - Pre-caches core shell on install (index.html, manifest, icons, pdf worker)
  - Runtime-caches all same-origin GET requests (Vite hashed assets cached on first load)
  - Serves from cache first for instant offline loads, background-updates cache when online
  - Versioned cache name (`naseco-ship-estimator-v1`) with automatic old-cache cleanup on activate
  - `skipWaiting()` + `clients.claim()` for immediate activation
- Updated `app/index.html` — manifest link, theme-color meta, apple-touch-icon, proper title, inline SW registration script with periodic update checks (every 60 minutes) and `sw-updated` custom event dispatch
- Updated `app/src/App.tsx` — online/offline status indicator (Wifi/WifiOff icons) in header, SW update banner with reload button
- Updated `app/src/index.css` — `.online-indicator` pill (green online, amber offline), `.sw-update-banner` styles, header flexbox layout for indicator positioning
- **Full offline workflow**: Load app once while online → all assets cached → works completely offline including quote upload, calculation, PDF/Excel export, and 3D viewing

3. **Quote format versioning:** The Business Central quote format may change over time. Consider building the parser with configurable column mapping rather than hardcoded regex, so it can adapt to format changes without code updates.
