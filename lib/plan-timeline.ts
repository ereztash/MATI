import type { MatiState, Plan } from './stages';
import { planSaved } from './stages';
import { extractCadenceDays, cadenceLabel } from './cadence';
import { extractPlanWindow, PlanWindow } from './plan-window';

/**
 * Personalized Gantt derived from a saved Stage 1 plan.
 *
 * The base timeline adds no new schema fields on purpose: the start is
 * when the plan was committed (`plan.savedAt`), the end is the close of
 * the same program year the fixed macro Gantt already uses (see
 * stageFromDate in stages.ts and stageWindow in context-engine.ts), and
 * every milestone is read from a plan field that is already there. A
 * field left blank simply produces no milestone — nothing is guessed to
 * fill a gap.
 *
 * The three personal point-milestones (not the two fixed calendar
 * windows, which are an organizational fact, not a personal choice) are
 * adjustable: `plan.smallStepDate`/`managerTouchDate`/`flexibilityCheckDate`
 * hold an explicit ISO date once the mentor nudges the mark on the
 * timeline, overriding the computed default. Empty/unparseable falls back
 * to the default — this never blocks or invalidates the plan.
 *
 * `cadence` is read from `plan.timeframe` (see lib/cadence.ts) — a
 * recurring pattern, not enumerated occurrence dates, since a weekly
 * cadence over a ten-month span would be dozens of points on a 34px bar.
 */

export type TimelineMilestoneKind =
  | 'planWindow'
  | 'smallStep'
  | 'managerTouch'
  | 'flexibilityCheck'
  | 'formativeWindow'
  | 'summativeWindow';

// Extract<keyof Plan, ...> rather than a bare union: if these fields are ever
// renamed on Plan, this (and everything that keys off it) fails to compile.
export type PersonalMilestoneOverrideKey = Extract<keyof Plan, 'smallStepDate' | 'managerTouchDate' | 'flexibilityCheckDate'>;

export type TimelineMilestone = {
  kind: TimelineMilestoneKind;
  label: string;
  detail: string;
  date: Date;
  /** Present only for the two fixed calendar windows, which are ranges rather than points. */
  rangeEnd?: Date;
  /** Present only for the three personal point-milestones — the fixed windows are not adjustable. */
  adjustable?: { defaultDate: Date; overrideKey: PersonalMilestoneOverrideKey; adjusted: boolean };
};

export type GanttCadence = { intervalDays: number; label: string };

export type PersonalGantt = {
  start: Date;
  end: Date;
  now: Date;
  milestones: TimelineMilestone[];
  cadence: GanttCadence | null;
  /** The period she described in `timeframe`, when it named one she could be held to. */
  planWindow: PlanWindow | null;
};

const DAY_MS = 86_400_000;

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + Math.round(days) * DAY_MS);
}

/**
 * Calendar-date-only string (YYYY-MM-DD) in local time, for the override
 * fields. Deliberately not a full ISO timestamp: `new Date('2026-09-01')`
 * parses as UTC midnight, which can render as the previous day once
 * formatted back in a negative-UTC-offset local timezone — a full
 * round-trip through this pair of functions never touches that parser at
 * all, so the gotcha cannot occur regardless of where the app is used.
 */
