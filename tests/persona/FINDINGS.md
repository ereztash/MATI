# Persona journey — מיכל לוי, מדריכת חינוך מיוחד

Run 2026-08-19 against the Pixel 7 profile, Stage 1, no prior knowledge of the app.
Persona and behaviour rules: `michal.json`. Runner: `run.mjs`.

## Result

**She completed a saved work plan** — alone, on a phone, with no explanation, in 11
human-level actions and zero console errors. The journey works end to end.

## What the run confirmed

- The landing screen gives exactly one call to action (`המשיכי מכאן`) and it leads
  to the right place. She never had to guess which of the four tabs to open.
- **The part-1 save trap fires exactly as predicted.** Her behaviour profile says she
  taps whatever looks like the primary action, and the biggest filled button on
  part 1 is `אשרי ושמרי את תוכנית העבודה`. She tapped it with two of five required
  fields filled.
- **The fix caught her.** The message named the missing fields *and where they live*
  — "שני מדדי הצלחה (חלק 2), מסגרת זמן (חלק 3). אפשר להמשיך עם הבא" — and she
  recovered without help. Before that change the same tap produced a list of missing
  fields with no indication that they were on screens she had not seen.

## New findings from this run

**1. The fix converts a dead end into a detour — it does not prevent it.**
She still spends a tap on a button that cannot work, on the first screen she ever
sees. The message is good recovery; not offering the action until it can succeed
would be better. The save button is rendered on every part because `PlanMode` draws
it once outside the stepped sections.

**2. Self-narration lands at the worst possible moment.**
Immediately below the blocked-save notice, the adaptive signal added
*"התשובות שלך כרגע קצרות וענייניות. אשמור על תצוגה תמציתית…"* — the product
describing its own behaviour while she is trying to recover from being blocked. Two
stacked notices at the point of highest friction, only one of which is about her
problem.

**3. The stage strip is still clipped by the sticky bar** (already recorded in
`docs/MARKET_READINESS.md`). Visible in `step-04.png` as sliced text.

## What this does and does not replace

It does not close **R1**. A scripted persona cannot be confused, cannot get bored,
and cannot decide the tool is not worth twenty minutes — and its author already knows
where everything is, which is the one advantage a real מדריכה will never have.

What it does is burn down the obvious friction *before* a real session, so that the
hour with a real person is spent finding what only a person can find.
