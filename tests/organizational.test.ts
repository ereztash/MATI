import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AggregatedSignalObservation, canProjectSignal, classifySystemicPattern, extractOrganizationalSignals,
  MIN_AGGREGATE_COHORT, organizationalAuthority, OrganizationalSignal, signalConcern,
} from '../lib/organizational-signals';
import {
  createOrganizationalPack, ORGANIZATIONAL_PACK_SCHEMA, OrganizationalPack,
  summarizeOrganizationalPacks, validateOrganizationalPack,
} from '../lib/organizational-pack';
import { migrateState } from '../lib/state-storage';

const SECRETS = {
  instructorName: 'נועה כהן',
  framework: 'בית ספר יסודי הדקל',
  evidence: 'המורה סיפרה שהיא מרגישה שהיא נכשלת',
  centralMistake: 'הטעות המרכזית שלי הייתה',
  turningPoint: 'נקודת המפנה הייתה השיחה עם המנהלת',
  shortages: 'אין מספיק שעות',
};

/** A state that is rich in exactly the material that must never leave the device. */
const loadedState = migrateState({
  plan: { audience: 'מחנכות', smartGoal: 'מטרה סודית', savedAt: '2026-01-05T10:00:00.000Z' },
  formative: {
    context: { instructorName: SECRETS.instructorName, framework: SECRETS.framework, centralGoals: 'יעדים' },
    answers: {
      q1: { goalAchievement: 'partial', implementationPercent: '65', evidence: SECRETS.evidence },
      q3: { meetingRate: '70-90', depth: 'shallow', notes: SECRETS.evidence },
      q4: { studentImpact: 'medium', targetStudents: '10', improvedStudents: '4' },
      q6: { teamFeedbackAsked: 'no', managerCommitment: 'low', resourcesAllocated: 'partial',
            managerPlanned: '4', managerActual: '1', resourcesPercent: '30', shortages: SECRETS.shortages },
      q7: { independence: 'partial', continuesWithoutDependency: 'no', evidence: SECRETS.evidence },
      q8: { centralMistake: SECRETS.centralMistake },
    },
  },
  summative: { turningPoint: SECRETS.turningPoint },
});

test('extraction carries structured measures and no free text whatsoever', () => {
  const signals = extractOrganizationalSignals(loadedState);
  assert.ok(signals.length >= 10, 'the structured measures are picked up');

  const serialized = JSON.stringify(signals);
  for (const [field, secret] of Object.entries(SECRETS)) {
    assert.ok(!serialized.includes(secret), `${field} must never reach the organizational route`);
  }
  assert.ok(!serialized.includes('מטרה סודית'));
  assert.ok(!serialized.includes('יעדים'));

  // Every value is a percent, a boolean, or one of the instrument's own codes.
  for (const signal of signals) {
    assert.ok(['number', 'boolean', 'string'].includes(typeof signal.value));
    if (typeof signal.value === 'string') assert.ok(signal.value.length <= 12, `unexpected prose in ${signal.key}`);
    assert.equal(signal.projection, 'aggregate_only');
  }
});

test('extraction derives the ratios rather than shipping the raw counts', () => {
  const signals = extractOrganizationalSignals(loadedState);
  const by = (key: string) => signals.find((s) => s.key === key)?.value;
  assert.equal(by('student_improvement_rate'), 40, '4 of 10');
  assert.equal(by('manager_meeting_rate'), 25, '1 of 4');
  assert.equal(by('implementation_rate'), 65);
  assert.equal(by('team_feedback_presence'), false);
});

test('an empty state produces no signals at all', () => {
  assert.deepEqual(extractOrganizationalSignals(migrateState({})), []);
});

const signal = (key: string, value: unknown) => ({ key, stage: 2, value, confidence: 'high', projection: 'aggregate_only', operationalImpact: 'high' }) as OrganizationalSignal;

/**
 * Every directional key, in both directions, over the instrument's real value
 * vocabulary — not a sample of it.
 *
 * The previous version of this test named four keys out of nine and was called
 * "concern is only assigned where the instrument has a direction", which reads
 * as coverage of the instrument. It was not: inverting the direction of
 * meeting_execution, implementation_depth, student_impact, resource_allocation,
 * teacher_independence and sustainability all at once left all 113 unit tests
 * green (verified by mutation, 2026-08-20). That matters more here than in most
 * places — signalConcern is what `adverseShare` counts, so an inverted
 * direction does not crash anything, it just quietly tells the organization
 * that a struggling cohort is fine.
 *
 * Values are the answer unions from lib/stages.ts (Formative q1/q3/q4/q6/q7),
 * so a new option added to an answer without a decision about its direction
 * shows up here as a missing case rather than defaulting to "no concern".
 */
