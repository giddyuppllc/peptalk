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

const protocolRows = PROTOCOL_TEMPLATES.map((pt) => ({
  peptideId: pt.peptideId,
  name: pt.name,
  dose: `${pt.typicalDose.min}-${pt.typicalDose.max} ${pt.typicalDose.unit}`,
  route: pt.route,
  freq: pt.frequencyLabel ?? pt.frequency,
  cycle: `${pt.durationWeeks.min}-${pt.durationWeeks.max} weeks`,
  timing: trim(pt.timing, 80),
  storage: trim(pt.storageNotes, 80),
  // First 2 important notes only — Aimee can refer user to full guide for more
  notes: pt.importantNotes?.slice(0, 2).map((n) => trim(n, 100)),
  contraindications: pt.contraindications,
  // Titration: keep as-is (it's already structured + critical for GLP-1s)
  titration: pt.titrationSchedule?.map((t) => ({
    weeks: t.weekEnd ? `${t.weekStart}-${t.weekEnd}` : `${t.weekStart}+`,
    dose: `${t.dose} ${t.unit}`,
    freq: t.frequencyLabel ?? t.frequency,
  })),
}));

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
