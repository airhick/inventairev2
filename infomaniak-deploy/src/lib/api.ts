import {
  equalTo,
  get,
  orderByChild,
  push,
  query,
  ref as dbRef,
  remove,
  runTransaction,
  set,
  update,
} from 'firebase/database';
import { rtdb } from './firebase';

export const API_BASE_URL = '';

export const getSSEUrl = (): string => '';

export interface Item {
  id?: number;
  itemId?: string;
  hexId?: string;
  serialNumber: string;
  barcode?: string;
  scannedCode?: string;
  name: string;
  category?: string;
  categoryDetails?: string;
  quantity: number;
  description?: string;
  image?: string;
  media?: string;
  status?: string;
  itemType?: string;
  brand?: string;
  model?: string;
  rentalEndDate?: string;
  currentRentalId?: number;
  parentId?: number | null;
  displayOrder?: number;
  customData?: Record<string, any>;
  createdAt?: string;
  lastUpdated?: string;
}

export interface CustomField {
  id: number;
  name: string;
  fieldKey: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'checkbox' | 'textarea' | 'url' | 'email';
  options?: string[];
  required: boolean;
  displayOrder: number;
  createdAt: string;
}

export interface Notification {
  id: number;
  message: string;
  type: string;
  itemSerialNumber?: string;
  itemHexId?: string;
  timestamp: string;
  created_at: string;
}

export interface Category {
  name: string;
}

export interface Rental {
  id: number;
  renterName: string;
  renterEmail: string;
  renterPhone: string;
  renterAddress?: string;
  rentalPrice: number;
  rentalDeposit: number;
  rentalDuration: number;
  startDate: string;
  endDate: string;
  status: string;
  itemsData: any[];
  attachments?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OcrResult {
  success: boolean;
  rawText?: string;
  parsed?: {
    name?: string;
    serialNumber?: string;
    brand?: string;
    model?: string;
    barcode?: string;
    description?: string;
  };
  error?: string;
}

const DEFAULT_CATEGORIES = [
  'materiel',
  'drone',
  'video',
  'audio',
  'streaming',
  'robot',
  'ordinateur',
  'casque_vr',
  'camera',
  'eclairage',
  'accessoire',
  'autre',
];

const nowIso = () => new Date().toISOString();

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const ITEM_ID_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ITEM_ID_MAX = 26 * 26 * 9;

function itemIdToIndex(code: string): number | null {
  const normalized = code.trim().toUpperCase();
  const match = normalized.match(/^([A-Z])([A-Z])([1-9])$/);
  if (!match) return null;
  const first = ITEM_ID_LETTERS.indexOf(match[1]);
  const second = ITEM_ID_LETTERS.indexOf(match[2]);
  const digit = Number(match[3]);
  if (first < 0 || second < 0 || digit < 1 || digit > 9) return null;
  return (first * 26 + second) * 9 + (digit - 1);
}

function indexToItemId(index: number): string {
  if (index < 0 || index >= ITEM_ID_MAX) {
    throw new Error('Plage itemId epuisee (AA1 -> ZZ9).');
  }
  const pairIndex = Math.floor(index / 9);
  const digit = (index % 9) + 1;
  const first = Math.floor(pairIndex / 26);
  const second = pairIndex % 26;
  return `${ITEM_ID_LETTERS[first]}${ITEM_ID_LETTERS[second]}${digit}`;
}

async function getNextFormattedItemId(): Promise<string> {
  const itemsMap = await getAllMap<Item>('items');
  let maxIndex = -1;
  Object.values(itemsMap).forEach((item) => {
    const idx = item?.itemId ? itemIdToIndex(item.itemId) : null;
    if (idx !== null && idx > maxIndex) maxIndex = idx;
  });
  return indexToItemId(maxIndex + 1);
}

function sanitizeForRtdb<T>(value: T): T {
  if (value === undefined) {
    return null as T;
  }
  if (value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForRtdb(entry)) as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    Object.entries(value as Record<string, any>).forEach(([key, entry]) => {
      if (entry === undefined) return;
      out[key] = sanitizeForRtdb(entry);
    });
    return out as T;
  }
  return value;
}

async function getAllMap<T>(path: string): Promise<Record<string, T>> {
  const snap = await get(dbRef(rtdb, path));
  return (snap.val() || {}) as Record<string, T>;
}

