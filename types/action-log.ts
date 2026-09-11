/**
 * Action log types.
 *
 * The action log records structural choices the user makes during a workflow —
 * currently only import column mapping — so that a later feature (or an AI
 * reading the exported file) can spot steps worth automating.
 *
 * It is deliberately NOT stored in the database. Sync replaces the whole
 * `puffin.db` file on pull and uploads the whole file on push, restoring only
 * `local_user`, so anything in a table would be uploaded to Drive and wiped on
 * every pull. A file alongside the database is untouched by both.
 */

/** Event types. Only the import mapping event exists today; the shape allows more. */
export const ACTION_LOG_EVENT_TYPES = ['import.column_mapping'] as const;

export type ActionLogEventType = typeof ACTION_LOG_EVENT_TYPES[number];

/** Which import surface produced the event. */
export type ImportKind = 'csv' | 'paste';

/**
 * Mapping of target field -> source column NAME, or null when the field was
 * left unmapped.
 *
 * Names, not indices: an index says nothing useful about a file imported next
 * month, whereas "this bank calls the description column Narrative" is exactly
 * what a future auto-suggest needs. For a headerless import the names are
 * positional ("Column 1"), so nothing is lost.
 */
export type ColumnMappingByName = Record<string, string | null>;

export interface ColumnMappingEventPayload {
  importKind: ImportKind;
  /** False when the file had no header row and names are positional. */
  hasHeaders: boolean;
  columnCount: number;
  /** Source column headers, names only — never any cell values. */
  headers: string[];
  /** What auto-detection proposed before the user touched anything. */
  suggested: ColumnMappingByName;
  /** What the user actually confirmed and imported with. */
  final: ColumnMappingByName;
  /** Fields where `final` differs from `suggested`. Empty means detection was accepted as-is. */
  overriddenFields: string[];
  dateFormat: {
    detected: string;
    final: string;
    overridden: boolean;
  };
  rowsParsed: number;
  rowsImported: number;
}

export interface ActionLogEntry {
  id: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  event_type: ActionLogEventType;
  /** Source (bank/account) name, when one was selected. */
  source: string | null;
  /** Batch produced by the import; null when nothing was imported. */
  import_batch_id: string | null;
  payload: ColumnMappingEventPayload;
}
