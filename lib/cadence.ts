/**
 * Conservative cadence-phrase reader for plan.timeframe free text.
 *
 * The timeframe field already sometimes carries a cadence in prose
 * ("ספטמבר–ינואר, אחת לשבועיים") — the placeholder text invites exactly
 * that. Rather than adding a new field/question, this extracts an
 * approximate interval when a recognizable phrase is present, and
 * produces nothing when it isn't. A wrong guess here would actively
 * mislead (false session ticks on the Gantt), so silence beats a guess —
 * same principle as lib/smart-criteria.ts's word lists.
 *
 * Matching is done on whole tokens, not raw substrings: Hebrew's dual/
 * plural suffixes mean a naive `text.includes('שבוע')` would also fire
 * inside 'שבועיים' (two weeks) or 'דו-שבועי' (biweekly). When more than
 * one family matches, the longest (most specific) match wins — so 'דו
 * שבועי' correctly beats the bare 'שבועי' token it also contains. Only a
 * genuine tie between different intervals (e.g. text mentioning both a
 * weekly and a monthly cadence) falls back to null.
 *
 * These phrase lists are a first draft, same as CHANGE_VERB_STEMS in
 * smart-criteria.ts — extend them with real phrasing as it turns up.
 */

import { tokenize } from './hebrew-text';

type CadenceFamily = { days: number; label: string; phrases: string[] };

const CADENCE_FAMILIES: CadenceFamily[] = [
  { days: 7, label: 'כל שבוע', phrases: ['כל שבוע', 'אחת לשבוע', 'פעם בשבוע', 'מדי שבוע', 'שבועי', 'שבועית'] },
  { days: 14, label: 'אחת לשבועיים', phrases: ['כל שבועיים', 'אחת לשבועיים', 'פעם בשבועיים', 'מדי שבועיים', 'דו שבועי', 'דו שבועית'] },
  { days: 30, label: 'אחת לחודש', phrases: ['כל חודש', 'אחת לחודש', 'פעם בחודש', 'מדי חודש', 'חודשי', 'חודשית'] },
];

/** Whether `phrase`'s own tokens appear as a contiguous run inside `textTokens`. */
function phraseMatches(textTokens: string[], phraseTokens: string[]): boolean {
  for (let i = 0; i + phraseTokens.length <= textTokens.length; i += 1) {
    if (phraseTokens.every((t, j) => textTokens[i + j] === t)) return true;
  }
  return false;
}

export function extractCadenceDays(text: string): number | null {
  const textTokens = tokenize(text);
  if (!textTokens.length) return null;

  const matches: Array<{ days: number; tokenLength: number }> = [];
  for (const family of CADENCE_FAMILIES) {
    for (const phrase of family.phrases) {
      const phraseTokens = tokenize(phrase);
      if (phraseMatches(textTokens, phraseTokens)) matches.push({ days: family.days, tokenLength: phraseTokens.length });
    }
  }
  if (!matches.length) return null;

  const maxLength = Math.max(...matches.map((m) => m.tokenLength));
  const distinctDaysAtMaxSpecificity = new Set(matches.filter((m) => m.tokenLength === maxLength).map((m) => m.days));
  return distinctDaysAtMaxSpecificity.size === 1 ? [...distinctDaysAtMaxSpecificity][0] : null;
}

export function cadenceLabel(days: number): string {
  const family = CADENCE_FAMILIES.find((f) => f.days === days);
  return family?.label ?? `מפגשים כל ${days} ימים`;
}
