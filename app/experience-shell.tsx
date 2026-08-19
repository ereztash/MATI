'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  emptyState,
  implementationStatus,
  MatiState,
  planSaved,
  recommendedActions,
  scoreDimensions,
  selfEffectivenessAverage,
  stageFromDate,
  Stage,
} from '../lib/stages';
import { calendarContext, greetingForDaypart } from '../lib/context-engine';
import { readStoredState, STORAGE_KEY } from '../lib/state-storage';

type View = 'home' | 'work' | 'insight' | 'journey';
const stageNames: Record<Stage, string> = { 1: 'תכנון', 2: 'הערכה מעצבת', 3: 'הערכה מסכמת' };

function nextAction(state: MatiState, stage: Stage) {
  if (stage === 1) {
    if (!state.plan.audience.trim()) return { title: 'להגדיר למי התוכנית מיועדת', detail: 'צוותי המוקד הם נקודת ההתחלה של כל שאר התכנון.' };
    if (!state.plan.smartGoal.trim()) return { title: 'להגדיר את השינוי שאת רוצה לראות', detail: 'מטרת SMART אחת תיתן לתהליך כיוון שאפשר לבדוק.' };
    if (!state.plan.metric1.trim() || !state.plan.metric2.trim()) return { title: 'לקבוע איך תדעי שהשינוי קרה', detail: 'חסרים עדיין שני סימני הצלחה ברורים.' };
    if (!state.plan.timeframe.trim()) return { title: 'לסגור מסגרת זמן גסה', detail: 'לא צריך לוח קשיח — רק מסגרת שתאפשר לבדוק התקדמות.' };
    if (!planSaved(state)) return { title: 'לאשר ולשמור את תוכנית העבודה', detail: 'הבסיס כבר קיים; עכשיו כדאי לקבע checkpoint ראשון.' };
    return { title: 'לבדוק את המראה של התכנון', detail: 'התוכנית שמורה. אפשר לעבור מהזנה ללמידה.' };
  }
  if (stage === 2) {
    if (!state.formative.savedAt) return { title: 'לעצור להערכה מעצבת', detail: 'אפשר לבחור מסלול ממוקד או מלא; גם מידע חלקי מועיל.' };
    return { title: 'לבדוק מה השתנה מאז התכנון', detail: 'יש כבר נתוני שטח; עכשיו מחפשים פער, ראיה וצעד הבא.' };
  }
  if (!state.summative.savedAt) return { title: 'לסגור את השנה ללמידה אחת ברורה', detail: 'הישג, נקודת מפנה ושינוי לשנה הבאה.' };
  return { title: 'לשמור את הלמידה לשנה הבאה', detail: 'המסע השנתי סגור ויש בסיס לפתיחת המחזור הבא.' };
}

function stageProgress(state: MatiState) {
  return [
    { stage: 1 as Stage, label: 'תכנון', done: planSaved(state) },
    { stage: 2 as Stage, label: 'מעצבת', done: Boolean(state.formative.savedAt) },
    { stage: 3 as Stage, label: 'מסכמת', done: Boolean(state.summative.savedAt) },
  ];
}

