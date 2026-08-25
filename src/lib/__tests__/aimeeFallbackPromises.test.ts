/**
 * The fallback path must not promise a save it cannot perform.
 *
 * PepTalk has two chat paths: aimee-chat-stream (primary, typed tools, a real
 * confirmation card and a real write) and aimee-chat (legacy). The legacy path
 * is not dead — peptalk.tsx falls back to it whenever streaming fails, so it
 * runs in production.
 *
 * Its prompt told the model to emit `---DATA_ACTION--- {...}` for logging a
 * check-in, dose, meal, workout or reminder, and told the user "you will see a
 * confirmation prompt before any data is saved". Neither was true:
 * llmService parsed the block into `ChatMessage.dataAction` and NOTHING in the
 * app ever read that field. No card appeared, nothing was written, and the
 * action vanished — while Aimee had just told the user it was handled.
 *
 * The fix was NOT to wire the legacy payload into the confirmation queue. The
 * streaming tools have typed schemas (peptideId, amount, unit …) while the
 * legacy prompt emitted free-form `"data": {...}` — mapping one onto the other
 * would mean guessing at a dose payload, and writing a wrong dose amount is a
 * far worse failure than dropping it. The capability still exists, correctly,
 * on the primary path.
 *
 * This test pins the honest wording so the promise cannot creep back.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..');

const PROMPTS = [
  path.join(ROOT, 'src', 'services', 'llmService.ts'),
  path.join(ROOT, 'supabase', 'functions', 'aimee-chat', '_prompt.ts'),
];

describe.each(PROMPTS.map((p) => [path.relative(ROOT, p), p]))(
  'legacy chat prompt: %s',
  (_label, file) => {
    const src = fs.readFileSync(file, 'utf8');

    it('is the file we think it is', () => {
      // Guards against this test passing vacuously if a prompt moves.
      expect(src.length).toBeGreaterThan(500);
      expect(src).toMatch(/NAV_ACTION/);
    });

    it('does not claim the user will see a confirmation prompt', () => {
      expect(src).not.toMatch(/confirmation prompt before any data is saved/i);
    });

    it('does not instruct the model to emit DATA_ACTION', () => {
      // llmService.ts legitimately still CONTAINS the literal: the parser
      // strips a stray marker so it never renders as raw text to the user.
      // What must not come back is an INSTRUCTION to emit one, so check for
      // the marker alongside an instruction verb rather than the bare string.
      const instructing = src
        .split('\n')
        .filter((l) => l.includes('DATA_ACTION'))
        .filter((l) => /\b(include|add|emit|use|append|tags)\b/i.test(l))
        // The parser lines describe a regex, not an instruction.
        .filter((l) => !/\.match\(|\.replace\(/.test(l));
      expect(instructing).toEqual([]);
    });

    it('does not advertise reminder-setting, which exists on no path', () => {
      expect(src).not.toMatch(/"type":\s*"reminder"/);
    });

    it('states plainly that this path cannot save', () => {
      expect(src).toMatch(/CANNOT save data on this path/);
    });
  },
);
