import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextSnapshot, calendarContext, daypartFromHour, deriveCoachStrategy, findContradictions, greetingForDaypart, UsageContext } from '../lib/context-engine';
import { analyzeInteraction, emptyState } from '../lib/stages';
import { migrateState } from '../lib/state-storage';

/** Usage fixture anchored to `now`, so an unrelated long-session signal cannot leak in. */
function usageAt(now: Date, overrides: Partial<UsageContext> = {}): UsageContext {
  return {
    sessionStartedAt: now.toISOString(), visitCount: 1, interactionCount: 0,
    device: 'desktop', touch: false, width: 1400, ...overrides,
  };
}

test('daypart and greeting cover the whole clock', () => {
  // Every hour, not seven samples. The previous version tested one hour from
  // the middle of each band — which is every hour at which the function cannot
  // be wrong — so all ten of its comparisons could be shifted by one and the
  // suite stayed green (verified by mutation, 2026-08-20). A band's edges are
  // the only place a daypart rule has ever been wrong, and the greeting shown
  // at 08:59 versus 09:00 is the whole visible behaviour of this function.
  assert.deepEqual(
    Array.from({ length: 24 }, (_, hour) => daypartFromHour(hour)),
    [
      'late', 'late', 'late', 'late', 'late',                  // 00-04
      'early', 'early', 'early', 'early',                      // 05-08
      'morning', 'morning', 'morning',                         // 09-11
      'midday', 'midday', 'midday',                            // 12-14
      'afternoon', 'afternoon', 'afternoon',                   // 15-17
      'evening', 'evening', 'evening', 'evening',              // 18-21
      'late', 'late',                                          // 22-23
    ],
  );
  assert.equal(greetingForDaypart('morning'), 'בוקר טוב');
  assert.equal(greetingForDaypart('afternoon'), 'צהריים טובים');
  assert.equal(greetingForDaypart('evening'), 'ערב טוב');
  assert.equal(greetingForDaypart('late'), 'שלום');
});

test('stage 1 window runs July to the end of September', () => {
  assert.equal(calendarContext(new Date(2026, 6, 2), 1).stagePosition, 'early');
  assert.equal(calendarContext(new Date(2026, 7, 15), 1).stagePosition, 'middle');
  const late = calendarContext(new Date(2026, 8, 25), 1);
  assert.equal(late.stagePosition, 'closing');
  assert.equal(late.daysToStageEnd, 6);
  assert.equal(calendarContext(new Date(2026, 8, 30), 1).daysToStageEnd, 1);
});

test('the formative window crosses the calendar year in both directions', () => {
  // Entered in December: the window ends in February of the following year.
  const december = calendarContext(new Date(2026, 11, 3), 2);
  assert.equal(december.stagePosition, 'early');
  assert.equal(december.daysToStageEnd, 88, 'Dec 3 2026 → Feb 28 2027');

  // Entered in January or February: the window started in the previous December.
  assert.equal(calendarContext(new Date(2027, 0, 15), 2).stagePosition, 'middle');
  const february = calendarContext(new Date(2027, 1, 26), 2);
  assert.equal(february.stagePosition, 'closing');
  assert.equal(february.daysToStageEnd, 3);
});

test('the formative window extends to February 29 in a leap year', () => {
  assert.equal(calendarContext(new Date(2028, 1, 28), 2).daysToStageEnd, 2, '2028 is a leap year');
  assert.equal(calendarContext(new Date(2027, 1, 27), 2).daysToStageEnd, 2, '2027 is not');
  assert.equal(calendarContext(new Date(2028, 1, 29), 2).daysToStageEnd, 1);
});

test('a date outside every window reports no stage position', () => {
  const between = calendarContext(new Date(2026, 9, 15), null);
  assert.equal(between.stagePosition, 'between');
  assert.equal(between.daysToStageEnd, null);
});

