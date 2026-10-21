/**
 * Safety-information-only compounds — no dose reaches a user, on any surface.
 *
 * Edward, 2026-09-16: for the compounds in src/data/safetyOnlyCompounds.ts,
 * remove dosing entirely. The data is NOT deleted — every figure is still in
 * protocols.ts, the master table, the reconstitution ladder and
 * clinicianRulings.ts, and the clinical-consistency suite still holds each of
 * them to Jamie's rulings. This file holds the READ/RENDER boundary.
 *
 * HOW THIS AVOIDS BEING VACUOUS
 * Three ways, because "nothing rendered" is the easiest assertion in the world
 * to pass by accident — a component that throws, a getter that returns
 * undefined for every id, a walker that reads the wrong tree shape, all look
 * identical to a clean suppression.
 *
 *   1. Every "no dose" assertion is paired with a CONTROL (BPC-157, or the
 *      oral 5-Amino-1MQ that is deliberately NOT on the list) asserted to
 *      still show its dose through the same code path. If the path breaks, the
 *      control fails first.
 *   2. `COVERAGE` asserts up front that the listed compounds actually HAVE
 *      stored dose data to suppress — if protocols.ts were emptied tomorrow
 *      this suite would go quiet, so it fails instead.
 *   3. scripts/verify-safety-only.mjs mutation-tests the suite itself: it
 *      removes an id from the list and from the renderer and requires the
 *      suite to go red.
 */

import React from 'react';
import fs from 'fs';
import path from 'path';

import {
  SAFETY_ONLY_COMPOUND_IDS,
  isSafetyOnly,
} from '../../data/safetyOnlyCompounds';
import {
  getProtocolsForDisplay,
  getDosingTableEntryForDisplay,
  getDosingReferenceForDisplay,
  getAllDosingReferencesForDisplay,
  redactDoseBearingNotes,
  containsDoseFigure,
} from '../../data/dosingDisplay';
import { PROTOCOL_TEMPLATES, getProtocolsByPeptide } from '../../data/protocols';
import { PEPTIDE_DOSING_TABLE, getDosingTableEntry } from '../../data/peptideDosingTable';
import { PEPTIDE_DOSING_REFERENCE } from '../../data/peptideDosingReference';
import { getCanonicalDose } from '../../data/canonicalDosing';
import { checkDoseSafety, checkDoseGuards } from '../../services/doseSafety';
import { generateBotResponse } from '../../services/peptalkBot';
import { DosingReferenceTableCard } from '../../components/DosingReferenceTableCard';
import { TitrationScheduleCard } from '../../components/TitrationScheduleCard';
import { ProtocolPlanCard } from '../../components/ProtocolPlanCard';
import { SuppliesEstimatorCard } from '../../components/SuppliesEstimatorCard';
import { getPeptideById } from '../../data/peptides';
import {
  SAFETY_ONLY_WHY_NO_DOSE,
  SAFETY_ONLY_PRESCRIBER_LINE,
  SAFETY_ONLY_AIMEE_STOCK_ANSWER,
} from '../../constants/safetyOnlyCopy';

/**
 * ProtocolPlanCard / SuppliesEstimatorCard / TitrationScheduleCard all pull in
 * `useTheme`, which reaches a persisted zustand store and therefore the native
 * AsyncStorage module. There is no native module under jest, so the import
 * throws before a single assertion runs. A memory shim is enough — nothing in
 * this file depends on anything being persisted, and the theme store falls
 * back to its defaults.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
    multiGet: async () => [],
    multiSet: async () => undefined,
    multiRemove: async () => undefined,
    getAllKeys: async () => [],
    clear: async () => undefined,
  },
}));


const ROOT = path.resolve(__dirname, '../../..');
const CONTROL = 'bpc-157';

/**
 * A figure followed by a dose unit. This is the assertion the whole file turns
 * on, so it is proved against known strings below before it is trusted.
 */
const DOSE_RE = /\d+(?:[.,]\d+)?\s*(mcg|µg|ug|mg|IU|units?|ml|cc)\b/i;
const dosesIn = (s: string): string[] => s.match(new RegExp(DOSE_RE, 'gi')) ?? [];

// ── rendering ──────────────────────────────────────────────────────────────

/**
 * `react-test-renderer` ships no type declarations and is a transitive
 * dependency of `jest-expo` (the configured preset) rather than a declared one.
 * Requiring it with a local type keeps both facts visible and adds nothing to
 * package.json — this repo's install is load-bearing (`node-linker=hoisted`,
 * no lockfile) and is not worth disturbing for a test helper.
 */
