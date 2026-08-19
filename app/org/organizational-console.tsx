'use client';

import { useMemo, useRef, useState } from 'react';
import styles from './organizational-console.module.css';
import { MIN_AGGREGATE_COHORT, OrganizationalSignalKey } from '../../lib/organizational-signals';
import { OrganizationalPack, summarizeOrganizationalPacks, validateOrganizationalPack } from '../../lib/organizational-pack';
import { downloadJson } from '../../lib/download-json';

const labels: Record<OrganizationalSignalKey, string> = {
  implementation_rate: 'שיעור מימוש', goal_attainment: 'השגת מטרות', meeting_execution: 'מימוש מפגשים', implementation_depth: 'עומק היישום',
  student_impact: 'השפעה על תלמידים', student_improvement_rate: 'שיעור תלמידים שהשתפרו', manager_meeting_rate: 'מימוש פגישות מנהל',
  manager_commitment: 'מחויבות הנהלה', resource_allocation: 'הקצאת משאבים', resource_allocation_rate: 'שיעור הקצאת משאבים',
  teacher_independence: 'עצמאות המורים', sustainability: 'המשכיות ללא תלות', team_feedback_presence: 'איסוף משוב צוות',
};

const classificationLabels = {
  insufficient_privacy_floor: 'מתחת לרצפת פרטיות', local_observation: 'תצפית מקומית', local_cluster: 'אשכול מקומי',
  cross_context_pattern: 'דפוס בכמה מסגרות', persistent_pattern: 'דפוס מתמשך', systemic_candidate: 'מועמד לבדיקה מערכתית',
} as const;

function packIdentity(pack: OrganizationalPack) { return `${pack.contributorId}|${pack.contextId}|${pack.periodId}`; }
function dedupe(packs: OrganizationalPack[]) {
  const map = new Map<string, OrganizationalPack>();
  for (const pack of packs) map.set(packIdentity(pack), pack);
  return [...map.values()];
}