test('findContradictions only fires when two answers genuinely disagree', () => {
  const contradictory = migrateState({
    formative: { answers: { q1: { implementationPercent: '90' }, q7: { independence: 'none' } } },
  });
  assert.equal(findContradictions(contradictory).length, 1);

  const consistent = migrateState({
    formative: { answers: { q1: { implementationPercent: '90' }, q7: { independence: 'all' } } },
  });
  assert.deepEqual(findContradictions(consistent), []);
  assert.deepEqual(findContradictions(emptyState), []);

  const manyMeetingsNoDepth = migrateState({ formative: { answers: { q3: { meetingRate: '90-100', depth: 'shallow' } } } });
  assert.equal(findContradictions(manyMeetingsNoDepth).length, 1);
});

test('a contradiction becomes a strong signal and drives the ribbon headline', () => {
  const state = migrateState({ formative: { answers: { q1: { implementationPercent: '90' }, q7: { continuesWithoutDependency: 'no' } } } });
  const now = new Date(2027, 0, 15, 10);
  const snapshot = buildContextSnapshot({
    state, activeStage: 2, automaticStage: 2, profile: analyzeInteraction(state), usage: usageAt(now), now,
  });
  assert.ok(snapshot.contradictions.length > 0);
  assert.ok(snapshot.signals.some((s) => s.id.startsWith('discrepancy-') && s.strength === 'strong'));
  assert.equal(deriveCoachStrategy(snapshot).headline, 'יש כאן פער ששווה לעצור עליו לפני שממשיכים.');
});

test('analyzeInteraction reads system fields as if they were answers (defect, see re-review)', () => {
  // collectStrings walks the whole state, so `formative.route` ('short') and the
  // savedAt stamps are counted alongside real answers. An untouched app therefore
  // already infers that the instructor is replying tersely.
  const untouched = analyzeInteraction(emptyState);
  assert.equal(untouched.responseCount, 1, "the route id 'short' is read as a response");
  assert.equal(untouched.pace, 'compact', 'which makes an empty state look like one-word replies');

  const justSaved = analyzeInteraction(migrateState({ plan: { savedAt: '2026-01-05T10:00:00.000Z' } }));
  assert.equal(justSaved.responseCount, 2, 'the ISO stamp is counted as a second response');
});

test('a late hour alone is never enough to change the coaching mode', () => {
  const now = new Date(2026, 7, 15, 23);
  // Real prose of a normal length, so the pace reading is 'balanced' and the only
  // thing under test is the late-hour rule itself.
  const prose = 'א'.repeat(120);
  const state = migrateState({ plan: { flexibility: prose, identityFit: prose } });
  const base = {
    state, activeStage: 1 as const, automaticStage: 1 as const, profile: analyzeInteraction(state), now,
  };
  assert.equal(analyzeInteraction(state).pace, 'balanced', 'fixture guard');

  const desktop = deriveCoachStrategy(buildContextSnapshot({ ...base, usage: usageAt(now) }));
  assert.equal(desktop.intensity, 'balanced', 'a weak signal on its own must not narrow the session');

  const onPhone = deriveCoachStrategy(buildContextSnapshot({ ...base, usage: usageAt(now, { device: 'mobile', width: 380, touch: true }) }));
  assert.equal(onPhone.intensity, 'light', 'late plus a small screen together do');
  assert.equal(onPhone.preferredInput, 'closed-first');
});

test('closing a stage window pulls the session back from deep mode', () => {
  const state = migrateState({ plan: { flexibility: 'א'.repeat(400) } });
  const now = new Date(2026, 8, 27, 10);
  const snapshot = buildContextSnapshot({
    state, activeStage: 1, automaticStage: 1, profile: analyzeInteraction(state), usage: usageAt(now), now,
  });
  assert.equal(snapshot.calendar.stagePosition, 'closing');
  const strategy = deriveCoachStrategy(snapshot);
  assert.notEqual(strategy.intensity, 'deep');
  assert.notEqual(strategy.density, 'expanded');
});

/* ------------------------------------------------------------------------- *
 * The engine's decision rules.
 *
 * A mutation sweep found that two of the four contradiction rules had no test
 * at all, that the two which did were covered by one combination each out of
 * the several their `||` branches allow, and that every threshold in the
 * snapshot and the strategy could be shifted by one without a failure. These
 * rules are the whole of what the ribbon says to her, so an inverted one does
 * not crash — it gives confident advice about a gap that is not there, or stays
 * silent about one that is.
 * ------------------------------------------------------------------------- */

