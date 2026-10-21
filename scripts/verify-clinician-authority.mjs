/**
 * verify:clinicianauthority — the approving clinician's ruling is what every
 * Aimee surface says, and it stays that way.
 *
 * WHY THIS EXISTS
 * Aimee answered "what's the dose" from three private copies of the data:
 *
 *   1. supabase/functions/aimee-chat/_knowledge.json — generated from
 *      protocols.ts, the least attributable store in the repo (its `source`
 *      field is one of two placeholder strings; zero PMIDs, zero DOIs).
 *   2. supabase/functions/aimee-chat-stream/_prompt.ts — a hand-typed string
 *      literal, PEPTALK_DOSING_REFERENCE_BLOCK, maintained by editing prose.
 *   3. src/services/llmService.ts buildPeptideKnowledgeBase() — the on-device
 *      copy, which read protocols.ts again at runtime.
 *
 * None of the three consulted src/data/canonicalDosing.ts, the module written
 * to rank Jamie Esposito's rulings above every stored figure. So the ruling
 * reached the safety guard and nothing a user could read. The numbers happened
 * to agree when this was written — they were reconciled by hand in 6ca9f1f —
 * and hand-reconciled copies drift the moment someone edits one of them.
 *
 * This check is FATAL by design. A warning here would be a warning about doses.
 *
 * Self-test: `node scripts/verify-clinician-authority.mjs --mutate` corrupts
 * each input in turn in memory and asserts this script catches it. A check that
 * passes without reading anything is worse than no check.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const MUTATE = process.argv.includes('--mutate');
const ROOT = process.cwd();
const KNOWLEDGE = path.join(ROOT, 'supabase/functions/aimee-chat/_knowledge.json');
const PROMPT = path.join(ROOT, 'supabase/functions/aimee-chat-stream/_prompt.ts');
const LLM_SERVICE = path.join(ROOT, 'src/services/llmService.ts');

/** Pull the rulings out of TypeScript by running them, not by parsing them. */
function loadRulings() {
  const raw = execSync(
    'npx tsx -e "' +
      "import {CLINICIAN_RULINGS, rulingDoseMcg} from './src/data/clinicianRulings';" +
      "import {isSafetyOnly} from './src/data/safetyOnlyCompounds';" +
      "import {expandClinicianText} from './src/data/clinicianRulingsDisplay';" +
      'const out=CLINICIAN_RULINGS.filter(r=>r.dose).map(r=>({' +
      'id:r.peptideId,verbatim:r.dose.verbatim,safetyOnly:isSafetyOnly(r.peptideId),' +
      'approved:expandClinicianText(r.dose.verbatim,r.peptideId),' +
      '...rulingDoseMcg(r.dose)}));' +
      'console.log(JSON.stringify(out));"',
    { encoding: 'utf8', maxBuffer: 1e8, cwd: ROOT },
  );
  return JSON.parse(raw.slice(raw.indexOf('[')));
}

const failures = [];
const fail = (msg) => failures.push(msg);

// ── 1. the generated file is not stale ────────────────────────────────────
// Someone edits protocols.ts, ships, and Aimee keeps quoting the old number
// until the next person remembers to re-run the generator. Regenerate into a
// temp path and compare everything except the timestamp.
function checkGeneratedFileIsCurrent(committedText) {
  const backup = fs.readFileSync(KNOWLEDGE, 'utf8');
  try {
    execSync('npx tsx scripts/gen-aimee-knowledge.ts', { cwd: ROOT, stdio: 'pipe' });
    const fresh = JSON.parse(fs.readFileSync(KNOWLEDGE, 'utf8'));
    const committed = JSON.parse(committedText);
    delete fresh.generatedAt;
    delete committed.generatedAt;
    if (JSON.stringify(fresh) !== JSON.stringify(committed)) {
      fail(
        '_knowledge.json is stale — it does not match what gen-aimee-knowledge.ts\n' +
          '       produces from the current data files. Run: npx tsx scripts/gen-aimee-knowledge.ts',
      );
    }
  } finally {
    fs.writeFileSync(KNOWLEDGE, backup);
  }
}

