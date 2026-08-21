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

test('KNOWN LIMITATION, not fixed here: negation before a cadence word still matches it', () => {
  // Found by running a battery of realistic phrasings. There is no negation
  // scan — "לא שבועית" ("not weekly") still contains the token "שבועית" and
  // reads as weekly. A real fix means detecting a preceding לא/אין, which
  // has its own failure mode ("לא רק שבועי אלא גם..." still does mean
  // weekly) and adds real complexity to a conservative-by-design matcher for
  // a field that in practice holds a stated cadence, not a discussion of
  // rejected alternatives. Documented and left as-is rather than fixed
  // reflexively or left silently wrong.
  assert.equal(extractCadenceDays('פגישה חד פעמית, לא שבועית קבועה'), 7);
});

test('KNOWN LIMITATION, not fixed here: "שבועיים" bare is asymmetric with "שבועי" bare, on purpose', () => {
  // "שבועי"/"שבועית" (the weekly *adjective*) are listed as standalone
  // one-token phrases; there is no equivalent bare "שבועיים" entry for
  // biweekly. This is not an oversight to mirror — Hebrew has no single-word
  // adjective for "biweekly" the way it does for "weekly", and bare
  // "שבועיים" overwhelmingly means the plain duration "two weeks" ("חופש של
  // שבועיים"), not a recurrence claim. Adding it would trade one real false
  // positive (this case) for a more common one. A text naming both a weekly
  // *phrase* and a bare "שבועיים" therefore resolves to the weekly phrase,
  // not to null — the phrase list has no tie for the matcher to catch.
  assert.equal(extractCadenceDays('מדי שבוע, לפעמים שבועיים אם יש חג'), 7);
});