const CONCERN_DIRECTIONS: Array<[string, unknown[], unknown[]]> = [
  //  key                     concern                 not a concern
  ['goal_attainment',        ['none', 'partial'],    ['mostly', 'full']],
  ['meeting_execution',      ['under70'],            ['70-90', '90-100']],
  ['implementation_depth',   ['shallow', 'partial'], ['consistent']],
  ['student_impact',         ['none', 'low'],        ['medium', 'high']],
  ['manager_commitment',     ['low', 'resistance'],  ['high', 'medium']],
  ['resource_allocation',    ['no', 'partial'],      ['yes']],
  ['teacher_independence',   ['none', 'partial'],    ['most', 'all']],
  ['sustainability',         ['no', 'partial'],      ['yes']],
  ['team_feedback_presence', [false],                [true]],
];

test('concern is assigned in the right direction for every directional signal', () => {
  for (const [key, concerning, benign] of CONCERN_DIRECTIONS) {
    for (const value of concerning) {
      assert.equal(signalConcern(signal(key, value)), true, `${key}=${String(value)} must read as a concern`);
    }
    for (const value of benign) {
      assert.equal(signalConcern(signal(key, value)), false, `${key}=${String(value)} must NOT read as a concern`);
    }
  }
});

test('concern is only assigned where the instrument has a direction', () => {
  // Percentages have no approved professional cut-off, so they stay neutral.
  assert.equal(signalConcern(signal('implementation_rate', 20)), null);
  assert.equal(signalConcern(signal('student_improvement_rate', 5)), null);
  assert.equal(signalConcern(signal('manager_meeting_rate', 0)), null);
  assert.equal(signalConcern(signal('resource_allocation_rate', 100)), null);
  // An unanswered question is not a quiet "no concern" either.
  assert.equal(signalConcern(signal('goal_attainment', '')), false);
});

test('the privacy floor blocks projection and classification below the cohort size', () => {
  const signal = { key: 'goal_attainment', stage: 2, value: 'partial', confidence: 'high', projection: 'aggregate_only', operationalImpact: 'high' } as OrganizationalSignal;
  assert.equal(canProjectSignal(signal, MIN_AGGREGATE_COHORT - 1), false);
  assert.equal(canProjectSignal(signal, MIN_AGGREGATE_COHORT), true);

  const observations = (n: number): AggregatedSignalObservation[] => Array.from({ length: n }, (_, i) => ({
    key: 'goal_attainment', contributorId: `c${i}`, contextId: `ctx${i}`, periodId: '2026-01',
    adverse: true, operationalImpact: 'high',
  }));

  const thin = classifySystemicPattern(observations(MIN_AGGREGATE_COHORT - 1));
  assert.equal(thin.classification, 'insufficient_privacy_floor');
  assert.equal(thin.maySurfaceToOrganization, false);
  assert.ok(thin.reasons.some((r) => r.startsWith('privacy_floor:')));

  const enough = classifySystemicPattern(observations(MIN_AGGREGATE_COHORT));
  assert.notEqual(enough.classification, 'insufficient_privacy_floor');
  assert.equal(enough.maySurfaceToOrganization, true);
  assert.equal(enough.requiresHumanReview, true);
});

test('a systemic candidate needs spread, persistence, impact and a majority', () => {
  const rows = (contexts: number, periods: number, adverse: boolean): AggregatedSignalObservation[] =>
    Array.from({ length: 6 }, (_, i) => ({
      key: 'goal_attainment', contributorId: `c${i}`, contextId: `ctx${i % contexts}`,
      periodId: `2026-0${(i % periods) + 1}`, adverse, operationalImpact: 'high',
    }));

  assert.equal(classifySystemicPattern(rows(1, 1, true)).classification, 'local_cluster');
  assert.equal(classifySystemicPattern(rows(2, 1, true)).classification, 'cross_context_pattern');
  assert.equal(classifySystemicPattern(rows(2, 2, true)).classification, 'persistent_pattern');
  assert.equal(classifySystemicPattern(rows(3, 2, true)).classification, 'systemic_candidate');
  assert.equal(classifySystemicPattern(rows(3, 2, false)).classification, 'persistent_pattern', 'no majority adverse');
});

