import type { MatiState } from './stages';
import { implementationStatus } from './stages';

/**
 * Independence reading — R9 in docs/MARKET_READINESS.md.
 *
 * Asked which single figure would make her stop and look even when the rest of
 * the picture seemed fine, the manager answered "אין עלייה בעצמאות": the process
 * advances while the teachers stay dependent on the מדריכה (Q8). Asked what she
 * would most want to know at the end of the pilot that she does not know today,
 * she answered "איפה הדרכה מייצרת עצמאות — ואיפה תלות" (Q30).
 *
 * Those two answers ask for something a five-dimension star grid cannot do.
 * Independence was already one score among five, which is exactly where a
 * stop-and-look signal goes to die: a weak fifth star reads as a rough edge on
 * an otherwise good report. This surfaces it on its own terms, and in
 * particular detects the case she named — weak independence *alongside* healthy
 * implementation, which is the combination a summary average hides best.
 */

export type IndependenceLevel = 'strong' | 'partial' | 'weak' | 'unmeasured';

export type IndependenceSignal = {
  label: string;
  reading: string;
  level: IndependenceLevel;
};

export type IndependenceReading = {
  signals: IndependenceSignal[];
  /** Overall direction across whichever signals were actually answered. */
  verdict: 'growing' | 'mixed' | 'dependent' | 'unmeasured';
  /**
   * The manager's Q8 case: the work looks like it is landing, but nothing has
   * transferred. True only when both halves are actually measured — an unknown
   * is not a warning.
   */
  stopAndCheck: boolean;
  headline: string;
  note: string;
};

const LEVEL_SCORE: Record<Exclude<IndependenceLevel, 'unmeasured'>, number> = { weak: 0, partial: 0.5, strong: 1 };

function signal(label: string, value: string, map: Record<string, { reading: string; level: IndependenceLevel }>): IndependenceSignal | null {
  const hit = map[value];
  return hit ? { label, reading: hit.reading, level: hit.level } : null;
}

export function independenceReading(state: MatiState): IndependenceReading {
  const a = state.formative.answers;

  const signals = [
    signal('עצמאות המודרך בתחומים שנלמדו', a.q7.independence, {
      none: { reading: 'עדיין לא פועל עצמאית', level: 'weak' },
      partial: { reading: 'עצמאי חלקית', level: 'partial' },
      most: { reading: 'עצמאי ברוב התחומים', level: 'strong' },
      all: { reading: 'עצמאי בכל התחומים', level: 'strong' },
    }),
    signal('המשכיות ללא תלות במדריכה', a.q7.continuesWithoutDependency, {
      no: { reading: 'הצוותים מפסיקים ליישם בלעדייך', level: 'weak' },
      partial: { reading: 'ממשיכים חלקית', level: 'partial' },
      yes: { reading: 'ממשיכים ליישם גם בלעדייך', level: 'strong' },
    }),
    signal('תדירות יישום עצמאי של כלים', a.q2.frequency, {
      rarely: { reading: 'לעיתים רחוקות', level: 'weak' },
      sometimes: { reading: 'לעיתים', level: 'partial' },
      regular: { reading: 'באופן קבוע', level: 'partial' },
      independent: { reading: 'באופן עצמאי ועקבי', level: 'strong' },
    }),
  ].filter(Boolean) as IndependenceSignal[];

  if (!signals.length) {
    return {
      signals: [],
      verdict: 'unmeasured',
      stopAndCheck: false,
      headline: 'עצמאות עדיין לא נמדדה',
      note: state.plan.independence.trim()
        ? `בתכנון הגדרת שעצמאות תיראה כך: "${state.plan.independence.trim()}". שווה לענות על סעיף 7 כדי לבדוק אם זה קרה.`
        : 'זה הנתון שהכי קשה להשלים בדיעבד. כדאי לענות על סעיף 7 — עצמאות והמשכיות — גם באומדן גס.',
    };
  }

  const average = signals.reduce((sum, s) => sum + LEVEL_SCORE[s.level as Exclude<IndependenceLevel, 'unmeasured'>], 0) / signals.length;
  const verdict = average >= 0.75 ? 'growing' : average <= 0.25 ? 'dependent' : 'mixed';

  // Only compare against implementation when implementation was actually
  // reported; treating "not measured" as "looks fine" would invent the warning.
  const implementation = implementationStatus(state);
  const goalsLookFine = a.q1.goalAchievement === 'mostly' || a.q1.goalAchievement === 'full';
  const looksProductive = (implementation !== null && implementation >= 70) || goalsLookFine;
  const stopAndCheck = verdict !== 'growing' && looksProductive;

  const headline = verdict === 'growing'
    ? 'ההדרכה מייצרת עצמאות'
    : verdict === 'dependent'
    ? 'היישום עדיין תלוי בך'
    : 'עצמאות חלקית — לא הכול עבר לשטח';

  const note = stopAndCheck
    ? 'זו הנקודה שכדאי לעצור עליה: המדדים נראים סבירים, אבל מה שנבנה עדיין נשען עלייך. תוכנית שמצליחה בזמן שהיא מתקיימת ונעצרת כשאת יוצאת מהחדר לא השאירה שינוי — היא השאירה נוכחות.'
    : verdict === 'growing'
    ? 'זה הסימן החזק ביותר לכך שההדרכה עשתה את שלה: מה שנבנה ממשיך לפעול גם בלעדייך.'
    : verdict === 'dependent'
    ? 'לפני שמוסיפים פעילות, כדאי לבדוק איזו בעלות אחת אפשר להעביר למודרך או למנהל/ת כבר במחזור הבא.'
    : 'חלק מהיישום כבר עומד בפני עצמו וחלק לא. שווה לזהות מה בדיוק ההבדל בין השניים — שם נמצא המנגנון.';

  return { signals, verdict, stopAndCheck, headline, note };
}
