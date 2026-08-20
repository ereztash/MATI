import type { PlanRevision } from './plan-revisions';

export type Stage = 1 | 2 | 3;
export type Choice = '' | 'yes' | 'partial' | 'no';
export type Scale5 = 1 | 2 | 3 | 4 | 5 | null;
export type Scale10 = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | null;

export type Plan = {
  audience: string;
  smartGoal: string;
  metric1: string;
  metric2: string;
  timeframe: string;
  flexibility: string;
  managers: string;
  independence: string;
  nextSmallStep: string;
  identityFit: string;
  confidenceNeed: string;
  /**
   * Personal-Gantt date overrides: empty means "use the computed default
   * from buildPersonalGantt"; a non-empty ISO string is a date the mentor
   * chose herself by adjusting the mark on the timeline. Optional, and
   * never part of planReady/the save gate — a blank timeline is still a
   * complete plan.
   */
  smallStepDate: string;
  managerTouchDate: string;
  flexibilityCheckDate: string;
  savedAt?: string;
};

export type FormativeContext = {
  instructorName: string;
  framework: string;
  period: string;
  menteeCount: string;
  centralGoals: string;
};

export type FormativeAnswers = {
  q1: { goalAchievement: '' | 'none' | 'partial' | 'mostly' | 'full'; goalsAnswered: '' | 'under50' | '50-75' | '75-90' | '100'; measuresDefined: '' | 'all' | 'some' | 'no'; implementationPercent: string; evidence: string; };
  q2: { planAdjustments: Scale5; strategies: Scale5; heterogeneity: Scale5; frequency: '' | 'rarely' | 'sometimes' | 'regular' | 'independent'; evidence: string; };
  q3: { meetingRate: '' | 'under70' | '70-90' | '90-100'; meetingStructure: '' | 'always' | 'mostly' | 'sometimes' | 'never'; observations: '' | '0' | '1-2' | '3-5' | 'over5'; depth: '' | 'consistent' | 'shallow' | 'partial'; notes: string; };
  q4: { efficacy: Scale5; studentImpact: '' | 'none' | 'low' | 'medium' | 'high'; incidentReduction: '' | 'none' | 'slight' | 'significant' | 'notMeasured'; targetStudents: string; improvedStudents: string; evidence: string; };
  q5: { tailoring: Scale5; assessmentTools: Choice; adaptations: '' | '0' | '1-2' | '3-4' | 'over4'; other: string; plannedHours: string; actualHours: string; reflection: string; };
  q6: { teamFeedbackAsked: '' | 'yes' | 'no'; feedback1: string; feedback2: string; feedback3: string; feedbackTone: '' | 'positive' | 'mixed' | 'negative'; managerPlanned: string; managerActual: string; managerCommitment: '' | 'high' | 'medium' | 'low' | 'resistance'; resourcesAllocated: Choice; resourcesRequested: string; resourcesPercent: string; shortages: string; newProfessionalLanguage: Choice; culturePositiveSign: string; cultureStagnationSign: string; teacherRoomTraining: string; aidesTraining: string; };
  q7: { independence: '' | 'none' | 'partial' | 'most' | 'all'; dataBasedRecommendations: '' | 'yes' | 'no'; continuesWithoutDependency: Choice; evidence: string; };
  q8: { workedBetter: string; didNotWork: string; success1: string; success2: string; success3: string; centralMistake: string; flexibilityReflection: string; next1: string; next2: string; next3: string; };
  q9: { goals: Scale10; implementation: Scale10; teacherChange: Scale10; studentImpact: Scale10; sustainability: Scale10; };
};

export type PostReflection = { oneThing: string; feeling: string; nextCheck: string; };
export type Formative = { route: 'short' | 'full'; context: FormativeContext; answers: FormativeAnswers; post: PostReflection; savedAt?: string; };
export type Summative = { achievement: string; achievementMetric: string; turningPoint: string; nextYearChange: string; savedAt?: string; };
export type HistoryEntry = { at: string; stage: Stage; label: string; note: string; };
export type MatiState = {
  plan: Plan;
  formative: Formative;
  summative: Summative;
  history: HistoryEntry[];
  /** In-session override from the stage strip. Cleared on every load by design (app/session-stage-reset.tsx). */
  manualStage?: Stage;
  /**
   * Her answer to "which stage are you in?" during a calendar gap — a different
   * thing from `manualStage`, which is why it is a different field.
   *
   * Storing the gap answer as `manualStage` made it both too short-lived and
   * too long-lived at once, and both were verified in a browser: SessionStageReset
   * wiped it on every load, so the question was re-asked on every visit for the
   * four months a year the calendar has no answer; and nothing expired it, so a
   * stage picked in November was still being asserted as "את בשלב תכנון" in
   * December — the confident wrong assertion the gap screen exists to prevent.
   * Keeping `chosenAt` lets it outlive a reload and stop mattering the moment a
   * real window opens.
   */
  gapStage?: { stage: Stage; chosenAt: string };
  /** Before/after trail of substantive plan changes — see lib/plan-revisions.ts. */
  planRevisions: PlanRevision[];
  /** The plan exactly as it stood at the last save; the baseline each new save is diffed against. */
  lastSavedPlan?: Plan;
};

