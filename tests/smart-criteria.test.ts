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

test('deferred criteria are pending, not misses — the screen-1 trap', () => {
  // Reproduces a real report: on part 1 of the form only the audience and goal
  // fields exist, yet Measurable and Time-bound were rendered as warnings about
  // fields two screens ahead. An unreached field is not a mistake, and showing
  // it as one made a first-time user believe the goal field was blocking her.
  const evaluation = evaluateSmartGoal(basePlan({ audience: 'מחנכות', smartGoal: 'לשפר את ההוראה' }));
  const status = (letter: string) => evaluation.criteria.find((c) => c.letter === letter)!.status;
  assert.equal(status('measurable'), 'pending');
  assert.equal(status('timeBound'), 'pending');
  // Only what she can act on right here counts as missing.
  assert.deepEqual(evaluation.missing.map((c) => c.letter).sort(), ['relevant', 'specific']);
});

test('a deferred criterion becomes met — never missing — once its own field is filled', () => {
  const evaluation = evaluateSmartGoal(basePlan({
    smartGoal: 'להטמיע אצל המחנכות שימוש בהתאמות', metric1: 'תצפיות', metric2: 'משוב', timeframe: 'ספטמבר–ינואר',
  }));
  for (const letter of ['measurable', 'timeBound']) {
    assert.equal(evaluation.criteria.find((c) => c.letter === letter)!.status, 'met');
  }
  assert.equal(evaluation.missing.length, 0);
});

test('met mirrors status so existing callers stay correct', () => {
  const evaluation = evaluateSmartGoal(basePlan({ smartGoal: 'לשפר את ההוראה' }));
  for (const c of evaluation.criteria) assert.equal(c.met, c.status === 'met');
});

/* ------------------------------------------------------------------------- *
 * The word matching underneath the four criteria.
 *
 * Hebrew has no word boundaries a regex can use and prefixes attach directly to
 * the word, so every rule here is a containment test with a length floor. A
 * mutation sweep found each of those floors and each direction of containment
 * unconstrained — this is the same class of miss that the concrete-anchor nudge
 * was already caught on once.
 * ------------------------------------------------------------------------- */

const statusesFor = (overrides: Record<string, string>) =>
  Object.fromEntries(evaluateSmartGoal(basePlan(overrides)).criteria.map((c) => [c.letter, c.status]));

test('"specific" counts meaningful words, down to two letters, and needs exactly three', () => {
  // The floor is three content words; two is a gesture. Short words count —
  // dropping them would quietly raise the bar for anyone writing tersely.
  assert.equal(statusesFor({ smartGoal: 'לשפר הוראה מותאמת' }).specific, 'met', 'three is enough');
  assert.equal(statusesFor({ smartGoal: 'לשפר הוראה' }).specific, 'missing', 'two is not');
  assert.equal(statusesFor({ smartGoal: 'לשפר אב גד' }).specific, 'met', 'two-letter words are content, not noise');
});

test('"measurable" needs both success measures, not either one', () => {
  assert.equal(statusesFor({ smartGoal: 'לשפר הוראה מותאמת', metric1: 'תצפיות', metric2: 'משוב' }).measurable, 'met');
  assert.equal(statusesFor({ smartGoal: 'לשפר הוראה מותאמת', metric1: 'תצפיות' }).measurable, 'pending');
  assert.equal(statusesFor({ smartGoal: 'לשפר הוראה מותאמת', metric2: 'משוב' }).measurable, 'pending');
});

test('"relevant" matches a domain word inside a longer one, in either direction', () => {
  // Hebrew attaches prefixes, so the goal says "לתלמידים" where the anchor list
  // says "תלמיד": the goal word contains the anchor, never the reverse.
  // Requiring both directions would fail every prefixed word in the language.
  assert.equal(statusesFor({ smartGoal: 'לשפר הוראה לתלמידים', audience: 'טירים כלמנס' }).relevant, 'met');
  assert.equal(statusesFor({ smartGoal: 'לשפר שיתוף בגנים', audience: 'טירים כלמנס' }).relevant, 'missing',
    'no domain word and an audience it shares nothing with');
});

test('"relevant" also accepts an overlap with her own audience field', () => {
  // Second route in, with the same one-directional containment and a
  // three-letter floor: "בגנים" in the goal against "גני" in the audience. A
  // floor one letter higher, or a match requiring both directions, drops it.
  assert.equal(statusesFor({ smartGoal: 'לשפר שיתוף בגנים', audience: 'צוותי גני' }).relevant, 'met');
  // An empty audience is a gap in a different field, not evidence of irrelevance.
  assert.equal(statusesFor({ smartGoal: 'לשפר שיתוף בגנים' }).relevant, 'met');
});
