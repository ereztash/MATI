'use client';

import { useEffect, useMemo, useState } from 'react';
import type { OrganizationalSignal, OrganizationalSignalKey } from '../lib/organizational-signals';
import { MIN_AGGREGATE_COHORT } from '../lib/organizational-signals';
import { createOrganizationalPack } from '../lib/organizational-pack';
import { downloadJson } from '../lib/download-json';

const CONTRIBUTOR_KEY = 'mati-organizational-contributor-id-v1';
const CONTEXT_CODE_KEY = 'mati-organizational-context-code-v1';

const labels: Record<OrganizationalSignalKey, string> = {
  implementation_rate: 'שיעור מימוש', goal_attainment: 'השגת מטרות', meeting_execution: 'מימוש מפגשים',
  implementation_depth: 'עומק היישום', student_impact: 'השפעה על תלמידים', student_improvement_rate: 'שיעור תלמידים שהשתפרו',
  manager_meeting_rate: 'מימוש פגישות מנהל', manager_commitment: 'מחויבות הנהלה', resource_allocation: 'הקצאת משאבים',
  resource_allocation_rate: 'שיעור הקצאת משאבים', teacher_independence: 'עצמאות המורים', sustainability: 'המשכיות ללא תלות',
  team_feedback_presence: 'איסוף משוב צוות',
};

const valueLabels: Record<string, string> = {
  none: 'לא', no: 'לא', partial: 'חלקי', mostly: 'ברובו', full: 'מלא', low: 'נמוך', medium: 'בינוני', high: 'גבוה',
  resistance: 'התנגדות', under70: 'פחות מ־70%', '70-90': '70%–90%', '90-100': '90%–100%', shallow: 'שטחי',
  consistent: 'משמעותי ועקבי', rarely: 'לעיתים רחוקות', sometimes: 'לפעמים', regular: 'באופן קבוע', independent: 'עצמאי ועקבי',
  most: 'רובם', all: 'כולם', yes: 'כן', true: 'כן', false: 'לא',
};

function presentValue(signal: OrganizationalSignal) {
  if (typeof signal.value === 'number') return `${signal.value}%`;
  if (typeof signal.value === 'boolean') return signal.value ? 'כן' : 'לא';
  return valueLabels[signal.value] ?? signal.value;
}

function randomId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function periodId() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function OrganizationalSignalPreview({ signals }: { signals: OrganizationalSignal[] }) {
  const visible = signals.slice(0, 6);
  const [contextCode, setContextCode] = useState('');
  const [exported, setExported] = useState(false);

  useEffect(() => {
    try { setContextCode(localStorage.getItem(CONTEXT_CODE_KEY) ?? ''); } catch {}
  }, []);

  const canExport = useMemo(() => signals.length > 0 && /^[A-Za-z0-9_-]{3,24}$/.test(contextCode.trim()), [signals.length, contextCode]);

  const exportPack = () => {
    if (!canExport) return;
    let contributorId = '';
    try {
      contributorId = localStorage.getItem(CONTRIBUTOR_KEY) ?? '';
      if (!contributorId) {
        contributorId = randomId();
        localStorage.setItem(CONTRIBUTOR_KEY, contributorId);
      }
      localStorage.setItem(CONTEXT_CODE_KEY, contextCode.trim());
    } catch {
      contributorId = randomId();
    }

    const pack = createOrganizationalPack({ contributorId, contextId: contextCode.trim(), periodId: periodId(), signals });
    downloadJson(pack, `mati-signal-${pack.periodId}.json`);
    setExported(true);
  };

  return (
    <section className="signalTransparency" aria-labelledby="signal-transparency-title">
      <div className="signalTransparencyHead">
        <div><span className="homeKicker">גבול המידע</span><h2 id="signal-transparency-title">מה נשאר אצלך — ומה יכול להיספר בלי לחשוף את הרפלקציה</h2></div>
        <span className="signalLocalOnly">כרגע: מקומי בלבד</span>
      </div>

      <div className="signalBoundaryGrid">
        <article className="signalBoundaryCard private"><span>נשאר פרטי</span><h3>הרפלקציה עצמה</h3><p>הטקסט החופשי, טעויות, תסכולים, ראיות כתובות, שמות ונקודות מפנה אינם נכנסים למסלול הארגוני.</p></article>
        <article className="signalBoundaryCard aggregate">
          <span>יכול להצטבר</span><h3>רק מדדים מובנים</h3>
          {visible.length ? <ul className="signalList">{visible.map((signal) => <li key={signal.key}><span>{labels[signal.key]}</span><b>{presentValue(signal)}</b></li>)}</ul> : <p>עדיין אין מספיק נתונים מובנים כדי להפיק signal.</p>}
        </article>
      </div>

      <div className="signalExport">
        <div><span className="homeKicker">שיתוף מבוקר</span><h3>יצוא signal בלבד</h3><p>הקובץ אינו כולל שם, שם מסגרת או טקסט חופשי. הזיני קוד מסגרת אנונימי שסוכם בארגון — לא את שם בית הספר.</p></div>
        <label>קוד מסגרת אנונימי<input value={contextCode} onChange={(event) => { setContextCode(event.target.value); setExported(false); }} placeholder="למשל RGV-07" maxLength={24} /></label>
        <button type="button" onClick={exportPack} disabled={!canExport}>{exported ? 'הקובץ נשמר' : 'ייצוא signal'}</button>
      </div>

      <p className="signalRule">גם חבילת signal אחת אינה מוצגת כתמונה ארגונית. קונסולת הארגון מציגה דפוס רק לאחר לפחות {MIN_AGGREGATE_COHORT} משתתפות, ולעולם לא מסיקה סיבה או אשמה.</p>
    </section>
  );
}