// ── 2. every ruling reaches the knowledge file ────────────────────────────
function checkKnowledge(rulings, knowledgeText) {
  const k = JSON.parse(knowledgeText);
  // A compound legitimately carries SEVERAL protocol rows — BPC-157 has a
  // standard, an acute-injury and an evening protocol, each with its own point
  // dose inside the clinician's window. So every row is checked, and the test
  // is containment, not equality: a specific protocol may sit anywhere inside
  // her range but may not step outside it.
  const rows = new Map();
  for (const p of k.protocols ?? []) {
    if (!rows.has(p.peptideId)) rows.set(p.peptideId, []);
    rows.get(p.peptideId).push(p);
  }
  const ruledOnly = new Map((k.clinicianRulings ?? []).map((r) => [r.peptideId, r]));

  for (const r of rulings) {
    if (r.safetyOnly) {
      // Withdrawn compounds must carry no figure, ruling or not.
      for (const row of rows.get(r.id) ?? []) {
        if (row.dose) fail(`${r.id}: safety-information-only but _knowledge.json carries a dose "${row.dose}"`);
      }
      if (ruledOnly.has(r.id)) fail(`${r.id}: safety-information-only but present in clinicianRulings with a dose`);
      continue;
    }
    const mine = rows.get(r.id) ?? [];
    if (mine.length) {
      for (const row of mine) {
        if (row.doseApproved !== r.approved) {
          fail(
            `${r.id} ("${row.name}"): _knowledge.json doseApproved is ${JSON.stringify(row.doseApproved ?? null)}, ` +
              `the clinician ruled ${JSON.stringify(r.verbatim)}`,
          );
        }
        const parsed = parseRange(row.dose);
        if (parsed && (parsed.min < r.minMcg || parsed.max > r.maxMcg)) {
          fail(
            `${r.id} ("${row.name}"): protocol range ${row.dose} (${parsed.min}-${parsed.max} mcg) ` +
              `falls outside the clinician's ${r.minMcg}-${r.maxMcg} mcg ("${r.verbatim}")`,
          );
        }
      }
      continue;
    }
    if (!ruledOnly.has(r.id)) {
      fail(`${r.id}: clinician ruled "${r.verbatim}" and Aimee has no entry for it at all`);
    } else if (ruledOnly.get(r.id).dose !== r.approved) {
      fail(`${r.id}: clinicianRulings entry says "${ruledOnly.get(r.id).dose}", the ruling is "${r.verbatim}"`);
    }
  }
}

/** "200-500 mcg" / "1-2 mg" → mcg. Returns null when it is not a plain range. */
function parseRange(s) {
  if (!s) return null;
  const m = String(s).toLowerCase().match(/([\d.]+)\s*(mcg|mg|iu)?\s*[-–—]\s*([\d.]+)\s*(mcg|mg|iu)?/);
  if (!m) return null;
  const unit = m[4] || m[2] || 'mcg';
  if (unit === 'iu') return null;
  const f = unit === 'mg' ? 1000 : 1;
  return { min: parseFloat(m[1]) * f, max: parseFloat(m[3]) * f };
}

// ── 3. the hand-typed prompt block does not contradict a ruling ───────────
// This block is prose and carries reconstitution detail the structured stores
// do not, so it is not generated. It still has to agree. Every dose figure on
// a line whose compound the clinician ruled on must fall inside her range.
function checkPromptBlock(rulings, promptText) {
  const block = promptText.match(/PEPTALK_DOSING_REFERENCE_BLOCK\s*=\s*`([\s\S]*?)`;/);
  if (!block) {
    fail('PEPTALK_DOSING_REFERENCE_BLOCK not found in _prompt.ts — this check has stopped checking');
    return;
  }
  // The block names compounds in prose. Match on the ruling's own words: if
  // her verbatim range appears nowhere, that is not proof of a contradiction,
  // so only an out-of-range figure on a line that clearly names the compound
  // is reported.
  const lines = block[1].split('\n').filter((l) => /[\d.]+\s*(mcg|mg)/i.test(l));
  const alias = {
    'bpc-157': /^bpc-?157\b/i,
    'tb-500': /^tb-?500\b/i,
    'thymosin-alpha-1': /^thymosin-?α-?1\b/i,
    epithalon: /^epitalon\b/i,
    'kpv-inj': /^kpv\b/i,
    'cjc-1295-dac': /^cjc-1295 w\/ dac\b/i,
    'nad-plus': /^nad\+/i,
    retatrutide: /^retatrutide\b/i,
    tirzepatide: /^tirzepatide\b/i,
    semaglutide: /^semaglutide\b/i,
  };
  for (const r of rulings) {
    const re = alias[r.id];
    if (!re) continue;
    const line = lines.find((l) => re.test(l.trim()));
    if (!line) continue;
    if (r.safetyOnly) {
      fail(`${r.id}: safety-information-only, but the hardcoded prompt block still states figures for it`);
      continue;
    }
    // Every mass figure on the line, in mcg. A reconstitution line legitimately
    // names vial sizes and diluent volumes, so only figures that look like a
    // DOSE — i.e. appear after the vial/diluent preamble — are checked. The
    // preamble is everything up to the first full stop.
    const doseHalf = line.slice(line.indexOf('.') + 1);
    const figures = [...doseHalf.matchAll(/([\d.]+)\s*(mcg|mg)\b/gi)].map(([, v, u]) =>
      u.toLowerCase() === 'mg' ? parseFloat(v) * 1000 : parseFloat(v),
    );
    const outside = figures.filter((f) => f < r.minMcg || f > r.maxMcg);
    if (figures.length && outside.length === figures.length) {
      fail(
        `${r.id}: every dose figure in the hardcoded prompt block (${outside.join(', ')} mcg) ` +
          `falls outside the clinician's range ${r.minMcg}-${r.maxMcg} mcg ("${r.verbatim}")`,
      );
    }
  }
}