const emptyAnswers: FormativeAnswers = {
  q1: { goalAchievement: '', goalsAnswered: '', measuresDefined: '', implementationPercent: '', evidence: '' },
  q2: { planAdjustments: null, strategies: null, heterogeneity: null, frequency: '', evidence: '' },
  q3: { meetingRate: '', meetingStructure: '', observations: '', depth: '', notes: '' },
  q4: { efficacy: null, studentImpact: '', incidentReduction: '', targetStudents: '', improvedStudents: '', evidence: '' },
  q5: { tailoring: null, assessmentTools: '', adaptations: '', other: '', plannedHours: '', actualHours: '', reflection: '' },
  q6: { teamFeedbackAsked: '', feedback1: '', feedback2: '', feedback3: '', feedbackTone: '', managerPlanned: '', managerActual: '', managerCommitment: '', resourcesAllocated: '', resourcesRequested: '', resourcesPercent: '', shortages: '', newProfessionalLanguage: '', culturePositiveSign: '', cultureStagnationSign: '', teacherRoomTraining: '', aidesTraining: '' },
  q7: { independence: '', dataBasedRecommendations: '', continuesWithoutDependency: '', evidence: '' },
  q8: { workedBetter: '', didNotWork: '', success1: '', success2: '', success3: '', centralMistake: '', flexibilityReflection: '', next1: '', next2: '', next3: '' },
  q9: { goals: null, implementation: null, teacherChange: null, studentImpact: null, sustainability: null },
};

export const emptyState: MatiState = {
  plan: { audience: '', smartGoal: '', metric1: '', metric2: '', timeframe: '', flexibility: '', managers: '', independence: '', nextSmallStep: '', identityFit: '', confidenceNeed: '', smallStepDate: '', managerTouchDate: '', flexibilityCheckDate: '' },
  formative: { route: 'short', context: { instructorName: '', framework: '', period: '', menteeCount: '', centralGoals: '' }, answers: emptyAnswers, post: { oneThing: '', feeling: '', nextCheck: '' } },
  summative: { achievement: '', achievementMetric: '', turningPoint: '', nextYearChange: '' },
  history: [],
  planRevisions: [],
};

export const stageNames: Record<Stage, string> = { 1: 'תכנון', 2: 'הערכה מעצבת', 3: 'הערכה מסכמת' };

/**
 * The pilot's calendar windows, as data. `stageFromDate` and the labels the
 * gap picker shows both read this table, so a window cannot move in one
 * without moving in the other — previously the months lived here as `if`
 * branches while two hand-written copies of "דצמבר–פברואר" restated them in
 * JSX, and the months outside every window were described by nothing at all.
 */
const STAGE_WINDOWS: { stage: Stage; months: number[]; label: string }[] = [
  { stage: 1, months: [7, 8, 9], label: 'יולי–ספטמבר' },
  { stage: 2, months: [12, 1, 2], label: 'דצמבר–פברואר' },
  { stage: 3, months: [5, 6], label: 'מאי–יוני' },
];

export function stageFromDate(date = new Date()): Stage | null {
  const month = date.getMonth() + 1;
  return STAGE_WINDOWS.find((window) => window.months.includes(month))?.stage ?? null;
}

export function stageWindowLabel(stage: Stage): string {
  return STAGE_WINDOWS.find((window) => window.stage === stage)?.label ?? '';
}

/** A gap is at most two months; past this the stored answer is about a different one. */
const GAP_ANSWER_MAX_AGE_DAYS = 90;

export type StageResolution = { stage: Stage | null; source: 'manual' | 'calendar' | 'gap-answer' };

