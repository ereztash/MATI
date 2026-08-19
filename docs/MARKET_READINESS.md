# MATI — Definition of Done for the רג״ב pilot

**Scope:** מתי״א רג״ב only. One organization, ~10–30 מדריכות.
**Target:** שנה״ל 2026-27 — the planning window is already open.
**Status of this file:** the single source of truth for "are we ready". `scripts/check-readiness.mjs` verifies the machine-checkable rows; everything else is human-attested with a date and a name.

---

## What "done" means here

This DoD is deliberately **not** a feature list. It is anchored in what the מתי״א manager said when asked directly what success and failure look like (`docs/manager-decisions.md`, Q26–Q30):

> **Failure** — "האפליקציה עובדת טכנית מצוין" but "אין שינוי בהחלטות או בפעולות."
> **Success** — a מדריכה says *"עשיתי משהו אחרת בעקבות זה."*

So a criterion only belongs here if it moves the product toward *observable change in what a מדריכה decides or does*. Technical polish is not progress against this document. Neither is a feature nobody has been observed using.

The manager's three success layers (Q26, Q28) are the spine: **שימוש · שינוי מקצועי · למידה ארגונית.** All three, together — any one alone is not a pass.

---

## Gate 1 — ספטמבר · Stage 1 must be live

The planning window (יולי–ספטמבר) is the only chance this year to start the cycle. Everything here is a precondition for a מדריכה entering a real plan she will still have in December.

| # | Criterion | Layer | Check | Status |
|---|---|---|---|---|
| R1 | A מדריכה who has never seen MATI completes a work plan alone, on her own phone, without training | שימוש | human | ❌ never observed — protocol ready, see `docs/r1-session-protocol.html` |
| R2 | Her work survives closing the browser and restarting the device | שימוש | auto | ✅ verified 2026-08-18 |
| R3 | She has a way to recover her work if the browser/device is wiped | שימוש | auto | ⏸️ parked 2026-08-18 |
| R4 | Changes to a saved plan are recorded as before/after, not silently overwritten | שינוי | auto | ✅ built 2026-08-18 |
| R5 | The product states explicitly that the reflection is not used to rate her | שימוש | auto | ✅ built 2026-08-18 |
| R6 | A named person owns "זה לא עובד לי" and מדריכות know who it is | ארגון | human | ❌ undefined |

**R4 and R5 are the two that carry the manager's own reasoning.**

- **R4 — closed 2026-08-18.** She said it twice, unprompted: *"היא משנה משהו שתכננה"* (Q2) and *"המערכת צריכה לשמור שינויים בתוכנית לאורך זמן"* (Q4). `savePlan` used to overwrite in place, so a plan changed in November was indistinguishable from one written that way in August — the pilot's own success criterion was not hard to measure but *impossible*. Each save now diffs against the previous saved version and keeps the before/after (`lib/plan-revisions.ts`), and the instructor sees what she changed and when. Only substantive plan fields count: Gantt date nudges and the socratic self-answers are excluded, so the change signal is not inflated by the very product measuring it.
- **R5 — closed 2026-08-18.** Q20: the one thing a מדריכה must understand in advance so she can answer honestly is *"שהרפלקציה לא משמשת לדירוג שלה."* Honest answers are the input to everything else, so this is load-bearing, not copywriting. Stated in two places: persistently in the header beside the storage note, and again in full at the top of Stage 2 — immediately before the nine sections where she is asked to write candidly about her own work.

## R1 — how it actually closes

`docs/r1-session-protocol.html` is the field protocol: who to invite, the message to send, a verbatim opening script, four silence rules, an observation sheet tied to the failure points already known, and four closing questions.

Two rules in it matter more than the rest, because they are what makes the result mean anything:

- **The pass criteria are committed before the session, not after.** R1 passes only if she reached a saved plan *and* no question about how to use the tool was answered. Deciding afterwards is how a criterion gets retired without being earned.
- **Do not invite the enthusiast.** The most tech-comfortable מדריכה will pass the form easily and hand back a false positive, which is worse than no data at all.

A failed run is a good outcome — it names where the product breaks and costs an hour. The only bad outcome is the session never happening, and the way that happens is waiting to do it properly with five people in November.

The closing question *"אם זה היה נתקע לך בבית, למי היית פונה?"* also produces the answer to **R6**.

## First-run friction — measured and reduced 2026-08-19

Reported plainly by the first person to use it rather than test it: *"האפליקציה מאוד לא נעימה למשתמש."* Measured on a Pixel 7 profile, first-run Stage 1, before any change:

| | before | after |
|---|---|---|
| First input field | y = 949px (below an 839px fold) | y = 697px |
| Words on screen | 126, for 8 fields | 83 |
| Warnings under an untouched goal field | 1, in the warning colour | 0 |
| Feedback while typing | graded every keystroke | none |

Four causes, in the order they hit a first-time user:

1. **A warning under a field she had not touched.** The empty goal field carried a hint rendered in `--warning` — she was being corrected before she had done anything. Removed; the placeholder already said it.
2. **Grading mid-keystroke.** The SMART checklist re-evaluated on every character. It now waits until she leaves the field, and shows **one question** instead of four rows of misses. A row of ticks is still the product marking her work, so when there is nothing worth asking it says nothing at all.
3. **Philosophy before work.** Four paragraphs of the product explaining itself preceded the first field. Cut.
4. **A heading sliced in half.** The sticky `.workSessionBar` overlaps the header box beneath it, which rendered the section title as the fragment "בשטח" — an app that looks broken before it is used.

