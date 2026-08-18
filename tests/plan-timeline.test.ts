import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalGantt, timelinePercent, toDateOnly } from '../lib/plan-timeline';
import { emptyState, MatiState } from '../lib/stages';

const savedPlan = (overrides: Partial<MatiState['plan']> = {}, savedAt = '2026-08-10T09:00:00.000Z') => ({
  ...emptyState.plan,
  audience: 'צוותי מוקד', smartGoal: 'מטרה', metric1: 'מדד א', metric2: 'מדד ב', timeframe: 'ספטמבר–ינואר',
  ...overrides,
  savedAt,
});

const stateWith = (plan: MatiState['plan']): MatiState => ({ ...emptyState, plan });

test('returns null when the plan is not saved', () => {
  assert.equal(buildPersonalGantt(emptyState), null);
});

test('start is exactly plan.savedAt', () => {
  const gantt = buildPersonalGantt(stateWith(savedPlan()))!;
  assert.equal(gantt.start.toISOString(), '2026-08-10T09:00:00.000Z');
});

test('program-year end is June 30 of the following year for a plan saved in the Jul-Sep window', () => {
  const gantt = buildPersonalGantt(stateWith(savedPlan({}, '2026-08-10T09:00:00.000Z')))!;
  assert.equal(gantt.end.getFullYear(), 2027);
  assert.equal(gantt.end.getMonth(), 5); // June, 0-indexed
  assert.equal(gantt.end.getDate(), 30);
});

test('a plan saved via manual override in the Jan-Jun half still ends June 30 of that same year', () => {
  const gantt = buildPersonalGantt(stateWith(savedPlan({}, '2027-01-15T09:00:00.000Z')))!;
  assert.equal(gantt.end.getFullYear(), 2027);
  assert.equal(gantt.end.getMonth(), 5);
  assert.equal(gantt.end.getDate(), 30);
});

test('the formative window ends Feb 29 in a leap year and Feb 28 otherwise', () => {
  // A plan saved Aug 2026 -> formative window closes Feb 2027 (not a leap year).
  const nonLeap = buildPersonalGantt(stateWith(savedPlan({}, '2026-08-10T09:00:00.000Z')))!;
  const nonLeapFormative = nonLeap.milestones.find((m) => m.kind === 'formativeWindow')!;
  assert.equal(nonLeapFormative.rangeEnd!.getDate(), 28);

  // A plan saved Aug 2027 -> formative window closes Feb 2028 (a leap year).
  const leap = buildPersonalGantt(stateWith(savedPlan({}, '2027-08-10T09:00:00.000Z')))!;
  const leapFormative = leap.milestones.find((m) => m.kind === 'formativeWindow')!;
  assert.equal(leapFormative.rangeEnd!.getDate(), 29);
});

test('optional milestones appear only when their source field is filled in — nothing is invented', () => {
  const bare = buildPersonalGantt(stateWith(savedPlan()))!;
  assert.equal(bare.milestones.some((m) => m.kind === 'smallStep'), false);
  assert.equal(bare.milestones.some((m) => m.kind === 'managerTouch'), false);
  assert.equal(bare.milestones.some((m) => m.kind === 'flexibilityCheck'), false);
  // The two fixed calendar windows are always present regardless of plan content.
  assert.equal(bare.milestones.some((m) => m.kind === 'formativeWindow'), true);
  assert.equal(bare.milestones.some((m) => m.kind === 'summativeWindow'), true);

  const full = buildPersonalGantt(stateWith(savedPlan({
    nextSmallStep: 'לשוחח עם מורה אחת', managers: 'לתאם עם המנהלת', flexibility: 'לבדוק אחרי חודשיים',
  })))!;
  assert.equal(full.milestones.some((m) => m.kind === 'smallStep'), true);
  assert.equal(full.milestones.some((m) => m.kind === 'managerTouch'), true);
  assert.equal(full.milestones.some((m) => m.kind === 'flexibilityCheck'), true);
});

test('milestones are sorted chronologically', () => {
  const gantt = buildPersonalGantt(stateWith(savedPlan({
    nextSmallStep: 'צעד', managers: 'מנהלים', flexibility: 'גמישות',
  })))!;
  const times = gantt.milestones.map((m) => m.date.getTime());
  const sorted = [...times].sort((a, b) => a - b);
  assert.deepEqual(times, sorted);
});

test('a milestone that lands after the timeline end does not crash and clamps visually', () => {
  // Saved five days before the program-year end: the small-step offset (min 7 days) overshoots it.
  const gantt = buildPersonalGantt(stateWith(savedPlan({ nextSmallStep: 'צעד' }, '2027-06-25T09:00:00.000Z')))!;
  const smallStep = gantt.milestones.find((m) => m.kind === 'smallStep')!;
  assert.ok(smallStep.date.getTime() > gantt.end.getTime(), 'sanity: this case really does overshoot the end');
  assert.equal(timelinePercent(smallStep.date, gantt.start, gantt.end), 100);
});

