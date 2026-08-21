import test from 'node:test';
import assert from 'node:assert/strict';
import { extractPlanWindow } from '../lib/plan-window';

/** A plan saved in August 2026 — school year 2026/27. */
const SAVED = new Date(2026, 7, 15);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('a written month range becomes the window her plan actually covers', () => {
  const window = extractPlanWindow('ספטמבר–ינואר, אחת לשבועיים', SAVED)!;
  assert.equal(iso(window.start), '2026-09-01');
  assert.equal(iso(window.end), '2027-01-31', 'January belongs to the second half of the same school year');
  assert.equal(window.label, 'ספטמבר–ינואר');
});

test('the window is anchored to the school year, not the calendar year', () => {
  // The whole reason for an ordinal that starts in July: read as calendar
  // months, ספטמבר–ינואר is a ten-month jump backwards. Read as a school year
  // it is the ordinary five-month plan almost every מדריכה writes.
  const crossing = extractPlanWindow('מספטמבר עד פברואר', SAVED)!;
  assert.equal(iso(crossing.start), '2026-09-01');
  assert.equal(iso(crossing.end), '2027-02-28');

  const wholeFirstHalf = extractPlanWindow('יולי–דצמבר', SAVED)!;
  assert.equal(iso(wholeFirstHalf.start), '2026-07-01');
  assert.equal(iso(wholeFirstHalf.end), '2026-12-31', 'both months sit in the first calendar year');

  const wholeSecondHalf = extractPlanWindow('ינואר–יוני', SAVED)!;
  assert.equal(iso(wholeSecondHalf.start), '2027-01-01');
  assert.equal(iso(wholeSecondHalf.end), '2027-06-30', 'both months sit in the second');
});

test('February is read from the calendar rather than assumed', () => {
  const leap = extractPlanWindow('ספטמבר–פברואר', new Date(2027, 7, 15))!;
  assert.equal(iso(leap.end), '2028-02-29', '2028 is a leap year');
});

test('a month written with a Hebrew prefix still counts', () => {
  const prefixed = extractPlanWindow('מאוקטובר ועד לדצמבר', SAVED)!;
  assert.equal(iso(prefixed.start), '2026-10-01');
  assert.equal(iso(prefixed.end), '2026-12-31');
});

test('a prefix is peeled at most once, and only off a whole month name', () => {
  // The bounded peel is the lesson from lib/concrete-anchor.ts, where greedy
  // prefix-stripping turned העשרה (enrichment) into עשרה (ten). Two letters
  // must not reach a month name, and a longer word that merely ends in one
  // must not either.
  assert.equal(extractPlanWindow('וכשמאי יגיע נסכם, ובספטמבר נתחיל', SAVED), null);
  assert.equal(extractPlanWindow('הקיץ שלפנימאי ואחריוני', SAVED), null);
});

test('one month is not a range, because the sentence decides what it means', () => {
  // Start, end and checkpoint, none distinguishable without reading the
  // preposition. Silence beats a guess: every personal milestone is placed
  // inside whatever this returns.
  assert.equal(extractPlanWindow('נתחיל בספטמבר', SAVED), null);
  assert.equal(extractPlanWindow('עד ספטמבר', SAVED), null);
  assert.equal(extractPlanWindow('בספטמבר נעשה סיכום ביניים', SAVED), null);
});

test('text with no months at all reads as no window', () => {
  assert.equal(extractPlanWindow('נתחיל אחרי החגים ונראה איך זה זורם', SAVED), null);
  assert.equal(extractPlanWindow('לאורך כל השנה, אחת לחודש', SAVED), null);
  assert.equal(extractPlanWindow('', SAVED), null);
  assert.equal(extractPlanWindow('   ', SAVED), null);
});

test('a backwards or single-month range is refused rather than reordered', () => {
  // Reordering would silently turn "מיוני עד ספטמבר" — which is either a typo
  // or a different school year — into a confident five-month window.
  assert.equal(extractPlanWindow('מיוני עד ספטמבר', SAVED), null);
  assert.equal(extractPlanWindow('ספטמבר–ספטמבר', SAVED), null);
});

test('the first and last month named bound the window, whatever sits between', () => {
  const window = extractPlanWindow('נתחיל בספטמבר, נעצור בנובמבר לבדיקה, ונסיים בפברואר', SAVED)!;
  assert.equal(iso(window.start), '2026-09-01');
  assert.equal(iso(window.end), '2027-02-28');
  assert.equal(window.label, 'ספטמבר–פברואר');
});

test('מרס and מרץ are the same month', () => {
  const spelled = ['ספטמבר עד מרץ', 'ספטמבר עד מרס'].map((t) => extractPlanWindow(t, SAVED)!);
  assert.equal(iso(spelled[0].end), '2027-03-31');
  assert.equal(iso(spelled[1].end), iso(spelled[0].end));
});

test('July belongs to the school year it opens, not the one before it', () => {
  // The boundary of the whole ordinal scheme, and the pilot's Stage 1 window
  // opens in July — so a plan saved on 3 July is the ordinary case, not an edge
  // one. Getting this off by a month dates every milestone a full year early.
  const julySave = new Date(2026, 6, 3);
  const window = extractPlanWindow('ספטמבר–ינואר', julySave)!;
  assert.equal(iso(window.start), '2026-09-01');
  assert.equal(iso(window.end), '2027-01-31');

  // …and June, the last month of a school year, still belongs to the old one.
  const juneSave = new Date(2026, 5, 25);
  const fromJune = extractPlanWindow('ספטמבר–ינואר', juneSave)!;
  assert.equal(iso(fromJune.start), '2025-09-01');
  assert.equal(iso(fromJune.end), '2026-01-31');
});
