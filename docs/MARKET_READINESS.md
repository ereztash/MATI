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
| R1 | A מדריכה who has never seen MATI completes a work plan alone, on her own phone, without training | שימוש | human | ❌ never observed |
| R2 | Her work survives closing the browser and restarting the device | שימוש | auto | ✅ verified 2026-08-18 |
| R3 | She has a way to recover her work if the browser/device is wiped | שימוש | auto | ❌ no backup path exists |
| R4 | Changes to a saved plan are recorded as before/after, not silently overwritten | שינוי | auto | ❌ not built |
| R5 | The product states explicitly that the reflection is not used to rate her | שימוש | auto | ❌ not stated |
| R6 | A named person owns "זה לא עובד לי" and מדריכות know who it is | ארגון | human | ❌ undefined |

**R4 and R5 are the two that carry the manager's own reasoning.**

- **R4** — she said it twice, unprompted: *"היא משנה משהו שתכננה"* (Q2) and *"המערכת צריכה לשמור שינויים בתוכנית לאורך זמן"* (Q4). Today `updatePlan` overwrites in place and clears `savedAt`; a plan that changed in November is indistinguishable from one written that way in August. **Without R4 the pilot's own success criterion is unmeasurable** — not hard to measure, *impossible*.
- **R5** — Q20: the one thing a מדריכה must understand in advance so she can answer honestly is *"שהרפלקציה לא משמשת לדירוג שלה."* Honest answers are the input to everything else, so this is load-bearing, not copywriting.

---

## Gate 2 — דצמבר · Stage 2 and the organizational loop

The manager put the peak value here (Q5): *"בנקודת הבדיקה הראשונה"* — the first collision between plan and reality.

| # | Criterion | Layer | Check | Status |
|---|---|---|---|---|
| R7 | The 9-section questionnaire cannot be lost — real persistence, not localStorage alone | שימוש | auto | ❌ localStorage only |
| R8 | A generic answer ("היה תהליך משמעותי") is met with a request for a concrete anchor | שינוי | auto | ❌ not built |
| R9 | An independence/dependency gap is surfaced prominently, not buried in a dimension score | שינוי | auto | ⚠️ partial |
| R10 | Signals reach the organization without a person chasing files | ארגון | human | ⚠️ manual export/import |
| R11 | Pattern sensitivity matches the manager's threshold: 2–3 repetitions in one framework is enough to warrant inquiry | ארגון | auto | ❌ conflicts with code |

**R11 is a real contradiction to resolve, not a gap to fill.** Q12: *"2–3 חזרות באותה מסגרת"*, and Q11: systemicity needs recurrence **and** operational impact. The current classifier (`lib/organizational-signals.ts`) treats `local_cluster` as non-surfaceable and requires `contributors >= 5` before anything reaches the organization. With a cohort this size that threshold may never trigger at all — the org would see nothing all year. The privacy floor and the manager's sensitivity ask pull in opposite directions and someone has to decide which wins.

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
- **Further Stage 1 refinement.** Stage 1 already passes its usability check (verified 2026-08-18). More polish there is craft, not progress.
- **Any feature not traceable to a row above.** If it can't be mapped, it doesn't ship this year.

---

## Honest note on what has been built recently

The SMART advisory checklist, the personalized Gantt, cadence detection and adjustable milestones (PR #18) are well-built and well-tested. They map to **no row in this document**. They improved a Stage 1 flow that already worked, during the weeks when R3/R4/R5 were open. That is the exact drift `.claude/skills/mati-navigator` now exists to catch — recorded here rather than quietly dropped, because a DoD that hides its own misses is decoration.
