# Intent review — what's in PepTalk, and where it came from

Compiled 2026-08-10 for Edward to cross-reference against what was actually
wanted. Every number here was measured from the code, not recalled.

The question this answers: **which of this did we ask for, and which did an AI
decide was a good idea?**

Tick one per row: `WANTED` · `DIDN'T WANT` · `WANTED BUT WRONG`

---

## 1. Screens built on 2026-08-09/10 — newest, most worth challenging

These are the ones with the shortest history, so they get listed first.

| Screen | What it does | Why it was built | Verdict |
|---|---|---|---|
| `app/plan/index.tsx` | Generates a 4-week plan from your goals, tick items off, weekly progress | `usePlanStore` had 12 actions, 9 with no caller; `generateHealthPlan` had no caller; Aimee's own copy promised the feature | |
| `app/insights.tsx` | Per-protocol biometric correlations + your logged side effects | `watchCorrelationService` computes all of it and only fed Aimee's chat context — no screen | |
| `app/nutrition/grocery.tsx` | Aisle-ordered list, tick off, clear checked | `useGroceryStore` had full CRUD, only consumer was logout cleanup | |
| Food diary (in `app/nutrition/index.tsx`) | Today's meals, tap to add to one, long-press to delete | `getMealsByDate` / `updateMeal` / `removeMeal` all had zero callers | |

**The honest caveat on all four:** the machinery existed and was unreachable. I
inferred that "built but unwired" meant "wanted but unfinished". That inference
could be wrong — a store can exist because someone tried an idea and dropped it.
If any of these were abandoned on purpose, say so and they come out.

## 2. Features added to existing screens

| Change | Where | Trigger | Verdict |
|---|---|---|---|
| Weight per set | `workouts/new` + `player-v2` | Jamie asked repeatedly; the field existed in the model with no input and no reader | |
| Rest-timer sound | `RestTimer` + `lib/cue` | Timer signalled only via haptics, which no-op on web entirely | |
| Save recipe to My Meals | `recipe-generator` | "Create meal" sent `asTemplate=1`; nothing read it | |
| Your logged side effects | `peptide/[id]` | `getByPeptide` existed with no caller | |
| Leave a program | `workouts/program/[id]` | `startProgram` had a button; `quitProgram` had no caller | |
| Journal row | `profile` | The app's ONLY link to `/journal` was inside dead code | |
| Sound toggle | `settings/notifications` | Needed an off switch | |

## 3. Data the app asserts — the real hallucination surface

This is where invented content would actually hurt, and it is the section worth
your closest read.

| Claim type | Count | Provenance |
|---|---|---|
| Peptides with a research summary / mechanism paragraph | **79 of 79** | authored in `peptides.ts` |
| …of those, with a **cited source** | **16** | `sources.ts`, 15 entries |
| …with **no citation at all** | **63** | **unverifiable from inside the repo** |
| Dosing card rendered to users | 73 | `peptideDosingTable.ts` + derived from protocols |
| Curated reconstitution reference (vial/diluent/units) | 33 | Edward's reference doc |
| Protocol (dose range + frequency) | 40 | `protocols.ts` |
| Safety profile — hand-curated | 15 | FDA labels + literature |
| Safety profile — transcribed from PPP guides | 39 | your doctor-reviewed guides, 2026-08-10 |
| Safety profile — none | 25 | — |

**63 peptides carry clinical prose with no citation.** I did not write that text
and cannot tell you which of it is sourced, paraphrased, or invented. It is the
largest single block of unverified assertion in the app. If you want one thing
audited by a human, this is it.

What I did NOT do, deliberately: invent adverse effects, contraindications,
diluent volumes or dose schedules for anything missing them. Where a source
did not exist, the field stayed empty and the screen says so.

---

## 3a. TWO DOSING SOURCES THAT CONTRADICT EACH OTHER — read this first

Added 2026-08-10. This is the largest single data problem found, and it is not
a UI bug.

`peptideDosingTable.ts` and `protocols.ts` each carry a dose range for the same
compound. **Both reach users**, and on `app/peptide/[id]` both render on the
SAME SCREEN — the dosing card shows the table, the Beginner/Advanced card shows
the protocol a few hundred pixels below. The calculators use the protocol.

Of the 37 mass-dosed compounds carrying both: **11 agree, 25 disagree, 1 unparseable.**

