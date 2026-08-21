import type { MatiState, Plan } from './stages';
import { planSaved } from './stages';
import { extractCadenceDays, cadenceLabel } from './cadence';
import { extractPlanWindow, PlanWindow } from './plan-window';
import { schoolYearPair } from './school-year';

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
  /** Present on every range rather than point: the two fixed calendar windows, and her own stated period. */
  rangeEnd?: Date;
  /**
   * How a range is drawn. Her period usually CONTAINS the evaluation windows,
   * so it reads as an outline around them rather than a fourth fill — a fourth
   * hue having already been rejected on contrast grounds. Carried here rather
   * than re-derived from `kind` in the view, which had to special-case it in
   * two separate places (the bar and the legend key).
   */
  band?: 'filled' | 'outline';
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
  /** Why `planWindow` is or is not set — the two null cases need different copy. */
  planWindowStatus: PlanWindowStatus;
};

/** 'used' — her months drive the chart. 'closed' — she named months, but that period is over. 'none' — she named none. */
export type PlanWindowStatus = 'used' | 'closed' | 'none';

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
  // closed before she saved describes a period that is over, so it is dropped
  // rather than drawn behind her — but WHY it was dropped is reported, because
  // "you named no months" and "the months you named are behind us" need
  // different things said back to her.
  const stated = extractPlanWindow(state.plan.timeframe, savedAt);
  const planWindow = stated && stated.end.getTime() >= savedAt.getTime() ? stated : null;
  const planWindowStatus: PlanWindowStatus = planWindow ? 'used' : stated ? 'closed' : 'none';

  // The axis has to contain everything drawn on it, and her period may open
  // before she wrote the plan down. It cannot END later: extractPlanWindow
  // anchors both months to the school year of the save, so the latest window it
  // can return closes on the same 30 June that programYearEnd does.
  const start = planWindow ? new Date(Math.min(savedAt.getTime(), planWindow.start.getTime())) : savedAt;
  const end = programYearEnd(savedAt);

  // Personal milestones are placed inside HER period, not inside the program
  // year. Anchored no earlier than the save itself, so a "first small step" is
  // never scheduled before the plan it belongs to was written.
  const anchorStart = planWindow ? new Date(Math.max(planWindow.start.getTime(), savedAt.getTime())) : savedAt;
  const anchorEnd = planWindow ? planWindow.end : programYearEnd(savedAt);
  const totalDays = Math.max(1, daysBetween(anchorStart, anchorEnd));

  /**
   * A suggested date, kept inside the period it is a suggestion about.
   *
   * The offsets carry a floor — at least a week for the first small step, ten
   * days before the manager conversation — so a suggestion is never the same
   * day as the save. Those floors used to win outright: re-saving a plan on 28
   * January whose window closes on 31 January produced 4 February and 7
   * February, marks sitting visibly outside the dashed band while the copy
   * above them promised the opposite. When there is less runway left than the
   * floor asks for, the honest answer is the end of the window, not a date past
   * it.
   */
  const within = (date: Date) => new Date(Math.min(Math.max(date.getTime(), anchorStart.getTime()), anchorEnd.getTime()));
  const milestones: TimelineMilestone[] = [];

  if (planWindow) {
    milestones.push({
      kind: 'planWindow',
      label: `מסגרת הזמן שלך · ${planWindow.label}`,
      detail: state.plan.timeframe.trim(),
      date: planWindow.start,
      rangeEnd: planWindow.end,
      band: 'outline',
    });
  }

  if (state.plan.nextSmallStep.trim()) {
    const defaultDate = within(addDays(anchorStart, clamp(totalDays * 0.06, 7, 21)));
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
    const defaultDate = within(addDays(anchorStart, clamp(totalDays * 0.12, 10, 30)));
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
    const defaultDate = within(addDays(anchorStart, totalDays * 0.5));
    const override = overrideDate(state.plan.flexibilityCheckDate);
    milestones.push({
      kind: 'flexibilityCheck',
      label: 'בדיקת גמישות',
      detail: state.plan.flexibility.trim(),
      date: override ?? defaultDate,
      adjustable: { defaultDate, overrideKey: 'flexibilityCheckDate', adjusted: Boolean(override) },
    });
  }

  // A window that closed before the timeline even begins would clamp both ends
  // to 0% and render a fabricated sliver at the very start, with legend dates
  // outside the displayed axis — so it is omitted rather than faked.
  //
  // Compared against `start`, not `savedAt`: those were the same thing until
  // her stated period was allowed to open the axis earlier, and comparing
  // against the save instead hid evaluation windows the axis displays perfectly
  // well. Measured: timeframe "ספטמבר–יוני" re-saved on 10 May draws an axis
  // from 1 September, and the formative window sits entirely inside it and was
  // dropped anyway.
  const formative = formativeWindowAfter(savedAt);
  if (formative.end.getTime() >= start.getTime()) {
    milestones.push({ kind: 'formativeWindow', label: 'הערכה מעצבת', detail: 'חלון הגאנט הקבוע להערכה המעצבת.', date: formative.start, rangeEnd: formative.end, band: 'filled' });
  }
  const summative = summativeWindowAfter(savedAt);
  if (summative.end.getTime() >= start.getTime()) {
    milestones.push({ kind: 'summativeWindow', label: 'הערכה מסכמת', detail: 'חלון הגאנט הקבוע להערכה המסכמת.', date: summative.start, rangeEnd: summative.end, band: 'filled' });
  }

  milestones.sort((a, b) => a.date.getTime() - b.date.getTime());

  const cadenceDays = extractCadenceDays(state.plan.timeframe);
  const cadence: GanttCadence | null = cadenceDays ? { intervalDays: cadenceDays, label: cadenceLabel(cadenceDays) } : null;

  return { start, end, now, milestones, cadence, planWindow, planWindowStatus };
}

/** Position of a date along [start,end] as 0–100, clamped so an out-of-range date cannot overflow the track. */
export function timelinePercent(date: Date, start: Date, end: Date) {
  const total = Math.max(1, end.getTime() - start.getTime());
  return clamp(((date.getTime() - start.getTime()) / total) * 100, 0, 100);
}