/**
 * The single answer to "which stage is she in?", replacing four hand-rolled
 * copies of `state.manualStage ?? stageFromDate() ?? 1` that had drifted apart —
 * the `?? 1` in them is what made the home screen assert "את בשלב תכנון"
 * through every gap month, and fixing one copy left the others asserting it.
 *
 * `null` means genuinely unknown, and callers are expected to ask rather than
 * guess. The calendar outranks her gap answer on purpose: once a real window
 * opens, the answer she gave about a gap is no longer about now.
 */
export function resolveStage(state: MatiState, now = new Date()): StageResolution {
  if (state.manualStage) return { stage: state.manualStage, source: 'manual' };
  const automatic = stageFromDate(now);
  if (automatic) return { stage: automatic, source: 'calendar' };
  const answered = state.gapStage;
  if (answered) {
    const ageDays = (now.getTime() - new Date(answered.chosenAt).getTime()) / 86_400_000;
    if (Number.isFinite(ageDays) && ageDays >= 0 && ageDays <= GAP_ANSWER_MAX_AGE_DAYS) {
      return { stage: answered.stage, source: 'gap-answer' };
    }
  }
  return { stage: null, source: 'calendar' };
}

export function smartGoalLooksValid(goal: string) {
  return Boolean(goal.trim());
}

export function planReady(plan: Plan) {
  return Boolean(plan.audience.trim() && smartGoalLooksValid(plan.smartGoal) && plan.metric1.trim() && plan.metric2.trim() && plan.timeframe.trim());
}

export function planSaved(state: MatiState) { return planReady(state.plan) && Boolean(state.plan.savedAt); }

function hasValue(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return true;
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasValue);
  return Boolean(value);
}

export function formativeStarted(formative: Formative) { return Object.values(formative.answers).some(hasValue); }
export function canOpenStage(stage: Stage, state: MatiState) { if (stage === 1) return true; if (stage === 2) return planSaved(state); return planSaved(state) && formativeStarted(state.formative); }
export function stage2SectionStarted(formative: Formative, id: keyof FormativeAnswers) { return hasValue(formative.answers[id]); }

/**
 * Why `canOpenStage` said no. Lives next to the rule rather than inside one
 * component's handler, because there are two ways into a stage change — the
 * stage strip and the calendar-gap picker — and only one of them used to check
 * at all: the picker wrote `manualStage` unconditionally, so a first visit in a
 * gap month could land on the summative screen with no plan, where the strip
 * then rendered that same stage as current *and* locked at once.
 */
export function stageLockReason(stage: Stage): string {
  return stage === 2
    ? 'כדי לעבור להערכה המעצבת, צריך קודם תוכנית עבודה שמורה עם קהל יעד, מטרת SMART, שני מדדים ומסגרת זמן. בואי נשלים את הבסיס בקצרה.'
    : 'כדי לעבור להערכה המסכמת, צריך קודם למלא לפחות חלק מההערכה המעצבת. גם מענה חלקי מספיק כדי ליצור בסיס.';
}

function num(value: string) { const cleaned = String(value).replace(/[^0-9.]/g, ''); const parsed = Number(cleaned); return Number.isFinite(parsed) && cleaned !== '' ? parsed : null; }
export function ratioPercent(actual: string, planned: string) { const a = num(actual); const p = num(planned); if (a === null || p === null || p <= 0) return null; return Math.round(Math.min(999, (a / p) * 100)); }
export function studentImprovementPercent(state: MatiState) { return ratioPercent(state.formative.answers.q4.improvedStudents, state.formative.answers.q4.targetStudents); }
export function managerMeetingPercent(state: MatiState) { return ratioPercent(state.formative.answers.q6.managerActual, state.formative.answers.q6.managerPlanned); }
export function fieldHoursPercent(state: MatiState) { return ratioPercent(state.formative.answers.q5.actualHours, state.formative.answers.q5.plannedHours); }

export function selfEffectivenessAverage(state: MatiState) {
  const values = Object.values(state.formative.answers.q9).filter((v): v is Exclude<Scale10, null> => typeof v === 'number');
  if (!values.length) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

function rangeScore(value: string, map: Record<string, number>) { return value && map[value] !== undefined ? map[value] : null; }
function averagePresent(values: Array<number | null | undefined>) { const present = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)); if (!present.length) return 0; return present.reduce((sum, v) => sum + v, 0) / present.length; }
function toStars(normalized: number) { return Math.max(2, Math.min(5, Math.round(2 + normalized * 3))); }

