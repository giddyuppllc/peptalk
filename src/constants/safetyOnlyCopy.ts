/**
 * Copy slots for the safety-information-only compounds (Edward's 2026-09-16
 * decision — see src/data/safetyOnlyCompounds.ts).
 *
 * EDWARD WRITES THE WORDS. Suppressing the doses left a small number of places
 * where a sentence COULD go and where no sentence he has written fits. Every
 * one of them is listed here, empty, and every render site checks for an empty
 * string and renders NOTHING — no empty box, no placeholder, no "coming soon".
 *
 * That is the point of this file: the alternative is inventing a line of
 * product copy and shipping it under Edward's name, which is how a marketing
 * document once wrote a standing legal denial into a footer on every page.
 *
 * TO FILL ONE IN: put the sentence in the constant. The render site already
 * handles it — nothing else needs to change.
 *
 * Nothing here is used to decide WHETHER a dose is suppressed. These are
 * presentation strings only.
 */

/**
 * SLOT 1 — peptide detail screen, where the dosing cards used to be.
 *
 * Only reached for a safety-only compound that DOES have catalogued dosing
 * data (so the existing "no published human-trial dosing protocol in our
 * catalog" empty state, which is authored copy, would be inaccurate for it).
 * Renders as an extra paragraph inside that same existing card.
 *
 * Renders nothing while empty. Site: app/peptide/[id].tsx
 */
// TODO(Edward) — awaiting copy
export const SAFETY_ONLY_WHY_NO_DOSE = '';

/**
 * SLOT 2 — the "speak to your prescriber" line.
 *
 * Edward's decision explicitly allows a prescriber line for prescription
 * compounds. Several compounds on the list are prescription-only (hCG, hMG,
 * somatropin, enclomiphene, MK-677, YK-11), so the slot exists — but the
 * wording is his, and the existing prescriber sentences in the app are bound
 * to surfaces that still show a dose, so none of them can be lifted verbatim.
 *
 * Renders nothing while empty. Site: app/peptide/[id].tsx
 */
// TODO(Edward) — awaiting copy
export const SAFETY_ONLY_PRESCRIBER_LINE = '';

/**
 * SLOT 3 — Aimee's stock answer when asked the dose of a listed compound.
 *
 * Applies to the on-device bot (src/services/peptalkBot.ts). Today the bot
 * falls through to its existing authored "we don't have a detailed protocol
 * template for X yet" branch, which is true and carries no number — so this
 * slot is additive, not a gap. The SERVER prompt is instructed separately
 * (supabase/functions/aimee-chat-stream/_prompt.ts) and does not read this.
 *
 * Renders nothing while empty. Site: src/services/peptalkBot.ts
 */
// TODO(Edward) — awaiting copy
export const SAFETY_ONLY_AIMEE_STOCK_ANSWER = '';
