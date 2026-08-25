/**
 * Capabilities that existed with nothing calling them.
 *
 * This codebase's recurring failure is not broken code — it is correct code
 * that was never connected. These two were found by sweeping every store action
 * for callers, and both had a visible promise attached to them:
 *
 *   1. usePantryStore.getExpiringItems had no callers, while the pantry empty
 *      state tells users they will "get alerts before anything goes bad".
 *      Per-item expiry labels existed, but only once you scrolled to the item,
 *      which is not an alert. The meal-safety reminder is a fixed daily ping at
 *      the nutrition tab and knows nothing about pantry expiry.
 *
 *   2. useAimeeReportsStore.generateCycleReportFor had no callers, while
 *      useDoseLogStore fires a cycle-complete push whose own comment reads
 *      "§16 — cycle-complete push routes to the cycle report". The push routed
 *      to a report that was never created.
 *
 * Also pinned here: two things the 2026-08-24 plan listed as broken that are
 * NOT, verified before any code was written. Recording them stops the stale
 * claims being "fixed" again later.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (...p: string[]) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');

const pantry = read('app', 'pantry', 'index.tsx');
const doseStore = read('src', 'store', 'useDoseLogStore.ts');
const journalScreen = read('app', 'journal', 'index.tsx');
const journalStore = read('src', 'store', 'useJournalStore.ts');

describe('pantry expiry actually surfaces', () => {
  it('is the file we think it is', () => {
    expect(pantry).toMatch(/usePantryStore/);
    expect(pantry.length).toBeGreaterThan(1000);
  });

  it('calls getExpiringItems', () => {
    expect(pantry).toMatch(/getExpiringItems\(7\)/);
  });

  it('renders a banner from it', () => {
    expect(pantry).toMatch(/expiringSoon\.length > 0 &&/);
  });

  it('recomputes when the pantry changes', () => {
    // zustand actions are stable references, so `items` must be a dependency
    // or the banner would freeze after the first render.
    const i = pantry.indexOf('const expiringSoon');
    expect(pantry.slice(i, i + 600)).toMatch(/\[getExpiringItems, items\]/);
  });
});

describe('the cycle-complete push has a report to route to', () => {
  it('generates the report on deactivation', () => {
    expect(doseStore).toMatch(/generateCycleReportFor\?\.\(proto\.id\)/);
  });

  it('generates it BEFORE firing the push', () => {
    // The push can be tapped the instant it lands, so a report created after
    // it would still be missing on arrival.
    // Anchor on the CALL, not the explanatory comment above it — the comment
    // also contains the identifier and sits before the push either way, so
    // indexOf on the bare name passes even when the call is moved after.
    const gen = doseStore.indexOf('generateCycleReportFor?.(proto.id)');
    const push = doseStore.indexOf('fireCycleCompleteNudge?.({');
    expect(gen).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(-1);
    expect(gen).toBeLessThan(push);
  });

  it('does not let a failed report block deactivation', () => {
    // Anchor on the CALL, not the comment above it.
    const i = doseStore.indexOf('generateCycleReportFor?.(proto.id)');
    expect(i).toBeGreaterThan(-1);
    expect(doseStore.slice(i - 200, i + 120)).toMatch(/try \{/);
  });
});

describe('claims from the 2026-08-24 plan that are NOT true', () => {
  it('journal search works — the screen filters inline', () => {
    // The plan said searchEntries existed "with no search box". It has one.
    expect(journalScreen).toMatch(/searchQuery/);
    const i = journalScreen.indexOf('// Search filter');
    expect(i).toBeGreaterThan(-1);
    expect(journalScreen.slice(i, i + 400)).toMatch(/title\.toLowerCase\(\)\.includes/);
  });

  it('the free-tier journal cap is enforced, atomically', () => {
    // The plan said the cap "never fires". addEntry enforces it inline and
    // returns null, and the screen alerts on null.
    expect(journalStore).toMatch(/addEntry: \(input\) => \{/);
    const i = journalStore.indexOf('addEntry: (input) => {');
    expect(journalStore.slice(i, i + 900)).toMatch(/hasHydrated/);
  });
});
