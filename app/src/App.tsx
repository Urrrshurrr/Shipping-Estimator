import { useState, useCallback, useEffect, useMemo } from 'react';
import { Calculator, FileDown, FileSpreadsheet, RotateCcw, ClipboardList, Box, Package, Save, FolderOpen } from 'lucide-react';
import TruckSelector from './components/TruckSelector';
import OrderForm from './components/OrderForm';
import LoadPlanResults from './components/LoadPlanResults';
import TruckViewer3D from './components/TruckViewer3D';
import SavedPlans from './components/SavedPlans';
import { calculateLoadPlan, calculateOptimizedLoadPlan } from './algorithm';
import { exportLoadPlanPDF, exportAllLoadingInstructionsPDF } from './pdfExport';
import { exportLoadPlanExcel } from './excelExport';
import { getAllTrailerSpecs } from './data';
import { parseQuoteFile, parsedQuoteToOrderItems } from './quoteParser';
import { loadAutoSave, saveAutoSave, clearAutoSave, onStorageError, type SavedPlan } from './storage';
import type { OrderItem, TrailerType, LoadPlan, ParsedQuote } from './types';

function validateOrderItems(items: OrderItem[]): string[] {
  const errors: string[] = [];
  for (const item of items) {
    if (!item.description.trim()) {
      errors.push('Every item must include a description before calculation.');
      continue;
    }
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      errors.push(`"${item.description}" has an invalid quantity.`);
      continue;
    }
    if (!Number.isFinite(item.lengthIn) || item.lengthIn <= 0) {
      errors.push(`"${item.description}" has an invalid shipping length.`);
      continue;
    }
    if (item.category === 'frame') {
      const width = item.frameWidthIn ?? 0;
      if (!Number.isFinite(width) || width <= 0) {
        errors.push(`"${item.description}" is missing frame width.`);
      }
    }
    if (item.category === 'beam') {
      const beamLength = item.beamLengthIn ?? item.lengthIn;
      if (!Number.isFinite(beamLength) || beamLength <= 0) {
        errors.push(`"${item.description}" is missing beam length.`);
      }
    }
  }
  return errors;
}

