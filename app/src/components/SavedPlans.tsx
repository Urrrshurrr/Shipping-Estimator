import { useState, useEffect } from 'react';
import { Trash2, Clock, X } from 'lucide-react';
import type { OrderItem, LoadPlan, TrailerType, ParsedQuote } from '../types';
import { loadSavedPlans, savePlan, deleteSavedPlan, type SavedPlan } from '../storage';

interface Props {
  trailerType: TrailerType;
  autoMode: boolean;
  orderItems: OrderItem[];
  loadPlan: LoadPlan | null;
  quote?: ParsedQuote | null;
  onLoadPlan: (plan: SavedPlan) => boolean | void;
  action?: 'save' | 'load' | null;
  onActionHandled?: () => void;
}

export default function SavedPlans({ trailerType, autoMode, orderItems, loadPlan, quote, onLoadPlan, action, onActionHandled }: Props) {
  const [plans, setPlans] = useState<SavedPlan[]>(() => loadSavedPlans());
  const [showList, setShowList] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  // Respond to action triggers from the tab bar.
  // This effect intentionally synchronizes internal UI state from external action props.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!action) return;
    if (action === 'save') {
      const defaultName = quote?.quoteNumber
        ? `Plan - ${quote.quoteNumber}`
        : `Plan - ${new Date().toLocaleDateString()}`;
      setSaveName(defaultName);
      setShowSaveForm(true);
      setShowList(false);
    } else if (action === 'load') {
      setPlans(loadSavedPlans());
      setShowList(true);
      setShowSaveForm(false);
    }
    onActionHandled?.();
  }, [action, onActionHandled, quote?.quoteNumber]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSave = () => {
    if (!saveName.trim()) return;

    const normalized = saveName.trim().toLowerCase();
    const existing = plans.find((p) => p.name.trim().toLowerCase() === normalized);
    if (existing && !window.confirm(`A saved plan named "${existing.name}" already exists. Overwrite it?`)) {
      return;
    }

    const plan: SavedPlan = {
      id: existing?.id ?? `plan-${Date.now()}`,
      name: saveName.trim(),
      trailerType,
      autoMode,
      orderItems,
      loadPlan,
      quote: quote ?? undefined,
      savedAt: new Date().toISOString(),
    };

    const updated = savePlan(plan);
    setPlans(updated);
    setSaveName('');
    setShowSaveForm(false);
  };

  const handleDelete = (id: string) => {
    const updated = deleteSavedPlan(id);
    setPlans(updated);
  };

  const handleLoad = (plan: SavedPlan) => {
    const loaded = onLoadPlan(plan);
    if (loaded !== false) {
      setShowList(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  };

  return (
    <div className="saved-plans-section">
      {/* Save form (triggered from tab bar) */}
      {showSaveForm && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input
            type="text"
            placeholder="Plan name..."
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            style={{ flex: 1, padding: '4px 8px', fontSize: 13 }}
            autoFocus
          />
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={!saveName.trim() || orderItems.length === 0}>
            Save
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setShowSaveForm(false)}>
            <X size={12} />
          </button>
        </div>
      )}

      {/* Saved plans list */}
      {showList && (
        <div className="saved-plans-list">
          {plans.length === 0 ? (
            <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '12px 0' }}>
              No saved plans yet.
            </p>
          ) : (
            plans.map(p => (
              <div key={p.id} className="saved-plan-item">
                <div className="saved-plan-info" onClick={() => handleLoad(p)}>
                  <span className="saved-plan-name">{p.name}</span>
                  <span className="saved-plan-meta">
                    <Clock size={10} /> {formatDate(p.savedAt)}
                    {' · '}{p.orderItems.length} item{p.orderItems.length !== 1 ? 's' : ''}
                    {p.loadPlan && ` · ${p.loadPlan.trucks.length} truck${p.loadPlan.trucks.length !== 1 ? 's' : ''}`}
                  </span>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleDelete(p.id)}
                  title="Delete plan"
                  style={{ color: '#dc2626', padding: '4px 6px' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