async function getAllArray<T>(path: string): Promise<T[]> {
  const map = await getAllMap<T>(path);
  return Object.values(map || {});
}

async function getNextId(counterName: string): Promise<number> {
  const counterRef = dbRef(rtdb, `meta/counters/${counterName}`);
  const tx = await runTransaction(counterRef, (current) => {
    if (typeof current !== 'number') return 1;
    return current + 1;
  });
  if (!tx.committed) throw new Error(`Cannot increment counter ${counterName}`);
  return Number(tx.snapshot.val() || 1);
}

async function findItemBySerialNumber(serialNumber: string): Promise<{ key: string; item: Item } | null> {
  const itemsMap = await getAllMap<Item>('items');
  const entry = Object.entries(itemsMap).find(([, item]) => item?.serialNumber === serialNumber);
  if (!entry) return null;
  return { key: entry[0], item: entry[1] };
}

async function findById<T extends { id?: number }>(
  path: string,
  id: number,
): Promise<{ key: string; row: T } | null> {
  const rows = await getAllMap<T>(path);
  const entry = Object.entries(rows).find(([, row]) => Number(row?.id) === Number(id));
  if (!entry) return null;
  return { key: entry[0], row: entry[1] };
}

async function pushNotification(payload: Omit<Notification, 'id' | 'timestamp' | 'created_at'>): Promise<void> {
  const timestamp = nowIso();
  const notifRef = push(dbRef(rtdb, 'notifications'));
  await set(notifRef, {
    ...payload,
    id: Date.now(),
    timestamp,
    created_at: timestamp,
  });
}

function normalizeItem(raw: any): Item {
  return {
    id: Number(raw?.id || 0),
    itemId: raw?.itemId || '',
    hexId: raw?.hexId || '',
    serialNumber: raw?.serialNumber || '',
    scannedCode: raw?.scannedCode || '',
    barcode: raw?.barcode || raw?.scannedCode || '',
    name: raw?.name || '',
    category: raw?.category || '',
    categoryDetails: raw?.categoryDetails || '',
    quantity: Number(raw?.quantity || 0),
    description: raw?.description || '',
    image: raw?.image || '',
    media: raw?.media || '',
    status: raw?.status || 'en_stock',
    itemType: raw?.itemType || '',
    brand: raw?.brand || '',
    model: raw?.model || '',
    rentalEndDate: raw?.rentalEndDate || '',
    currentRentalId: raw?.currentRentalId,
    customData: raw?.customData || {},
    parentId: raw?.parentId ?? null,
    displayOrder: Number(raw?.displayOrder || 0),
    createdAt: raw?.createdAt,
    lastUpdated: raw?.lastUpdated,
  };
}

export async function getItems(): Promise<Item[]> {
  const itemsMap = await getAllMap<Item>('items');
  const entries = Object.entries(itemsMap || {});
  const normalized = entries.map(([key, raw]) => ({ key, item: normalizeItem(raw) }));
  const sorted = normalized.sort((a, b) => (a.item.displayOrder || 0) - (b.item.displayOrder || 0));

  const usedIndexes = new Set<number>();
  sorted.forEach(({ item }) => {
    const idx = item.itemId ? itemIdToIndex(item.itemId) : null;
    if (idx !== null) usedIndexes.add(idx);
  });
  let nextIndex = usedIndexes.size > 0 ? Math.max(...Array.from(usedIndexes)) + 1 : 0;

  // Backfill des anciens items qui n'ont pas de itemId.
  for (const row of sorted) {
    if (row.item.itemId) continue;
    while (usedIndexes.has(nextIndex)) nextIndex++;
    const generated = indexToItemId(nextIndex);
    usedIndexes.add(nextIndex);
    nextIndex++;
    row.item.itemId = generated;
    await update(dbRef(rtdb, `items/${row.key}`), sanitizeForRtdb({ itemId: generated, lastUpdated: nowIso() }));
  }

  return sorted.map((row) => row.item);
}

export async function uploadImage(file: File, _serialNumber?: string): Promise<string | null> {
  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.readAsDataURL(file);
    });
    return dataUrl || null;
  } catch (error) {
    console.error('[RTDB] Image to base64 conversion failed:', error);
    return null;
  }
}

