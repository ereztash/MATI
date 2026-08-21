/**
 * Conservative month-range reader for `plan.timeframe` free text.
 *
 * The Gantt used to read this field only through `lib/cadence.ts` — pulling a
 * cadence phrase out of it and discarding the months. Measured before this
 * existed: "ספטמבר–ינואר", "אוקטובר–דצמבר", "לאורך כל השנה" and "נתחיל אחרי
 * החגים" all produced a byte-identical timeline (save date → 30 June) with the
 * three personal milestones on the same three dates, because their defaults
 * were fixed proportions of the program year. The one field that states when
 * her work actually happens changed nothing on the chart drawn from it, so a
 * מדריכה who wrote "אוקטובר–דצמבר" was shown "צעד קטן ראשון" on 3 September —
 * before her own plan begins.
 *
 * Same discipline as `cadence.ts`: whole-token matching, and silence rather
 * than a guess. A wrong window here is worse than none, because every personal
 * milestone is placed inside it.
 *
 * Deliberately requires TWO month mentions. A single month is genuinely
 * ambiguous in this field — "נתחיל בספטמבר", "עד ספטמבר" and "בספטמבר נעשה
 * סיכום" are a start, an end and a checkpoint, and nothing in the sentence
 * distinguishes them without reading the preposition, which is exactly the
 * kind of guessing this file exists to avoid.
 */

/**
 * Ordered by the school year the pilot runs on (July → June), not by the
 * calendar, so "ספטמבר–ינואר" reads as forwards rather than as a ten-month
 * jump backwards. Spelling variants are listed rather than stemmed: there are
 * twelve of them and they are not going to change.
 */
type MonthEntry = { ordinal: number; month: number; names: string[] };

const MONTHS: MonthEntry[] = [
  { ordinal: 0, month: 7, names: ['יולי'] },
  { ordinal: 1, month: 8, names: ['אוגוסט'] },
  { ordinal: 2, month: 9, names: ['ספטמבר'] },
  { ordinal: 3, month: 10, names: ['אוקטובר'] },
  { ordinal: 4, month: 11, names: ['נובמבר'] },
  { ordinal: 5, month: 12, names: ['דצמבר'] },
  { ordinal: 6, month: 1, names: ['ינואר'] },
  { ordinal: 7, month: 2, names: ['פברואר'] },
  { ordinal: 8, month: 3, names: ['מרץ', 'מרס'] },
  { ordinal: 9, month: 4, names: ['אפריל'] },
  { ordinal: 10, month: 5, names: ['מאי'] },
  { ordinal: 11, month: 6, names: ['יוני'] },
];

/** Single-letter Hebrew prefixes that attach to a month name: בספטמבר, מאוקטובר, ומאי. */
const PREFIXES = 'והבלשמכ';

import { tokenize } from './hebrew-text';
import { schoolYearPair } from './school-year';

export type PlanWindow = {
  start: Date;
  end: Date;
  /** Canonical spelling of the two months that bound it — 'ספטמבר–מרץ' even if she wrote 'מרס'. Her literal text stays in the milestone's `detail`. */
  label: string;
};

/**
 * The month a token names, after peeling at most one prefix letter.
 *
 * Only one letter, and only when what remains is a whole month name: peeling
 * greedily is how `lib/concrete-anchor.ts` manufactured counts out of ordinary
 * words, and the fix there was to bound the peel and check the remainder
 * against the real list rather than against a fragment of it.
 */
function monthOf(token: string): MonthEntry | null {
  for (const entry of MONTHS) {
    for (const name of entry.names) {
      if (token === name) return entry;
      if (token.length === name.length + 1 && token.endsWith(name) && PREFIXES.includes(token[0])) return entry;
    }
  }
  return null;
}

/** A month's calendar year within the school year that `anchor` belongs to. */
function yearFor(entry: MonthEntry, anchor: Date) {
  const { first, second } = schoolYearPair(anchor);
  return entry.month >= 7 ? first : second;
}

/**
 * The period she described, anchored to the school year of `anchor` (her save
 * date), or `null` when the text does not name two months in a readable order.
 */
export function extractPlanWindow(text: string, anchor: Date): PlanWindow | null {
  const mentioned = tokenize(text).map(monthOf).filter((m): m is MonthEntry => m !== null);
  if (mentioned.length < 2) return null;

  const from = mentioned[0];
  const to = mentioned[mentioned.length - 1];
  // Backwards or same-month ("מיוני עד ספטמבר", "ספטמבר–ספטמבר") is not a range
  // this can read with confidence, so it reads as none at all.
  if (to.ordinal <= from.ordinal) return null;

  const start = new Date(yearFor(from, anchor), from.month - 1, 1);
  const end = new Date(yearFor(to, anchor), to.month, 0, 23, 59, 59, 999);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  return { start, end, label: `${from.names[0]}–${to.names[0]}` };
}
