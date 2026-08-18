import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSmartGoal } from '../lib/smart-criteria';
import { emptyState, Plan } from '../lib/stages';

const basePlan = (overrides: Partial<Plan> = {}): Plan => ({ ...emptyState.plan, ...overrides });

function criterion(evaluation: ReturnType<typeof evaluateSmartGoal>, letter: string) {
  const found = evaluation.criteria.find((c) => c.letter === letter);
  assert.ok(found, `expected a ${letter} criterion`);
  return found!;
}

test('a generic goal with no concrete content is flagged as not specific', () => {
  const evaluation = evaluateSmartGoal(basePlan({ smartGoal: 'לשפר את ההוראה' }));
  assert.equal(criterion(evaluation, 'specific').met, false);
});

test('a goal with no recognizable change verb is flagged as not specific', () => {
  const evaluation = evaluateSmartGoal(basePlan({ smartGoal: 'המורים יהיו יותר טובים בכיתה' }));
  assert.equal(criterion(evaluation, 'specific').met, false);
});

test('a concrete goal naming a change verb and enough content passes specific', () => {
  const evaluation = evaluateSmartGoal(basePlan({ smartGoal: 'להטמיע שימוש בהתאמות חושיות בקרב גננות טרום חובה' }));
  assert.equal(criterion(evaluation, 'specific').met, true);
});

test('measurable and time-bound come only from the sibling fields, never from goal text', () => {
  const bare = evaluateSmartGoal(basePlan({ smartGoal: 'להטמיע שימוש בהתאמות חושיות בקרב גננות' }));
  assert.equal(criterion(bare, 'measurable').met, false);
  assert.equal(criterion(bare, 'timeBound').met, false);

  const withMetricsOnly = evaluateSmartGoal(basePlan({
    smartGoal: 'המורים יהיו יותר טובים', // deliberately not specific
    metric1: 'מדד א', metric2: 'מדד ב', timeframe: 'ספטמבר–ינואר',
  }));
  assert.equal(criterion(withMetricsOnly, 'measurable').met, true);
  assert.equal(criterion(withMetricsOnly, 'timeBound').met, true);
  // Confirms these two are independent of the specific check above.
  assert.equal(criterion(withMetricsOnly, 'specific').met, false);
});

test('relevant passes when the goal shares vocabulary with the audience field', () => {
  const evaluation = evaluateSmartGoal(basePlan({
    audience: '8 גננות בגני טרום חובה',
    smartGoal: 'להטמיע אצל הגננות שימוש עקבי בכלי ויסות חושי',
  }));
  assert.equal(criterion(evaluation, 'relevant').met, true);
});

test('relevant is not blocked just because the audience field is still empty', () => {
  const evaluation = evaluateSmartGoal(basePlan({ audience: '', smartGoal: 'להטמיע כלי הוראה חדשים בבית הספר' }));
  assert.equal(criterion(evaluation, 'relevant').met, true);
});

test('relevant fails when the audience is filled but the goal never connects to it', () => {
  const evaluation = evaluateSmartGoal(basePlan({
    audience: '6 מחנכות כיתות ג׳',
    smartGoal: 'לשפר את תהליכי הרכש הפנימיים במשרד',
  }));
  assert.equal(criterion(evaluation, 'relevant').met, false);
  assert.ok(criterion(evaluation, 'relevant').hint.includes('מחנכות כיתות ג׳'));
});

test('achievable is never claimed as detected: a fixed reflection, not a pass/fail criterion', () => {
  const evaluation = evaluateSmartGoal(basePlan({ smartGoal: 'לשפר את ההוראה' })); // deliberately weak on every other letter too
  assert.ok(evaluation.achievableReflection.length > 0);
  // SmartLetter itself has no 'achievable' member (see lib/smart-criteria.ts) — this
  // exact set is the runtime proof that nothing achievable-shaped snuck into criteria.
  assert.deepEqual(evaluation.criteria.map((c) => c.letter).sort(), ['measurable', 'relevant', 'specific', 'timeBound']);
});

test('an empty goal reports every text-derived criterion as unmet without throwing', () => {
  const evaluation = evaluateSmartGoal(basePlan({ smartGoal: '' }));
  assert.equal(criterion(evaluation, 'specific').met, false);
  assert.equal(criterion(evaluation, 'relevant').met, false);
  assert.equal(evaluation.metCount, 0);
});

test('metCount and missing stay consistent with the four real criteria', () => {
  const evaluation = evaluateSmartGoal(basePlan({
    audience: 'צוותי מוקד',
    smartGoal: 'להטמיע אצל צוותי המוקד שימוש עקבי בהתאמות לימודיות',
    metric1: 'מדד א', metric2: 'מדד ב', timeframe: 'ספטמבר–ינואר',
  }));
  assert.equal(evaluation.criteria.length, 4);
  assert.equal(evaluation.metCount, 4);
  assert.equal(evaluation.missing.length, 0);
});
