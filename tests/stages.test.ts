import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeInteraction, canOpenStage, deleteStakes, emptyState, formativeCompletion, formativeStarted,
  GAP_ANSWER_MAX_AGE_DAYS, hasLargeGoalResultGap,
  implementationStatus, MatiState, planReady, planSaved, ratioPercent, recommendedActions, resolveStage, scoreDimensions,
  rubricForNextYear, selfEffectivenessAverage, smartGoalLooksValid, stage2SectionStarted, stageFromDate,
  rankDimensions, stageLockReason, stageWindowLabel, summarizeLongText,
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

test('the strongest dimension and the gap worth checking are never the same one', () => {
  // Both were picked by sorting on score alone, ascending for one and
  // descending for the other. Array#sort is stable, so an all-equal set
  // returned the SAME element from both. Confirmed in a browser before this
  // fix: a complete saved plan (all five at 3/5) printed "מה חזק כרגע:
  // רפלקציה ולמידה" directly beside "הפער שכדאי לבדוק: רפלקציה ולמידה".
  const flat = state({ plan: {
    ...fullPlan, savedAt: '2026-01-01T00:00:00.000Z',
    flexibility: 'נקודת גמישות', managers: 'מנהלת בית הספר', independence: 'ביצוע עצמאי',
  } });
  const scores = scoreDimensions(flat).map((d) => d.score);
  assert.equal(new Set(scores).size, 1, 'this fixture is only interesting while every dimension ties');

  const { strongest, weakest } = rankDimensions(scoreDimensions(flat));
  assert.notEqual(strongest.name, weakest.name);

  // The empty state ties on evidence count as well as on score, which is the
  // case a score-and-evidence tie-break alone would still collide on.
  const blank = rankDimensions(scoreDimensions(emptyState));
  assert.notEqual(blank.strongest.name, blank.weakest.name);

  // And where the picture is not flat, the ordering is the obvious one.
  const uneven = scoreDimensions(state({
    plan: { ...fullPlan, savedAt: '2026-01-01T00:00:00.000Z', flexibility: 'נקודה' },
    formative: { answers: { q8: { centralMistake: 'טעות', flexibilityReflection: 'רפל' }, q5: { adaptations: 'over4' } } },
  }));
  assert.equal(rankDimensions(uneven).strongest.name, 'רפלקציה ולמידה');
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
  // Asserted exactly, not by startsWith and a length range: the summary is the
  // first TWO SENTENCES, and a truncation of the whole text to 240 characters
  // also starts with 'משפט ראשון.' and also fits the range — so the loose
  // version passed either way. Where the summary ENDS is the whole behaviour.
  assert.equal(summarizeLongText(long), 'משפט ראשון. משפט שני.…');
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

/* ------------------------------------------------------------------------- *
 * The heuristic scoring model.
 *
 * Everything below was added after a mutation sweep found that `scoreDimensions`,
 * `analyzeInteraction`, `recommendedActions`' dispatch and `hasLargeGoalResultGap`
 * had no test that constrained them: the existing coverage asserted that scores
 * sit between 1 and 5 (a range `toStars` clamps to [2,5] by construction, so it
 * could not fail) and that at most three actions come back, and nothing about
 * which number or which action.
 *
 * These are characterisation tests. The cut-offs they pin — 60% implementation,
 * a 5.5 self-rating, 170 and 55 characters, two negative answers — are the
 * model as it currently stands, not values anyone has signed off as
 * professionally correct. That is the point: the model is now stated somewhere
 * a person can read and argue with, and changing it means changing this file
 * deliberately rather than discovering the change in production.
 * ------------------------------------------------------------------------- */

/** The inputs that carry each of the five dimensions, one entry per dimension. */
const DIMENSION_INPUTS: Record<string, { plan: Record<string, unknown>; answers: Record<string, Record<string, unknown>> }> = {
  'רפלקציה ולמידה': {
    plan: { flexibility: 'נקודת גמישות' },
    answers: { q5: { adaptations: '3-4' }, q8: { centralMistake: 'טעות', flexibilityReflection: 'רפלקציה' } },
  },
  'מדדים כמותיים': {
    plan: { metric1: 'מדד א', metric2: 'מדד ב' },
    answers: { q1: { implementationPercent: '100' }, q4: { targetStudents: '10', improvedStudents: '10' }, q9: { goals: 10 } },
  },
  'לוח זמנים ויישום': {
    plan: { timeframe: 'ספטמבר–ינואר' },
    answers: { q3: { meetingRate: '90-100', depth: 'consistent' }, q5: { plannedHours: '10', actualHours: '10' } },
  },
  'מערכת ואחריות': {
    plan: { managers: 'מנהלת בית הספר' },
    answers: { q6: { teamFeedbackAsked: 'yes', managerPlanned: '4', managerActual: '4', resourcesAllocated: 'yes', culturePositiveSign: 'סימן' } },
  },
  'אופרטיביות ועצמאות': {
    plan: { independence: 'ביצוע עצמאי' },
    answers: { q2: { frequency: 'independent' }, q7: { independence: 'all', continuesWithoutDependency: 'yes' } },
  },
};

const DIMENSION_NAMES = Object.keys(DIMENSION_INPUTS);

/** A state with every dimension's inputs filled except the ones named. */
function filledExcept(...skip: string[]): MatiState {
  const plan: Record<string, unknown> = {};
  const answers: Record<string, Record<string, unknown>> = {};
  for (const name of DIMENSION_NAMES) {
    if (skip.includes(name)) continue;
    Object.assign(plan, DIMENSION_INPUTS[name].plan);
    for (const [id, values] of Object.entries(DIMENSION_INPUTS[name].answers)) {
      answers[id] = { ...(answers[id] ?? {}), ...values };
    }
  }
  return state({ plan, formative: { answers } });
}

const scoreOf = (st: MatiState, name: string) => scoreDimensions(st).find((d) => d.name === name)!.score;

test('each dimension is moved by its own evidence and by nothing else', () => {
  // The isolation is the actual claim of a five-dimension mirror: if filling in
  // the manager questions also lifted "מדדים כמותיים", the picture she is shown
  // would be flattery rather than a reading. Asserted per dimension rather than
  // as one golden snapshot, so a failure names which dimension leaked.
  for (const name of DIMENSION_NAMES) {
    const onlyThisOne = filledExcept(...DIMENSION_NAMES.filter((other) => other !== name));
    assert.equal(scoreOf(onlyThisOne, name), 5, `${name} should be full when its own evidence is complete`);
    for (const other of DIMENSION_NAMES) {
      if (other === name) continue;
      assert.equal(scoreOf(onlyThisOne, other), 2, `${name}'s evidence must not lift ${other}`);
    }
  }
});

test('a graded answer is graded, not just present', () => {
  // rangeScore maps each option to its own weight. Treating the whole scale as
  // "answered / not answered" is the failure mode worth catching: it would let
  // "המודרך לא עצמאי כלל" read the same as "עצמאי לחלוטין".
  const independenceAt = (value: string) =>
    scoreOf(state({ formative: { answers: { q7: { independence: value } } } }), 'אופרטיביות ועצמאות');

  const ladder = ['none', 'partial', 'most', 'all'].map(independenceAt);
  assert.deepEqual([...ladder].sort((a, b) => a - b), ladder, 'the scale must never score a weaker answer higher');
  assert.ok(independenceAt('all') > independenceAt('none'), 'and the two ends must not read the same');

  // Adjacent options do not always separate on a four-level star display: one
  // answer is a quarter of this dimension's evidence, so the underlying norm
  // moves further than the rounding shows. That is the honest direction to err
  // in — a single answer should not swing a whole dimension — but it means the
  // ladder is asserted as an ordering rather than as four distinct numbers.
  assert.equal(independenceAt('none'), independenceAt(''), 'the weakest answer is level with silence, never below it');
});

test('"no adaptations at all" is an answer, and it does not count as evidence of adapting', () => {
  // q5.adaptations === '0' is answered — but answering "none" is the opposite of
  // the thing this dimension measures, so it scores near the floor and produces
  // no evidence line. Swapping that comparison silently turns "I changed nothing"
  // into a citation for reflectiveness.
  const at = (value: string) => scoreDimensions(state({ formative: { answers: { q5: { adaptations: value } } } }))[0];

  assert.equal(at('0').score, 2);
  assert.deepEqual(at('0').evidence, [], 'answering "none" is not evidence of adapting');
  assert.equal(at('1-2').score, 3);
  assert.deepEqual(at('1-2').evidence, ['בוצעו התאמות בעקבות צורך או משוב']);
});

test('the advice she is given belongs to her weakest dimension', () => {
  // recommendedActions dispatches on which dimension scored lowest. Leaving
  // exactly one dimension unfilled makes it uniquely lowest (2 against 5), so
  // each of the five branches is reachable on its own.
  const ADVICE_FOR: Record<string, string> = {
    'רפלקציה ולמידה': 'בחרי התאמה אחת שעשית בעקבות משוב ותעדי מה השתנה בעקבותיה.',
    'מדדים כמותיים': 'בחרי צוות מוקד אחד והגדירי סימן אחד שאפשר לספור או להשוות לפני ואחרי.',
    'לוח זמנים ויישום': 'השווי בין מה שתוכנן למה שהתקיים בפועל ובחרי חסם אחד שניתן לשנות כבר במחזור הבא.',
    'מערכת ואחריות': 'קבעי עם מנהל/ת החלטה אחת ברורה: איזה משאב, זמן או גיבוי נדרש ומי אחראי עליו.',
    'אופרטיביות ועצמאות': 'הגדירי פעולה אחת שהמודרך יבצע לבד במפגש הבא, ואת הראיה שתראה שהעצמאות גדלה.',
  };

  for (const weakest of DIMENSION_NAMES) {
    const st = filledExcept(weakest);
    assert.equal(scoreOf(st, weakest), 2, `${weakest} should be the only dimension left at the floor`);
    const actions = recommendedActions(st);
    assert.ok(actions.includes(ADVICE_FOR[weakest]), `a weakest "${weakest}" must earn its own action, got: ${actions[0]}`);
    for (const other of DIMENSION_NAMES) {
      if (other === weakest) continue;
      assert.ok(!actions.includes(ADVICE_FOR[other]), `${other}'s action must not appear when ${weakest} is the weakest`);
    }
  }
});

test('hasLargeGoalResultGap has an exact cut-off on both of its numbers', () => {
  // Either number can raise the flag on its own, and both are the model's own
  // arbitrary lines rather than measured ones — which is exactly why they should
  // be written down. 60% implementation, or a self-rating below 5.5.
  const atImplementation = (percent: string) => hasLargeGoalResultGap(
    state({ formative: { answers: { q1: { goalAchievement: 'partial', implementationPercent: percent } } } }));
  assert.equal(atImplementation('59'), true);
  assert.equal(atImplementation('60'), false, '60 is not "below 60"');

  const atSelfRating = (value: number) => hasLargeGoalResultGap(
    state({ formative: { answers: { q1: { goalAchievement: 'partial' }, q9: { goals: value, implementation: value } } } }));
  assert.equal(atSelfRating(5), true);
  assert.equal(atSelfRating(5.5), false, '5.5 is not "below 5.5"');
});

test('a whitespace-only answer does not count as a started section', () => {
  // hasValue short-circuits on '' before it ever measures a length, so the empty
  // state cannot reach the length check at all — which is why the existing
  // coverage left it unconstrained. A typed space is the case that reaches it,
  // and it must not unlock Stage 3 on its own.
  assert.equal(stage2SectionStarted(state({ formative: { answers: { q5: { other: '   ' } } } }).formative, 'q5'), false);
  assert.equal(stage2SectionStarted(state({ formative: { answers: { q5: { other: 'תוכן' } } } }).formative, 'q5'), true);
  assert.equal(formativeStarted(state({ formative: { answers: { q8: { next1: '  ' } } } }).formative), false);
});

test('each locked stage is told why it is locked, and not the other one', () => {
  assert.match(stageLockReason(2), /^כדי לעבור להערכה המעצבת/);
  assert.match(stageLockReason(3), /^כדי לעבור להערכה המסכמת/);
  assert.notEqual(stageLockReason(2), stageLockReason(3));
});

/**
 * `analyzeInteraction` reads every string in the state, `formative.route`
 * ('short', five characters) included — the defect recorded in
 * tests/context-engine.ts. The averages below are therefore over the supplied
 * texts plus that one, which is what makes an exact boundary reachable at all;
 * if that defect is fixed, these counts change and this comment is the note
 * saying so.
 */
const PLAIN_FIELDS = ['flexibility', 'managers', 'independence', 'nextSmallStep', 'identityFit', 'confidenceNeed', 'audience'];
const profileOf = (texts: string[]) =>
  analyzeInteraction(state({ plan: Object.fromEntries(texts.map((t, i) => [PLAIN_FIELDS[i], t])) }));
const filler = (length: number) => 'ג'.repeat(length);

test('pace switches at exactly 170 and 55 characters, not one either side', () => {
  assert.equal(profileOf([filler(225), filler(225), filler(225)]).pace, 'balanced', 'an average of exactly 170 is not yet deep');
  assert.equal(profileOf([filler(226), filler(226), filler(226)]).pace, 'deep');
  assert.equal(profileOf([filler(80), filler(80)]).pace, 'balanced', 'an average of exactly 55 is not yet compact');
  assert.equal(profileOf([filler(79), filler(79)]).pace, 'compact');
});

test('a long answer reads as narrative only past 180 characters', () => {
  // Length is the second route into "narrative", beside the keyword list — so a
  // long factual answer with no reflective language still counts as one. The
  // boundary decides whether she is read as intuitive or mixed.
  assert.equal(profileOf([filler(180), filler(180)]).style, 'mixed');
  assert.equal(profileOf([filler(181), filler(181)]).style, 'intuitive');
});

test('a style is only named when the evidence is one-sided', () => {
  // analytic requires numbers AND no narrative; intuitive the reverse. A single
  // answer from the other side is enough to make it 'mixed' — the honest reading
  // when she is doing both.
  assert.equal(profileOf(['יעד 12 מפגשים', 'מדד 30 תלמידים']).style, 'analytic');
  assert.equal(profileOf(['יעד 12 מפגשים', 'מדד 30 תלמידים', 'כי זה מה שקרה']).style, 'mixed');
  assert.equal(profileOf(['כי זה מה שקרה', 'הרגשתי שזה נכון']).style, 'intuitive');
  assert.equal(profileOf(['כי זה מה שקרה', 'הרגשתי שזה נכון', 'יעד 12 מפגשים']).style, 'mixed');
});

test('tone softens at two difficult answers and overload starts at three', () => {
  assert.equal(profileOf(['קשה לי מאוד', 'טקסט רגיל לגמרי']).tone, 'direct');
  assert.equal(profileOf(['קשה לי מאוד', 'מתסכל אותי']).tone, 'soft');
  assert.equal(profileOf(['קשה לי מאוד', 'מתסכל אותי']).overload, false);
  assert.equal(profileOf(['קשה לי מאוד', 'מתסכל אותי', 'אין זמן בכלל']).overload, true);
  assert.equal(profileOf(['כן', 'טקסט רגיל לגמרי']).minimalism, false);
  assert.equal(profileOf(['כן', 'לא']).minimalism, true);
});

test('answering never costs her a star, and answering well earns one', () => {
  // This is the fix for the property the previous version of this test recorded:
  // reporting 0% implementation used to score a star LOWER than leaving the
  // field blank, because a blank was excluded from the average while a zero was
  // averaged into it. The denominator is fixed now (see evidenceNorm), so an
  // unanswered input and the worst possible answer both contribute nothing, and
  // a good answer can only add.
  const quantitative = (implementationPercent: string) => scoreOf(
    state({ plan: { metric1: 'מדד א', metric2: 'מדד ב' }, formative: { answers: { q1: { implementationPercent } } } }),
    'מדדים כמותיים');
  assert.equal(quantitative('0'), quantitative(''), 'an honest zero costs nothing against silence');
  assert.ok(quantitative('100') > quantitative('0'), 'and a full result earns a star');

  const timetable = (actualHours: string) => scoreOf(
    state({ plan: { timeframe: 'ספטמבר–ינואר' }, formative: { answers: { q5: { plannedHours: '10', actualHours } } } }),
    'לוח זמנים ויישום');
  assert.equal(timetable('0'), timetable(''), 'none of the planned field hours is still not worse than not saying');
  assert.ok(timetable('10') > timetable('0'));

  const system = (q6: Record<string, string>) => scoreOf(
    state({ plan: { managers: 'מנהלת בית הספר' }, formative: { answers: { q6 } } }), 'מערכת ואחריות');
  assert.equal(system({ teamFeedbackAsked: 'no' }), system({}), '"I did not ask the team" costs nothing against silence');
  assert.equal(system({ managerPlanned: '4', managerActual: '0' }), system({}));
  assert.ok(system({ teamFeedbackAsked: 'yes', managerPlanned: '4', managerActual: '4', resourcesAllocated: 'yes' }) > system({}));

  // Asking the team and not asking them must not read the same, and must not
  // read backwards. With only the managers field beside it the two round to the
  // same star, so this is asserted where the difference actually separates —
  // one extra piece of evidence in the dimension, which is the ordinary case.
  const withCultureSign = (teamFeedbackAsked: string) => system({ culturePositiveSign: 'סימן', ...(teamFeedbackAsked ? { teamFeedbackAsked } : {}) });
  assert.ok(withCultureSign('yes') > withCultureSign('no'), 'having asked the team is worth more than not having asked');
  assert.equal(withCultureSign('no'), withCultureSign(''), 'and saying "no" is still level with silence');
});

/**
 * Every input that feeds a dimension, with the vocabulary the UI actually
 * offers for it. Used to assert the property above exhaustively rather than at
 * the four places it happened to be noticed.
 */
const SCORED_INPUTS: Array<{ dimension: string; values: string[]; answer: (value: string) => Record<string, unknown> }> = [
  { dimension: 'רפלקציה ולמידה', values: ['נקודת גמישות'], answer: (v) => ({ plan: { flexibility: v } }) },
  { dimension: 'רפלקציה ולמידה', values: ['0', '1-2', '3-4', 'over4'], answer: (v) => ({ formative: { answers: { q5: { adaptations: v } } } }) },
  { dimension: 'רפלקציה ולמידה', values: ['טעות'], answer: (v) => ({ formative: { answers: { q8: { centralMistake: v } } } }) },
  { dimension: 'רפלקציה ולמידה', values: ['רפלקציה'], answer: (v) => ({ formative: { answers: { q8: { flexibilityReflection: v } } } }) },
  { dimension: 'מדדים כמותיים', values: ['מדד'], answer: (v) => ({ plan: { metric1: v } }) },
  { dimension: 'מדדים כמותיים', values: ['מדד'], answer: (v) => ({ plan: { metric2: v } }) },
  { dimension: 'מדדים כמותיים', values: ['0', '1', '50', '100'], answer: (v) => ({ formative: { answers: { q1: { implementationPercent: v } } } }) },
  { dimension: 'מדדים כמותיים', values: ['0', '5', '10'], answer: (v) => ({ formative: { answers: { q4: { targetStudents: '10', improvedStudents: v } } } }) },
  // All five q9 scales, as five rows rather than one. Collapsing them into a
  // single `goals` row is what let the same variable-denominator penalty hide
  // one level down: selfEffectivenessAverage is a mean over the scales she
  // answered, so it could only be dragged down by a second low rating, and a
  // table that never set a second rating could never drag it.
  { dimension: 'מדדים כמותיים', values: ['1', '5', '10'], answer: (v) => ({ formative: { answers: { q9: { goals: Number(v) } } } }) },
  { dimension: 'מדדים כמותיים', values: ['1', '5', '10'], answer: (v) => ({ formative: { answers: { q9: { implementation: Number(v) } } } }) },
  { dimension: 'מדדים כמותיים', values: ['1', '5', '10'], answer: (v) => ({ formative: { answers: { q9: { teacherChange: Number(v) } } } }) },
  { dimension: 'מדדים כמותיים', values: ['1', '5', '10'], answer: (v) => ({ formative: { answers: { q9: { studentImpact: Number(v) } } } }) },
  { dimension: 'מדדים כמותיים', values: ['1', '5', '10'], answer: (v) => ({ formative: { answers: { q9: { sustainability: Number(v) } } } }) },
  { dimension: 'לוח זמנים ויישום', values: ['ספטמבר–ינואר'], answer: (v) => ({ plan: { timeframe: v } }) },
  { dimension: 'לוח זמנים ויישום', values: ['under70', '70-90', '90-100'], answer: (v) => ({ formative: { answers: { q3: { meetingRate: v } } } }) },
  { dimension: 'לוח זמנים ויישום', values: ['0', '5', '10'], answer: (v) => ({ formative: { answers: { q5: { plannedHours: '10', actualHours: v } } } }) },
  { dimension: 'לוח זמנים ויישום', values: ['partial', 'shallow', 'consistent'], answer: (v) => ({ formative: { answers: { q3: { depth: v } } } }) },
  { dimension: 'מערכת ואחריות', values: ['מנהלת'], answer: (v) => ({ plan: { managers: v } }) },
  { dimension: 'מערכת ואחריות', values: ['no', 'yes'], answer: (v) => ({ formative: { answers: { q6: { teamFeedbackAsked: v } } } }) },
  { dimension: 'מערכת ואחריות', values: ['0', '2', '4'], answer: (v) => ({ formative: { answers: { q6: { managerPlanned: '4', managerActual: v } } } }) },
  { dimension: 'מערכת ואחריות', values: ['no', 'partial', 'yes'], answer: (v) => ({ formative: { answers: { q6: { resourcesAllocated: v } } } }) },
  { dimension: 'מערכת ואחריות', values: ['סימן'], answer: (v) => ({ formative: { answers: { q6: { culturePositiveSign: v } } } }) },
  { dimension: 'אופרטיביות ועצמאות', values: ['ביצוע עצמאי'], answer: (v) => ({ plan: { independence: v } }) },
  { dimension: 'אופרטיביות ועצמאות', values: ['rarely', 'sometimes', 'regular', 'independent'], answer: (v) => ({ formative: { answers: { q2: { frequency: v } } } }) },
  { dimension: 'אופרטיביות ועצמאות', values: ['none', 'partial', 'most', 'all'], answer: (v) => ({ formative: { answers: { q7: { independence: v } } } }) },
  { dimension: 'אופרטיביות ועצמאות', values: ['no', 'partial', 'yes'], answer: (v) => ({ formative: { answers: { q7: { continuesWithoutDependency: v } } } }) },
];

/** Deep-merges the partial answer objects above into one state fixture. */
function mergeDeep(target: Record<string, unknown>, source: Record<string, unknown>) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = mergeDeep((target[key] as Record<string, unknown>) ?? {}, value as Record<string, unknown>);
    } else {
      target[key] = value;
    }
  }
  return target;
}

