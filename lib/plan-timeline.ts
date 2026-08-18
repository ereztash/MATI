import type { MatiState, Plan } from './stages';
import { planSaved } from './stages';
import { extractCadenceDays, cadenceLabel } from './cadence';

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
  const start = new Date(state.plan.savedAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = programYearEnd(start);
  const totalDays = Math.max(1, daysBetween(start, end));
  const milestones: TimelineMilestone[] = [];

  if (state.plan.nextSmallStep.trim()) {
    const defaultDate = addDays(start, clamp(totalDays * 0.06, 7, 21));
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
    const defaultDate = addDays(start, clamp(totalDays * 0.12, 10, 30));
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
    const defaultDate = addDays(start, totalDays * 0.5);
    const override = overrideDate(state.plan.flexibilityCheckDate);
    milestones.push({
      kind: 'flexibilityCheck',
      label: 'בדיקת גמישות',
      detail: state.plan.flexibility.trim(),
      date: override ?? defaultDate,
      adjustable: { defaultDate, overrideKey: 'flexibilityCheckDate', adjusted: Boolean(override) },
    });
  }

  const formative = formativeWindowAfter(start);
  milestones.push({ kind: 'formativeWindow', label: 'הערכה מעצבת', detail: 'חלון הגאנט הקבוע להערכה המעצבת.', date: formative.start, rangeEnd: formative.end });
  const summative = summativeWindowAfter(start);
  milestones.push({ kind: 'summativeWindow', label: 'הערכה מסכמת', detail: 'חלון הגאנט הקבוע להערכה המסכמת.', date: summative.start, rangeEnd: summative.end });

  milestones.sort((a, b) => a.date.getTime() - b.date.getTime());

  const cadenceDays = extractCadenceDays(state.plan.timeframe);
  const cadence: GanttCadence | null = cadenceDays ? { intervalDays: cadenceDays, label: cadenceLabel(cadenceDays) } : null;

  return { start, end, now, milestones, cadence };
}

/** Position of a date along [start,end] as 0–100, clamped so an out-of-range date cannot overflow the track. */
export function timelinePercent(date: Date, start: Date, end: Date) {
  const total = Math.max(1, end.getTime() - start.getTime());
  return clamp(((date.getTime() - start.getTime()) / total) * 100, 0, 100);
}
