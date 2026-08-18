/**
 * Advisory reader for reflective answers that sound positive but carry no
 * evidence — R8 in docs/MARKET_READINESS.md.
 *
 * The manager was asked which answer would sound very good and still leave her
 * unable to decide anything, and named it exactly: *"היה תהליך משמעותי" בלי
 * דוגמה* (Q7). Her instruction was that the system should ask for a concrete
 * anchor when the phrasing is general.
 *
 * Like lib/smart-criteria.ts this is advisory and never blocks a save. It is
 * also deliberately quiet: a prompt that fires on a good answer teaches the
 * mentor to ignore it, and an ignored prompt is worse than none. So it fires
 * only when all three hold — the answer is a real attempt, it leans on
 * evaluative language, and it contains no anchor of any kind. Anything
 * borderline stays silent.
 */

/** Evaluative words that assert a judgement without saying what happened. */
const EVALUATIVE_MARKERS = [
  'משמעות', 'מצוין', 'מעולה', 'נהדר', 'מוצלח', 'חשוב', 'טוב', 'יפה', 'נפלא',
  'התקדמ', 'שיפור', 'השתפר', 'תהליך', 'חוויה', 'אווירה', 'תחושה', 'הרגש',
  'מרוצה', 'חיובי', 'אפקטיבי', 'פורה', 'עמוק', 'משתלם', 'כיף', 'נעים',
];

/**
 * Anything that ties a claim to something checkable: a count, a time, a named
 * setting, a reported utterance, or an explicit example.
 */
const ANCHOR_MARKERS = [
  'למשל', 'לדוגמה', 'לדוגמא', 'כאשר', 'אחרי ש', 'לפני ש', 'בעקבות',
  'שיעור', 'תצפית', 'כיתה', 'גן', 'מפגש', 'פגישה', 'ישיבה', 'הדרכה',
  'אמרה', 'אמר', 'ביקשה', 'ביקש', 'סיפרה', 'סיפר', 'שאלה', 'הראתה', 'הראה',
  'בחרה', 'בחר', 'יזמה', 'יזם', 'תכננה', 'תכנן', 'הפעילה', 'הפעיל',
  'פעמים', 'מתוך', 'לעומת', 'בשבוע', 'בחודש', 'ביום',
];

const HEBREW_MONTHS = ['ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני'];

/** Below this the text is a stub, not a claim — nudging it would be nagging, not helping. */
const MIN_WORDS_TO_JUDGE = 4;

export const ANCHOR_HINT = 'זה נשמע חיובי, אבל קשה לדעת ממה. אפשר להוסיף דוגמה אחת — מה קרה בפועל, אצל מי, ומתי?';

function words(text: string) {
  return text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

export function hasConcreteAnchor(text: string): boolean {
  // A digit is the strongest anchor there is, and the cheapest to check.
  if (/\d/.test(text)) return true;
  // Reported speech in quotes is a concrete event even without a keyword.
  if (/["״"'׳].{2,}["״"'׳]/.test(text)) return true;
  if (HEBREW_MONTHS.some((m) => text.includes(m))) return true;
  return ANCHOR_MARKERS.some((m) => text.includes(m));
}

export function readsAsEvaluative(text: string): boolean {
  return EVALUATIVE_MARKERS.some((m) => text.includes(m));
}

/**
 * True only for a substantive answer that asserts a judgement and grounds it in
 * nothing. Silence is the default for everything else.
 */
export function needsConcreteAnchor(text: string): boolean {
  const trimmed = text.trim();
  if (words(trimmed).length < MIN_WORDS_TO_JUDGE) return false;
  if (hasConcreteAnchor(trimmed)) return false;
  return readsAsEvaluative(trimmed);
}
