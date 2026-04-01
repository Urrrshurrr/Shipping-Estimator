import { useState, useRef } from 'react';
import { FileSpreadsheet, X, Upload, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { OrderItem, ProductCategory } from '../types';

interface Props {
  onImport: (items: OrderItem[]) => void;
}

interface ColumnMapping {
  description: string;
  quantity: string;
  weight: string;
  length: string;
  category: string;
}

const ALL_FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: 'description', label: 'Description', required: true },
  { key: 'quantity', label: 'Quantity', required: true },
  { key: 'weight', label: 'Weight per Piece (lbs)', required: false },
  { key: 'length', label: 'Length (inches)', required: false },
  { key: 'category', label: 'Category (frame/beam/accessory)', required: false },
];

let importId = Date.now();

export default function GenericExcelImport({ onImport }: Props) {
  const [open, setOpen] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [allRows, setAllRows] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    description: '',
    quantity: '',
    weight: '',
    length: '',
    category: '',
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const workbookRef = useRef<XLSX.WorkBook | null>(null);

  const reset = () => {
    setOpen(false);
    setSheetNames([]);
    setSelectedSheet('');
    setHeaders([]);
    setPreviewRows([]);
    setAllRows([]);
    setMapping({ description: '', quantity: '', weight: '', length: '', category: '' });
    workbookRef.current = null;
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
      workbookRef.current = wb;
      setSheetNames(wb.SheetNames);
      selectSheet(wb, wb.SheetNames[0]);
      setOpen(true);
    } catch (err) {
      reset();
      alert(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const selectSheet = (wb: XLSX.WorkBook, name: string) => {
    setSelectedSheet(name);
    const sheet = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    setAllRows(rows);
    setPreviewRows(rows.slice(0, 5));

    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      setHeaders(cols);
      autoMapColumns(cols);
    }
  };

  const autoMapColumns = (cols: string[]) => {
    const lower = cols.map(c => c.toLowerCase());
    const find = (patterns: string[]) =>
      cols[lower.findIndex(l => patterns.some(p => l.includes(p)))] ?? '';

    setMapping({
      description: find(['description', 'desc', 'name', 'item', 'product']),
      quantity: find(['quantity', 'qty', 'count', 'amount']),
      weight: find(['weight', 'lbs', 'mass', 'gross weight']),
      length: find(['length', 'size', 'dimension']),
      category: find(['category', 'type', 'group']),
    });
  };

  const handleImport = () => {
    const items: OrderItem[] = [];

    for (const row of allRows) {
      const desc = String(row[mapping.description] ?? '').trim();
      const qtyRaw = Number(row[mapping.quantity]) || 0;
      if (!desc || qtyRaw <= 0) continue;

      const weight = mapping.weight ? (Number(row[mapping.weight]) || 0) : 0;
      const length = mapping.length ? (Number(row[mapping.length]) || 96) : 96;
      const catStr = mapping.category ? String(row[mapping.category] ?? '').toLowerCase().trim() : '';

      let category: ProductCategory = 'accessory';
      if (catStr.includes('frame') || catStr.includes('upright')) category = 'frame';
      else if (catStr.includes('beam')) category = 'beam';

      items.push({
        id: `generic-${importId++}`,
        category,
        description: desc,
        quantity: qtyRaw,
        weightPerPieceLbs: weight,
        lengthIn: length,
      });
    }

    if (items.length > 0) {
      onImport(items);
    }
    reset();
  };

  const isValid = mapping.description && mapping.quantity;

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      <button
        className="btn btn-outline btn-sm"
        onClick={() => fileRef.current?.click()}
        title="Import from Excel with column mapping"
      >
        <FileSpreadsheet size={14} /> Import Excel
      </button>

      {open && (
        <div className="excel-import-overlay">
          <div className="excel-import-dialog">
            <div className="excel-import-header">
              <h3><FileSpreadsheet size={16} /> Excel Import — Column Mapping</h3>
              <button className="info-panel-close" onClick={reset}><X size={16} /></button>
            </div>

            {/* Sheet selector */}
            {sheetNames.length > 1 && (
              <div className="form-group">
                <label>Sheet</label>
                <select
                  value={selectedSheet}
                  onChange={e => workbookRef.current && selectSheet(workbookRef.current, e.target.value)}
                >
                  {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}

            {/* Column mapping */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'block' }}>Map Columns</label>
              {ALL_FIELDS.map(f => (
                <div key={f.key} className="form-row" style={{ marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, minWidth: 140 }}>
                      {f.label}{f.required && <span style={{ color: '#dc2626' }}> *</span>}
                    </span>
                    <ArrowRight size={12} style={{ color: '#9ca3af' }} />
                    <select
                      value={mapping[f.key]}
                      onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })}
                      style={{ flex: 1 }}
                    >
                      <option value="">— None —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            {/* Preview */}
            {previewRows.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, display: 'block' }}>
                  Preview ({allRows.length} rows total)
                </label>
                <div style={{ overflowX: 'auto', maxHeight: 150 }}>
                  <table className="bundle-table" style={{ fontSize: 11 }}>
                    <thead>
                      <tr>
                        {headers.slice(0, 6).map(h => <th key={h}>{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i}>
                          {headers.slice(0, 6).map(h => (
                            <td key={h}>{String(row[h] ?? '')}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-outline btn-sm" onClick={reset}>Cancel</button>
              <button
                className="btn btn-primary btn-sm"
                onClick={handleImport}
                disabled={!isValid}
              >
                <Upload size={14} /> Import {allRows.length} Items
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
