import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import type { TextItem as PDFTextItem } from 'pdfjs-dist/types/src/display/api';
import * as XLSX from 'xlsx';
import { PRODUCT_CATALOG } from './data';
import type {
  OrderItem,
  ProductCategory,
  ParsedQuote,
  ParsedLineItem,
  ChannelDesignation,
  StepBeamProfile,
} from './types';

// ============================================================
// PDF.js worker – served from public/ directory
// ============================================================
GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// ============================================================
// Public API
// ============================================================

/** Parse a quote file (PDF or Excel) and return structured data. */
export async function parseQuoteFile(file: File): Promise<ParsedQuote> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) {
    return parsePDFQuote(file);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    return parseExcelQuote(file);
  }
  throw new Error('Unsupported file format. Please upload a PDF or Excel file.');
}

/** Convert a ParsedQuote into OrderItem[] ready for the load-plan algorithm. */
export function parsedQuoteToOrderItems(quote: ParsedQuote): OrderItem[] {
  let nextId = Date.now();
  const uid = () => `import-${nextId++}`;

  const items: OrderItem[] = [];

  for (const line of quote.lineItems) {
    if (isServiceLine(line.productNumber, line.description, line.weightPerPiece)) {
      continue;
    }

    const item = mapLineToOrderItem(line, uid());
    if (item) items.push(item);
  }

  return items;
}

// ============================================================
// PDF parsing
// ============================================================

interface PositionedText {
  str: string;
  x: number;
  y: number;
  width: number;
}

async function parsePDFQuote(file: File): Promise<ParsedQuote> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  const allItems: PositionedText[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageItems: PositionedText[] = [];
    for (const item of content.items) {
      const ti = item as PDFTextItem;
      if (!ti.str || !ti.str.trim()) continue;
      pageItems.push({
        str: ti.str,
        x: ti.transform[4],
        y: ti.transform[5],
        width: ti.width,
      });
    }
    allItems.push(pageItems);
  }

  // Reconstruct text as lines for each page
  const allRows: string[][] = [];
  for (const pageItems of allItems) {
    const rows = groupIntoRows(pageItems);
    allRows.push(rows);
  }

  // Parse header from first page (use positioned items for spatial awareness)
  const header = parseQuoteHeader(allRows[0] ?? [], allItems[0] ?? []);

  // Parse line items from all pages using column-position approach
  const lineItems = parseTableFromAllPages(allItems);

  return {
    ...header,
    lineItems,
  };
}

/** Group text items by y-position into lines, sorted top-to-bottom. */
function groupIntoRows(items: PositionedText[], tolerance = 3): string[] {
  if (items.length === 0) return [];

  // Sort by y descending (PDF y origin is bottom-left)
  const sorted = [...items].sort((a, b) => b.y - a.y);

  const rows: string[] = [];
  let currentRowItems: PositionedText[] = [sorted[0]];
  let currentY = sorted[0].y;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].y - currentY) <= tolerance) {
      currentRowItems.push(sorted[i]);
    } else {
      currentRowItems.sort((a, b) => a.x - b.x);
      rows.push(currentRowItems.map(r => r.str).join(' '));
      currentRowItems = [sorted[i]];
      currentY = sorted[i].y;
    }
  }
  if (currentRowItems.length > 0) {
    currentRowItems.sort((a, b) => a.x - b.x);
    rows.push(currentRowItems.map(r => r.str).join(' '));
  }

  return rows;
}

