import test from 'node:test';
import assert from 'node:assert/strict';
import { independenceReading } from '../lib/independence';
import { MatiState } from '../lib/stages';
import { migrateState } from '../lib/state-storage';

const state = (partial: Record<string, unknown>): MatiState => migrateState(partial);
const answers = (a: Record<string, unknown>) => state({ formative: { answers: a } });

test('with nothing answered it reports unmeasured rather than guessing a direction', () => {
  const reading = independenceReading(answers({}));
  assert.equal(reading.verdict, 'unmeasured');
  assert.equal(reading.stopAndCheck, false, 'an unknown is never a warning');
  assert.deepEqual(reading.signals, []);
});

test('an unmeasured reading points back at what she planned, when she planned it', () => {
  const withPlan = independenceReading(state({ plan: { independence: 'שהמורה תבחר התאמה בלי לשאול אותי' } }));
  assert.ok(withPlan.note.includes('שהמורה תבחר התאמה בלי לשאול אותי'));
});

test('strong answers across the board read as growing independence', () => {
  const reading = independenceReading(answers({
    q7: { independence: 'most', continuesWithoutDependency: 'yes' },
    q2: { frequency: 'independent' },
  }));
  assert.equal(reading.verdict, 'growing');
  assert.equal(reading.stopAndCheck, false);
  assert.equal(reading.signals.length, 3);
  assert.ok(reading.signals.every((s) => s.level === 'strong'));
});

test('weak answers read as dependent', () => {
  const reading = independenceReading(answers({
    q7: { independence: 'none', continuesWithoutDependency: 'no' },
    q2: { frequency: 'rarely' },
  }));
  assert.equal(reading.verdict, 'dependent');
});

test('the manager\'s Q8 case: healthy implementation, no transfer — stop and check', () => {
  // "התהליך מתקדם, אך המורים ממשיכים להיות תלויים במדריכה."
  const reading = independenceReading(answers({
    q1: { implementationPercent: '85', goalAchievement: 'mostly' },
    q7: { independence: 'none', continuesWithoutDependency: 'no' },
  }));
  assert.equal(reading.stopAndCheck, true);
  assert.ok(reading.note.includes('לעצור'));
});

test('weak independence with no implementation figure does not manufacture the warning', () => {
  // Without the "looks productive" half there is no contradiction to flag; the
  // card still reports dependence, but it does not claim she is being misled.
  const reading = independenceReading(answers({ q7: { independence: 'none', continuesWithoutDependency: 'no' } }));
  assert.equal(reading.verdict, 'dependent');
  assert.equal(reading.stopAndCheck, false);
});

test('strong independence is never a stop-and-check, however good the rest looks', () => {
  const reading = independenceReading(answers({
    q1: { implementationPercent: '95', goalAchievement: 'full' },
    q7: { independence: 'all', continuesWithoutDependency: 'yes' },
    q2: { frequency: 'independent' },
  }));
  assert.equal(reading.stopAndCheck, false);
  assert.equal(reading.verdict, 'growing');
});

test('a partially answered section still yields a reading from what is there', () => {
  const reading = independenceReading(answers({ q7: { continuesWithoutDependency: 'partial' } }));
  assert.equal(reading.signals.length, 1);
  assert.equal(reading.verdict, 'mixed');
});
