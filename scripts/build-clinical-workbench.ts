/**
 * build:workbench — the clinical review page, rebuilt as a working tool.
 *
 * Edward: "the whole page we made sucks tho no way to update information and
 * no way to actually see whats said about stuff and no way to edit the info"
 *
 * Fair, and the diagnosis was right. The first page only proved that sources
 * disagree and then asked for a winner while showing two bars on a log axis.
 * It never printed what a source actually SAYS, so the pick was blind, and it
 * had nowhere to put the correct answer once you knew it.
 *
 * This emits one card per peptide with an open question, carrying every field
 * each source holds — dose, cycle, frequency, route, time off, titration note,
 * reconstitution note, and the full research/mechanism prose — plus inputs to
 * correct any of it. Answers autosave to Supabase via the clinical-review
 * function.
 *
 * It is a GENERATOR: a figure fixed in src/data changes this page. Nothing here
 * is hand-transcribed, because hand-transcribing these numbers is how the two
 * sources came to disagree in the first place.
 *
 * Run: npx tsx scripts/build-clinical-workbench.ts
 * Out: tools/clinical-review/index.html  (deployed to its OWN Vercel project,
 *      never to public/ — this content must not sit on the app domain.)
 */
import { writeFileSync, mkdirSync } from 'fs';
import { PEPTIDES } from '../src/data/peptides';
import { getDosingTableEntry } from '../src/data/peptideDosingTable';
import { getProtocolsByPeptide } from '../src/data/protocols';
import { PEPTIDE_DOSING_REFERENCE } from '../src/data/peptideDosingReference';
import { getSourcesByPeptide } from '../src/data/sources';

const ENDPOINT = 'https://zniucpbeepxysvkshpir.supabase.co/functions/v1/clinical-review';

/* ── shared numeric helpers ──────────────────────────────────────────────── */

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

/* Trailing zeros may only be trimmed after a decimal point. The old page used
   `.replace(/\.?0+$/,'')` on integers too, so 200000 mcg printed as "2 mg" and
   NAD+'s 50-200 mg protocol became "5 mg-2 mg" — a range whose top was below
   its bottom. That single regex is why the comparison could not be read. */
const mcg = (n: number): string => {
  if (!Number.isFinite(n)) return '—';
  if (n < 1000) return `${Math.round(n)} mcg`;
  const mg = n / 1000;
  if (Number.isInteger(mg)) return `${mg} mg`;
  return `${mg.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} mg`;
};
const range = (r: [number, number] | null): string =>
  !r ? '—' : r[0] === r[1] ? mcg(r[0]) : `${mcg(r[0])} – ${mcg(r[1])}`;

const ladderOf = (id: string): { range: [number, number]; steps: number } | null => {
  const e: any = (PEPTIDE_DOSING_REFERENCE as any[]).find((r) => r.peptideId === id);
  const d = (e?.schedule ?? []).map((s: any) => s.doseMcg).filter((n: any) => Number.isFinite(n) && n > 0);
  return d.length ? { range: [Math.min(...d), Math.max(...d)], steps: d.length } : null;
};

/* ── assemble one card per peptide with an open question ─────────────────── */

type Issue = { kind: 'dose' | 'cycle' | 'prov' | 'uncited'; label: string; severity: 'sev' | 'wrn' | 'neu' };

const cards: any[] = [];

