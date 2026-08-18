import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeInteraction, canOpenStage, emptyState, formativeCompletion, formativeStarted, hasLargeGoalResultGap,
  implementationStatus, MatiState, planReady, planSaved, ratioPercent, recommendedActions, scoreDimensions,
  selfEffectivenessAverage, smartGoalLooksValid, stage2SectionStarted, stageFromDate, summarizeLongText,
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
