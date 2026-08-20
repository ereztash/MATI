import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState } from '../lib/stages';
import { LEGACY_KEY, STORAGE_KEY, isEmptyPayload, loadStoredState, migrateState, sameExceptNavigation } from '../lib/state-storage';

/** Minimal localStorage stand-in; loadStoredState only needs get/set semantics. */
function stubStorage(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries));
  (globalThis as Record<string, unknown>).window = globalThis;
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  return () => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).localStorage;
  };
}

test('migrateState fills every sub-field of a partially stored section', () => {
  const state = migrateState({ formative: { answers: { q1: { evidence: 'ראיה' } } } });
  assert.equal(state.formative.answers.q1.evidence, 'ראיה');
  // The section was stored without these; they must come back as defaults, not undefined.
  assert.equal(state.formative.answers.q1.implementationPercent, '');
  assert.equal(state.formative.answers.q1.goalAchievement, '');
  assert.deepEqual(
    Object.keys(state.formative.answers.q6).sort(),
    Object.keys(emptyState.formative.answers.q6).sort(),
  );
});

test('migrateState maps a v1 free-text section onto the field that replaced it', () => {
  const state = migrateState({ formative: { answers: { q1: 'טקסט ישן', q2: 'עוד טקסט', q8: 'מה לא עבד' } } });
  assert.equal(state.formative.answers.q1.evidence, 'טקסט ישן');
  assert.equal(state.formative.answers.q2.evidence, 'עוד טקסט');
  assert.equal(state.formative.answers.q8.didNotWork, 'מה לא עבד');
  assert.equal(state.formative.answers.q3.notes, '');
});

test('migrateState survives sections that are not objects', () => {
  for (const broken of ['טקסט', 42, null, ['a'], true]) {
    const state = migrateState({ plan: broken, formative: { answers: { q3: broken }, context: broken }, summative: broken });
    assert.equal(state.plan.audience, '');
    assert.equal(state.formative.context.instructorName, '');
    assert.equal(state.formative.answers.q3.meetingRate, '');
    assert.equal(state.summative.achievement, '');
    // A spread string would leak character keys such as "0" into the section.
    assert.ok(!Object.keys(state.formative.answers.q3).includes('0'));
  }
});

test('migrateState rejects a non-array history', () => {
  assert.deepEqual(migrateState({ history: 'nope' }).history, []);
  assert.deepEqual(migrateState({ history: { a: 1 } }).history, []);
  assert.deepEqual(migrateState(null).history, []);
  assert.equal(migrateState(undefined).plan.audience, '');
});

test('loadStoredState prefers v2 and falls back to the v1 key', () => {
  let restore = stubStorage({ [STORAGE_KEY]: JSON.stringify({ plan: { audience: 'חדש' } }) });
  assert.equal(loadStoredState().state.plan.audience, 'חדש');
  restore();

  restore = stubStorage({ [LEGACY_KEY]: JSON.stringify({ plan: { audience: 'ישן' } }) });
  assert.equal(loadStoredState().state.plan.audience, 'ישן');
  restore();

  restore = stubStorage({
    [STORAGE_KEY]: JSON.stringify({ plan: { audience: 'חדש' } }),
    [LEGACY_KEY]: JSON.stringify({ plan: { audience: 'ישן' } }),
  });
  assert.equal(loadStoredState().state.plan.audience, 'חדש');
  restore();
});

test('loadStoredState separates a first visit from an unreadable save', () => {
  let restore = stubStorage({});
  assert.deepEqual(loadStoredState(), { state: emptyState, corrupted: false });
  restore();

  restore = stubStorage({ [STORAGE_KEY]: '{not json' });
  const broken = loadStoredState();
  assert.equal(broken.corrupted, true);
  assert.deepEqual(broken.state, emptyState);
  restore();
});

test('loadStoredState returns the empty state when there is no window', () => {
  assert.deepEqual(loadStoredState(), { state: emptyState, corrupted: false });
});

test('a write that only changes where she is does not read as an edit', () => {
  // The cross-tab warning is driven by this. SessionStageReset strips
  // manualStage on every page load, so without this comparison merely opening
  // a second tab told the first that its work was about to be overwritten.
  const base = JSON.stringify({ plan: { audience: 'א' }, history: [] });
  assert.equal(sameExceptNavigation(base, JSON.stringify({ plan: { audience: 'א' }, history: [], manualStage: 2 })), true);
  // gapStage is the second navigation field, added later — it was missed here
  // once already, which made the app's own gap-answer write raise the alarm.
  assert.equal(sameExceptNavigation(base, JSON.stringify({ plan: { audience: 'א' }, history: [], gapStage: { stage: 1, chosenAt: 'x' } })), true);
  assert.equal(sameExceptNavigation(base, JSON.stringify({ plan: { audience: 'שונה' }, history: [] })), false);
});

test('key order does not make two identical payloads look different', () => {
  // The two writers serialize from differently-shaped objects, so a plain
  // string compare would report every cross-tab write as an edit.
  assert.equal(sameExceptNavigation('{"a":1,"b":2}', '{"b":2,"a":1}'), true);
});

test('an empty payload is recognised however it was serialized', () => {
  // What a freshly-mounted tab autosaves, including the tab that survives a
  // delete — warning there announces the loss of a plan just deliberately erased.
  assert.equal(isEmptyPayload(JSON.stringify(emptyState)), true);
  assert.equal(isEmptyPayload(JSON.stringify({ ...emptyState, manualStage: 2 })), true);
  assert.equal(isEmptyPayload(JSON.stringify({ ...emptyState, plan: { ...emptyState.plan, audience: 'תוכן' } })), false);
});
