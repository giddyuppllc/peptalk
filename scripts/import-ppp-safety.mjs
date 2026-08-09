/**
 * Extract safety data from the Peptide Protocol Portal guides.
 *
 * Edward: "if the information exists in the peptide protocol portal we can use
 * it as our own data."
 *
 * It does, and it is good. Of the 70 guide HTML files, 69 carry safety content
 * under headings like "9. Contraindications", "10. Adverse Effects",
 * "8. Safety, Contraindications & Monitoring", with Absolute/Relative and
 * Subjective/Objective subheadings. It is his own doctor-reviewed clinical
 * material, which is the only reason this is transcription rather than the
 * invention this app cannot afford.
 *
 * MATCHING IS DELIBERATELY CONSERVATIVE
 * Attaching one peptide's contraindications to another is the worst outcome
 * available — worse than importing nothing, because the screen would state it
 * with the same confidence as a correct profile. Exact id, exact name and the
 * catalog's own aliases only, plus a short hand-checked map for spelling
 * variants. No fuzzy matching. Anything unmatched is reported, never guessed.
 *
 * Writes nothing. Prints a report so the extraction can be read before any of
 * it becomes data.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const GUIDES = 'C:/Users/keyse_pt9dxr4/Peptide Protocol Portal Website/public/guides-html';

/** Hand-checked against each guide's own title, not inferred from filenames. */
export const MANUAL_SLUG_MAP = {
  epithalon: 'epitalon',
  'thymosin-alpha-1': 'ta1',
  'kisspeptin-10': 'kisspeptin',
  'kpv-inj': 'kpv',
  'kpv-oral': 'kpv',
  'peg-mgf': 'mgf',
};

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/\uFFFD/g, '');

const textOf = (fragment) =>
  decode(fragment.replace(/<[^>]+>/g, '\n'))
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Split a guide into { title, lines } by heading.
 *
 * Built with a RegExp constructor rather than a literal because the pattern
 * needs a \1 backreference to pair <h2> with </h2>, and a previous edit through
 * a shell heredoc turned that backreference into a literal U+0001 byte. The
 * pattern then looked for a tag that never occurs, every guide parsed as zero
 * sections, and the script reported "no safety data in the source" — the exact
 * opposite of the truth. Third time this session an escaping layer has quietly
 * produced "no data"; hence the self-check at the bottom.
 */
function sectionsOf(html) {
  const re = new RegExp('<h([1-4])[^>]*>([\\s\\S]*?)</h\\1>', 'g');
  const heads = [];
  let m;
  while ((m = re.exec(html))) {
    heads.push({
      title: decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
      end: re.lastIndex,
    });
  }
  return heads.map((h, i) => {
    const nextStart = i + 1 < heads.length ? html.lastIndexOf('<h', heads[i + 1].end) : html.length;
    return { title: h.title, lines: textOf(html.slice(h.end, Math.max(h.end, nextStart))) };
  });
}

/** Deduped lines under every heading whose title matches. */
function collect(sections, pattern) {
  const seen = new Set();
  const out = [];
  for (const s of sections) {
    if (!pattern.test(s.title)) continue;
    // "Absolute Contraindications" / "Relative" are meaningful labels to keep.
    if (/^(absolute|relative|subjective|objective)/i.test(s.title) && s.lines.length) {
      out.push(s.title.replace(/:$/, ''));
    }
    for (const line of s.lines) {
      if (line.length < 2 || line.length > 300) continue;
      if (/^\d+(\.\d+)*\.?$/.test(line)) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  }
  return out;
}

export const guides = new Map();
for (const file of readdirSync(GUIDES).filter((f) => f.endsWith('.html'))) {
  const slug = file.replace(/\.html$/, '');
  const sections = sectionsOf(readFileSync(join(GUIDES, file), 'utf8'));
  const contraindications = collect(sections, /contraindic/i);
  const adverse = collect(sections, /adverse effect|side effect/i);
  const monitoring = collect(sections, /monitoring/i);
  const overview = collect(sections, /safety overview|safety profile/i);
  if (contraindications.length === 0 && adverse.length === 0) continue;
  guides.set(slug, {
    slug,
    summary: overview.join(' ').slice(0, 600),
    contraindications,
    adverse,
    monitoring,
  });
}

/**
 * Positive control. Three scripts this session failed by matching NOTHING and
 * presenting it as a finding — a nested-loop bug, a \b eaten by a heredoc, and
 * a Python \Z in a JS RegExp. Each printed confident, plausible output. An
 * extractor that silently yields zero is indistinguishable from "the source has
 * no data", and that is the wrong conclusion to hand to anyone.
 */
export const SELF_CHECK_OK = guides.size >= 50;
if (!SELF_CHECK_OK) {
  console.error(
    `SELF-CHECK FAILED: only ${guides.size} of 70 guides yielded safety content.\n` +
      '69 of them have a safety/contraindications heading, so this is an\n' +
      'extraction bug, not missing source data.',
  );
}

const bySlugNorm = new Map([...guides.keys()].map((s) => [norm(s), s]));

export function matchPeptide(p) {
  const manual = MANUAL_SLUG_MAP[p.id];
  if (manual && guides.has(manual)) return manual;
  for (const cand of [p.id, p.name, ...(p.aliases ?? [])]) {
    const hit = bySlugNorm.get(norm(cand));
    if (hit) return hit;
  }
  return null;
}
