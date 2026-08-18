'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  canOpenStage,
  emptyState,
  formativeStarted,
  MatiState,
  planReady,
  scoreDimensions,
  Stage,
  stageFromDate,
} from '../lib/stages';

const STORAGE_KEY = 'mati-v1';

const fullQuestions = [
  ['q1', '1. עמידה ביעדים', 'מה מתוך יעדי תוכנית ההדרכה קיבל מענה בפועל? מה אחוז המימוש המשוער ומה הראיות לכך?'],
  ['q2', '2. שינוי אצל המורה המודרך', 'איזה שינוי ראית בתכנון התאמות, יישום אסטרטגיות או ניהול שונות? על אילו כלים או תוצאות את מבססת את הקביעה?'],
  ['q3', '3. יישום בפועל', 'כמה מהמפגשים התקיימו? האם היו מטרה, תיעוד ומשימת יישום? מה היה עומק היישום בשטח?'],
  ['q4', '4. תרומת ההדרכה', 'איזו השפעה נראתה על מסוגלות המורה ועל תפקוד התלמידים? אם אפשר, תני הערכה קרובה במספרים.'],
  ['q5', '5. בקרה עצמית', 'איפה התאמת את ההדרכה בעקבות צורך או משוב? כמה שעות שטח תכננת וכמה מומשו בפועל?'],
  ['q6', '6. מערכת: צוות–מנהלים–משאבים–תרבות', 'מה היה המשוב מהצוותים? מה רמת מעורבות המנהלים? אילו משאבים הוקצו, ואיזה שינוי תרבותי נראה?'],
  ['q7', '7. קיימות ועצמאות', 'באילו תחומים המורה כבר פועל באופן עצמאי? מה ממשיך להתקיים גם ללא תלות גבוהה בך?'],
  ['q8', '8. רפלקציה מסכמת', 'מה עבד טוב מהצפוי, מה לא עבד ולמה, מה הייתה טעות מרכזית, ומתי היית גמישה או קשיחה מדי?'],
  ['q9', '9. ציון אפקטיביות', 'תני הערכה 1–10 לעמידה ביעדים, יישום, שינוי אצל המורה, השפעה על תלמידים וקיימות. אפשר גם טווח.'],
] as const;

const shortIds = new Set(['q1', 'q2', 'q5', 'q8', 'q9']);

function Stars({ score }: { score: number }) {
  return <span aria-label={`${score} מתוך 5`}>{'★'.repeat(score)}{'☆'.repeat(5 - score)}</span>;
}