const answersOf = (answers: Record<string, unknown>) => migrateState({ formative: { answers } });
const contradictionCount = (answers: Record<string, unknown>) => findContradictions(answersOf(answers)).length;

test('every contradiction rule fires on each of its combinations, and on none of its near misses', () => {
  const CASES: Array<[string, Record<string, unknown>, number]> = [
    // High implementation beside low independence — any of the three ways the
    // instrument can report "the ownership has not moved".
    ['implementation 80 with no independence', { q1: { implementationPercent: '80' }, q7: { independence: 'none' } }, 1],
    ['implementation 80 with partial independence', { q1: { implementationPercent: '80' }, q7: { independence: 'partial' } }, 1],
    ['implementation 80 that stops without her', { q1: { implementationPercent: '80' }, q7: { continuesWithoutDependency: 'no' } }, 1],
    ['79 is not yet "high implementation"', { q1: { implementationPercent: '79' }, q7: { independence: 'none' } }, 0],
    ['high implementation with full independence agrees with itself', { q1: { implementationPercent: '80' }, q7: { independence: 'all' } }, 0],

    // Meetings happened but the work did not go deep.
    ['almost every meeting, shallow depth', { q3: { meetingRate: '90-100', depth: 'shallow' } }, 1],
    ['most meetings, partial depth', { q3: { meetingRate: '70-90', depth: 'partial' } }, 1],
    ['few meetings and shallow depth is consistent, not contradictory', { q3: { meetingRate: 'under70', depth: 'shallow' } }, 0],
    ['almost every meeting with consistent depth', { q3: { meetingRate: '90-100', depth: 'consistent' } }, 0],

    // Managers said yes and then did not fund it. Untested until now.
    ['committed managers, no resources', { q6: { managerCommitment: 'high', resourcesAllocated: 'no' } }, 1],
    ['committed managers, partial resources', { q6: { managerCommitment: 'high', resourcesAllocated: 'partial' } }, 1],
    ['uncommitted managers not allocating is no contradiction', { q6: { managerCommitment: 'low', resourcesAllocated: 'no' } }, 0],
    ['committed managers who allocated', { q6: { managerCommitment: 'high', resourcesAllocated: 'yes' } }, 0],

    // "He works independently" beside "it stops without me". Untested until now.
    ['independent frequency, no independence', { q2: { frequency: 'independent' }, q7: { independence: 'none' } }, 1],
    ['independent frequency that stops without her', { q2: { frequency: 'independent' }, q7: { continuesWithoutDependency: 'no' } }, 1],
    ['regular-but-not-independent frequency', { q2: { frequency: 'regular' }, q7: { independence: 'none' } }, 0],
    ['independent on both readings', { q2: { frequency: 'independent' }, q7: { independence: 'all' } }, 0],
  ];

  for (const [label, answers, expected] of CASES) {
    assert.equal(contradictionCount(answers), expected, label);
  }
});

test('stage position turns over on one specific day, at both ends of the window', () => {
  // early → middle at 28% of the window, middle → closing at 72%. The position
  // decides whether the session opens up or is pulled towards closing, so a
  // boundary that drifts moves that behaviour by days without any visible change.
  const positionOn = (month: number, day: number) => calendarContext(new Date(2026, month, day, 12), 1).stagePosition;
  assert.equal(positionOn(6, 26), 'early', '26 July is the last early day');
  assert.equal(positionOn(6, 27), 'middle');
  assert.equal(positionOn(8, 4), 'middle', '4 September is the last middle day');
  assert.equal(positionOn(8, 5), 'closing');
});

test('the calendar signal distinguishes agreement, disagreement and no window at all', () => {
  // Three different states, and only two of them say anything: when the stage
  // she is working on is not the one the calendar points at, the engine stays
  // quiet rather than arguing with her choice.
  const now = new Date(2026, 7, 15, 10);
  const idsFor = (activeStage: 1 | 2, automaticStage: 1 | null) => buildContextSnapshot({
    state: emptyState, activeStage, automaticStage, profile: analyzeInteraction(emptyState), usage: usageAt(now), now,
  }).signals.map((s) => s.id);

  assert.ok(idsFor(1, 1).includes('calendar-stage'), 'agreement is stated');
  assert.ok(!idsFor(2, 1).includes('calendar-stage'), 'a stage she chose against the calendar is not contradicted');
  assert.ok(!idsFor(2, 1).includes('calendar-between'));
  assert.ok(idsFor(1, null).includes('calendar-between'), 'a gap is stated as a gap');
});