test('no answer she can give anywhere scores worse than not answering at all', () => {
  // The general form of the property, over every input and every option the
  // instrument offers, holding the rest of the dimension fixed.
  //
  // "Holding the rest fixed" is the whole test. A first version of it compared
  // each answer against the EMPTY state and passed against the unfixed code —
  // because with nothing else answered the average has nothing to be dragged
  // down from. The penalty only ever appeared once the other inputs in the same
  // dimension were already answered well, which is the ordinary case for
  // someone filling the form in, and the only baseline that can show it.
  //
  // Worth asserting exhaustively rather than by example: the penalty was not
  // written anywhere. It fell out of averaging only the answered subset, so it
  // appeared wherever an input happened to be scored on a scale rather than on
  // presence. A metric that goes down when you add information teaches the
  // person reading it to add none.
  const best = (input: typeof SCORED_INPUTS[number]) => input.answer(input.values[input.values.length - 1]);
  /** 'plan', or the formative question an input belongs to — derived, not restated. */
  const groupOf = (input: typeof SCORED_INPUTS[number]) => {
    const shape = input.answer(input.values[0]) as { plan?: unknown; formative?: { answers: Record<string, unknown> } };
    return shape.plan ? 'plan' : `formative.${Object.keys(shape.formative?.answers ?? {})[0]}`;
  };

  SCORED_INPUTS.forEach((input, index) => {
    const siblings = SCORED_INPUTS.filter((other, i) => i !== index && other.dimension === input.dimension);
    const sameQuestion = siblings.filter((other) => groupOf(other) === groupOf(input));

    // Three baselines, because the shape of the baseline decides what the test
    // can see. "Everything else at its best" SATURATES: with four of five
    // inputs already contributing 1, a drop in the fifth is swallowed by the
    // rounding to stars, and a two-baseline version of this test passed against
    // the q9 penalty it was written to catch. "Only this question answered" is
    // the sparse case where a single input still moves the star, and is the one
    // that catches a mean hiding inside one of the five slots.
    const baselines: Array<[string, Record<string, unknown>]> = [
      ['nothing else answered', {}],
      ['everything else at its best', siblings.reduce<Record<string, unknown>>((acc, other) => mergeDeep(acc, best(other)), {})],
      ['only this question answered', sameQuestion.reduce<Record<string, unknown>>((acc, other) => mergeDeep(acc, best(other)), {})],
    ];

    for (const [label, baseline] of baselines) {
      const silent = scoreOf(state(structuredClone(baseline)), input.dimension);
      for (const value of input.values) {
        const answered = scoreOf(state(mergeDeep(structuredClone(baseline), input.answer(value))), input.dimension);
        assert.ok(answered >= silent,
          `${input.dimension} (${label}): answering ${JSON.stringify(value)} scored ${answered} where staying silent scored ${silent}`);
      }
    }
  });
});