**Still open:** cause 4's root — the same overlap still hides the top ~40px of the stage strip. A margin on either element collapses through and moves both, so the fix is in how `WorkSessionLayer` positions relative to the header. Left visible and commented in the CSS rather than papered over with a z-index, which would only make the strip cover the bar while scrolling.

The pattern worth keeping: **every one of these passed all 103 tests and all four contract checks.** None was a defect any automated check could hold an opinion about.

## The persistence family — parked 2026-08-18

**R3, R7 and R10 are parked by explicit decision**, together rather than separately: an instructor-facing backup, a real store, and a transport that carries signals to the organization are one problem at three sizes, and closing any one alone would leave the others incoherent.

The long pole is not the code. Once anything leaves the device, the commitment made to מדריכות changes, and that is a conversation with the manager and the supervision — about data concerning teachers and students in the education system — not an implementation task. **That conversation is the critical path and should start well before December**, which is when Stage 2 makes the loss of a device genuinely unrecoverable: a Stage 1 plan is ten fields she can retype, while the nine-section questionnaire is reflection that cannot be reconstructed from memory.

---

## Gate 2 — דצמבר · Stage 2 and the organizational loop

The manager put the peak value here (Q5): *"בנקודת הבדיקה הראשונה"* — the first collision between plan and reality.

| # | Criterion | Layer | Check | Status |
|---|---|---|---|---|
| R7 | The 9-section questionnaire cannot be lost — real persistence, not localStorage alone | שימוש | auto | ⏸️ parked 2026-08-18 |
| R8 | A generic answer ("היה תהליך משמעותי") is met with a request for a concrete anchor | שינוי | auto | ✅ built 2026-08-18 |
| R9 | An independence/dependency gap is surfaced prominently, not buried in a dimension score | שינוי | auto | ✅ built 2026-08-18 |
| R10 | Signals reach the organization without a person chasing files | ארגון | human | ⏸️ parked 2026-08-18 |
| R11 | Pattern sensitivity matches the manager's threshold: 2–3 repetitions in one framework is enough to warrant inquiry | ארגון | auto | ✅ resolved 2026-08-18 |

**R11 was a contradiction, and it was decided rather than split.** Q12 asked for sensitivity at *"2–3 חזרות באותה מסגרת"*; the classifier withheld everything below 5 contributors, which at this cohort size could have meant the organization saw nothing for a whole year. Decided 2026-08-18: **the floor drops from 5 to 3, and a local cluster surfaces when it bears on implementation** — Q11 is explicit that recurrence alone is not systemic, so impact remains the gate. Surfacing stays an invitation to ask, never a causal claim (Q14, Q22).

The cost is real and is carried in the open, not silently: at 3 contributors a manager who knows the cohort may be able to infer who is behind an aggregate. Every decision now reports `identifiabilityRisk`, the contract check enforces that it is present, and the console is expected to show it rather than present a small aggregate as if it were anonymous. **This is the one criterion whose closure increases a risk rather than reducing one** — if the pilot shows individuals are in fact identifiable in practice, the floor should go back up.

---

## Gate 3 — מאי · the year closes

| # | Criterion | Layer | Check | Status |
|---|---|---|---|---|
| R12 | At least one מדריכה closed a full year cycle: plan → formative → summative | שימוש | human | ❌ |
| R13 | The three pilot metrics are answerable from data: completion, action change, organizational use (Q28) | all | human | ❌ |
| R14 | At least one מדריכה says, unprompted, some version of "עשיתי משהו אחרת בעקבות זה" (Q29) | שינוי | human | ❌ |

R14 is the whole point. Everything above exists to make R14 possible and observable.

---

## Explicitly out of scope for this pilot

Naming these matters as much as the criteria — they are where effort leaks:

- **A generative LLM layer.** The original bot spec assumes one. Not needed for any criterion above, and it reopens the privacy posture that R5 depends on.
- **Multi-tenancy / other מתי״א centers.** Scope is רג״ב. The hardcoded branding stays.
- **Further Stage 1 refinement — with one correction.** This line previously read that Stage 1 "already passes its usability check". That claim was wrong, and wrong in an instructive way: what the 2026-08-18 audit verified was that a *script* could complete the form, which is a smoke test, not a usability check. A human then used it and reported it as unpleasant — and measurement backed him up. Cosmetic polish is still out of scope; **friction that would stop a מדריכה from returning is R1 work, not craft.** The distinction is whether a real person's experience is the evidence.
- **Any feature not traceable to a row above.** If it can't be mapped, it doesn't ship this year.

---

## Honest note on what has been built recently

The SMART advisory checklist, the personalized Gantt, cadence detection and adjustable milestones (PR #18) are well-built and well-tested. They map to **no row in this document**. They improved a Stage 1 flow that already worked, during the weeks when R3/R4/R5 were open. That is the exact drift `.claude/skills/mati-navigator` now exists to catch — recorded here rather than quietly dropped, because a DoD that hides its own misses is decoration.

It also produced a regression, found on 2026-08-18 by the first person to actually try the form rather than test it. On part 1 the checklist rendered Measurable and Time-bound as warnings, though both are answered by fields two parts further on — so a first-time user filled the two fields in front of her, saw four orange misses she could not act on, pressed the prominent save button beneath them, and was told that מדדים and מסגרת זמן were missing from screens she had never seen. Nothing was technically broken; every test passed. The criteria now distinguish `pending` from `missing`, and a blocked save names which part holds each missing field.

The lesson is the DoD's own thesis, arriving the hard way: **R1 is not a formality.** A flow can pass every automated check and still trap the person it was built for, and no amount of test coverage substitutes for watching one מדריכה use it.
