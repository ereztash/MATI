import type { MatiState, Stage } from './stages';

export type Daypart = 'early' | 'morning' | 'midday' | 'afternoon' | 'evening' | 'late';
export type StagePosition = 'early' | 'middle' | 'closing' | 'between';
export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'unknown';
export type SignalStrength = 'strong' | 'medium' | 'weak';
export type SupportIntensity = 'light' | 'balanced' | 'deep';

export type UsageContext = {
  sessionStartedAt: string;
  lastVisitAt?: string;
  device: DeviceClass;
};

export type ContextSignal = {
  id: string;
  strength: SignalStrength;
  fact: string;
  implication?: string;
};

export type CalendarContext = {
  daypart: Daypart;
  stage: Stage | null;
  stagePosition: StagePosition;
  daysToStageEnd: number | null;
};

export type ContextSnapshot = {
  calendar: CalendarContext;
  signals: ContextSignal[];
  contradictions: string[];
};

export type CoachStrategy = {
  intensity: SupportIntensity;
  density: 'compact' | 'standard' | 'expanded';
  preferredInput: 'closed-first' | 'mixed' | 'open-first';
  tone: 'soft' | 'direct';
  headline?: string;
  explanation: string[];
  nextPrompt?: string;
};

const DAY_MS = 86_400_000;

function localDate(year: number, monthIndex: number, day: number) {
  return new Date(year, monthIndex, day, 23, 59, 59, 999);
}

export function daypartFromHour(hour: number): Daypart {
  if (hour >= 5 && hour < 9) return 'early';
  if (hour >= 9 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 15) return 'midday';
  if (hour >= 15 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'late';
}

export function greetingForDaypart(daypart: Daypart) {
  if (daypart === 'early' || daypart === 'morning') return 'בוקר טוב';
  if (daypart === 'midday' || daypart === 'afternoon') return 'צהריים טובים';
  if (daypart === 'evening') return 'ערב טוב';
  return 'שלום';
}

function stageWindow(date: Date, stage: Stage | null) {
  const y = date.getFullYear();
  if (stage === 1) return { start: new Date(y, 6, 1), end: localDate(y, 8, 30) };
  if (stage === 3) return { start: new Date(y, 4, 1), end: localDate(y, 5, 30) };
  if (stage === 2) {
    if (date.getMonth() === 11) return { start: new Date(y, 11, 1), end: localDate(y + 1, 1, 28 + Number(new Date(y + 1, 1, 29).getMonth() === 1)) };
    return { start: new Date(y - 1, 11, 1), end: localDate(y, 1, 28 + Number(new Date(y, 1, 29).getMonth() === 1)) };
  }
  return null;
}

export function calendarContext(date: Date, stage: Stage | null): CalendarContext {
  const window = stageWindow(date, stage);
  if (!window) return { daypart: daypartFromHour(date.getHours()), stage, stagePosition: 'between', daysToStageEnd: null };
  const total = Math.max(1, window.end.getTime() - window.start.getTime());
  const elapsed = Math.max(0, Math.min(total, date.getTime() - window.start.getTime()));
  const ratio = elapsed / total;
  const stagePosition: StagePosition = ratio < 0.28 ? 'early' : ratio < 0.72 ? 'middle' : 'closing';
  const daysToStageEnd = Math.max(0, Math.ceil((window.end.getTime() - date.getTime()) / DAY_MS));
  return { daypart: daypartFromHour(date.getHours()), stage, stagePosition, daysToStageEnd };
}

function safeDate(value?: string) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.round(Math.abs(a.getTime() - b.getTime()) / DAY_MS));
}

function numeric(value: string) {
  const cleaned = String(value).replace(/[^0-9.]/g, '');
  const n = Number(cleaned);
  return cleaned && Number.isFinite(n) ? n : null;
}

export function findContradictions(state: MatiState) {
  const out: string[] = [];
  const a = state.formative.answers;
  const implementation = numeric(a.q1.implementationPercent);
  const lowIndependence = a.q7.independence === 'none' || a.q7.independence === 'partial' || a.q7.continuesWithoutDependency === 'no';
  if (implementation !== null && implementation >= 80 && lowIndependence) out.push('היישום גבוה יחסית, אבל העצמאות עדיין נמוכה — ייתכן שהעשייה מתקיימת בלי שהבעלות עוברת למודרך.');
  if ((a.q3.meetingRate === '90-100' || a.q3.meetingRate === '70-90') && (a.q3.depth === 'partial' || a.q3.depth === 'shallow')) out.push('רוב המפגשים התקיימו, אבל עומק היישום נמוך — הכמות לבדה לא מסבירה את התוצאה.');
  if (a.q6.managerCommitment === 'high' && (a.q6.resourcesAllocated === 'no' || a.q6.resourcesAllocated === 'partial')) out.push('יש מחויבות מנהלים מדווחת, אך המשאבים לא הוקצו במלואם — שווה לברר את פער התרגום מהסכמה לפעולה.');
  if (a.q2.frequency === 'independent' && (a.q7.independence === 'none' || a.q7.continuesWithoutDependency === 'no')) out.push('יש דיווח על יישום עצמאי לצד תלות גבוהה בהמשך — שתי הראיות מצביעות לכיוונים שונים ודורשות בירור.');
  return out;
}

