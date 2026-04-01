import { useState, useCallback, useEffect } from 'react';
import { Calculator, FileDown, FileSpreadsheet, RotateCcw, ClipboardList, Box, Package, Save, FolderOpen } from 'lucide-react';
import TruckSelector from './components/TruckSelector';
import OrderForm from './components/OrderForm';
import LoadPlanResults from './components/LoadPlanResults';
import TruckViewer3D from './components/TruckViewer3D';
import SavedPlans from './components/SavedPlans';
import { calculateLoadPlan, calculateOptimizedLoadPlan } from './algorithm';
import { exportLoadPlanPDF, exportAllLoadingInstructionsPDF } from './pdfExport';
import { exportLoadPlanExcel } from './excelExport';
import { TRAILER_SPECS, getAllTrailerSpecs } from './data';
import { parseQuoteFile, parsedQuoteToOrderItems } from './quoteParser';
import { loadAutoSave, saveAutoSave, clearAutoSave, type SavedPlan } from './storage';
import type { OrderItem, TrailerType, LoadPlan, ParsedQuote, TruckLoad } from './types';

function App() {
  const [trailerType, setTrailerType] = useState<TrailerType>('53-flatbed');
  const [autoMode, setAutoMode] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadPlan, setLoadPlan] = useState<LoadPlan | null>(null);
  const [selectedTrailerLabel, setSelectedTrailerLabel] = useState('');
  const [viewingTruckIdx, setViewingTruckIdx] = useState(0);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [parsedQuote, setParsedQuote] = useState<ParsedQuote | null>(null);
  const [selectedBundleId, setSelectedBundleId] = useState<string | null>(null);
  const [bundlePositions, setBundlePositions] = useState<Record<number, Record<string, { x: number; y: number; z: number }>>>({});

  const [activeTab, setActiveTab] = useState<number>(0);
  const [savedPlansAction, setSavedPlansAction] = useState<'save' | 'load' | null>(null);



  // Restore auto-saved state on mount
  useEffect(() => {
    const saved = loadAutoSave();
    if (saved && saved.orderItems.length > 0) {
      setTrailerType(saved.trailerType);
      setAutoMode(saved.autoMode);
      setOrderItems(saved.orderItems);
      setLoadPlan(saved.loadPlan);
      setParsedQuote(saved.quote ?? null);
      if (saved.loadPlan) {
        setSelectedTrailerLabel(getAllTrailerSpecs()[saved.trailerType]?.label ?? saved.trailerType);
      }
    }
  }, []);

  // Auto-save whenever order items or load plan change
  useEffect(() => {
    if (orderItems.length > 0) {
      saveAutoSave({
        trailerType,
        autoMode,
        orderItems,
        loadPlan,
        quote: parsedQuote ?? undefined,
        savedAt: new Date().toISOString(),
      });
    }
  }, [trailerType, autoMode, orderItems, loadPlan, parsedQuote]);

  const handleCalculate = () => {
    if (orderItems.length === 0) return;

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
    setBundlePositions({});
    setActiveTab(1);
  };

  const handleReset = () => {
    setOrderItems([]);
    setLoadPlan(null);
    setSelectedTrailerLabel('');
    setViewingTruckIdx(0);
    setSelectedBundleId(null);
    setBundlePositions({});
    setParsedQuote(null);
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
      setOrderItems(items);
      setLoadPlan(null);
      setParsedQuote(quote);
      const label = quote.quoteNumber ? ` from quote ${quote.quoteNumber}` : '';
      setImportStatus(`Imported ${items.length} item${items.length > 1 ? 's' : ''}${label}`);
    } catch (err) {
      setImportStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const currentTruck = loadPlan?.trucks[viewingTruckIdx] ?? null;

  // Apply position overrides to the current truck
  const currentTruckWithPositions: TruckLoad | null = currentTruck
    ? { ...currentTruck, bundlePositions: bundlePositions[viewingTruckIdx] }
    : null;

  // Recalculate truck stats from bundles
  const recalcTruckStats = (truck: TruckLoad): TruckLoad => {
    const trailer = getAllTrailerSpecs()[truck.trailerType] ?? TRAILER_SPECS['53-flatbed'];
    const totalDeckLength = trailer.isMultiDeck
      ? ((trailer.leadDeckLengthFt ?? 28) + (trailer.pupDeckLengthFt ?? 32)) * 12
      : trailer.deckLengthFt * 12;
    const maxWidth = trailer.internalWidthIn;
    const totalWeight = truck.bundles.reduce((s, b) => s + b.totalWeightLbs, 0);
    const usedArea = truck.bundles.reduce((s, b) => s + b.lengthIn * b.widthIn, 0);
    const totalArea = totalDeckLength * maxWidth;
    return {
      ...truck,
      totalWeightLbs: totalWeight,
      weightUtilisation: (totalWeight / trailer.maxPayloadLbs) * 100,
      areaUtilisation: totalArea > 0 ? Math.min((usedArea / totalArea) * 100, 100) : 0,
    };
  };

  const handleBundleSelect = useCallback((bundleId: string | null) => {
    setSelectedBundleId(bundleId);
  }, []);

  const handleBundleMove = useCallback((bundleId: string, newPos: { x: number; y: number; z: number }) => {
    setBundlePositions(prev => ({
      ...prev,
      [viewingTruckIdx]: {
        ...prev[viewingTruckIdx],
        [bundleId]: newPos,
      },
    }));
  }, [viewingTruckIdx]);

  const handleMoveBundleToTruck = useCallback((bundleId: string, targetTruckIdx: number) => {
    if (!loadPlan) return;
    const sourceTruckIdx = viewingTruckIdx;
    const sourceTruck = loadPlan.trucks[sourceTruckIdx];
    const targetTruck = loadPlan.trucks[targetTruckIdx];
    if (!sourceTruck || !targetTruck) return;

    const bundle = sourceTruck.bundles.find(b => b.id === bundleId);
    if (!bundle) return;

    // Check weight capacity on target
    const trailer = getAllTrailerSpecs()[targetTruck.trailerType] ?? TRAILER_SPECS['53-flatbed'];
    if (targetTruck.totalWeightLbs + bundle.totalWeightLbs > trailer.maxPayloadLbs) return;

    const newTrucks = loadPlan.trucks.map((t, i) => {
      if (i === sourceTruckIdx) return recalcTruckStats({ ...t, bundles: t.bundles.filter(b => b.id !== bundleId) });
      if (i === targetTruckIdx) return recalcTruckStats({ ...t, bundles: [...t.bundles, bundle] });
      return t;
    }).filter(t => t.bundles.length > 0).map((t, i) => ({ ...t, truckIndex: i }));

    setLoadPlan({ ...loadPlan, trucks: newTrucks });
    setSelectedBundleId(null);

    // Clear position overrides for moved bundle
    setBundlePositions(prev => {
      const updated = { ...prev };
      if (updated[sourceTruckIdx]) {
        const { [bundleId]: _removed, ...rest } = updated[sourceTruckIdx];
        void _removed;
        updated[sourceTruckIdx] = rest;
      }
      return updated;
    });

    // Switch to target truck view (adjust index after filtering)
    const newIdx = newTrucks.findIndex(t =>
      t.bundles.some(b => b.id === bundleId)
    );
    setViewingTruckIdx(newIdx >= 0 ? newIdx : 0);
  }, [loadPlan, viewingTruckIdx]);

  const handleLoadSavedPlan = useCallback((saved: SavedPlan) => {
    setTrailerType(saved.trailerType);
    setAutoMode(saved.autoMode);
    setOrderItems(saved.orderItems);
    setLoadPlan(saved.loadPlan);
    setParsedQuote(saved.quote ?? null);
    setViewingTruckIdx(0);
    setSelectedBundleId(null);
    setBundlePositions({});
    if (saved.loadPlan) {
      setSelectedTrailerLabel(getAllTrailerSpecs()[saved.trailerType]?.label ?? saved.trailerType);
    } else {
      setSelectedTrailerLabel('');
    }
    setImportStatus(null);
  }, []);

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
        {activeTab === 2 && loadPlan && currentTruckWithPositions && (
          <div className="tab-panel tab-panel-3d">
            {loadPlan.trucks.length > 1 && (
              <div className="tab-bar" style={{ marginBottom: 8 }}>
                {loadPlan.trucks.map((_t, i) => (
                  <div
                    key={i}
                    className={`tab ${i === viewingTruckIdx ? 'active' : ''}`}
                    onClick={() => { setViewingTruckIdx(i); setSelectedBundleId(null); }}
                  >
                    Truck #{i + 1}
                  </div>
                ))}
              </div>
            )}
            <div className="viewer-3d-fullsize">
              <TruckViewer3D
                truck={currentTruckWithPositions}
                selectedBundleId={selectedBundleId}
                onBundleSelect={handleBundleSelect}
                onBundleMove={handleBundleMove}
                allTrucks={loadPlan.trucks}
                currentTruckIndex={viewingTruckIdx}
                onMoveBundleToTruck={handleMoveBundleToTruck}
              />
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
