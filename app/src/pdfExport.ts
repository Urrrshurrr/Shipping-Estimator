import jsPDF from 'jspdf';
import type { LoadPlan, ParsedQuote, LoadingStep } from './types';
import { TRAILER_SPECS, getAllTrailerSpecs } from './data';
import { generateLoadingSequence, computeBundleLayoutPositions, calculateAxleWeights, calculateStrappingRequirements } from './algorithm';

/** Load an image from a URL and return it as an HTMLImageElement for jsPDF. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (_e) => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

interface ExportOptions {
  title?: string;
  quote?: ParsedQuote;
}

export async function exportLoadPlanPDF(plan: LoadPlan, options: ExportOptions = {}): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const addText = (text: string, size: number, bold = false, color: [number, number, number] = [0, 0, 0]) => {
    pdf.setFontSize(size);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setTextColor(...color);
    pdf.text(text, margin, y);
    y += size * 0.5;
  };

  const addLine = () => {
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, y, pageW - margin, y);
    y += 3;
  };

  const checkPage = (needed: number) => {
    if (y + needed > pageH - margin - 10) {
      pdf.addPage();
      y = margin;
    }
  };

  // ============================================================
  // BRANDED HEADER
  // ============================================================

  // Company logo
  try {
    const logoImg = await loadImage('/NAS_Logo.png');
    const logoH = 10;
    const logoW = logoH * (logoImg.width / logoImg.height);
    pdf.addImage(logoImg, 'PNG', margin, y - 3, logoW, logoH);
    y += logoH;
  } catch {
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(227, 24, 55);
    pdf.text('North American Steel', margin, y);
    y += 4;
  }

  // Red separator line
  pdf.setDrawColor(227, 24, 55);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageW - margin, y);
  pdf.setLineWidth(0.2);
  y += 6;

  // Document title
  const title = options.title ?? 'NAS Shipping Load Plan';
  const quote = options.quote;

  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 30, 30);
  pdf.text(title, margin, y);
  y += 8;

  if (quote) {
    // Two-column info grid with text wrapping for long values
    const labelColor: [number, number, number] = [100, 100, 100];
    const valueColor: [number, number, number] = [30, 30, 30];
    const labelSize = 9;
    const valueSize = 10;
    const leftLabelX = margin;
    const leftValueX = margin + 35;
    const rightLabelX = pageW * 0.52;
    const rightValueX = rightLabelX + 22;
    const maxLeftW = rightLabelX - leftValueX - 3;
    const maxRightW = pageW - margin - rightValueX;
    const lineH = 4.2; // line height for wrapped text

    // Helper: draw label + wrapped value, return number of lines used
    const drawInfoField = (
      label: string, value: string,
      labelX: number, valueX: number,
      maxW: number, bold = false,
    ): number => {
      pdf.setFontSize(labelSize);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...labelColor);
      pdf.text(label, labelX, y);
      pdf.setFontSize(valueSize);
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.setTextColor(...valueColor);
      const lines = pdf.splitTextToSize(value, maxW) as string[];
      pdf.text(lines, valueX, y);
      return lines.length;
    };

    // Row 1: Quote Reference (left) + Customer (right)
    let rowLines = 1;
    if (quote.quoteNumber) {
      rowLines = Math.max(rowLines, drawInfoField('Quote Reference:', quote.quoteNumber, leftLabelX, leftValueX, maxLeftW, true));
    }
    if (quote.shipToName) {
      rowLines = Math.max(rowLines, drawInfoField('Customer:', quote.shipToName, rightLabelX, rightValueX, maxRightW, true));
    }
    y += lineH * rowLines + 1;

    // Row 2: Salesperson (left) + Ship To (right)
    rowLines = 1;
    if (quote.salesperson) {
      rowLines = Math.max(rowLines, drawInfoField('Salesperson:', quote.salesperson, leftLabelX, leftValueX, maxLeftW));
    }
    if (quote.shipToAddress) {
      rowLines = Math.max(rowLines, drawInfoField('Ship To:', quote.shipToAddress, rightLabelX, rightValueX, maxRightW));
    }
    y += lineH * rowLines + 1;

    // Row 3: Date (left)
    if (quote.documentDate) {
      drawInfoField('Date:', quote.documentDate, leftLabelX, leftValueX, maxLeftW);
      y += lineH + 1;
    }
  } else {
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, margin, y);
    y += 6;
  }

  y += 3;
  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageW - margin, y);
  y += 5;

  // ============================================================
  // SUMMARY SECTION
  // ============================================================

  addText('Summary', 13, true);
  y += 1;

  // Summary stats in a compact grid
  const summaryData = [
    ['Trucks Required', `${plan.trucks.length}`],
    ['Total Bundles', `${plan.totalBundles}`],
    ['Total Weight', `${Math.round(plan.totalWeight).toLocaleString()} lbs`],
  ];

  pdf.setFontSize(10);
  for (const [label, value] of summaryData) {
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    pdf.text(`${label}:`, margin, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 30, 30);
    pdf.text(value, margin + 40, y);
    y += 5;
  }

  if (plan.unplacedBundles.length > 0) {
    y += 1;
    addText(`WARNING: ${plan.unplacedBundles.length} bundle(s) could not be placed`, 10, true, [220, 38, 38]);
  }
  y += 4;
  addLine();

  // ============================================================
  // PER-TRUCK DETAILS + LOADING SEQUENCE (#14, #15)
  // ============================================================

  for (const truck of plan.trucks) {
    checkPage(60);
    const trailer = getAllTrailerSpecs()[truck.trailerType] ?? TRAILER_SPECS['53-flatbed'];

    // Truck header
    pdf.setFillColor(240, 242, 245);
    pdf.rect(margin, y - 4, pageW - 2 * margin, 8, 'F');
    addText(`Truck #${truck.truckIndex + 1} — ${truck.trailerLabel}`, 12, true, [227, 24, 55]);
    y += 2;

    // Utilisation stats
    addText(`Weight: ${Math.round(truck.totalWeightLbs).toLocaleString()} / ${trailer.maxPayloadLbs.toLocaleString()} lbs (${truck.weightUtilisation.toFixed(1)}%)`, 9);
    addText(`Floor Area: ${truck.areaUtilisation.toFixed(1)}% utilized`, 9);
    addText(`Bundles: ${truck.bundles.length}`, 9);

    // Axle weight info
    const positions = computeBundleLayoutPositions(truck);
    if (truck.bundles.length > 0) {
      const axle = calculateAxleWeights(truck, positions);
      y += 2;

      // Axle weights — two-column layout (three-column for B-train)
      const kpColor: [number, number, number] = axle.kingpinOverweight ? [220, 38, 38] : [22, 163, 74];
      const rearColor: [number, number, number] = axle.rearAxleOverweight ? [220, 38, 38] : [22, 163, 74];

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(...kpColor);
      pdf.text(`Kingpin: ${Math.round(axle.kingpinWeightLbs).toLocaleString()} lbs (${axle.kingpinUtilisation.toFixed(0)}%)`, margin, y);
      pdf.setTextColor(...rearColor);
      const rearLabel = axle.pupAxleWeightLbs != null ? 'Lead Axle' : 'Rear Axle';
      pdf.text(`${rearLabel}: ${Math.round(axle.rearAxleWeightLbs).toLocaleString()} lbs (${axle.rearAxleUtilisation.toFixed(0)}%)`, margin + 70, y);

      // B-train pup axle on same line
      if (axle.pupAxleWeightLbs != null) {
        const pupColor: [number, number, number] = axle.pupAxleOverweight ? [220, 38, 38] : [22, 163, 74];
        pdf.setTextColor(...pupColor);
        pdf.text(`Pup Axle: ${Math.round(axle.pupAxleWeightLbs).toLocaleString()} lbs (${(axle.pupAxleUtilisation ?? 0).toFixed(0)}%)`, margin + 135, y);
      }
      y += 4;

      // Center of gravity on its own line
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(120, 120, 120);
      pdf.text(`CG: ${Math.round(axle.centerOfGravity.longitudinalIn)}" from front (${axle.centerOfGravity.longitudinalPct.toFixed(1)}%)`, margin, y);
      y += 4;

      if (axle.kingpinOverweight || axle.rearAxleOverweight || axle.pupAxleOverweight) {
        pdf.setFontSize(9);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(220, 38, 38);
        pdf.text('\u26A0 Axle weight limit exceeded \u2014 redistribute load before shipping', margin, y);
        y += 5;
      }
    }

    y += 3;

    // Bundle table header
    const cols = [margin, margin + 8, margin + 65, margin + 82, margin + 106, margin + 140];
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 100, 100);
    pdf.text('#', cols[0], y);
    pdf.text('Component', cols[1], y);
    pdf.text('Pieces', cols[2], y);
    pdf.text('Weight (lbs)', cols[3], y);
    pdf.text('L × W × H (in)', cols[4], y);
    pdf.text('Strapping', cols[5], y);
    y += 3;
    pdf.setDrawColor(220, 220, 220);
    pdf.line(margin, y, pageW - margin, y);
    y += 3;

    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(50, 50, 50);

    for (let i = 0; i < truck.bundles.length; i++) {
      checkPage(6);
      const b = truck.bundles[i];
      pdf.setFontSize(8);
      pdf.text(`${i + 1}`, cols[0], y);
      const desc = b.description.length > 30 ? b.description.slice(0, 28) + '...' : b.description;
      pdf.text(`${desc}${b.isPartial ? ' (partial)' : ''}`, cols[1], y);
      pdf.text(`${b.pieces}`, cols[2], y);
      pdf.text(`${Math.round(b.totalWeightLbs).toLocaleString()}`, cols[3], y);
      pdf.text(`${Math.round(b.lengthIn)}×${Math.round(b.widthIn)}×${Math.round(b.heightIn)}`, cols[4], y);
      const strap = calculateStrappingRequirements(b);
      pdf.text(`${strap.totalStraps} (${strap.endStraps}E+${strap.midStraps}M${strap.safetyStraps > 0 ? `+${strap.safetyStraps}S` : ''})`, cols[5], y);
      y += 4;
    }

    y += 4;
    addLine();
  }

  // ============================================================
  // 3D VIEWPORT SNAPSHOTS (#16)
  // ============================================================

  const canvasEl = document.querySelector('.viewer-container canvas') as HTMLCanvasElement | null;
  if (canvasEl) {
    try {
      checkPage(80);
      addText('3D Load Visualization', 12, true, [227, 24, 55]);
      y += 4;

      // Capture the current perspective view
      const imgData = canvasEl.toDataURL('image/png');
      const imgW = pageW - 2 * margin;
      const imgH = imgW * (canvasEl.height / canvasEl.width);
      const clampedH = Math.min(imgH, 80);
      pdf.addImage(imgData, 'PNG', margin, y, imgW, clampedH);

      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'italic');
      pdf.setTextColor(150, 150, 150);
      pdf.text('Perspective view — current camera angle', margin, y + clampedH + 3);
      y += clampedH + 8;
    } catch {
      // WebGL canvas capture can fail in some browsers
    }
  }

  // ============================================================
  // SIGN-OFF SECTION (#17)
  // ============================================================

  checkPage(40);
  y += 6;
  addLine();
  y += 4;

  addText('Approval & Sign-Off', 12, true);
  y += 6;

  // Signature lines
  const sigLineWidth = 60;
  const sigY = y;
  pdf.setDrawColor(180, 180, 180);

  // Prepared by
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text('Prepared by:', margin, sigY);
  pdf.line(margin, sigY + 10, margin + sigLineWidth, sigY + 10);
  pdf.text('Signature', margin, sigY + 14);
  pdf.line(margin, sigY + 22, margin + sigLineWidth, sigY + 22);
  pdf.text('Date', margin, sigY + 26);

  // Approved by
  const approvedX = pageW / 2 + 5;
  pdf.text('Approved by:', approvedX, sigY);
  pdf.line(approvedX, sigY + 10, approvedX + sigLineWidth, sigY + 10);
  pdf.text('Signature', approvedX, sigY + 14);
  pdf.line(approvedX, sigY + 22, approvedX + sigLineWidth, sigY + 22);
  pdf.text('Date', approvedX, sigY + 26);

  y = sigY + 30;

  // Add footer to all pages
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Page ${i} of ${totalPages}`, pageW / 2, pageH - 8, { align: 'center' });
    pdf.text('NAS Shipping Estimator', margin, pageH - 8);
    pdf.text(new Date().toLocaleDateString(), pageW - margin, pageH - 8, { align: 'right' });
  }

  // Generate filename from quote number if available
  const filename = quote?.quoteNumber
    ? `load-plan-${quote.quoteNumber}.pdf`
    : 'load-plan.pdf';
  pdf.save(filename);
}

// ============================================================
// Top-view mini-diagram renderer (#15)
// ============================================================

function drawTopViewDiagram(
  pdf: jsPDF,
  truck: import('./types').TruckLoad,
  steps: LoadingStep[],
  positions: Record<string, { x: number; y: number; z: number }>,
  startX: number,
  startY: number,
  maxW: number,
  maxH: number,
) {
  const trailer = getAllTrailerSpecs()[truck.trailerType] ?? TRAILER_SPECS['53-flatbed'];
  const deckLengthIn = trailer.deckLengthFt * 12;
  const deckWidthIn = trailer.internalWidthIn;

  // Scale to fit within the allocated PDF area
  const scaleX = maxW / deckLengthIn;
  const scaleY = maxH / deckWidthIn;
  const scale = Math.min(scaleX, scaleY);
  const dW = deckLengthIn * scale;
  const dH = deckWidthIn * scale;

  // Center within allocated space
  const offsetX = startX + (maxW - dW) / 2;
  const offsetY = startY;

  // Draw trailer outline
  pdf.setDrawColor(150, 150, 150);
  pdf.setLineWidth(0.4);
  pdf.rect(offsetX, offsetY, dW, dH);
  pdf.setLineWidth(0.2);

  // FRONT / REAR labels
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(150, 150, 150);
  pdf.text('FRONT', offsetX - 1, offsetY + dH / 2, { angle: 90 });
  pdf.text('REAR', offsetX + dW + 3, offsetY + dH / 2, { angle: 90 });

  // Color palette for bundles (match 3D view)
  const colors: [number, number, number][] = [
    [59, 130, 246], [239, 68, 68], [16, 185, 129], [245, 158, 11], [139, 92, 246],
    [236, 72, 153], [6, 182, 212], [132, 204, 22], [249, 115, 22], [99, 102, 241],
  ];

  // Draw floor-level bundles first, then stacked (with dashed outline for stacked)
  const floorSteps = steps.filter(s => !s.isStacked);
  const stackedSteps = steps.filter(s => s.isStacked);

  const drawBundleRect = (step: LoadingStep, dashed: boolean) => {
    const pos = positions[step.bundle.id];
    if (!pos) return;

    const bx = offsetX + pos.x * scale;
    const by = offsetY + pos.z * scale;
    const bw = step.bundle.lengthIn * scale;
    const bh = step.bundle.widthIn * scale;
    const [r, g, b] = colors[(step.stepNumber - 1) % colors.length];

    // Draw filled rect for floor-level bundles
    if (!dashed) {
      pdf.setFillColor(r, g, b);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gState = new (pdf as any).GState({ opacity: 0.5 });
      pdf.saveGraphicsState();
      pdf.setGState(gState);
      pdf.rect(bx, by, bw, bh, 'F');
      pdf.restoreGraphicsState();
    }

    // Outline
    pdf.setDrawColor(r, g, b);
    if (dashed) {
      // Dashed outline for stacked items
      pdf.setLineDashPattern([1, 1], 0);
    }
    pdf.rect(bx, by, bw, bh, 'S');
    if (dashed) {
      pdf.setLineDashPattern([], 0);
    }

    // Step number label
    if (bw > 3 && bh > 3) {
      pdf.setFontSize(Math.min(5, bw * 0.3, bh * 0.6));
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(dashed ? r : 255, dashed ? g : 255, dashed ? b : 255);
      pdf.text(`${step.stepNumber}`, bx + bw / 2, by + bh / 2 + 0.8, { align: 'center' });
    }
  };

  for (const step of floorSteps) drawBundleRect(step, false);
  for (const step of stackedSteps) drawBundleRect(step, true);

  // Legend
  pdf.setFontSize(6);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(120, 120, 120);
  const legendY = offsetY + dH + 3;
  pdf.setFillColor(59, 130, 246);
  pdf.rect(offsetX, legendY - 1.5, 3, 2, 'F');
  pdf.text('Floor level', offsetX + 5, legendY);
  pdf.setDrawColor(139, 92, 246);
  pdf.setLineDashPattern([1, 1], 0);
  pdf.rect(offsetX + 30, legendY - 1.5, 3, 2, 'S');
  pdf.setLineDashPattern([], 0);
  pdf.text('Stacked', offsetX + 35, legendY);
  pdf.text('Numbers = loading sequence', offsetX + 60, legendY);
}

// ============================================================
// Standalone Loading Instructions PDF export
// ============================================================

interface LoadingInstructionsOptions {
  quote?: ParsedQuote;
}

export async function exportLoadingInstructionsPDF(
  truck: import('./types').TruckLoad,
  options: LoadingInstructionsOptions = {},
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const quote = options.quote;

  const checkPage = (needed: number) => {
    if (y + needed > pageH - margin - 10) {
      pdf.addPage();
      y = margin;
    }
  };

  // ---- Header ----
  try {
    const logoImg = await loadImage('/NAS_Logo.png');
    const logoH = 10;
    const logoW = logoH * (logoImg.width / logoImg.height);
    pdf.addImage(logoImg, 'PNG', margin, y - 3, logoW, logoH);
    y += logoH;
  } catch {
    pdf.setFontSize(22);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(227, 24, 55);
    pdf.text('North American Steel', margin, y);
    y += 4;
  }

  pdf.setDrawColor(227, 24, 55);
  pdf.setLineWidth(0.5);
  pdf.line(margin, y, pageW - margin, y);
  pdf.setLineWidth(0.2);
  y += 6;

  // ---- Truck info ----
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(30, 30, 30);
  pdf.text(`Truck #${truck.truckIndex + 1} — ${truck.trailerLabel}`, margin, y);
  y += 7;

  // Two-column info grid matching main load plan layout
  const labelColor: [number, number, number] = [100, 100, 100];
  const valueColor: [number, number, number] = [30, 30, 30];
  const labelSize = 9;
  const valueSize = 10;
  const leftLabelX = margin;
  const leftValueX = margin + 35;
  const rightLabelX = pageW * 0.52;
  const rightValueX = rightLabelX + 22;
  const maxLeftW = rightLabelX - leftValueX - 3;
  const maxRightW = pageW - margin - rightValueX;
  const lineH = 4.2;

  const drawField = (
    label: string, value: string,
    labelX: number, valueX: number,
    maxW: number, bold = false,
  ): number => {
    pdf.setFontSize(labelSize);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(...labelColor);
    pdf.text(label, labelX, y);
    pdf.setFontSize(valueSize);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setTextColor(...valueColor);
    const lines = pdf.splitTextToSize(value, maxW) as string[];
    pdf.text(lines, valueX, y);
    return lines.length;
  };

  // Row 1: Quote Reference (left) + Customer (right)
  let rowLines = 1;
  if (quote?.quoteNumber) {
    rowLines = Math.max(rowLines, drawField('Quote Reference:', quote.quoteNumber, leftLabelX, leftValueX, maxLeftW, true));
  }
  if (quote?.shipToName) {
    rowLines = Math.max(rowLines, drawField('Customer:', quote.shipToName, rightLabelX, rightValueX, maxRightW, true));
  }
  y += lineH * rowLines + 1;

  // Row 2: Salesperson (left) + Ship To (right)
  rowLines = 1;
  if (quote?.salesperson) {
    rowLines = Math.max(rowLines, drawField('Salesperson:', quote.salesperson, leftLabelX, leftValueX, maxLeftW));
  }
  if (quote?.shipToAddress) {
    rowLines = Math.max(rowLines, drawField('Ship To:', quote.shipToAddress, rightLabelX, rightValueX, maxRightW));
  }
  if (quote?.salesperson || quote?.shipToAddress) {
    y += lineH * rowLines + 1;
  }

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text(`Total Weight: ${Math.round(truck.totalWeightLbs).toLocaleString()} lbs  |  Bundles: ${truck.bundles.length}`, margin, y);
  y += 6;

  pdf.setDrawColor(200, 200, 200);
  pdf.line(margin, y, pageW - margin, y);
  y += 4;

  // ---- Instructions text ----
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(100, 100, 100);
  pdf.text('Load bundles in the sequence below. Place all floor-level items before stacking upper layers.', margin, y);
  y += 5;

  // ---- Loading sequence table ----
  const steps = generateLoadingSequence(truck);
  const positions = computeBundleLayoutPositions(truck);

  const stepCols = [margin, margin + 10, margin + 65, margin + 115, margin + 145];
  pdf.setFontSize(8);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(100, 100, 100);
  pdf.text('Step', stepCols[0], y);
  pdf.text('Component', stepCols[1], y);
  pdf.text('Position', stepCols[2], y);
  pdf.text('Weight', stepCols[3], y);
  pdf.text('Strapping', stepCols[4], y);
  y += 3;
  pdf.setDrawColor(220, 220, 220);
  pdf.line(margin, y, pageW - margin, y);
  y += 3;

  for (const step of steps) {
    checkPage(7);

    // Step number circle
      pdf.setFillColor(227, 24, 55);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(255, 255, 255);
    pdf.text(`${step.stepNumber}`, stepCols[0] + 3, y - 0.8, { align: 'center' });

    // Component
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(30, 30, 30);
    const desc = step.bundle.description.length > 26
      ? step.bundle.description.slice(0, 24) + '...'
      : step.bundle.description;
    pdf.text(`${desc} (${step.bundle.pieces}pc)`, stepCols[1], y);

    // Position
    pdf.setTextColor(80, 80, 80);
    const posDesc = step.positionDescription.length > 24
      ? step.positionDescription.slice(0, 22) + '...'
      : step.positionDescription;
    pdf.text(posDesc, stepCols[2], y);

    // Weight
    pdf.setTextColor(50, 50, 50);
    pdf.text(`${Math.round(step.bundle.totalWeightLbs).toLocaleString()} lbs`, stepCols[3], y);

    // Strapping
    const strap = calculateStrappingRequirements(step.bundle);
    pdf.setTextColor(100, 100, 100);
    pdf.text(`${strap.totalStraps} (${strap.endStraps}E+${strap.midStraps}M${strap.safetyStraps > 0 ? `+${strap.safetyStraps}S` : ''})`, stepCols[4], y);

    y += 5;
  }

  // ---- Top-view mini diagram ----
  y += 4;
  checkPage(55);
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(227, 24, 55);
  pdf.text('Load Placement Diagram (Top View)', margin, y);
  y += 5;

  drawTopViewDiagram(pdf, truck, steps, positions, margin, y, pageW - 2 * margin, 40);
  y += 46;

  // ---- Footer on all pages ----
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Page ${i} of ${totalPages}`, pageW / 2, pageH - 8, { align: 'center' });
    pdf.text('NAS Shipping Estimator — Loading Instructions', margin, pageH - 8);
    pdf.text(new Date().toLocaleDateString(), pageW - margin, pageH - 8, { align: 'right' });
  }

  const quoteRef = quote?.quoteNumber ? `-${quote.quoteNumber}` : '';
  const filename = `loading-instructions-truck${truck.truckIndex + 1}${quoteRef}.pdf`;
  pdf.save(filename);
}

// ============================================================
// Export loading instructions for ALL trucks in one PDF
// ============================================================

export async function exportAllLoadingInstructionsPDF(
  plan: LoadPlan,
  options: LoadingInstructionsOptions = {},
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  const quote = options.quote;

  const checkPage = (needed: number) => {
    if (y + needed > pageH - margin - 10) {
      pdf.addPage();
      y = margin;
    }
  };

  // Pre-load logo once for reuse
  let logoImg: HTMLImageElement | null = null;
  try {
    logoImg = await loadImage('/NAS_Logo.png');
  } catch { /* will fall back to text */ }

  for (let t = 0; t < plan.trucks.length; t++) {
    const truck = plan.trucks[t];
    if (t > 0) {
      pdf.addPage();
      y = margin;
    }

    // ---- Header ----
    if (logoImg) {
      const logoH = 10;
      const logoW = logoH * (logoImg.width / logoImg.height);
      pdf.addImage(logoImg, 'PNG', margin, y - 3, logoW, logoH);
      y += logoH;
    } else {
      pdf.setFontSize(22);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(227, 24, 55);
      pdf.text('North American Steel', margin, y);
      y += 4;
    }

    pdf.setDrawColor(227, 24, 55);
    pdf.setLineWidth(0.5);
    pdf.line(margin, y, pageW - margin, y);
    pdf.setLineWidth(0.2);
    y += 6;

    // ---- Truck info ----
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(30, 30, 30);
    pdf.text(`Truck #${truck.truckIndex + 1} \u2014 ${truck.trailerLabel}`, margin, y);
    y += 7;

    const labelColor: [number, number, number] = [100, 100, 100];
    const valueColor: [number, number, number] = [30, 30, 30];
    const labelSize = 9;
    const valueSize = 10;
    const leftLabelX = margin;
    const leftValueX = margin + 35;
    const rightLabelX = pageW * 0.52;
    const rightValueX = rightLabelX + 22;
    const maxLeftW = rightLabelX - leftValueX - 3;
    const maxRightW = pageW - margin - rightValueX;
    const infoLineH = 4.2;

    const drawField = (
      label: string, value: string,
      lx: number, vx: number,
      maxW: number, bold = false,
    ): number => {
      pdf.setFontSize(labelSize);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(...labelColor);
      pdf.text(label, lx, y);
      pdf.setFontSize(valueSize);
      pdf.setFont('helvetica', bold ? 'bold' : 'normal');
      pdf.setTextColor(...valueColor);
      const lines = pdf.splitTextToSize(value, maxW) as string[];
      pdf.text(lines, vx, y);
      return lines.length;
    };

    // Row 1: Quote Reference (left) + Customer (right)
    let rowLines = 1;
    if (quote?.quoteNumber) {
      rowLines = Math.max(rowLines, drawField('Quote Reference:', quote.quoteNumber, leftLabelX, leftValueX, maxLeftW, true));
    }
    if (quote?.shipToName) {
      rowLines = Math.max(rowLines, drawField('Customer:', quote.shipToName, rightLabelX, rightValueX, maxRightW, true));
    }
    y += infoLineH * rowLines + 1;

    // Row 2: Salesperson (left) + Ship To (right)
    rowLines = 1;
    if (quote?.salesperson) {
      rowLines = Math.max(rowLines, drawField('Salesperson:', quote.salesperson, leftLabelX, leftValueX, maxLeftW));
    }
    if (quote?.shipToAddress) {
      rowLines = Math.max(rowLines, drawField('Ship To:', quote.shipToAddress, rightLabelX, rightValueX, maxRightW));
    }
    if (quote?.salesperson || quote?.shipToAddress) {
      y += infoLineH * rowLines + 1;
    }

    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    pdf.text(`Total Weight: ${Math.round(truck.totalWeightLbs).toLocaleString()} lbs  |  Bundles: ${truck.bundles.length}`, margin, y);
    y += 6;

    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, y, pageW - margin, y);
    y += 4;

    // ---- Instructions text ----
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(100, 100, 100);
    pdf.text('Load bundles in the sequence below. Place all floor-level items before stacking upper layers.', margin, y);
    y += 5;

    // ---- Loading sequence table ----
    const steps = generateLoadingSequence(truck);
    const positions = computeBundleLayoutPositions(truck);

    const stepCols = [margin, margin + 10, margin + 65, margin + 115, margin + 145];
    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(100, 100, 100);
    pdf.text('Step', stepCols[0], y);
    pdf.text('Component', stepCols[1], y);
    pdf.text('Position', stepCols[2], y);
    pdf.text('Weight', stepCols[3], y);
    pdf.text('Strapping', stepCols[4], y);
    y += 3;
    pdf.setDrawColor(220, 220, 220);
    pdf.line(margin, y, pageW - margin, y);
    y += 3;

    for (const step of steps) {
      checkPage(7);

      pdf.setFillColor(227, 24, 55);
      pdf.setFontSize(7);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(255, 255, 255);
      pdf.text(`${step.stepNumber}`, stepCols[0] + 3, y - 0.8, { align: 'center' });

      pdf.setFontSize(8);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(30, 30, 30);
      const desc = step.bundle.description.length > 26
        ? step.bundle.description.slice(0, 24) + '...'
        : step.bundle.description;
      pdf.text(`${desc} (${step.bundle.pieces}pc)`, stepCols[1], y);

      pdf.setTextColor(80, 80, 80);
      const posDesc = step.positionDescription.length > 24
        ? step.positionDescription.slice(0, 22) + '...'
        : step.positionDescription;
      pdf.text(posDesc, stepCols[2], y);

      pdf.setTextColor(50, 50, 50);
      pdf.text(`${Math.round(step.bundle.totalWeightLbs).toLocaleString()} lbs`, stepCols[3], y);

      const strap = calculateStrappingRequirements(step.bundle);
      pdf.setTextColor(100, 100, 100);
      pdf.text(`${strap.totalStraps} (${strap.endStraps}E+${strap.midStraps}M${strap.safetyStraps > 0 ? `+${strap.safetyStraps}S` : ''})`, stepCols[4], y);

      y += 5;
    }

    // ---- Top-view mini diagram ----
    y += 4;
    checkPage(55);
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(227, 24, 55);
    pdf.text('Load Placement Diagram (Top View)', margin, y);
    y += 5;

    drawTopViewDiagram(pdf, truck, steps, positions, margin, y, pageW - 2 * margin, 40);
    y += 46;
  }

  // ---- Footer on all pages ----
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(150, 150, 150);
    pdf.text(`Page ${i} of ${totalPages}`, pageW / 2, pageH - 8, { align: 'center' });
    pdf.text('NAS Shipping Estimator \u2014 Loading Instructions', margin, pageH - 8);
    pdf.text(new Date().toLocaleDateString(), pageW - margin, pageH - 8, { align: 'right' });
  }

  const quoteRef = quote?.quoteNumber ? `-${quote.quoteNumber}` : '';
  const filename = `loading-instructions-all-trucks${quoteRef}.pdf`;
  pdf.save(filename);
}