export function buildContextSnapshot(args: {
  state: MatiState;
  activeStage: Stage;
  automaticStage: Stage | null;
  usage: UsageContext;
  now?: Date;
}): ContextSnapshot {
  const now = args.now ?? new Date();
  const cal = calendarContext(now, args.automaticStage);
  const lastVisit = safeDate(args.usage.lastVisitAt);
  const sessionStart = safeDate(args.usage.sessionStartedAt) ?? now;
  const sessionMinutes = Math.max(0, Math.round((now.getTime() - sessionStart.getTime()) / 60_000));
  const signals: ContextSignal[] = [];

  if (cal.stage === args.activeStage) {
    signals.push({ id: 'calendar-stage', strength: 'strong', fact: `לוח השנה מצביע על שלב ${args.activeStage}.` });
    if (cal.stagePosition === 'closing' && cal.daysToStageEnd !== null) signals.push({ id: 'stage-closing', strength: 'strong', fact: `נותרו כ־${cal.daysToStageEnd} ימים לחלון השלב.`, implication: 'להעדיף סגירה והכרעה על פני הרחבת חקירה.' });
    else if (cal.stagePosition === 'early') signals.push({ id: 'stage-early', strength: 'medium', fact: 'אנחנו בתחילת חלון השלב.', implication: 'אפשר להשאיר יותר מרחב לבנייה ולחקירה.' });
  } else if (cal.stage === null) {
    signals.push({ id: 'calendar-between', strength: 'strong', fact: 'התאריך נמצא בין חלונות הגאנט.', implication: 'לא להסיק שלב בלי בחירה או היסטוריה.' });
  }

  if (lastVisit) {
    const gap = daysBetween(lastVisit, now);
    if (gap >= 14) signals.push({ id: 'return-gap', strength: 'strong', fact: `החזרה היא אחרי כ־${gap} ימים.`, implication: 'להזכיר בקצרה את נקודת העצירה לפני שממשיכים.' });
    else if (gap >= 3) signals.push({ id: 'return-gap', strength: 'medium', fact: `עברו כ־${gap} ימים מהכניסה הקודמת.` });
  }

  if (args.usage.device === 'mobile') signals.push({ id: 'device-mobile', strength: 'medium', fact: 'העבודה נעשית כרגע ממסך קטן.', implication: 'להעדיף מקטע אחד בכל פעם ובחירות סגורות כשאפשר.' });
  if (sessionMinutes >= 22) signals.push({ id: 'long-session', strength: 'medium', fact: `הסשן הנוכחי נמשך כ־${sessionMinutes} דקות.`, implication: 'להציע נקודת עצירה או שמירה לפני פתיחת עומק נוסף.' });
  if (cal.daypart === 'late') signals.push({ id: 'late-hour', strength: 'weak', fact: 'הכניסה היא בשעה מאוחרת.', implication: 'זה signal חלש בלבד; לא להסיק עייפות ללא סימנים נוספים.' });

  const contradictions = findContradictions(args.state);
  contradictions.forEach((fact, index) => signals.push({ id: `discrepancy-${index}`, strength: 'strong', fact, implication: 'לברר את הפער לפני המלצה.' }));

  return { calendar: cal, signals, contradictions };
}

export function deriveCoachStrategy(snapshot: ContextSnapshot): CoachStrategy {
  const strong = snapshot.signals.filter((s) => s.strength === 'strong');
  const medium = snapshot.signals.filter((s) => s.strength === 'medium');
  const has = (id: string) => snapshot.signals.some((s) => s.id === id);
  const closing = snapshot.calendar.stagePosition === 'closing';
  const discrepancy = snapshot.contradictions.length > 0;
  const observedLoad = has('long-session') || (has('late-hour') && has('device-mobile'));

  let intensity: SupportIntensity = observedLoad ? 'light' : 'balanced';
  let density: CoachStrategy['density'] = has('device-mobile') ? 'compact' : 'standard';
  let preferredInput: CoachStrategy['preferredInput'] = has('device-mobile') ? 'closed-first' : 'mixed';

  if (closing) {
    intensity = intensity === 'light' ? 'light' : 'balanced';
    density = 'standard';
  }

  const explanation = [...strong, ...medium].slice(0, 3).map((s) => s.fact);
  let headline: string | undefined;
  let nextPrompt: string | undefined;

  if (discrepancy) {
    headline = 'יש כאן פער ששווה לעצור עליו לפני שממשיכים.';
    nextPrompt = snapshot.contradictions[0];
  } else if (closing) {
    headline = 'אנחנו קרובות לסוף חלון השלב — עדיף לסגור את מה שמשנה החלטה.';
  } else if (has('return-gap')) {
    headline = 'חזרת אחרי הפסקה; נתחיל מנקודת העצירה ולא מהתחלה.';
  } else if (observedLoad) {
    headline = 'אפשר לעבוד עכשיו במצב ממוקד וקצר.';
  }

  return { intensity, density, preferredInput, tone: 'direct', headline, explanation, nextPrompt };
}

export function sessionMinutes(usage: UsageContext, now = new Date()) {
  const start = safeDate(usage.sessionStartedAt);
  return start ? Math.max(0, Math.round((now.getTime() - start.getTime()) / 60_000)) : 0;
}
