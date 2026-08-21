import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalGantt, timelinePercent, toDateOnly } from '../lib/plan-timeline';
import { emptyState, MatiState } from '../lib/stages';
import { migrateState } from '../lib/state-storage';

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

test('the axis opens at the earlier of the save and the period she named', () => {
  // Named for the rule rather than for the fixture. This asserted "start is
  // exactly plan.savedAt", which stopped being true when her stated period was
  // allowed to open the axis — and kept passing, because the default fixture
  // pairs "ספטמבר–ינואר" with an August save, where the save happens to be the
  // earlier of the two. "יולי–ינואר" is an equally ordinary answer (the pilot's
  // planning window opens in July) and the old assertion is false for it.
  const windowOpensLater = buildPersonalGantt(stateWith(savedPlan()))!;
  assert.equal(windowOpensLater.start.toISOString(), '2026-08-10T09:00:00.000Z', 'the save is earlier here');

  const windowOpensFirst = buildPersonalGantt(stateWith(savedPlan({ timeframe: 'יולי–ינואר' })))!;
  assert.equal(toDateOnly(windowOpensFirst.start), '2026-07-01', 'her period is earlier here');

  const noWindow = buildPersonalGantt(stateWith(savedPlan({ timeframe: 'נתחיל אחרי החגים' })))!;
  assert.equal(noWindow.start.toISOString(), '2026-08-10T09:00:00.000Z', 'and with no period named, the save decides');
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

test('a window that already closed before the timeline starts is omitted, not faked at 0%', () => {
  // Stage 1 is always open (canOpenStage(1,...) === true), so a plan can be
  // (re-)saved during March-April — the calendar gap right after the
  // formative window's own Dec-Feb close. That formative window belongs
  // entirely to the past relative to this new start date; showing it would
  // clamp both ends to 0% and render a fabricated sliver, with legend dates
  // outside the displayed axis.
  const midGap = buildPersonalGantt(stateWith(savedPlan({}, '2027-03-15T09:00:00.000Z')))!;
  assert.equal(midGap.milestones.some((m) => m.kind === 'formativeWindow'), false);
  // The summative window (May-Jun of the same year) is still ahead of March, so it stays.
  assert.equal(midGap.milestones.some((m) => m.kind === 'summativeWindow'), true);

  // The ordinary Jul-Sep save keeps both fixed windows, as already covered
  // by 'optional milestones appear only when their source field is filled
  // in' above — this test only needs to prove the gap case is the
  // exception, not the rule.
  const normal = buildPersonalGantt(stateWith(savedPlan({}, '2026-08-10T09:00:00.000Z')))!;
  assert.equal(normal.milestones.some((m) => m.kind === 'formativeWindow'), true);
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

test('a suggested milestone never overshoots the period it is a suggestion about', () => {
  // The offsets carry floors — at least a week before the first small step, ten
  // days before the manager conversation — so a suggestion is never the same
  // day as the save. Those floors used to win outright: saved five days before
  // the program-year end, or re-saved three days before her own window closes,
  // and the suggestion landed past the end. On the axis it clamped to 100%; in
  // the dashed band it simply sat outside, under copy promising the opposite.
  const nearProgramEnd = buildPersonalGantt(stateWith(savedPlan({ nextSmallStep: 'צעד' }, '2027-06-25T09:00:00.000Z')))!;
  const step = nearProgramEnd.milestones.find((m) => m.kind === 'smallStep')!;
  assert.ok(step.date.getTime() <= nearProgramEnd.end.getTime());
  assert.equal(timelinePercent(step.date, nearProgramEnd.start, nearProgramEnd.end), 100, 'and lands exactly at the end of the axis');

  const nearWindowEnd = buildPersonalGantt(stateWith(savedPlan(
    { timeframe: 'ספטמבר–ינואר', nextSmallStep: 'צעד', managers: 'מנהלת' },
    '2027-01-28T09:00:00.000Z',
  )))!;
  for (const milestone of nearWindowEnd.milestones.filter((m) => m.adjustable)) {
    assert.ok(milestone.date.getTime() <= nearWindowEnd.planWindow!.end.getTime(),
      `${milestone.label} (${toDateOnly(milestone.date)}) falls past a window closing on 2027-01-31`);
  }
});

test('an override she chose herself is respected even outside the range, and clamps visually', () => {
  // Deliberate: the adjust panel nudges by days, and refusing a date she picked
  // would be a validation gate this product does not have anywhere else.
  // timelinePercent is what keeps it drawable.
  const gantt = buildPersonalGantt(stateWith(savedPlan({ nextSmallStep: 'צעד', smallStepDate: '2028-01-01' })))!;
  const smallStep = gantt.milestones.find((m) => m.kind === 'smallStep')!;
  assert.ok(smallStep.date.getTime() > gantt.end.getTime(), 'sanity: this override really is past the end');
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

/* ------------------------------------------------------------------------- *
 * Where the programme year begins, and which fixed windows still lie ahead.
 * All four boundaries below were unconstrained until a mutation sweep found
 * them; each one silently moves a whole year's timeline rather than failing.
 * ------------------------------------------------------------------------- */

const completePlan = { audience: 'מחנכות', smartGoal: 'מטרה', metric1: 'מדד א', metric2: 'מדד ב', timeframe: 'ספטמבר–ינואר' };
const ganttSavedAt = (date: Date) => buildPersonalGantt(migrateState({ plan: { ...completePlan, savedAt: date.toISOString() } }));

test('the programme year turns over in July, not in June', () => {
  // A plan saved in June belongs to the year that is ending; one saved in July
  // opens the next. Shifting this by a month re-dates every mark on the chart.
  assert.equal(ganttSavedAt(new Date(2026, 5, 15, 10))!.end.getFullYear(), 2026, 'June belongs to the closing year');
  assert.equal(ganttSavedAt(new Date(2026, 6, 15, 10))!.end.getFullYear(), 2027, 'July opens the next one');
});

test('a stamp on an incomplete plan does not produce a timeline', () => {
  // Both halves of the guard matter: `savedAt` can be present on a plan that no
  // longer passes planReady — she saved, then cleared a required field — and a
  // timeline drawn from that would be anchored to a plan that does not exist.
  assert.equal(buildPersonalGantt(migrateState({ plan: { audience: 'מחנכות', savedAt: '2026-07-15T10:00:00.000Z' } })), null);
  assert.equal(buildPersonalGantt(migrateState({ plan: completePlan })), null, 'and an unsaved complete plan has no timeline either');
});

test('a fixed window that closes exactly as the timeline opens is still shown', () => {
  // The rule is "omit a window that closed BEFORE the timeline begins". Saving
  // at the final millisecond of a window is the one moment where inclusive and
  // exclusive differ, and it is the difference between showing her the window
  // she is standing in and hiding it.
  const kindsAt = (date: Date) => ganttSavedAt(date)!.milestones.map((m) => m.kind);
  const lastMomentOfFormative = new Date(2027, 1, 28, 23, 59, 59, 999);
  assert.ok(kindsAt(lastMomentOfFormative).includes('formativeWindow'));
  assert.ok(!kindsAt(new Date(lastMomentOfFormative.getTime() + 1)).includes('formativeWindow'),
    'one millisecond later it has closed and is omitted');

  const lastMomentOfSummative = new Date(2027, 5, 30, 23, 59, 59, 999);
  assert.ok(kindsAt(lastMomentOfSummative).includes('summativeWindow'));
  assert.deepEqual(kindsAt(lastMomentOfSummative), ['summativeWindow'],
    'and by then the formative window of that year is long closed');
});

/**
 * The timeframe field is the one place she states when her work happens, and
 * for a long time the Gantt read it only for a cadence phrase and threw the
 * months away. Measured before this was fixed: "ספטמבר–ינואר",
 * "אוקטובר–דצמבר", "לאורך כל השנה" and "נתחיל אחרי החגים" produced a
 * byte-identical chart — same axis, and the three "personal" milestones on the
 * same three dates, because their defaults were fixed proportions of the
 * program year. A מדריכה who wrote "אוקטובר–דצמבר" was shown her first small
 * step on 3 September, before her own plan begins.
 */
const withTimeframe = (timeframe: string) => buildPersonalGantt(stateWith(savedPlan({
  timeframe, nextSmallStep: 'לשבת עם רכזת השכבה', managers: 'מנהלת בית הספר', flexibility: 'נעבור לליווי פרטני',
})))!;
const personalDates = (g: ReturnType<typeof withTimeframe>) =>
  g.milestones.filter((m) => m.adjustable).map((m) => toDateOnly(m.date));

test('two different timeframes produce two different Gantts', () => {
  const autumn = withTimeframe('ספטמבר–ינואר, אחת לשבועיים');
  const winter = withTimeframe('אוקטובר–דצמבר, אחת לשבוע');

  assert.notDeepEqual(personalDates(autumn), personalDates(winter),
    'the personal milestones must move with the period she described');
  assert.deepEqual(
    [autumn.planWindow && toDateOnly(autumn.planWindow.start), winter.planWindow && toDateOnly(winter.planWindow.start)],
    ['2026-09-01', '2026-10-01'],
  );
});

test('every personal milestone falls inside the period she described', () => {
  // Several saves, not one. A single early save inside a 92-day window is the
  // case where every offset lands inside no matter what the code does — the
  // property only breaks when there is less runway left than the offset floors
  // ask for, which is a late save, so a one-fixture version of this test could
  // not fail on the bug it is named for.
  const cases: Array<[string, string]> = [
    ['אוקטובר–דצמבר', '2026-08-10T09:00:00.000Z'],
    ['ספטמבר–ינואר', '2027-01-28T09:00:00.000Z'],
    ['ספטמבר–דצמבר', '2026-12-27T09:00:00.000Z'],
    ['ספטמבר–ינואר', '2027-01-31T09:00:00.000Z'],
  ];
  for (const [timeframe, savedAt] of cases) {
    const gantt = buildPersonalGantt(stateWith(savedPlan(
      { timeframe, nextSmallStep: 'לשבת עם רכזת', managers: 'מנהלת', flexibility: 'ליווי פרטני' }, savedAt,
    )))!;
    const window = gantt.planWindow!;
    for (const milestone of gantt.milestones.filter((m) => m.adjustable)) {
      assert.ok(milestone.date.getTime() >= window.start.getTime(),
        `${timeframe} saved ${savedAt.slice(0, 10)}: ${milestone.label} (${toDateOnly(milestone.date)}) starts before her plan does`);
      assert.ok(milestone.date.getTime() <= window.end.getTime(),
        `${timeframe} saved ${savedAt.slice(0, 10)}: ${milestone.label} (${toDateOnly(milestone.date)}) falls after her plan ends`);
    }
  }
});

test('the flexibility check lands mid-course, not at the front with the others', () => {
  // The three personal offsets are proportions of her period — roughly 6%, 12%
  // and 50% — with day floors underneath so a suggestion is never the same day
  // as the save. Only the floors were pinned: replacing the proportional part
  // entirely left the suite green, and "בדיקת גמישות" would have collapsed to
  // the first week alongside the other two. A mid-course check that happens in
  // week one is not a mid-course check.
  const gantt = buildPersonalGantt(stateWith(savedPlan({
    timeframe: 'ספטמבר–ינואר', nextSmallStep: 'לשבת עם רכזת', managers: 'מנהלת', flexibility: 'ליווי פרטני',
  })))!;
  const window = gantt.planWindow!;
  const at = (kind: string) => gantt.milestones.find((m) => m.kind === kind)!.date.getTime();
  const span = window.end.getTime() - window.start.getTime();
  const share = (kind: string) => (at(kind) - window.start.getTime()) / span;

  assert.ok(at('smallStep') < at('managerTouch'), 'the first small step comes before the manager conversation');
  assert.ok(at('managerTouch') < at('flexibilityCheck'), 'and both come well before the mid-course check');
  assert.ok(share('flexibilityCheck') > 0.4 && share('flexibilityCheck') < 0.6,
    `the flexibility check should sit near the middle of her period, sat at ${(share('flexibilityCheck') * 100).toFixed(0)}%`);
  assert.ok(share('managerTouch') < 0.25, 'and the manager conversation in its opening quarter');
});

test('an evaluation window the axis can show is shown, even when it closed before she saved', () => {
  // Regression from the commit that introduced planWindow: these guards were
  // changed from comparing against the axis start to comparing against the
  // save, which were the same thing until her period was allowed to open the
  // axis earlier. Measured: "ספטמבר–יוני" re-saved on 10 May draws an axis from
  // 1 September, and the formative window sat entirely inside it and was
  // dropped anyway — an organizational fact silently missing from a chart that
  // displays it correctly.
  const reSavedInMay = buildPersonalGantt(stateWith(savedPlan({ timeframe: 'ספטמבר–יוני' }, '2027-05-10T09:00:00.000Z')))!;
  const kinds = reSavedInMay.milestones.map((m) => m.kind);
  assert.ok(kinds.includes('formativeWindow'), 'Dec–Feb sits inside an axis that starts in September');
  assert.ok(kinds.includes('summativeWindow'));

  // …and one that closed before the axis itself begins is still omitted.
  const noWindowNamed = buildPersonalGantt(stateWith(savedPlan({ timeframe: 'נתחיל אחרי החגים' }, '2027-05-10T09:00:00.000Z')))!;
  assert.ok(!noWindowNamed.milestones.some((m) => m.kind === 'formativeWindow'),
    'with the axis starting at the May save, the formative window really is behind it');
});

test('why a stated period was not used is reported, not just that it was not', () => {
  // "You named no months" and "the months you named are behind us" need
  // different things said back to her: the first asks her to write a range, and
  // telling that to someone who wrote "ספטמבר–נובמבר" in March is both false
  // about her input and unactionable.
  assert.equal(buildPersonalGantt(stateWith(savedPlan({ timeframe: 'ספטמבר–ינואר' })))!.planWindowStatus, 'used');
  assert.equal(buildPersonalGantt(stateWith(savedPlan({ timeframe: 'נתחיל אחרי החגים' })))!.planWindowStatus, 'none');
  assert.equal(buildPersonalGantt(stateWith(savedPlan(
    { timeframe: 'ספטמבר–נובמבר' }, '2027-03-01T09:00:00.000Z',
  )))!.planWindowStatus, 'closed');
});

test('a maqaf between the months reads the same as a dash', () => {
  // The two readers of plan.timeframe share one tokenizer now. They did not,
  // and the separator list they each carried privately omitted the maqaf ־ —
  // which this codebase emits itself in the Gantt's own aria-label.
  const maqaf = buildPersonalGantt(stateWith(savedPlan({ timeframe: 'ספטמבר־ינואר, אחת לשבועיים' })))!;
  assert.equal(toDateOnly(maqaf.planWindow!.start), '2026-09-01');
  assert.equal(maqaf.cadence?.label, 'אחת לשבועיים');
});

test('a milestone is never scheduled before the plan it belongs to was written', () => {
  // She writes "ספטמבר–ינואר" but only saves in November: the window opened
  // two months ago, and a "first small step" dated September would be advice
  // about a date that has already passed.
  const late = buildPersonalGantt(stateWith(savedPlan(
    { timeframe: 'ספטמבר–ינואר', nextSmallStep: 'לשבת עם רכזת השכבה' },
    '2026-11-20T09:00:00.000Z',
  )))!;
  const smallStep = late.milestones.find((m) => m.kind === 'smallStep')!;
  assert.ok(smallStep.date.getTime() >= new Date('2026-11-20T09:00:00.000Z').getTime());
});

test('a timeframe naming no months falls back rather than inventing a window', () => {
  const vague = withTimeframe('נתחיל אחרי החגים ונראה איך זה זורם');
  assert.equal(vague.planWindow, null);
  assert.deepEqual(personalDates(vague), personalDates(withTimeframe('לאורך כל השנה, אחת לחודש')),
    'both fall back to the same program-year placement, which is the documented behaviour when she named no period');
  assert.ok(vague.milestones.some((m) => m.kind === 'formativeWindow'), 'and the fixed windows are unaffected');
});

test('a period that closed before she saved is not drawn behind her', () => {
  const stale = buildPersonalGantt(stateWith(savedPlan(
    { timeframe: 'ספטמבר–נובמבר' },
    '2027-03-01T09:00:00.000Z',
  )))!;
  assert.equal(stale.planWindow, null);
  assert.ok(!stale.milestones.some((m) => m.kind === 'planWindow'));
});

test('the axis contains everything drawn on it', () => {
  for (const timeframe of ['ספטמבר–ינואר', 'אוקטובר–דצמבר', 'יולי–יוני', 'נתחיל אחרי החגים']) {
    const gantt = withTimeframe(timeframe);
    for (const milestone of gantt.milestones) {
      assert.ok(milestone.date.getTime() >= gantt.start.getTime(),
        `${timeframe}: ${milestone.label} starts before the axis`);
      assert.ok((milestone.rangeEnd ?? milestone.date).getTime() <= gantt.end.getTime(),
        `${timeframe}: ${milestone.label} ends after the axis`);
    }
  }
});

test('a plan saved in July anchors to the school year that July opens', () => {
  // schoolYearPair's boundary, reached by the most ordinary save there is: the
  // pilot's planning window is July–September. One month off here dates the
  // evaluation windows a full year early.
  const july = buildPersonalGantt(stateWith(savedPlan({ timeframe: 'ספטמבר–ינואר' }, '2026-07-03T09:00:00.000Z')))!;
  assert.equal(toDateOnly(july.planWindow!.start), '2026-09-01');
  assert.equal(toDateOnly(july.milestones.find((m) => m.kind === 'formativeWindow')!.date), '2026-12-01');
  assert.equal(toDateOnly(july.end), '2027-06-30');
});

test('an unreadable savedAt produces no Gantt rather than an invalid one', () => {
  assert.equal(buildPersonalGantt(stateWith(savedPlan({}, 'לא תאריך'))), null);
});