test('the reasons a decision gives are true at the exact threshold, not one past it', () => {
  // The classification thresholds above are pinned; the `reasons` array beside
  // them was not, so `contexts >= 2`, `periods >= 2` and `adverseShare >= 0.5`
  // could each be tightened to `>` with the whole suite still green. Those
  // strings are what the organizational console shows a manager as the
  // justification for surfacing something, so a reason that quietly stops
  // appearing at exactly two contexts is a decision explained wrongly rather
  // than a crash. Exactly-at-the-boundary is the only interesting case.
  const rows = (contexts: number, periods: number, adverseOf: number): AggregatedSignalObservation[] =>
    Array.from({ length: 4 }, (_, i) => ({
      key: 'goal_attainment', contributorId: `c${i}`, contextId: `ctx${i % contexts}`,
      periodId: `2026-0${(i % periods) + 1}`, adverse: i < adverseOf, operationalImpact: 'high',
    }));

  const twoContextsTwoPeriods = classifySystemicPattern(rows(2, 2, 4)).reasons;
  assert.ok(twoContextsTwoPeriods.includes('cross_context_spread'), 'exactly two contexts is already spread');
  assert.ok(twoContextsTwoPeriods.includes('persistence'), 'exactly two periods is already persistence');

  const oneOfEach = classifySystemicPattern(rows(1, 1, 4)).reasons;
  assert.ok(!oneOfEach.includes('cross_context_spread'), 'a single context is not spread');
  assert.ok(!oneOfEach.includes('persistence'), 'a single period is not persistence');

  // Exactly half adverse counts as a majority by this instrument's definition.
  assert.ok(classifySystemicPattern(rows(2, 2, 2)).reasons.includes('majority_adverse'), 'half is the documented cut-off');
  assert.ok(!classifySystemicPattern(rows(2, 2, 1)).reasons.includes('majority_adverse'), 'a quarter is not');
});

test('a local cluster surfaces for inquiry only when it bears on implementation', () => {
  // Q12 asks for sensitivity at 2-3 repetitions inside one framework; Q11 is
  // equally explicit that recurrence alone is not systemic. So the same cluster
  // surfaces or not depending on operational impact, and never as a systemic claim.
  const cluster = (operationalImpact: 'low' | 'high'): AggregatedSignalObservation[] =>
    Array.from({ length: 3 }, (_, i) => ({
      key: 'goal_attainment', contributorId: `c${i}`, contextId: 'one-framework',
      periodId: '2026-01', adverse: true, operationalImpact,
    }));

  const weighty = classifySystemicPattern(cluster('high'));
  assert.equal(weighty.classification, 'local_cluster');
  assert.equal(weighty.maySurfaceToOrganization, true, 'three in one framework, with impact, is worth asking about');
  assert.equal(weighty.requiresHumanReview, true);
  assert.equal(weighty.mayAssertCausality, false, 'surfacing is never a causal claim');

  const slight = classifySystemicPattern(cluster('low'));
  assert.equal(slight.classification, 'local_cluster');
  assert.equal(slight.maySurfaceToOrganization, false, 'recurrence without operational impact stays local');
});

test('identifiability risk is reported rather than suppressed once the cohort is small', () => {
  const rows = (n: number): AggregatedSignalObservation[] => Array.from({ length: n }, (_, i) => ({
    key: 'goal_attainment', contributorId: `c${i}`, contextId: `ctx${i}`,
    periodId: '2026-01', adverse: true, operationalImpact: 'high',
  }));
  assert.equal(classifySystemicPattern(rows(3)).identifiabilityRisk, 'elevated');
  assert.equal(classifySystemicPattern(rows(4)).identifiabilityRisk, 'elevated');
  assert.equal(classifySystemicPattern(rows(5)).identifiabilityRisk, 'low');
  // Even a decision that is withheld still carries the risk assessment.
  assert.equal(classifySystemicPattern(rows(2)).classification, 'insufficient_privacy_floor');
  assert.equal(classifySystemicPattern(rows(2)).identifiabilityRisk, 'elevated');
});

test('causality is never assertable and cause/policy/action stay with a human', () => {
  const decision = classifySystemicPattern([]);
  assert.equal(decision.mayAssertCausality, false);
  assert.deepEqual(
    (['detect', 'surface', 'suggest_inquiry'] as const).map(organizationalAuthority),
    ['automatic', 'automatic', 'automatic'],
  );
  assert.deepEqual(
    (['diagnose_cause', 'set_policy', 'act'] as const).map(organizationalAuthority),
    ['human_required', 'human_required', 'human_required'],
  );
});

const validPack = (): OrganizationalPack => createOrganizationalPack({
  contributorId: 'contributor-0001', contextId: 'RGV-07', periodId: '2026-01',
  signals: extractOrganizationalSignals(loadedState),
});

