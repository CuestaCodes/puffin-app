/**
 * Import action log — preference and event construction.
 *
 * Records which source columns the user maps to which fields, so a later
 * feature can suggest the same mapping for the same bank. Structural metadata
 * only: header names, field mappings, date format and counts. No amounts, no
 * descriptions, no dates from the imported file.
 *
 * Opt-in and off by default, so a fresh install writes nothing at all until
 * the user turns it on in Settings.
 */

import { api } from '@/lib/services';
import type { ColumnMapping, DateFormat } from '@/types/import';
import type {
  ActionLogEntry,
  ColumnMappingByName,
  ColumnMappingEventPayload,
  ImportKind,
} from '@/types/action-log';

const PREFERENCE_KEY = 'puffin_import_log';

/** Optional fields are absent rather than -1 when unmapped, so both are treated as "not mapped". */
const MAPPED_FIELDS = [
  'date',
  'description',
  'amount',
  'debit',
  'credit',
  'balance',
  'notes',
] as const;

function hasLocalStorage(): boolean {
  return typeof window !== 'undefined' && !!window.localStorage;
}

/** Off by default — the log is opt-in, so nothing is recorded until asked for. */
export function readActionLogPreference(): boolean {
  if (!hasLocalStorage()) return false;

  try {
    const stored = localStorage.getItem(PREFERENCE_KEY);
    if (!stored) return false;
    const parsed: unknown = JSON.parse(stored);
    return !!parsed && typeof parsed === 'object' && (parsed as { enabled?: unknown }).enabled === true;
  } catch {
    return false;
  }
}

export function writeActionLogPreference(enabled: boolean): void {
  if (!hasLocalStorage()) return;

  try {
    localStorage.setItem(PREFERENCE_KEY, JSON.stringify({ enabled }));
  } catch {
    // Ignore storage errors — the preference is a convenience, not state to recover
  }
}

/**
 * Resolve a column index to its header name.
 *
 * Falls back to a positional name so a headerless import still produces a
 * stable, comparable label rather than `undefined`.
 */
function columnName(index: number, headers: string[]): string {
  return headers[index] ?? `Column ${index + 1}`;
}

/** Convert an index-based mapping to field -> column name, with null for unmapped fields. */
export function mappingToNames(
  mapping: ColumnMapping | null,
  headers: string[]
): ColumnMappingByName {
  const result: ColumnMappingByName = {};

  for (const field of MAPPED_FIELDS) {
    const index = mapping?.[field];
    result[field] = typeof index === 'number' && index >= 0 ? columnName(index, headers) : null;
  }

  return result;
}

/** Fields the user changed away from what auto-detection proposed. */
export function diffMappings(
  suggested: ColumnMappingByName,
  final: ColumnMappingByName
): string[] {
  return MAPPED_FIELDS.filter(field => suggested[field] !== final[field]);
}

export interface ColumnMappingEventInput {
  importKind: ImportKind;
  headers: string[];
  hasHeaders: boolean;
  /** Mapping proposed by auto-detection, or null when detection produced nothing. */
  suggestedMapping: ColumnMapping | null;
  /** Mapping the user confirmed and imported with. */
  finalMapping: ColumnMapping;
  detectedDateFormat: DateFormat;
  finalDateFormat: DateFormat;
  sourceName: string | null;
  batchId: string | null;
  rowsParsed: number;
  rowsImported: number;
}

/**
 * Build a mapping event. Pure — no I/O, no preference check — so the diffing
 * logic is testable on its own.
 */
export function buildColumnMappingEvent(input: ColumnMappingEventInput): ActionLogEntry {
  const suggested = mappingToNames(input.suggestedMapping, input.headers);
  const final = mappingToNames(input.finalMapping, input.headers);

  const payload: ColumnMappingEventPayload = {
    importKind: input.importKind,
    hasHeaders: input.hasHeaders,
    columnCount: input.headers.length,
    headers: input.headers,
    suggested,
    final,
    overriddenFields: diffMappings(suggested, final),
    dateFormat: {
      detected: input.detectedDateFormat,
      final: input.finalDateFormat,
      overridden: input.detectedDateFormat !== input.finalDateFormat,
    },
    rowsParsed: input.rowsParsed,
    rowsImported: input.rowsImported,
  };

  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: 'import.column_mapping',
    source: input.sourceName,
    import_batch_id: input.batchId,
    payload,
  };
}

/**
 * Record a completed import's mapping choices.
 *
 * Never throws and never surfaces a toast: a failure to log is not a failure to
 * import, and the user did not ask for the log to be part of that flow.
 */
export async function recordImportMapping(input: ColumnMappingEventInput): Promise<void> {
  if (!readActionLogPreference()) return;

  try {
    // api.* resolves with { error } rather than throwing, so a handler failure
    // arrives here as a value. Warn either way — never interrupting the import
    // was the requirement, not never reporting.
    const result = await api.post('/api/action-log', buildColumnMappingEvent(input));
    if (result.error) {
      console.warn('Failed to record import action log entry:', result.error);
    }
  } catch (error) {
    console.warn('Failed to record import action log entry:', error);
  }
}
