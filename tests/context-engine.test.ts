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
  assert.deepEqual([6, 10, 13, 16, 20, 23, 2].map(daypartFromHour),
    ['early', 'morning', 'midday', 'afternoon', 'evening', 'late', 'late']);
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