| Compound | Table | Protocol | Apart |
|---|---|---|---|
| **NAD+** | 200-600 mcg | 50,000-200,000 mcg | **~250x** |
| **CJC-1295 (with DAC)** | 1000-2000 mcg | 100-300 mcg | ~10x |
| **GHK-Cu** | 1000-5000 mcg | 200-600 mcg | ~8x |
| **TB-500** | 330-1000 mcg | 2000-5000 mcg | ~6x |
| **MOTS-c** | 1000-2000 mcg | 200-1000 mcg | ~5x |
| Glutathione | 200-400 mg | 600-1200 mg | ~3x |
| Epithalon | 2000-5000 mcg | 5000-10000 mcg | ~2x |
| Survodutide | 500-2700 mcg | 2400-6000 mcg | ~2x |
| Cagrilintide | 300-4500 mcg | 1200-2400 mcg | — |
| Retatrutide | 500-12000 mcg | 1000-12000 mcg | — |
| Tirzepatide | 500-15000 mcg | 2500-15000 mcg | — |
| BPC-157 | 250-1000 mcg | 200-500 mcg | — |
| Ipamorelin | 100-500 mcg | 200-300 mcg | — |
| Tesamorelin | 500-2000 mcg | 1000-2000 mcg | — |
| Thymosin Alpha-1 | 500-2000 mcg | 1000-1600 mcg | — |
| LL-37 | 100-500 mcg | 50-200 mcg | — |
| Kisspeptin-10 | 50-200 mcg | 30-100 mcg | — |
| PT-141 | 500-2000 mcg | 1000-2000 mcg | — |
| Melanotan-2 | 250-1000 mcg | 250-500 mcg | — |
| DSIP | 100-500 mcg | 100-300 mcg | — |
| Mazdutide | 3000-6000 mcg | 3000-9000 mcg | — |
| IGF-1 LR3 | 25-100 mcg | 20-80 mcg | — |
| KPV (Injectable) | 250-600 mcg | 200-500 mcg | — |
| Selank | 200-600 mcg | 200-500 mcg | — |
| Semaglutide | 250-2400 mcg | 250-2500 mcg | — |

**No code decided which is right, and none should.** Choosing between two
clinical figures is Jamie's call; the wrong choice is a dose error carrying the
app's full authority.

NAD+ is worth looking at first: 200-600 **mcg** for a compound normally dosed
in tens of milligrams looks like a unit error in the table rather than a
disagreement about the dose.

Reported every run by `verify:dosingconsistency`. It warns rather than fails
today, deliberately — a permanently red gate gets switched off within a week.
Once the list is settled, flip `FAIL_ON_MISMATCH` and it becomes a real gate.

MOTS-c is on this list despite having been "fixed" earlier: that fix corrected
the dosing CARD against Jamie's protocol and did not touch `protocols.ts`, so
the two are still 5x apart. A fix aimed at one source cannot resolve a
disagreement between two.

## 4. Parked work — exists, deliberately not launched

| Item | Lines | Status |
|---|---|---|
| `LeaderboardStrip.tsx` | 304 | Phase 2, mock data. `verify:routes` records the leaderboard as deliberately unlaunched | |
| `MaxYourStackCard.tsx` | 271 | Coming-soon tease + waitlist opt-in. Orphaned when `workouts/index` was cut 1140→238 lines on Jamie's feedback | |
| Learn videos (9 entries) | — | All `comingSoon: true`; screen shows an honest empty state | |
| Health Connect (Android) | — | Adapter returns empty arrays | |
| Whoop / Oura | — | "Coming soon" cards, no connect button | |

Neither of the first two is deleted. Both are visible in `verify:deadfiles`
with the reason.

## 5. Store APIs with no UI — candidates, not conclusions

Measured with a corrected scanner (three earlier versions reported every action
as dead). Most are redundant getters superseded by pure services, not gaps:

- `useCycleStore` — 8 getters; the 4 cycle screens call `cyclePredictor`
  directly, and `app/cycle/index` documents why
- `usePantryStore.getExpiringItems` — the pantry screen sorts by expiry inline
- `useWorkoutStore` — `clearMonthlyPlan`, `getLogsByProgram`, `getTotalVolume`,
  `getRecentExercises`
- `useSubscriptionStore` — `deactivate`, `isExpired`, `getTimeUntilExpiry`,
  `getFeatures`
- `useTutorialStore` — `goToStep`, `hasSeenCoachMark`, `queueDeltaTour`,
  `clearQueuedDeltaTour` (is the tutorial/coach-mark system wanted at all?)

## 6. Claims that were false and are now corrected

Listed because they show what unchecked generation looks like in this codebase:

| Was | Actual |
|---|---|
| Aimee: "3,000+ exercises with video demos" | 384 exercises, 97 with a clip |
| Aimee: "We have 42 workout programs" | 2 ship, the tab shows 1 |
| Aimee: Push/Pull/Legs, Upper/Lower, Full Body, Strength Focus, Metabolic Conditioning | none are our programs |
| Aimee: chest → Bench Press, Incline DB Press, Cable Flyes, Push-Ups | **none of the 4 exist in the catalog**; 22 of 28 body-part suggestions didn't |
| Paywall: "55+ peptides" | 79 |
| Tagger: "Search 289 exercises" | 384 |
| Nutrition card: "7-day meals + grocery list" | the plan produced no grocery list |

All now derived from the data, with tests that fail if either side moves.

## 7. Questions only you can answer

1. Were the four screens in §1 wanted, or abandoned experiments?
2. Who wrote the 63 uncited peptide summaries, and is that text trusted?
3. Is the tutorial / coach-mark system wanted? Four of its actions have no caller.
4. Duplicate exercises — `bent-over-cable-bar-row` / `cable-bar-bent-over-row`,
   and the barbell overhead-tricep pair. Same movement twice; only one of each
   carries clips. Which id survives?
5. Five clips reference exercises that don't exist: `dumbbell-pullover`,
   `dumbbell-skull-crusher`, `narrow-grip-seated-cable-row`,
   `ball-straight-leg-bridge`, `dumbbell-fly`. Add the exercises or retag?
6. `MaxYourStackCard` — bring it back or delete it?
