/**
 * In-app account deletion (5.1.1(v)) must be able to complete, and must not
 * leave the user's public images behind.
 *
 * 1. community_reports.resolved_by referenced auth.users with no ON DELETE
 *    clause (NO ACTION), so auth.admin.deleteUser failed for any moderator who
 *    had resolved a report. Every FK to auth.users in the migrations must now
 *    say what happens on delete — either inline or via a later migration that
 *    re-adds it.
 * 2. delete-user removed rows but left every community image on R2, publicly
 *    readable. It now purges the post/comment/avatar prefixes that
 *    community-upload-image writes under the user's id.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  COMMUNITY_IMAGE_KINDS,
  userImagePrefixes,
  keysOwnedBy,
  chunk,
  purgeUserImages,
  R2_DELETE_BATCH,
} from '../../../supabase/functions/_shared/r2UserObjects';

const ROOT = path.join(__dirname, '..', '..', '..');
const MIGRATIONS = path.join(ROOT, 'supabase', 'migrations');

const USER = '3f2b8c1e-6a4d-4e2f-9b1a-0c5d7e8f9a0b';
const OTHER = '3f2b8c1e-6a4d-4e2f-9b1a-0c5d7e8f9a0c';

describe('FKs to auth.users declare ON DELETE', () => {
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  const sqlOf = (f: string) =>
    fs
      .readFileSync(path.join(MIGRATIONS, f), 'utf8')
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');

  /** table.column pairs whose inline FK to auth.users has no ON DELETE. */
  function missingInline(): { file: string; target: string }[] {
    const out: { file: string; target: string }[] = [];
    for (const f of files) {
      const sql = sqlOf(f);
      for (const m of sql.matchAll(/(\w+)\s+UUID\b[^,;]*?REFERENCES\s+auth\.users\s*(?:\(\s*id\s*\))?([^,;]*)/gi)) {
        if (/ON\s+DELETE/i.test(m[2])) continue;
        const before = sql.slice(0, m.index);
        const tables = [...before.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)];
        const table = tables.length ? tables[tables.length - 1][1] : '?';
        out.push({ file: f, target: `${table}.${m[1]}` });
      }
    }
    return out;
  }

  /** Was table.column's FK re-added WITH an ON DELETE clause in a later file? */
  function fixedLater(afterFile: string, target: string): boolean {
    const [table, column] = target.split('.');
    return files
      .filter((f) => f > afterFile)
      .some((f) =>
        new RegExp(
          `ALTER\\s+TABLE\\s+(?:public\\.)?${table}[\\s\\S]*?FOREIGN\\s+KEY\\s*\\(\\s*${column}\\s*\\)\\s*REFERENCES\\s+auth\\.users\\s*\\(\\s*id\\s*\\)\\s*ON\\s+DELETE`,
          'i',
        ).test(sqlOf(f)),
      );
  }

  it('reads the migrations (not vacuous)', () => {
    expect(files.length).toBeGreaterThan(50);
    const all = files.map(sqlOf).join('\n');
    expect((all.match(/REFERENCES\s+auth\.users/gi) ?? []).length).toBeGreaterThan(20);
  });

  it('detects community_reports.resolved_by as the inline offender', () => {
    // Positive control: the scanner must see the original defect.
    expect(missingInline().map((x) => x.target)).toContain('community_reports.resolved_by');
  });

  it('every inline FK without ON DELETE is fixed by a later migration', () => {
    const unfixed = missingInline().filter((x) => !fixedLater(x.file, x.target));
    expect(unfixed).toEqual([]);
  });

  it('the fix is SET NULL, keeping the report row', () => {
    const fix = files.find((f) => /community_reports_resolved_by_set_null/.test(f));
    expect(fix).toBeDefined();
    const sql = sqlOf(fix!);
    expect(sql).toMatch(/FOREIGN KEY \(resolved_by\) REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
    expect(sql).not.toMatch(/\bDELETE\s+FROM\b|\bUPDATE\s+public\./i);
  });
});

