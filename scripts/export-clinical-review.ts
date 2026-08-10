/**
 * export:review — every open clinical-review question as ONE json payload.
 *
 * Edward: "how does a person look at this theres not table or chart or
 * anything presented."
 *
 * Fair. verify:dosingconsistency and verify:doseprovenance print these lists to
 * a terminal, which is fine for a build gate and useless for the person who has
 * to make the decisions. This feeds a review page instead.
 *
 * It is a GENERATOR, not a snapshot: the page is built from this output, so a
 * dose corrected in the code changes the page rather than leaving a stale hand-
 * transcribed table behind. Transcribing these numbers by hand is exactly how
 * two sources came to disagree in the first place.
 *
 * Emits review-data.json (gitignored). Run: npm run export:review
 */
import { writeFileSync } from 'fs';
import { PEPTIDES } from '../src/data/peptides';
import { getDosingTableEntry } from '../src/data/peptideDosingTable';
import { getProtocolsByPeptide } from '../src/data/protocols';
import { PEPTIDE_DOSING_REFERENCE } from '../src/data/peptideDosingReference';
import { normalizeDoseRange } from '../src/lib/doseUnits';
import { SOURCES, getSourcesByPeptide } from '../src/data/sources';

const toMcg = (text?: string): [number, number] | null => {
  if (!text) return null;
  const nums = (text.match(/[\d.]+/g) ?? []).map(Number).filter(Number.isFinite);
  const sides = text.split(/[-–]/);
  if (nums.length !== 2 || sides.length !== 2) return null;
  const conv = (s: string, v: number) => (/mcg|µg/i.test(s) ? v : /mg/i.test(s) ? v * 1000 : null);
  let lo = conv(sides[0], nums[0]);
  const hi = conv(sides[1], nums[1]);
  if (lo === null && hi !== null) lo = /mg/i.test(sides[1]) && !/mcg/i.test(sides[1]) ? nums[0] * 1000 : nums[0];
  return lo === null || hi === null ? null : [lo, hi];
};

const ladderOf = (id: string): [number, number] | null => {
  const e: any = (PEPTIDE_DOSING_REFERENCE as any[]).find((r) => r.peptideId === id);
  const d = (e?.schedule ?? []).map((s: any) => s.doseMcg).filter((n: any) => Number.isFinite(n) && n > 0);
  return d.length ? [Math.min(...d), Math.max(...d)] : null;
};

const weeksFrom = (t?: string): [number, number] | null => {
  if (!t) return null;
  const r = t.match(/(\d+)\s*[-–]\s*(\d+)\s*week/i);
  if (r) return [Number(r[1]), Number(r[2])];
  const m = t.match(/(\d+)\s*[-–]\s*(\d+)\s*month/i);
  if (m) return [Math.round(Number(m[1]) * 4.345), Math.round(Number(m[2]) * 4.345)];
  const o = t.match(/(\d+)\s*week/i);
  if (o) return [Number(o[1]), Number(o[1])];
  return null;
};

const doses: any[] = [];
const cycles: any[] = [];
const provenance: any[] = [];

for (const p of PEPTIDES as any[]) {
  const entry = getDosingTableEntry(p.id);
  const proto = getProtocolsByPeptide(p.id)[0];

  // 1. dose range — table vs protocol
  if (entry?.dosingRange && proto?.typicalDose) {
    const d = normalizeDoseRange(proto.typicalDose.min, proto.typicalDose.max, proto.typicalDose.unit);
    const t = toMcg(entry.dosingRange);
    if (d.massBased && t) {
      const off = (a: number, b: number) => (Math.max(a, b) > 0 ? (Math.abs(a - b) / Math.max(a, b)) * 100 : 0);
      const worst = Math.max(off(t[0], d.min), off(t[1], d.max));
      if (worst > 2) {
        const ratio = Math.max(t[1] / d.max, d.max / t[1]);
        doses.push({
          name: p.name, id: p.id,
          table: t, protocol: [d.min, d.max],
          tableText: entry.dosingRange,
          ratio: Number(ratio.toFixed(1)),
        });
      }
    }
  }

  // 2. cycle length — table vs protocol
  if (entry?.cycleLength && proto?.durationWeeks) {
    const t = weeksFrom(entry.cycleLength);
    if (t) {
      const pr: [number, number] = [proto.durationWeeks.min, proto.durationWeeks.max];
      if (Math.abs(t[0] - pr[0]) > 1 || Math.abs(t[1] - pr[1]) > 1)
        cycles.push({ name: p.name, id: p.id, tableText: entry.cycleLength, table: t, protocol: pr });
    }
  }

  // 3. three-way — does Edward's own worked dose fall inside each range?
  const ladder = ladderOf(p.id);
  const t3 = toMcg(entry?.dosingRange);
  const pd = proto?.typicalDose;
  const mult = pd ? (pd.unit === 'mg' ? 1000 : pd.unit === 'mcg' ? 1 : 0) : 0;
  if (ladder && t3 && pd && mult) {
    const pr: [number, number] = [pd.min * mult, pd.max * mult];
    const inside = (r: [number, number]) => ladder[0] >= r[0] * 0.98 && ladder[1] <= r[1] * 1.02;
    const inT = inside(t3), inP = inside(pr);
    if (!(inT && inP))
      provenance.push({
        name: p.name, id: p.id, ladder, table: t3, protocol: pr,
        verdict: !inT && !inP ? 'neither' : inT ? 'tableOnly' : 'protoOnly',
      });
  }
}

// 4. peptides asserting clinical prose with no cited source
// SOURCES entries carry peptideIds (PLURAL, an array). Reading `.peptideId`
// produced a set of one undefined and reported all 79 peptides as uncited —
// the exact false number this page exists to avoid. Use the shipped helper.
const cited = new Set(
  (PEPTIDES as any[]).filter((p) => getSourcesByPeptide(p.id).length > 0).map((p) => p.id),
);
const uncited = (PEPTIDES as any[])
  .filter((p) => (p.researchSummary || p.mechanismOfAction) && !cited.has(p.id))
  .map((p) => ({
    name: p.name, id: p.id,
    categories: p.categories ?? [],
    words:
      String(p.researchSummary ?? '').split(/\s+/).filter(Boolean).length +
      String(p.mechanismOfAction ?? '').split(/\s+/).filter(Boolean).length,
  }));

const payload = {
  generated: 'commit ' + (process.env.COMMIT ?? 'HEAD'),
  totals: {
    peptides: (PEPTIDES as any[]).length,
    doses: doses.length,
    cycles: cycles.length,
    provenance: provenance.length,
    uncited: uncited.length,
    cited: cited.size,
  },
  doses: doses.sort((a, b) => b.ratio - a.ratio),
  cycles,
  provenance,
  uncited: uncited.sort((a, b) => b.words - a.words),
};

writeFileSync('review-data.json', JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload.totals, null, 2));
