// @vitest-environment jsdom
//
// jsdom rather than the project-wide `node` environment because the preference
// is a real localStorage read/write, and a stubbed storage object would test
// the stub rather than the behaviour.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const postMock = vi.fn();

vi.mock('@/lib/services', () => ({
  api: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

import {
  buildColumnMappingEvent,
  diffMappings,
  mappingToNames,
  readActionLogPreference,
  recordImportMapping,
  writeActionLogPreference,
  type ColumnMappingEventInput,
} from './action-log';
import type { ColumnMapping } from '@/types/import';

const PREFERENCE_KEY = 'puffin_import_log';

const HEADERS = ['Date', 'Narrative', 'Debit', 'Credit', 'Balance'];

function makeInput(overrides: Partial<ColumnMappingEventInput> = {}): ColumnMappingEventInput {
  return {
    importKind: 'csv',
    headers: HEADERS,
    hasHeaders: true,
    suggestedMapping: { date: 0, description: -1, amount: 2, ignore: [] },
    finalMapping: { date: 0, description: 1, amount: 2, ignore: [] },
    detectedDateFormat: 'auto',
    finalDateFormat: 'DD/MM/YYYY',
    sourceName: 'ANZ Everyday',
    batchId: 'batch-1',
    rowsParsed: 12,
    rowsImported: 10,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  postMock.mockReset();
  postMock.mockResolvedValue({ data: { success: true } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('action log preference', () => {
  it('is off by default', () => {
    expect(readActionLogPreference()).toBe(false);
  });

  it('round-trips through localStorage', () => {
    writeActionLogPreference(true);
    expect(readActionLogPreference()).toBe(true);

    writeActionLogPreference(false);
    expect(readActionLogPreference()).toBe(false);
  });

  it('falls back to off for an unparseable stored value', () => {
    localStorage.setItem(PREFERENCE_KEY, 'not json');
    expect(readActionLogPreference()).toBe(false);
  });

  it('falls back to off for a value of the wrong shape', () => {
    localStorage.setItem(PREFERENCE_KEY, '"enabled"');
    expect(readActionLogPreference()).toBe(false);

    localStorage.setItem(PREFERENCE_KEY, '{"enabled":"yes"}');
    expect(readActionLogPreference()).toBe(false);
  });
});

describe('mappingToNames', () => {
  it('resolves mapped indices to header names', () => {
    const mapping: ColumnMapping = { date: 0, description: 1, amount: 4, ignore: [] };

    expect(mappingToNames(mapping, HEADERS)).toMatchObject({
      date: 'Date',
      description: 'Narrative',
      amount: 'Balance',
    });
  });

  it('reports unmapped fields as null, whether absent or -1', () => {
    const mapping: ColumnMapping = { date: 0, description: -1, amount: 2, ignore: [] };
    const names = mappingToNames(mapping, HEADERS);

    expect(names.description).toBeNull();
    // debit/credit/notes are absent from the mapping entirely
    expect(names.debit).toBeNull();
    expect(names.credit).toBeNull();
    expect(names.notes).toBeNull();
  });

  it('treats a null mapping as nothing mapped', () => {
    const names = mappingToNames(null, HEADERS);

    expect(Object.values(names).every(value => value === null)).toBe(true);
  });

  it('falls back to a positional name when the header is missing', () => {
    const mapping: ColumnMapping = { date: 7, description: 1, amount: 2, ignore: [] };

    expect(mappingToNames(mapping, HEADERS).date).toBe('Column 8');
  });
});

describe('diffMappings', () => {
  it('is empty when the suggestion was accepted as-is', () => {
    const names = mappingToNames({ date: 0, description: 1, amount: 2, ignore: [] }, HEADERS);

    expect(diffMappings(names, names)).toEqual([]);
  });

  it('names only the fields that changed', () => {
    const suggested = mappingToNames({ date: 0, description: -1, amount: 2, ignore: [] }, HEADERS);
    const final = mappingToNames({ date: 0, description: 1, amount: 2, ignore: [] }, HEADERS);

    expect(diffMappings(suggested, final)).toEqual(['description']);
  });
});

describe('buildColumnMappingEvent', () => {
  it('records the fields the user corrected', () => {
    const entry = buildColumnMappingEvent(makeInput());

    expect(entry.event_type).toBe('import.column_mapping');
    expect(entry.payload.suggested.description).toBeNull();
    expect(entry.payload.final.description).toBe('Narrative');
    expect(entry.payload.overriddenFields).toEqual(['description']);
  });

  it('reports no overrides when detection was accepted', () => {
    const mapping: ColumnMapping = { date: 0, description: 1, amount: 2, ignore: [] };
    const entry = buildColumnMappingEvent(
      makeInput({
        suggestedMapping: mapping,
        finalMapping: mapping,
        detectedDateFormat: 'DD/MM/YYYY',
        finalDateFormat: 'DD/MM/YYYY',
      })
    );

    expect(entry.payload.overriddenFields).toEqual([]);
    expect(entry.payload.dateFormat.overridden).toBe(false);
  });

  it('treats every mapped field as an override when detection produced nothing', () => {
    const entry = buildColumnMappingEvent(makeInput({ suggestedMapping: null }));

    expect(entry.payload.overriddenFields).toEqual(['date', 'description', 'amount']);
  });

  it('flags a changed date format', () => {
    const entry = buildColumnMappingEvent(makeInput());

    expect(entry.payload.dateFormat).toEqual({
      detected: 'auto',
      final: 'DD/MM/YYYY',
      overridden: true,
    });
  });

  it('carries the source, batch and counts', () => {
    const entry = buildColumnMappingEvent(makeInput());

    expect(entry.source).toBe('ANZ Everyday');
    expect(entry.import_batch_id).toBe('batch-1');
    expect(entry.payload.rowsParsed).toBe(12);
    expect(entry.payload.rowsImported).toBe(10);
    expect(entry.payload.columnCount).toBe(5);
  });

  it('accepts a null batch id, for an import where everything was a duplicate', () => {
    expect(buildColumnMappingEvent(makeInput({ batchId: null })).import_batch_id).toBeNull();
  });

  it('gives each entry a unique id and a timestamp', () => {
    const first = buildColumnMappingEvent(makeInput());
    const second = buildColumnMappingEvent(makeInput());

    expect(first.id).not.toBe(second.id);
    expect(Number.isNaN(Date.parse(first.timestamp))).toBe(false);
  });

  it('records header names and structure only, never cell values', () => {
    const entry = buildColumnMappingEvent(makeInput());

    // The builder is never handed row data, so the guarantee is enforced by the
    // payload's shape: pin the key set so a future field cannot quietly add one.
    expect(Object.keys(entry.payload).sort()).toEqual([
      'columnCount',
      'dateFormat',
      'final',
      'hasHeaders',
      'headers',
      'importKind',
      'overriddenFields',
      'rowsImported',
      'rowsParsed',
      'suggested',
    ]);
    expect(entry.payload.headers).toEqual(HEADERS);
  });
});

describe('recordImportMapping', () => {
  it('writes nothing while logging is off', async () => {
    await recordImportMapping(makeInput());

    expect(postMock).not.toHaveBeenCalled();
  });

  it('posts one entry when logging is on', async () => {
    writeActionLogPreference(true);

    await recordImportMapping(makeInput());

    expect(postMock).toHaveBeenCalledTimes(1);
    const [path, entry] = postMock.mock.calls[0];
    expect(path).toBe('/api/action-log');
    expect(entry.event_type).toBe('import.column_mapping');
  });

  it('swallows a rejected write so an import is never broken by logging', async () => {
    writeActionLogPreference(true);
    postMock.mockRejectedValue(new Error('disk full'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(recordImportMapping(makeInput())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('reports a write that resolves with an error', async () => {
    // api.* resolves with { error } rather than rejecting, so this — not the
    // rejection above — is how a handler failure actually arrives
    writeActionLogPreference(true);
    postMock.mockResolvedValue({ error: 'Failed to write action log', status: 500 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(recordImportMapping(makeInput())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      'Failed to record import action log entry:',
      'Failed to write action log'
    );
  });
});
