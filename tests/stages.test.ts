import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeInteraction, canOpenStage, deleteStakes, emptyState, formativeCompletion, formativeStarted,
  GAP_ANSWER_MAX_AGE_DAYS, hasLargeGoalResultGap,
  implementationStatus, MatiState, planReady, planSaved, ratioPercent, recommendedActions, resolveStage, scoreDimensions,
  rubricForNextYear, selfEffectivenessAverage, smartGoalLooksValid, stage2SectionStarted, stageFromDate,
  stageWindowLabel, summarizeLongText,
} from '../lib/stages';
import { migrateState } from '../lib/state-storage';

const fullPlan = { audience: 'מחנכות', smartGoal: 'מטרה', metric1: 'מדד א', metric2: 'מדד ב', timeframe: 'ספטמבר–ינואר' };
const state = (partial: Record<string, unknown>): MatiState => migrateState(partial);

test('stageFromDate maps only the three gantt windows and guesses nothing between them', () => {
  const stageOf = (month: number) => stageFromDate(new Date(2026, month - 1, 15));
  assert.deepEqual([7, 8, 9].map(stageOf), [1, 1, 1]);
  assert.deepEqual([12, 1, 2].map(stageOf), [2, 2, 2]);
  assert.deepEqual([5, 6].map(stageOf), [3, 3]);
  assert.deepEqual([3, 4, 10, 11].map(stageOf), [null, null, null, null]);
});

/**
 * resolveStage decides which stage every surface in the app shows, and until
 * now it had no unit test at all — it was introduced to replace four drifted
 * copies of `manualStage ?? stageFromDate() ?? 1` and was covered only
 * indirectly, through two e2e specs that exercise the gap picker. Its whole
 * job is precedence and expiry, and neither was pinned anywhere.
 */
const IN_GAP = new Date(2026, 9, 15);      // October — no window
const IN_WINDOW_1 = new Date(2026, 7, 15); // August — stage 1

test('resolveStage prefers a manual override, then the calendar, then her gap answer', () => {
  const gapAnswer = { stage: 2 as const, chosenAt: IN_GAP.toISOString() };

  assert.deepEqual(resolveStage(state({ manualStage: 3, gapStage: gapAnswer }), IN_WINDOW_1),
    { stage: 3, source: 'manual' }, 'a deliberate override outranks everything');

  // The calendar outranks her gap answer on purpose: once a real window opens,
  // the answer she gave about a gap is no longer about now.
  assert.deepEqual(resolveStage(state({ gapStage: gapAnswer }), IN_WINDOW_1),
    { stage: 1, source: 'calendar' });

  assert.deepEqual(resolveStage(state({ gapStage: gapAnswer }), IN_GAP),
    { stage: 2, source: 'gap-answer' });
});

test('resolveStage returns null rather than guessing a stage during a gap', () => {
  // `null` is the whole point of this function: callers ask instead of assuming
  // stage 1, which is what the four copies it replaced all did.
  assert.deepEqual(resolveStage(emptyState, IN_GAP), { stage: null, source: 'calendar' });
});

test('a gap answer expires, and the boundary day still counts', () => {
  // `now` is held inside a gap month and the ANSWER is moved backwards, rather
  // than the reverse: no gap is 90 days long, so ageing `now` forward out of
  // October walks straight into the December–February window and the calendar
  // answers instead. A first draft of this test did exactly that and "passed"
  // at the boundary on a stage the gap answer had not supplied — which is why
  // `source` is asserted here too, not just the number.
  const now = new Date(Date.UTC(2026, 10, 15, 12));  // November — a gap
  const answeredDaysAgo = (days: number) => resolveStage(
    state({ gapStage: { stage: 2, chosenAt: new Date(now.getTime() - days * 86_400_000).toISOString() } }),
    now,
  );

  assert.deepEqual(answeredDaysAgo(0), { stage: 2, source: 'gap-answer' }, 'answered today');
  assert.deepEqual(answeredDaysAgo(GAP_ANSWER_MAX_AGE_DAYS), { stage: 2, source: 'gap-answer' },
    'the last day it still describes now');
  assert.equal(answeredDaysAgo(GAP_ANSWER_MAX_AGE_DAYS + 1).stage, null,
    'one day past, it is about a different gap');
});

test('a gap answer from the future, or an unreadable one, is discarded rather than trusted', () => {
  // Both are reachable without anything exotic: a device whose clock was wrong
  // when she answered and has since been corrected, and a hand-edited or
  // partially-written localStorage value.
  const fromTheFuture = state({ gapStage: { stage: 3, chosenAt: new Date(2026, 10, 15).toISOString() } });
  assert.equal(resolveStage(fromTheFuture, IN_GAP).stage, null);

  const unreadable = state({ gapStage: { stage: 3, chosenAt: 'לא תאריך' } });
  assert.equal(resolveStage(unreadable, IN_GAP).stage, null);
});

