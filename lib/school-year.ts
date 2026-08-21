/**
 * The pilot runs on a school year, not a calendar year, and two separate
 * readers need to agree on where it starts: `lib/plan-timeline.ts` anchors the
 * evaluation windows and the program-year end, and `lib/plan-window.ts` anchors
 * the months she writes in `plan.timeframe`.
 *
 * They each had their own copy of this. If the boundary ever moved in one and
 * not the other, "ספטמבר–ינואר" would anchor to one year while the windows
 * anchored to another — every milestone a year off, with nothing failing,
 * because each file's tests only exercised its own copy.
 *
 * July is the boundary because the pilot's Stage 1 window opens in July
 * (`STAGE_WINDOWS` in lib/stages.ts), so a plan saved on 3 July is the ordinary
 * case rather than an edge one.
 */
export function schoolYearPair(date: Date) {
  const first = date.getMonth() >= 6 ? date.getFullYear() : date.getFullYear() - 1;
  return { first, second: first + 1 };
}