test('a freshly created pack validates and carries no identifying text', () => {
  const pack = validPack();
  assert.equal(validateOrganizationalPack(pack), true);
  assert.equal(pack.schema, ORGANIZATIONAL_PACK_SCHEMA);
  const serialized = JSON.stringify(pack);
  for (const secret of Object.values(SECRETS)) assert.ok(!serialized.includes(secret));
});

test('pack validation is an allow-list, not a deny-list', () => {
  const base = validPack();
  const reject = (mutate: (p: Record<string, unknown>) => void, why: string) => {
    const copy = JSON.parse(JSON.stringify(base));
    mutate(copy);
    assert.equal(validateOrganizationalPack(copy), false, why);
  };

  reject((p) => { (p as { note?: string }).note = 'טקסט מוברח'; }, 'an extra top-level key smuggles content in');
  reject((p) => { delete (p as Record<string, unknown>).periodId; }, 'a missing key');
  reject((p) => { p.schema = 'something-else'; }, 'a foreign schema');
  reject((p) => { p.contributorId = 'short'; }, 'a contributor id below the length floor');
  reject((p) => { p.contributorId = 'נועה כהן בעברית'; }, 'a name in place of the opaque id');
  reject((p) => { p.contextId = 'בית ספר הדקל'; }, 'a real framework name in place of the code');
  reject((p) => { p.periodId = '2026-13'; }, 'an impossible month');
  reject((p) => { p.exportedAt = 'not a date'; }, 'an unparseable timestamp');
  reject((p) => { (p.signals as unknown[]).push({ ...(p.signals as Record<string, unknown>[])[0] }); }, 'a duplicated signal key');
  reject((p) => { (p.signals as Record<string, unknown>[])[0].value = 'טקסט חופשי'; }, 'prose in a signal value');
  reject((p) => { (p.signals as Record<string, unknown>[])[0].stage = 1; }, 'a signal claiming another stage');
  reject((p) => { (p.signals as Record<string, unknown>[])[0].projection = 'private_only'; }, 'a non-aggregate projection');
  reject((p) => { (p.signals as Record<string, unknown>[])[0].extra = 'x'; }, 'an extra key inside a signal');
  reject((p) => { p.signals = Array.from({ length: 31 }, () => (p.signals as unknown[])[0]); }, 'more signals than the schema allows');
  reject((p) => { p.signals = 'not an array'; }, 'a non-array signals field');

  const percentPack = JSON.parse(JSON.stringify(base));
  const rate = (percentPack.signals as Record<string, unknown>[]).find((s) => s.key === 'implementation_rate')!;
  rate.value = 140;
  assert.equal(validateOrganizationalPack(percentPack), false, 'a percentage outside 0-100');
});

test('validation rejects anything that is not an object', () => {
  for (const junk of [null, undefined, 'text', 42, [], true]) {
    assert.equal(validateOrganizationalPack(junk), false);
  }
});

test('aggregation counts distinct contributors, contexts and periods', () => {
  const pack = (contributorId: string, contextId: string, periodId: string): OrganizationalPack =>
    createOrganizationalPack({ contributorId, contextId, periodId, signals: extractOrganizationalSignals(loadedState) });

  const summaries = summarizeOrganizationalPacks([
    pack('contributor-0001', 'RGV-01', '2026-01'),
    pack('contributor-0002', 'RGV-01', '2026-01'),
    pack('contributor-0003', 'RGV-02', '2026-02'),
  ]);

  const goals = summaries.find((s) => s.key === 'goal_attainment')!;
  assert.equal(goals.contributors, 3);
  assert.equal(goals.contexts, 2);
  assert.equal(goals.periods, 2);
  assert.equal(goals.concerns, 3, 'all three reported partial attainment');
  // The floor is 3 by an explicit decision (see MIN_AGGREGATE_COHORT): the manager
  // asked for sensitivity at 2-3 repetitions, so three contributors now clears it
  // rather than being withheld. It classifies on its own merits from there.
  assert.equal(goals.classification?.classification, 'persistent_pattern');
  assert.equal(goals.classification?.maySurfaceToOrganization, true);
  // Clearing the floor is not the same as being anonymous — three is still small
  // enough to infer individuals, and the decision has to say so out loud.
  assert.equal(goals.classification?.identifiabilityRisk, 'elevated');

  // A percentage has no cut-off, so it aggregates as scope only and never classifies.
  const rate = summaries.find((s) => s.key === 'implementation_rate')!;
  assert.equal(rate.neutral, 3);
  assert.equal(rate.classification, null);
});