test('the goal field is checked for content only', () => {
  assert.equal(smartGoalLooksValid('להעלות שימוש בהתאמות'), true);
  assert.equal(smartGoalLooksValid('א'), true, 'no length floor: the gate is content, not word count');
  assert.equal(smartGoalLooksValid('   '), false);
  assert.equal(smartGoalLooksValid(''), false);
});

test('planReady needs all five fields; planSaved additionally needs a stamp', () => {
  assert.equal(planReady({ ...emptyState.plan, ...fullPlan }), true);
  for (const missing of Object.keys(fullPlan)) {
    const plan = { ...emptyState.plan, ...fullPlan, [missing]: '  ' };
    assert.equal(planReady(plan), false, `${missing} should be required`);
  }
  assert.equal(planSaved(state({ plan: fullPlan })), false);
  assert.equal(planSaved(state({ plan: { ...fullPlan, savedAt: '2026-01-01T00:00:00.000Z' } })), true);
});

test('stage gates: 2 needs a saved plan, 3 additionally needs a started formative', () => {
  const blank = emptyState;
  const saved = state({ plan: { ...fullPlan, savedAt: '2026-01-01T00:00:00.000Z' } });
  const started = state({ plan: { ...fullPlan, savedAt: '2026-01-01T00:00:00.000Z' }, formative: { answers: { q1: { evidence: 'משהו' } } } });

  assert.equal(canOpenStage(1, blank), true, 'stage 1 is always open');
  assert.equal(canOpenStage(2, blank), false);
  assert.equal(canOpenStage(2, saved), true);
  assert.equal(canOpenStage(3, saved), false);
  assert.equal(canOpenStage(3, started), true);
});

test('any answered section counts as a started formative', () => {
  assert.equal(formativeStarted(emptyState.formative), false);
  assert.equal(formativeStarted(state({ formative: { answers: { q9: { goals: 3 } } } }).formative), true);
  assert.equal(formativeStarted(state({ formative: { answers: { q8: { next1: 'צעד' } } } }).formative), true);
  assert.equal(stage2SectionStarted(state({ formative: { answers: { q5: { tailoring: 1 } } } }).formative, 'q5'), true);
  assert.equal(stage2SectionStarted(emptyState.formative, 'q5'), false);
});

test('ratioPercent tolerates dirty input and refuses to divide by nothing', () => {
  assert.equal(ratioPercent('9', '12'), 75);
  assert.equal(ratioPercent('9 שעות', '12 שעות'), 75);
  assert.equal(ratioPercent('12', '12'), 100);
  assert.equal(ratioPercent('', '12'), null);
  assert.equal(ratioPercent('9', ''), null);
  assert.equal(ratioPercent('9', '0'), null);
  assert.equal(ratioPercent('טקסט', '12'), null);
  assert.equal(ratioPercent('9999', '1'), 999, 'clamped so a typo cannot render an absurd figure');
});

test('implementationStatus prefers the reported percent and falls back to the band', () => {
  assert.equal(implementationStatus(state({ formative: { answers: { q1: { implementationPercent: '73' } } } })), 73);
  assert.equal(implementationStatus(state({ formative: { answers: { q1: { implementationPercent: '150' } } } })), 100);
  assert.equal(implementationStatus(state({ formative: { answers: { q1: { goalsAnswered: '75-90' } } } })), 83);
  assert.equal(implementationStatus(emptyState), null, 'no data means no number, not zero');
});

test('selfEffectivenessAverage averages only the answered scales', () => {
  assert.equal(selfEffectivenessAverage(emptyState), null);
  assert.equal(selfEffectivenessAverage(state({ formative: { answers: { q9: { goals: 8, implementation: 7 } } } })), 7.5);
  assert.equal(selfEffectivenessAverage(state({ formative: { answers: { q9: { goals: 8, implementation: 7, teacherChange: 6 } } } })), 7);
});

test('formativeCompletion counts against the chosen route', () => {
  const answered = { q1: { evidence: 'a' }, q2: { evidence: 'b' } };
  assert.equal(formativeCompletion(state({ formative: { route: 'short', answers: answered } })), 40);
  assert.equal(formativeCompletion(state({ formative: { route: 'full', answers: answered } })), 22);
  assert.equal(formativeCompletion(emptyState), 0);
});