test('the return-gap and long-session thresholds are exact', () => {
  const now = new Date(2026, 7, 15, 10);
  const signalsWith = (usage: Partial<UsageContext>) => buildContextSnapshot({
    state: emptyState, activeStage: 1, automaticStage: 1, profile: analyzeInteraction(emptyState),
    usage: usageAt(now, usage), now,
  }).signals;
  const returnGapAfter = (days: number) => signalsWith({ lastVisitAt: new Date(now.getTime() - days * 86_400_000).toISOString() })
    .find((s) => s.id === 'return-gap')?.strength ?? 'none';

  assert.equal(returnGapAfter(2), 'none', 'two days away is not a return');
  assert.equal(returnGapAfter(3), 'medium');
  assert.equal(returnGapAfter(13), 'medium');
  assert.equal(returnGapAfter(14), 'strong', 'a fortnight is worth re-orienting her');

  const sessionOf = (minutes: number) => signalsWith({ sessionStartedAt: new Date(now.getTime() - minutes * 60_000).toISOString() })
    .some((s) => s.id === 'long-session');
  assert.equal(sessionOf(21), false);
  assert.equal(sessionOf(22), true);
});

test('a discrepancy outranks every other headline the engine could offer', () => {
  // The headline is a single slot with a fixed precedence: discrepancy, then
  // closing, then a return after a break, then focused mode. Two of those
  // conditions holding at once is the normal case, so the order is the rule.
  const now = new Date(2026, 8, 27, 10);            // deep inside the closing band
  const state = answersOf({ q3: { meetingRate: '90-100', depth: 'shallow' } });
  const usage = usageAt(now, { lastVisitAt: new Date(now.getTime() - 20 * 86_400_000).toISOString() });
  const snapshot = buildContextSnapshot({ state, activeStage: 1, automaticStage: 1, profile: analyzeInteraction(state), usage, now });

  assert.equal(snapshot.calendar.stagePosition, 'closing', 'fixture guard: closing would also produce a headline');
  assert.ok(snapshot.signals.some((s) => s.id === 'return-gap'), 'fixture guard: so would the return gap');
  assert.equal(deriveCoachStrategy(snapshot).headline, 'יש כאן פער ששווה לעצור עליו לפני שממשיכים.');
  assert.equal(deriveCoachStrategy(snapshot).nextPrompt, snapshot.contradictions[0], 'the prompt is the contradiction itself');

  // With the contradiction removed, the next rule down takes the slot.
  const withoutDiscrepancy = buildContextSnapshot({
    state: emptyState, activeStage: 1, automaticStage: 1, profile: analyzeInteraction(emptyState), usage, now,
  });
  assert.equal(deriveCoachStrategy(withoutDiscrepancy).headline, 'אנחנו קרובות לסוף חלון השלב — עדיף לסגור את מה שמשנה החלטה.');
});

/** A state whose free text is ordinary prose of a chosen length, so `pace` is controllable. */
const proseState = (length: number) => migrateState({ plan: { flexibility: 'א'.repeat(length), identityFit: 'א'.repeat(length) } });
/** Three explicit overload words plus one ordinary answer, which is what `overload` reads. */
const overwhelmedState = () => migrateState({
  plan: { flexibility: 'קשה לי', managers: 'מתסכל מאוד', independence: 'אין זמן בכלל', identityFit: 'א'.repeat(120) },
});
const snapshotOf = (state: ReturnType<typeof migrateState>, now: Date, usage: Partial<UsageContext> = {}) => buildContextSnapshot({
  state, activeStage: 1, automaticStage: 1, profile: analyzeInteraction(state), usage: usageAt(now, usage), now,
});

const MIDDLE = new Date(2026, 7, 15, 10);
const CLOSING = new Date(2026, 8, 27, 10);