export type Dimension = { name: string; score: number; note: string; evidence: string[]; };

export function scoreDimensions(state: MatiState): Dimension[] {
  const a = state.formative.answers;
  const fieldPct = fieldHoursPercent(state);
  const managerPct = managerMeetingPercent(state);
  const studentPct = studentImprovementPercent(state);
  const impl = num(a.q1.implementationPercent);

  const reflectionEvidence = [state.plan.flexibility && 'הוגדרה מראש נקודת גמישות', a.q5.adaptations && a.q5.adaptations !== '0' && 'בוצעו התאמות בעקבות צורך או משוב', a.q8.centralMistake && 'נוסחה טעות מרכזית ולמידה ממנה', a.q8.flexibilityReflection && 'קיימת רפלקציה על גמישות וקשיחות'].filter(Boolean) as string[];
  const reflectionNorm = averagePresent([state.plan.flexibility ? 1 : 0, a.q5.adaptations ? (a.q5.adaptations === '0' ? 0.2 : 0.8) : null, a.q8.centralMistake ? 1 : null, a.q8.flexibilityReflection ? 1 : null]);

  const quantitativeEvidence = [state.plan.metric1 && 'הוגדר מדד הצלחה ראשון', state.plan.metric2 && 'הוגדר מדד הצלחה שני', impl !== null && `דווח אחוז מימוש: ${impl}%`, studentPct !== null && `שיפור תלמידים מחושב: ${studentPct}%`, selfEffectivenessAverage(state) !== null && 'קיים דירוג אפקטיביות עצמי מספרי'].filter(Boolean) as string[];
  const quantitativeNorm = averagePresent([state.plan.metric1 ? 1 : 0, state.plan.metric2 ? 1 : 0, impl !== null ? Math.min(1, impl / 100) : null, studentPct !== null ? Math.min(1, studentPct / 100) : null, selfEffectivenessAverage(state) !== null ? Math.min(1, (selfEffectivenessAverage(state) ?? 0) / 10) : null]);

  const implementationEvidence = [state.plan.timeframe && 'הוגדרה מסגרת זמן', a.q3.meetingRate && 'נמדדה תדירות המפגשים', fieldPct !== null && `מימוש שעות שטח: ${fieldPct}%`, a.q3.depth && 'תועד עומק היישום בשטח'].filter(Boolean) as string[];
  const implementationNorm = averagePresent([state.plan.timeframe ? 1 : 0, rangeScore(a.q3.meetingRate, { under70: .35, '70-90': .75, '90-100': .95 }), fieldPct !== null ? Math.min(1, fieldPct / 100) : null, rangeScore(a.q3.depth, { partial: .4, shallow: .45, consistent: 1 })]);

  const systemEvidence = [state.plan.managers && 'הוגדרה מעורבות מנהלים נדרשת', a.q6.teamFeedbackAsked === 'yes' && 'נאסף משוב שיטתי מהצוות', managerPct !== null && `מימוש פגישות מנהלים: ${managerPct}%`, a.q6.resourcesAllocated && 'תועד מצב הקצאת המשאבים', a.q6.culturePositiveSign && 'תועד סימן לשינוי בתרבות הארגונית'].filter(Boolean) as string[];
  const systemNorm = averagePresent([state.plan.managers ? 1 : 0, a.q6.teamFeedbackAsked ? (a.q6.teamFeedbackAsked === 'yes' ? 1 : .2) : null, managerPct !== null ? Math.min(1, managerPct / 100) : null, rangeScore(a.q6.resourcesAllocated, { no: .2, partial: .6, yes: 1 }), a.q6.culturePositiveSign ? 1 : null]);

  const independenceEvidence = [state.plan.independence && 'הוגדרה מראש עצמאות רצויה', a.q2.frequency === 'independent' && 'המודרך מיישם באופן עצמאי ועקבי', a.q7.independence && 'נמדדה עצמאות בסיום התהליך', a.q7.continuesWithoutDependency && 'נבדקה המשכיות ללא תלות גבוהה במדריכה'].filter(Boolean) as string[];
  const independenceNorm = averagePresent([state.plan.independence ? 1 : 0, rangeScore(a.q2.frequency, { rarely: .2, sometimes: .45, regular: .75, independent: 1 }), rangeScore(a.q7.independence, { none: .1, partial: .45, most: .8, all: 1 }), rangeScore(a.q7.continuesWithoutDependency, { no: .15, partial: .55, yes: 1 })]);

  return [
    { name: 'רפלקציה ולמידה', score: toStars(reflectionNorm), note: 'בקרה עצמית, גמישות ושינוי בעקבות תובנות', evidence: reflectionEvidence },
    { name: 'מדדים כמותיים', score: toStars(quantitativeNorm), note: 'צוותי מוקד, הוכחת שיפור ואיכות המדדים', evidence: quantitativeEvidence },
    { name: 'לוח זמנים ויישום', score: toStars(implementationNorm), note: 'אחוז מימוש, עקביות וזיהוי חסמים', evidence: implementationEvidence },
    { name: 'מערכת ואחריות', score: toStars(systemNorm), note: 'מנהלים, משאבים וחלוקת אחריות', evidence: systemEvidence },
    { name: 'אופרטיביות ועצמאות', score: toStars(independenceNorm), note: 'שינוי עקבי שממשיך גם בלי תלות גבוהה במדריכה', evidence: independenceEvidence },
  ];
}

