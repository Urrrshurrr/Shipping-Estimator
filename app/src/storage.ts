import type { OrderItem, LoadPlan, TrailerType, TrailerSpec, ParsedQuote } from './types';

// ============================================================
// Storage backend abstraction
// ============================================================
// When running inside Electron, window.electronStorage is available
// and provides file-system-backed persistence via IPC.
// Otherwise, fall back to localStorage (browser mode).

interface ElectronStorageAPI {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<boolean>;
  remove(key: string): Promise<boolean>;
  getDataPath(): Promise<string>;
}

declare global {
  interface Window {
    electronStorage?: ElectronStorageAPI;
  }
}

const isElectron = typeof window !== 'undefined' && !!window.electronStorage;

// In-memory cache — populated at init, kept in sync on writes.
const cache: Record<string, string | null> = {};

/**
 * Synchronous read from cache (Electron) or localStorage (browser).
 */
function storageGet(key: string): string | null {
  if (isElectron) {
    return cache[key] ?? null;
  }
  return localStorage.getItem(key);
}

/**
 * Synchronous write to cache + async flush to disk (Electron),
 * or plain localStorage write (browser).
 */
function storageSet(key: string, value: string): void {
  if (isElectron) {
    cache[key] = value;
    window.electronStorage!.set(key, value);  // fire-and-forget
  } else {
    localStorage.setItem(key, value);
  }
}

/**
 * Synchronous remove from cache + async disk remove (Electron),
 * or plain localStorage remove (browser).
 */
function storageRemove(key: string): void {
  if (isElectron) {
    cache[key] = null;
    window.electronStorage!.remove(key);  // fire-and-forget
  } else {
    localStorage.removeItem(key);
  }
}

// ============================================================
// localStorage keys
// ============================================================
const PRODUCT_LIBRARY_KEY = 'naseco-product-library';
const SAVED_PLANS_KEY = 'naseco-saved-plans';
const AUTOSAVE_KEY = 'naseco-autosave';
const CUSTOM_TRAILERS_KEY = 'naseco-custom-trailers';

const ALL_KEYS = [PRODUCT_LIBRARY_KEY, SAVED_PLANS_KEY, AUTOSAVE_KEY, CUSTOM_TRAILERS_KEY];

/**
 * Initialise the in-memory cache from Electron's file storage.
 * Must be called (and awaited) before the app renders.
 * No-op in browser mode.
 */
export async function initStorage(): Promise<void> {
  if (!isElectron) return;
  await Promise.all(
    ALL_KEYS.map(async (key) => {
      cache[key] = await window.electronStorage!.get(key);
    }),
  );
}

// ============================================================
// Product Library
// ============================================================

/** A saved product in the user's library. */
export interface LibraryProduct {
  id: string;
  name: string;
  category: OrderItem['category'];
  /** Partial OrderItem defaults applied when quick-adding */
  defaults: Partial<OrderItem>;
  createdAt: string;
}

export function loadProductLibrary(): LibraryProduct[] {
  try {
    const raw = storageGet(PRODUCT_LIBRARY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LibraryProduct[];
  } catch {
    return [];
  }
}

export function saveProductLibrary(products: LibraryProduct[]): void {
  try {
    storageSet(PRODUCT_LIBRARY_KEY, JSON.stringify(products));
  } catch {
    console.warn('Failed to save product library');
  }
}

export function addProductToLibrary(product: LibraryProduct): LibraryProduct[] {
  const lib = loadProductLibrary();
  lib.push(product);
  saveProductLibrary(lib);
  return lib;
}

export function removeProductFromLibrary(id: string): LibraryProduct[] {
  const lib = loadProductLibrary().filter(p => p.id !== id);
  saveProductLibrary(lib);
  return lib;
}

export function updateProductInLibrary(id: string, updates: Partial<LibraryProduct>): LibraryProduct[] {
  const lib = loadProductLibrary().map(p => p.id === id ? { ...p, ...updates } : p);
  saveProductLibrary(lib);
  return lib;
}

// ============================================================
// Saved Plans
// ============================================================

export interface SavedPlan {
  id: string;
  name: string;
  trailerType: TrailerType;
  autoMode: boolean;
  orderItems: OrderItem[];
  loadPlan: LoadPlan | null;
  quote?: ParsedQuote;
  savedAt: string;
}

export function loadSavedPlans(): SavedPlan[] {
  try {
    const raw = storageGet(SAVED_PLANS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedPlan[];
  } catch {
    return [];
  }
}

export function savePlansList(plans: SavedPlan[]): void {
  try {
    storageSet(SAVED_PLANS_KEY, JSON.stringify(plans));
  } catch {
    console.warn('Failed to save plans');
  }
}

export function savePlan(plan: SavedPlan): SavedPlan[] {
  const plans = loadSavedPlans();
  const idx = plans.findIndex(p => p.id === plan.id);
  if (idx >= 0) {
    plans[idx] = plan;
  } else {
    plans.unshift(plan);
  }
  savePlansList(plans);
  return plans;
}

export function deleteSavedPlan(id: string): SavedPlan[] {
  const plans = loadSavedPlans().filter(p => p.id !== id);
  savePlansList(plans);
  return plans;
}

// ============================================================
// Auto-save (current working state)
// ============================================================

export interface AutoSaveState {
  trailerType: TrailerType;
  autoMode: boolean;
  orderItems: OrderItem[];
  loadPlan: LoadPlan | null;
  quote?: ParsedQuote;
  savedAt: string;
}

export function loadAutoSave(): AutoSaveState | null {
  try {
    const raw = storageGet(AUTOSAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AutoSaveState;
  } catch {
    return null;
  }
}

export function saveAutoSave(state: AutoSaveState): void {
  try {
    storageSet(AUTOSAVE_KEY, JSON.stringify(state));
  } catch {
    // Auto-save failure is non-critical — silently ignore
  }
}

export function clearAutoSave(): void {
  storageRemove(AUTOSAVE_KEY);
}

// ============================================================
// Custom Trailers
// ============================================================

export function loadCustomTrailers(): TrailerSpec[] {
  try {
    const raw = storageGet(CUSTOM_TRAILERS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as TrailerSpec[];
  } catch {
    return [];
  }
}

export function saveCustomTrailers(trailers: TrailerSpec[]): void {
  try {
    storageSet(CUSTOM_TRAILERS_KEY, JSON.stringify(trailers));
  } catch {
    console.warn('Failed to save custom trailers');
  }
}

export function addCustomTrailer(trailer: TrailerSpec): TrailerSpec[] {
  const list = loadCustomTrailers();
  list.push({ ...trailer, isCustom: true });
  saveCustomTrailers(list);
  return list;
}

export function updateCustomTrailer(type: string, updates: Partial<TrailerSpec>): TrailerSpec[] {
  const list = loadCustomTrailers().map(t => t.type === type ? { ...t, ...updates } : t);
  saveCustomTrailers(list);
  return list;
}

export function deleteCustomTrailer(type: string): TrailerSpec[] {
  const list = loadCustomTrailers().filter(t => t.type !== type);
  saveCustomTrailers(list);
  return list;
}
