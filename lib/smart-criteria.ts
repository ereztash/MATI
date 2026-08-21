import type { Plan } from './stages';

/**
 * Advisory SMART-criteria reader for the Stage 1 goal field.
 *
 * This is deliberately separate from `smartGoalLooksValid` in stages.ts and
 * never feeds `planReady`/`savePlan`. That function is content-only by
 * design (see the "no length floor" test in tests/stages.test.ts and the
 * HIDDEN_VALIDATOR_REQUIREMENT / SOURCE_DRIFT checks in
 * scripts/check-semantic-ux-contract.mjs) — a word-list heuristic over
 * Hebrew free text will always have false negatives, so it must stay
 * advisory guidance, not a save-blocking gate.
 *
 * Measurable and Time-bound are read from the sibling metric1/metric2/
 * timeframe fields, never from the goal text itself — the goal field
 * already asks the mentor not to duplicate that information in one
 * sentence (see README "עקרונות מוצר"). Achievable is not evaluated at
 * all: whether a goal is realistic depends on real-world context no word
 * list can see, so pretending to detect it would itself be the kind of
 * fabrication principle #3 (לא להמציא במקומות חסרים) rules out. It is
 * surfaced as a fixed reflective question instead of a pass/fail claim.
 *
 * The word lists below are a first draft, not a finished lexicon. Hebrew
 * verbs inflect heavily, so each family lists a few short stems chosen to
 * survive common conjugations (infinitive, present, gerund/noun form) —
 * this is substring matching, not morphology. Extend these arrays with
 * real phrasing seen from mentors; that is expected maintenance, not a bug
 * fix.
 */

/** Stems for "change/improvement" verbs common in Hebrew instructional-coaching goals. */
export const CHANGE_VERB_STEMS = [
  'שפר', // לשפר / משפרת / ישתפר / שיפור
  'הטמע', 'טמיע', // להטמיע / מטמיעה / הטמעה
  'הקנ', // להקנות / מקנה / הקניה
  'פתח', // לפתח / מפתחת / פיתוח
  'הגביר', 'מגביר', // להגביר / מגבירה
  'צמצם', 'מצמצ', // לצמצם / מצמצמת / צמצום
  'הכשיר', 'מכשיר', // להכשיר / מכשירה / הכשרה
  'יישם', 'מיישמ', 'ליישם', // ליישם / מיישמת / יישום
  'חיזק', 'מחזק', 'לחזק', // לחזק / מחזקת / חיזוק
  'הנחיל', 'מנחיל', // להנחיל / הנחלה
  'גיבש', 'מגבש', // לגבש / גיבוש
  'הרחיב', 'מרחיב', // להרחיב / הרחבה
  'קידם', 'מקדמ', 'לקדם', // לקדם / מקדמת / קידום
  'הוביל', 'מוביל', // להוביל / הובלה
  'שינ', // לשנות / משנה / שינוי
  'הפחית', 'מפחית', // להפחית / הפחתה
  'העל', // להעלות / מעלה / העלאה
  'בנ', // לבנות / בונה / בנייה
];

/** Population/context anchors — if the goal names one, it reads as tied to real practice even without echoing the audience field's exact wording. */
export const DOMAIN_ANCHOR_WORDS = [
  'תלמיד', 'תלמידה', 'תלמידים', 'תלמידות', 'ילד', 'ילדה', 'ילדים',
  'כיתה', 'גן', 'צוות', 'מורה', 'מורות', 'מורים', 'גננת', 'גננות',
  'מוקד', 'סייעת', 'סייעות', 'מודרך', 'מודרכת',
];

const STOPWORDS = new Set([
  'את', 'של', 'על', 'עם', 'כדי', 'גם', 'יותר', 'זה', 'זו', 'אלה', 'אלו',
  'כל', 'לא', 'רק', 'או', 'אבל', 'כי', 'אצל', 'בין', 'מה', 'איך', 'למה', 'אל',
]);

/** Below this many meaningful words, a goal reads as a generic gesture ("לשפר את ההוראה") rather than a specific claim. */
const MIN_SPECIFIC_CONTENT_WORDS = 3;

