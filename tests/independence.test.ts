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

/* ------------------------------------------------------------------------- *
 * The verdict arithmetic and the three readings it selects.
 *
 * The tests above drive realistic whole answers; a mutation sweep found that
 * none of them constrained where one verdict ends and the next begins, nor
 * which of the three headlines and notes belongs to which verdict. This is the
 * screen that tells a מדריכה whether a year of work left anything behind, so
 * the wrong reading attached to the right numbers is the failure that matters.
 * ------------------------------------------------------------------------- */

const readingOf = (answers: Record<string, unknown>) => independenceReading(migrateState({ formative: { answers } }));

test('the verdict boundaries include their own edge', () => {
  // weak 0, partial 0.5, strong 1 — so two answered signals can land exactly on
  // 0.75 and exactly on 0.25, which is the only way to reach these two edges.
  assert.equal(readingOf({ q7: { independence: 'all', continuesWithoutDependency: 'partial' } }).verdict, 'growing',
    'an average of exactly 0.75 is already growing');
  assert.equal(readingOf({ q7: { independence: 'none', continuesWithoutDependency: 'partial' } }).verdict, 'dependent',
    'an average of exactly 0.25 is already dependent');
  assert.equal(readingOf({ q7: { independence: 'partial' } }).verdict, 'mixed');
});

test('each verdict carries its own headline and its own note', () => {
  const CASES: Array<[string, Record<string, unknown>, string, string]> = [
    ['growing', { q7: { independence: 'all', continuesWithoutDependency: 'yes' } },
      'ההדרכה מייצרת עצמאות', 'זה הסימן החזק ביותר'],
    ['dependent', { q7: { independence: 'none', continuesWithoutDependency: 'no' } },
      'היישום עדיין תלוי בך', 'לפני שמוסיפים פעילות'],
    ['mixed', { q7: { independence: 'partial' } },
      'עצמאות חלקית — לא הכול עבר לשטח', 'חלק מהיישום כבר עומד בפני עצמו'],
  ];
  for (const [verdict, answers, headline, notePrefix] of CASES) {
    const reading = readingOf(answers);
    assert.equal(reading.verdict, verdict);
    assert.equal(reading.headline, headline, `${verdict} must carry its own headline`);
    assert.ok(reading.note.startsWith(notePrefix), `${verdict} must carry its own note, got: ${reading.note.slice(0, 40)}`);
  }
});

test('"looks productive" has an exact cut-off, and either route into it is enough', () => {
  // stopAndCheck is the warning that the numbers look fine while nothing was
  // handed over. It needs the work to LOOK productive, by either of two
  // independent readings — a reported implementation percentage at or above 70,
  // or a goal answer of "mostly"/"full" — and each of those was unconstrained.
  const stopFor = (answers: Record<string, unknown>) => readingOf({ q7: { independence: 'none' }, ...answers }).stopAndCheck;

  assert.equal(stopFor({ q1: { implementationPercent: '70' } }), true, '70 already counts as productive');
  assert.equal(stopFor({ q1: { implementationPercent: '69' } }), false);
  assert.equal(stopFor({ q1: { implementationPercent: '30' } }), false,
    'a reported LOW percentage must not count merely because it was reported');

  assert.equal(stopFor({ q1: { goalAchievement: 'mostly' } }), true, 'goals alone are enough');
  assert.equal(stopFor({ q1: { goalAchievement: 'full' } }), true);
  assert.equal(stopFor({ q1: { goalAchievement: 'partial' } }), false);

  // And growing independence is never a stop-and-check, however good the rest looks.
  assert.equal(readingOf({ q7: { independence: 'all', continuesWithoutDependency: 'yes' }, q1: { implementationPercent: '90' } }).stopAndCheck, false);
});