describe('R2 user image purge', () => {
  it('matches the kinds community-upload-image mints', () => {
    const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/community-upload-image/index.ts'), 'utf8');
    const m = src.match(/const ALLOWED_KINDS = new Set\(\[([^\]]*)\]\)/);
    expect(m).not.toBeNull();
    const kinds = [...m![1].matchAll(/'(\w+)'/g)].map((x) => x[1]).sort();
    expect(kinds).toEqual([...COMMUNITY_IMAGE_KINDS].sort());
    expect(src).toMatch(/`\$\{kind\}\/\$\{userId\}\//);
  });

  it('refuses a non-UUID id rather than widening the prefix', () => {
    expect(() => userImagePrefixes('')).toThrow();
    expect(() => userImagePrefixes('abc/')).toThrow();
    expect(userImagePrefixes(USER)).toEqual([`post/${USER}/`, `comment/${USER}/`, `avatar/${USER}/`]);
  });

  it('only keeps keys under this user', () => {
    expect(
      keysOwnedBy(USER, [`post/${USER}/2026-09-01/a.jpg`, `post/${OTHER}/2026-09-01/b.jpg`, `post/${USER}/`, 'x']),
    ).toEqual([`post/${USER}/2026-09-01/a.jpg`]);
  });

  it('chunks at the DeleteObjects limit', () => {
    expect(chunk(Array.from({ length: 2001 }, (_, i) => i)).map((c) => c.length)).toEqual([1000, 1000, 1]);
    expect(R2_DELETE_BATCH).toBe(1000);
  });

  it('pages through every prefix and deletes only the user’s keys', async () => {
    const bucket: Record<string, string[]> = {
      [`post/${USER}/`]: Array.from({ length: 1500 }, (_, i) => `post/${USER}/2026-09-01/${i}.jpg`),
      [`comment/${USER}/`]: [`comment/${USER}/2026-09-02/c.png`, `comment/${OTHER}/2026-09-02/leak.png`],
      [`avatar/${USER}/`]: [],
    };
    const deletedKeys: string[] = [];
    const store = {
      async listPage(prefix: string, token?: string) {
        const all = bucket[prefix] ?? [];
        const start = token ? Number(token) : 0;
        const keys = all.slice(start, start + 1000);
        return { keys, nextToken: start + 1000 < all.length ? String(start + 1000) : undefined };
      },
      async deleteKeys(keys: string[]) {
        expect(keys.length).toBeLessThanOrEqual(1000);
        deletedKeys.push(...keys);
        return 0;
      },
    };
    const res = await purgeUserImages(USER, store);
    expect(res).toEqual({ deleted: 1501, failed: 0 });
    expect(deletedKeys).toHaveLength(1501);
    expect(deletedKeys.some((k) => k.includes(OTHER))).toBe(false);
  });

  it('counts failures reported by the store', async () => {
    const res = await purgeUserImages(USER, {
      listPage: async (prefix) => ({ keys: [`${prefix}2026-09-01/a.jpg`, `${prefix}2026-09-01/b.jpg`] }),
      deleteKeys: async () => 1,
    });
    expect(res).toEqual({ deleted: 3, failed: 3 });
  });
});

describe('delete-user wiring', () => {
  const code = fs
    .readFileSync(path.join(ROOT, 'supabase/functions/delete-user/index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('purges images only after the auth user is deleted, and cannot fail the request', () => {
    const authDelete = code.indexOf('auth.admin.deleteUser(user.id)');
    const failReturn = code.indexOf("'Failed to delete account'");
    const purge = code.indexOf('await deleteUserImages(user.id)');
    const success = code.indexOf('JSON.stringify({ success: true })');
    expect(authDelete).toBeGreaterThan(-1);
    expect(purge).toBeGreaterThan(failReturn);
    expect(purge).toBeGreaterThan(authDelete);
    expect(success).toBeGreaterThan(purge);
    const around = code.slice(code.lastIndexOf('try {', purge), success);
    expect(around).toMatch(/catch \(err\)/);
  });

  it('deleteUserImages goes through purgeUserImages', () => {
    expect(code).toMatch(/await purgeUserImages\(userId, \{/);
  });
});