export default function ExperienceShell({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<View>('home');
  const [state, setState] = useState<MatiState>(emptyState);
  const [now, setNow] = useState<Date | null>(null);

  const refresh = () => { setState(readStoredState()); setNow(new Date()); };

  useEffect(() => {
    refresh();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInteraction = () => { clearTimeout(timer); timer = setTimeout(refresh, 220); };
    // Closed-choice answers (scales, option groups) are <button> clicks and emit
    // neither input nor change, so a click listener is required to see them.
    window.addEventListener('input', onInteraction, true);
    window.addEventListener('change', onInteraction, true);
    window.addEventListener('click', onInteraction, true);
    window.addEventListener('mati-state-changed', onInteraction as EventListener);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('input', onInteraction, true);
      window.removeEventListener('change', onInteraction, true);
      window.removeEventListener('click', onInteraction, true);
      window.removeEventListener('mati-state-changed', onInteraction as EventListener);
    };
  }, []);

  const automaticStage = now ? stageFromDate(now) : stageFromDate();
  // Regression: this used to fall back to 1 unconditionally, so the home
  // screen confidently opened with "את בשלב תכנון" through October,
  // November, March and April — months stageFromDate() deliberately returns
  // null for, specifically so nothing here has to guess. page.tsx's own work
  // view already refuses to invent a stage in exactly this situation (the
  // gapShell screen); the home view silently did the opposite. `?? 1` still
  // backs every OTHER view below so nothing there breaks without a chosen
  // stage — only the home hero, the one screen she sees first, now asks
  // instead of asserting.
  const inCalendarGap = !state.manualStage && automaticStage === null;
  const activeStage = (state.manualStage ?? automaticStage ?? 1) as Stage;
  const calendar = now ? calendarContext(now, automaticStage) : null;
  const action = nextAction(state, activeStage);
  const dims = useMemo(() => scoreDimensions(state), [state]);
  const lowest = [...dims].sort((a, b) => a.score - b.score)[0];
  const strongest = [...dims].sort((a, b) => b.score - a.score)[0];
  const recommendations = recommendedActions(state);
  const implementation = implementationStatus(state);
  const effectiveness = selfEffectivenessAverage(state);
  const instructor = state.formative.context.instructorName.trim();
  const greeting = calendar ? greetingForDaypart(calendar.daypart) : 'שלום';

  const go = (next: View) => { refresh(); setView(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // Same write pattern page.tsx's own switchStage uses (read → patch →
  // write back), done directly since this component owns no shared state
  // with page.tsx's Home — they each read the same storage key independently.
  const chooseStage = (stage: Stage) => {
    const current = readStoredState();
    // A full/blocked store must not throw uncaught here either — page.tsx's
    // own guarded save is what surfaces the real notice; this one only
    // needs to not crash the picker click itself.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, manualStage: stage }));
    } catch {
      // no-op — see above
    }
    refresh();
  };

  return (
    <div className={`experienceShell view-${view}`}>
      <header className="experienceTopbar">
        <button className="experienceBrand" onClick={() => go('home')} aria-label="חזרה לבית">
          <span className="brandMark" aria-hidden="true"><i /><i /><i /></span>
          <span><b>מתי המתי״א</b><small>מתי״א רג״ב</small></span>
        </button>
        <nav className="experienceNav" aria-label="ניווט ראשי">
          <button className={view === 'home' ? 'active' : ''} onClick={() => go('home')}>היום</button>
          <button className={view === 'work' ? 'active' : ''} onClick={() => go('work')}>עבודה</button>
          <button className={view === 'insight' ? 'active' : ''} onClick={() => go('insight')}>מה למדנו</button>
          <button className={view === 'journey' ? 'active' : ''} onClick={() => go('journey')}>המסע שלי</button>
        </nav>
        <div className="experiencePrivacy">המידע נשאר במכשיר</div>
      </header>

      {view === 'home' && inCalendarGap && (
        <main className="experiencePage homeExperience">
          <section className="homeHero">
            <p className="homeGreeting">{greeting}{instructor ? `, ${instructor}` : ''}</p>
            <h1>באיזה שלב בלוח השנה את נמצאת?</h1>
            <p>התאריך הנוכחי נמצא בין חלונות הגאנט שהוגדרו. כדי לא להמציא שלב, בחרי את נקודת העבודה המתאימה.</p>
          </section>
          {/* Same class page.tsx's own gapShell buttons use — not homeGrid/
              homeStatusCard, whose min-height and 2-column layout are sized
              for the decision-card pairing elsewhere and visibly fight this
              3-button choice for the same grid-template-columns. */}
          <div className="gapOptions">
            <button onClick={() => chooseStage(1)}><b>תכנון</b><span>עד סוף ספטמבר</span></button>
            <button onClick={() => chooseStage(2)}><b>הערכה מעצבת</b><span>דצמבר–פברואר</span></button>
            <button onClick={() => chooseStage(3)}><b>הערכה מסכמת</b><span>מאי–יוני</span></button>
          </div>
        </main>
      )}

      {view === 'home' && !inCalendarGap && (
        <main className="experiencePage homeExperience">
          <section className="homeHero">
            <p className="homeGreeting">{greeting}{instructor ? `, ${instructor}` : ''}</p>
            <h1>את בשלב <span>{stageNames[activeStage]}</span></h1>
            <p>{calendar?.stagePosition === 'closing' && calendar.daysToStageEnd !== null ? `נשארו כ־${calendar.daysToStageEnd} ימים לחלון הזה. כדאי לסגור את מה שמשנה החלטה.` : calendar?.stagePosition === 'early' ? 'זה זמן טוב לבנות בסיס לפני שמקבעים החלטות.' : 'לא צריך לעשות הכול עכשיו. מספיק להתקדם בהחלטה אחת משמעותית.'}</p>
          </section>

          <section className="homeDecisionCard">
            <div>
              <span className="homeKicker">הדבר הבא שכדאי לעשות</span>
              <h2>{action.title}</h2>
              <p>{action.detail}</p>
            </div>
            <button className="homePrimary" onClick={() => go(activeStage === 1 && planSaved(state) ? 'insight' : 'work')}>המשיכי מכאן <span aria-hidden="true">←</span></button>
          </section>

          <section className="homeGrid">
            <div className="homeStatusCard">
              <span className="homeKicker">השנה שלך</span>
              <div className="yearRail">{stageProgress(state).map((item) => <div key={item.stage} className={`${item.done ? 'done' : ''} ${activeStage === item.stage ? 'current' : ''}`}><span>{item.done ? '✓' : item.stage}</span><b>{item.label}</b></div>)}</div>
            </div>
            <div className="homeStatusCard">
              <span className="homeKicker">מה כבר ידוע</span>
              <dl className="knownFacts">
                <div><dt>תוכנית עבודה</dt><dd>{planSaved(state) ? 'שמורה' : 'בתהליך'}</dd></div>
                <div><dt>מימוש</dt><dd>{implementation !== null ? `${implementation}%` : 'טרם נמדד'}</dd></div>
                <div><dt>נקודות דרך</dt><dd>{state.history.length}</dd></div>
              </dl>
            </div>
          </section>
        </main>
      )}

      {view === 'work' && <div className="workExperience">{children}</div>}

      {view === 'insight' && (
        <main className="experiencePage insightExperience">
          <header className="experiencePageHead"><span className="homeKicker">מה למדנו?</span><h1>הראיות לפני ההמלצה</h1><p>המטרה כאן היא לצאת עם הבחנה אחת שאפשר לקחת חזרה לשטח.</p></header>
          {!planSaved(state) && !state.formative.savedAt ? (
            <section className="emptyInsight"><h2>עוד אין מספיק ראיות לניתוח.</h2><p>נתחיל מהעבודה עצמה, וכשיהיה בסיס — המסך הזה יהפוך את הנתונים להחלטה.</p><button className="homePrimary" onClick={() => go('work')}>לעבודה</button></section>
          ) : (
            <>
              <section className="insightHeroGrid">
                <article className="insightCard positive"><span>מה חזק כרגע</span><h2>{strongest?.name ?? 'נבנה בסיס מקצועי'}</h2><p>{strongest?.evidence[0] ?? 'יש כבר מספיק מידע כדי להתחיל לזהות מה עובד.'}</p></article>
                <article className="insightCard focus"><span>הפער שכדאי לבדוק</span><h2>{lowest?.name ?? 'עדיין חסרה ראיה'}</h2><p>{lowest?.evidence.length ? `הציון הנוכחי: ${lowest.score}/5. ${lowest.note}` : 'עדיין אין מספיק ראיות בממד הזה; זו נקודה טובה לשאלה הבאה.'}</p></article>
              </section>
              <section className="evidenceStrip">
                <div><b>{implementation !== null ? `${implementation}%` : '—'}</b><span>מימוש מדווח</span></div>
                <div><b>{effectiveness !== null ? effectiveness : '—'}</b><span>אפקטיביות עצמית</span></div>
                <div><b>{state.history.length}</b><span>checkpoints</span></div>
              </section>
              <section className="nextDecision">
                <span className="homeKicker">הצעד הבא</span>
                <h2>{recommendations[0] ?? action.title}</h2>
                <p>{recommendations[1] ?? 'עדיף צעד אחד שאפשר לראות בשטח מאשר עוד שכבת תכנון.'}</p>
                <button className="homePrimary" onClick={() => go('work')}>לקחת את זה לעבודה</button>
              </section>
            </>
          )}
        </main>
      )}

      {view === 'journey' && (
        <main className="experiencePage journeyExperience">
          <header className="experiencePageHead"><span className="homeKicker">המסע שלי</span><h1>לא רק מה מילאת — מה השתנה לאורך הדרך</h1><p>נקודות הדרך נשמרות כדי לחבר בין תכנון, תוצאה ולמידה לאורך השנה.</p></header>
          <section className="journeyTimeline">
            {state.history.length ? [...state.history].reverse().map((entry, index) => (
              <article className="journeyEntry" key={`${entry.at}-${index}`}>
                <div className="journeyDot" aria-hidden="true" />
                <div className="journeyBody">
                  <time>{new Date(entry.at).toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' })}</time>
                  <span>שלב {entry.stage} · {stageNames[entry.stage]}</span>
                  <h2>{entry.label}</h2>
                  {entry.note && <p>{entry.note}</p>}
                </div>
              </article>
            )) : <div className="emptyJourney"><h2>המסע עוד לא התחיל להיכתב.</h2><p>אחרי שמירת התוכנית הראשונה תופיע כאן נקודת הדרך הראשונה.</p><button className="homePrimary" onClick={() => go('work')}>להתחיל לעבוד</button></div>}
          </section>
        </main>
      )}
    </div>
  );
}