// ── 4. the device copy still consults the rulings ─────────────────────────
// A source scan, not a behaviour test: the point is that a future edit cannot
// quietly go back to reading protocols.ts alone. If the require or the call
// disappears, this fails and whoever removed it has to say why.
function checkDeviceCopy(text) {
  if (!/require\(['"]\.\.\/data\/clinicianRulings['"]\)/.test(text)) {
    fail('llmService.ts no longer requires clinicianRulings — the device copy has gone back to protocols.ts alone');
  }
  if (!/getClinicianRuling\(\s*t\.peptideId\s*\)/.test(text)) {
    fail('llmService.ts builds its protocol lines without calling getClinicianRuling(t.peptideId)');
  }
  if (!/ruling\?\.dose\?\.verbatim/.test(text)) {
    fail("llmService.ts does not use the ruling's verbatim dose when one exists");
  }
}

// ── run ───────────────────────────────────────────────────────────────────
const rulings = loadRulings();
const knowledgeText = fs.readFileSync(KNOWLEDGE, 'utf8');
const promptText = fs.readFileSync(PROMPT, 'utf8');
const llmText = fs.readFileSync(LLM_SERVICE, 'utf8');

if (MUTATE) {
  // Each mutation must produce at least one failure. If one does not, the
  // corresponding check is decorative and the suite says so.
  const cases = [
    ['knowledge: doseApproved wrong', () => {
      const k = JSON.parse(knowledgeText);
      const row = k.protocols.find((p) => p.doseApproved);
      row.doseApproved = '999 mg – 1000 mg';
      return { knowledge: JSON.stringify(k) };
    }],
    ['knowledge: ruled compound deleted', () => {
      const k = JSON.parse(knowledgeText);
      const i = k.protocols.findIndex((p) => p.doseApproved);
      k.protocols.splice(i, 1);
      k.clinicianRulings = [];
      return { knowledge: JSON.stringify(k) };
    }],
    ['knowledge: protocols range contradicts ruling', () => {
      const k = JSON.parse(knowledgeText);
      const row = k.protocols.find((p) => p.doseApproved && parseRange(p.dose));
      row.dose = '9000-9001 mcg';
      return { knowledge: JSON.stringify(k) };
    }],
    ['prompt: block removed', () => ({ prompt: promptText.replace('PEPTALK_DOSING_REFERENCE_BLOCK', 'RENAMED_BLOCK') })],
    ['prompt: BPC-157 line moved out of range', () => ({
      prompt: promptText.replace(
        /^BPC-157 — .*$/m,
        'BPC-157 — 10 mg vial + 3 ml bac water (3.33 mg/ml). Daily: 50 mcg (2 units).',
      ),
    })],
    ['device: clinicianRulings require removed', () => ({ llm: llmText.replace("require('../data/clinicianRulings')", "require('../data/protocols')") })],
    ['device: verbatim dose no longer used', () => ({ llm: llmText.replace(/ruling\?\.dose\?\.verbatim/g, 'false') })],
  ];

  let undetected = 0;
  for (const [name, mutate] of cases) {
    const m = mutate();
    failures.length = 0;
    checkKnowledge(rulings, m.knowledge ?? knowledgeText);
    checkPromptBlock(rulings, m.prompt ?? promptText);
    checkDeviceCopy(m.llm ?? llmText);
    const caught = failures.length > 0;
    console.log(`  ${caught ? '✓ caught' : '✗ MISSED'}  ${name}`);
    if (!caught) undetected++;
  }
  console.log(
    undetected === 0
      ? `\n✓ mutation self-test: ${cases.length}/${cases.length} detected`
      : `\n✗ mutation self-test: ${undetected} mutation(s) went undetected — those checks do not check`,
  );
  process.exit(undetected === 0 ? 0 : 1);
}

checkGeneratedFileIsCurrent(knowledgeText);
checkKnowledge(rulings, knowledgeText);
checkPromptBlock(rulings, promptText);
checkDeviceCopy(llmText);

console.log('— Clinician authority: every Aimee surface quotes the ruling —');
console.log(`  rulings with a dose : ${rulings.length}`);
console.log(`  surfaces checked    : _knowledge.json, _prompt.ts, llmService.ts`);
if (failures.length) {
  console.error(`\n  ✗ ${failures.length} problem(s):\n`);
  for (const f of failures) console.error(`   - ${f}`);
  console.error('\n  The approving clinician has ruled on these compounds. A surface that');
  console.error('  disagrees is showing a dose she did not approve.\n');
  process.exit(1);
}
console.log('  ✓ no surface contradicts a clinician ruling');
