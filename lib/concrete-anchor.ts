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
 * Settings — where something happened. Deliberately NOT anchors, and listed
 * here so the decision is explicit rather than an absence someone re-fills:
 * "היה תהליך מצוין בכיתה" or "הייתה הדרכה משמעותית" names a room, not a
 * checkable fact, so treating it as an anchor silences the R8 nudge on exactly
 * the ungrounded-praise pattern it exists to catch (Q7). They are near-universal
 * in this domain, so as vetoes they would mute most of what R8 is for. Nothing
 * reads this list; it exists to be read by a person.
 *
 * שיעור and תצפית belong to the same class and were left in the anchor list by
 * mistake when the rest were removed — so "היה תהליך מצוין בכיתה" nudged while
 * the identical "…בשיעור" stayed silent. Verified against the real function
 * before and after; both now behave the same way.
 *
 * Exported so the test can assert the rule directly instead of trusting that
 * nobody re-adds one of these to ANCHOR_MARKERS.
 */
export const SETTING_MARKERS = ['כיתה', 'גן', 'מפגש', 'פגישה', 'ישיבה', 'הדרכה', 'שיעור', 'תצפית'];

/**
 * Anything that ties a claim to something checkable: a reported utterance or
 * action, an explicit example, or a frequency.
 */
const ANCHOR_MARKERS = [
  'למשל', 'לדוגמה', 'לדוגמא', 'כאשר', 'אחרי ש', 'לפני ש', 'בעקבות',
  'אמרה', 'אמר', 'ביקשה', 'ביקש', 'סיפרה', 'סיפר', 'שאלה', 'הראתה', 'הראה',
  'בחרה', 'בחר', 'יזמה', 'יזם', 'תכננה', 'תכנן', 'הפעילה', 'הפעיל',
  // Reporting verbs: naming who said what about the change is as checkable as
  // a count. Their absence is why "המורות דיווחו על שיפור" read as unanchored.
  'דיווח', 'ציינה', 'ציין', 'שיתפה', 'שיתף', 'הציגה', 'הציג',
  'פעמים', 'מתוך', 'לעומת', 'בשבוע', 'בחודש', 'ביום',
];

/**
 * Hebrew spells its small numbers, and this is a field people write by hand —
 * "שלוש תצפיות" is exactly as concrete as "3 תצפיות", but the digit test in
 * hasConcreteAnchor cannot see it. Ordinals are here for the same reason: "המפגש
 * הרביעי" identifies one particular meeting.
 */
const SPELLED_QUANTITIES = new Set([
  'אחת', 'שתיים', 'שתי', 'שניים', 'שלוש', 'שלושה', 'ארבע', 'ארבעה', 'חמש', 'חמישה',
  'שש', 'שישה', 'שבע', 'שבעה', 'שמונה', 'תשע', 'תשעה', 'עשר', 'עשרה',
  'ראשון', 'ראשונה', 'שני', 'שנייה', 'שניה', 'שלישי', 'שלישית', 'רביעי', 'רביעית',
  'חמישי', 'חמישית', 'כולן', 'כולם', 'רובן', 'רובם',
]);

/** Single-letter particles Hebrew glues onto the front of a word: ו/ה/ב/ל/ש/מ/כ. */
const HEBREW_PREFIXES = 'והבלשמכ';

/**
 * Quantity words that are also the tail of an unrelated everyday word, so
 * peeling a prefix off reaches them by accident: "העשרה" (enrichment — ordinary
 * special-ed vocabulary) ends in "עשרה" (ten), and "משני" (secondary) ends in
 * "שני" (two). Both are pure evaluation with no evidence in them, and both were
 * silently reading as anchored, which is the exact failure the R8 nudge exists
 * to catch. They still count when written as themselves — "שני מורים" is a
 * count — they just cannot be arrived at by stripping letters.
 */
const NOT_REACHABLE_BY_PEELING = new Set(['עשרה', 'שני', 'שניה', 'שנייה']);

const HEBREW_MONTHS = ['ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר', 'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני'];

/** Below this the text is a stub, not a claim — nudging it would be nagging, not helping. */
const MIN_WORDS_TO_JUDGE = 4;

export const ANCHOR_HINT = 'זה נשמע חיובי, אבל קשה לדעת ממה. אפשר להוסיף דוגמה אחת — מה קרה בפועל, אצל מי, ומתי?';

function words(text: string) {
  return text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}

/**
 * Whole-word lookup, which the substring test the rest of this file uses cannot
 * do: `'שש'.includes` also matches inside "חוששת", turning a worry into a count.
 * JS word boundaries are defined over [A-Za-z0-9_], so `\b` is useless here —
 * hence tokenizing, then peeling up to two of Hebrew's glued-on single-letter
 * particles so "בשלושה" and "והשלוש" still read as the number they carry.
 */
function hasSpelledQuantity(text: string): boolean {
  const tokens = text.split(/[^֐-׿]+/).filter(Boolean);
  return tokens.some((token) => {
    for (let cut = 0; cut <= 2 && cut < token.length; cut += 1) {
      if (cut > 0 && !HEBREW_PREFIXES.includes(token[cut - 1])) break;
      const candidate = token.slice(cut);
      if (cut > 0 && NOT_REACHABLE_BY_PEELING.has(candidate)) continue;
      if (SPELLED_QUANTITIES.has(candidate)) return true;
    }
    return false;
  });
}

export function hasConcreteAnchor(text: string): boolean {
  // A digit is the strongest anchor there is, and the cheapest to check.
  if (/\d/.test(text)) return true;
  // Reported speech in quotes is a concrete event even without a keyword.
  if (/["״"'׳].{2,}["״"'׳]/.test(text)) return true;
  if (HEBREW_MONTHS.some((m) => text.includes(m))) return true;
  if (hasSpelledQuantity(text)) return true;
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
