import { useState } from 'react';
import { BookOpen, Plus, Trash2, Download, X } from 'lucide-react';
import type { OrderItem } from '../types';
import {
  loadProductLibrary,
  addProductToLibrary,
  removeProductFromLibrary,
  type LibraryProduct,
} from '../storage';

interface Props {
  onAddToOrder: (defaults: Partial<OrderItem>) => void;
  /** Currently selected order item, for "Save to Library" */
  currentItem?: OrderItem | null;
}

export default function ProductLibrary({ onAddToOrder, currentItem }: Props) {
  const [open, setOpen] = useState(false);
  const [products, setProducts] = useState<LibraryProduct[]>(() => loadProductLibrary());
  const [saveName, setSaveName] = useState('');
  const [showSaveForm, setShowSaveForm] = useState(false);

  const handleSaveToLibrary = () => {
    if (!currentItem || !saveName.trim()) return;

    const { id: _unusedId, quantity: _unusedQty, ...defaults } = currentItem;
    void _unusedId; void _unusedQty;
    const product: LibraryProduct = {
      id: `lib-${Date.now()}`,
      name: saveName.trim(),
      category: currentItem.category,
      defaults: { ...defaults, quantity: 1 },
      createdAt: new Date().toISOString(),
    };

    const updated = addProductToLibrary(product);
    setProducts(updated);
    setSaveName('');
    setShowSaveForm(false);
  };

  const handleRemove = (id: string) => {
    const updated = removeProductFromLibrary(id);
    setProducts(updated);
  };

  const handleQuickAdd = (product: LibraryProduct) => {
    onAddToOrder({
      category: product.category,
      ...product.defaults,
    });
  };

  if (!open) {
    return (
      <div style={{ marginTop: 10 }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => setOpen(true)}
          title="Product Library"
        >
          <BookOpen size={14} /> Product Library ({products.length})
        </button>
      </div>
    );
  }

  return (
    <div className="product-library-panel">
      <div className="product-library-header">
        <h3><BookOpen size={16} /> Product Library</h3>
        <button className="info-panel-close" onClick={() => setOpen(false)} title="Close">
          <X size={16} />
        </button>
      </div>

      {/* Save current item */}
      {currentItem && (
        <div style={{ marginBottom: 12 }}>
          {showSaveForm ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="text"
                placeholder="Product name..."
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSaveToLibrary()}
                style={{ flex: 1, padding: '4px 8px', fontSize: 13 }}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={handleSaveToLibrary} disabled={!saveName.trim()}>
                Save
              </button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowSaveForm(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn btn-outline btn-sm" onClick={() => {
              setSaveName(currentItem.description || '');
              setShowSaveForm(true);
            }}>
              <Plus size={14} /> Save Current Item to Library
            </button>
          )}
        </div>
      )}

      {/* Library list */}
      {products.length === 0 ? (
        <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', padding: '12px 0' }}>
          No saved products yet. Select an order item and save it here for quick reuse.
        </p>
      ) : (
        <div className="product-library-list">
          {products.map(p => (
            <div key={p.id} className="product-library-item">
              <div className="product-library-item-info">
                <span className="product-library-item-name">{p.name}</span>
                <span className="badge badge-info">{p.category}</span>
              </div>
              <div className="product-library-item-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => handleQuickAdd(p)}
                  title="Add to order"
                >
                  <Download size={12} /> Add
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => handleRemove(p.id)}
                  title="Remove from library"
                  style={{ color: '#dc2626' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
