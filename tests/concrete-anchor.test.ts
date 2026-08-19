import test from 'node:test';
import assert from 'node:assert/strict';
import { hasConcreteAnchor, needsConcreteAnchor, readsAsEvaluative } from '../lib/concrete-anchor';

test('the manager\'s own example is exactly what fires', () => {
  // Q7, verbatim: the answer that sounds very good and supports no decision.
  assert.equal(needsConcreteAnchor('היה תהליך משמעותי מאוד עם הצוות'), true);
});

test('a number anchors a claim, even a positive-sounding one', () => {
  assert.equal(needsConcreteAnchor('היה תהליך משמעותי, 3 מתוך 4 מורות בנו התאמה בעצמן'), false);
});

test('a named setting or reported action anchors a claim', () => {
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