export default function Home() {
  const [state, setState] = useState<MatiState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState('');
  const autoStage = stageFromDate();
  const activeStage = state.manualStage ?? autoStage;
  const dimensions = useMemo(() => scoreDimensions(state), [state]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setState({ ...emptyState, ...JSON.parse(raw) });
    } catch {
      setNotice('לא הצלחתי לקרוא את המידע השמור. אפשר להמשיך מחדש.');
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  function switchStage(stage: Stage) {
    if (!canOpenStage(stage, state)) {
      setNotice(stage === 2
        ? 'כדי לעבור להערכה המעצבת, צריך קודם תוכנית עבודה עם קהל יעד, מטרת SMART, שני מדדים ומסגרת זמן.'
        : 'כדי לעבור להערכה המסכמת, צריך קודם למלא לפחות חלק מההערכה המעצבת.');
      return;
    }
    setNotice('');
    setState((prev) => ({ ...prev, manualStage: stage }));
  }

  function savePlan() {
    if (!planReady(state.plan)) {
      setNotice('כדי שנוכל לבנות תוכנית שתעבוד בשטח, חסרים קהל יעד, מטרת SMART, שני מדדי הצלחה או מסגרת זמן.');
      return;
    }
    setState((prev) => ({ ...prev, plan: { ...prev.plan, savedAt: new Date().toISOString() } }));
    setNotice('התוכנית נשמרה במכשיר הזה. עכשיו אפשר לעבור למראה המקצועית או להערכה המעצבת כשיגיע הזמן.');
  }

  const visibleQuestions = state.formative.route === 'short'
    ? fullQuestions.filter(([id]) => shortIds.has(id))
    : fullQuestions;

  return (
    <main className="shell">
      <header className="hero">
        <div className="brandRow">
          <div>
            <p className="eyebrow">מתי המתי״א</p>
            <h1>מהתכנון להשפעה שנראית בשטח</h1>
            <p className="lead">מרחב עבודה רפלקטיבי למדריכות: מנסחות כיוון, בודקות מה באמת השתנה, וסוגרות את השנה עם החלטה טובה יותר לשנה הבאה.</p>
          </div>
          <div className="privacy">● נשמר במכשיר זה בלבד</div>
        </div>
        <div className="stageStrip">
          {[1, 2, 3].map((stage) => {
            const names = ['תכנון', 'הערכה מעצבת', 'הערכה מסכמת'];
            const locked = !canOpenStage(stage as Stage, state);
            return (
              <button
                key={stage}
                onClick={() => switchStage(stage as Stage)}
                className={activeStage === stage ? 'stage active' : 'stage'}
                aria-disabled={locked}
              >
                <span>0{stage}</span>
                <strong>{names[stage - 1]}</strong>
                <small>{locked ? 'נפתח אחרי השלמת הבסיס' : activeStage === stage ? 'השלב הפעיל' : 'מעבר ידני'}</small>
              </button>
            );
          })}
        </div>
      </header>

      {notice && <div className="notice" role="status">{notice}</div>}

      <section className="workspace">
        <aside className="sideCard">
          <span className="kicker">השלב שזוהה</span>
          <h2>{activeStage === 1 ? 'תכנון' : activeStage === 2 ? 'הערכה מעצבת' : 'הערכה מסכמת'}</h2>
          <p>{activeStage === autoStage ? 'נקבע אוטומטית לפי לוח השנה.' : 'נבחר ידנית לאחר בדיקת תנאי המעבר.'}</p>
          <div className="statusList">
            <div><b>{planReady(state.plan) ? '✓' : '○'}</b> תוכנית עבודה</div>
            <div><b>{formativeStarted(state.formative) ? '✓' : '○'}</b> רפלקציה מעצבת</div>
            <div><b>{state.summative.savedAt ? '✓' : '○'}</b> סיכום שנתי</div>
          </div>
        </aside>

        <div className="mainCard">
          {activeStage === 1 && (
            <>
              <div className="sectionHead">
                <div><span className="kicker">שלב 1</span><h2>בונות מצפן עבודה</h2></div>
                <p>לא לוח קשיח — מספיק מבנה כדי לדעת מה מנסים להזיז ואיך נזהה שזה קרה.</p>
              </div>
              <div className="formGrid">
                <Field label="מי צוותי המוקד / המונחים?" value={state.plan.audience} onChange={(v) => setState((s) => ({ ...s, plan: { ...s.plan, audience: v } }))} placeholder="למשל: 8 מחנכות כיתות א׳–ב׳ בבית ספר יסודי" />
                <Field label="מטרת SMART אחת" value={state.plan.smartGoal} onChange={(v) => setState((s) => ({ ...s, plan: { ...s.plan, smartGoal: v } }))} placeholder="עד סוף ינואר, 80% מהמורות..." />
                <Field label="מדד הצלחה 1" value={state.plan.metric1} onChange={(v) => setState((s) => ({ ...s, plan: { ...s.plan, metric1: v } }))} placeholder="מה נוכל לראות או למדוד?" />
                <Field label="מדד הצלחה 2" value={state.plan.metric2} onChange={(v) => setState((s) => ({ ...s, plan: { ...s.plan, metric2: v } }))} placeholder="אפשר גם מדד איכותני עם ראיה ברורה" />
                <Field label="מסגרת זמן גסה" value={state.plan.timeframe} onChange={(v) => setState((s) => ({ ...s, plan: { ...s.plan, timeframe: v } }))} placeholder="ספטמבר–ינואר, אחת לשבועיים" />
                <Field label="איפה נדרשת גמישות?" value={state.plan.flexibility} onChange={(v) => setState((s) => ({ ...s, plan: { ...s.plan, flexibility: v } }))} placeholder="מה עשוי להשתנות בלי לשבור את המטרה?" />
                <Field label="איזו מעורבות מנהלים נדרשת?" value={state.plan.managers} onChange={(v) => setState((s) => ({ ...s, plan: { ...s.plan, managers: v } }))} placeholder="החלטות, משאבים, זמן, גיבוי" />
                <Field label="איך תיראה עצמאות של המודרך?" value={state.plan.independence} onChange={(v) => setState((s) => ({ ...s, plan: { ...s.plan, independence: v } }))} placeholder="מה הוא יעשה גם כשאת לא בחדר?" />
              </div>
              <div className="actions"><button className="primary" onClick={savePlan}>שמרי תוכנית עבודה</button></div>
              {planReady(state.plan) && <Mirror dimensions={dimensions} />}
            </>
          )}

          {activeStage === 2 && (
            <>
              <div className="sectionHead">
                <div><span className="kicker">שלב 2</span><h2>מה באמת השתנה?</h2></div>
                <p>גם מענה חלקי הוא בעל ערך. מספיק הערכה קרובה — זה לא מבחן.</p>
              </div>
              <div className="routePicker">
                <button className={state.formative.route === 'short' ? 'choice activeChoice' : 'choice'} onClick={() => setState((s) => ({ ...s, formative: { ...s.formative, route: 'short' } }))}><b>מסלול ממוקד</b><span>5 סעיפים · כ־10 דקות</span></button>
                <button className={state.formative.route === 'full' ? 'choice activeChoice' : 'choice'} onClick={() => setState((s) => ({ ...s, formative: { ...s.formative, route: 'full' } }))}><b>מסלול מלא</b><span>9 סעיפים · תמונה רחבה</span></button>
              </div>
              <div className="questionStack">
                {visibleQuestions.map(([id, title, prompt]) => (
                  <label className="question" key={id}>
                    <span>{title}</span>
                    <small>{prompt}</small>
                    <textarea
                      rows={4}
                      value={state.formative.answers[id] ?? ''}
                      onChange={(e) => setState((s) => ({ ...s, formative: { ...s.formative, answers: { ...s.formative.answers, [id]: e.target.value } } }))}
                      placeholder="כתבי בקצרה. גם תיאור מילולי מספיק."
                    />
                  </label>
                ))}
              </div>
              <div className="actions">
                <button className="primary" onClick={() => {
                  if (!formativeStarted(state.formative)) { setNotice('בחרי לפחות סעיף אחד לענות עליו. גם מענה חלקי מספיק כדי להתחיל.'); return; }
                  setState((s) => ({ ...s, formative: { ...s.formative, savedAt: new Date().toISOString() } }));
                  setNotice('הרפלקציה נשמרה. התמונה המקצועית מתעדכנת לפי מה שסיפרת.');
                }}>שמרי והציגי תמונה</button>
              </div>
              {formativeStarted(state.formative) && <Mirror dimensions={dimensions} />}
            </>
          )}

          {activeStage === 3 && (
            <>
              <div className="sectionHead">
                <div><span className="kicker">שלב 3</span><h2>סוגרות לולאה, לא רק שנה</h2></div>
                <p>שלוש תשובות שמתרגמות את השנה להחלטות עבודה לשנה הבאה.</p>
              </div>
              <div className="questionStack">
                <FieldArea label="ההישג המשמעותי ביותר לצוותי המוקד + מדד" value={state.summative.achievement} onChange={(v) => setState((s) => ({ ...s, summative: { ...s.summative, achievement: v } }))} />
                <FieldArea label="נקודת המפנה האישית שלך" value={state.summative.turningPoint} onChange={(v) => setState((s) => ({ ...s, summative: { ...s.summative, turningPoint: v } }))} />
                <FieldArea label="השינוי המרכזי שתעשי בשנה הבאה" value={state.summative.nextYearChange} onChange={(v) => setState((s) => ({ ...s, summative: { ...s.summative, nextYearChange: v } }))} />
              </div>
              <div className="rubric">
                <span className="kicker">מחוון לשנה הבאה</span>
                <div className="rubricGrid">
                  <div><b>מדדים</b><p>לפחות שני סימנים ברורים להשפעה, לא רק ביצוע פעילות.</p></div>
                  <div><b>גמישות</b><p>להגדיר מראש מה יכול להשתנות ומה אסור לאבד.</p></div>
                  <div><b>מנהלים</b><p>לקבוע איפה נדרשת החלטה, משאב או חסות מערכתית.</p></div>
                  <div><b>תרגום מדיניות</b><p>כל עיקרון מסתיים בפעולה שניתן לראות בשטח.</p></div>
                </div>
              </div>
              <div className="actions"><button className="primary" onClick={() => {
                if (!state.summative.achievement || !state.summative.turningPoint || !state.summative.nextYearChange) { setNotice('כדי לסגור את השנה, השלימי את שלוש השאלות.'); return; }
                setState((s) => ({ ...s, summative: { ...s.summative, savedAt: new Date().toISOString() } }));
                setNotice('הסיכום נשמר. יש לך עכשיו בסיס ברור לפתיחת השנה הבאה.');
              }}>סגרי את השנה</button></div>
            </>
          )}
        </div>
      </section>

      <footer>
        <button className="textButton" onClick={() => {
          if (confirm('למחוק את כל המידע שנשמר בדפדפן הזה?')) {
            localStorage.removeItem(STORAGE_KEY);
            setState(emptyState);
            setNotice('המידע המקומי נמחק.');
          }
        }}>מחיקת המידע המקומי</button>
        <span>מתי המתי״א · גרסת פיילוט</span>
      </footer>
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <label className="field"><span>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} /></label>;
}

function FieldArea({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="question"><span>{label}</span><textarea rows={5} value={value} onChange={(e) => onChange(e.target.value)} placeholder="כתבי את התשובה שלך כאן" /></label>;
}

function Mirror({ dimensions }: { dimensions: ReturnType<typeof scoreDimensions> }) {
  const lowest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  return (
    <section className="mirror">
      <div className="sectionHead compact"><div><span className="kicker">המראה המקצועית</span><h3>איפה כדאי להעמיק עכשיו</h3></div></div>
      <div className="dimensionGrid">
        {dimensions.map((item) => <div className="dimension" key={item.name}><div><b>{item.name}</b><Stars score={item.score} /></div><p>{item.note}</p></div>)}
      </div>
      <div className="opportunity"><b>הזדמנות מרכזית: {lowest.name}</b><p>זה לא ציון אישיותי. זה המקום שבו יש כרגע הכי מעט ראיות כתובות. הוספת ראיה אחת קונקרטית יכולה להפוך את ההשפעה שלך לברורה יותר.</p><p className="beforeAfter"><strong>לפני:</strong> “דיברנו על התאמות.” <strong>אחרי:</strong> “בשלושה מתוך ארבעה שיעורים המורה בחרה התאמה בעצמה והסבירה למה.”</p></div>
    </section>
  );
}
