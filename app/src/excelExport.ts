import * as XLSX from 'xlsx';
import type { LoadPlan, ParsedQuote } from './types';
import { generateLoadingSequence, computeBundleLayoutPositions, calculateAxleWeights, calculateStrappingRequirements } from './algorithm';
import { TRAILER_SPECS, getAllTrailerSpecs } from './data';

interface ExcelExportOptions {
  quote?: ParsedQuote;
}

function sanitizeFilenamePart(input: string): string {
  const blocked = '<>:"/\\|?*';
  return input
    .split('')
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code < 32 || blocked.includes(ch) ? '-' : ch;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function exportLoadPlanExcel(plan: LoadPlan, options: ExcelExportOptions = {}): void {
  const wb = XLSX.utils.book_new();

  // ============================================================
  // Sheet 1: Summary
  // ============================================================
  const summaryData: unknown[][] = [
    ['NAS — Shipping Load Plan'],
    [],
  ];

  if (options.quote) {
    const q = options.quote;
    const customer = q.customerName ?? q.shipToName;
    if (q.quoteNumber) summaryData.push(['Quote Reference', q.quoteNumber]);
    if (customer) summaryData.push(['Customer', customer]);
    if (q.shipToAddress) summaryData.push(['Ship To', q.shipToAddress]);
    if (q.documentDate) summaryData.push(['Date', q.documentDate]);
    if (q.salesperson) summaryData.push(['Salesperson', q.salesperson]);
    summaryData.push([]);
  }

  summaryData.push(
    ['Trucks Required', plan.trucks.length],
    ['Total Bundles', plan.totalBundles],
    ['Total Weight (lbs)', Math.round(plan.totalWeight)],
  );

  if (plan.unplacedBundles.length > 0) {
    summaryData.push(['Unplaced Bundles', plan.unplacedBundles.length]);
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  // Set column widths
  summarySheet['!cols'] = [{ wch: 20 }, { wch: 30 }];
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // ============================================================
  // Sheet 2: Bundle Details (all trucks)
  // ============================================================
  const bundleRows: unknown[][] = [
    ['Truck #', 'Trailer Type', 'Bundle #', 'Component', 'Category', 'Pieces',
     'Weight (lbs)', 'Length (in)', 'Width (in)', 'Height (in)', 'Partial',
     'End Straps', 'Mid Straps', 'Safety Straps', 'Total Straps'],
  ];

  for (const truck of plan.trucks) {
    for (let i = 0; i < truck.bundles.length; i++) {
      const b = truck.bundles[i];
      const strap = calculateStrappingRequirements(b);
      bundleRows.push([
        truck.truckIndex + 1,
        truck.trailerLabel,
        i + 1,
        b.description,
        b.category,
        b.pieces,
        Math.round(b.totalWeightLbs),
        Math.round(b.lengthIn),
        Math.round(b.widthIn),
        Math.round(b.heightIn),
        b.isPartial ? 'Yes' : 'No',
        strap.endStraps,
        strap.midStraps,
        strap.safetyStraps,
        strap.totalStraps,
      ]);
    }
  }

  const bundleSheet = XLSX.utils.aoa_to_sheet(bundleRows);
  bundleSheet['!cols'] = [
    { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 35 }, { wch: 12 },
    { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
  ];
  XLSX.utils.book_append_sheet(wb, bundleSheet, 'Bundle Details');

  // ============================================================
  // Sheet 3: Truck Utilization
  // ============================================================
  const utilRows: unknown[][] = [
    ['Truck #', 'Trailer Type', 'Bundles', 'Total Weight (lbs)', 'Max Payload (lbs)',
     'Weight Util (%)', 'Area Util (%)',
     'Kingpin Weight (lbs)', 'Rear Axle Weight (lbs)',
     'Kingpin Util (%)', 'Rear Axle Util (%)',
     'CG Position (in from front)', 'CG Position (%)'],
  ];

  for (const truck of plan.trucks) {
    const trailer = getAllTrailerSpecs()[truck.trailerType] ?? TRAILER_SPECS['53-flatbed'];
    const positions = computeBundleLayoutPositions(truck);
    const axle = truck.bundles.length > 0 ? calculateAxleWeights(truck, positions) : null;

    utilRows.push([
      truck.truckIndex + 1,
      truck.trailerLabel,
      truck.bundles.length,
      Math.round(truck.totalWeightLbs),
      trailer.maxPayloadLbs,
      +truck.weightUtilisation.toFixed(1),
      +truck.areaUtilisation.toFixed(1),
      axle ? Math.round(axle.kingpinWeightLbs) : '',
      axle ? Math.round(axle.rearAxleWeightLbs) : '',
      axle ? +axle.kingpinUtilisation.toFixed(1) : '',
      axle ? +axle.rearAxleUtilisation.toFixed(1) : '',
      axle ? Math.round(axle.centerOfGravity.longitudinalIn) : '',
      axle ? +axle.centerOfGravity.longitudinalPct.toFixed(1) : '',
    ]);
  }

  const utilSheet = XLSX.utils.aoa_to_sheet(utilRows);
  utilSheet['!cols'] = [
    { wch: 8 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 16 },
    { wch: 14 }, { wch: 12 },
    { wch: 18 }, { wch: 18 },
    { wch: 14 }, { wch: 14 },
    { wch: 22 }, { wch: 14 },
  ];
  XLSX.utils.book_append_sheet(wb, utilSheet, 'Truck Utilization');

  // ============================================================
  // Sheet 4: Loading Sequence
  // ============================================================
  const seqRows: unknown[][] = [
    ['Truck #', 'Step', 'Component', 'Pieces', 'Weight (lbs)', 'Position', 'Row', 'Stacked'],
  ];

  for (const truck of plan.trucks) {
    const steps = generateLoadingSequence(truck);
    for (const step of steps) {
      seqRows.push([
        truck.truckIndex + 1,
        step.stepNumber,
        step.bundle.description,
        step.bundle.pieces,
        Math.round(step.bundle.totalWeightLbs),
        step.positionDescription,
        step.row,
        step.isStacked ? 'Yes' : 'No',
      ]);
    }
  }

  const seqSheet = XLSX.utils.aoa_to_sheet(seqRows);
  seqSheet['!cols'] = [
    { wch: 8 }, { wch: 6 }, { wch: 35 }, { wch: 8 }, { wch: 12 },
    { wch: 30 }, { wch: 6 }, { wch: 8 },
  ];
  XLSX.utils.book_append_sheet(wb, seqSheet, 'Loading Sequence');

  // Generate filename
  const quoteRef = options.quote?.quoteNumber ? sanitizeFilenamePart(options.quote.quoteNumber) : '';
  const filename = quoteRef
    ? `load-plan-${quoteRef}.xlsx`
    : 'load-plan.xlsx';

  XLSX.writeFile(wb, filename);
}
