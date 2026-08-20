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

## The wizard's finish button silently did nothing — found and fixed 2026-08-19

Found by clicking through every button in the running app like an instructor would, after being asked directly: *"אני עדיין לא מצליח לעבור את המסך הזה."* Not found by reading the code, and not found by the persona harness either — both had already missed it.

The real mechanism: `WorkSessionLayer` shows one part of Stage 1 at a time and injects its own "הבא" / "שמירה ומה למדנו" bar. Its finish handler doesn't know about `planReady` — it finds the real save button with `document.querySelector('.actions .primary')` and clicks it. The button gating added earlier the same day (see "First-run friction" below) means that selector matches nothing until every required field is filled. When it found nothing, the handler's fallback was to open the "מה למדנו" tab anyway — no save, no error, a silent jump to a screen that says *"עוד אין מספיק ראיות לניתוח"* as if the click had simply done nothing. Click "לעבודה" to go back, fill something, try again, land in the same place: a dead end that looks like an ordinary "not ready yet" screen, with no way to learn why. Confirmed narrow to Stage 1 — Stage 2 and Stage 3 render their save buttons unconditionally, so the same handler correctly shows its own notice (Stage 2) or the browser's native `alert()` (Stage 3, a separate small inconsistency left as-is).

**Why 103 unit tests and 13 e2e tests all missed it:** the one e2e test that exercises this exact save path reaches the button by running `document.querySelectorAll('.formSection').forEach(el => el.hidden = false)` before filling anything — a direct bypass of the same wizard a real instructor has no way to skip. Fixed in `app/work-session-layer.tsx`: when no save button exists, the handler now scrolls to the `.saveWhen` hint that already explains what's missing, instead of treating "nothing to click" as "done." A new e2e test drives the actual wizard buttons end to end on an empty plan and asserts the app stays put and explains itself — checked against the pre-fix code to confirm it actually fails without the fix, not only passes with it.

### The next layer: chaos testing found a second gap, in the delete button

Neither the persona nor the wizard e2e test is built to click *out of order* or *rapid enough to overlap React's own state updates* — so `tests/chaos/wizard-gremlins.mjs` (gremlins.js, `npm run test:chaos`) was added to cover exactly that family. It ran clean against the fixed wizard, and found one real thing elsewhere: a long enough random click sequence starting from Stage 1 can wander, via the stage strip, to the footer's "מחיקת המידע המקומי" button — and its native `confirm()` got auto-accepted by the chaos runner's own dialog-dismissal, the same way a distracted rapid-click sequence could accept it by accident. The generic message didn't distinguish a real saved year from an empty session, and it took only one dialog.

Fixed 2026-08-18 → 2026-08-19: the button no longer uses `confirm()` at all. It's a two-step in-app disclosure (`deleteStakes` in `lib/stages.ts`) that names exactly what's at risk — *"יימחקו לצמיתות: תוכנית עבודה שמורה, 3 נקודות דרך בהיסטוריה"* — or says plainly there's nothing to lose when the session really is empty. This isn't just more friction; it structurally closes the exploit path the chaos run found, since gremlins' alert-mogwai (and any tool or rushed hand) only auto-dismisses *native* dialogs — there is no longer one here to dismiss. Re-ran the same seed that had surfaced the original finding nine times after the fix: clean every time.

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

## Every remaining deviation theory, tested against the running app — swept 2026-08-19

The wizard's finish button and the delete button (above) were two instances of one pattern: a מדריכה does something a script never would, and the app has no answer for it. Rather than wait for the next one to surface by accident, this pass worked through every scenario in that family that hadn't been driven live yet — reload, two tabs, a calendar edge case, a full store, out-of-order navigation, extreme input, an accessibility scan, a cold landing on `/org`, and a shared device. Each was driven against the real running app (Playwright, plus `@axe-core/playwright` for the scan) exactly as the wizard finding was — not inferred from reading `lib/` or `app/`.

