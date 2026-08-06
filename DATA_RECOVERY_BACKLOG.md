# Data recovery backlog — content that was authored but never reachable

Created 2026-08-06. **This is the answer to "we keep adding all this great info and
it never seems to make it back."**

Nothing was ever deleted. Across the entire git history of `src/data/peptides.ts`,
**56 peptide ids have ever existed and all 56 are still present** — no content was
lost to a bad merge or an overwrite. The problem is structural, not accidental.

## The mechanism

There are four peptide datasets, joined to each other by `peptideId`:

| File | Feeds |
|---|---|
| `peptides.ts` | the library list and every `/peptide/[id]` detail page |
| `peptideDosingTable.ts` | the dosing-range / cycle card on the detail page, and peptalkBot's answers |
| `peptideDosingReference.ts` | reconstitution + syringe units for the calculators and `useActivePeptideCycle` |
| `protocols.ts` | the protocol cards (supports several per peptide) |

Every consumer joins them the same way:

```ts
const entry = getDosingTableEntry(peptideId);
if (!entry) return null;          // ← silent
```

**A row whose `peptideId` has no matching entry in `peptides.ts` is not a warning
and not a blank space — it is invisible.** No error, no log, no placeholder.
Content can be added to any one file and simply never appear, and nothing in the
app or the build ever says so.

A validator existed (`scripts/validatePeptideData.ts`) covering eight datasets.
It **never imported either dosing file**, and it was **wired into no npm script**,
so it had never run.

## Fixed 2026-08-06

- `scripts/validatePeptideData.ts` now checks reachability for the dosing table,
  the dosing reference, `peptideNutrition` and `peptideTiming`, and flags
  duplicate ids (`find()` silently ignores the second).
  **Stranded rows are errors, not warnings** — warnings here have gone unread.
- Wired in as `npm run verify:data`, and first in `npm run verify:all`.
- **L-carnitine added to the library**, which un-stranded the dosing row that was
  already in the repo (`300mg-1000mg`, `1-2x Daily Pre Exercise`).

The gate currently **fails with 25 errors**. That is the backlog below, made
visible rather than invisible. It is not a regression.

---

## 1. Stranded dosing rows — 22 compounds

Fully authored dosing, unreachable because there is no library entry.
Each needs an entry in `peptides.ts` using the **exact id in the left column**.

| id | compound | dose range | cycle | frequency |
|---|---|---|---|---|
| `cjc-1295-ipamorelin` | CJC No Dac/Ipamorelin | 200mcg-600mcg | 3-6 Months | 1-3x Daily AM/Workout/PM |
| `mk-677` | MK-677 | 10mg-25mg | 3-6 Months | 1x Daily Anytime |
| `peg-mgf` | PEG-MGF | 200mcg-400mcg | 4-8 Weeks | 1x Daily Post Workout |
| `yk-11` | YK-11 | 5-20mg Oral or 10-20mg Inj | 4-8 Weeks | 1x Daily Oral Or 2x Daily Inj |
| `5-amino-1mq-inj` | 5-Amino-1MQ (inj) | 0.5mg-2mg | 4-16 Weeks | 1-2x Daily AM/PM |
| `methylene-blue` | Methylene Blue | 5mg-25mg | As Long As Needed | 1x Daily AM |
| `coq10` | CoQ10 (inj) | 50mg-200mg | As Long As Needed | 1x Daily AM |
| `cardarine` | Cardarine (oral/inj) GW-501516 | 10mg-20mg | 4-16 Weeks | 1x Daily AM |
| `bam15` | BAM15 | 50mg-150mg | 4-8 Weeks | 1-2x Daily AM/Mid Day |
| `gc-1` | GC-1 | 100mcg-500mcg | 4-16 Weeks | 1x Daily AM |
| `dada` | DADA | 50mg-200mg | 4-12 Weeks | 1x Daily AM |
| `itpp` | ITPP | 500mg-2000mg | 4-12 Weeks | 1x Daily |
| `glow` | GLOW | 10 Units (diluted with 300 units) | 4-12 Weeks | 1x Daily |
| `kpv-inj` | KPV (inj) | 250mcg-600mcg | 4-12 Weeks | 1x Daily |
| `kpv-oral` | KPV (oral) | 500mcg-1000mcg | 4-12 Weeks | 1-2x Daily AM and PM |
| `tesofensine` | Tesofensine | 250mcg-1000mcg | 4-12 Weeks | 1x Daily AM |
| `enclomiphene` | Enclomiphene | 12.5mg-25mg | 4-12 Weeks or longer | Daily |
| `klow` | KLOW | 10 Units (diluted with 300 units) | 4-12 Weeks | 1x Daily |
| `nad-carnitine-blend` | NAD+/Carnitine Amino Blend | 50-100 units | — | 1x Daily Pre Exercise |
| `alpha-gpc` | Alpha GPC | 300mg-600mg | — | 1-2x Daily |
| `cdp-choline` | CDP-Choline | 200mg-600mg | — | 1-2x Daily |
| `9-me-bc` | 9-ME-BC | 15mg-30mg | 4-8 Weeks | 1x Daily AM |

