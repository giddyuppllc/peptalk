// Generate compact JSON knowledge base from src/data/{peptides,protocols}.ts
// for the Aimee edge function to bake into its system prompt.
//
// Output: supabase/functions/aimee-chat/_knowledge.json
//
// Re-run whenever protocols.ts or peptides.ts change:
//   npx tsx scripts/gen-aimee-knowledge.ts

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PEPTIDES } from "../src/data/peptides";
import { PROTOCOL_TEMPLATES } from "../src/data/protocols";
import { isSafetyOnly } from "../src/data/safetyOnlyCompounds";
import { redactDoseBearingNotes } from "../src/data/dosingDisplay";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

// Only include peptides with a protocol template — the others aren't
// actionable for "what's the dose / cycle" questions, and including all 55
// triples the prompt size for marginal value. Aimee can still discuss
// peptides she doesn't have curated data on; she'll just lean on
// general training knowledge with the safety preamble in effect.
const peptideIdsWithProtocol = new Set(PROTOCOL_TEMPLATES.map((p) => p.peptideId));
const peptideRows = PEPTIDES
  .filter((p) => peptideIdsWithProtocol.has(p.id))
  .map((p) => ({
    id: p.id,
    name: p.name,
    category: p.categories?.[0],
    halfLife: p.halfLife,
    storage: p.storageTemp,
    use: p.uses?.primaryUses?.slice(0, 2).join(", "),
  }));

// Truncate long strings to keep token cost low. We're packing 20 protocols
// into the system prompt every call; each kb costs.
const trim = (s: string | undefined, n = 140) =>
  s && s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;

// Safety-information-only compounds (Edward, 2026-09-16) keep their ROW —
// name, storage, contraindications, and every note that carries no figure —
// and lose `dose`, `freq`, `cycle`, `timing` and `titration`. The row has to
// stay for two reasons: the staleness guard in clinicianRulings.test.ts holds
// this file's protocol count to PROTOCOL_TEMPLATES, and deleting the row would
// leave Aimee answering about the compound from general training knowledge
// instead of from a curated entry that tells her to state no dose.
//
// `notes` is filtered rather than dropped: hCG's first two notes are
// "LH-mimetic — preserves testicular function" (safety, kept) and "Common
// TRT-adjunct dose: 250-500 IU 2-3× per week" (a dose, dropped). The slice to
// two happens AFTER the filter so a dropped note does not cost a kept one.
const protocolRows = PROTOCOL_TEMPLATES.map((pt) => {
  const notes = redactDoseBearingNotes(pt.peptideId, pt.importantNotes)
    .slice(0, 2)
    .map((n) => trim(n, 100));

  if (isSafetyOnly(pt.peptideId)) {
    return {
      peptideId: pt.peptideId,
      name: pt.name,
      safetyInformationOnly: true as const,
      doseGuidance:
        "SAFETY INFORMATION ONLY - state no dose, range, frequency, cycle length or reconstitution for this compound. Direct the user to their prescriber.",
      route: pt.route,
      storage: trim(pt.storageNotes, 80),
      notes,
      contraindications: pt.contraindications,
    };
  }

  return {
    peptideId: pt.peptideId,
    name: pt.name,
    dose: `${pt.typicalDose.min}-${pt.typicalDose.max} ${pt.typicalDose.unit}`,
    route: pt.route,
    freq: pt.frequencyLabel ?? pt.frequency,
    cycle: `${pt.durationWeeks.min}-${pt.durationWeeks.max} weeks`,
    timing: trim(pt.timing, 80),
    storage: trim(pt.storageNotes, 80),
    // First 2 important notes only — Aimee can refer user to full guide for more
    notes,
    contraindications: pt.contraindications,
    // Titration: keep as-is (it's already structured + critical for GLP-1s)
    titration: pt.titrationSchedule?.map((t) => ({
      weeks: t.weekEnd ? `${t.weekStart}-${t.weekEnd}` : `${t.weekStart}+`,
      dose: `${t.dose} ${t.unit}`,
      freq: t.frequencyLabel ?? t.frequency,
    })),
  };
});

const out = {
  generatedAt: new Date().toISOString(),
  peptides: peptideRows,
  protocols: protocolRows,
};

const outPath = path.join(repoRoot, "supabase/functions/aimee-chat/_knowledge.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
console.log(`Wrote ${peptideRows.length} peptides + ${protocolRows.length} protocols`);
console.log(`File: ${path.relative(repoRoot, outPath)}  (${sizeKB} KB)`);
