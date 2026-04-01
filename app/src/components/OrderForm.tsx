import { Fragment, useRef, useState } from 'react';
import { Plus, X, Package, Upload, Settings, ChevronUp } from 'lucide-react';
import { FRAME_OPTIONS, BEAM_OPTIONS, ACCESSORY_PRESETS, CHANNEL_SPECS } from '../data';
import ProductLibrary from './ProductLibrary';
import GenericExcelImport from './GenericExcelImport';
import type { OrderItem, ProductCategory } from '../types';

interface Props {
  items: OrderItem[];
  onChange: (items: OrderItem[]) => void;
  onQuoteUpload?: (file: File) => void;
  importStatus?: string | null;
}

let nextId = 1;
function uid() { return `item-${nextId++}`; }

const TYPE_LABELS: Record<ProductCategory, string> = {
  frame: 'Frame',
  beam: 'Beam',
  accessory: 'Acc.',
};

const TYPE_COLORS: Record<ProductCategory, string> = {
  frame: '#3b82f6',
  beam: '#10b981',
  accessory: '#8b5cf6',
};

export default function OrderForm({ items, onChange, onQuoteUpload, importStatus }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onQuoteUpload) {
      onQuoteUpload(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const addItem = (category: ProductCategory) => {
    const newItem: OrderItem = {
      id: uid(),
      category,
      description: '',
      quantity: 1,
      weightPerPieceLbs: 0,
      lengthIn: 96,
    };
    onChange([...items, newItem]);
    setExpandedItemId(newItem.id);
  };

  const updateItem = (id: string, patch: Partial<OrderItem>) => {
    onChange(items.map(i => i.id === id ? { ...i, ...patch } : i));
  };

  const removeItem = (id: string) => {
    onChange(items.filter(i => i.id !== id));
    if (expandedItemId === id) setExpandedItemId(null);
  };

  const applyPreset = (id: string, presetId: string) => {
    const allPresets = [...FRAME_OPTIONS, ...BEAM_OPTIONS, ...ACCESSORY_PRESETS];
    const preset = allPresets.find(p => p.id === presetId);
    if (!preset) return;

    const patch: Partial<OrderItem> = {
      description: preset.label,
      category: preset.category,
      ...preset.defaults,
    };

    if (preset.defaults.beamChannelDesignation) {
      const spec = CHANNEL_SPECS[preset.defaults.beamChannelDesignation];
      if (spec) patch.weightPerPieceLbs = 0;
    }

    if (preset.category === 'frame') {
      if (preset.defaults.frameType === 'structural' && preset.defaults.channelDesignation) {
        const spec = CHANNEL_SPECS[preset.defaults.channelDesignation];
        if (spec) patch.frameDepthIn = spec.depthInches;
      } else if (preset.defaults.frameType === 'roll-formed') {
        patch.frameDepthIn = preset.defaults.rollFormedWidth ?? 3;
      }
    }

    updateItem(id, patch);
  };

  const addItemFromLibrary = (defaults: Partial<OrderItem>) => {
    const newItem: OrderItem = {
      ...defaults,
      category: defaults.category ?? 'accessory',
      description: defaults.description ?? '',
      quantity: defaults.quantity ?? 1,
      weightPerPieceLbs: defaults.weightPerPieceLbs ?? 0,
      lengthIn: defaults.lengthIn ?? 96,
      id: uid(),
    };
    onChange([...items, newItem]);
  };

  const toggleExpand = (id: string) => {
    setExpandedItemId(expandedItemId === id ? null : id);
  };

  const selectedItem = items.find(i => i.id === expandedItemId) ?? null;

  const getDimensionValue = (item: OrderItem): number => {
    if (item.category === 'frame') return item.frameHeightIn ?? item.lengthIn;
    if (item.category === 'beam') return item.beamLengthIn ?? item.lengthIn;
    return item.lengthIn;
  };

  const setDimensionValue = (item: OrderItem, v: number) => {
    if (item.category === 'frame') {
      updateItem(item.id, { frameHeightIn: v, lengthIn: v });
    } else if (item.category === 'beam') {
      updateItem(item.id, { beamLengthIn: v, lengthIn: v });
    } else {
      updateItem(item.id, { lengthIn: v });
    }
  };

  const hasConstraints = (item: OrderItem) =>
    item.nonStackable || item.keepUpright || item.orientationLock || item.maxStackWeightLbs != null;

  return (
    <div className="card">
      <div className="order-header">
        <h2 style={{ margin: 0 }}><Package size={18} /> Order Items {items.length > 0 && <span className="item-count">{items.length}</span>}</h2>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {onQuoteUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button
                className="btn btn-outline btn-sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} /> Upload Quote
              </button>
            </>
          )}
          <GenericExcelImport onImport={(newItems) => onChange([...items, ...newItems])} />
        </div>
      </div>

      {importStatus && (
        <div style={{
          padding: '8px 12px',
          marginTop: 8,
          borderRadius: 6,
          fontSize: 13,
          background: importStatus.startsWith('Import failed') ? '#fef2f2' : '#f0fdf4',
          color: importStatus.startsWith('Import failed') ? '#991b1b' : '#166534',
          border: `1px solid ${importStatus.startsWith('Import failed') ? '#fecaca' : '#bbf7d0'}`,
        }}>
          {importStatus}
        </div>
      )}

      {items.length === 0 && !importStatus && (
        <div className="empty-state">
          <p>No items added yet. Upload a quote or add frames, beams, or accessories below.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="order-table-wrapper">
          <table className="order-table">
            <thead>
              <tr>
                <th className="col-type">Type</th>
                <th className="col-desc">Description</th>
                <th className="col-dim">H/L</th>
                <th className="col-dim">W</th>
                <th className="col-dim">D</th>
                <th className="col-qty">Qty</th>
                <th className="col-wt">Wt/pc</th>
                <th className="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <Fragment key={item.id}>
                  <tr className={`order-table-row${expandedItemId === item.id ? ' expanded' : ''}${hasConstraints(item) ? ' has-constraints' : ''}`}>
                    <td className="col-type">
                      <span className="type-badge" style={{ background: TYPE_COLORS[item.category] }}>
                        {TYPE_LABELS[item.category]}
                      </span>
                    </td>
                    <td className="col-desc" title={item.description || undefined}>
                      <div className="desc-text">{item.description || <em style={{ color: '#9ca3af' }}>No description</em>}</div>
                    </td>
                    <td className="col-dim">
                      <input
                        type="number"
                        className="compact-input"
                        min={1}
                        value={getDimensionValue(item)}
                        onChange={e => setDimensionValue(item, Number(e.target.value))}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="col-dim">
                      {item.category === 'frame' ? (
                        <input
                          type="number"
                          className="compact-input"
                          min={1}
                          value={item.frameWidthIn ?? 42}
                          onChange={e => updateItem(item.id, { frameWidthIn: Number(e.target.value) })}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : item.category === 'accessory' ? (
                        <input
                          type="number"
                          className="compact-input"
                          min={0}
                          placeholder="W"
                          value={item.accessoryWidthIn ?? ''}
                          onChange={e => updateItem(item.id, { accessoryWidthIn: e.target.value ? Number(e.target.value) : undefined })}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : <span className="dim-na">—</span>}
                    </td>
                    <td className="col-dim">
                      {item.category === 'frame' ? (
                        <input
                          type="number"
                          className="compact-input"
                          min={0}
                          value={item.frameDepthIn ?? ''}
                          onChange={e => updateItem(item.id, { frameDepthIn: e.target.value ? Number(e.target.value) : undefined })}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : item.category === 'accessory' ? (
                        <input
                          type="number"
                          className="compact-input"
                          min={0}
                          placeholder="D"
                          value={item.accessoryHeightIn ?? ''}
                          onChange={e => updateItem(item.id, { accessoryHeightIn: e.target.value ? Number(e.target.value) : undefined })}
                          onClick={e => e.stopPropagation()}
                        />
                      ) : <span className="dim-na">—</span>}
                    </td>
                    <td className="col-qty">
                      <input
                        type="number"
                        className="compact-input"
                        min={1}
                        value={item.quantity}
                        onChange={e => updateItem(item.id, { quantity: Math.max(1, Number(e.target.value)) })}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="col-wt">
                      <input
                        type="number"
                        className="compact-input"
                        min={0}
                        step={0.1}
                        value={item.category === 'accessory' ? (item.weightPerPieceLbs || item.accessoryWeightLbs || 0) : item.weightPerPieceLbs}
                        onChange={e => {
                          const v = Number(e.target.value);
                          if (item.category === 'accessory') {
                            updateItem(item.id, { weightPerPieceLbs: v, accessoryWeightLbs: v });
                          } else {
                            updateItem(item.id, { weightPerPieceLbs: v });
                          }
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    </td>
                    <td className="col-actions">
                      <button
                        className="row-action-btn"
                        onClick={() => toggleExpand(item.id)}
                        title="Options"
                      >
                        {expandedItemId === item.id ? <ChevronUp size={14} /> : <Settings size={14} />}
                      </button>
                      <button
                        className="row-action-btn row-action-remove"
                        onClick={() => removeItem(item.id)}
                        title="Remove"
                      >
                        <X size={14} />
                      </button>
                    </td>
                  </tr>
                  {expandedItemId === item.id && (
                    <tr className="detail-row">
                      <td colSpan={8}>
                        <div className="detail-content">
                          {/* Editable description — only after Custom Accessory is selected */}
                          {item.category === 'accessory' && item.description !== '' && !ACCESSORY_PRESETS.some(p => p.id !== 'custom' && p.label === item.description) && (
                            <div className="detail-section">
                              <label className="detail-label">Description</label>
                              <input
                                type="text"
                                className="detail-input"
                                placeholder="Enter item description..."
                                value={item.description}
                                onChange={e => updateItem(item.id, { description: e.target.value })}
                                style={{ width: '100%', padding: '4px 8px', fontSize: 13 }}
                              />
                            </div>
                          )}

                          {/* Product preset selector */}
                          <div className="detail-section">
                            <label className="detail-label">Product Preset</label>
                            <select
                              className="detail-select"
                              value={
                                [...FRAME_OPTIONS, ...BEAM_OPTIONS, ...ACCESSORY_PRESETS]
                                  .find(p => p.label === item.description)?.id ?? ''
                              }
                              onChange={e => applyPreset(item.id, e.target.value)}
                            >
                              <option value="">— Select —</option>
                              {item.category === 'frame' && (
                                <optgroup label="Frames">
                                  {FRAME_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </optgroup>
                              )}
                              {item.category === 'beam' && (
                                <optgroup label="Beams">
                                  {BEAM_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </optgroup>
                              )}
                              {item.category === 'accessory' && (
                                <optgroup label="Accessories">
                                  {ACCESSORY_PRESETS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </optgroup>
                              )}
                            </select>
                          </div>

                          {/* Stacking constraints */}
                          <div className="detail-section">
                            <label className="detail-label">Stacking Constraints</label>
                            <div className="constraints-row">
                              <label className="constraint-toggle">
                                <input
                                  type="checkbox"
                                  checked={item.nonStackable ?? false}
                                  onChange={e => updateItem(item.id, { nonStackable: e.target.checked })}
                                />
                                Non-stackable
                              </label>
                              <label className="constraint-toggle">
                                <input
                                  type="checkbox"
                                  checked={item.keepUpright ?? false}
                                  onChange={e => updateItem(item.id, { keepUpright: e.target.checked })}
                                />
                                Keep upright
                              </label>
                              <label className="constraint-toggle">
                                <input
                                  type="checkbox"
                                  checked={item.orientationLock ?? false}
                                  onChange={e => updateItem(item.id, { orientationLock: e.target.checked })}
                                />
                                Lock orientation
                              </label>
                              <label className="constraint-input">
                                Max stack weight (lbs)
                                <input
                                  type="number"
                                  min={0}
                                  placeholder="No limit"
                                  value={item.maxStackWeightLbs ?? ''}
                                  onChange={e => updateItem(item.id, {
                                    maxStackWeightLbs: e.target.value ? Number(e.target.value) : undefined,
                                  })}
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add buttons */}
      <div className="action-bar">
        <button className="btn btn-primary btn-sm" onClick={() => addItem('frame')}>
          <Plus size={14} /> Frame
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => addItem('beam')}>
          <Plus size={14} /> Beam
        </button>
        <button className="btn btn-outline btn-sm" onClick={() => addItem('accessory')}>
          <Plus size={14} /> Accessory
        </button>
      </div>
      <ProductLibrary
        onAddToOrder={addItemFromLibrary}
        currentItem={selectedItem}
      />
    </div>
  );
}
