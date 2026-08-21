/**
 * Tokenizing shared by the two readers of `plan.timeframe`: the cadence phrase
 * reader (`lib/cadence.ts`) and the month-range reader (`lib/plan-window.ts`).
 *
 * Shared rather than copied because they read the SAME text and must split it
 * the same way. Adding a separator to one copy only — the Hebrew maqaf ־, say,
 * which this codebase already emits itself in the Gantt's aria-label — would
 * fix one reader and silently leave the other blind to the same sentence.
 */
export function normalize(text: string) {
  return text.replace(/[-–—־.,!/\;:"'()״׳]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function tokenize(text: string): string[] {
  return normalize(text).split(' ').filter(Boolean);
}