export function toDateOnly(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** A valid override Date parsed from a strict YYYY-MM-DD string, or null when blank/anything else — falls back to the computed default either way. */
function overrideDate(value: string): Date | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, y, m, d] = match;
  const parsed = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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
  const savedAt = new Date(state.plan.savedAt);
  if (Number.isNaN(savedAt.getTime())) return null;

  // Her own stated period, when `timeframe` names one. A window that already
  // closed before she saved describes a period that is over — the same reason
  // a formative window that closed before `start` is omitted below — so it is
  // dropped rather than drawn behind her.
  const stated = extractPlanWindow(state.plan.timeframe, savedAt);
  const planWindow = stated && stated.end.getTime() >= savedAt.getTime() ? stated : null;

  // The axis has to contain everything drawn on it: her period may open before
  // she wrote the plan down, and the fixed evaluation windows run to the end of
  // the program year whatever she wrote.
  const start = planWindow ? new Date(Math.min(savedAt.getTime(), planWindow.start.getTime())) : savedAt;
  const end = new Date(Math.max(programYearEnd(savedAt).getTime(), planWindow?.end.getTime() ?? 0));

  // Personal milestones are placed inside HER period, not inside the program
  // year. Anchored no earlier than the save itself, so a "first small step" is
  // never scheduled before the plan it belongs to was written.
  const anchorStart = planWindow ? new Date(Math.max(planWindow.start.getTime(), savedAt.getTime())) : savedAt;
  const anchorEnd = planWindow ? planWindow.end : programYearEnd(savedAt);
  const totalDays = Math.max(1, daysBetween(anchorStart, anchorEnd));
  const milestones: TimelineMilestone[] = [];

  if (planWindow) {
    milestones.push({
      kind: 'planWindow',
      label: `מסגרת הזמן שלך · ${planWindow.label}`,
      detail: state.plan.timeframe.trim(),
      date: planWindow.start,
      rangeEnd: planWindow.end,
    });
  }

  if (state.plan.nextSmallStep.trim()) {
    const defaultDate = addDays(anchorStart, clamp(totalDays * 0.06, 7, 21));
    const override = overrideDate(state.plan.smallStepDate);
    milestones.push({
      kind: 'smallStep',
      label: 'צעד קטן ראשון',
      detail: state.plan.nextSmallStep.trim(),
      date: override ?? defaultDate,
      adjustable: { defaultDate, overrideKey: 'smallStepDate', adjusted: Boolean(override) },
    });
  }
  if (state.plan.managers.trim()) {
    const defaultDate = addDays(anchorStart, clamp(totalDays * 0.12, 10, 30));
    const override = overrideDate(state.plan.managerTouchDate);
    milestones.push({
      kind: 'managerTouch',
      label: 'שיחת מנהלים',
      detail: state.plan.managers.trim(),
      date: override ?? defaultDate,
      adjustable: { defaultDate, overrideKey: 'managerTouchDate', adjusted: Boolean(override) },
    });
  }
  if (state.plan.flexibility.trim()) {
    const defaultDate = addDays(anchorStart, totalDays * 0.5);
    const override = overrideDate(state.plan.flexibilityCheckDate);
    milestones.push({
      kind: 'flexibilityCheck',
      label: 'בדיקת גמישות',
      detail: state.plan.flexibility.trim(),
      date: override ?? defaultDate,
      adjustable: { defaultDate, overrideKey: 'flexibilityCheckDate', adjusted: Boolean(override) },
    });
  }

  // A plan (re-)saved after February — e.g. Stage 1 reopened manually during
  // the March–April calendar gap — belongs to a school year whose formative
  // window already closed before `start`. Showing it anyway would clamp both
  // ends to 0% and render a fabricated sliver at the very start, with legend
  // dates that fall outside the displayed axis; omit a window that closed
  // before the timeline even begins rather than fake its position.
  const formative = formativeWindowAfter(savedAt);
  if (formative.end.getTime() >= savedAt.getTime()) {
    milestones.push({ kind: 'formativeWindow', label: 'הערכה מעצבת', detail: 'חלון הגאנט הקבוע להערכה המעצבת.', date: formative.start, rangeEnd: formative.end });
  }
  const summative = summativeWindowAfter(savedAt);
  if (summative.end.getTime() >= savedAt.getTime()) {
    milestones.push({ kind: 'summativeWindow', label: 'הערכה מסכמת', detail: 'חלון הגאנט הקבוע להערכה המסכמת.', date: summative.start, rangeEnd: summative.end });
  }

  milestones.sort((a, b) => a.date.getTime() - b.date.getTime());

  const cadenceDays = extractCadenceDays(state.plan.timeframe);
  const cadence: GanttCadence | null = cadenceDays ? { intervalDays: cadenceDays, label: cadenceLabel(cadenceDays) } : null;

  return { start, end, now, milestones, cadence, planWindow };
}

/** Position of a date along [start,end] as 0–100, clamped so an out-of-range date cannot overflow the track. */
export function timelinePercent(date: Date, start: Date, end: Date) {
  const total = Math.max(1, end.getTime() - start.getTime());
  return clamp(((date.getTime() - start.getTime()) / total) * 100, 0, 100);
}