const TestRenderer = require('react-test-renderer') as {
  create: (el: React.ReactElement) => { toJSON: () => unknown };
  act: (cb: () => void) => void;
};

/** Every string a rendered React-Native tree would put in front of a user. */
function renderedText(element: React.ReactElement): string {
  // toJSON() must be read AFTER act() returns. Called inside the callback it
  // runs before the commit and yields null for every tree — which reads
  // exactly like a clean suppression. That is what the control assertions are
  // for, and they caught it.
  let tree: { toJSON: () => unknown } | null = null;
  TestRenderer.act(() => {
    tree = TestRenderer.create(element);
  });
  const json = (tree as unknown as { toJSON: () => unknown }).toJSON();
  const out: string[] = [];
  const walk = (n: unknown): void => {
    if (n == null || n === false) return;
    if (typeof n === 'string' || typeof n === 'number') {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    const node = n as { children?: unknown; props?: Record<string, unknown> };
    // accessibilityLabel is read aloud — it is rendered output for a screen
    // reader even when it never appears visually.
    const label = node.props?.accessibilityLabel;
    if (typeof label === 'string') out.push(label);
    if (node.children) walk(node.children);
  };
  walk(json);
  return out.join(' • ');
}

// ── what there is to suppress ──────────────────────────────────────────────

interface Coverage {
  id: string;
  protocols: number;
  table: boolean;
  ladder: boolean;
  canonical: boolean;
}

const COVERAGE: Coverage[] = SAFETY_ONLY_COMPOUND_IDS.map((id) => ({
  id,
  protocols: PROTOCOL_TEMPLATES.filter((p) => p.peptideId === id).length,
  table: PEPTIDE_DOSING_TABLE.some((e) => e.peptideId === id),
  ladder: PEPTIDE_DOSING_REFERENCE.some((e) => e.peptideId === id),
  canonical: getCanonicalDose(id) !== null,
}));

/** The ids that actually carry a dose today — the ones with something to hide. */
const DOSED = COVERAGE.filter((c) => c.canonical || c.protocols > 0 || c.table || c.ladder);

describe('the suite has something to prove (positive control)', () => {
  it('the regex recognises a dose and is not fooled by a non-dose', () => {
    expect(DOSE_RE.test('250-500 mcg')).toBe(true);
    expect(DOSE_RE.test('0.2 mg')).toBe(true);
    expect(DOSE_RE.test('500-1000 IU')).toBe(true);
    expect(DOSE_RE.test('10 units')).toBe(true);
    expect(DOSE_RE.test('0.1 ml')).toBe(true);
    expect(DOSE_RE.test('8-12 weeks')).toBe(false);
    expect(DOSE_RE.test('Lyophilized at -20°C')).toBe(false);
    expect(DOSE_RE.test('hGH 177-191 fragment')).toBe(false);
  });

  it('the renderer really reads text out of a tree', () => {
    const text = renderedText(<DosingReferenceTableCard peptideId={CONTROL} />);
    expect(text).toContain('Dosing reference');
    expect(dosesIn(text).length).toBeGreaterThan(0);
  });

  it('most listed compounds have stored dosing data to suppress', () => {
    // If this drops, the suppression assertions below stop meaning anything.
    expect(DOSED.length).toBeGreaterThanOrEqual(13);
  });

  it('records exactly which listed names carry no dosing data at all', () => {
    // `testosterone` is a lab marker here, never a compound; `gonadorelin`
    // appears only as a goal-matrix tier entry. Both are on the list
    // defensively. If either ever gains dosing data, it moves into DOSED and
    // every assertion below starts covering it — so this is a record, not an
    // exemption.
    const undosed = COVERAGE.filter((c) => !DOSED.includes(c)).map((c) => c.id).sort();
    expect(undosed).toEqual(['dermorphin', 'gonadorelin', 'testosterone']);
  });

  it('the control compound is NOT on the list', () => {
    expect(isSafetyOnly(CONTROL)).toBe(false);
    expect(getProtocolsForDisplay(CONTROL).length).toBeGreaterThan(0);
  });
});

// ── 1. the read boundary ───────────────────────────────────────────────────

describe('read boundary: no dosing data is handed to a screen', () => {
  it.each(SAFETY_ONLY_COMPOUND_IDS.map((id) => [id]))('%s', (id) => {
    expect(getProtocolsForDisplay(id)).toEqual([]);
    expect(getDosingTableEntryForDisplay(id)).toBeNull();
    expect(getDosingReferenceForDisplay(id)).toBeNull();
    expect(getAllDosingReferencesForDisplay(id)).toEqual([]);
  });

  it('the raw getters still return the data (nothing was deleted)', () => {
    // The whole design rests on this: suppression at the boundary, data intact
    // underneath, so the decision is reversible and the integrity checks and
    // clinicianRulings.test.ts keep examining these compounds.
    expect(getProtocolsByPeptide('hcg').length).toBeGreaterThan(0);
    expect(getDosingTableEntry('cardarine')).not.toBeNull();
    expect(getCanonicalDose('mk-677')).not.toBeNull();
  });

  it('control still gets everything', () => {
    expect(getProtocolsForDisplay(CONTROL).length).toBeGreaterThan(0);
    expect(getDosingTableEntryForDisplay(CONTROL)).not.toBeNull();
    expect(getDosingReferenceForDisplay(CONTROL)).not.toBeNull();
  });
});

// ── 2. the rendered cards ──────────────────────────────────────────────────

describe('peptide detail: the dosing reference table card', () => {
  it.each(SAFETY_ONLY_COMPOUND_IDS.map((id) => [id]))('%s renders nothing', (id) => {
    expect(renderedText(<DosingReferenceTableCard peptideId={id} />)).toBe('');
  });

  it('control renders its range, cycle and titration', () => {
    const text = renderedText(<DosingReferenceTableCard peptideId={CONTROL} />);
    expect(text).toContain('Dosing range');
    expect(dosesIn(text).length).toBeGreaterThan(0);
  });
});

describe('peptide detail: every protocol-driven dose card', () => {
  /**
   * The quick-dose pills, cycle plan, activation card, supplies estimator,
   * titration ladder and protocol-templates block on app/peptide/[id].tsx are
   * ALL gated on `protocols.length > 0`, and `protocols` is
   * `getProtocolsForDisplay(id)`. One empty array collapses six surfaces.
   *
   * The cards below are rendered with the CONTROL's protocol to prove each one
   * really does emit a dose when it is given one — otherwise "the screen never
   * renders them" would be an untested claim about a component that might emit
   * nothing anyway.
   */
  it.each(SAFETY_ONLY_COMPOUND_IDS.map((id) => [id]))(
    '%s: the screen has no protocol to feed them',
    (id) => {
      expect(getProtocolsForDisplay(id)[0]).toBeUndefined();
    },
  );

  const controlProtocol = getProtocolsForDisplay(CONTROL)[0];
  const controlPeptide = getPeptideById(CONTROL)!;

  it('TitrationScheduleCard emits a dose when fed one (control)', () => {
    const withLadder = PROTOCOL_TEMPLATES.find((p) => p.titrationSchedule?.length)!;
    const text = renderedText(<TitrationScheduleCard protocol={withLadder} />);
    expect(dosesIn(text).length).toBeGreaterThan(0);
  });

  it('ProtocolPlanCard emits a dose when fed one (control)', () => {
    const text = renderedText(
      <ProtocolPlanCard peptide={controlPeptide} protocol={controlProtocol} />,
    );
    expect(dosesIn(text).length).toBeGreaterThan(0);
  });

  it('SuppliesEstimatorCard emits a figure when fed a protocol (control)', () => {
    const text = renderedText(<SuppliesEstimatorCard protocol={controlProtocol} />);
    expect(text.length).toBeGreaterThan(0);
  });
});

// ── 3. the dose-safety guard ───────────────────────────────────────────────

describe('doseSafety: the guard keeps working, the range stops being printed', () => {
  /**
   * Both halves are asserted for every listed compound that has a canonical
   * range. Dropping either one would let a regression through: assert only
   * that the range is gone and switching the guard off passes; assert only
   * that it fires and printing the range passes.
   */
  const guarded = COVERAGE.filter((c) => c.canonical).map((c) => [c.id] as const);

  it.each(guarded)('%s: a dangerous logged dose is still flagged', (id) => {
    const canonical = getCanonicalDose(id)!;
    const wild = (canonical.maxMcg * 50) / 1000; // mg, far past the 3x trigger
    const result = checkDoseSafety(id, wild, 'mg');
    expect(result.safe).toBe(false);
    expect(result.code).toBe('unusually_high');
    expect(result.message).toBeTruthy();
  });

  it.each(guarded)('%s: the warning names no dose but the one typed', (id) => {
    const canonical = getCanonicalDose(id)!;
    const amount = (canonical.maxMcg * 50) / 1000;
    const message = checkDoseSafety(id, amount, 'mg').message!;
    // The user's own amount is echoed back — that is their input, not our
    // suggestion. Remove it, and NOTHING that looks like a dose may remain.
    const withoutOwnInput = message.split(`${amount} mg`).join(' ');
    expect(dosesIn(withoutOwnInput)).toEqual([]);
  });

  it.each(guarded)('%s: an unusually LOW dose is still flagged, still unnamed', (id) => {
    const canonical = getCanonicalDose(id)!;
    const tiny = canonical.minMcg / 1000; // 1/1000th of the floor, in mcg
    const result = checkDoseSafety(id, tiny, 'mcg');
    expect(result.safe).toBe(false);
    expect(result.code).toBe('unusually_low');
    const withoutOwnInput = result.message!.split(`${tiny} mcg`).join(' ');
    expect(dosesIn(withoutOwnInput)).toEqual([]);
  });

  it('checkDoseGuards passes the same message through', () => {
    const warnings = checkDoseGuards({
      peptideIdOrName: 'mk-677',
      amount: 5000,
      unit: 'mg',
    });
    expect(warnings.length).toBeGreaterThan(0);
    const body = warnings.map((w) => `${w.title} ${w.message}`).join(' ');
    expect(dosesIn(body.split('5000 mg').join(' '))).toEqual([]);
  });

  it('control still has its range printed, so the assertion has teeth', () => {
    const message = checkDoseSafety(CONTROL, 9999, 'mg').message!;
    expect(dosesIn(message.split('9999 mg').join(' ')).length).toBeGreaterThan(0);
  });
});

// ── 4. Aimee — on-device bot ───────────────────────────────────────────────

describe('Aimee (on-device bot) states no dose', () => {
  // The bot needs a context object; an empty one is the signed-out shape.
  const ctx = { userProfile: null, checkIns: [], doseLogs: [], stacks: [] } as never;
  const ask = (name: string) =>
    generateBotResponse(`what dose of ${name} should I take?`, ctx).content;

  const named: [string, string][] = [
    ['cardarine', 'Cardarine'],
    ['mk-677', 'MK-677'],
    ['hcg', 'hCG'],
    ['hmg', 'HMG'],
    ['somatropin', 'Somatropin'],
    ['aod-9604', 'AOD-9604'],
    ['yk-11', 'YK-11'],
    ['follistatin-344', 'Follistatin-344'],
    ['peg-mgf', 'PEG-MGF'],
    ['bam15', 'BAM15'],
    ['foxo4-dri', 'FOXO4-DRI'],
    ['slu-pp-332', 'SLU-PP-332'],
    ['enclomiphene', 'Enclomiphene'],
    ['dermorphin', 'Dermorphin'],
  ];

  it.each(named)('%s', (_id, displayName) => {
    expect(dosesIn(ask(displayName))).toEqual([]);
  });

  it('answers about the compound rather than refusing to speak', () => {
    const answer = ask('hCG');
    expect(answer.length).toBeGreaterThan(200);
    expect(answer).toMatch(/hCG/i);
  });

  it('keeps the safety material that sits beside the numbers', () => {
    // hCG's importantNotes carry both a dose and "Banned by WADA". Only the
    // dose-bearing line is dropped.
    expect(ask('hCG')).toMatch(/WADA/i);
    // Contraindications are a safety list, never a dose.
    expect(ask('hMG')).toMatch(/pregnancy/i);
  });

  it('control still answers with a dose', () => {
    expect(dosesIn(ask('BPC-157')).length).toBeGreaterThan(0);
  });
});

// ── 5. Aimee — server prompt, knowledge, tools ─────────────────────────────

describe("Aimee's baked knowledge file", () => {
  const kb = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'supabase/functions/aimee-chat/_knowledge.json'),
      'utf8',
    ),
  ) as {
    protocols: Record<string, unknown>[];
  };

  it('is regenerated, not hand-edited (row count still matches)', () => {
    expect(kb.protocols.length).toBe(PROTOCOL_TEMPLATES.length);
  });

  it('carries no dose figure for any listed compound', () => {
    const rows = kb.protocols.filter((r) => isSafetyOnly(r.peptideId as string));
    // Positive control: there ARE such rows. Without this, a generator that
    // dropped the rows entirely would pass.
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const row of rows) {
      expect(row.dose).toBeUndefined();
      expect(row.titration).toBeUndefined();
      expect(row.safetyInformationOnly).toBe(true);
      // Storage strings legitimately carry "-20°C" and "30 days"; the notes
      // and every other field must carry no figure.
      const notes = (row.notes as string[] | undefined) ?? [];
      for (const n of notes) expect(containsDoseFigure(n)).toBe(false);
    }
  });

  it('keeps the safety material on those rows', () => {
    const hcg = kb.protocols.find((r) => r.peptideId === 'hcg')!;
    expect((hcg.contraindications as string[]).length).toBeGreaterThan(0);
    expect((hcg.notes as string[]).length).toBeGreaterThan(0);
  });

  it('control row still carries its dose', () => {
    const control = kb.protocols.find((r) => r.peptideId === CONTROL)!;
    expect(containsDoseFigure(control.dose as string)).toBe(true);
  });
});

