import { backupFileName, parseBackup } from '../backup';

const valid = {
  app: 'hisaab', format: 1, schema_version: 4, exported_at: 1,
  tables: { accounts: [{ id: 1, name: 'Cash', type: 'cash', created_at: 1 }], transactions: [
    { id: 1, amount_paise: 4000, type: 'expense' }, { id: 2, amount_paise: 0, type: 'correction' },
  ] },
};

describe('backup', () => {
  it('validates and summarises', () => {
    const { summary, backup } = parseBackup(JSON.stringify(valid), 4);
    expect(summary).toMatchObject({ entries: 1, accounts: 1, goals: 0 });
    expect(backup.tables.settings).toEqual([]);
  });

  it.each([
    ['not json', 'nope', 'valid JSON'],
    ['other app', JSON.stringify({ ...valid, app: 'x' }), "isn't a Hisaab backup"],
    ['newer schema', JSON.stringify({ ...valid, schema_version: 99 }), 'newer version'],
    ['float money', JSON.stringify({ ...valid, tables: { ...valid.tables, transactions: [{ amount_paise: 1.5 }] } }), 'non-integer'],
    ['no accounts', JSON.stringify({ ...valid, tables: { accounts: [] } }), 'no accounts'],
  ])('rejects %s', (_n, text, message) => {
    expect(() => parseBackup(text, 4)).toThrow(message);
  });

  it('names files by date', () => {
    expect(backupFileName(new Date(2026, 8, 5).getTime())).toBe('hisaab-backup-2026-09-05.json');
  });
});
