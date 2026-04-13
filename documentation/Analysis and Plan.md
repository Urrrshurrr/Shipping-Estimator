# **Technical Analysis and Algorithmic Roadmap for the Industrial Racking Manufacturing and Logistics Sector**

> **Historical Context:** This document is retained as background research.
>
> **Not authoritative for runtime architecture:** The implemented app is Electron-first (not SPFx-first).
>
> **Not authoritative for bundle-count measurements:** physical bundle counts/dimensions are being re-verified and should come from current plant measurements before logic updates.

The industrial racking industry serves as the structural backbone of global commerce, providing the essential infrastructure required for the high-density storage and efficient throughput of goods. Within this sector, the manufacturing of racking components—specifically frames, beams, and associated hardware—is governed by a complex set of engineering standards, metallurgical constraints, and logistical variables. The transition toward automated, AI-driven logistical planning represents a pivotal advancement in operational efficiency. This report provides an exhaustive technical analysis of racking component specifications, packaging methodologies, and North American transportation regulations, culminating in a comprehensive guide for the development of a visualized computational agent designed to optimize truck-load planning.

## **1\. Structural Foundations and Metallurgical Specifications**

The manufacturing of industrial racking is fundamentally a discipline of structural engineering, where the selection of raw materials determines the safety and longevity of the entire warehouse system. The primary material utilized in the production of structural racking components is hot-rolled mild steel, typically conforming to ASTM A36 standards. This material is characterized by its predictable performance under load, with a minimum yield point of 36,000 psi and a tensile strength of 58,000 to 80,000 psi. These properties are essential for calculating the load-bearing capacities of frames and beams, but they also dictate the gravimetric profile of the components, which is the most critical variable in transportation planning.

### **1.1 Structural Channel Profiles**

In high-capacity applications, structural C-channel profiles are employed due to their superior rigidity and resistance to impact. These components are designated by their nominal depth and their weight per linear foot, a nomenclature that is vital for accurate logistical modeling.

| Channel Designation | Depth (Inches) | Weight per Foot (lbs) | Flange Width (Inches) | Web Thickness (Inches) |
| :---- | :---- | :---- | :---- | :---- |
| C3 x 3.5 | 3.0 | 3.5 | 1.372 | 0.132 |
| C4 x 4.5 | 4.0 | 4.5 | 1.584 | 0.184 |
| C5 x 6.7 | 5.0 | 6.7 | 1.750 | 0.190 |
| C6 x 8.2 | 6.0 | 8.2 | 1.920 | 0.200 |
| C8 x 11.2 | 8.0 | 11.2 | 2.260 | 0.220 |

The weight discrepancies between different channel weights of the same depth have profound implications for shipping. For example, an order utilizing C3 x 6.0 channel instead of C3 x 3.5 will result in a nearly 71% increase in the total weight of the frame members, potentially reducing the number of frames that can be carried on a single 53-foot flatbed before reaching the legal weight limit.

### **1.2 Roll-Formed Component Engineering**

Roll-formed components dominate the selective racking market due to their cost-efficiency and versatility. These components are manufactured from cold-rolled steel coils, typically ranging from 12-gauge to 16-gauge thickness. The mechanical properties of cold-rolled steel are enhanced through the roll-forming process, which introduces work-hardening at the bends of the profile.

#### **Upright Frame Profiles and Dimensions**

Roll-formed uprights are typically manufactured in face widths of either 3 inches or 4 inches. The depth of these frames is calculated based on the depth of the pallets they are intended to support. Standard industry heuristic dictates that the frame depth should be 6 inches less than the pallet depth to allow for a 3-inch overhang on both the front and rear.

#### **Step Beam Variations and Loading Capacity**

Step beams are horizontal load-bearing members with a recessed ledge—typically 1-5/8 inches—to support wire decking or cross-bars. The face height (or profile width) of the beam is the primary determinant of its capacity.

| Beam Profile (Inches) | Gauge | Capacity per Pair (96" Span) | Weight per Piece (96" Span) |
| :---- | :---- | :---- | :---- |
| 3.0 | 16 ga | 2,040 \- 3,020 lbs | 18.0 \- 20.0 lbs |
| 3.5 | 16 ga | 3,972 \- 4,190 lbs | 21.5 \- 23.0 lbs |
| 4.0 | 16 ga | 5,009 \- 5,450 lbs | 23.0 \- 32.4 lbs |
| 6.0 | 12/14 ga | 7,580 \- 9,897 lbs | 55.1 \- 59.2 lbs |

## **2\. Volumetric Analysis and Bundling Standards**

Shipping efficiency in the racking industry is a function of both weight and volume. Unlike raw steel channels, fabricated frames include bracing and baseplates that significantly alter their stacking geometry.

### **2.1 The Physics of Nesting vs. Reversing**

The AI agent must distinguish between the packing logic for roll-formed versus structural frames:

* **Roll-Formed Nesting:** Roll-formed uprights are often designed to nest, where one column fits partially inside the other. This reduces the total height of a bundle using a "nesting factor" or offset (typically 1.5 to 2.25 inches per frame).  
* **Structural Frame Reversing:** Structural channel frames (C3, C4, C5) do not nest like plain channel due to the interference of welded bracing and baseplates.1 To optimize space and stability, these frames must be **reversed** in bundles regardless of the total quantity.1 This means every other frame in the stack is flipped 180 degrees longitudinally.

### **2.2 Standardized Bundle Quantities**

The AI agent must utilize fixed bundle counts to calculate the number of discrete "shipping units" in an order. Standard quantities include:

| Component Type | Profile/Baseplate Detail | Pieces per Bundle |
| :---- | :---- | :---- |
| **Structural Frames** | C3 Structural 1 | 16 |
|  | C4 Structural (4 3/4" Baseplate) 1 | 12 |
|  | C4 Structural (8" Baseplate/Double Leg) 1 | 11 |
| **Roll-Formed Frames** | 3.5" or 4 1/4" Baseplate 1 | 20 |
|  | 8" Baseplate/Double Leg 1 | 14 |
| **Beams** | Step Beams (3" to 5 1/8" deep) 1 | 96 |
|  | Box Beams (1 1/2" to 5 1/4" deep) 1 | 100 |
|  | Channel Beams (3" & 4") 1 | 100 |
|  | Channel Beams (5" & 6") 1 | 46 |

### **2.3 Strapping and Safety Compliance**

Bundle stability is maintained through specific strapping requirements determined by the height of the frame 1:

* **96" or less:** 2 End Straps, 1 Mid Strap.  
* **108" to 180":** 2 End Straps, 1 Mid Strap, 1 Top Safety Strap (Structural adds 2 Top Safety Straps).  
* **192" and over:** 2 End Straps, 1 Mid Strap, 2 Safety Straps.  
* **Blocking:** Wood blocking and strapping must not protrude past the product in the bundle to ensure tight side-by-side loading.1

## **3\. Transportation Infrastructure and Regulatory Framework**

| Trailer Type | Deck Length | Legal Width | Max Payload Capacity |
| :---- | :---- | :---- | :---- |
| 53' Flatbed | 53' | 102" | 48,000 lbs |
| 53' Roll-tite | 53' | 100" (Internal) | 44,000 \- 45,000 lbs |
| B-Train (Ontario) | 28' Lead / 32' Pup | 102" | 85,000 \- 95,000 lbs |
| 53' Closed Van | 53' | 98" \- 101" | 42,000 \- 45,000 lbs |

## **4\. Computational Logic for the AI Programming Agent**

### **4.1 Environment Architecture**

The application should be a React-based web part using the SharePoint Framework (SPFx). 3D visualization is achieved through react-three-fiber and Three.js.

### **4.2 The Core Packing Algorithm**

The AI agent must implement a multi-stage packing heuristic:

1. **Weight-Based Layering:** Heavy structural bundles (C8 beams, C5 frames) are placed on the trailer floor to ensure a low center of gravity.  
2. **Bundle Calculation:** The agent must divide the total order quantity by the "Standard Pieces per Bundle" for each specific profile.  
3. **Orientation Logic:** For structural frames, the visualization should render bundles with "Reversed Stacking" (alternating frame directions) to accurately represent bundle height and width.1  
4. **Spatial Filling (3D Bin Packing):**  
   * **Lengthwise Placement:** Components must be placed parallel to the trailer bed.  
   * **Dunnage Allowance:** The algorithm must reserve 3.5 to 4 inches of vertical space between stacked bundles for wood dunnage/forklift access.

### **4.3 Automated Truck Selection**

If automatic optimization is enabled, the AI selects the truck type based on:

* **Density:** Orders over 48,000 lbs with short lengths (\<32') prioritize B-Trains.  
* **Protection:** Powder-coated roll-formed components default to Roll-tite or Closed Van to prevent weather damage and finish chipping.2  
* **Dimensions:** Uprights over 32' default to 53' flatbeds, as they cannot fit on B-Train "lead" or "pup" decks separately.

## **5\. PDF Export and Load Documentation**

The final output must provide a high-resolution PDF load plan including:

* **3D Visual Snapshot:** A clear image of each trailer's layout.  
* **Manifest:** A list of bundles per truck, citing quantity, weight, and component type (e.g., "12x C4 Structural Frames").  
* **Center of Gravity:** A calculated CoG to assist drivers in meeting axle weight regulations.

#### **Works cited**

1. STR Frame 1.pdf  
2. Conestoga Trailer \- A Shippers Definitive Guide \- Paige Logistics, accessed March 11, 2026, [https://www.paigelogistics.com/blog/conestoga-trailer/](https://www.paigelogistics.com/blog/conestoga-trailer/)