/** Extract quote header fields from the first page lines + positioned text items. */
function parseQuoteHeader(lines: string[], items: PositionedText[] = []): Omit<ParsedQuote, 'lineItems'> {
  const fullText = lines.join('\n');

  // Quote number: Q followed by 2-3 uppercase letters then 4+ digits
  const quoteMatch = fullText.match(/\b(Q[A-Z]{2,3}\d{4,})\b/);
  const quoteNumber = quoteMatch?.[1] ?? '';

  // Document date: look for date patterns near "Document Date"
  const dateMatch = fullText.match(
    /(?:Document\s+Date|Date)[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s+\d{4})/i,
  );
  const documentDate = dateMatch?.[1]?.trim();

  // Total weight
  const twMatch = fullText.match(/Total\s+Weight[:\s]*([\d,]+\.?\d*)/i);
  const totalWeight = twMatch ? parseFloat(twMatch[1].replace(/,/g, '')) : undefined;

  // ── Spatial extraction using positioned text items ──
  // Business Central quotes have a two-column layout:
  //   Left column: Sell-to customer name + address
  //   Right column: "Ship to:" label followed by ship-to name + address
  //   Below that: "Salesperson" label with value directly below it

  let salesperson: string | undefined;
  let shipToName: string | undefined;
  let shipToAddress: string | undefined;
  let customerName: string | undefined;

  if (items.length > 0) {
    const ROW_TOL = 3; // y-tolerance for grouping items on same row

    // Group items into rows by y-coordinate (descending = top-to-bottom)
    const yBuckets = new Map<number, PositionedText[]>();
    for (const it of items) {
      const yKey = Math.round(it.y / ROW_TOL) * ROW_TOL;
      if (!yBuckets.has(yKey)) yBuckets.set(yKey, []);
      yBuckets.get(yKey)!.push(it);
    }
    const rowsByY = [...yBuckets.entries()]
      .sort((a, b) => b[0] - a[0]) // top-to-bottom (PDF y is bottom-up)
      .map(([yKey, rowItems]) => ({ y: yKey, items: rowItems.sort((a, b) => a.x - b.x) }));

    // ── Find the "Ship to:" label to determine column boundary ──
    let shipToLabelItem: PositionedText | undefined;
    for (const it of items) {
      if (/^ship\s*to:?$/i.test(it.str.trim())) {
        shipToLabelItem = it;
        break;
      }
    }

    // ── Find "Salesperson" label ──
    let salespersonLabelItem: PositionedText | undefined;
    for (const it of items) {
      if (/^salesperson$/i.test(it.str.trim())) {
        salespersonLabelItem = it;
        break;
      }
    }

    // ── Extract salesperson: text at similar x-position, on the next row below the label ──
    if (salespersonLabelItem) {
      const labelY = salespersonLabelItem.y;
      const labelX = salespersonLabelItem.x;
      // Find the next row below the label that has text near the same x
      let bestItem: PositionedText | undefined;
      let bestDist = Infinity;
      for (const it of items) {
        if (it.y >= labelY - ROW_TOL) continue; // must be below
        if (it.y < labelY - 60) break; // don't look too far down
        const xDist = Math.abs(it.x - labelX);
        if (xDist < 30) {
          const yDist = labelY - it.y;
          if (yDist < bestDist) {
            bestDist = yDist;
            bestItem = it;
          }
        }
      }
      if (bestItem) {
        salesperson = bestItem.str.trim();
      }
    }

    // ── Extract Ship-to name + address ──
    if (shipToLabelItem) {
      const shipX = shipToLabelItem.x;
      const labelY = shipToLabelItem.y;

      // Collect text items that are:
      //   - Below the "Ship to:" label
      //   - At or near the same x position (right-column)
      //   - Above the "Salesperson"/"Document Date" row
      const salespersonY = salespersonLabelItem?.y ?? 0;
      const shipToLines: string[] = [];
      let lastShipY: number | null = null;

      for (const row of rowsByY) {
        if (row.y >= labelY - ROW_TOL) continue; // skip label row and above
        if (salespersonY > 0 && row.y <= salespersonY + ROW_TOL) break; // stop at salesperson row

        // Get items in the right column (near the Ship To x position)
        const rightItems = row.items.filter(it => Math.abs(it.x - shipX) < 30);
        if (rightItems.length > 0) {
          // Ensure contiguous — stop if we skip more than one empty row
          if (lastShipY !== null && lastShipY - row.y > 20) break;
          lastShipY = row.y;
          shipToLines.push(rightItems.map(it => it.str.trim()).join(' '));
        }
      }

      if (shipToLines.length > 0) {
        // Ship-to: join all lines as the full address for the "Ship To:" field
        shipToAddress = shipToLines.join(', ');
      }

      // ── Extract Customer (sell-to): left column at the same vertical range ──
      // The customer block occupies the left column, at the same y-range as ship-to.
      // Use the ship-to label x as the boundary between left and right columns.
      const midX = shipX - 20; // items clearly to the left of ship-to column
      const custLines: string[] = [];

      for (const row of rowsByY) {
        if (row.y >= labelY - ROW_TOL) continue;
        if (salespersonY > 0 && row.y <= salespersonY + ROW_TOL) break;

        const leftItems = row.items.filter(it => it.x < midX);
        if (leftItems.length > 0) {
          custLines.push(leftItems.map(it => it.str.trim()).join(' '));
        }
      }

      if (custLines.length > 0) {
        customerName = custLines[0];
        // Address lines are the remaining lines
        if (custLines.length > 1) {
          // shipToAddress is already set from right column, but
          // keep customer name separate — don't overwrite ship-to
        }
      }
    }

    // Fallback: if no spatial "Ship to:" found, try regex on full text
    if (!shipToName) {
      const shipIdx = lines.findIndex(l => /ship[\s-]*to/i.test(l));
      if (shipIdx >= 0 && shipIdx + 1 < lines.length) {
        shipToName = lines[shipIdx + 1]?.trim();
        if (shipIdx + 2 < lines.length) {
          shipToAddress = lines[shipIdx + 2]?.trim();
        }
      }
    }

    // Fallback for salesperson if spatial approach didn't find it
    if (!salesperson) {
      const spMatch = fullText.match(/Salesperson[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
      salesperson = spMatch?.[1]?.trim();
    }
  } else {
    // No positioned items — use regex fallback
    const spMatch = fullText.match(/Salesperson[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    salesperson = spMatch?.[1]?.trim();

    const shipIdx = lines.findIndex(l => /ship[\s-]*to/i.test(l));
    if (shipIdx >= 0 && shipIdx + 1 < lines.length) {
      shipToName = lines[shipIdx + 1]?.trim();
      if (shipIdx + 2 < lines.length) {
        shipToAddress = lines[shipIdx + 2]?.trim();
      }
    }
  }

  return {
    quoteNumber,
    documentDate,
    salesperson,
    shipToName: customerName ?? shipToName,
    shipToAddress,
    totalWeight,
  };
}

/** Column definition with x-position from the table header. */
interface ColumnDef {
  name: string;
  x: number;
}

const TABLE_HEADERS = ['No.', 'Description', 'Quantity', 'Colour', 'Weight', 'Net Price', 'Line Amount'];

/** Find the table header row and extract column x-positions from a page's items. */
function findTableColumns(items: PositionedText[], tolerance = 3): { columns: ColumnDef[]; headerY: number } | null {
  // Group items by y
  const yGroups = new Map<number, PositionedText[]>();
  for (const item of items) {
    const yKey = Math.round(item.y / tolerance) * tolerance;
    if (!yGroups.has(yKey)) yGroups.set(yKey, []);
    yGroups.get(yKey)!.push(item);
  }

  for (const [yKey, rowItems] of yGroups) {
    const rowText = rowItems.map(r => r.str.trim()).join(' ');
    // Check if this row contains the table header markers
    if (rowText.includes('No.') && rowText.includes('Description') && rowText.includes('Quantity')) {
      const columns: ColumnDef[] = [];
      for (const item of rowItems) {
        const text = item.str.trim();
        // Match header names (handle multi-word like "Net Price", "Line Amount")
        for (const header of TABLE_HEADERS) {
          if (text === header || (header.includes(' ') && text === header.split(' ')[0])) {
            columns.push({ name: header, x: item.x });
          }
        }
        // Also match joined versions
        if (text === 'Net' || text === 'Line') {
          // Will be handled by adjacent items — skip, already matched above
        }
      }
      if (columns.length >= 3) {
        columns.sort((a, b) => a.x - b.x);
        return { columns, headerY: yKey };
      }
    }
  }
  return null;
}

/** Assign a text item to the nearest column based on x-position. */
function assignToColumn(itemX: number, columns: ColumnDef[]): string {
  let best = columns[0];
  for (const col of columns) {
    if (col.x <= itemX + 15) {
      best = col;
    }
  }
  return best.name;
}

/** Parse table data rows from all pages using column-position alignment. */
function parseTableFromAllPages(allPageItems: PositionedText[][]): ParsedLineItem[] {
  const lineItems: ParsedLineItem[] = [];
  let activeColumns: ColumnDef[] | null = null;

  for (const pageItems of allPageItems) {
    // Try to find header on this page (it might repeat on each page)
    const headerResult = findTableColumns(pageItems);
    if (headerResult) {
      activeColumns = headerResult.columns;
    }
    if (!activeColumns) continue;

    // Group all items below the header into rows
    const headerY = headerResult?.headerY ?? Infinity;
    const dataItems = pageItems.filter(item => item.y < headerY - 3);

    // Group by y-position
    const yGroups = new Map<number, PositionedText[]>();
    for (const item of dataItems) {
      const yKey = Math.round(item.y / 3) * 3;
      if (!yGroups.has(yKey)) yGroups.set(yKey, []);
      yGroups.get(yKey)!.push(item);
    }

    // Sort rows top-to-bottom (highest y first)
    const sortedYKeys = [...yGroups.keys()].sort((a, b) => b - a);

    for (const yKey of sortedYKeys) {
      const rowItems = yGroups.get(yKey)!;
      rowItems.sort((a, b) => a.x - b.x);

      // Assign each item to a column
      const cellValues: Record<string, string> = {};
      for (const item of rowItems) {
        const col = assignToColumn(item.x, activeColumns);
        cellValues[col] = (cellValues[col] ? cellValues[col] + ' ' : '') + item.str.trim();
      }

      // Must have a product number and description to be a data row
      const productNumber = (cellValues['No.'] ?? '').trim();
      const description = (cellValues['Description'] ?? '').trim();
      if (!productNumber || !description) continue;

      // Skip total/subtotal/footer rows
      if (/total|subtotal|disclaimer|sales\s+tax/i.test(description)) continue;
      if (/^\$/.test(productNumber)) continue;

      const quantity = parseFloat((cellValues['Quantity'] ?? '0').replace(/,/g, ''));
      if (quantity <= 0 || isNaN(quantity)) continue;

      const weightStr = (cellValues['Weight'] ?? '0').replace(/,/g, '');
      const weightPerPiece = parseFloat(weightStr) || 0;

      const colour = (cellValues['Colour'] ?? '').trim() || undefined;

      const priceStr = (cellValues['Net Price'] ?? '0').replace(/[$,]/g, '');
      const netPrice = parseFloat(priceStr) || undefined;

      const amountStr = (cellValues['Line Amount'] ?? '0').replace(/[$,]/g, '');
      const lineAmount = parseFloat(amountStr) || undefined;

      lineItems.push({
        productNumber,
        description,
        quantity,
        colour,
        weightPerPiece,
        netPrice,
        lineAmount,
      });
    }
  }

  return lineItems;
}

// ============================================================
// Excel parsing
// ============================================================

async function parseExcelQuote(file: File): Promise<ParsedQuote> {
  const arrayBuffer = await file.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const workbook = XLSX.read(data, { type: 'array' });

  // Try to find "Lines" sheet, otherwise use first sheet
  const sheetName =
    workbook.SheetNames.find(n => n.toLowerCase().includes('lines')) ??
    workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  const lineItems: ParsedLineItem[] = [];

  for (const row of rows) {
    // Skip non-item rows (Business Central exports have Type = "Item" vs "Comment")
    const type = String(row['Type'] ?? '').trim();
    if (type && type !== 'Item') continue;

    const productNumber = String(row['No.'] ?? '').trim();
    if (!productNumber) continue;

    // Concatenate Description + Description 2
    const desc1 = String(row['Description'] ?? '').trim();
    const desc2 = String(row['Description 2'] ?? '').trim();
    const description = [desc1, desc2].filter(Boolean).join(' ');

    const quantity = Number(row['Quantity']) || 0;
    if (quantity <= 0) continue;

    // Weight: try "Gross Weight" first (per-piece), then "Weight"
    const weight = Number(row['Gross Weight'] ?? row['Weight'] ?? 0) || 0;

    const colour = String(row['Colour'] ?? '').trim() || undefined;
    const netPrice = Number(row['Unit Net Price'] ?? row['Net Price']) || undefined;
    const lineAmount = Number(row['Line Amount Excl. VAT'] ?? row['Line Amount']) || undefined;

    lineItems.push({
      productNumber,
      description,
      quantity,
      colour,
      weightPerPiece: weight,
      netPrice,
      lineAmount,
    });
  }

  // Try to extract quote number from project code or filename
  let quoteNumber = '';
  const firstRow = rows[0] as Record<string, unknown> | undefined;
  if (firstRow) {
    const project = String(firstRow['Project Code'] ?? '').trim();
    const qMatch = project.match(/\b(Q[A-Z]{2,3}\d{4,})\b/);
    if (qMatch) quoteNumber = qMatch[1];
  }
  if (!quoteNumber) {
    const fnMatch = file.name.match(/\b(Q[A-Z]{2,3}\d{4,})\b/i);
    if (fnMatch) quoteNumber = fnMatch[1].toUpperCase();
  }

  return { quoteNumber, lineItems };
}

// ============================================================
// Service line detection
// ============================================================

const SERVICE_PRODUCT_NUMBERS = new Set(['9195', '9197', '9198', '0001', '0003']);
const SERVICE_KEYWORDS = /\b(installation|freight|engineering|drawing|permit\s*fee)\b/i;

function isServiceLine(productNumber: string, description: string, weight: number): boolean {
  if (SERVICE_PRODUCT_NUMBERS.has(productNumber)) return true;
  // Product 970 is a tunnel guard UNLESS the description says "PERMIT FEE"
  if (productNumber === '970' && /permit/i.test(description)) return true;
  // Zero-weight lines with service-like descriptions
  if (weight === 0 && SERVICE_KEYWORDS.test(description)) return true;
  return false;
}

// ============================================================
// Description parsing helpers
// ============================================================

/** Parse dimension pattern like '42" X 300"' or '42" x 300"' returning [width, height]. */
function parseDimensionPair(desc: string): { widthIn: number; heightIn: number } | null {
  const m = desc.match(/(\d+)"\s*[Xx×]\s*(\d+)"/);
  if (!m) return null;
  return { widthIn: parseInt(m[1], 10), heightIn: parseInt(m[2], 10) };
}

/** Parse a fractional number like '4 1/2' → 4.5, or '6' → 6 */
function parseFractional(str: string): number | null {
  const m = str.match(/(\d+)(?:\s+(\d+)\/(\d+))?/);
  if (!m) return null;
  const whole = parseInt(m[1], 10);
  if (m[2] && m[3]) {
    return whole + parseInt(m[2], 10) / parseInt(m[3], 10);
  }
  return whole;
}

/** Parse step beam description like 'STEP BEAM 4 1/2" X 96"'. */
function parseStepBeamDesc(desc: string): { profile: number; lengthIn: number } | null {
  const m = desc.match(/STEP\s+BEAM\s+(\d+(?:\s+\d+\/\d+)?)"\s*[Xx×]\s*(\d+)"/i);
  if (!m) return null;
  const profile = parseFractional(m[1]);
  const lengthIn = parseInt(m[2], 10);
  if (profile == null || isNaN(lengthIn)) return null;
  return { profile, lengthIn };
}

/** Parse seamweld/structural beam description. */
function parseStructuralBeamDesc(desc: string): { profile: number; lengthIn: number; channelDesignation?: ChannelDesignation } | null {
  // Pattern: "SEAMWELD BEAM 6 1/2" X 144""
  const seamweld = desc.match(/SEAMWELD\s+BEAM\s+(\d+(?:\s+\d+\/\d+)?)"\s*[Xx×]\s*(\d+)"/i);
  if (seamweld) {
    const profile = parseFractional(seamweld[1]);
    const lengthIn = parseInt(seamweld[2], 10);
    if (profile != null && !isNaN(lengthIn)) {
      return { profile, lengthIn };
    }
  }

  // Pattern: "STRUCTURAL BEAM C68.2 X 120"" or "C445 X 120""
  const structural = desc.match(/(?:STRUCTURAL\s+BEAM|STR\s+BEAM)\s+C(\d+)\.?(\d*)\s*[Xx×]\s*(\d+)"/i);
  if (structural) {
    const channelNum = structural[1];
    const channelDec = structural[2] || '';
    const lengthIn = parseInt(structural[3], 10);
    const channelDesignation = resolveChannelDesignation(channelNum, channelDec);
    const profile = channelDesignation
      ? parseInt(channelNum.charAt(0), 10)
      : parseFloat(`${channelNum}.${channelDec}`) || 0;
    return { profile, lengthIn, channelDesignation };
  }

  return null;
}

/** Resolve compact channel notation (e.g. "68.2" → "C6x8.2", "445" → "C4x4.5") to a ChannelDesignation. */
function resolveChannelDesignation(num: string, dec: string): ChannelDesignation | undefined {
  const full = dec ? `${num}.${dec}` : num;
  // Try direct mappings from known compact forms seen in NAS quotes
  const map: Record<string, ChannelDesignation> = {
    '335': 'C3x3.5',
    '3.35': 'C3x3.5',
    '445': 'C4x4.5',
    '4.45': 'C4x4.5',
    '567': 'C5x6.7',
    '5.67': 'C5x6.7',
    '68': 'C6x8.2',
    '68.2': 'C6x8.2',
    '682': 'C6x8.2',
    '6.82': 'C6x8.2',
    '811': 'C8x11.2',
    '811.2': 'C8x11.2',
    '8112': 'C8x11.2',
    '811.5': 'C8x11.2', // C8x11.5 is close to C8x11.2, treat as same
    '8.112': 'C8x11.2',
  };
  return map[full] ?? map[num] ?? undefined;
}

/** Parse channel designation from frame description like "STR RACK C445 FRAME". */
function parseFrameChannel(desc: string): ChannelDesignation | undefined {
  const m = desc.match(/C(\d+)\.?(\d*)/i);
  if (!m) return undefined;
  return resolveChannelDesignation(m[1], m[2] || '');
}

// ============================================================
// Mapping ParsedLineItem → OrderItem
// ============================================================

function mapLineToOrderItem(line: ParsedLineItem, id: string): OrderItem | null {
  const catalog = PRODUCT_CATALOG[line.productNumber];
  const category = catalog?.category ?? inferCategoryFromDescription(line.description);

  if (!category) return null;

  const dims = parseDimensionPair(line.description);

  const base: OrderItem = {
    id,
    category,
    description: line.description,
    quantity: line.quantity,
    weightPerPieceLbs: line.weightPerPiece || catalog?.defaultWeightLbs || 0,
    lengthIn: 96, // default, overridden below
  };

  if (category === 'frame') {
    base.frameType = catalog?.frameType;
    base.channelDesignation = catalog?.channelDesignation;
    base.rollFormedWidth = catalog?.rollFormedWidth;
    base.bundleKey = catalog?.bundleKey;

    if (dims) {
      base.frameWidthIn = dims.widthIn;
      base.frameHeightIn = dims.heightIn;
      base.lengthIn = dims.heightIn; // frame height = shipping length
    }

    // Try to detect channel from description if not in catalog
    if (!base.channelDesignation) {
      const ch = parseFrameChannel(line.description);
      if (ch) {
        base.channelDesignation = ch;
        base.frameType = 'structural';
      }
    }

    // Auto-set frame depth from channel spec
    if (base.channelDesignation) {
      const depthMap: Record<string, number> = {
        'C3x3.5': 3, 'C4x4.5': 4, 'C5x6.7': 5, 'C6x8.2': 6, 'C8x11.2': 8,
      };
      base.frameDepthIn = depthMap[base.channelDesignation];
    } else if (base.frameType === 'roll-formed') {
      base.frameDepthIn = base.rollFormedWidth ?? 3;
    }
  }

  if (category === 'beam') {
    base.beamType = catalog?.beamType;
    base.beamProfile = catalog?.beamProfile;
    base.beamChannelDesignation = catalog?.beamChannelDesignation;
    base.bundleKey = catalog?.bundleKey;

    // Parse beam dimensions from description
    const stepInfo = parseStepBeamDesc(line.description);
    if (stepInfo) {
      base.beamType = 'step-beam';
      base.beamProfile = stepInfo.profile as StepBeamProfile;
      base.beamLengthIn = stepInfo.lengthIn;
      base.lengthIn = stepInfo.lengthIn;

      // Set bundle key based on profile
      if (!base.bundleKey) {
        if (stepInfo.profile >= 6) base.bundleKey = 'step-beam-large';
        else if (stepInfo.profile >= 4) base.bundleKey = 'step-beam-small';
        else base.bundleKey = 'step-beam-xs';
      }
    }

    const strBeamInfo = parseStructuralBeamDesc(line.description);
    if (strBeamInfo) {
      base.beamType = 'structural-channel';
      if (strBeamInfo.channelDesignation) {
        base.beamChannelDesignation = strBeamInfo.channelDesignation;
      }
      base.beamLengthIn = strBeamInfo.lengthIn;
      base.lengthIn = strBeamInfo.lengthIn;

      if (!base.bundleKey) {
        base.bundleKey = 'channel-beam-large';
      }
    }

    // Seamweld beams without explicit parse (just use dimensions if available)
    if (!stepInfo && !strBeamInfo && dims) {
      base.beamLengthIn = dims.heightIn;
      base.lengthIn = dims.heightIn;
    }
  }

  if (category === 'accessory') {
    base.bundleKey = catalog?.bundleKey;
    base.accessoryWeightLbs = base.weightPerPieceLbs;

    // Try to extract length from description for accessories
    if (dims) {
      base.accessoryWidthIn = dims.widthIn;
      base.accessoryLengthIn = dims.heightIn;
      base.lengthIn = Math.max(dims.widthIn, dims.heightIn);
    } else {
      // Check for single dimension like '42"' or '92"'
      const singleDim = line.description.match(/(\d+)"/);
      if (singleDim) {
        base.lengthIn = parseInt(singleDim[1], 10);
        base.accessoryLengthIn = base.lengthIn;
      }
    }
  }

  return base;
}

/** Infer product category from description text when product number is not in catalog. */
function inferCategoryFromDescription(desc: string): ProductCategory | null {
  const upper = desc.toUpperCase();
  if (/\bFRAME\b|\bRACK\b.*\bFRAME\b|\bUPRIGHT\b|\bPOST\b/.test(upper)) return 'frame';
  if (/\bSTEP\s+BEAM\b|\bSEAMWELD\s+BEAM\b|\bSTRUCTURAL\s+BEAM\b|\bCHANNEL\s+BEAM\b|\bBOX\s+BEAM\b|\bFLOOR\s+SUPPORT\b/.test(upper)) return 'beam';
  if (/\bBEAM\b/.test(upper)) return 'beam';
  // Everything else is an accessory
  return 'accessory';
}
