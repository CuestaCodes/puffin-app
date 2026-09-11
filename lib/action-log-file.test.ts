import { describe, it, expect } from 'vitest';
import {
  ACTION_LOG_MAX_ENTRIES,
  appendActionLogEntry,
  parseActionLog,
  serializeActionLog,
} from './action-log-file';
import type { ActionLogEntry } from '@/types/action-log';

function makeEntry(overrides: Partial<ActionLogEntry> = {}): ActionLogEntry {
  return {
    id: 'entry-1',
    timestamp: '2026-09-09T04:12:33.412Z',
    event_type: 'import.column_mapping',
    source: 'ANZ Everyday',
    import_batch_id: 'batch-1',
    payload: {
      importKind: 'csv',
      hasHeaders: true,
      columnCount: 3,
      headers: ['Date', 'Narrative', 'Amount'],
      suggested: { date: 'Date', description: null, amount: 'Amount' },
      final: { date: 'Date', description: 'Narrative', amount: 'Amount' },
      overriddenFields: ['description'],
      dateFormat: { detected: 'auto', final: 'DD/MM/YYYY', overridden: true },
      rowsParsed: 10,
      rowsImported: 9,
    },
    ...overrides,
  };
}

describe('parseActionLog', () => {
  it('returns no entries for empty contents', () => {
    expect(parseActionLog('')).toEqual([]);
    expect(parseActionLog('\n\n  \n')).toEqual([]);
  });

  it('parses one entry per line', () => {
    const contents = serializeActionLog([
      makeEntry({ id: 'a' }),
      makeEntry({ id: 'b' }),
    ]);

    expect(parseActionLog(contents).map(e => e.id)).toEqual(['a', 'b']);
  });

  it('skips a corrupt line rather than losing the whole log', () => {
    // A half-written append after a crash must not make the history unreadable
    const contents =
      JSON.stringify(makeEntry({ id: 'a' })) +
      '\n' +
      '{"id":"truncated","timesta' +
      '\n' +
      JSON.stringify(makeEntry({ id: 'b' })) +
      '\n';

    expect(parseActionLog(contents).map(e => e.id)).toEqual(['a', 'b']);
  });

  it('skips well-formed JSON that is not an entry', () => {
    const contents = '{"unrelated":true}\n[1,2,3]\n"a string"\nnull\n';

    expect(parseActionLog(contents)).toEqual([]);
  });

  it('round-trips a nested payload unchanged', () => {
    const entry = makeEntry();
    const [parsed] = parseActionLog(serializeActionLog([entry]));

    expect(parsed).toEqual(entry);
    expect(parsed.payload.headers).toEqual(['Date', 'Narrative', 'Amount']);
    expect(parsed.payload.dateFormat.overridden).toBe(true);
  });
});

describe('serializeActionLog', () => {
  it('produces empty contents for no entries', () => {
    expect(serializeActionLog([])).toBe('');
  });

  it('ends with a newline so a later append starts on a clean line', () => {
    expect(serializeActionLog([makeEntry()]).endsWith('\n')).toBe(true);
  });

  it('writes exactly one line per entry', () => {
    const contents = serializeActionLog([makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]);

    expect(contents.trimEnd().split('\n')).toHaveLength(2);
  });
});

describe('appendActionLogEntry', () => {
  it('appends to empty contents', () => {
    const contents = appendActionLogEntry('', makeEntry({ id: 'first' }));

    expect(parseActionLog(contents).map(e => e.id)).toEqual(['first']);
  });

  it('appends after existing entries, preserving order', () => {
    const existing = serializeActionLog([makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]);
    const contents = appendActionLogEntry(existing, makeEntry({ id: 'c' }));

    expect(parseActionLog(contents).map(e => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('drops the oldest entries once the cap is exceeded', () => {
    const existing = serializeActionLog(
      Array.from({ length: 5 }, (_, i) => makeEntry({ id: `old-${i}` }))
    );

    const contents = appendActionLogEntry(existing, makeEntry({ id: 'newest' }), 3);
    const ids = parseActionLog(contents).map(e => e.id);

    expect(ids).toEqual(['old-3', 'old-4', 'newest']);
  });

  it('keeps everything when under the cap', () => {
    const contents = appendActionLogEntry('', makeEntry({ id: 'only' }), 3);

    expect(parseActionLog(contents)).toHaveLength(1);
  });

  it('defaults to the documented cap', () => {
    const existing = serializeActionLog(
      Array.from({ length: ACTION_LOG_MAX_ENTRIES }, (_, i) => makeEntry({ id: `e-${i}` }))
    );

    const entries = parseActionLog(appendActionLogEntry(existing, makeEntry({ id: 'newest' })));

    expect(entries).toHaveLength(ACTION_LOG_MAX_ENTRIES);
    expect(entries[entries.length - 1].id).toBe('newest');
    expect(entries[0].id).toBe('e-1');
  });

  it('repairs a corrupt trailing line while appending', () => {
    const damaged = JSON.stringify(makeEntry({ id: 'a' })) + '\n{"id":"trunc';
    const contents = appendActionLogEntry(damaged, makeEntry({ id: 'b' }));

    expect(parseActionLog(contents).map(e => e.id)).toEqual(['a', 'b']);
  });
});