export async function saveItem(itemData: Partial<Item>): Promise<any> {
  const id = typeof itemData.id === 'number' ? itemData.id : await getNextId('items');
  const nextItemId = itemData.itemId?.trim()
    ? itemData.itemId.trim().toUpperCase()
    : await getNextFormattedItemId();
  const payload: Item = {
    id,
    itemId: nextItemId,
    hexId: itemData.hexId || '',
    serialNumber: itemData.serialNumber || '',
    scannedCode: itemData.scannedCode || itemData.barcode || '',
    barcode: itemData.barcode || itemData.scannedCode || '',
    name: itemData.name || 'Untitled Item',
    category: itemData.category || '',
    categoryDetails: itemData.categoryDetails || '',
    quantity: Number(itemData.quantity || 0),
    description: itemData.description || '',
    image: itemData.image || '',
    media: itemData.media || '',
    status: itemData.status || 'en_stock',
    itemType: itemData.itemType || '',
    brand: itemData.brand || '',
    model: itemData.model || '',
    rentalEndDate: itemData.rentalEndDate || '',
    currentRentalId: itemData.currentRentalId,
    parentId: itemData.parentId ?? null,
    displayOrder: Number(itemData.displayOrder || 0),
    customData: itemData.customData || {},
    createdAt: nowIso(),
    lastUpdated: nowIso(),
  };
  await set(dbRef(rtdb, `items/${id}`), sanitizeForRtdb(payload));
  await pushNotification({
    message: `Item cree: ${payload.name}`,
    type: 'item_created',
    itemSerialNumber: payload.serialNumber,
    itemHexId: payload.hexId,
  });
  return { success: true, id };
}

export async function updateItem(serialNumber: string, updates: Partial<Item>): Promise<any> {
  const found = await findItemBySerialNumber(serialNumber);
  if (!found) throw new Error(`Item not found for serialNumber: ${serialNumber}`);
  await update(
    dbRef(rtdb, `items/${found.key}`),
    sanitizeForRtdb({
    ...updates,
    lastUpdated: nowIso(),
    }),
  );
  await pushNotification({
    message: `Item modifie: ${updates.name || serialNumber}`,
    type: 'item_updated',
    itemSerialNumber: updates.serialNumber || serialNumber,
    itemHexId: updates.hexId || found.item.hexId,
  });
  return { success: true };
}

export async function deleteItem(serialNumber: string): Promise<any> {
  const found = await findItemBySerialNumber(serialNumber);
  if (!found) throw new Error(`Item not found for serialNumber: ${serialNumber}`);
  await remove(dbRef(rtdb, `items/${found.key}`));
  await pushNotification({
    message: `Item supprime: ${found.item.name || serialNumber}`,
    type: 'item_deleted',
    itemSerialNumber: found.item.serialNumber || serialNumber,
    itemHexId: found.item.hexId,
  });
  return { success: true };
}

export async function deleteAllItems(): Promise<{ success: boolean; count: number }> {
  const items = await getAllMap<Item>('items');
  const count = Object.keys(items).length;
  await set(dbRef(rtdb, 'items'), {});
  return { success: true, count };
}

export async function getItemHistory(_serialNumber: string): Promise<any[]> {
  return [];
}

export async function searchItemByCode(code: string): Promise<{ found: boolean; item: Item | null }> {
  const normalized = code.trim().toLowerCase();
  const items = await getItems();
  const item =
    items.find((it) =>
      [it.serialNumber, it.scannedCode, it.barcode, it.itemId, it.hexId]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase() === normalized),
    ) || null;
  return { found: !!item, item };
}

export async function setItemParent(itemId: number, parentId: number | null, displayOrder = 0): Promise<any> {
  const found = await findById<Item>('items', itemId);
  if (!found) throw new Error(`Item not found for id: ${itemId}`);
  await update(dbRef(rtdb, `items/${found.key}`), {
    parentId,
    displayOrder,
    lastUpdated: nowIso(),
  });
  return { success: true };
}

export async function removeItemParent(itemId: number): Promise<any> {
  return setItemParent(itemId, null, 0);
}

