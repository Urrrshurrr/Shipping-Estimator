import { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle, Download } from 'lucide-react';
import type { LoadPlan, TruckLoad, AxleWeightResult, ParsedQuote } from '../types';
import { calculateAxleWeights, computeBundleLayoutPositions, generateLoadingSequence, calculateStrappingRequirements } from '../algorithm';
import { exportLoadingInstructionsPDF } from '../pdfExport';
import { TRAILER_SPECS, getAllTrailerSpecs } from '../data';
interface Props {
  plan: LoadPlan;
  selectedTrailer?: string;
  selectedBundleId: string | null;
  onBundleSelect: (id: string | null) => void;
  onViewTruck: (truckIndex: number) => void;
  parsedQuote?: ParsedQuote | null;
}

function UtilBar({ pct, label }: { pct: number; label: string }) {
  const color = pct < 70 ? 'green' : pct < 90 ? 'yellow' : 'red';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280' }}>
        <span>{label}</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="utilisation-bar">
        <div className={`utilisation-fill ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

function WeightDistributionDiagram({ axleWeights, truck }: { axleWeights: AxleWeightResult; truck: TruckLoad }) {
  const trailer = getAllTrailerSpecs()[truck.trailerType] ?? TRAILER_SPECS['53-flatbed'];
  const deckLengthIn = trailer.deckLengthFt * 12;
  const cgPct = axleWeights.centerOfGravity.longitudinalPct;
  const isBtrain = trailer.isMultiDeck && axleWeights.pupAxleWeightLbs != null;

  // Proportional positions for SVG
  const svgWidth = 400;
  const svgHeight = 100;
  const trailerLeft = 40;
  const trailerRight = svgWidth - 40;
  const trailerW = trailerRight - trailerLeft;
  const deckY = 42;

  const kpX = trailerLeft + (trailer.kingpinPositionIn / deckLengthIn) * trailerW;
  const axleX = trailerLeft + (trailer.rearAxlePositionIn / deckLengthIn) * trailerW;
  const cgX = trailerLeft + (cgPct / 100) * trailerW;

  const kpColor = axleWeights.kingpinOverweight ? '#dc2626' : '#16a34a';
  const axleColor = axleWeights.rearAxleOverweight ? '#dc2626' : '#16a34a';

  // B-train: pintle hitch and pup axle positions
  const leadLenIn = isBtrain ? (trailer.leadDeckLengthFt ?? 28) * 12 : 0;
  const pupAxleAbsolute = isBtrain ? leadLenIn + (trailer.pupAxlePositionIn ?? 284) : 0;
  const pintleX = isBtrain ? trailerLeft + (leadLenIn / deckLengthIn) * trailerW : 0;
  const pupAxleX = isBtrain ? trailerLeft + (pupAxleAbsolute / deckLengthIn) * trailerW : 0;
  const pupAxleColor = axleWeights.pupAxleOverweight ? '#dc2626' : '#16a34a';

  return (
    <div className="weight-distribution-diagram">
      <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
        Axle Weight Distribution
      </div>
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" style={{ maxWidth: svgWidth }}>
        {/* Trailer body */}
        {isBtrain ? (
          <>
            {/* Lead deck */}
            <rect x={trailerLeft} y={deckY - 16} width={pintleX - trailerLeft - 2} height={20} rx={3}
              fill="#e5e7eb" stroke="#9ca3af" strokeWidth={1} />
            {/* Pup deck */}
            <rect x={pintleX + 2} y={deckY - 16} width={trailerRight - pintleX - 2} height={20} rx={3}
              fill="#dbeafe" stroke="#9ca3af" strokeWidth={1} />
            {/* Pintle hitch */}
            <circle cx={pintleX} cy={deckY - 6} r={3} fill="#6b7280" />
          </>
        ) : (
          <rect x={trailerLeft} y={deckY - 16} width={trailerW} height={20} rx={3}
            fill="#e5e7eb" stroke="#9ca3af" strokeWidth={1} />
        )}

        {/* Kingpin */}
        <line x1={kpX} y1={deckY + 4} x2={kpX} y2={deckY + 16} stroke={kpColor} strokeWidth={3} />
        <circle cx={kpX} cy={deckY + 18} r={4} fill={kpColor} />

        {/* Rear axle (lead axle for B-train) */}
        <line x1={axleX - 8} y1={deckY + 4} x2={axleX + 8} y2={deckY + 4} stroke={axleColor} strokeWidth={2} />
        <circle cx={axleX - 6} cy={deckY + 12} r={5} fill={axleColor} />
        <circle cx={axleX + 6} cy={deckY + 12} r={5} fill={axleColor} />

        {/* B-train pup axle */}
        {isBtrain && (
          <>
            <line x1={pupAxleX - 8} y1={deckY + 4} x2={pupAxleX + 8} y2={deckY + 4} stroke={pupAxleColor} strokeWidth={2} />
            <circle cx={pupAxleX - 6} cy={deckY + 12} r={5} fill={pupAxleColor} />
            <circle cx={pupAxleX + 6} cy={deckY + 12} r={5} fill={pupAxleColor} />
          </>
        )}

        {/* CG marker */}
        {truck.totalWeightLbs > 0 && (
          <>
            <line x1={cgX} y1={deckY - 22} x2={cgX} y2={deckY - 16} stroke="#f59e0b" strokeWidth={2} />
            <polygon
              points={`${cgX},${deckY - 16} ${cgX - 5},${deckY - 24} ${cgX + 5},${deckY - 24}`}
              fill="#f59e0b"
            />
            <text x={cgX} y={deckY - 28} textAnchor="middle" fontSize={8} fill="#92400e" fontWeight={600}>CG</text>
          </>
        )}

        {/* Kingpin label */}
        <text x={kpX} y={deckY + 34} textAnchor="middle" fontSize={8} fill={kpColor} fontWeight={600}>
          {Math.round(axleWeights.kingpinWeightLbs).toLocaleString()} lbs
        </text>
        <text x={kpX} y={deckY + 44} textAnchor="middle" fontSize={7} fill="#6b7280">
          Kingpin ({axleWeights.kingpinUtilisation.toFixed(0)}%)
        </text>

        {/* Rear axle label */}
        <text x={axleX} y={deckY + 34} textAnchor="middle" fontSize={8} fill={axleColor} fontWeight={600}>
          {Math.round(axleWeights.rearAxleWeightLbs).toLocaleString()} lbs
        </text>
        <text x={axleX} y={deckY + 44} textAnchor="middle" fontSize={7} fill="#6b7280">
          {isBtrain ? 'Lead' : 'Rear'} Axle ({axleWeights.rearAxleUtilisation.toFixed(0)}%)
        </text>

        {/* B-train pup axle label */}
        {isBtrain && (
          <>
            <text x={pupAxleX} y={deckY + 34} textAnchor="middle" fontSize={8} fill={pupAxleColor} fontWeight={600}>
              {Math.round(axleWeights.pupAxleWeightLbs!).toLocaleString()} lbs
            </text>
            <text x={pupAxleX} y={deckY + 44} textAnchor="middle" fontSize={7} fill="#6b7280">
              Pup Axle ({axleWeights.pupAxleUtilisation!.toFixed(0)}%)
            </text>
          </>
        )}

        {/* FRONT / REAR labels */}
        <text x={trailerLeft - 4} y={deckY - 6} textAnchor="end" fontSize={7} fill="#9ca3af">FRONT</text>
        <text x={trailerRight + 4} y={deckY - 6} textAnchor="start" fontSize={7} fill="#9ca3af">REAR</text>
      </svg>

      {/* Compliance warnings */}
      {(axleWeights.kingpinOverweight || axleWeights.rearAxleOverweight || axleWeights.pupAxleOverweight) && (
        <div className="axle-warning">
          <AlertTriangle size={14} />
          <span>
            {[
              axleWeights.kingpinOverweight && `Kingpin weight exceeds ${trailer.maxKingpinWeightLbs.toLocaleString()} lb limit`,
              axleWeights.rearAxleOverweight && `${isBtrain ? 'Lead' : 'Rear'} axle weight exceeds ${trailer.maxAxleWeightLbs.toLocaleString()} lb limit`,
              axleWeights.pupAxleOverweight && `Pup axle weight exceeds ${(trailer.pupMaxAxleWeightLbs ?? 0).toLocaleString()} lb limit`,
            ].filter(Boolean).join('. ') + '. Redistribute load.'}
          </span>
        </div>
      )}

      {/* CG position summary */}
      {truck.totalWeightLbs > 0 && (
        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
          Center of gravity: {Math.round(axleWeights.centerOfGravity.longitudinalIn)}" from front
          ({axleWeights.centerOfGravity.longitudinalPct.toFixed(1)}% of deck length)
        </div>
      )}
    </div>
  );
}

function LoadingInstructionsDownload({ truck, parsedQuote }: { truck: TruckLoad; parsedQuote?: ParsedQuote | null }) {
  const steps = useMemo(() => generateLoadingSequence(truck), [truck]);

  if (steps.length === 0) return null;

  const handleDownload = async () => {
    await exportLoadingInstructionsPDF(truck, { quote: parsedQuote ?? undefined });
  };

  return (
    <div style={{ marginTop: 12 }}>
      <button
        className="btn btn-sm btn-outline"
        onClick={handleDownload}
        style={{ display: 'flex', alignItems: 'center', gap: 6 }}
      >
        <Download size={14} />
        Download Loading Instructions
      </button>
    </div>
  );
}

function TruckCard({ truck, defaultOpen = false, selectedBundleId, onBundleSelect, onViewTruck, parsedQuote }: {
  truck: TruckLoad;
  defaultOpen?: boolean;
  selectedBundleId: string | null;
  onBundleSelect: (id: string | null) => void;
  onViewTruck: (truckIndex: number) => void;
  parsedQuote?: ParsedQuote | null;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const axleWeights = useMemo(() => {
    if (truck.bundles.length === 0) return null;
    const positions = computeBundleLayoutPositions(truck);
    return calculateAxleWeights(truck, positions);
  }, [truck]);

  return (
    <div className="truck-card">
      <div className="truck-card-header" onClick={() => setOpen(!open)}>
        <span>
          Truck #{truck.truckIndex + 1} — {truck.trailerLabel}
          <span style={{ fontWeight: 400, color: '#6b7280', marginLeft: 8 }}>
            {truck.bundles.length} bundle{truck.bundles.length !== 1 ? 's' : ''} &middot;{' '}
            {Math.round(truck.totalWeightLbs).toLocaleString()} lbs
          </span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </div>

      {open && (
        <div className="truck-card-body">
          <UtilBar pct={truck.weightUtilisation} label="Weight" />
          <UtilBar pct={truck.areaUtilisation} label="Floor Area" />

          {axleWeights && <WeightDistributionDiagram axleWeights={axleWeights} truck={truck} />}

          <table className="bundle-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Component</th>
                <th>Pieces</th>
                <th>Weight (lbs)</th>
                <th>L × W × H (in)</th>
              </tr>
            </thead>
            <tbody>
              {truck.bundles.map((b, i) => (
                <tr
                  key={i}
                  className={b.id === selectedBundleId ? 'selected-row' : ''}
                  style={{ cursor: 'pointer' }}
                  onClick={() => { onBundleSelect(b.id); onViewTruck(truck.truckIndex); }}
                >
                  <td>{i + 1}</td>
                  <td>{b.description}{b.isPartial ? ' (partial)' : ''}</td>
                  <td>{b.pieces}</td>
                  <td>{Math.round(b.totalWeightLbs).toLocaleString()}</td>
                  <td>{Math.round(b.lengthIn)} × {Math.round(b.widthIn)} × {Math.round(b.heightIn)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <LoadingInstructionsDownload truck={truck} parsedQuote={parsedQuote} />

          {/* Strapping summary */}
          {truck.bundles.length > 0 && (() => {
            const strappingData = truck.bundles.map(b => ({
              bundle: b,
              strapping: calculateStrappingRequirements(b),
            }));
            const totals = strappingData.reduce(
              (acc, d) => ({
                end: acc.end + d.strapping.endStraps,
                mid: acc.mid + d.strapping.midStraps,
                safety: acc.safety + d.strapping.safetyStraps,
                total: acc.total + d.strapping.totalStraps,
              }),
              { end: 0, mid: 0, safety: 0, total: 0 },
            );
            return (
              <div className="strapping-summary">
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 8 }}>
                  Strapping Requirements
                </div>
                <div className="strapping-badges">
                  <span className="strapping-badge">{totals.total} total straps</span>
                  <span className="strapping-badge">{totals.end} end</span>
                  <span className="strapping-badge">{totals.mid} mid</span>
                  {totals.safety > 0 && <span className="strapping-badge">{totals.safety} safety</span>}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default function LoadPlanResults({ plan, selectedTrailer, selectedBundleId, onBundleSelect, onViewTruck, parsedQuote }: Props) {
  if (plan.trucks.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">
          <p>Add order items and click "Calculate Load Plan" to see results.</p>
        </div>
      </div>
    );
  }

  return (
    <div id="load-plan-results">
      {/* Summary statistics */}
      <div className="summary-stats">
        <div className="stat-card">
          <div className="stat-value">{plan.trucks.length}</div>
          <div className="stat-label">Truck{plan.trucks.length !== 1 ? 's' : ''} Required</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{plan.totalBundles}</div>
          <div className="stat-label">Total Bundles</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{Math.round(plan.totalWeight).toLocaleString()}</div>
          <div className="stat-label">Total Weight (lbs)</div>
        </div>
        {selectedTrailer && (
          <div className="stat-card">
            <div className="stat-value" style={{ fontSize: 16 }}>{selectedTrailer}</div>
            <div className="stat-label">Trailer Type</div>
          </div>
        )}
      </div>

      {plan.unplacedBundles.length > 0 && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: 12, marginBottom: 16 }}>
          <strong style={{ color: '#dc2626' }}>Warning:</strong> {plan.unplacedBundles.length} bundle(s) could not be placed.
          Some items may be too large for the selected trailer type.
        </div>
      )}

      {plan.trucks.map((truck, i) => (
        <TruckCard
          key={truck.truckIndex}
          truck={truck}
          defaultOpen={i === 0}
          selectedBundleId={selectedBundleId}
          onBundleSelect={onBundleSelect}
          onViewTruck={onViewTruck}
          parsedQuote={parsedQuote}
        />
      ))}
    </div>
  );
}