describe("Aimee's system prompt", () => {
  const promptPath = path.join(
    ROOT,
    'supabase/functions/aimee-chat-stream/_prompt.ts',
  );
  const lines = fs.readFileSync(promptPath, 'utf8').split('\n');

  /**
   * The hand-written grid in PEPTALK_DOSING_REFERENCE_BLOCK is prose, so it is
   * held line by line: find the line that starts with the compound's label and
   * assert it states no figure. Each label is asserted to EXIST first — the
   * compound stays present with its safety information, it is not deleted.
   */
  const PROMPT_LABELS = [
    'SLU-PP-332',
    'AOD-9604',
    'MK-677 (Ibutamoren, oral)',
    'PEG-MGF',
    'Follistatin 344',
    'YK-11',
    '5-Amino-1MQ (injectable)',
    'Cardarine (GW-501516)',
    'BAM15',
    'FoxO4-DRI',
    'Enclomiphene',
    'HCG',
  ];

  it.each(PROMPT_LABELS.map((l) => [l]))('%s: present, with no figure', (label) => {
    const matches = lines.filter((l) => l.startsWith(`${label} —`));
    expect(matches).toHaveLength(1);
    expect(dosesIn(matches[0])).toEqual([]);
    expect(matches[0]).toContain('SAFETY INFORMATION ONLY');
  });

  it("keeps Cardarine's carcinogen warning", () => {
    const line = lines.find((l) => l.startsWith('Cardarine (GW-501516) —'))!;
    expect(line).toContain('KNOWN ANIMAL CARCINOGEN');
    expect(line).toContain('DO NOT USE');
    expect(line).toContain('tumors');
    expect(line).toContain('ALWAYS lead with the cancer warning');
  });

  it('keeps the other compounds’ safety framing', () => {
    const find = (l: string) => lines.find((x) => x.startsWith(`${l} —`))!;
    expect(find('YK-11')).toMatch(/not approved for human use/i);
    expect(find('BAM15')).toMatch(/serious safety history/i);
    expect(find('PEG-MGF')).toMatch(/WADA-banned/i);
    expect(find('MK-677 (Ibutamoren, oral)')).toMatch(/insulin sensitivity/i);
  });

  it('carries a rule naming the whole list', () => {
    const text = lines.join('\n');
    expect(text).toContain('SAFETY INFORMATION ONLY');
    expect(text).toMatch(/Dermorphin/);
    expect(text).toMatch(/Somatropin/);
    expect(text).toMatch(/hMG/);
    expect(text).toMatch(/Gonadorelin/i);
  });

  it('the ORAL 5-Amino-1MQ is untouched (it is not on the list)', () => {
    const oral = lines.filter((l) => l.startsWith('5-Amino-1MQ (oral) —'));
    expect(oral).toHaveLength(1);
    expect(dosesIn(oral[0]).length).toBeGreaterThan(0);
    expect(isSafetyOnly('5-amino-1mq')).toBe(false);
  });

  it('control lines keep their figures', () => {
    const bpc = lines.filter((l) => l.startsWith('BPC-157 —'));
    expect(bpc).toHaveLength(1);
    expect(dosesIn(bpc[0]).length).toBeGreaterThan(0);
  });
});