export async function reorderItemHierarchy(
  items: Array<{ id: number; parentId: number | null; displayOrder: number }>,
): Promise<any> {
  const currentItems = await getAllMap<Item>('items');
  const byId = new Map<number, { key: string; item: Item }>();
  Object.entries(currentItems).forEach(([key, item]) => {
    byId.set(Number(item.id), { key, item });
  });
  const updates: Record<string, any> = {};
  items.forEach((it) => {
    const current = byId.get(Number(it.id));
    if (!current) return;
    updates[`items/${current.key}/parentId`] = it.parentId ?? null;
    updates[`items/${current.key}/displayOrder`] = Number(it.displayOrder || 0);
    updates[`items/${current.key}/lastUpdated`] = nowIso();
  });
  await update(dbRef(rtdb), updates);
  return { success: true };
}

export async function getNotifications(): Promise<Notification[]> {
  const map = await getAllMap<Notification>('notifications');
  return Object.values(map).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function clearNotifications(): Promise<any> {
  await set(dbRef(rtdb, 'notifications'), {});
  return { success: true };
}

export async function deleteNotification(notificationId: number): Promise<any> {
  const list = await getAllMap<Notification>('notifications');
  const entry = Object.entries(list).find(([, notif]) => Number(notif.id) === Number(notificationId));
  if (entry) {
    await remove(dbRef(rtdb, `notifications/${entry[0]}`));
  }
  return { success: true };
}

export async function getCategories(): Promise<{
  categories: string[];
  customCategories: string[];
  deletedCategories: string[];
}> {
  const map = await getAllMap<{ name: string; deleted?: boolean }>('categories');
  const deletedCategories: string[] = [];
  const customCategories: string[] = [];
  Object.values(map).forEach((row) => {
    if (!row?.name) return;
    if (row.deleted) deletedCategories.push(row.name);
    else customCategories.push(row.name);
  });
  const categories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...customCategories].filter((name) => !deletedCategories.includes(name))),
  );
  return { categories, customCategories, deletedCategories };
}

