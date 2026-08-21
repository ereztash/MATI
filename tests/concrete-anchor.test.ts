import test from 'node:test';
import assert from 'node:assert/strict';
import { hasConcreteAnchor, needsConcreteAnchor, readsAsEvaluative, SETTING_MARKERS } from '../lib/concrete-anchor';

test('the manager\'s own example is exactly what fires', () => {
  // Q7, verbatim: the answer that sounds very good and supports no decision.
  assert.equal(needsConcreteAnchor('היה תהליך משמעותי מאוד עם הצוות'), true);
});

test('a number anchors a claim, even a positive-sounding one', () => {
  assert.equal(needsConcreteAnchor('היה תהליך משמעותי, 3 מתוך 4 מורות בנו התאמה בעצמן'), false);
});

test('a reported action anchors a claim', () => {
  // Deliberately NOT "a named setting or reported action" any more: the setting
  // half of that rule was removed. Both cases below are carried by their verb
  // (בחרה / יזמה) and by למשל — the setting words they happen to contain no
  // longer contribute anything, which is the point.
  assert.equal(needsConcreteAnchor('היה תהליך משמעותי, בשיעור האחרון המורה בחרה התאמה לבד'), false);
  assert.equal(needsConcreteAnchor('התקדמות יפה, למשל היא יזמה שינוי בישיבת הצוות'), false);
});

test('quoted speech counts as concrete without any keyword', () => {
  assert.equal(hasConcreteAnchor('היא אמרה לי "אני כבר לא צריכה שתהיי בחדר"'), true);
});

test('stays silent on short answers — a stub is not a claim to challenge', () => {
  assert.equal(needsConcreteAnchor('טוב'), false);
  assert.equal(needsConcreteAnchor('היה טוב מאוד'), false);
  assert.equal(needsConcreteAnchor(''), false);
});

test('stays silent on a concrete answer that never evaluates anything', () => {
  // No praise to challenge; nudging here would just be nagging.
  assert.equal(needsConcreteAnchor('נפגשנו פעם בשבועיים לאורך הסמסטר הראשון'), false);
  assert.equal(needsConcreteAnchor('הצוות ביקש עוד זמן הכנה לפני כל מפגש חדש'), false);
});

test('evaluative and anchored are independent readings', () => {
  assert.equal(readsAsEvaluative('היה מצוין'), true);
  assert.equal(readsAsEvaluative('נפגשנו שלוש פעמים'), false);
  assert.equal(hasConcreteAnchor('היה מצוין'), false);
  assert.equal(hasConcreteAnchor('נפגשנו שלוש פעמים'), true);
});

test('a month name is a time anchor', () => {
  assert.equal(hasConcreteAnchor('התהליך היה משמעותי מאז דצמבר'), true);
  assert.equal(needsConcreteAnchor('התהליך היה משמעותי מאז דצמבר'), false);
});

test('naming a generic setting is not a concrete anchor — this is the R8 pattern itself', () => {
  // Found by running a battery of realistic reflective sentences against the
  // real function: כיתה / מפגש / פגישה / הדרכה used to be in ANCHOR_MARKERS,
  // which meant any evaluative sentence that happened to name where it took
  // place silently passed as "anchored" without saying what actually
  // happened — exactly the manager's Q7 example, just with a location word
  // added. A setting is not a fact; nothing here is checkable.
  assert.equal(needsConcreteAnchor('היה תהליך מצוין בכיתה, ממש שינוי משמעותי'), true);
  assert.equal(needsConcreteAnchor('הייתה הדרכה משמעותית מאוד השבוע'), true);
  assert.equal(needsConcreteAnchor('ראיתי שיפור מצוין אחרי הפגישה עם הצוות'), true);
});

test('the setting rule holds for every setting word, not just the ones removed first', () => {
  // The cull was half-applied on the first pass: שיעור and תצפית were left in
  // ANCHOR_MARKERS, so "היה תהליך מצוין בכיתה" nudged while the identical
  // "…בשיעור" stayed silent — the same word class giving opposite answers.
  // Asserting the rule over the whole list rather than over two sample
  // sentences is what makes re-adding one of them fail here.
  for (const setting of SETTING_MARKERS) {
    assert.equal(hasConcreteAnchor(`היה תהליך מצוין ב${setting} וממש משמעותי`), false, `${setting} must not anchor on its own`);
  }
});

test('a spelled-out count anchors, and a lookalike inside another word does not', () => {
  // Hebrew writes its small numbers as words and this field is typed by hand,
  // so "שלוש תצפיות" is as concrete as "3 תצפיות" — but the digit test cannot
  // see it, which is why removing the setting words made this sentence nudge.
  assert.equal(needsConcreteAnchor('היו שלוש תצפיות בכיתה והמורות דיווחו על שיפור משמעותי'), false);
  assert.equal(needsConcreteAnchor('אחרי המפגש הרביעי התהליך התחיל לזוז'), false);
  // The matcher is whole-word: a substring test would read "שש" inside
  // "חוששת" as a count and silence a sentence that is pure evaluation.
  assert.equal(needsConcreteAnchor('אני חוששת שהתהליך לא באמת משמעותי'), true);
});

test('peeling a Hebrew prefix must not manufacture a count out of an ordinary word', () => {
  // Whole-word matching is not enough on its own: stripping the prefix to let
  // "בשלושה" read as three also lets "העשרה" (enrichment — everyday
  // special-ed vocabulary) reach "עשרה" (ten), and "משני" (secondary) reach
  // "שני" (two). Both sentences are pure evaluation with no evidence, and both
  // were silently passing as anchored — the exact miss R8 exists to prevent.
  assert.equal(needsConcreteAnchor('הייתה העשרה משמעותית מאוד לצוות'), true);
  assert.equal(needsConcreteAnchor('התהליך היה משני ולא באמת משמעותי'), true);
  // The words still count when written as themselves, and prefixes still peel
  // for everything that has no such collision.
  assert.equal(needsConcreteAnchor('היו שני מפגשים והתהליך היה משמעותי'), false);
  assert.equal(needsConcreteAnchor('בשלושה מפגשים ראינו שיפור משמעותי'), false);
});

test('four words is enough to judge; three is still a stub', () => {
  // MIN_WORDS_TO_JUDGE is the line between "too short to be a claim" and "a
  // claim with no evidence". Both sides of it were unconstrained: every existing
  // case sat comfortably above or below.
  assert.equal(needsConcreteAnchor('היה תהליך משמעותי מאוד'), true, 'exactly four words is a claim');
  assert.equal(needsConcreteAnchor('היה תהליך משמעותי'), false, 'three is not yet one');
});

test('prefix peeling goes two letters deep, and deliberately no further', () => {
  // Two is what Hebrew actually stacks in this register — "והשלוש", "ובשלושה".
  assert.equal(needsConcreteAnchor('והשלוש מפגשים היו משמעותיים מאוד'), false, 'ו+ה peels to a real count');

  // Three does not, and that cap is the point rather than an oversight: each
  // extra letter peeled multiplies the surface on which an ordinary word
  // collides with a number, which is the failure NOT_REACHABLE_BY_PEELING
  // already exists to patch by hand. Deeper peeling would find a "count" here.
  assert.equal(needsConcreteAnchor('ובהשלוש מפגשים היו משמעותיים מאוד'), true);
});
