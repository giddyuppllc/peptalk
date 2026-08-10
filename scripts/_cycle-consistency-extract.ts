/**
 * Extraction half of the cycle-length check in verify:dosingconsistency.
 *
 * The dose range was only ONE field the table and the protocol both carry.
 * Cycle length is stored twice as well — `cycleLength` on the table, a
 * `durationWeeks` {min,max} on the protocol — and nothing has ever compared
 * them.
 */
import { PEPTIDES } from '../src/data/peptides';
import { getDosingTableEntry } from '../src/data/peptideDosingTable';
import { getProtocolsByPeptide } from '../src/data/protocols';

/**
 * Parse the table's free-text cycle column into weeks.
 *
 * Months use 4.345 weeks, not 4: "3-6 Months" is 13-26 weeks, and rounding it
 * to 12-24 manufactured a disagreement with a protocol that said 12-26.
 */
function weeksFrom(text: string | undefined): [number, number] | null {
  if (!text) return null;
  const range = text.match(/(\d+)\s*[-–]\s*(\d+)\s*week/i);
  if (range) return [Number(range[1]), Number(range[2])];
  const months = text.match(/(\d+)\s*[-–]\s*(\d+)\s*month/i);
  if (months)
    return [Math.round(Number(months[1]) * 4.345), Math.round(Number(months[2]) * 4.345)];
  const one = text.match(/(\d+)\s*week/i);
  if (one) return [Number(one[1]), Number(one[1])];
  return null; // "As Long As Needed", "-", etc. — not a range, not a conflict
}

const out: Array<{
  id: string; name: string; tableText: string; table: [number, number]; protocol: [number, number];
}> = [];

for (const p of PEPTIDES as any[]) {
  const entry = getDosingTableEntry(p.id);
  const proto = getProtocolsByPeptide(p.id)[0];
  if (!entry?.cycleLength || !proto?.durationWeeks) continue;
  const table = weeksFrom(entry.cycleLength);
  if (!table) continue;
  out.push({
    id: p.id,
    name: p.name,
    tableText: entry.cycleLength,
    table,
    protocol: [proto.durationWeeks.min, proto.durationWeeks.max],
  });
}

console.log(JSON.stringify(out));