export function formativeCompletion(state: MatiState) {
  const ids: Array<keyof FormativeAnswers> = state.formative.route === 'short' ? ['q1', 'q2', 'q5', 'q8', 'q9'] : ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'];
  const complete = ids.filter((id) => stage2SectionStarted(state.formative, id)).length;
  return Math.round((complete / ids.length) * 100);
}

export type InteractionProfile = { style: 'analytic' | 'intuitive' | 'mixed' | 'unknown'; pace: 'compact' | 'deep' | 'balanced'; tone: 'soft' | 'direct'; minimalism: boolean; overload: boolean; responseCount: number; };

function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string' && value.trim()) into.push(value.trim());
  else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach((v) => collectStrings(v, into));
  return into;
}

export function analyzeInteraction(state: MatiState): InteractionProfile {
  const texts = collectStrings({ plan: state.plan, formative: state.formative, summative: state.summative }).filter((t) => !/^\d+(\.\d+)?$/.test(t));
  const recent = texts.slice(-8);
  const responseCount = recent.length;
  const avg = recent.length ? recent.reduce((s, t) => s + t.length, 0) / recent.length : 0;
  const numeric = recent.filter((t) => /\d|%|אחוז|מדד|יעד|כמות|מספר/.test(t)).length;
  const narrative = recent.filter((t) => /כי|הרגש|קרה|שמתי לב|נראה לי|מצד|אבל|למדתי|הבנתי/.test(t) || t.length > 180).length;
  const negative = recent.filter((t) => /קשה|מתסכל|לא עובד|נכשל|כישלון|עומס|מותשת|תקוע|בעיה|התנגדות|אין זמן/.test(t)).length;
  const minimalTokens = recent.filter((t) => /^(כן|לא|בסדר|אוקיי|טוב|סבבה|אין|לא יודע[ה]?)$/i.test(t)).length;
  let style: InteractionProfile['style'] = 'unknown';
  if (responseCount >= 2) { if (numeric >= 2 && narrative === 0) style = 'analytic'; else if (narrative >= 2 && numeric === 0) style = 'intuitive'; else style = 'mixed'; }
  return { style, pace: avg > 170 ? 'deep' : avg > 0 && avg < 55 ? 'compact' : 'balanced', tone: negative >= 2 ? 'soft' : 'direct', minimalism: minimalTokens >= 2, overload: negative >= 3, responseCount };
}

export function implementationStatus(state: MatiState) {
  const direct = num(state.formative.answers.q1.implementationPercent);
  if (direct !== null) return Math.max(0, Math.min(100, Math.round(direct)));
  return rangeScore(state.formative.answers.q1.goalsAnswered, { under50: 40, '50-75': 63, '75-90': 83, '100': 100 });
}

export function hasLargeGoalResultGap(state: MatiState) {
  const impl = implementationStatus(state); const avg = selfEffectivenessAverage(state); const lowGoal = state.formative.answers.q1.goalAchievement === 'none' || state.formative.answers.q1.goalAchievement === 'partial';
  return Boolean(lowGoal && ((impl !== null && impl < 60) || (avg !== null && avg < 5.5)));
}