test('the stage-position signal is raised only at the end of the window it describes', () => {
  // Two separate conditions guard this pair, and both were unconstrained: a
  // "you have N days left, start closing" prompt in the first week of a window
  // would be wrong in exactly the way the engine exists to avoid.
  const idsOn = (date: Date) => snapshotOf(proseState(120), date).signals.map((s) => s.id);

  assert.ok(idsOn(new Date(2026, 6, 5, 10)).includes('stage-early'), 'early in the window says so');
  assert.ok(!idsOn(new Date(2026, 6, 5, 10)).includes('stage-closing'));
  assert.deepEqual(idsOn(MIDDLE).filter((id) => id.startsWith('stage-')), [], 'the middle of a window says neither');
  assert.ok(idsOn(CLOSING).includes('stage-closing'));
  assert.ok(!idsOn(CLOSING).includes('stage-early'));
});

test('the explanation lists strong facts before medium ones', () => {
  // `explanation` is the "why am I being told this" line under the headline. It
  // is built by filtering on strength, and nothing asserted its contents — so
  // the two filters could be swapped and the weakest reasons would lead.
  const strategy = deriveCoachStrategy(snapshotOf(overwhelmedState(), CLOSING));
  assert.deepEqual(strategy.explanation, [
    'לוח השנה מצביע על שלב 1.',              // strong: calendar agrees
    'נותרו כ־4 ימים לחלון השלב.',              // strong: the window is closing
    'בתשובות מופיעים כמה סימני עומס מפורשים.',  // strong: explicit overload
  ], 'three strong signals, and the medium ones do not displace them');

  // And when there are fewer than three strong facts, the medium ones fill the
  // rest — which is the only case that reaches the second filter at all.
  const quieter = deriveCoachStrategy(snapshotOf(proseState(120), MIDDLE, { device: 'mobile', width: 380, touch: true }));
  assert.deepEqual(quieter.explanation, [
    'לוח השנה מצביע על שלב 1.',        // strong
    'העבודה נעשית כרגע ממסך קטן.',      // medium, and it is not a repeat of the strong one
  ]);
});

test('a small screen on its own does not narrow the session', () => {
  // Working from a phone is normal, not a distress signal. It narrows the
  // session only together with a second reading — short answers, a late hour or
  // a long sitting — which is the same rule the late-hour test asserts from the
  // other side.
  const onPhone = deriveCoachStrategy(snapshotOf(proseState(120), MIDDLE, { device: 'mobile', width: 380, touch: true }));
  assert.equal(onPhone.intensity, 'balanced');
  assert.equal(onPhone.density, 'standard');

  const phoneAndTerse = deriveCoachStrategy(snapshotOf(proseState(20), MIDDLE, { device: 'mobile', width: 380, touch: true }));
  assert.equal(phoneAndTerse.intensity, 'light', 'a phone plus short answers together do narrow it');
});

test('deep mode is reachable, and closing withdraws only the depth', () => {
  const deep = deriveCoachStrategy(snapshotOf(proseState(400), MIDDLE));
  assert.equal(deep.intensity, 'deep', 'long answers away from a deadline earn depth');
  assert.equal(deep.density, 'expanded');

  // Closing pulls depth back — but it must not also overwrite a focused session
  // that was narrowed for her sake. Both of those are one line of code apart.
  const focusedWhileClosing = deriveCoachStrategy(snapshotOf(overwhelmedState(), CLOSING));
  assert.equal(focusedWhileClosing.intensity, 'light', 'someone signalling overload stays in focused mode');
  assert.equal(focusedWhileClosing.density, 'compact', 'and compact stays compact rather than being widened');
});

test('the focused-mode headline appears only in focused mode', () => {
  assert.equal(deriveCoachStrategy(snapshotOf(proseState(120), MIDDLE)).headline, undefined,
    'an ordinary session is given no headline at all');
  assert.equal(deriveCoachStrategy(snapshotOf(proseState(400), MIDDLE)).headline, undefined,
    'nor is a deep one');
  assert.equal(deriveCoachStrategy(snapshotOf(overwhelmedState(), MIDDLE)).headline,
    'אפשר לעבוד עכשיו במצב ממוקד וקצר.');
});