Several are not peptides (methylene blue, CoQ10, alpha-GPC, CDP-choline,
cardarine, YK-11, MK-677). That is fine — L-carnitine is now handled the same
way, under an "amino acid derivatives" heading that says plainly what they are.

## 2. Join-key mismatches — content exists on BOTH sides but does not meet

These are the cheapest wins and the most confusing failures, because the library
entry looks fine and the dosing looks fine.

| Stranded row | Library has | What the user sees today |
|---|---|---|
| `kpv-inj`, `kpv-oral` | `kpv` | **KPV shows no dosing card at all**, despite two authored rows |
| `retatrutide-10mg` (ref) | `retatrutide` | `getDosingReference` returns the 5mg row first — **the 10mg vial is unreachable** |
| `5-amino-1mq-inj` | `5-amino-1mq` | oral dosing renders; the injectable route does not |
| `cjc-1295-ipamorelin` | `cjc-1295`, `cjc-1295-no-dac` | the blend has no page |

**Root cause:** the dosing table is keyed by *product / route variant*
(`kpv-inj`, `kpv-oral`, `retatrutide-10mg`), the library by *compound* (`kpv`,
`retatrutide`). The two schemes were never reconciled. Merging the ids is wrong —
an oral 500-1000mcg dose and an injectable 250-600mcg dose are genuinely
different, and `find()` would only ever return the first. The fix is either a
library entry per variant, or a route/vial dimension in the reference schema.

## 3. Stranded nutrition content

`peptideNutrition.ts` (74KB, 56 entries) has a **`liraglutide`** row with no
library entry. Either add Liraglutide to the library or drop the row.

## 4. Coverage gaps — not defects, but visible holes

A library entry with no dosing row still renders a full page; it just shows no
dosing card. Currently:

- **16 peptides show no dosing card**: adipotide, ghrp-2, ghrp-6, hexarelin,
  hgh-fragment-176-191, cerebrolysin, thymalin, kpv, hmg, snap-8, oxytocin,
  dermorphin, pnc-27, noopept, humanin, somatropin
- **26 peptides have no reconstitution reference**, so the calculators cannot
  offer a protocol for them

L-carnitine appears in that second list and should stay there — it is dosed
orally in milligrams and has nothing to reconstitute.

## 5. Outstanding request to Edward — never answered

`DOSING_REFERENCE_DRAFT.md` was written to collect reconstitution specs for 25
uncovered peptides. **20 of them still say "needs Edward's spec"** and the file
has sat unfilled. Those 20 cannot get a calculator protocol until the vial size
and diluent volume are supplied.

---

## The rule going forward

**Adding dosing, nutrition or timing content for a compound requires a
`peptides.ts` entry with a matching id — otherwise the content is invisible.**
`npm run verify:data` now enforces this and fails the build. Run it before
assuming any new content shipped.
