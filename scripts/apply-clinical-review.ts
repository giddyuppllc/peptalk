/**
 * apply:review — turn Jamie's clinical-review answers into a change plan for
 * the dosing data, and (with --apply) write it.
 *
 * WHY THIS EXISTS
 * The review loop was only half built. export-clinical-review.ts generates the
 * questions FROM the code, Jamie answers them in the Vercel workbench, and the
 * answers land in `clinical_review_decisions` on Supabase — where nothing ever
 * read them again. 53 decisions and 35 corrected dose/cycle ranges sat in a
 * table while the app kept serving the numbers she had corrected.
 *
 * WHAT HER ANSWERS MEAN
 *   dose:<id>  / cycle:<id>   which source she judged correct —
 *                             'table' | 'protocol' | 'ladder' | 'other'
 *   edits[<id>].correctedDose  a range she typed herself; this always wins,
 *                              whatever the decision says
 *   inter:<a+b> = 'reviewed'   an interaction pair she has read
 *
 * WHERE IT WRITES
 * protocols.ts is the one that reaches a user: 57 importers, it backs the
 * peptide detail screen and doseSafety. peptideDosingTable.ts has 5 and backs
 * one card. A correction that only lands in the table changes almost nothing,
 * so protocol is the target and the table is reported as a follow-up.
 *
 * This prints a plan by default and writes nothing. --apply writes.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PEPTIDES } from '../src/data/peptides';
import { getDosingTableEntry } from '../src/data/peptideDosingTable';
import { getProtocolsByPeptide } from '../src/data/protocols';

const APPLY = process.argv.includes('--apply');
const REVIEW_JSON = process.argv.find(a => a.endsWith('.json')) ?? 'C:/tmp/jamie.json';

interface Range { min: number; max: number; unit: string }

/** "500 mcg – 2 mg" / "1 mg – 12 mg" / "250 mcg – 12mg" -> a normalised range. */
function parseDose(text: string): Range | null {
  const cleaned = text.replace(/\u2013|\u2014/g, '-');
  const parts = cleaned.split('-');
  if (parts.length !== 2) return null;

  const side = (s: string): { v: number; u: string } | null => {
    const m = s.trim().match(/^([\d.]+)\s*(mcg|ug|µg|mg|g|iu)?$/i);
    if (!m) return null;
    return { v: Number(m[1]), u: (m[2] ?? '').toLowerCase() };
  };
  const lo = side(parts[0]);
  const hi = side(parts[1]);
  if (!lo || !hi || !Number.isFinite(lo.v) || !Number.isFinite(hi.v)) return null;

  // "250 mcg – 12mg": the left side may omit its unit, or the two may differ.
  // Convert both to mcg, then present in the larger side's unit.
  const unit = hi.u || lo.u;
  if (!unit) return null;
  const toMcg = (v: number, u: string) =>
    u === 'mg' ? v * 1000 : u === 'g' ? v * 1e6 : v;
  const loMcg = toMcg(lo.v, lo.u || unit);
  const hiMcg = toMcg(hi.v, hi.u || unit);
  if (unit === 'iu') return { min: lo.v, max: hi.v, unit: 'iu' };
  // keep the unit the protocol already uses where possible
  return { min: loMcg, max: hiMcg, unit: 'mcg' };
}

function fmt(r: Range | null): string {
  if (!r) return '—';
  return `${r.min}-${r.max} ${r.unit}`;
}

/** Protocol doses are stored in their own unit; normalise for comparison. */
function protoToMcg(d: { min: number; max: number; unit: string } | undefined): Range | null {
  if (!d) return null;
  const f = d.unit === 'mg' ? 1000 : d.unit === 'g' ? 1e6 : 1;
  if (d.unit === 'iu') return { min: d.min, max: d.max, unit: 'iu' };
  return { min: d.min * f, max: d.max * f, unit: 'mcg' };
}

const review = JSON.parse(readFileSync(REVIEW_JSON, 'utf8'));
const decisions: Record<string, string> = review.decisions ?? {};
const edits: Record<string, any> = review.edits ?? {};

const rows: {
  id: string;
  name: string;
  decision: string | null;
  current: Range | null;
  corrected: Range | null;
  status: 'matches' | 'CHANGE' | 'unparsed' | 'no-protocol' | 'no-correction';
  raw: string;
}[] = [];