test('every dimension score is traceable to evidence the user entered', () => {
  const dims = scoreDimensions(state({
    plan: { ...fullPlan, managers: 'מנהלת בית הספר', independence: 'ביצוע עצמאי' },
    formative: { answers: { q1: { implementationPercent: '80' }, q4: { targetStudents: '10', improvedStudents: '8' } } },
  }));
  const quantitative = dims.find((d) => d.name === 'מדדים כמותיים')!;
  assert.ok(quantitative.evidence.some((e) => e.includes('80%')), 'the reported percent is cited back');
  assert.ok(quantitative.evidence.some((e) => e.includes('80%')));
  assert.ok(dims.every((d) => d.score >= 1 && d.score <= 5));
});

test('scoreDimensions floors an empty state at 2 stars (known gap, see review finding 7)', () => {
  // Documents current behaviour: with no data at all the mirror still shows 2/5
  // in every dimension rather than "not measured". Update this test when fixed.
  assert.deepEqual(scoreDimensions(emptyState).map((d) => d.score), [2, 2, 2, 2, 2]);
  assert.deepEqual(scoreDimensions(emptyState).map((d) => d.evidence.length), [0, 0, 0, 0, 0]);
});

test('hasLargeGoalResultGap needs both a low goal answer and weak numbers', () => {
  const low = { q1: { goalAchievement: 'partial', implementationPercent: '40' } };
  assert.equal(hasLargeGoalResultGap(state({ formative: { answers: low } })), true);
  assert.equal(hasLargeGoalResultGap(state({ formative: { answers: { q1: { goalAchievement: 'full', implementationPercent: '40' } } } })), false);
  assert.equal(hasLargeGoalResultGap(state({ formative: { answers: { q1: { goalAchievement: 'partial', implementationPercent: '90' } } } })), false);
});

test('recommendedActions returns at most three distinct suggestions', () => {
  const actions = recommendedActions(state({
    formative: { answers: { q6: { teamFeedbackAsked: 'no' }, q7: { continuesWithoutDependency: 'no' } } },
  }));
  assert.ok(actions.length > 0 && actions.length <= 3);
  assert.equal(new Set(actions).size, actions.length);
});

test('the advice she is given is the advice her own answers earned', () => {
  // The test above pins the shape — at most three, all distinct — and nothing
  // about the contents, so every one of these dispatch conditions could be
  // inverted with the suite still green (verified by mutation, 2026-08-20).
  // This is guidance a מדריכה is asked to act on: advice attached to the wrong
  // answer is worse than no advice, and it is invisible to a count.
  const answers = (a: Record<string, unknown>) => state({ formative: { answers: a } });

  const noFeedback = recommendedActions(answers({ q6: { teamFeedbackAsked: 'no' } }));
  assert.ok(noFeedback.some((line) => line.startsWith('אספי מהצוות שאלה אחת קבועה')),
    'never having asked the team for feedback must produce the feedback action');
  assert.ok(!recommendedActions(answers({ q6: { teamFeedbackAsked: 'yes' } }))
    .some((line) => line.startsWith('אספי מהצוות שאלה אחת קבועה')),
    'and must not, once she has asked');

  const dependent = recommendedActions(answers({ q7: { continuesWithoutDependency: 'no' } }));
  assert.ok(dependent.some((line) => line.startsWith('העבירי בעלות על כלי אחד')),
    'an implementation that stops without her must produce the ownership action');
  assert.ok(!recommendedActions(answers({ q7: { continuesWithoutDependency: 'yes' } }))
    .some((line) => line.startsWith('העבירי בעלות על כלי אחד')));
});

test('the repeated-mistake rubric names the mistake the answers actually show', () => {
  // rubricForNextYear had no test of any kind. Each row below is a direct
  // answer-to-sentence mapping, checked on its own so the three-item cap
  // cannot hide one, and checked in both directions so an inverted condition
  // fails here instead of appearing in a summary she is asked to sign off.
  const rubricFor = (a: Record<string, unknown>) => rubricForNextYear(state({ formative: { answers: a } })).mistakes;

  const cases: Array<[Record<string, unknown>, Record<string, unknown>, string]> = [
    [{ q1: { measuresDefined: 'no' } }, { q1: { measuresDefined: 'all' } }, 'יעדים בלי מדדי הצלחה ברורים'],
    [{ q3: { meetingRate: 'under70' } }, { q3: { meetingRate: '90-100' } }, 'פער גבוה בין לוח הזמנים לתדירות המפגשים בפועל'],
    [{ q6: { managerCommitment: 'low' } }, { q6: { managerCommitment: 'high' } }, 'תלות בתהליך בלי מחויבות מנהלים מספקת'],
    [{ q6: { managerCommitment: 'resistance' } }, { q6: { managerCommitment: 'medium' } }, 'תלות בתהליך בלי מחויבות מנהלים מספקת'],
    [{ q7: { continuesWithoutDependency: 'no' } }, { q7: { continuesWithoutDependency: 'yes' } }, 'יישום שנשאר תלוי במדריכה'],
  ];
  for (const [triggering, benign, sentence] of cases) {
    assert.ok(rubricFor(triggering).includes(sentence), `${JSON.stringify(triggering)} must name "${sentence}"`);
    assert.ok(!rubricFor(benign).includes(sentence), `${JSON.stringify(benign)} must NOT name "${sentence}"`);
  }

  // Her own answer is quoted back, not paraphrased or dropped.
  assert.ok(rubricFor({ q8: { centralMistake: 'התחלתי בלי מדדים' } })
    .includes('הלמידה שהמדריכה עצמה סימנה: התחלתי בלי מדדים'));

  // And silence is stated rather than implied by an empty list.
  assert.deepEqual(rubricFor({}), ['לא זוהתה עדיין טעות חוזרת מתוך הנתונים שנאספו.']);
});