for (const p of PEPTIDES as any[]) {
  const entry: any = getDosingTableEntry(p.id);
  const proto: any = getProtocolsByPeptide(p.id)[0];
  const ladder = ladderOf(p.id);
  const citations = getSourcesByPeptide(p.id) ?? [];
  const issues: Issue[] = [];

  const tableDose = toMcg(entry?.dosingRange);
  const pd = proto?.typicalDose;
  const mult = pd ? (pd.unit === 'mg' ? 1000 : pd.unit === 'mcg' ? 1 : 0) : 0;
  const protoDose: [number, number] | null = pd && mult ? [pd.min * mult, pd.max * mult] : null;

  // 1. dose ranges disagree
  let ratio = 0;
  if (tableDose && protoDose) {
    const off = (a: number, b: number) => (Math.max(a, b) > 0 ? (Math.abs(a - b) / Math.max(a, b)) * 100 : 0);
    if (Math.max(off(tableDose[0], protoDose[0]), off(tableDose[1], protoDose[1])) > 2) {
      ratio = Number(Math.max(tableDose[1] / protoDose[1], protoDose[1] / tableDose[1]).toFixed(1));
      issues.push({
        kind: 'dose',
        label: `Dose ranges differ ${ratio}×`,
        severity: ratio >= 5 ? 'sev' : ratio >= 2 ? 'wrn' : 'neu',
      });
    }
  }

  // 2. cycle lengths disagree
  const tableWeeks = weeksFrom(entry?.cycleLength);
  const protoWeeks: [number, number] | null = proto?.durationWeeks
    ? [proto.durationWeeks.min, proto.durationWeeks.max]
    : null;
  if (tableWeeks && protoWeeks && (Math.abs(tableWeeks[0] - protoWeeks[0]) > 1 || Math.abs(tableWeeks[1] - protoWeeks[1]) > 1)) {
    const overlap = Math.min(tableWeeks[1], protoWeeks[1]) - Math.max(tableWeeks[0], protoWeeks[0]);
    issues.push({
      kind: 'cycle',
      label: overlap <= 0 ? 'Cycle lengths do not overlap at all' : `Cycle lengths differ (overlap ${overlap} wk)`,
      severity: overlap <= 0 ? 'sev' : 'wrn',
    });
  }

  // 3. a source excludes the dose Edward actually reconstitutes
  if (ladder && tableDose && protoDose) {
    const inside = (r: [number, number]) => ladder.range[0] >= r[0] * 0.98 && ladder.range[1] <= r[1] * 1.02;
    const inT = inside(tableDose), inP = inside(protoDose);
    if (!(inT && inP))
      issues.push({
        kind: 'prov',
        label: !inT && !inP ? 'Worked dose falls outside BOTH ranges' : inT ? 'Only the table contains the worked dose' : 'Only the protocol contains the worked dose',
        severity: !inT && !inP ? 'sev' : 'wrn',
      });
  }

  // 4. clinical prose with nothing behind it
  const words =
    String(p.researchSummary ?? '').split(/\s+/).filter(Boolean).length +
    String(p.mechanismOfAction ?? '').split(/\s+/).filter(Boolean).length;
  if (words > 0 && citations.length === 0)
    issues.push({ kind: 'uncited', label: `${words} words asserted with no citation`, severity: 'neu' });

  if (!issues.length) continue;

  cards.push({
    id: p.id,
    name: p.name,
    categories: p.categories ?? [],
    issues,
    ratio,
    // what each source literally holds, printed rather than plotted
    sources: {
      table: entry
        ? {
            dose: entry.dosingRange ?? null,
            doseNorm: range(tableDose),
            cycle: entry.cycleLength ?? null,
            // the table splits frequency across two columns
            frequency: [entry.frequencyDaily, entry.frequencyWeekly].filter(Boolean).join(' · ') || null,
            timeOff: entry.timeOffBetweenCycles ?? null,
            fasted: entry.fasted ?? null,
            titrationNote: entry.titrationNote ?? null,
          }
        : null,
      protocol: proto
        ? {
            name: proto.name ?? null,
            dose: pd ? `${pd.min}–${pd.max} ${pd.unit}` : null,
            doseNorm: range(protoDose),
            perKg: proto.dosePerKg ? `${proto.dosePerKg.min}–${proto.dosePerKg.max} ${proto.dosePerKg.unit}/kg` : null,
            cycle: protoWeeks ? `${protoWeeks[0]}–${protoWeeks[1]} weeks` : null,
            frequency: proto.frequencyLabel ?? proto.frequency ?? null,
            route: proto.route ?? null,
            timing: proto.timing ?? null,
            reconstitution: proto.reconstitutionNotes ?? null,
            importantNotes: proto.importantNotes ?? [],
            contraindications: proto.contraindications ?? [],
            attribution: proto.source ?? null,
          }
        : null,
      ladder: ladder
        ? { dose: range(ladder.range), doseNorm: range(ladder.range), steps: ladder.steps }
        : null,
    },
    claims: {
      researchSummary: p.researchSummary ?? '',
      mechanismOfAction: p.mechanismOfAction ?? '',
      citations: citations.map((c: any) => ({ text: c.text ?? String(c), url: c.url ?? null })),
    },
  });
}

// worst first: severe issues, then by how far apart the doses are
const rank = (c: any) => (c.issues.some((i: Issue) => i.severity === 'sev') ? 0 : c.issues.some((i: Issue) => i.severity === 'wrn') ? 1 : 2);
cards.sort((a, b) => rank(a) - rank(b) || b.ratio - a.ratio || a.name.localeCompare(b.name));

const totals = {
  peptides: (PEPTIDES as any[]).length,
  cards: cards.length,
  dose: cards.filter((c) => c.issues.some((i: Issue) => i.kind === 'dose')).length,
  cycle: cards.filter((c) => c.issues.some((i: Issue) => i.kind === 'cycle')).length,
  prov: cards.filter((c) => c.issues.some((i: Issue) => i.kind === 'prov')).length,
  uncited: cards.filter((c) => c.issues.some((i: Issue) => i.kind === 'uncited')).length,
};

mkdirSync('tools/clinical-review', { recursive: true });
writeFileSync(
  'tools/clinical-review/data.js',
  `window.WORKBENCH = ${JSON.stringify({ generated: process.env.COMMIT ?? 'HEAD', endpoint: ENDPOINT, totals, cards })};\n`,
);
console.log(JSON.stringify(totals, null, 2));