export function recommendedActions(state: MatiState) {
  const dims = [...scoreDimensions(state)].sort((a, b) => a.score - b.score); const lowest = dims[0]?.name; const actions: string[] = [];
  if (lowest === 'מדדים כמותיים') actions.push('בחרי צוות מוקד אחד והגדירי סימן אחד שאפשר לספור או להשוות לפני ואחרי.');
  if (lowest === 'מערכת ואחריות') actions.push('קבעי עם מנהל/ת החלטה אחת ברורה: איזה משאב, זמן או גיבוי נדרש ומי אחראי עליו.');
  if (lowest === 'אופרטיביות ועצמאות') actions.push('הגדירי פעולה אחת שהמודרך יבצע לבד במפגש הבא, ואת הראיה שתראה שהעצמאות גדלה.');
  if (lowest === 'לוח זמנים ויישום') actions.push('השווי בין מה שתוכנן למה שהתקיים בפועל ובחרי חסם אחד שניתן לשנות כבר במחזור הבא.');
  if (lowest === 'רפלקציה ולמידה') actions.push('בחרי התאמה אחת שעשית בעקבות משוב ותעדי מה השתנה בעקבותיה.');
  if (state.formative.answers.q6.teamFeedbackAsked === 'no') actions.push('אספי מהצוות שאלה אחת קבועה אחרי יישום: מה עזר, מה הפריע ומה צריך לשנות.');
  if (state.formative.answers.q7.continuesWithoutDependency === 'no') actions.push('העבירי בעלות על כלי אחד למודרך וקבעי נקודת בדיקה בלי לבצע במקומו.');
  return Array.from(new Set(actions)).slice(0, 3);
}

export function summarizeLongText(text: string) { const clean = text.replace(/\s+/g, ' ').trim(); if (clean.length <= 360) return ''; const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean); const summary = (sentences.slice(0, 2).join(' ') || clean).slice(0, 240); return `${summary}${summary.length < clean.length ? '…' : ''}`; }

export function rubricForNextYear(state: MatiState) {
  const dims = [...scoreDimensions(state)].sort((a, b) => a.score - b.score); const mistakes: string[] = [];
  if (state.formative.answers.q1.measuresDefined === 'no') mistakes.push('יעדים בלי מדדי הצלחה ברורים');
  if (state.formative.answers.q3.meetingRate === 'under70') mistakes.push('פער גבוה בין לוח הזמנים לתדירות המפגשים בפועל');
  if (state.formative.answers.q6.managerCommitment === 'low' || state.formative.answers.q6.managerCommitment === 'resistance') mistakes.push('תלות בתהליך בלי מחויבות מנהלים מספקת');
  if (state.formative.answers.q7.continuesWithoutDependency === 'no') mistakes.push('יישום שנשאר תלוי במדריכה');
  if (state.formative.answers.q8.centralMistake) mistakes.push(`הלמידה שהמדריכה עצמה סימנה: ${state.formative.answers.q8.centralMistake}`);
  return { focus: dims.slice(0, 2).map((d) => d.name), mistakes: mistakes.length ? mistakes.slice(0, 3) : ['לא זוהתה עדיין טעות חוזרת מתוך הנתונים שנאספו.'], questions: ['מה יהיה שונה אצל צוותי המוקד אם התוכנית באמת תעבוד?', 'איזו ראיה תאפשר לדעת שהשינוי קרה ולא רק שהפעילות התקיימה?', 'איזו בעלות צריכה לעבור למודרך או למנהל כדי שהשינוי יחזיק בלעדייך?'] };
}

/**
 * What "מחיקת המידע המקומי" is actually about to throw away — named, not generic.
 * A chaos-testing run (gremlins.js, tests/chaos) found that a single accepted
 * confirm() with no memory of what's at stake treats a real saved year the
 * same as an empty session; this is the honest content half of the fix, the
 * other half being that the deletion itself now needs two real in-app clicks
 * instead of one dialog a bot or a lucky mis-click can accept blindly.
 */
export function deleteStakes(state: MatiState): string {
  const parts: string[] = [];
  if (planSaved(state)) parts.push('תוכנית עבודה שמורה');
  if (state.formative.savedAt) parts.push('הערכה מעצבת שמורה');
  if (state.summative.savedAt) parts.push('הערכה מסכמת שמורה');
  if (state.history.length) parts.push(state.history.length === 1 ? 'נקודת דרך אחת בהיסטוריה' : `${state.history.length} נקודות דרך בהיסטוריה`);
  return parts.length ? `יימחקו לצמיתות: ${parts.join(', ')}.` : 'אין כרגע שום דבר שמור בדפדפן הזה — אפשר למחוק בלי לאבד עבודה.';
}