test('each stage window is labelled with its own months', () => {
  // stageWindowLabel finds the window whose stage matches; flipping that match
  // returns the FIRST window that does not, so every stage in the gap picker
  // gets a neighbour's months and still renders plausibly. These strings exist
  // precisely so the picker stops restating the gantt as free text.
  assert.deepEqual(([1, 2, 3] as const).map(stageWindowLabel), ['יולי–ספטמבר', 'דצמבר–פברואר', 'מאי–יוני']);
});

test('summarizeLongText only summarises text long enough to need it', () => {
  assert.equal(summarizeLongText('קצר'), '');
  assert.equal(summarizeLongText('א'.repeat(360)), '');
  const long = 'משפט ראשון. משפט שני. ' + 'א'.repeat(400);
  const summary = summarizeLongText(long);
  assert.ok(summary.length > 0 && summary.length <= 241);
  assert.ok(summary.startsWith('משפט ראשון.'));
});

test('analyzeInteraction stays unknown until there is enough to read', () => {
  assert.equal(analyzeInteraction(emptyState).style, 'unknown');
  const analytic = analyzeInteraction(state({ plan: { metric1: '80%', metric2: 'יעד 12 מפגשים', audience: '30 תלמידים' } }));
  assert.equal(analytic.style, 'analytic');
  const narrative = 'שמתי לב שקרה משהו אחר לגמרי כי הצוות הרגיש שזה לא עובד ולמדתי מזה הרבה';
  const intuitive = analyzeInteraction(state({ plan: { flexibility: narrative, identityFit: narrative } }));
  assert.equal(intuitive.style, 'intuitive');
});

test('deleteStakes names what is actually at risk instead of a generic warning', () => {
  assert.equal(deleteStakes(emptyState), 'אין כרגע שום דבר שמור בדפדפן הזה — אפשר למחוק בלי לאבד עבודה.');

  const withPlan = state({ plan: { ...fullPlan, savedAt: '2026-01-05T10:00:00.000Z' }, history: [{ at: '2026-01-05T10:00:00.000Z', stage: 1, label: 'x', note: '' }] });
  assert.match(deleteStakes(withPlan), /תוכנית עבודה שמורה/);
  assert.match(deleteStakes(withPlan), /נקודת דרך אחת בהיסטוריה/); // singular, not "1 נקודות"
  assert.doesNotMatch(deleteStakes(withPlan), /הערכה מעצבת/);

  const withEverything = state({
    plan: { ...fullPlan, savedAt: '2026-01-05T10:00:00.000Z' },
    formative: { savedAt: '2026-02-01T10:00:00.000Z' },
    summative: { savedAt: '2026-06-01T10:00:00.000Z' },
    history: [{ at: '2026-01-05T10:00:00.000Z', stage: 1, label: 'x', note: '' }, { at: '2026-02-01T10:00:00.000Z', stage: 2, label: 'x', note: '' }],
  });
  const stakes = deleteStakes(withEverything);
  assert.match(stakes, /תוכנית עבודה שמורה/);
  assert.match(stakes, /הערכה מעצבת שמורה/);
  assert.match(stakes, /הערכה מסכמת שמורה/);
  assert.match(stakes, /2 נקודות דרך בהיסטוריה/);

  // A plan that only *looks* complete but was never actually saved (no
  // savedAt) must not be reported as something the deletion would lose.
  const unsavedPlan = state({ plan: fullPlan });
  assert.equal(deleteStakes(unsavedPlan), 'אין כרגע שום דבר שמור בדפדפן הזה — אפשר למחוק בלי לאבד עבודה.');
});