export async function createCategory(categoryName: string): Promise<any> {
  const name = categoryName.trim();
  if (!name) throw new Error('Category name is required');
  const key = slugify(name);
  await set(dbRef(rtdb, `categories/${key}`), {
    name,
    deleted: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return { success: true };
}

export async function deleteCategory(categoryName: string): Promise<any> {
  const name = categoryName.trim();
  if (!name) throw new Error('Category name is required');
  const key = slugify(name);
  await update(dbRef(rtdb, `categories/${key}`), {
    name,
    deleted: true,
    updatedAt: nowIso(),
  });
  return { success: true };
}

export async function getRentals(status = ''): Promise<Rental[]> {
  if (!status) {
    return getAllArray<Rental>('rentals');
  }
  const q = query(dbRef(rtdb, 'rentals'), orderByChild('status'), equalTo(status));
  const snap = await get(q);
  return Object.values((snap.val() || {}) as Record<string, Rental>);
}

export async function createRental(rentalData: Partial<Rental>): Promise<any> {
  const id = await getNextId('rentals');
  const payload: Rental = {
    id,
    renterName: rentalData.renterName || '',
    renterEmail: rentalData.renterEmail || '',
    renterPhone: rentalData.renterPhone || '',
    renterAddress: rentalData.renterAddress || '',
    rentalPrice: Number(rentalData.rentalPrice || 0),
    rentalDeposit: Number(rentalData.rentalDeposit || 0),
    rentalDuration: Number(rentalData.rentalDuration || 0),
    startDate: rentalData.startDate || '',
    endDate: rentalData.endDate || '',
    status: rentalData.status || 'a_venir',
    itemsData: rentalData.itemsData || [],
    attachments: rentalData.attachments || '',
    notes: rentalData.notes || '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await set(dbRef(rtdb, `rentals/${id}`), payload);
  return { success: true, id };
}

export async function updateRental(rentalId: number, updates: Partial<Rental>): Promise<any> {
  const found = await findById<Rental>('rentals', rentalId);
  if (!found) throw new Error(`Rental not found for id: ${rentalId}`);
  await update(
    dbRef(rtdb, `rentals/${found.key}`),
    sanitizeForRtdb({
    ...updates,
    updatedAt: nowIso(),
    }),
  );
  return { success: true };
}

export async function deleteRental(rentalId: number): Promise<any> {
  const found = await findById<Rental>('rentals', rentalId);
  if (!found) throw new Error(`Rental not found for id: ${rentalId}`);
  await remove(dbRef(rtdb, `rentals/${found.key}`));
  return { success: true };
}

export async function downloadRentalCautionDoc(rentalId: number): Promise<void> {
  const payload = { rentalId, exportedAt: nowIso() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `caution_location_${rentalId}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export async function getRentalStatuses(): Promise<string[]> {
  const map = await getAllMap<{ name: string }>('rentalStatuses');
  const statuses = Object.values(map)
    .map((row) => String(row?.name || ''))
    .filter(Boolean);
  if (statuses.length === 0) return ['en_cours', 'a_venir', 'termine', 'annule'];
  return statuses;
}

export async function createRentalStatus(statusData: { name: string; color?: string }): Promise<any> {
  const name = statusData.name.trim();
  if (!name) throw new Error('Status name is required');
  const key = slugify(name);
  await set(dbRef(rtdb, `rentalStatuses/${key}`), {
    name,
    color: statusData.color || '#999999',
    updatedAt: nowIso(),
  });
  return { success: true };
}

export async function searchProductByBarcode(gtin: string): Promise<any> {
  return { success: false, error: `Lookup desactive sans backend (${gtin})` };
}

export async function searchProductOpenFoodFacts(gtin: string): Promise<any> {
  return { success: false, error: `Lookup desactive sans backend (${gtin})` };
}

export async function fetchImageAsBase64(imageUrl: string): Promise<{
  success: boolean;
  image?: string;
  contentType?: string;
  error?: string;
}> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return { success: false, error: `Erreur HTTP ${response.status}` };
    const blob = await response.blob();
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { success: true, image: base64, contentType: blob.type };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
}

export async function recognizeImage(_imageBase64: string): Promise<OcrResult> {
  return { success: false, error: 'OCR desactive sans backend' };
}

export async function analyzeLabelAI(_imageBase64: string): Promise<{
  success: boolean;
  parsed?: {
    name?: string | null;
    serialNumber?: string | null;
    brand?: string | null;
    model?: string | null;
    barcode?: string | null;
    description?: string | null;
    category?: string | null;
    quantity?: number;
    [key: string]: any;
  };
  rawResponse?: string;
  model?: string;
  customFields?: Array<{
    name: string;
    fieldKey: string;
    fieldType: string;
    options?: any;
  }>;
  error?: string;
}> {
  return { success: false, error: 'Analyse IA desactivee sans backend' };
}

export async function checkOcrStatus(): Promise<{ success: boolean; available: boolean }> {
  return { success: true, available: false };
}

export async function getCustomFields(): Promise<{ success: boolean; fields: CustomField[] }> {
  const fields = await getAllArray<CustomField>('customFields');
  return {
    success: true,
    fields: fields.sort((a, b) => Number(a.displayOrder || 0) - Number(b.displayOrder || 0)),
  };
}

export async function createCustomField(data: {
  name: string;
  fieldType: string;
  options?: string[];
  required?: boolean;
}): Promise<{ success: boolean; id?: number; fieldKey?: string; error?: string }> {
  try {
    const id = await getNextId('customFields');
    const fieldKey = slugify(data.name);
    const payload: CustomField = {
      id,
      name: data.name.trim(),
      fieldKey,
      fieldType: data.fieldType as CustomField['fieldType'],
      options: data.options || [],
      required: !!data.required,
      displayOrder: id,
      createdAt: nowIso(),
    };
    await set(dbRef(rtdb, `customFields/${id}`), payload);
    return { success: true, id, fieldKey };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
}

export async function updateCustomField(
  fieldId: number,
  data: Partial<{
    name: string;
    fieldType: string;
    options: string[];
    required: boolean;
    displayOrder: number;
  }>,
): Promise<{ success: boolean; error?: string }> {
  try {
    const found = await findById<CustomField>('customFields', fieldId);
    if (!found) return { success: false, error: 'Champ introuvable' };
    await update(dbRef(rtdb, `customFields/${found.key}`), sanitizeForRtdb(data));
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
}

export async function deleteCustomField(fieldId: number): Promise<{ success: boolean; error?: string }> {
  try {
    const found = await findById<CustomField>('customFields', fieldId);
    if (!found) return { success: false, error: 'Champ introuvable' };
    await remove(dbRef(rtdb, `customFields/${found.key}`));
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Erreur inconnue' };
  }
}
