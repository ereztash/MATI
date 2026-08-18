import test from 'node:test';
import assert from 'node:assert/strict';
import { changedFieldsSummary, diffPlans, PlanRevision, revisionCount, TRACKED_PLAN_FIELDS } from '../lib/plan-revisions';
import { emptyState, Plan } from '../lib/stages';

const plan = (overrides: Partial<Plan> = {}): Plan => ({ ...emptyState.plan, ...overrides });

test('an unchanged plan produces no changes', () => {
  const before = plan({ smartGoal: 'להטמיע התאמות', metric1: 'תצפיות' });
  assert.deepEqual(diffPlans(before, { ...before }), []);
});

test('a changed field is reported with both sides', () => {
  const before = plan({ smartGoal: 'שכל המורות ישתמשו בהתאמות' });
  const after = plan({ smartGoal: 'ששלוש מורות יעשו את זה טוב' });
  const changes = diffPlans(before, after);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].field, 'smartGoal');
  assert.equal(changes[0].label, 'מטרת SMART');
  assert.equal(changes[0].before, 'שכל המורות ישתמשו בהתאמות');
  assert.equal(changes[0].after, 'ששלוש מורות יעשו את זה טוב');
});

test('whitespace-only edits are not changes', () => {
  // Retyping the same sentence is not a decision; counting it would inflate the
  // very signal this exists to measure honestly.
  const before = plan({ smartGoal: 'להטמיע התאמות' });
  const after = plan({ smartGoal: '  להטמיע התאמות  ' });
  assert.deepEqual(diffPlans(before, after), []);
});

test('filling a previously empty field, and emptying a filled one, both count', () => {
  const filled = diffPlans(plan(), plan({ flexibility: 'לבדוק אחרי חודשיים' }));
  assert.equal(filled.length, 1);
  assert.equal(filled[0].before, '');

  const emptied = diffPlans(plan({ flexibility: 'לבדוק אחרי חודשיים' }), plan());
  assert.equal(emptied.length, 1);
  assert.equal(emptied[0].after, '');
});

test('only substantive plan fields are tracked — Gantt dates and personal reflection are not', () => {
  const tracked = TRACKED_PLAN_FIELDS.map((f) => f.field);
  for (const untracked of ['smallStepDate', 'managerTouchDate', 'flexibilityCheckDate', 'identityFit', 'confidenceNeed']) {
    assert.equal(tracked.includes(untracked as never), false, `${untracked} must not count as a plan change`);
  }
  // Moving a Gantt mark or answering a socratic prompt is not a change of intent.
  assert.deepEqual(diffPlans(plan(), plan({ smallStepDate: '2026-09-01', identityFit: 'מרגיש נכון' })), []);
});

test('several fields changing at once are all reported, in form order', () => {
  const before = plan({ audience: 'מחנכות א׳', timeframe: 'ספטמבר–ינואר' });
  const after = plan({ audience: 'מחנכות א׳–ב׳', timeframe: 'ספטמבר–דצמבר' });
  const changes = diffPlans(before, after);
  assert.deepEqual(changes.map((c) => c.field), ['audience', 'timeframe']);
});

test('the summary counts how often each field moved, most-changed first', () => {
  const revisions: PlanRevision[] = [
    { at: '2026-10-01T00:00:00.000Z', changes: diffPlans(plan({ smartGoal: 'א' }), plan({ smartGoal: 'ב' })) },
    { at: '2026-12-01T00:00:00.000Z', changes: diffPlans(plan({ smartGoal: 'ב', metric1: 'x' }), plan({ smartGoal: 'ג', metric1: 'y' })) },
  ];
  assert.equal(revisionCount(revisions), 2);
  const summary = changedFieldsSummary(revisions);
  assert.deepEqual(summary[0], { label: 'מטרת SMART', times: 2 });
  assert.equal(summary.find((s) => s.label === 'מדד הצלחה 1')?.times, 1);
});

test('an empty revision list summarises to nothing rather than throwing', () => {
  assert.equal(revisionCount([]), 0);
  assert.deepEqual(changedFieldsSummary([]), []);
});