for (const [id, edit] of Object.entries(edits)) {
  if (id === '__probe__') continue;
  const raw = edit?.correctedDose;
  const peptide = PEPTIDES.find((p: any) => p.id === id);
  const proto = getProtocolsByPeptide(id)[0];
  const decision = decisions[`dose:${id}`] ?? null;

  if (!raw) {
    rows.push({ id, name: peptide?.name ?? id, decision, current: protoToMcg(proto?.typicalDose),
      corrected: null, status: 'no-correction', raw: '' });
    continue;
  }
  const corrected = parseDose(String(raw));
  const current = protoToMcg(proto?.typicalDose);

  let status: (typeof rows)[number]['status'];
  if (!proto) status = 'no-protocol';
  else if (!corrected) status = 'unparsed';
  else if (current && current.min === corrected.min && current.max === corrected.max) status = 'matches';
  else status = 'CHANGE';

  rows.push({ id, name: peptide?.name ?? id, decision, current, corrected, status, raw: String(raw) });
}

const by = (s: string) => rows.filter(r => r.status === s);

console.log('\n━━━ Jamie\'s clinical review vs protocols.ts ━━━\n');
console.log(`  decisions on file : ${Object.keys(decisions).length}`);
console.log(`  corrections       : ${rows.length}`);
console.log(`  already correct   : ${by('matches').length}`);
console.log(`  WOULD CHANGE      : ${by('CHANGE').length}`);
console.log(`  no protocol row   : ${by('no-protocol').length}`);
console.log(`  could not parse   : ${by('unparsed').length}`);
console.log(`  cycle-only        : ${by('no-correction').length}\n`);

if (by('CHANGE').length) {
  console.log('  ── doses that differ ──');
  for (const r of by('CHANGE')) {
    console.log(`   ${r.id.padEnd(20)} ${fmt(r.current).padEnd(22)} -> ${fmt(r.corrected).padEnd(22)} (she wrote "${r.raw}")`);
  }
  console.log('');
}
for (const kind of ['no-protocol', 'unparsed'] as const) {
  if (!by(kind).length) continue;
  console.log(`  ── ${kind} ──`);
  by(kind).forEach(r => console.log(`   ${r.id.padEnd(20)} "${r.raw}"`));
  console.log('');
}

if (!APPLY) {
  console.log('  Plan only — nothing written. Re-run with --apply to write.\n');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Write. Each protocol's typicalDose is rewritten in place, matched on the
// peptideId that owns it, so unrelated protocols with similar numbers are not
// touched.
// ---------------------------------------------------------------------------
const FILE = 'src/data/protocols.ts';
let src = readFileSync(FILE, 'utf8');
let written = 0;

for (const r of by('CHANGE')) {
  if (!r.corrected) continue;
  const proto = getProtocolsByPeptide(r.id)[0];
  if (!proto) continue;

  // find this protocol's block by its id, then its typicalDose line
  const idIdx = src.indexOf(`id: '${proto.id}'`);
  if (idIdx === -1) { console.log(`   ! could not locate ${proto.id}`); continue; }
  const doseIdx = src.indexOf('typicalDose:', idIdx);
  if (doseIdx === -1) { console.log(`   ! no typicalDose for ${proto.id}`); continue; }
  const lineEnd = src.indexOf('\n', doseIdx);
  const line = src.slice(doseIdx, lineEnd);

  // keep the unit the file already uses so the rendered string stays familiar
  const unitMatch = line.match(/unit: '([a-z]+)'/i);
  const unit = unitMatch ? unitMatch[1] : 'mcg';
  const div = unit === 'mg' ? 1000 : unit === 'g' ? 1e6 : 1;
  const min = r.corrected.unit === 'iu' ? r.corrected.min : r.corrected.min / div;
  const max = r.corrected.unit === 'iu' ? r.corrected.max : r.corrected.max / div;
  const replacement = `typicalDose: { min: ${min}, max: ${max}, unit: '${unit}' },`;

  src = src.slice(0, doseIdx) + replacement + src.slice(lineEnd);
  written++;
  console.log(`   wrote ${r.id.padEnd(20)} -> ${replacement}`);
}

writeFileSync(FILE, src);
console.log(`\n  ${written} protocol dose(s) updated in ${FILE}\n`);