export default function OrganizationalConsole() {
  const [packs, setPacks] = useState<OrganizationalPack[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [importNote, setImportNote] = useState('');
  // Mirrors `packs` so an async import that resolves after another one still
  // merges onto the newest list instead of the snapshot it closed over.
  const packsRef = useRef<OrganizationalPack[]>([]);
  const summaries = useMemo(() => summarizeOrganizationalPacks(packs), [packs]);
  const contributors = new Set(packs.map((p) => p.contributorId)).size;
  const contexts = new Set(packs.map((p) => p.contextId)).size;
  const periods = new Set(packs.map((p) => p.periodId)).size;
  const surfaceable = summaries.filter((item) => item.classification?.maySurfaceToOrganization);
  const belowFloor = contributors < MIN_AGGREGATE_COHORT;

  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    const accepted: OrganizationalPack[] = [];
    const rejected: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const parsed = JSON.parse(await file.text());
        if (!validateOrganizationalPack(parsed)) rejected.push(`${file.name}: מבנה או ערכים לא תקינים`);
        else accepted.push(parsed);
      } catch {
        rejected.push(`${file.name}: לא ניתן לקרוא JSON`);
      }
    }

    const before = packsRef.current;
    const merged = dedupe([...before, ...accepted]);
    const replaced = before.length + accepted.length - merged.length;
    packsRef.current = merged;
    setPacks(merged);
    setErrors(rejected);
    setImportNote(`${accepted.length} התקבלו${replaced ? `, ${replaced} החליפו גרסה קודמת של אותה משתתפת/מסגרת/תקופה` : ''}.`);
  };

  const clearAll = () => { packsRef.current = []; setPacks([]); setErrors([]); setImportNote('כל החבילות הוסרו מהדפדפן.'); };

  const downloadAggregate = () => {
    if (belowFloor) return;
    const report = {
      schema: 'mati-organizational-aggregate-v1',
      generatedAt: new Date().toISOString(),
      cohort: { contributors, contexts, periods },
      privacyFloor: MIN_AGGREGATE_COHORT,
      patterns: summaries.map((item) => ({
        key: item.key,
        observations: item.observations,
        contributors: item.contributors,
        contexts: item.contexts,
        periods: item.periods,
        concerns: item.concerns,
        neutral: item.neutral,
        classification: item.classification?.classification ?? 'descriptive_only',
        mayAssertCausality: false,
      })),
    };
    downloadJson(report, `mati-organizational-aggregate-${new Date().toISOString().slice(0, 10)}.json`);
  };

  return (
    <main className={styles.shell} dir="rtl">
      <header className={styles.hero}>
        <a href="/" className={styles.back}>← חזרה למדריכה</a><span>תמונת מערכת</span>
        <h1>לראות דפוסים בלי לפתוח את הרפלקציה</h1>
        <p>הקונסולה קוראת רק חבילות signal מסוננות. היא לא מקבלת שמות, טקסט חופשי, ראיות כתובות או נקודות מפנה אישיות. כל מדריכה מייצאת חבילת signal משלה מתוך "מה למדנו" באפליקציה שלה — הקבצים לא נוצרים כאן.</p>
      </header>

      <section className={styles.intake}>
        <div><strong>ייבוא חבילות signal</strong><p>בחרי כמה קבצי MATI יחד. כל העיבוד מתבצע בדפדפן הזה בלבד; קובץ חדש מאותה משתתפת/מסגרת/תקופה מחליף את הקודם.</p></div>
        <div className={styles.intakeActions}>
          <label className={styles.upload}>בחירת קבצים<input type="file" accept="application/json,.json" multiple onChange={(e) => { const input = e.currentTarget; void importFiles(input.files).finally(() => { input.value = ''; }); }} /></label>
          {packs.length > 0 && <button type="button" className={styles.secondary} onClick={clearAll}>ניקוי</button>}
        </div>
      </section>

      {importNote && <p className={styles.importNote} role="status">{importNote}</p>}
      {errors.length > 0 && <section className={styles.errors} aria-live="polite">{errors.map((error) => <p key={error}>{error}</p>)}</section>}

      <section className={styles.kpis} aria-label="היקף הנתונים">
        <div><b>{contributors}</b><span>משתתפות אנונימיות</span></div><div><b>{contexts}</b><span>מסגרות מקודדות</span></div>
        <div><b>{periods}</b><span>תקופות</span></div><div><b>{surfaceable.length}</b><span>דפוסים שניתן להציג</span></div>
      </section>

      {packs.length === 0 ? (
        <section className={styles.empty}><h2>עוד אין נתונים ארגוניים.</h2><p>זה מצב תקין: MATI לא ממציאה תמונת מערכת לפני שנאספו חבילות signal אמיתיות.</p></section>
      ) : belowFloor ? (
        <section className={styles.privacyBlock}><span>רצפת פרטיות פעילה</span><h2>עדיין לא מציגים דפוסים.</h2><p>יש {contributors} משתתפות ייחודיות. נדרשות לפחות {MIN_AGGREGATE_COHORT} לפני שאפשר להציג תמונה מצטברת.</p></section>
      ) : (
        <section className={styles.patterns}>
          <div className={styles.sectionHead}>
            <div><span>דפוסים</span><h2>מה חוזר בין המסגרות והתקופות</h2></div>
            <div><p>“מועמד מערכתי” הוא טריגר לבדיקה אנושית — לא אבחנה ולא קביעה סיבתית.</p><button type="button" className={styles.secondary} onClick={downloadAggregate}>ייצוא דוח מצטבר</button></div>
          </div>
          <div className={styles.patternGrid}>
            {summaries.map((item) => {
              const d = item.classification;
              const classified = item.observations - item.neutral;
              const concernPct = classified > 0 ? Math.round((item.concerns / classified) * 100) : null;
              return (
                <article key={item.key} className={`${styles.patternCard} ${d?.maySurfaceToOrganization ? styles.surfaceable : ''}`}>
                  <div className={styles.patternTop}><span>{labels[item.key]}</span><em>{d ? classificationLabels[d.classification] : 'מדד תיאורי בלבד'}</em></div>
                  <div className={styles.patternStats}><div><b>{item.contributors}</b><span>משתתפות</span></div><div><b>{item.contexts}</b><span>מסגרות</span></div><div><b>{item.periods}</b><span>תקופות</span></div></div>
                  <p>{concernPct === null ? 'אין סף מקצועי מאושר שמאפשר לסווג את המדד הזה כבעיה. הוא מוצג כתיאור היקף בלבד.' : `${concernPct}% מהתצפיות המסווגות מצביעות על קושי.`}</p>
                  {d?.maySurfaceToOrganization && <strong>כדאי לבדוק מה משותף למצבים האלה לפני שמחליטים על התערבות.</strong>}
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className={styles.limit}><strong>מגבלה ידועה של הפיילוט</strong><p>מזהה המשתתפת קשור למכשיר, לא לאדם: מעבר למכשיר אחר עלול להיספר כמשתתפת חדשה, ולהפך — כמה מדריכות שחולקות מכשיר אחד (למשל מחשב משותף בחדר צוות) עלולות להיספר כמשתתפת אחת. חשבונות משתמשים יפתרו זאת בשלב הבא; עד אז אין להשתמש בנתונים לספירה פורמלית של כוח אדם.</p></section>
      <footer className={styles.footer}>אין כאן מידע אישי ברמת מדריכה. זיהוי סיבה, קביעת מדיניות ופעולה נשארים בסמכות אנושית.</footer>
    </main>
  );
}