function normalize(text: string) {
  return text.replace(/[.,!?;:"'()״׳]/g, ' ').replace(/\s+/g, ' ').trim();
}

function contentWords(text: string): string[] {
  return normalize(text).split(' ').filter((w) => w.length >= 2 && !STOPWORDS.has(w));
}

function hasChangeVerb(text: string) {
  return CHANGE_VERB_STEMS.some((stem) => text.includes(stem));
}

function sharesWord(a: string[], b: string[]) {
  return a.some((w) => b.some((v) => v.length >= 3 && (w.includes(v) || v.includes(w))));
}

export type SmartLetter = 'specific' | 'measurable' | 'relevant' | 'timeBound';

/**
 * `pending` is not a softer `missing` — it is a different fact.
 *
 * Measurable and Time-bound are answered by the metric and timeframe fields,
 * which sit in later parts of the Stage 1 form. Reported as misses they read
 * as errors the mentor must fix in the goal sentence, on a screen where those
 * fields do not exist yet — which is precisely the trap that made a first-time
 * user believe the goal field was blocking her. An unreached field is not a
 * mistake, and marking it as one sends her looking for a problem that is not there.
 */
export type SmartCriterionStatus = 'met' | 'missing' | 'pending';

export type SmartCriterion = {
  letter: SmartLetter;
  label: string;
  status: SmartCriterionStatus;
  /** Convenience mirror of `status === 'met'`. */
  met: boolean;
  hint: string;
};

export type SmartEvaluation = {
  criteria: SmartCriterion[];
  metCount: number;
  missing: SmartCriterion[];
  /** Achievable is never claimed as detected — always the same reflective question. */
  achievableReflection: string;
};

const ACHIEVABLE_REFLECTION = 'אי אפשר לבדוק מהמילים אם המטרה ריאלית. שווה לשאול את עצמך: זו מטרה שאפשר להשיג במסגרת הזמן ושעות השטח שתכנני בהמשך?';

export function evaluateSmartGoal(plan: Plan): SmartEvaluation {
  const goal = plan.smartGoal.trim();
  const goalWords = contentWords(goal);
  const audienceWords = contentWords(plan.audience);

  const specificVerb = hasChangeVerb(goal);
  const specificContent = goalWords.length >= MIN_SPECIFIC_CONTENT_WORDS;
  const specificMet = Boolean(goal) && specificVerb && specificContent;
  const specificHint = !goal
    ? 'עדיין לא נכתבה מטרה.'
    : !specificVerb
    ? 'לא זיהיתי פועל שינוי ברור (למשל: לשפר / להטמיע / לחזק / ליישם). אפשר להוסיף מילה שאומרת מה בדיוק אמור לקרות?'
    : !specificContent
    ? 'המשפט קצר או כללי מדי (למשל "לשפר את ההוראה"). אפשר להוסיף מה בדיוק ישתפר ובאיזה תחום?'
    : 'ברור מה אמור להשתנות.';

  const measurableMet = Boolean(plan.metric1.trim() && plan.metric2.trim());
  const measurableHint = measurableMet
    ? 'שני מדדי הצלחה מוגדרים למטה.'
    : 'יושלם בשדות "מדד הצלחה" בהמשך הטופס — אין מה להוסיף כאן.';

  const hasDomainAnchor = goalWords.some((w) => DOMAIN_ANCHOR_WORDS.some((a) => w.includes(a) || a.includes(w)));
  const hasAudienceOverlap = audienceWords.length > 0 && sharesWord(goalWords, audienceWords);
  // An empty audience field is a gap in a different field, not evidence that
  // this goal is irrelevant — don't fail Relevant because of it.
  const relevantMet = Boolean(goal) && (hasDomainAnchor || hasAudienceOverlap || audienceWords.length === 0);
  const relevantHint = !goal
    ? 'עדיין לא נכתבה מטרה.'
    : relevantMet
    ? 'המטרה מתחברת לצוותי המוקד או לאוכלוסיית היעד.'
    : `המטרה לא מתחברת בבירור למי שהגדרת למעלה ("${plan.audience}"). כדאי לציין במפורש את מי היא אמורה לשנות.`;

  const timeBoundMet = Boolean(plan.timeframe.trim());
  const timeBoundHint = timeBoundMet
    ? 'מסגרת הזמן מוגדרת למטה.'
    : 'יושלם בשדה "מסגרת זמן" בהמשך הטופס — אין מה להוסיף כאן.';

  // Specific and Relevant are about the goal sentence itself, so an unmet one is
  // a real miss she can act on right here. Measurable and Time-bound belong to
  // sibling fields further down the form: unfilled means not-yet-reached, never wrong.
  const build = (letter: SmartLetter, label: string, met: boolean, hint: string, deferred = false): SmartCriterion =>
    ({ letter, label, status: met ? 'met' : deferred ? 'pending' : 'missing', met, hint });

  const criteria: SmartCriterion[] = [
    build('specific', 'ספציפית', specificMet, specificHint),
    build('measurable', 'מדידה', measurableMet, measurableHint, true),
    build('relevant', 'רלוונטית', relevantMet, relevantHint),
    build('timeBound', 'תחומה בזמן', timeBoundMet, timeBoundHint, true),
  ];

  return {
    criteria,
    metCount: criteria.filter((c) => c.met).length,
    // Only what she can actually act on counts as missing; a pending field is
    // another part of the form's job, not an outstanding problem with her goal.
    missing: criteria.filter((c) => c.status === 'missing'),
    achievableReflection: ACHIEVABLE_REFLECTION,
  };
}