test('the now parameter threads through unchanged, for the UI\'s today-marker', () => {
  const now = new Date('2026-09-01T12:00:00.000Z');
  const gantt = buildPersonalGantt(stateWith(savedPlan()), now)!;
  assert.equal(gantt.now.getTime(), now.getTime());
});

test('cadence is read from timeframe and absent when the text has no recognizable phrase', () => {
  const withCadence = buildPersonalGantt(stateWith(savedPlan({ timeframe: 'ספטמבר–ינואר, אחת לשבועיים' })))!;
  assert.deepEqual(withCadence.cadence, { intervalDays: 14, label: 'אחת לשבועיים' });

  const withoutCadence = buildPersonalGantt(stateWith(savedPlan({ timeframe: 'ספטמבר–ינואר' })))!;
  assert.equal(withoutCadence.cadence, null);
});

test('only the three personal milestones carry an adjustable override; the fixed windows never do', () => {
  const gantt = buildPersonalGantt(stateWith(savedPlan({
    nextSmallStep: 'צעד', managers: 'מנהלים', flexibility: 'גמישות',
  })))!;
  const byKind = Object.fromEntries(gantt.milestones.map((m) => [m.kind, m]));
  assert.equal(byKind.smallStep.adjustable?.overrideKey, 'smallStepDate');
  assert.equal(byKind.managerTouch.adjustable?.overrideKey, 'managerTouchDate');
  assert.equal(byKind.flexibilityCheck.adjustable?.overrideKey, 'flexibilityCheckDate');
  assert.equal(byKind.formativeWindow.adjustable, undefined);
  assert.equal(byKind.summativeWindow.adjustable, undefined);
  // None of the three overrides is set in this fixture, so none reads as adjusted yet.
  assert.equal(byKind.smallStep.adjustable?.adjusted, false);
  assert.equal(byKind.managerTouch.adjustable?.adjusted, false);
  assert.equal(byKind.flexibilityCheck.adjustable?.adjusted, false);
});

test('toDateOnly and the override parser round-trip to the exact same calendar day', () => {
  const chosen = new Date(2026, 8, 1); // Sep 1 2026, local time
  const stored = toDateOnly(chosen);
  assert.equal(stored, '2026-09-01');
  const gantt = buildPersonalGantt(stateWith(savedPlan({ nextSmallStep: 'צעד', smallStepDate: stored })))!;
  const smallStep = gantt.milestones.find((m) => m.kind === 'smallStep')!;
  assert.equal(smallStep.date.getFullYear(), 2026);
  assert.equal(smallStep.date.getMonth(), 8); // September, 0-indexed
  assert.equal(smallStep.date.getDate(), 1);
  assert.equal(smallStep.adjustable?.adjusted, true);
  // The default is still exposed (for a "reset to suggested" affordance) and differs from the chosen date.
  assert.notEqual(smallStep.adjustable!.defaultDate.getTime(), smallStep.date.getTime());
});

test('a full ISO timestamp is rejected, not silently accepted — only the strict YYYY-MM-DD form is a valid override', () => {
  const gantt = buildPersonalGantt(stateWith(savedPlan({ nextSmallStep: 'צעד', smallStepDate: '2026-09-01T00:00:00.000Z' })))!;
  const smallStep = gantt.milestones.find((m) => m.kind === 'smallStep')!;
  assert.equal(smallStep.adjustable?.adjusted, false);
});

test('an unparseable or blank override falls back to the computed default without crashing', () => {
  const blank = buildPersonalGantt(stateWith(savedPlan({ managers: 'מנהלים', managerTouchDate: '' })))!;
  const garbage = buildPersonalGantt(stateWith(savedPlan({ managers: 'מנהלים', managerTouchDate: 'not-a-date' })))!;
  const baseline = buildPersonalGantt(stateWith(savedPlan({ managers: 'מנהלים' })))!;
  const at = (g: typeof baseline) => g.milestones.find((m) => m.kind === 'managerTouch')!.date.getTime();
  assert.equal(at(blank), at(baseline));
  assert.equal(at(garbage), at(baseline));
});

test('timelinePercent is monotonic and clamped to 0–100', () => {
  const start = new Date('2026-08-01T00:00:00.000Z');
  const end = new Date('2027-06-30T00:00:00.000Z');
  const before = new Date('2026-01-01T00:00:00.000Z');
  const mid = new Date('2027-01-15T00:00:00.000Z');
  const after = new Date('2028-01-01T00:00:00.000Z');
  assert.equal(timelinePercent(before, start, end), 0);
  assert.equal(timelinePercent(after, start, end), 100);
  const midPct = timelinePercent(mid, start, end);
  assert.ok(midPct > 0 && midPct < 100);
  assert.ok(timelinePercent(start, start, end) < midPct);
});
