import type { MatiState } from './stages';
import { planSaved } from './stages';

/**
 * Personalized Gantt derived from a saved Stage 1 plan.
 *
 * v1 adds no new schema fields on purpose: the start is when the plan was
 * committed (`plan.savedAt`), the end is the close of the same program year
 * the fixed macro Gantt already uses (see stageFromDate in stages.ts and
 * stageWindow in context-engine.ts), and every milestone is read from a
 * plan field that is already there. A field left blank simply produces no
 * milestone — nothing is guessed to fill a gap.
 */

export type TimelineMilestoneKind =
  | 'smallStep'
  | 'managerTouch'
  | 'flexibilityCheck'
  | 'formativeWindow'
  | 'summativeWindow';

export type TimelineMilestone = {
  kind: TimelineMilestoneKind;
  label: string;
  detail: string;
  date: Date;
  /** Present only for the two fixed calendar windows, which are ranges rather than points. */
  rangeEnd?: Date;
};

export type PersonalGantt = {
  start: Date;
  end: Date;
  now: Date;
  milestones: TimelineMilestone[];
};

const DAY_MS = 86_400_000;

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + Math.round(days) * DAY_MS);
}

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY_MS));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/** Reads the real length of February back out instead of hardcoding 28/29. */
function lastDayOfFebruary(year: number) {
  return new Date(year, 2, 0).getDate();
}

/**
 * The school-year pair a date belongs to, matching the fixed Gantt windows
 * used across the app: stage 1 opens Jul-Sep of `first`, stage 2 spans
 * Dec `first`–Feb `second`, stage 3 spans May–Jun `second`.
 */
function schoolYearPair(date: Date) {
  const month = date.getMonth(); // 0-indexed; 6 = July
  const first = month >= 6 ? date.getFullYear() : date.getFullYear() - 1;
  return { first, second: first + 1 };
}

function programYearEnd(start: Date) {
  const { second } = schoolYearPair(start);
  return new Date(second, 5, 30, 23, 59, 59, 999); // Jun 30
}

function formativeWindowAfter(start: Date) {
  const { first, second } = schoolYearPair(start);
  return { start: new Date(first, 11, 1), end: new Date(second, 1, lastDayOfFebruary(second), 23, 59, 59, 999) };
}

function summativeWindowAfter(start: Date) {
  const { second } = schoolYearPair(start);
  return { start: new Date(second, 4, 1), end: new Date(second, 5, 30, 23, 59, 59, 999) };
}

export function buildPersonalGantt(state: MatiState, now = new Date()): PersonalGantt | null {
  if (!planSaved(state) || !state.plan.savedAt) return null;
  const start = new Date(state.plan.savedAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = programYearEnd(start);
  const totalDays = Math.max(1, daysBetween(start, end));
  const milestones: TimelineMilestone[] = [];

  if (state.plan.nextSmallStep.trim()) {
    milestones.push({
      kind: 'smallStep',
      label: 'צעד קטן ראשון',
      detail: state.plan.nextSmallStep.trim(),
      date: addDays(start, clamp(totalDays * 0.06, 7, 21)),
    });
  }
  if (state.plan.managers.trim()) {
    milestones.push({
      kind: 'managerTouch',
      label: 'שיחת מנהלים',
      detail: state.plan.managers.trim(),
      date: addDays(start, clamp(totalDays * 0.12, 10, 30)),
    });
  }
  if (state.plan.flexibility.trim()) {
    milestones.push({
      kind: 'flexibilityCheck',
      label: 'בדיקת גמישות',
      detail: state.plan.flexibility.trim(),
      date: addDays(start, totalDays * 0.5),
    });
  }

  const formative = formativeWindowAfter(start);
  milestones.push({ kind: 'formativeWindow', label: 'הערכה מעצבת', detail: 'חלון הגאנט הקבוע להערכה המעצבת.', date: formative.start, rangeEnd: formative.end });
  const summative = summativeWindowAfter(start);
  milestones.push({ kind: 'summativeWindow', label: 'הערכה מסכמת', detail: 'חלון הגאנט הקבוע להערכה המסכמת.', date: summative.start, rangeEnd: summative.end });

  milestones.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { start, end, now, milestones };
}

/** Position of a date along [start,end] as 0–100, clamped so an out-of-range date cannot overflow the track. */
export function timelinePercent(date: Date, start: Date, end: Date) {
  const total = Math.max(1, end.getTime() - start.getTime());
  return clamp(((date.getTime() - start.getTime()) / total) * 100, 0, 100);
}
