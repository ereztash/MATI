'use client';

import { useMemo, useState } from 'react';
import styles from './organizational-console.module.css';
import { MIN_AGGREGATE_COHORT, OrganizationalSignalKey } from '../../lib/organizational-signals';
import { OrganizationalPack, summarizeOrganizationalPacks, validateOrganizationalPack } from '../../lib/organizational-pack';

const labels: Record<OrganizationalSignalKey, string> = {
  implementation_rate: 'שיעור מימוש', goal_attainment: 'השגת מטרות', meeting_execution: 'מימוש מפגשים',
  implementation_depth: 'עומק היישום', student_impact: 'השפעה על תלמידים', student_improvement_rate: 'שיעור תלמידים שהשתפרו',
  manager_meeting_rate: 'מימוש פגישות מנהל', manager_commitment: 'מחויבות הנהלה', resource_allocation: 'הקצאת משאבים',
  resource_allocation_rate: 'שיעור הקצאת משאבים', teacher_independence: 'עצמאות המורים', sustainability: 'המשכיות ללא תלות',
  team_feedback_presence: 'איסוף משוב צוות',
};

const classificationLabels = {
  insufficient_privacy_floor: 'מתחת לרצפת פרטיות',
  local_observation: 'תצפית מקומית',
  local_cluster: 'אשכול מקומי',
  cross_context_pattern: 'דפוס בכמה מסגרות',
  persistent_pattern: 'דפוס מתמשך',
  systemic_candidate: 'מועמד לבדיקה מערכתית',
} as const;

function dedupe(packs: OrganizationalPack[]) {
  const map = new Map<string, OrganizationalPack>();
  for (const pack of packs) map.set(`${pack.contributorId}|${pack.contextId}|${pack.periodId}`, pack);
  return [...map.values()];
}

export default function OrganizationalConsole() {
  const [packs, setPacks] = useState<OrganizationalPack[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const summaries = useMemo(() => summarizeOrganizationalPacks(packs), [packs]);
  const contributors = new Set(packs.map((p) => p.contributorId)).size;
  const contexts = new Set(packs.map((p) => p.contextId)).size;
  const periods = new Set(packs.map((p) => p.periodId)).size;
  const surfaceable = summaries.filter((item) => item.classification.maySurfaceToOrganization);

  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    const accepted: OrganizationalPack[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const parsed = JSON.parse(await file.text());
        if (!validateOrganizationalPack(parsed)) rejected.push(`${file.name}: מבנה קובץ לא תקין`);
        else accepted.push(parsed);
      } catch {
        rejected.push(`${file.name}: לא ניתן לקרוא JSON`);
      }
    }
    setPacks((current) => dedupe([...current, ...accepted]));
    setErrors(rejected);
  };

  const belowFloor = contributors < MIN_AGGREGATE_COHORT;

  return (
    <main className={styles.shell} dir="rtl">
      <header className={styles.hero}>
        <a href="/" className={styles.back}>← חזרה למדריכה</a>
        <span>תמונת מערכת</span>
        <h1>לראות דפוסים בלי לפתוח את הרפלקציה</h1>
        <p>הקונסולה קוראת רק חבילות signal מסוננות. היא לא מקבלת שמות, טקסט חופשי, ראיות כתובות או נקודות מפנה אישיות.</p>
      </header>

      <section className={styles.intake}>
        <div>
          <strong>ייבוא חבילות signal</strong>
          <p>בחרי כמה קבצי MATI יחד. כל העיבוד מתבצע בדפדפן הזה בלבד.</p>
        </div>
        <label className={styles.upload}>בחירת קבצים<input type="file" accept="application/json,.json" multiple onChange={(e) => importFiles(e.target.files)} /></label>
      </section>

      {errors.length > 0 && <section className={styles.errors}>{errors.map((error) => <p key={error}>{error}</p>)}</section>}

      <section className={styles.kpis}>
        <div><b>{contributors}</b><span>משתתפות אנונימיות</span></div>
        <div><b>{contexts}</b><span>מסגרות מקודדות</span></div>
        <div><b>{periods}</b><span>תקופות</span></div>
        <div><b>{surfaceable.length}</b><span>דפוסים שניתן להציג</span></div>
      </section>

      {packs.length === 0 ? (
        <section className={styles.empty}><h2>עוד אין נתונים ארגוניים.</h2><p>זה מצב תקין: MATI לא ממציאה תמונת מערכת לפני שנאספו חבילות signal אמיתיות.</p></section>
      ) : belowFloor ? (
        <section className={styles.privacyBlock}><span>רצפת פרטיות פעילה</span><h2>עדיין לא מציגים דפוסים.</h2><p>יש {contributors} משתתפות ייחודיות. נדרשות לפחות {MIN_AGGREGATE_COHORT} לפני שאפשר להציג תמונה מצטברת.</p></section>
      ) : (
        <section className={styles.patterns}>
          <div className={styles.sectionHead}><div><span>דפוסים</span><h2>מה חוזר בין המסגרות והתקופות</h2></div><p>“מועמד מערכתי” הוא טריגר לבדיקה אנושית — לא אבחנה ולא קביעה סיבתית.</p></div>
          <div className={styles.patternGrid}>
            {summaries.map((item) => {
              const d = item.classification;
              const classified = item.observations - item.neutral;
              const concernPct = classified > 0 ? Math.round((item.concerns / classified) * 100) : null;
              return (
                <article key={item.key} className={`${styles.patternCard} ${d.maySurfaceToOrganization ? styles.surfaceable : ''}`}>
                  <div className={styles.patternTop}><span>{labels[item.key]}</span><em>{classificationLabels[d.classification]}</em></div>
                  <div className={styles.patternStats}><div><b>{item.contributors}</b><span>משתתפות</span></div><div><b>{item.contexts}</b><span>מסגרות</span></div><div><b>{item.periods}</b><span>תקופות</span></div></div>
                  <p>{concernPct === null ? 'אין סף מקצועי מאושר שמאפשר לסווג את המדד הזה כבעיה; מוצג היקף בלבד.' : `${concernPct}% מהתצפיות המסווגות מצביעות על קושי.`}</p>
                  {d.maySurfaceToOrganization && <strong>כדאי לבדוק מה משותף למצבים האלה לפני שמחליטים על התערבות.</strong>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <footer className={styles.footer}>אין כאן מידע אישי ברמת מדריכה. זיהוי סיבה, קביעת מדיניות ופעולה נשארים בסמכות אנושית.</footer>
    </main>
  );
}