| Scenario | Result |
|---|---|
| Full or blocked `localStorage` (Safari private mode's zero quota) | 🔴 crashed the tab — fixed |
| Two tabs open on the same plan | 🟠 silent overwrite — fixed |
| A calendar gap month (Oct / Nov / Mar / Apr) | 🟠 asserted a stage instead of asking — fixed |
| `axe-core` scan, all 3 stages | 🟠 3 confirmed violations — fixed |
| A generic-setting sentence read as a concrete anchor | 🟠 false negative on R8's own pattern — fixed |
| Landing cold on `/org` (a shared link or bookmark) | 🟡 explained nothing about where files come from — fixed |
| A manually chosen stage, after reload / close-reopen | 🟡 silently discarded, unexplained — documented, not fixed |
| Negation before a cadence word ("לא שבועית") | 🟡 known limitation, not a regression |
| A shared device, several מדריכות | 🟡 mirror of an already-disclosed limitation — copy extended |
| Wizard: back twice, edit, forward twice | 🟢 clean |
| Extreme input: 3000-char paste, HTML/script-like text | 🟢 clean |

### The worst of the sweep: a full store didn't just fail to save, it crashed the tab

Confirmed live, not simulated in the abstract: with `localStorage` blocked the way Safari's private mode enforces (a real zero quota, so even the first write throws), typing a single character into any Stage 1 field ended the session — Chromium's own "This page couldn't load" screen, not an in-app error. The mechanism: `page.tsx`'s autosave effect calls `localStorage.setItem` on every state change with nothing catching the throw, so it re-fires and re-throws on every keystroke until the tab gives up. Two smaller write sites had the identical gap — `context-layer.tsx`'s usage telemetry and `experience-shell.tsx`'s stage picker — neither essential to keep working, both equally capable of taking the tab down with them.

Fixed by wrapping all three in `try/catch`. The two optional ones fail silently (a missed density nudge or a picker click that didn't persist is not worth alarming her over); the one that matters — her plan not saving — surfaces a real notice: *"לא הצלחתי לשמור באופן אוטומטי כרגע — ייתכן שהאחסון בדפדפן מלא או חסום... כדאי להעתיק את מה שכתבת למקום אחר לפני שסוגרים את הדף."* A caught write can only fail to persist, which she is now actually told, instead of losing the tab.

### Two tabs on the same plan overwrote each other in silence

Confirmed with two real Playwright pages sharing one `localStorage`: neither tab knows about the other, so each one's next autosave replaces the whole stored object with whatever it last held in memory — the second tab to save wins, and the first tab's change is gone with no warning in either tab. This doesn't get a merge (that belongs with the parked R3/R7/R10 persistence work — a real store is the actual fix), but it no longer happens silently: the native `storage` event, which only fires in the *other* tab, now surfaces a notice there — *"התוכנית עודכנה בטאב אחר באותו דפדפן. שמירה כאן תחליף את מה ששונה שם..."* — before that tab's own next save can clobber it.

### The home screen asserted a stage during a calendar gap, instead of asking

`stageFromDate()` deliberately returns `null` across Oct/Nov and Mar/Apr — gap months between the pilot's windows — specifically so nothing has to guess. `page.tsx`'s own work view already honors that and shows a neutral picker. `ExperienceShell`'s home view, the first screen she sees, did not: it defaulted straight to `1` and opened confidently on *"את בשלב תכנון"* through two real gap months a year. Verified with `page.clock` across all 10 real boundary crossings a pilot year has — both edges of both gaps, both edges of both real windows, and the direct Stage-3-to-Stage-1 year rollover on July 1st, which correctly has no gap at all. Fixed to match `page.tsx`'s own behavior: during a gap it now asks — *"באיזה שלב בלוח השנה את נמצאת?"* with the same three-button picker — and the moment a real month begins, it goes back to asserting.

**Found alongside it, and left as-is:** reload or close-and-reopen during a *real* month silently discards a manually chosen stage. `SessionStageReset` clears `manualStage` on every load by name and by design; confirmed live — switch to Stage 2, reload, and the home screen is back to *"את בשלב תכנון"* with nothing on screen explaining why. No work is lost (the plan/formative/summative content itself is saved independently of which tab is showing), only the navigation choice, but it is a real inconsistency. Whether a manual stage choice *should* survive a reload is a product decision about what `SessionStageReset` is for, not a bug in how it's implemented — parked here rather than patched around it.

### `axe-core` found three confirmed violations across the three stages

A real automated scanner, not a hand-picked checklist, run against all three stages with realistic saved state: **`color-contrast`** on `.saveWhen` (the hint text under a blocked save, introduced the same day as the wizard fix and never scanned) — darkened to meet AA; **`aria-prohibited-attr`** on the Gantt track, a bare `<div aria-label="…">`, which `role="generic"` does not permit an `aria-label` on — given `role="img"`; and **no `<h1>` anywhere in the work view**, then a jump straight to `<h3>`/`<h4>` the one time a heading was added — the three stage titles are now `<h1>`, with `FormSection`/`AssessmentSection`/`.contextHead`/the Stage 3 rubric cascaded to `<h2>` so nothing skips a level under them. `color-contrast` is deliberately **not** asserted at zero going forward: it's a real, pre-existing gap in `--muted` against light backgrounds across dozens of nodes app-wide, and fixing that properly is a design decision on the replacement color with visual sign-off, not an automated sweep — asserting it away here would hide that decision being skipped. Both new tests live in `tests/e2e/accessibility.spec.ts`.

**One loose end, not chased further:** the scan also surfaced a hidden legacy `<h1>` inside `page.tsx`'s `.welcomeBlock` that coexists with the new stage `<h1>`s — correctly hidden from assistive tech in every check that matters (axe's own rules and a `:visible` count both agree there is exactly one live heading), so not a real accessibility defect, but worth a cleanup pass of its own.

### A generic setting read as a concrete anchor — the R8 nudge's own blind spot

R8 exists to catch *"היה תהליך משמעותי"* — praise with nothing checkable in it — and ask for an anchor. `ANCHOR_MARKERS` treated `כיתה` / `גן` / `מפגש` / `פגישה` / `ישיבה` / `הדרכה` as anchors, so *"היה תהליך מצוין בכיתה"* passed as anchored: it names a setting, not a fact, and is the manager's own Q7 example with one word added. Removed from the marker list; a real event verb, a number, a quote, or an explicit connector still anchors a claim, a setting alone no longer does.

**Two adjacent findings in the same function, tested and left as documented limitations, not fixed:** negation isn't scanned for, so *"לא שבועית"* ("not weekly") still matches the token "שבועית" and reads as weekly cadence — a real fix needs to detect a preceding לא/אין without also breaking on *"לא רק שבועי אלא גם..."*, more complexity than a field that in practice states a cadence, not a rejected one, warrants. And bare *"שבועיים"* deliberately has no entry alongside bare *"שבועי"*: Hebrew has no single-word adjective for biweekly the way it does for weekly, and bare *"שבועיים"* overwhelmingly means the plain duration "two weeks," not a recurrence claim — mirroring the weekly entry would trade one false positive for a more common one.

### Landing cold on `/org` explained nothing about where the files come from

A מדריכה following a shared link or bookmark, never having seen the main app, hit a console that talks about "signal packages" with no explanation of what those are or where a file would come from. Header copy now says so directly: *"כל מדריכה מייצאת חבילת signal משלה מתוך 'מה למדנו' באפליקציה שלה — הקבצים לא נוצרים כאן."* Fixed alongside a small RTL spacing bug found in the same pass — the "← חזרה למדריכה" link had no end-margin and ran straight into the adjacent "תמונת מערכת" label.

### A shared device undercounts the same way a changed device overcounts

The console already discloses that its participant ID is per-device — *"מעבר למכשיר אחר עלול להיספר כמשתתפת חדשה."* The mirror case is the same root cause in the other direction: several מדריכות sharing one browser (a shared staff-room computer) would be counted as *one* participant, not several — undercounting where the disclosed case overcounts. No login system exists to fix this properly, and the copy already names the real fix as future work (*"חשבונות משתמשים יפתרו זאת בשלב הבא"*) — building one is out of this pilot's scope for the same reason R3/R7/R10 are parked, not a gap to patch around. The one thing worth doing now was making the disclosure honest in both directions, so the copy was extended to name the shared-device case explicitly rather than only the one that happened to be written down first.

### Tested and came back clean

Two theories were driven live and found nothing: going back twice in the Stage 1 wizard, editing an earlier answer, and going forward twice again keeps the part index and part count correctly synced at every step, and the edited field survives intact without clobbering a sibling field. And extreme input — a 3,000-character paste into a short field, and HTML/script-like text mixed with Hebrew, English, and special characters — saves correctly, renders with no unescaped HTML anywhere in the page, and raises no console error traceable to the input itself. Recorded here rather than left unmentioned, since silence on a tested theory reads the same as an untested one.

**Suite after this pass: 107 unit tests, 21 e2e tests (6 new — 2 accessibility, 4 instructor), all 3 contract checks, readiness unchanged at 6/8.** None of this closes a new DoD row; every fix here is the same category as the wizard button and the delete friction — the product staying honest about its own limits instead of failing silently — and is recorded here for the same reason those were.

## The review of the previous sweep — every finding verified one by one, 2026-08-20

A multi-angle code review of the commit above produced fifteen findings. Rather than accept or dismiss any of them on reading, each was reproduced — or refuted — against the running app, the built artifact, or the real function. Eleven were confirmed and fixed, two were **disproved**, one was **measured and rejected**, and one turned out to understate a far more serious bug sitting next to it.

The pattern worth keeping is the same one this document has been recording all along, arriving from the other direction: **a review finding is a hypothesis, not a fact.** Two of these were confidently argued, internally consistent, and wrong.

| # | Finding | Verified how | Outcome |
|---|---|---|---|
| 1 | Gap picker wrote `manualStage` with no `canOpenStage` gate | browser | ✅ fixed |
| 2 | Picker overwrote an unreadable save with a blank one | browser | ✅ fixed |
| 3 | Blocked store left the picker inert and silent | browser | ✅ fixed |
| 4 | Static prerender baked the build month into the shipped HTML | build artifact + live | ✅ fixed |
| 5 | Gap answer wiped on every reload | browser | ✅ fixed |
| 6 | Cross-tab warning fired on the app's own housekeeping write | browser | ✅ fixed |
| 7 | A deletion in another tab was announced as an "update" | code trace | ✅ fixed |
| 8 | Save-failure notice never cleared, and clobbered other messages | browser | ✅ fixed |
| 9 | `removeItem` in the delete handler left unguarded | browser | ✅ fixed |
| 10 | Setting-word cull half-applied (`שיעור`, `תצפית` still anchored) | real function | ✅ fixed |
| 11 | Autosave writes are an unthrottled per-keystroke cost | measured | ❌ rejected — see below |
| 12 | Accessibility loop never reached Stage 3 | test run | ✅ fixed |
| 13 | Cross-tab assertion was vacuous | code trace | ✅ fixed |
| 14 | Picker markup, stage names and write guards duplicated | grep | ✅ fixed |
| 15 | Dead and unsynced CSS after the heading migration | grep | ✅ fixed |

### The finding that mattered most was not on the list

Verifying #1 meant clicking a stage button without `force`, which failed. The cause was not the gate: **`document.elementFromPoint` at the centre of all three stage buttons returned the sticky work-session bar, on desktop and on a Pixel 7 alike.** Stage navigation in the work view was completely unclickable for a real user. `WorkSessionLayer` renders its bar before the header in the DOM, so the header scrolls underneath it.

This document already carried a note about that overlap, describing it as hiding "the top ~40px of the stage strip". It was hiding the whole strip. Every directed test clicked with `force: true`, which bypasses Playwright's actionability check — so twenty-three passing tests, four of them written specifically about stage switching, all reported a working control that nobody could operate. Fixed by letting the header out-stack the bar, and pinned by a test that asserts reachability with `elementFromPoint` rather than by clicking.

`force: true` remains correct in the one test that uses it deliberately: a locked stage carries `aria-disabled` rather than `disabled` precisely so it stays clickable and can explain itself. The distinction — advisory-disabled versus physically covered — is why that test now sits next to a separate one that measures the geometry.

### Two findings were wrong

**The heading order in the work view was reported as `h2 → h1`**, on the grounds that the side card's `<h2>` precedes the main card's `<h1>` in the DOM. Enumerating the actually-visible headings in a browser returns `h1 → h2 → h3 → h3 → h3`: the side card is `display:none` in this view, so its heading never reaches a screen reader. No fix; the claim does not survive contact with the rendered page.

**The autosave was reported as a per-keystroke performance problem** — "~52 KB serialized and written synchronously per character", "roughly 300 MB of cumulative serialize+write". Measured on a realistically-filled state (nine sections of 400-character evidence, twelve history entries, twenty revisions): **18,792 characters, and 0.18 ms per serialize-and-write — 1.1 % of one frame's budget.** A full 400-character answer costs about 72 ms of main-thread time in total. The extrapolation was an order of magnitude out, and no debounce was added.

The suggested "once-failed latch" was rejected on stronger grounds than cost: the blocked-store banner clears itself precisely *because* the next keystroke retries and succeeds. A latch would have re-introduced finding #8.

### What changed structurally

Four surfaces each carried their own copy of `state.manualStage ?? stageFromDate() ?? 1`, and the previous commit fixed exactly one of them — which is why the context ribbon and the work-session bar were still asserting Stage 1 during a gap while the screen above them said the stage was unknown. That expression is now `resolveStage` in `lib/stages.ts`, returning `null` for "ask her" and used by all four.

The gap answer also needed to stop being `manualStage`, which was both too short-lived and too long-lived for it: `SessionStageReset` wipes that field on every load by design, so the question was re-asked on every visit for four months a year — and nothing expired it, so a stage chosen in November was still being asserted as "את בשלב תכנון" in December. It is now `gapStage`, carrying the date it was given, consulted only while the calendar itself has no answer.

`lib/state-storage.ts` owned every read and no writes, which is how three hand-rolled `try/catch` blocks around `setItem` drifted into three different policies and a fourth call site was left unguarded entirely. It now owns `writeStoredState`, `patchStoredState` and `clearStoredState`; `patchStoredState` refuses to write over a save it could not read, which is what finding #2 was.

**Suite after this pass: 109 unit tests, 23 e2e tests, all four checks, readiness unchanged at 6/8.** One readiness probe was rewritten: it required the literal string `localStorage.setItem(STORAGE_KEY` inside `app/page.tsx`, so moving that call into the module that owns the key read as R2 being withdrawn. It now asserts the behaviour rather than the location.
