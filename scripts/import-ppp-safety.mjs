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

/** Inline tags stripped to nothing, block boundaries to a space. */
const flatten = (s) =>
  decode(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Pull a fragment apart into whole statements.
 *
 * The guides are clean HTML — `<ul><li>…</li></ul>` for contraindication lists,
 * `<strong>Absolute Contraindications:</strong>` as the label above them. The
 * first version of this replaced EVERY tag with a newline, which shredded any
 * item containing inline emphasis:
 *
 *   <li>Personal or family history of <strong>medullary thyroid carcinoma</strong></li>
 *
 * became two bullets — "Personal or family history of" and "medullary thyroid
 * carcinoma (MTC)". On a safety screen the first of those is worse than no
 * bullet at all: it is a dangling clause presented as a contraindication.
 *
 * So list items and paragraphs are taken as ATOMIC units and their inner tags
 * flattened to spaces. Only genuine block boundaries produce a new line.
 */
const textOf = (fragment) => {
  const out = [];

  /**
   * Labels and list items IN DOCUMENT ORDER.
   *
   * Collecting all labels and then all items floated "Absolute
   * Contraindications" and "Relative Contraindications" to the top, detached
   * from the lists they head. On a safety screen that is a real loss —
   * "Pregnancy" reads very differently depending on which heading it sat
   * under, and an absolute contraindication shown as though it were relative
   * is exactly the kind of confident-but-wrong output this app keeps getting
   * caught by.
   *
   * `[^<]*` on the label capture, not `[\s\S]*?` — the list ITEMS carry their
   * own <strong> tags, so a permissive capture ran from a <strong> inside one
   * <li> to a </strong> before the NEXT <ul> and swallowed four
   * contraindications into one unreadable blob.
   */
  const ordered = new RegExp(
    '<strong[^>]*>([^<]*)</strong>\\s*(?=<ul|<ol)' + '|' + '<li[^>]*>([\\s\\S]*?)</li>',
    'gi',
  );
  for (const m of fragment.matchAll(ordered)) {
    const label = m[1] !== undefined ? flatten(m[1]).replace(/:$/, '') : null;
    const item = m[2] !== undefined ? flatten(m[2]) : null;
    const line = label || item;
    if (line) out.push(line);
  }

  // Paragraphs, only where there were no list items to take.
  if (out.length === 0) {
    for (const m of fragment.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
      const line = flatten(m[1]);
      if (line) out.push(line);
    }
  }

  // Nothing structured — fall back to whole-fragment text rather than dropping
  // content, but as ONE line so it cannot fragment.
  if (out.length === 0) {
    const line = flatten(fragment);
    if (line) out.push(line);
  }

  return out;
};

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
      level: Number(m[1]),
      title: decode(m[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(),
      end: re.lastIndex,
    });
  }
  return heads.map((h, i) => {
    const nextStart = i + 1 < heads.length ? html.lastIndexOf('<h', heads[i + 1].end) : html.length;
    return {
      level: h.level,
      title: h.title,
      lines: textOf(html.slice(h.end, Math.max(h.end, nextStart))),
    };
  });
}

/**
 * Deduped lines under every matching heading AND its child headings.
 *
 * The guides use two shapes for the same thing:
 *
 *   A  <h2>9. Contraindications & Precautions</h2>
 *      <div><strong>Absolute Contraindications:</strong><ul><li>…</li></ul></div>
 *
 *   B  <h2>9. Contraindications & Precautions</h2>
 *      <h3>Absolute</h3><ul><li>…</li></ul>
 *      <h3>Relative</h3><ul><li>…</li></ul>
 *
 * Taking only the matching section handles A and yields NOTHING for B, because
 * a section's body stops at the next heading and B's items all live under
 * <h3>s whose titles ("Absolute", "Relative") do not contain "contraindic".
 * That is why 25 guides looked empty while their source plainly had the data —
 * an extractor reporting "no contraindications" for IGF-1 LR3 is worse than
 * one that fails loudly.
 *
 * So a match absorbs every following section at a DEEPER level, stopping at the
 * next heading of the same or shallower level. The child's title comes through
 * as a label, which is what keeps "Absolute" attached to its items.
 */
/**
 * Boilerplate that must never become PepTalk data.
 *
 * Absorbing child sections picks up whatever trails the safety block, and in
 * these guides that is a long legal disclaimer. Two separate problems:
 *
 *  1. "Use at your own risk", "no representations or warranties", "does not
 *     constitute labeling under FDA definitions" are not monitoring
 *     parameters. Rendering them under "Monitoring Required" on a peptide
 *     screen is noise at best and misleading at worst.
 *  2. The disclaimer names the Peptide Protocol Portal. PepTalk and PPP are
 *     separate products, and shipping one's brand inside the other's data is a
 *     leak — the same class of mistake as the supplier note removed earlier.
 *
 * Filtered at extraction rather than at render, so it never reaches a file.
 */
const BOILERPLATE =
  /disclaimer|liabilit|no representations|warrant(y|ies)|at your own risk|FDA definitions|Peptide Protocol Portal|educational purposes only|informational purposes|not medical advice|consult all relevant laws|shall not be held|by using this document|regulatory compliance/i;

function collect(sections, pattern) {
  const seen = new Set();
  const out = [];

  const take = (s, useTitleAsLabel) => {
    // A boilerplate HEADING ends the useful part of the section — everything
    // under it is legal text, not clinical content.
    if (BOILERPLATE.test(s.title)) return;
    if (useTitleAsLabel && s.lines.length && s.title) {
      const label = s.title.replace(/:$/, '').trim();
      if (label && !seen.has(label.toLowerCase())) {
        seen.add(label.toLowerCase());
        out.push(label);
      }
    }
    for (const line of s.lines) {
      if (line.length < 2 || line.length > 300) continue;
      if (/^\d+(\.\d+)*\.?$/.test(line)) continue;
      if (BOILERPLATE.test(line)) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
  };

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!pattern.test(s.title)) continue;
    take(s, /^(absolute|relative|subjective|objective)/i.test(s.title));
    for (let j = i + 1; j < sections.length && sections[j].level > s.level; j++) {
      take(sections[j], true);
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