describe("Aimee's tools", () => {
  /**
   * `require`, not `import`. A static import pulls the edge function into the
   * TypeScript program, and with it `_grok.ts`, which references the Deno
   * global and the `.ts` import extension Deno needs — nine typecheck errors
   * in files that are not part of the app build. jest's resolver takes the
   * literal path happily.
   */
    const { execOpenDosingCalculator } = require(
    '../../../supabase/functions/aimee-chat-stream/_tools.ts',
  ) as {
    execOpenDosingCalculator: (
      input: Record<string, unknown>,
    ) => Record<string, unknown>;
  };

  it('refuses to deep-link the calculator pre-filled for a listed compound', () => {
    for (const id of SAFETY_ONLY_COMPOUND_IDS) {
      const result = execOpenDosingCalculator({
        peptideId: id,
        doseMcg: 5000,
        vialMg: 10,
        waterMl: 3,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('safety_information_only');
      expect(dosesIn(JSON.stringify(result))).toEqual([]);
    }
    // Control: the tool still works, and still passes the dose through.
    const ok = execOpenDosingCalculator({ peptideId: CONTROL, doseMcg: 250 });
    expect(ok.ok).toBe(true);
    expect(JSON.stringify(ok)).toContain('doseMcg=250');
  });
});

describe('the Deno mirror of the list', () => {
  it('matches src/data/safetyOnlyCompounds.ts exactly', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/data/safetyOnlyCompounds.ts'),
      'utf8',
    );
    const shared = fs.readFileSync(
      path.join(ROOT, 'supabase/functions/_shared/safetyOnlyCompounds.ts'),
      'utf8',
    );
    const idsIn = (text: string): string[] => {
      const block = text.slice(
        text.indexOf('SAFETY_ONLY_COMPOUND_IDS = ['),
        text.indexOf('] as const'),
      );
      return (block.match(/'([^']+)'/g) ?? []).map((s) => s.slice(1, -1)).sort();
    };
    const a = idsIn(src);
    expect(a.length).toBe(SAFETY_ONLY_COMPOUND_IDS.length);
    expect(idsIn(shared)).toEqual(a);
  });
});

