'use client';

import type { OrganizationalSignal, OrganizationalSignalKey } from '../lib/organizational-signals';
import { MIN_AGGREGATE_COHORT } from '../lib/organizational-signals';

const labels: Record<OrganizationalSignalKey, string> = {
  implementation_rate: 'שיעור מימוש',
  goal_attainment: 'השגת מטרות',
  meeting_execution: 'מימוש מפגשים',
  implementation_depth: 'עומק היישום',
  student_impact: 'השפעה על תלמידים',
  student_improvement_rate: 'שיעור תלמידים שהשתפרו',
  manager_meeting_rate: 'מימוש פגישות מנהל',
  manager_commitment: 'מחויבות הנהלה',
  resource_allocation: 'הקצאת משאבים',
  resource_allocation_rate: 'שיעור הקצאת משאבים',
  teacher_independence: 'עצמאות המורים',
  sustainability: 'המשכיות ללא תלות',
  team_feedback_presence: 'איסוף משוב צוות',
};

const valueLabels: Record<string, string> = {
  none: 'לא',
  no: 'לא',
  partial: 'חלקי',
  mostly: 'ברובו',
  full: 'מלא',
  low: 'נמוך',
  medium: 'בינוני',
  high: 'גבוה',
  resistance: 'התנגדות',
  under70: 'פחות מ־70%',
  '70-90': '70%–90%',
  '90-100': '90%–100%',
  shallow: 'שטחי',
  consistent: 'משמעותי ועקבי',
  rarely: 'לעיתים רחוקות',
  sometimes: 'לפעמים',
  regular: 'באופן קבוע',
  independent: 'עצמאי ועקבי',
  most: 'רובם',
  all: 'כולם',
  yes: 'כן',
  true: 'כן',
  false: 'לא',
};

function presentValue(signal: OrganizationalSignal) {
  if (typeof signal.value === 'number') return `${signal.value}%`;
  if (typeof signal.value === 'boolean') return signal.value ? 'כן' : 'לא';
  return valueLabels[signal.value] ?? signal.value;
}

export default function OrganizationalSignalPreview({ signals }: { signals: OrganizationalSignal[] }) {
  const visible = signals.slice(0, 6);

  return (
    <section className="signalTransparency" aria-labelledby="signal-transparency-title">
      <div className="signalTransparencyHead">
        <div>
          <span className="homeKicker">גבול המידע</span>
          <h2 id="signal-transparency-title">מה נשאר אצלך — ומה יכול בעתיד להיספר בלי לחשוף אותך</h2>
        </div>
        <span className="signalLocalOnly">כרגע: מקומי בלבד</span>
      </div>

      <div className="signalBoundaryGrid">
        <article className="signalBoundaryCard private">
          <span>נשאר פרטי</span>
          <h3>הרפלקציה עצמה</h3>
          <p>הטקסט החופשי, טעויות, תסכולים, ראיות כתובות, שמות ונקודות מפנה אינם נכנסים למסלול הארגוני.</p>
        </article>

        <article className="signalBoundaryCard aggregate">
          <span>יכול בעתיד להצטבר</span>
          <h3>רק מדדים מובנים</h3>
          {visible.length ? (
            <ul className="signalList">
              {visible.map((signal) => (
                <li key={signal.key}>
                  <span>{labels[signal.key]}</span>
                  <b>{presentValue(signal)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p>עדיין אין מספיק נתונים מובנים כדי להפיק signal.</p>
          )}
        </article>
      </div>

      <p className="signalRule">
        גם המדדים האלה לא נשלחים כרגע לשום מקום. בעתיד הם יוכלו להופיע רק בתמונה מצטברת, ורק אחרי לפחות {MIN_AGGREGATE_COHORT} משתתפות — לא כמידע אישי על מדריכה אחת.
      </p>
    </section>
  );
}
