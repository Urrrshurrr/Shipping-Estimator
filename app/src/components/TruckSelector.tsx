import { useState } from 'react';
import { Truck, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import { TRAILER_SPECS, getAllTrailerSpecs } from '../data';
import { addCustomTrailer, updateCustomTrailer, deleteCustomTrailer } from '../storage';
import type { TrailerType, TrailerSpec, BuiltInTrailerType } from '../types';

interface Props {
  selected: TrailerType;
  autoMode: boolean;
  onSelect: (t: TrailerType) => void;
  onAutoToggle: (v: boolean) => void;
}

const builtInOrder: BuiltInTrailerType[] = ['53-flatbed', '53-roll-tite', 'b-train', '53-closed-van'];

const emptyCustom: Omit<TrailerSpec, 'type'> = {
  label: '',
  deckLengthFt: 53,
  internalWidthIn: 102,
  internalHeightIn: 102,
  maxPayloadLbs: 48000,
  kingpinPositionIn: 0,
  rearAxlePositionIn: 536,
  maxKingpinWeightLbs: 12000,
  maxAxleWeightLbs: 34000,
  pupMaxAxleWeightLbs: 34000,
  isCustom: true,
};

function TrailerEditor({ initial, onSave, onCancel }: {
  initial?: TrailerSpec;
  onSave: (spec: TrailerSpec) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Omit<TrailerSpec, 'type'>>(
    initial ? { ...initial } : { ...emptyCustom }
  );

  const set = (field: string, value: number | string | boolean) =>
    setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.label.trim()) return;

    if (form.isMultiDeck) {
      const lead = form.leadDeckLengthFt ?? 0;
      const pup = form.pupDeckLengthFt ?? 0;
      const pupAxle = form.pupAxlePositionIn ?? 0;
      const pupMax = form.pupMaxAxleWeightLbs ?? 0;
      if (lead <= 0 || pup <= 0 || pupAxle <= 0 || pupMax <= 0) {
        window.alert('Multi-deck trailers require lead/pup lengths, pup axle position, and pup axle max weight.');
        return;
      }
    }

    const type = initial?.type ?? `custom-${Date.now()}`;
    const deckLengthFt = form.isMultiDeck
      ? (form.leadDeckLengthFt ?? 0) + (form.pupDeckLengthFt ?? 0)
      : form.deckLengthFt;
    onSave({ ...form, deckLengthFt, type, isCustom: true });
  };

  return (
    <form onSubmit={handleSubmit} className="trailer-editor">
      <div className="trailer-editor-header">
        <h3>{initial ? 'Edit' : 'New'} Custom Trailer</h3>
        <button type="button" className="info-panel-close" onClick={onCancel}><X size={16} /></button>
      </div>

      <div className="form-group">
        <label>Trailer Name *</label>
        <input type="text" value={form.label} onChange={e => set('label', e.target.value)} required />
      </div>

      <div className="form-row">
        <div>
          <label>Deck Length (ft)</label>
          <input type="number" value={form.deckLengthFt} min={10} max={100}
            onChange={e => set('deckLengthFt', +e.target.value)} />
        </div>
        <div>
          <label>Max Payload (lbs)</label>
          <input type="number" value={form.maxPayloadLbs} min={1000} max={200000}
            onChange={e => set('maxPayloadLbs', +e.target.value)} />
        </div>
      </div>

      <div className="form-row-3">
        <div>
          <label>Width (in)</label>
          <input type="number" value={form.internalWidthIn} min={48} max={120}
            onChange={e => set('internalWidthIn', +e.target.value)} />
        </div>
        <div>
          <label>Height (in)</label>
          <input type="number" value={form.internalHeightIn} min={48} max={168}
            onChange={e => set('internalHeightIn', +e.target.value)} />
        </div>
        <div>
          <label>Kingpin Pos (in)</label>
          <input type="number" value={form.kingpinPositionIn} min={0} max={200}
            onChange={e => set('kingpinPositionIn', +e.target.value)} />
        </div>
      </div>

      <div className="form-row-3">
        <div>
          <label>Rear Axle Pos (in)</label>
          <input type="number" value={form.rearAxlePositionIn} min={100} max={900}
            onChange={e => set('rearAxlePositionIn', +e.target.value)} />
        </div>
        <div>
          <label>Max Kingpin (lbs)</label>
          <input type="number" value={form.maxKingpinWeightLbs} min={1000} max={50000}
            onChange={e => set('maxKingpinWeightLbs', +e.target.value)} />
        </div>
        <div>
          <label>Max Axle (lbs)</label>
          <input type="number" value={form.maxAxleWeightLbs} min={1000} max={80000}
            onChange={e => set('maxAxleWeightLbs', +e.target.value)} />
        </div>
      </div>

      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input type="checkbox" checked={form.isMultiDeck ?? false}
            onChange={e => set('isMultiDeck', e.target.checked)}
            style={{ width: 16, height: 16 }} />
          Multi-deck (B-Train style)
        </label>
      </div>

      {form.isMultiDeck && (
        <div className="form-row-3">
          <div>
            <label>Lead Deck (ft)</label>
            <input type="number" value={form.leadDeckLengthFt ?? 28} min={10} max={60}
              onChange={e => set('leadDeckLengthFt', +e.target.value)} />
          </div>
          <div>
            <label>Pup Deck (ft)</label>
            <input type="number" value={form.pupDeckLengthFt ?? 32} min={10} max={60}
              onChange={e => set('pupDeckLengthFt', +e.target.value)} />
          </div>
          <div>
            <label>Pup Axle Pos (in)</label>
            <input type="number" value={form.pupAxlePositionIn ?? 284} min={50} max={500}
              onChange={e => set('pupAxlePositionIn', +e.target.value)} />
          </div>
        </div>
      )}

      {form.isMultiDeck && (
        <div className="form-row" style={{ marginTop: 8 }}>
          <div>
            <label>Pup Max Axle (lbs)</label>
            <input type="number" value={form.pupMaxAxleWeightLbs ?? 34000} min={1000} max={80000}
              onChange={e => set('pupMaxAxleWeightLbs', +e.target.value)} />
          </div>
          <div>
            <label>Total Deck Length (ft)</label>
            <input type="number" value={(form.leadDeckLengthFt ?? 0) + (form.pupDeckLengthFt ?? 0)} disabled />
          </div>
        </div>
      )}

      <div className="action-bar" style={{ marginTop: 12 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!form.label.trim()}>
          <Save size={14} /> {initial ? 'Update' : 'Create'} Trailer
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function TruckSelector({ selected, autoMode, onSelect, onAutoToggle }: Props) {
  const [showEditor, setShowEditor] = useState(false);
  const [editingTrailer, setEditingTrailer] = useState<TrailerSpec | undefined>(undefined);
  const [, setRefresh] = useState(0);

  const allSpecs = getAllTrailerSpecs();
  const customKeys = Object.keys(allSpecs).filter(k => allSpecs[k].isCustom);

  const handleSave = (spec: TrailerSpec) => {
    if (editingTrailer) {
      updateCustomTrailer(spec.type, spec);
    } else {
      addCustomTrailer(spec);
    }
    setShowEditor(false);
    setEditingTrailer(undefined);
    setRefresh(n => n + 1);
    onSelect(spec.type);
    onAutoToggle(false);
  };

  const handleDelete = (type: string) => {
    deleteCustomTrailer(type);
    setRefresh(n => n + 1);
    if (selected === type) {
      onSelect('53-flatbed');
    }
  };

  const handleEdit = (spec: TrailerSpec) => {
    setEditingTrailer(spec);
    setShowEditor(true);
  };

  return (
    <div className="card">
      <h2><Truck size={18} /> Select Trailer Type</h2>

      <div className="truck-options">
        {builtInOrder.map(tt => {
          const spec = TRAILER_SPECS[tt];
          return (
            <div
              key={tt}
              className={`truck-option ${!autoMode && selected === tt ? 'selected' : ''}`}
              onClick={() => { onAutoToggle(false); onSelect(tt); }}
              style={autoMode ? { opacity: 0.5 } : undefined}
            >
              <div className="truck-name">{spec.label}</div>
              <div className="truck-detail">
                {spec.deckLengthFt}' &middot; {spec.maxPayloadLbs.toLocaleString()} lbs
              </div>
            </div>
          );
        })}
        {customKeys.map(key => {
          const spec = allSpecs[key];
          return (
            <div
              key={key}
              className={`truck-option ${!autoMode && selected === key ? 'selected' : ''}`}
              onClick={() => { onAutoToggle(false); onSelect(key); }}
              style={autoMode ? { opacity: 0.5 } : undefined}
            >
              <div className="truck-name">{spec.label}</div>
              <div className="truck-detail">
                {spec.deckLengthFt}' &middot; {spec.maxPayloadLbs.toLocaleString()} lbs
              </div>
              <div className="truck-option-actions" onClick={e => e.stopPropagation()}>
                <button className="btn btn-sm btn-outline" onClick={() => handleEdit(spec)}
                  title="Edit" style={{ padding: '2px 5px' }}>
                  <Pencil size={12} />
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => handleDelete(key)}
                  title="Delete" style={{ padding: '2px 5px', color: 'var(--color-danger)' }}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showEditor ? (
        <TrailerEditor
          initial={editingTrailer}
          onSave={handleSave}
          onCancel={() => { setShowEditor(false); setEditingTrailer(undefined); }}
        />
      ) : (
        <button
          className="btn btn-outline btn-sm"
          style={{ marginTop: 10 }}
          onClick={() => { setEditingTrailer(undefined); setShowEditor(true); }}
        >
          <Plus size={14} /> Add Custom Trailer
        </button>
      )}

      <label className="auto-select-toggle">
        <input
          type="checkbox"
          checked={autoMode}
          onChange={e => onAutoToggle(e.target.checked)}
        />
        Auto-select best trailer type for my order
      </label>
    </div>
  );
}