// ── 6. helpers and copy slots ──────────────────────────────────────────────

describe('note redaction keeps safety, drops figures', () => {
  it('filters hCG’s notes line by line', () => {
    const notes = PROTOCOL_TEMPLATES.find((p) => p.peptideId === 'hcg')!.importantNotes;
    const kept = redactDoseBearingNotes('hcg', notes);
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThan(notes.length);
    for (const n of kept) expect(containsDoseFigure(n)).toBe(false);
    expect(kept.some((n) => /WADA/i.test(n))).toBe(true);
  });

  it('is a pass-through for a compound that is not listed', () => {
    const notes = PROTOCOL_TEMPLATES.find((p) => p.peptideId === CONTROL)!.importantNotes;
    expect(redactDoseBearingNotes(CONTROL, notes)).toEqual([...notes]);
  });
});

describe('copy slots awaiting Edward render nothing', () => {
  it('are empty strings, not placeholder text', () => {
    // When Edward fills one in, this test is the thing that tells you to go
    // look at the render sites — each of which already checks for '' and
    // renders nothing. Change the expectation then, deliberately.
    expect(SAFETY_ONLY_WHY_NO_DOSE).toBe('');
    expect(SAFETY_ONLY_PRESCRIBER_LINE).toBe('');
    expect(SAFETY_ONLY_AIMEE_STOCK_ANSWER).toBe('');
  });

  it('no render site prints a placeholder in their place', () => {
    for (const file of [
      'app/peptide/[id].tsx',
      'src/services/peptalkBot.ts',
    ]) {
      const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
      // Every use must be guarded by an emptiness check.
      const uses = text.match(/SAFETY_ONLY_[A-Z_]+/g) ?? [];
      expect(uses.length).toBeGreaterThan(0);
      expect(text).toMatch(/SAFETY_ONLY_[A-Z_]+ !== ''/);
    }
  });
});

describe('isSafetyOnly', () => {
  it('is tolerant of the shapes ids actually arrive in', () => {
    expect(isSafetyOnly('MK-677')).toBe(true);
    expect(isSafetyOnly('  hcg ')).toBe(true);
    // Where a compound's NAME happens to equal its id, the name resolves too.
    // That is a wider net, not a false positive.
    expect(isSafetyOnly('Cardarine')).toBe(true);
    // A name that is NOT an id does not resolve — callers must pass ids.
    expect(isSafetyOnly('Ibutamoren')).toBe(false);
    expect(isSafetyOnly('')).toBe(false);
    expect(isSafetyOnly(undefined)).toBe(false);
    expect(isSafetyOnly(null)).toBe(false);
  });
});