function App() {
  const initialAutoSave = useMemo(() => loadAutoSave(), []);

  const [trailerType, setTrailerType] = useState<TrailerType>(initialAutoSave?.trailerType ?? '53-flatbed');
  const [autoMode, setAutoMode] = useState(initialAutoSave?.autoMode ?? false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>(initialAutoSave?.orderItems ?? []);
  const [loadPlan, setLoadPlan] = useState<LoadPlan | null>(initialAutoSave?.loadPlan ?? null);
  const [selectedTrailerLabel, setSelectedTrailerLabel] = useState(
    initialAutoSave?.loadPlan
      ? (getAllTrailerSpecs()[initialAutoSave.trailerType]?.label ?? initialAutoSave.trailerType)
      : '',
  );
  const [viewingTruckIdx, setViewingTruckIdx] = useState(0);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [parsedQuote, setParsedQuote] = useState<ParsedQuote | null>(initialAutoSave?.quote ?? null);
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [appStatus, setAppStatus] = useState<string | null>(null);
  const [storageStatus, setStorageStatus] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<number>(0);
  const [savedPlansAction, setSavedPlansAction] = useState<'save' | 'load' | null>(null);

  useEffect(() => {
    const unsubscribe = onStorageError((error) => {
      setStorageStatus(`Storage ${error.operation} failed for ${error.key}. ${error.message}`);
    });
    return unsubscribe;
  }, []);
  // Auto-save whenever order items or load plan change
  useEffect(() => {
    if (orderItems.length > 0) {
      const timer = window.setTimeout(() => {
        saveAutoSave({
          trailerType,
          autoMode,
          orderItems,
          loadPlan,
          quote: parsedQuote ?? undefined,
          savedAt: new Date().toISOString(),
        });
      }, 800);
      return () => window.clearTimeout(timer);
    }
  }, [trailerType, autoMode, orderItems, loadPlan, parsedQuote]);

  const handleCalculate = () => {
    if (orderItems.length === 0) return;
    const errors = validateOrderItems(orderItems);
    if (errors.length > 0) {
      setAppStatus(errors[0]);
      return;
    }

    const hadManualOverrides = loadPlan?.trucks.some(
      (truck) => !!truck.bundlePositions && Object.keys(truck.bundlePositions).length > 0,
    ) ?? false;
    setAppStatus(null);

    if (autoMode) {
      const { plan, selectedTrailer } = calculateOptimizedLoadPlan(orderItems);
      setLoadPlan(plan);
      setTrailerType(selectedTrailer);
      setSelectedTrailerLabel((getAllTrailerSpecs()[selectedTrailer]?.label ?? selectedTrailer) + ' (auto-selected)');
    } else {
      const plan = calculateLoadPlan(orderItems, trailerType);
      setLoadPlan(plan);
      setSelectedTrailerLabel(getAllTrailerSpecs()[trailerType]?.label ?? trailerType);
    }
    setViewingTruckIdx(0);
    setSelectedBundleId(null);
    setActiveTab(1);

    if (hadManualOverrides) {
      setAppStatus('Recalculation reset manual 3D bundle positions.');
    }
  };

  const handleReset = () => {
    if ((orderItems.length > 0 || loadPlan) && !window.confirm('Reset current order and load plan? Any unsaved changes will be lost.')) {
      return;
    }
    setOrderItems([]);
    setLoadPlan(null);
    setSelectedTrailerLabel('');
    setViewingTruckIdx(0);
    setSelectedBundleId(null);
    setParsedQuote(null);
    setAppStatus(null);
    setImportStatus(null);
    clearAutoSave();
  };

  const handleExportPDF = async () => {
    if (loadPlan) {
      await exportLoadPlanPDF(loadPlan, {
        title: 'NAS Shipping Load Plan',
        quote: parsedQuote ?? undefined,
      });
    }
  };

  const handleExportAllLoadingInstructions = async () => {
    if (loadPlan) {
      await exportAllLoadingInstructionsPDF(loadPlan, {
        quote: parsedQuote ?? undefined,
      });
    }
  };

  const handleExportExcel = () => {
    if (loadPlan) {
      exportLoadPlanExcel(loadPlan, {
        quote: parsedQuote ?? undefined,
      });
    }
  };

  const handleQuoteUpload = async (file: File) => {
    try {
      setImportStatus('Parsing...');
      const quote: ParsedQuote = await parseQuoteFile(file);
      const items = parsedQuoteToOrderItems(quote);
      if (items.length === 0) {
        setImportStatus('No product line items found in this file.');
        return;
      }

      const filteredOut = Math.max(0, quote.lineItems.length - items.length);
      const customerLabel = quote.customerName ?? quote.shipToName ?? 'Unknown customer';
      const replaceNote = orderItems.length > 0 ? '\n\nThis import will replace your current order items.' : '';
      const confirmed = window.confirm(
        `Quote: ${quote.quoteNumber || 'N/A'}\nCustomer: ${customerLabel}\nImportable items: ${items.length}`
          + (filteredOut > 0 ? `\nFiltered service/unsupported lines: ${filteredOut}` : '')
          + replaceNote
          + '\n\nApply this import?',
      );
      if (!confirmed) {
        setImportStatus('Import canceled.');
        return;
      }

      setOrderItems(items);
      setLoadPlan(null);
      setParsedQuote(quote);
      setAppStatus(null);
      const label = quote.quoteNumber ? ` from quote ${quote.quoteNumber}` : '';
      setImportStatus(`Imported ${items.length} item${items.length > 1 ? 's' : ''}${label}`);
    } catch (err) {
      setImportStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const currentTruck = loadPlan?.trucks[viewingTruckIdx] ?? null;

  const handleBundleSelect = useCallback((bundleId: string | null) => {
    setSelectedBundleId(bundleId);
  }, []);

  const handleBundleMove = useCallback((bundleId: string, newPos: { x: number; y: number; z: number }) => {
    setLoadPlan(prev => {
      if (!prev) return prev;
      const trucks = prev.trucks.map((truck, index) => {
        if (index !== viewingTruckIdx) return truck;
        return {
          ...truck,
          bundlePositions: {
            ...(truck.bundlePositions ?? {}),
            [bundleId]: newPos,
          },
        };
      });
      return { ...prev, trucks };
    });
  }, [viewingTruckIdx]);

  const handleLoadSavedPlan = useCallback((saved: SavedPlan): boolean => {
    if ((orderItems.length > 0 || loadPlan) && !window.confirm('Load this saved plan and replace current work?')) {
      return false;
    }
    setTrailerType(saved.trailerType);
    setAutoMode(saved.autoMode);
    setOrderItems(saved.orderItems);
    setLoadPlan(saved.loadPlan);
    setParsedQuote(saved.quote ?? null);
    setViewingTruckIdx(0);
    setSelectedBundleId(null);
    if (saved.loadPlan) {
      setSelectedTrailerLabel(getAllTrailerSpecs()[saved.trailerType]?.label ?? saved.trailerType);
    } else {
      setSelectedTrailerLabel('');
    }
    setImportStatus(null);
    setAppStatus(null);
    return true;
  }, [orderItems.length, loadPlan]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <img src="/NAS_Logo.png" alt="North American Steel" style={{ height: 40 }} />
          <div>
            <h1>NAS Shipping Estimator</h1>
            <p>North American Steel — Load Planning & Shipping</p>
          </div>
        </div>
      </header>

      {storageStatus && (
        <div style={{ margin: '0 20px 12px', padding: '10px 12px', borderRadius: 8, border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', fontSize: 13 }}>
          {storageStatus}
        </div>
      )}

      {appStatus && (
        <div style={{ margin: '0 20px 12px', padding: '10px 12px', borderRadius: 8, border: '1px solid #bfdbfe', background: '#eff6ff', color: '#1e3a8a', fontSize: 13 }}>
          {appStatus}
        </div>
      )}

      {/* Main tab navigation */}
      <div className="main-tab-bar">
        <button
          className={`main-tab ${activeTab === 0 ? 'active' : ''}`}
          onClick={() => setActiveTab(0)}
        >
          <Package size={16} /> Order Entry
        </button>
        <button
          className={`main-tab ${activeTab === 1 ? 'active' : ''} ${!loadPlan ? 'disabled' : ''}`}
          onClick={() => loadPlan && setActiveTab(1)}
          disabled={!loadPlan}
        >
          <ClipboardList size={16} /> Load Plan
        </button>
        <button
          className={`main-tab ${activeTab === 2 ? 'active' : ''} ${!loadPlan ? 'disabled' : ''}`}
          onClick={() => loadPlan && setActiveTab(2)}
          disabled={!loadPlan}
        >
          <Box size={16} /> 3D Truck View
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignSelf: 'center', marginRight: 8 }}>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => { setSavedPlansAction('save'); setActiveTab(0); }}
            disabled={orderItems.length === 0}
          >
            <Save size={14} /> Save Plan
          </button>
          <button
            className="btn btn-outline btn-sm"
            onClick={() => { setSavedPlansAction('load'); setActiveTab(0); }}
          >
            <FolderOpen size={14} /> Load Plan
          </button>
          <button
            className="btn btn-danger btn-sm"
            onClick={handleReset}
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* Tab panels */}
      <div className="tab-panels">
        {/* Tab 0: Order Entry */}
        {activeTab === 0 && (
          <div className="tab-panel tab-panel-order">
            <TruckSelector
              selected={trailerType}
              autoMode={autoMode}
              onSelect={setTrailerType}
              onAutoToggle={setAutoMode}
            />

            <OrderForm
              items={orderItems}
              onChange={setOrderItems}
              onQuoteUpload={handleQuoteUpload}
              importStatus={importStatus}
            />

            <SavedPlans
              trailerType={trailerType}
              autoMode={autoMode}
              orderItems={orderItems}
              loadPlan={loadPlan}
              quote={parsedQuote}
              onLoadPlan={handleLoadSavedPlan}
              action={savedPlansAction}
              onActionHandled={() => setSavedPlansAction(null)}
            />

            <div className="action-bar" style={{ marginTop: 16 }}>
              <button
                className="btn btn-primary btn-block"
                disabled={orderItems.length === 0}
                onClick={handleCalculate}
              >
                <Calculator size={16} /> Calculate Load Plan
              </button>
            </div>

            {loadPlan && (
              <div className="action-bar" style={{ marginTop: 8 }}>
                <button className="btn btn-outline" onClick={() => setActiveTab(1)}>
                  <ClipboardList size={16} /> View Load Plan
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 1: Load Plan Results */}
        {activeTab === 1 && loadPlan && (
          <div className="tab-panel tab-panel-results">
            <div className="results-toolbar">
              <button className="btn btn-outline" onClick={handleExportPDF}>
                <FileDown size={16} /> Export Load Plan PDF
              </button>
              <button className="btn btn-outline" onClick={handleExportExcel}>
                <FileSpreadsheet size={16} /> Export Load Plan Excel
              </button>
              <button className="btn btn-outline" onClick={handleExportAllLoadingInstructions}>
                <ClipboardList size={16} /> Export Loading Instructions
              </button>
              <button className="btn btn-outline" onClick={() => setActiveTab(2)}>
                <Box size={16} /> Open 3D View
              </button>
            </div>

            <LoadPlanResults
              plan={loadPlan}
              selectedTrailer={selectedTrailerLabel}
              selectedBundleId={selectedBundleId}
              onBundleSelect={handleBundleSelect}
              onViewTruck={(idx) => { setViewingTruckIdx(idx); setActiveTab(2); }}
              parsedQuote={parsedQuote}
            />
          </div>
        )}

        {/* Tab 2: 3D Truck View */}
        {activeTab === 2 && loadPlan && currentTruck && (
          <div className="tab-panel tab-panel-3d">
            <div className="viewer-3d-layout">
              {loadPlan.trucks.length > 1 && (
                <div className="truck-sidebar">
                  <div className="truck-sidebar-header">Trucks</div>
                  {loadPlan.trucks.map((_t, i) => (
                    <div
                      key={i}
                      className={`truck-sidebar-item ${i === viewingTruckIdx ? 'active' : ''}`}
                      onClick={() => { setViewingTruckIdx(i); setSelectedBundleId(null); }}
                    >
                      Truck #{i + 1}
                    </div>
                  ))}
                </div>
              )}
              <div className="viewer-3d-fullsize">
                <TruckViewer3D
                  truck={currentTruck}
                  selectedBundleId={selectedBundleId}
                  onBundleSelect={handleBundleSelect}
                  onBundleMove={handleBundleMove}
                />
              </div>
            </div>
          </div>
        )}

        {/* Empty state for disabled tabs */}
        {activeTab === 1 && !loadPlan && (
          <div className="tab-panel">
            <div className="card">
              <div className="empty-state">
                <Calculator size={48} />
                <h2 style={{ fontSize: 18, marginTop: 8 }}>No Load Plan Yet</h2>
                <p>Go to the Order Entry tab, add items, and click "Calculate Load Plan".</p>
              </div>
            </div>
          </div>
        )}
        {activeTab === 2 && !loadPlan && (
          <div className="tab-panel">
            <div className="card">
              <div className="empty-state">
                <Box size={48} />
                <h2 style={{ fontSize: 18, marginTop: 8 }}>No Load Plan Yet</h2>
                <p>Calculate a load plan first to see the 3D truck view.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
