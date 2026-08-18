import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCadenceDays, cadenceLabel } from '../lib/cadence';

test('recognizes each cadence family from natural phrasing', () => {
  assert.equal(extractCadenceDays('ספטמבר–ינואר, אחת לשבועיים'), 14); // the app's own placeholder example
  assert.equal(extractCadenceDays('נפגשות כל שבוע בבוקר'), 7);
  assert.equal(extractCadenceDays('מפגש שבועי קבוע'), 7);
  assert.equal(extractCadenceDays('פעם בחודש, יום שני'), 30);
  assert.equal(extractCadenceDays('מדי חודש בסוף החודש'), 30);
});

test('returns null when there is no recognizable cadence phrase', () => {
  assert.equal(extractCadenceDays(''), null);
  assert.equal(extractCadenceDays('ספטמבר–ינואר'), null);
  assert.equal(extractCadenceDays('לפי הצורך'), null);
});

test('returns null on genuinely conflicting cadence phrases rather than guessing', () => {
  assert.equal(extractCadenceDays('בהתחלה אחת לשבוע ובהמשך אחת לחודש'), null);
});

test('a more specific phrase wins over a shorter one it happens to contain', () => {
  // "דו שבועי" (biweekly) contains the standalone weekly token "שבועי" —
  // the longer, more specific match must win, not read as ambiguous.
  assert.equal(extractCadenceDays('מפגשים דו-שבועי לאורך התהליך'), 14);
  assert.equal(extractCadenceDays('מפגשים כל שבועיים לאורך התהליך'), 14);
  // "שבועיים" (two weeks) must not be misread as containing "שבוע" (a week).
  assert.equal(extractCadenceDays('נפגשות פעם בשבועיים'), 14);
});

test('cadenceLabel matches the family a given interval came from', () => {
  assert.equal(cadenceLabel(7), 'כל שבוע');
  assert.equal(cadenceLabel(14), 'אחת לשבועיים');
  assert.equal(cadenceLabel(30), 'אחת לחודש');
  assert.equal(cadenceLabel(3), 'מפגשים כל 3 ימים'); // an interval outside the known families still renders something sane
});
