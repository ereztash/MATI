import type { Plan } from './stages';

/**
 * Before/after record for the work plan.
 *
 * The מתי״א manager named this twice as the pilot's success signal:
 * "היא משנה משהו שתכננה" and "המערכת צריכה לשמור שינויים בתוכנית לאורך זמן"
 * (docs/manager-decisions.md, Q2 and Q4). Until now `savePlan` overwrote in
 * place, so a plan rewritten in December was indistinguishable from one
 * written that way in August — which made the pilot's own success criterion
 * unobservable, not merely hard to observe.
 *
 * Only the substantive plan fields are tracked. The Gantt date overrides are
 * scheduling adjustments rather than changes of intent, and identityFit /
 * confidenceNeed are reflective answers about herself rather than the plan.
 * Recording those as "plan changes" would inflate the very signal this exists
 * to measure honestly.
 */

export type TrackedPlanField =
  | 'audience' | 'smartGoal' | 'metric1' | 'metric2' | 'timeframe'
  | 'flexibility' | 'managers' | 'independence' | 'nextSmallStep';

/** Display labels match the Stage 1 form so a change reads as the field she edited. */
export const TRACKED_PLAN_FIELDS: ReadonlyArray<{ field: TrackedPlanField; label: string }> = [
  { field: 'audience', label: 'קהל היעד' },
  { field: 'smartGoal', label: 'מטרת SMART' },
  { field: 'metric1', label: 'מדד הצלחה 1' },
  { field: 'metric2', label: 'מדד הצלחה 2' },
  { field: 'timeframe', label: 'מסגרת זמן' },
  { field: 'flexibility', label: 'נקודת הגמישות' },
  { field: 'managers', label: 'מעורבות מנהלים' },
  { field: 'independence', label: 'עצמאות המודרך' },
  { field: 'nextSmallStep', label: 'הצעד הקטן' },
];

export type PlanFieldChange = {
  field: TrackedPlanField;
  label: string;
  before: string;
  after: string;
};

export type PlanRevision = {
  /** When the previous version was superseded. */
  at: string;
  changes: PlanFieldChange[];
};

/**
 * Fields that differ in substance between two saved versions.
 *
 * Whitespace-only edits are not changes — retyping the same sentence with a
 * trailing space is not a decision, and counting it as one would make the
 * change log lie in the direction that flatters the product.
 */
export function diffPlans(before: Plan, after: Plan): PlanFieldChange[] {
  const changes: PlanFieldChange[] = [];
  for (const { field, label } of TRACKED_PLAN_FIELDS) {
    const from = (before[field] ?? '').trim();
    const to = (after[field] ?? '').trim();
    if (from !== to) changes.push({ field, label, before: from, after: to });
  }
  return changes;
}

/** How many distinct times she revised the plan after first committing to it. */
export function revisionCount(revisions: PlanRevision[]) {
  return revisions.length;
}

/** Every field she has ever changed, most recently changed first — the "what moved this year" view. */
export function changedFieldsSummary(revisions: PlanRevision[]): Array<{ label: string; times: number }> {
  const counts = new Map<string, number>();
  for (const revision of revisions) {
    for (const change of revision.changes) counts.set(change.label, (counts.get(change.label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, times]) => ({ label, times }))
    .sort((a, b) => b.times - a.times);
}
