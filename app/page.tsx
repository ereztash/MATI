'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  analyzeInteraction, canOpenStage, deleteStakes, emptyState, fieldHoursPercent, FormativeAnswers, formativeCompletion, formativeStarted,
  hasLargeGoalResultGap, implementationStatus, managerMeetingPercent, MatiState, planReady, planSaved, recommendedActions,
  rubricForNextYear, scoreDimensions, selfEffectivenessAverage, smartGoalLooksValid, resolveStage, Stage, stageFromDate, stageLockReason, stageNames,
  studentImprovementPercent, summarizeLongText,
} from '../lib/stages';
import { clearStoredState, isEmptyPayload, loadStoredState, sameExceptNavigation, STORAGE_KEY, writeStoredState } from '../lib/state-storage';
import { evaluateSmartGoal } from '../lib/smart-criteria';
import { addDays, buildPersonalGantt, timelinePercent, toDateOnly, TimelineMilestone } from '../lib/plan-timeline';
import { changedFieldsSummary, diffPlans } from '../lib/plan-revisions';
import { ANCHOR_HINT, needsConcreteAnchor } from '../lib/concrete-anchor';
import { independenceReading } from '../lib/independence';
import StagePicker, { GAP_EXPLANATION, GAP_QUESTION } from './stage-picker';
const shortIds = new Set<keyof FormativeAnswers>(['q1', 'q2', 'q5', 'q8', 'q9']);

function Stars({ score }: { score: number }) { return <span className="stars" aria-label={`${score} מתוך 5`}>{'★'.repeat(score)}{'☆'.repeat(5 - score)}</span>; }

export default function Home() {
  const [state, setState] = useState<MatiState>(emptyState);
  const [hydrated, setHydrated] = useState(false);
  const [notice, setNotice] = useState('');
  // Two standing conditions, kept out of `notice` on purpose. `notice` is
  // transient feedback for something she just did, and every writer of it
  // overwrites the last — so routing a condition through it made the condition
  // both un-clearable (nothing reset it once the store recovered) and
  // destructive (one keystroke replaced the "which fields are missing"
  // guidance from a blocked save). As their own flags they clear themselves
  // and can be shown alongside whatever `notice` is currently saying.
  const [saveBlocked, setSaveBlocked] = useState(false);
  const [otherTabWrote, setOtherTabWrote] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const skipNextSave = useRef(false);
  const warnedRef = useRef(false);
  const [deleteCount, setDeleteCount] = useState(0);
  const autoStage = stageFromDate();
  const activeStage = resolveStage(state).stage;
  const dimensions = useMemo(() => scoreDimensions(state), [state]);
  const profile = useMemo(() => analyzeInteraction(state), [state]);

  useEffect(() => {
    const loaded = loadStoredState();
    setState(loaded.state);
    if (loaded.corrupted) setNotice('לא הצלחתי לקרוא את המידע השמור. אפשר להתחיל מחדש בלי לאבד את המשך העבודה הנוכחי.');
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    // A full or blocked store (Safari private browsing enforces a zero quota,
    // so even the first write throws) used to escape uncaught from here on
    // every keystroke — confirmed live: it does not just fail to persist,
    // the retry-on-every-render pattern this effect has (state changes on
    // each character → effect fires again → throws again) crashes the
    // renderer outright. A caught write can't do that; it can only fail to
    // persist, which is now something she is actually told.
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    const result = writeStoredState(state);
    setSaveBlocked(result !== 'ok');
    // `deleteCount` is a dependency so this effect is guaranteed to run after a
    // delete and clear the flag above. Without it, deleting on a visit where
    // the state is already `emptyState` left `setState(emptyState)` an Object.is
    // no-op: the effect never ran, the flag stayed set, and it swallowed the
    // next real keystroke instead — measured, one character silently unsaved on
    // a page whose header promises "הטיוטה נשמרת אוטומטית".
  }, [state, hydrated, deleteCount]);
  useEffect(() => {
    // The browser's native `storage` event fires only in OTHER tabs, never
    // the one that made the write — exactly the signal needed here. Two
    // tabs open on the same plan share one storage key with no merge: this
    // tab's own next save overwrites the whole object with whatever it last
    // held in memory, silently erasing anything the other tab just wrote
    // (confirmed live — a field changed in tab B disappeared the moment tab
    // A typed one character, with zero warning in either tab). A real fix
    // needs actual merge or cross-tab sync, which belongs with the R3/R7/R10
    // persistence work already parked in docs/MARKET_READINESS.md, not a
    // quick patch here. This is the narrow, safe piece of that: say so,
    // rather than let it happen silently. It does not touch `state` itself —
    // showing the notice must never discard whatever she's mid-typing here.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      // A deletion is not an update. The footer's delete-local-data button
      // calls removeItem, which reaches other tabs as newValue === null —
      // telling those tabs the plan was "updated elsewhere" and that saving
      // here would replace it, when in fact their next keystroke writes the
      // whole deleted plan back. Reload rather than warn: this tab's copy is
      // of something that no longer exists.
      if (event.newValue === null) { window.location.reload(); return; }
      // Ignore writes that changed nothing an instructor did. SessionStageReset
      // strips `manualStage` on every page load, so merely opening a second tab
      // used to raise a data-loss warning in the first one.
      // Already warned: the message does not change and the comparison below
      // parses both payloads, so there is nothing to gain by redoing it on
      // every keystroke the other tab makes.
      if (warnedRef.current) return;
      // A key that did not exist a moment ago was created, not edited — and
      // the tab that created it is usually this app autosaving an empty state
      // on mount, including in the tab that survives a delete. Warning there
      // announces the loss of a plan she deliberately erased seconds earlier.
      if (event.oldValue === null) { if (isEmptyPayload(event.newValue)) return; }
      else if (sameExceptNavigation(event.oldValue, event.newValue)) return;
      warnedRef.current = true;
      setOtherTabWrote(true);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  function addHistory(stage: Stage, label: string, note: string) {
    setState((prev) => ({ ...prev, history: [...prev.history.slice(-11), { at: new Date().toISOString(), stage, label, note }] }));
  }
  function switchStage(stage: Stage) {
    if (!canOpenStage(stage, state)) {
      setNotice(stageLockReason(stage));
      return;
    }
    setNotice(''); setShowAnalysis(false);
    // In a calendar gap this is her answer to "which stage are you in", not a
    // temporary override of a stage the calendar named — so it is recorded as
    // one, and survives the reload that clears manualStage by design.
    setState((prev) => (stageFromDate() === null
      ? { ...prev, gapStage: { stage, chosenAt: new Date().toISOString() } }
      : { ...prev, manualStage: stage }));
  }
  function updatePlan(key: keyof MatiState['plan'], value: string) { setState((s) => ({ ...s, plan: { ...s.plan, [key]: value, savedAt: undefined } })); }
  function updateContext(key: keyof MatiState['formative']['context'], value: string) { setState((s) => ({ ...s, formative: { ...s.formative, context: { ...s.formative.context, [key]: value }, savedAt: undefined } })); }
  function updateAnswer(section: keyof FormativeAnswers, key: string, value: unknown) { setState((s) => ({ ...s, formative: { ...s.formative, savedAt: undefined, answers: { ...s.formative.answers, [section]: { ...(s.formative.answers[section] as any), [key]: value } } } })); }
  function updatePost(key: keyof MatiState['formative']['post'], value: string) { setState((s) => ({ ...s, formative: { ...s.formative, post: { ...s.formative.post, [key]: value } } })); }

  function savePlan() {
    // Name where each missing field lives. The form shows one part at a time, so a
    // generic "something is missing" reads as a dead end when the field in question
    // is two screens ahead and the mentor has no way to know that.
    const missingParts = [
      !state.plan.audience.trim() && 'קהל היעד (חלק 1)',
      (!state.plan.metric1.trim() || !state.plan.metric2.trim()) && 'שני מדדי הצלחה (חלק 2)',
      !state.plan.timeframe.trim() && 'מסגרת זמן (חלק 3)',
    ].filter(Boolean) as string[];
    if (missingParts.length) { setNotice(`כדי לשמור את התוכנית חסרים עוד: ${missingParts.join(', ')}. אפשר להמשיך עם "הבא" ולהשלים אותם — ואז לשמור.`); return; }
    if (!smartGoalLooksValid(state.plan.smartGoal)) { setNotice('כדי להשלים את מטרת התוכנית, כתבי במשפט אחד מה אמור להשתנות אצל צוותי המוקד. את המדדים ומסגרת הזמן נבדוק בשדות הייעודיים.'); return; }
    const stamp = new Date().toISOString();
    // Diff against the previous saved version before overwriting it: the record
    // of what she changed is the pilot's success signal, so it has to be
    // captured at the moment the old version is superseded or it is gone.
    const changes = state.lastSavedPlan ? diffPlans(state.lastSavedPlan, state.plan) : [];
    const saved: MatiState['plan'] = { ...state.plan, savedAt: stamp };
    setState((prev) => ({
      ...prev,
      plan: saved,
      lastSavedPlan: saved,
      planRevisions: changes.length ? [...prev.planRevisions.slice(-19), { at: stamp, changes }] : prev.planRevisions,
      history: [...prev.history.slice(-11), { at: stamp, stage: 1, label: changes.length ? 'תוכנית עבודה עודכנה' : 'תוכנית עבודה נשמרה', note: prev.plan.smartGoal }],
    }));
    setNotice(changes.length
      ? `התוכנית עודכנה, ו־${changes.length === 1 ? 'השינוי נשמר' : `${changes.length} השינויים נשמרו`} לצד הגרסה הקודמת. שינוי בתוכנית הוא סימן ללמידה, לא לחוסר עקביות — הוא מתועד למטה.`
      : 'התוכנית נשמרה. עכשיו אפשר להשתמש במראה כדי לבדוק איפה התכנון כבר חזק ואיפה עוד חסרה ראיה או בעלות ברורה.');
  }

  function saveFormative() {
    if (!formativeStarted(state.formative)) { setNotice('בחרי לפחות סעיף אחד לענות עליו. גם מענה חלקי הוא בעל ערך ויכול להספיק לעצירה מקצועית ראשונה.'); return; }
    const stamp = new Date().toISOString(); const note = state.formative.post.oneThing || `מימוש משוער: ${implementationStatus(state) ?? 'לא נמדד'}%`;
    setState((prev) => ({ ...prev, formative: { ...prev.formative, savedAt: stamp }, history: [...prev.history.slice(-11), { at: stamp, stage: 2, label: 'הערכה מעצבת נשמרה', note }] }));
    setShowAnalysis(true);
    setNotice(hasLargeGoalResultGap(state) ? 'אני רואה פער גדול בין המטרות לתוצאות. זו הזדמנות לחשוב אחרת: התמונה המקצועית למטה מסמנת איפה כדאי לשנות מנגנון, לא רק להוסיף מאמץ.' : 'הרפלקציה נשמרה. התמונה המקצועית למטה מבוססת על הנתונים שהזנת — לא על ניחוש.');
  }

  if (!activeStage) return <main className="shell gapShell"><section className="gapCard"><p className="eyebrow">מתי המתי״א</p><h1>{GAP_QUESTION}</h1><p>{GAP_EXPLANATION}</p><StagePicker state={state} onChoose={switchStage} />{notice && <div className="notice" role="status"><span aria-hidden="true">i</span><p>{notice}</p></div>}</section></main>;

  const instructor = state.formative.context.instructorName.trim();
  const previousFormative = [...state.history].reverse().find((h) => h.stage === 2);
  return <><a className="skipLink" href="#main-workspace">דלגי לתוכן</a><main className="shell">
    <header className="appHeader">
      <div className="institutionBar"><div className="institutionBrand" aria-label="מתי״א רג״ב"><span className="brandMark" aria-hidden="true"><i /><i /><i /></span><span><strong>מתי״א רג״ב</strong><small>רמלה · גזר · באר יעקב</small></span></div><div className="privacy"><span aria-hidden="true">🔒</span> המידע נשמר במכשיר הזה בלבד · הרפלקציה הזו לא משמשת לדירוג שלך</div></div>
      <div className="welcomeBlock"><p className="eyebrow">מתי המתי״א</p><h1>{instructor ? `שלום ${instructor}, ` : 'שלום, '}כאן עוצרות כדי לראות מה באמת זז.</h1><p className="lead">את נמצאת בשלב <strong>{stageNames[activeStage]}</strong>. המטרה כאן היא להפוך את העבודה המקצועית לראיות, החלטות וצעדים שאפשר לקחת חזרה לשטח.</p><div className="autosave"><span className="autosaveDot" /> הטיוטה נשמרת אוטומטית</div></div>
      <nav className="stageStrip" aria-label="שלבי העבודה לאורך השנה">{([1, 2, 3] as Stage[]).map((stage) => { const locked = !canOpenStage(stage, state); const completed = stage === 1 ? planSaved(state) : stage === 2 ? Boolean(state.formative.savedAt) : Boolean(state.summative.savedAt); return <button key={stage} onClick={() => switchStage(stage)} className={`stage ${activeStage === stage ? 'active' : ''} ${completed ? 'completed' : ''}`} aria-disabled={locked} aria-current={activeStage === stage ? 'step' : undefined}><span className="stageNumber" aria-hidden="true">{completed ? '✓' : stage}</span><span className="stageText"><strong>{stageNames[stage]}</strong><small>{locked ? 'ייפתח לאחר השלמת הבסיס' : activeStage === stage ? 'כאן את נמצאת עכשיו' : completed ? 'נשמר' : 'אפשר לעבור'}</small></span>{locked && <span className="lock" aria-hidden="true">🔒</span>}</button>; })}</nav>
    </header>
    {/* WorkSessionLayer portals its sticky bar in here. It is a sibling of this
        page in the React tree but must sit AFTER the header in the DOM: a
        sticky element pinned near the top covers whatever scrolls beneath it,
        so while it preceded the header it made the whole stage strip
        unclickable — and forcing the header above it with z-index only
        inverted the problem, making the bar's own Prev/Next/Save unreachable
        across the scroll band where both are on screen (both measured with
        elementFromPoint). Placed after the header there is no overlap to
        arbitrate: the strip scrolls away, then the bar pins. */}
    <div id="workSessionSlot" />
    {saveBlocked && <div className="notice noticeWarn" role="alert"><span aria-hidden="true">!</span><p>לא הצלחתי לשמור באופן אוטומטי כרגע — ייתכן שהאחסון בדפדפן מלא או חסום (למשל בגלישה פרטית). כדאי להעתיק את מה שכתבת למקום אחר לפני שסוגרים את הדף.</p></div>}
    {otherTabWrote && <div className="notice noticeWarn" role="alert"><span aria-hidden="true">!</span><p>התוכנית עודכנה בטאב אחר באותו דפדפן. שמירה כאן תחליף את מה ששונה שם — כדאי לרענן את הדף לפני שממשיכות, אם שני הטאבים פתוחים בכוונה.</p></div>}
    {notice && <div className="notice" role="status"><span aria-hidden="true">i</span><p>{notice}</p></div>}
    {!notice && !saveBlocked && !otherTabWrote && <AdaptiveSignal profile={profile} activeStage={activeStage} />}
    <section className="workspace" id="main-workspace"><aside className="sideCard"><span className="kicker">נכון לעכשיו</span><h2>{stageNames[activeStage]}</h2><p>{activeStage === autoStage ? 'זה השלב המתאים לפי לוח השנה.' : 'השלב נבחר ידנית לאחר בדיקת תנאי המעבר.'}</p><div className="statusList" aria-label="התקדמות שנתית"><StatusRow done={planSaved(state)} label="תוכנית עבודה שמורה" /><StatusRow done={Boolean(state.formative.savedAt)} label="הערכה מעצבת" /><StatusRow done={Boolean(state.summative.savedAt)} label="סיכום שנתי" /></div>{activeStage === 2 && <ProgressRing value={formativeCompletion(state)} label="מילוי המסלול" />}<div className="sideHint"><strong>לא צריך לסיים הכול עכשיו.</strong><span>אפשר לעצור ולחזור מאותו מכשיר. גם מידע חלקי יכול לשפר החלטה.</span></div></aside>
      <div className="mainCard">{activeStage === 1 && <PlanMode state={state} updatePlan={updatePlan} savePlan={savePlan} dimensions={dimensions} setState={setState} />}{activeStage === 2 && <FormativeMode state={state} updateContext={updateContext} updateAnswer={updateAnswer} updatePost={updatePost} setState={setState} saveFormative={saveFormative} dimensions={dimensions} profile={profile} previousFormative={previousFormative?.note} showAnalysis={showAnalysis || Boolean(state.formative.savedAt)} />}{activeStage === 3 && <SummativeMode state={state} setState={setState} addHistory={addHistory} />}</div></section>
    <footer><span>מתי המתי״א · מתי״א רג״ב · גרסת פיילוט</span><details className="deleteLocal"><summary className="textButton">מחיקת המידע המקומי</summary><div className="deleteLocalPanel"><p>{deleteStakes(state)}</p><button type="button" className="deleteLocalConfirm" onClick={() => {
        // The one storage call the guarding sweep missed. In a browser that
        // throws on localStorage access rather than on quota (a locked-down
        // profile, "block all cookies"), an unguarded removeItem threw out of
        // this handler before setState and setNotice could run: nothing
        // deleted, nothing confirmed, nothing refused — on the single action
        // in the app that carries a privacy promise.
        const result = clearStoredState();
        if (result !== 'ok') { setNotice('לא הצלחתי למחוק את המידע — הדפדפן חוסם גישה לאחסון המקומי. אפשר למחוק אותו דרך הגדרות האתר בדפדפן.'); return; }
        // Clearing state re-fires the autosave, which put the key straight
        // back — so "המידע המקומי נמחק" was followed by mati-v2 existing again
        // one render later. Skip exactly that write; the next real edit saves
        // normally.
        skipNextSave.current = true;
        setState(emptyState); setDeleteCount((n) => n + 1); setNotice('המידע המקומי נמחק.');
      }}>כן, למחוק את הכל</button></div></details></footer>
  </main></>;
}

function PlanMode({ state, updatePlan, savePlan, dimensions, setState }: { state: MatiState; updatePlan: (key: keyof MatiState['plan'], value: string) => void; savePlan: () => void; dimensions: ReturnType<typeof scoreDimensions>; setState: React.Dispatch<React.SetStateAction<MatiState>>; }) {
  // The checklist waits for her to finish the sentence. Grading a field while
  // someone is still typing in it reads as correction, not help — and this is a
  // reflective tool that tells her, in its own copy, that it is not rating her.
  const [goalTouched, setGoalTouched] = useState(false);
  const lowest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  const suggestion = ({ 'מדדים כמותיים': 'לבחור מדד אחד ולנסח מה ייחשב שינוי נראה לעין אצל צוות המוקד.', 'מערכת ואחריות': 'לקבוע שיחה קצרה עם מנהל/ת ולהגדיר החלטה אחת ומשאב אחד שנדרשים להצלחת התהליך.', 'אופרטיביות ועצמאות': 'להגדיר פעולה אחת שהמודרך יבצע לבד ומה תהיה הראיה לעצמאות.', 'לוח זמנים ויישום': 'לסמן נקודת בדיקה אחת בלוח הזמנים שבה משווים תכנון מול ביצוע.', 'רפלקציה ולמידה': 'להגדיר מראש סימן שיגרום לך לשנות את התוכנית במקום להמשיך אוטומטית.' } as Record<string,string>)[lowest.name] ?? 'לבחור פעולה קטנה אחת שאפשר לבדוק בשטח.';
  return <><div className="sectionHead"><div><span className="kicker">שלב 1 · תכנון</span><h1>תוכנית העבודה שלך</h1></div></div>
    <FormSection number="1" title="למי ומה את רוצה לשנות" tone="blue"><Field label="מי צוותי המוקד / המונחים?" value={state.plan.audience} onChange={(v) => updatePlan('audience', v)} placeholder="למשל: 8 מחנכות כיתות א׳–ב׳ בבית ספר יסודי" /><div className="fieldWithFeedback"><Field label="מטרת SMART אחת" value={state.plan.smartGoal} onChange={(v) => updatePlan('smartGoal', v)} onBlur={() => setGoalTouched(true)} placeholder="מה את רוצה שיקרה אחרת אצל צוותי המוקד?" />{goalTouched && <SmartChecklist plan={state.plan} />}</div></FormSection>
    <FormSection number="2" title="איך נדע שההשפעה באמת קרתה" tone="teal"><Field label="מדד הצלחה 1" value={state.plan.metric1} onChange={(v) => updatePlan('metric1', v)} placeholder="מה נוכל לראות או למדוד?" /><Field label="מדד הצלחה 2" value={state.plan.metric2} onChange={(v) => updatePlan('metric2', v)} placeholder="אפשר גם מדד איכותני עם ראיה ברורה" /></FormSection>
    <FormSection number="3" title="מה צריך לקרות מסביב כדי שזה יעבוד" tone="gold"><Field label="מסגרת זמן גסה" value={state.plan.timeframe} onChange={(v) => updatePlan('timeframe', v)} placeholder="ספטמבר–ינואר, אחת לשבועיים" /><Field label="איפה נדרשת גמישות?" value={state.plan.flexibility} onChange={(v) => updatePlan('flexibility', v)} placeholder="מה עשוי להשתנות בלי לשבור את המטרה?" /><Field label="איזו מעורבות מנהלים נדרשת?" value={state.plan.managers} onChange={(v) => updatePlan('managers', v)} placeholder="החלטות, משאבים, זמן, גיבוי" /><Field label="איך תיראה עצמאות של המודרך?" value={state.plan.independence} onChange={(v) => updatePlan('independence', v)} placeholder="מה הוא יעשה גם כשאת לא בחדר?" /></FormSection>
    {planReady(state.plan)
      ? <div className="actions"><button className="primary" onClick={savePlan}><span>אשרי ושמרי את תוכנית העבודה</span><b aria-hidden="true">←</b></button></div>
      : <p className="saveWhen">אחרי שיהיו קהל יעד, מטרה, שני מדדי הצלחה ומסגרת זמן — אפשר יהיה לשמור. אפשר להמשיך עם "הבא".</p>}
    {planSaved(state) && <Mirror dimensions={dimensions} state={state}><div className="coachingBlock"><span className="coachingLabel">צעד קטן שאפשר לעשות עכשיו</span><p>{state.plan.nextSmallStep || suggestion}</p>{!state.plan.nextSmallStep && <button className="secondary" onClick={() => setState((s) => ({ ...s, plan: { ...s.plan, nextSmallStep: suggestion } }))}>אמצי את הצעד לתוכנית</button>}<div className="socraticGrid"><TextArea label="איך ההצעה מתיישבת עם האני המקצועי שלך?" value={state.plan.identityFit} onChange={(v) => setState((s) => ({ ...s, plan: { ...s.plan, identityFit: v } }))} rows={3} /><TextArea label="מה ייתן לך ביטחון לבצע את הצעד הזה?" value={state.plan.confidenceNeed} onChange={(v) => setState((s) => ({ ...s, plan: { ...s.plan, confidenceNeed: v } }))} rows={3} /></div></div></Mirror>}
    {planSaved(state) && <PlanChangeLog state={state} />}
    {planSaved(state) && <PersonalGanttView state={state} setState={setState} />}
  </>;
}

function FormativeMode({ state, updateContext, updateAnswer, updatePost, setState, saveFormative, dimensions, profile, previousFormative, showAnalysis }: { state: MatiState; updateContext: (key: keyof MatiState['formative']['context'], value: string) => void; updateAnswer: (section: keyof FormativeAnswers, key: string, value: unknown) => void; updatePost: (key: keyof MatiState['formative']['post'], value: string) => void; setState: React.Dispatch<React.SetStateAction<MatiState>>; saveFormative: () => void; dimensions: ReturnType<typeof scoreDimensions>; profile: ReturnType<typeof analyzeInteraction>; previousFormative?: string; showAnalysis: boolean; }) {
  const a = state.formative.answers; const visible = (id: keyof FormativeAnswers) => state.formative.route === 'full' || shortIds.has(id); const longCandidate = [a.q8.didNotWork, a.q8.centralMistake, a.q6.cultureStagnationSign, a.q5.reflection].sort((x, y) => y.length - x.length)[0] ?? ''; const longSummary = summarizeLongText(longCandidate);
  return <><div className="sectionHead"><div><span className="kicker">שלב 2 · הערכה מעצבת</span><h1>מה באמת השתנה עד עכשיו?</h1></div><p>יש מסלול מלא ומסלול ממוקד. שניהם תקפים. מספיק אומדן קרוב — זו עצירה מקצועית לחשיבה, לא מבחן.</p></div>
    <div className="notForRating"><b>לפני שמתחילות:</b> מה שתכתבי כאן לא משמש לדירוג שלך ולא להערכת עובד. זה כלי למידה — הטקסט נשאר במכשיר שלך, ולארגון עוברים רק מדדים מובנים, בלי שם ובלי טקסט חופשי. התשובות שוות משהו רק אם הן כנות, ולכן חשוב שתדעי את זה מראש.</div>
    <section className="contextPanel"><div className="contextHead"><div><span className="kicker">פרטי ההערכה</span><h2>לפני שמתחילות</h2></div><small>הפרטים האלה מחברים בין הרפלקציה לבין מסגרת העבודה בפועל.</small></div><div className="formGrid compactGrid"><Field label="שם המדריכה" value={state.formative.context.instructorName} onChange={(v) => updateContext('instructorName', v)} /><Field label="מסגרת / בית ספר / גן" value={state.formative.context.framework} onChange={(v) => updateContext('framework', v)} /><Field label="תקופת ההערכה" value={state.formative.context.period} onChange={(v) => updateContext('period', v)} placeholder="למשל: ספטמבר–דצמבר" /><Field label="מספר מורים מודרכים" value={state.formative.context.menteeCount} onChange={(v) => updateContext('menteeCount', v)} inputMode="numeric" /><div className="wide"><TextArea label="מטרות מרכזיות בתוכנית" value={state.formative.context.centralGoals} onChange={(v) => updateContext('centralGoals', v)} rows={3} /></div></div></section>
    <div className="routeLabel">מה מתאים לך עכשיו?</div><div className="routePicker"><button aria-pressed={state.formative.route === 'short'} className={state.formative.route === 'short' ? 'choice activeChoice' : 'choice'} onClick={() => setState((s) => ({ ...s, formative: { ...s.formative, route: 'short', savedAt: undefined } }))}><span className="choiceDot" /><span><b>מסלול ממוקד</b><small>סעיפים 1, 2, 5, 8, 9 · כ־10 דקות</small></span></button><button aria-pressed={state.formative.route === 'full'} className={state.formative.route === 'full' ? 'choice activeChoice' : 'choice'} onClick={() => setState((s) => ({ ...s, formative: { ...s.formative, route: 'full', savedAt: undefined } }))}><span className="choiceDot" /><span><b>מסלול מלא</b><small>כל 9 הסעיפים · תמונה מערכתית רחבה</small></span></button></div><div className="softMeasure">גם מענה חלקי הוא בעל ערך. כשאין מספר מדויק, בחרי טווח קרוב או תיאור מילולי.</div>
    <div className="assessmentStack">
      {visible('q1') && <AssessmentSection number="1" title="עמידה ביעדים" subtitle="מטרות, מדדים ואחוז מימוש"><OptionGroup label="באיזו מידה הושגו יעדי תוכנית ההדרכה?" value={a.q1.goalAchievement} onChange={(v) => updateAnswer('q1', 'goalAchievement', v)} options={[["none","לא הושגו"],["partial","הושגו חלקית"],["mostly","הושגו ברובם"],["full","הושגו במלואם"]]} /><OptionGroup label="כמה מהיעדים קיבלו מענה בפועל?" value={a.q1.goalsAnswered} onChange={(v) => updateAnswer('q1', 'goalsAnswered', v)} options={[["under50","פחות מ־50%"],["50-75","50–75%"],["75-90","75–90%"],["100","100%"]]} /><OptionGroup label="האם הוגדרו מדדי הצלחה ברורים לכל יעד?" value={a.q1.measuresDefined} onChange={(v) => updateAnswer('q1', 'measuresDefined', v)} options={[["all","כן, לכל היעדים"],["some","לחלקם"],["no","לא"]]} /><div className="twoCols"><Field label="אחוז המימוש בפועל מתוך היעד" value={a.q1.implementationPercent} onChange={(v) => updateAnswer('q1', 'implementationPercent', v)} suffix="%" inputMode="numeric" /><TextArea label="על איזו ראיה את מבססת את ההערכה?" value={a.q1.evidence} onChange={(v) => updateAnswer('q1', 'evidence', v)} rows={3} /><AnchorHint text={a.q1.evidence} /></div></AssessmentSection>}
      {visible('q2') && <AssessmentSection number="2" title="שינוי בהתנהלות המורה המודרך" subtitle="לפני / אחרי, כולל הראיה לשינוי"><Scale label="תכנון התאמות לתלמידים עם צרכים מיוחדים" value={a.q2.planAdjustments} max={5} onChange={(v) => updateAnswer('q2', 'planAdjustments', v)} /><Scale label="יישום אסטרטגיות הוראה מותאמות" value={a.q2.strategies} max={5} onChange={(v) => updateAnswer('q2', 'strategies', v)} /><Scale label="ניהול כיתה/גן עם שונות גבוהה" value={a.q2.heterogeneity} max={5} onChange={(v) => updateAnswer('q2', 'heterogeneity', v)} /><OptionGroup label="באיזו תדירות המורה יישם כלים שנלמדו?" value={a.q2.frequency} onChange={(v) => updateAnswer('q2', 'frequency', v)} options={[["rarely","לעיתים רחוקות"],["sometimes","לעיתים"],["regular","באופן קבוע"],["independent","באופן עצמאי ועקבי"]]} /><TextArea label="על אילו כלים, תוצרים או תצפיות את קובעת שאכן חל שינוי?" value={a.q2.evidence} onChange={(v) => updateAnswer('q2', 'evidence', v)} rows={4} /><AnchorHint text={a.q2.evidence} /></AssessmentSection>}
      {visible('q3') && <AssessmentSection number="3" title="יישום בפועל של ההדרכה" subtitle="תדירות, מבנה, תצפיות ועומק היישום"><OptionGroup label="באיזו תדירות התקיימו מפגשי ההדרכה כמתוכנן?" value={a.q3.meetingRate} onChange={(v) => updateAnswer('q3', 'meetingRate', v)} options={[["under70","פחות מ־70%"],["70-90","70–90%"],["90-100","90–100%"]]} /><OptionGroup label="באיזו עקביות היו במפגש מטרה, תיעוד ומשימת יישום?" value={a.q3.meetingStructure} onChange={(v) => updateAnswer('q3', 'meetingStructure', v)} options={[["always","תמיד"],["mostly","לרוב"],["sometimes","לעיתים"],["never","כלל לא"]]} /><OptionGroup label="כמה תצפיות / משובים מעשיים ניתנו?" value={a.q3.observations} onChange={(v) => updateAnswer('q3', 'observations', v)} options={[["0","0"],["1-2","1–2"],["3-5","3–5"],["over5","יותר מ־5"]]} /><OptionGroup label="עומק היישום בשטח" value={a.q3.depth} onChange={(v) => updateAnswer('q3', 'depth', v)} options={[["consistent","עקבי ומשמעותי"],["shallow","ברובו שטחי"],["partial","חלקי בלבד"]]} /><TextArea label="הערה קצרה על חסם או תנאי שהשפיע על היישום" value={a.q3.notes} onChange={(v) => updateAnswer('q3', 'notes', v)} rows={3} /></AssessmentSection>}
      {visible('q4') && <AssessmentSection number="4" title="מדידת תרומת ההדרכה" subtitle="מסוגלות המורה, תלמידים ואירועי קושי"><Scale label="תרומת ההדרכה לתחושת המסוגלות המקצועית של המורה" value={a.q4.efficacy} max={5} onChange={(v) => updateAnswer('q4', 'efficacy', v)} /><OptionGroup label="השפעה על תפקוד התלמידים — ויסות, השתתפות, עצמאות" value={a.q4.studentImpact} onChange={(v) => updateAnswer('q4', 'studentImpact', v)} options={[["none","לא"],["low","מועטה"],["medium","בינונית"],["high","משמעותית"]]} /><OptionGroup label="ירידה באירועי קושי / משמעת / חוסר תפקוד" value={a.q4.incidentReduction} onChange={(v) => updateAnswer('q4', 'incidentReduction', v)} options={[["none","לא"],["slight","ירידה קלה"],["significant","ירידה משמעותית"],["notMeasured","לא נמדד"]]} /><div className="twoCols"><Field label="כמה תלמידים הוגדרו ליעד שיפור?" value={a.q4.targetStudents} onChange={(v) => updateAnswer('q4', 'targetStudents', v)} inputMode="numeric" /><Field label="כמה בפועל השתפרו?" value={a.q4.improvedStudents} onChange={(v) => updateAnswer('q4', 'improvedStudents', v)} inputMode="numeric" /></div>{studentImprovementPercent(state) !== null && <MetricHint>שיפור בקרב צוות המוקד שנמדד: <strong>{studentImprovementPercent(state)}%</strong></MetricHint>}<TextArea label="איזו ראיה עזרה לך לקבוע שהשינוי קשור להדרכה?" value={a.q4.evidence} onChange={(v) => updateAnswer('q4', 'evidence', v)} rows={3} /><AnchorHint text={a.q4.evidence} /></AssessmentSection>}
      {visible('q5') && <AssessmentSection number="5" title="בקרה עצמית של המדריכה" subtitle="התאמות, כלי הערכה ואחוז מימוש שעות שטח"><Scale label="עד כמה התאמת את ההדרכה לצרכים האישיים של המורה?" value={a.q5.tailoring} max={5} onChange={(v) => updateAnswer('q5', 'tailoring', v)} /><OptionGroup label="האם השתמשת בכלי הערכה עקביים לאורך התהליך?" value={a.q5.assessmentTools} onChange={(v) => updateAnswer('q5', 'assessmentTools', v)} options={[["yes","כן"],["partial","חלקית"],["no","לא"]]} /><OptionGroup label="כמה התאמות בוצעו בתוכנית בעקבות משוב או צורך?" value={a.q5.adaptations} onChange={(v) => updateAnswer('q5', 'adaptations', v)} options={[["0","0"],["1-2","1–2"],["3-4","3–4"],["over4","יותר מ־4"]]} /><TextArea label="אחר / התאמה משמעותית שחשוב לתעד" value={a.q5.other} onChange={(v) => updateAnswer('q5', 'other', v)} rows={3} /><div className="twoCols"><Field label="שעות שטח שתכננתי לשבוע" value={a.q5.plannedHours} onChange={(v) => updateAnswer('q5', 'plannedHours', v)} inputMode="decimal" /><Field label="שעות שטח בפועל" value={a.q5.actualHours} onChange={(v) => updateAnswer('q5', 'actualHours', v)} inputMode="decimal" /></div>{fieldHoursPercent(state) !== null && <MetricHint>אחוז מימוש שעות שטח: <strong>{fieldHoursPercent(state)}%</strong></MetricHint>}<TextArea label="מה למדת מהפער בין התכנון לביצוע?" value={a.q5.reflection} onChange={(v) => updateAnswer('q5', 'reflection', v)} rows={4} /></AssessmentSection>}
      {visible('q6') && <AssessmentSection number="6" title="מדדי מערכת: צוות–מנהלים–משאבים–תרבות" subtitle="התנאים המערכתיים שמקדמים או עוצרים את ההשפעה"><OptionGroup label="האם ביקשת משוב שיטתי מהצוותים?" value={a.q6.teamFeedbackAsked} onChange={(v) => updateAnswer('q6', 'teamFeedbackAsked', v)} options={[["yes","כן"],["no","לא"]]} /><div className="threeCols"><Field label="הערה חוזרת 1" value={a.q6.feedback1} onChange={(v) => updateAnswer('q6', 'feedback1', v)} /><Field label="הערה חוזרת 2" value={a.q6.feedback2} onChange={(v) => updateAnswer('q6', 'feedback2', v)} /><Field label="הערה חוזרת 3" value={a.q6.feedback3} onChange={(v) => updateAnswer('q6', 'feedback3', v)} /></div><OptionGroup label="הטון הכללי של המשוב" value={a.q6.feedbackTone} onChange={(v) => updateAnswer('q6', 'feedbackTone', v)} options={[["positive","חיובי"],["mixed","מעורב"],["negative","שלילי"]]} /><div className="twoCols"><Field label="פגישות מנהלים שתוכננו" value={a.q6.managerPlanned} onChange={(v) => updateAnswer('q6', 'managerPlanned', v)} inputMode="numeric" /><Field label="פגישות מנהלים שהתקיימו" value={a.q6.managerActual} onChange={(v) => updateAnswer('q6', 'managerActual', v)} inputMode="numeric" /></div>{managerMeetingPercent(state) !== null && <MetricHint>מימוש פגישות מנהלים: <strong>{managerMeetingPercent(state)}%</strong></MetricHint>}<OptionGroup label="רמת מחויבות מנהלים" value={a.q6.managerCommitment} onChange={(v) => updateAnswer('q6', 'managerCommitment', v)} options={[["high","גבוהה"],["medium","בינונית"],["low","נמוכה"],["resistance","התנגדות"]]} /><OptionGroup label="האם הוקצו משאבים?" value={a.q6.resourcesAllocated} onChange={(v) => updateAnswer('q6', 'resourcesAllocated', v)} options={[["yes","כן"],["partial","חלקית"],["no","לא"]]} /><div className="twoCols"><Field label="משאבים שביקשתי" value={a.q6.resourcesRequested} onChange={(v) => updateAnswer('q6', 'resourcesRequested', v)} /><Field label="אחוז משאבים שהוקצו בפועל" value={a.q6.resourcesPercent} onChange={(v) => updateAnswer('q6', 'resourcesPercent', v)} suffix="%" inputMode="numeric" /></div><TextArea label="החוסרים המרכזיים" value={a.q6.shortages} onChange={(v) => updateAnswer('q6', 'shortages', v)} rows={3} /><OptionGroup label="האם ניכרת שפה מקצועית חדשה בשטח?" value={a.q6.newProfessionalLanguage} onChange={(v) => updateAnswer('q6', 'newProfessionalLanguage', v)} options={[["yes","כן"],["partial","חלקית"],["no","לא"]]} /><div className="twoCols"><TextArea label="סימן אחד לשינוי חיובי בתרבות" value={a.q6.culturePositiveSign} onChange={(v) => updateAnswer('q6', 'culturePositiveSign', v)} rows={3} /><TextArea label="סימן אחד לקיפאון / נסיגה" value={a.q6.cultureStagnationSign} onChange={(v) => updateAnswer('q6', 'cultureStagnationSign', v)} rows={3} /></div><div className="twoCols"><Field label="הדרכה לחדר מורים — כמה פעמים?" value={a.q6.teacherRoomTraining} onChange={(v) => updateAnswer('q6', 'teacherRoomTraining', v)} /><Field label="הדרכה לסייעות — פורמט וכמה פעמים?" value={a.q6.aidesTraining} onChange={(v) => updateAnswer('q6', 'aidesTraining', v)} /></div></AssessmentSection>}
      {visible('q7') && <AssessmentSection number="7" title="מדדים לסיום התהליך" subtitle="עצמאות, המשכיות והמלצות מבוססות נתונים"><OptionGroup label="האם המורה מסוגל לפעול באופן עצמאי בתחומים שנלמדו?" value={a.q7.independence} onChange={(v) => updateAnswer('q7', 'independence', v)} options={[["none","לא"],["partial","חלקית"],["most","ברוב התחומים"],["all","בכל התחומים"]]} /><OptionGroup label="האם הוגדרו המלצות המשך מבוססות נתונים?" value={a.q7.dataBasedRecommendations} onChange={(v) => updateAnswer('q7', 'dataBasedRecommendations', v)} options={[["yes","כן"],["no","לא"]]} /><OptionGroup label="האם הצוותים ממשיכים ליישם ללא תלות גבוהה במדריכה?" value={a.q7.continuesWithoutDependency} onChange={(v) => updateAnswer('q7', 'continuesWithoutDependency', v)} options={[["yes","כן"],["partial","חלקית"],["no","לא"]]} /><TextArea label="איזו ראיה מראה שהבעלות באמת עברה למודרך / לצוות?" value={a.q7.evidence} onChange={(v) => updateAnswer('q7', 'evidence', v)} rows={3} /><AnchorHint text={a.q7.evidence} /></AssessmentSection>}
      {visible('q8') && <AssessmentSection number="8" title="רפלקציה מסכמת של המדריכה" subtitle="מה עבד, מה לא, מה למדת ומה תעשי אחרת"><div className="twoCols"><TextArea label="מה עבד טוב מהצפוי?" value={a.q8.workedBetter} onChange={(v) => updateAnswer('q8', 'workedBetter', v)} rows={4} /><AnchorHint text={a.q8.workedBetter} /><TextArea label="מה לא עבד ולמה?" value={a.q8.didNotWork} onChange={(v) => updateAnswer('q8', 'didNotWork', v)} rows={4} /><AnchorHint text={a.q8.didNotWork} /></div><div className="threeCols"><Field label="הצלחה 1" value={a.q8.success1} onChange={(v) => updateAnswer('q8', 'success1', v)} /><Field label="הצלחה 2" value={a.q8.success2} onChange={(v) => updateAnswer('q8', 'success2', v)} /><Field label="הצלחה 3" value={a.q8.success3} onChange={(v) => updateAnswer('q8', 'success3', v)} /></div><TextArea label="מה הייתה טעות מרכזית ומה למדת ממנה?" value={a.q8.centralMistake} onChange={(v) => updateAnswer('q8', 'centralMistake', v)} rows={4} /><TextArea label="מתי היית גמישה ומתי קשיחה מדי?" value={a.q8.flexibilityReflection} onChange={(v) => updateAnswer('q8', 'flexibilityReflection', v)} rows={4} /><div className="threeCols"><Field label="צעד הבא 1" value={a.q8.next1} onChange={(v) => updateAnswer('q8', 'next1', v)} /><Field label="צעד הבא 2" value={a.q8.next2} onChange={(v) => updateAnswer('q8', 'next2', v)} /><Field label="צעד הבא 3" value={a.q8.next3} onChange={(v) => updateAnswer('q8', 'next3', v)} /></div></AssessmentSection>}
      {visible('q9') && <AssessmentSection number="9" title="ציון אפקטיביות משוקלל לעצמי" subtitle="1–10 לכל תחום; הממוצע מחושב אוטומטית"><Scale label="עמידה ביעדים" value={a.q9.goals} max={10} onChange={(v) => updateAnswer('q9', 'goals', v)} /><Scale label="יישום בפועל" value={a.q9.implementation} max={10} onChange={(v) => updateAnswer('q9', 'implementation', v)} /><Scale label="שינוי אצל מורה מודרך" value={a.q9.teacherChange} max={10} onChange={(v) => updateAnswer('q9', 'teacherChange', v)} /><Scale label="השפעה על תלמידים" value={a.q9.studentImpact} max={10} onChange={(v) => updateAnswer('q9', 'studentImpact', v)} /><Scale label="קיימות והמשכיות" value={a.q9.sustainability} max={10} onChange={(v) => updateAnswer('q9', 'sustainability', v)} />{selfEffectivenessAverage(state) !== null && <EffectivenessAverage value={selfEffectivenessAverage(state)!} />}</AssessmentSection>}
    </div>
    {longSummary && <div className="summaryConfirm"><span className="kicker">בדיקת הבנה</span><p><strong>הבנתי ש...</strong> {longSummary}</p><small>זה תמצות מכני של מה שכתבת כדי לא לאבד את העיקר; אם הוא לא מייצג אותך, השאירי את הטקסט המקורי כסמכות.</small></div>}
    <div className="postReflection"><div className="sectionHead compact"><div><span className="kicker">סגירת הלולאה</span><h3>לפני ששומרות</h3></div><p>שלוש שאלות קצרות שמתרגמות את הרפלקציה להמשך.</p></div>{previousFormative && <div className="historyLoop"><b>בפעם הקודמת נשמר:</b><span>{previousFormative}</span><small>איך זה נראה עכשיו?</small></div>}<div className="threeCols"><TextArea label="מה הדבר האחד שתיקחי הלאה?" value={state.formative.post.oneThing} onChange={(v) => updatePost('oneThing', v)} rows={3} /><TextArea label="איך ההרגשה אחרי העצירה הזו?" value={state.formative.post.feeling} onChange={(v) => updatePost('feeling', v)} rows={3} /><TextArea label="מה תרצי לבדוק בפעם הבאה?" value={state.formative.post.nextCheck} onChange={(v) => updatePost('nextCheck', v)} rows={3} /></div></div>
    <div className="actions"><button className="primary" onClick={saveFormative}><span>שמרי והציגי תמונה מקצועית</span><b aria-hidden="true">←</b></button></div>{showAnalysis && <FormativeAnalysis state={state} dimensions={dimensions} profile={profile} />}
  </>;
}

function FormativeAnalysis({ state, dimensions, profile }: { state: MatiState; dimensions: ReturnType<typeof scoreDimensions>; profile: ReturnType<typeof analyzeInteraction> }) {
  const sorted = [...dimensions].sort((a, b) => b.score - a.score); const lighthouse = sorted[0]; const lowest = sorted[sorted.length - 1]; const actions = recommendedActions(state); const impl = implementationStatus(state); const studentPct = studentImprovementPercent(state); const fieldPct = fieldHoursPercent(state); const managerPct = managerMeetingPercent(state); const evidenceStrengths = sorted.filter((d) => d.score >= 4 && d.evidence.length).slice(0, 2);
  const styleText = profile.style === 'analytic' ? 'המענה שלך כרגע נשען יחסית על מספרים, יעדים והבחנות. לכן אני מציג קודם את המדדים והפערים.' : profile.style === 'intuitive' ? 'המענה שלך כרגע נשען יחסית על תיאורים ודוגמאות. לכן חשוב לשמור את הסיפור, ובמקביל לחלץ ממנו ראיה אחת שאפשר לבדוק.' : 'המענה שלך כרגע משלב תיאור מקצועי עם נתונים. זה מאפשר לחבר בין מה שהרגשת שקרה לבין מה שאפשר לראות בשטח.';
  return <section className="analysisPanel"><div className="sectionHead compact"><div><span className="kicker">התמונה המקצועית</span><h3>ממצא → הכרעה → פעולה</h3></div><p>כל המסקנות כאן נשענות על מה שהזנת. כשאין נתון, המערכת מציינת שאין נתון ולא משלימה אותו.</p></div><div className="metricRow"><MetricCard label="מימוש היעדים" value={impl !== null ? `${impl}%` : 'לא נמדד'} /><MetricCard label="שיפור תלמידי מוקד" value={studentPct !== null ? `${studentPct}%` : 'לא נמדד'} /><MetricCard label="מימוש שעות שטח" value={fieldPct !== null ? `${fieldPct}%` : 'לא נמדד'} /><MetricCard label="פגישות מנהלים" value={managerPct !== null ? `${managerPct}%` : 'לא נמדד'} /></div><IndependenceCard state={state} /><div className="lighthouse"><span aria-hidden="true">✦</span><div><b>המגדלור החיובי: {lighthouse.name}</b><p>{lighthouse.evidence[0] || 'זהו כרגע הממד החזק יחסית, אך עדיין כדאי להוסיף ראיה קונקרטית.'}</p></div></div>{evidenceStrengths.length > 0 && <div className="strengths"><h4>חוזקות שעולות מהנתונים</h4>{evidenceStrengths.map((d) => <div key={d.name}><b>{d.name}</b><span>{d.evidence.slice(0, 2).join(' · ')}</span></div>)}</div>}{profile.style === 'intuitive' ? <div className="dimensionNarrative">{dimensions.map((d) => <p key={d.name}><strong>{d.name} — {d.score}/5:</strong> {d.evidence.length ? d.evidence.join('; ') : 'עדיין חסרה ראיה מספקת.'}</p>)}</div> : <DimensionGrid dimensions={dimensions} />}<div className="systemAnalysis"><h4>איך סגנון העבודה והמערכת נפגשים</h4><p>{styleText}</p><p>{state.formative.answers.q6.managerCommitment === 'low' || state.formative.answers.q6.managerCommitment === 'resistance' ? 'במקביל, יש כרגע סימן לחסם מערכתי במעורבות הנהלה. לא נכון לייחס את כל הפער לביצוע של המדריכה.' : 'לא זוהה כרגע חסם הנהלה חריף מתוך הנתונים שנמסרו; אם קיים חסם כזה ולא תועד, כדאי להוסיף אותו.'}</p></div><div className="opportunity"><span className="opportunityLabel">ההזדמנות הקריטית כרגע</span><b>{lowest.name}</b><p>{lowest.evidence.length ? `יש ראיות, אבל זה עדיין הממד החלש יחסית: ${lowest.evidence.join(' · ')}` : 'כאן כמעט לא נאספו ראיות. לפני שמוסיפים פעילות, כדאי לבדוק איזה נתון או בעלות חסרים.'}</p><p className="whyItMatters"><strong>למה זה משנה:</strong> אם הממד הזה נשאר חלש, קשה לדעת האם הפעילות עצמה יצרה שינוי שנשאר בשטח.</p></div><div className="recommendations"><h4>שלושה צעדים קונקרטיים להמשך</h4>{actions.map((action, i) => <div key={action}><span>{i + 1}</span><p>{action}</p></div>)}</div></section>;
}

function SummativeMode({ state, setState, addHistory }: { state: MatiState; setState: React.Dispatch<React.SetStateAction<MatiState>>; addHistory: (stage: Stage, label: string, note: string) => void }) {
  const rubric = rubricForNextYear(state); const dims = [...scoreDimensions(state)].sort((a, b) => a.score - b.score); const recipe = [`מיקוד: לבחור צוותי מוקד ולתת קדימות ל־${rubric.focus.join(' ו־') || 'הממד החלש ביותר'}.`, 'מדידה: להגדיר מראש לפחות שני סימנים להשפעה, לא רק לכך שהדרכה התקיימה.', 'בעלות: לקבוע מה עובר למודרך, לצוות ולמנהל כדי שהיישום לא יישאר תלוי במדריכה.', 'למידה: לקבוע נקודת בדיקה שבה משווים תכנון, תוצאה וחסם ומעדכנים את התוכנית.'];
  return <><div className="sectionHead"><div><span className="kicker">שלב 3 · הערכה מסכמת</span><h1>סוגרות לולאה, לא רק שנה</h1></div><p>שלוש תשובות שמתרגמות את השנה להחלטות עבודה ברורות לפתיחת השנה הבאה.</p></div><div className="questionStack summativeStack"><TextArea label="1. ההישג המשמעותי ביותר לצוותי המוקד" value={state.summative.achievement} onChange={(v) => setState((s) => ({ ...s, summative: { ...s.summative, achievement: v, savedAt: undefined } }))} rows={4} /><Field label="המדד שמראה שההישג קרה" value={state.summative.achievementMetric} onChange={(v) => setState((s) => ({ ...s, summative: { ...s.summative, achievementMetric: v, savedAt: undefined } }))} placeholder="מספר, אחוז, תצפית חוזרת או ראיה אחרת" /><TextArea label="2. נקודת המפנה האישית שלך" value={state.summative.turningPoint} onChange={(v) => setState((s) => ({ ...s, summative: { ...s.summative, turningPoint: v, savedAt: undefined } }))} rows={4} /><TextArea label="3. השינוי המרכזי שתעשי בשנה הבאה" value={state.summative.nextYearChange} onChange={(v) => setState((s) => ({ ...s, summative: { ...s.summative, nextYearChange: v, savedAt: undefined } }))} rows={4} /></div><section className="rubric"><div className="rubricHead"><span className="rubricIcon" aria-hidden="true">✓</span><span><b>מחוון מותאם לפתיחת השנה הבאה</b><small>נבנה מהנתונים שנאספו השנה</small></span></div><div className="rubricGrid"><div><b>מדדים</b><p>לפחות שני סימנים ברורים להשפעה, כולל מדד לצוותי מוקד.</p></div><div><b>גמישות</b><p>להגדיר מראש מה יכול להשתנות ומה אסור לאבד.</p></div><div><b>מעורבות מנהלים</b><p>לקבוע איפה נדרשת החלטה, משאב או חסות מערכתית.</p></div><div><b>תרגום מדיניות לעשייה</b><p>כל עיקרון מסתיים בפעולה שניתן לראות בשטח.</p></div></div><div className="rubricDynamic"><div><h2>טעויות / פערים שכדאי לא לחזור עליהם</h2><ul>{rubric.mistakes.map((m) => <li key={m}>{m}</li>)}</ul></div><div><h2>שאלות מפתח לפתיחת השנה</h2><ul>{rubric.questions.map((q) => <li key={q}>{q}</li>)}</ul></div></div><div className="recipe"><h2>מתכון תמציתי להצלחה</h2>{recipe.map((r, i) => <p key={r}><span>{i + 1}</span>{r}</p>)}</div><div className="yearFocus"><strong>שני מוקדי הלמידה שעולים מהשנה:</strong><span>{dims.slice(0, 2).map((d) => d.name).join(' · ')}</span></div></section><div className="actions"><button className="primary" onClick={() => { if (!state.summative.achievement.trim() || !state.summative.achievementMetric.trim() || !state.summative.turningPoint.trim() || !state.summative.nextYearChange.trim()) { alert('כדי לסגור את השנה, השלימי את שלוש השאלות ואת המדד להישג המרכזי.'); return; } const stamp = new Date().toISOString(); setState((s) => ({ ...s, summative: { ...s.summative, savedAt: stamp } })); addHistory(3, 'הערכה מסכמת נשמרה', state.summative.nextYearChange); }}><span>סגרי את השנה ושמרי</span><b aria-hidden="true">✓</b></button></div>{state.summative.savedAt && <div className="closingSummary"><span aria-hidden="true">✓</span><div><b>הלולאה נסגרה.</b><p>יש עכשיו עקבה שמחברת בין ההישג, נקודת המפנה והשינוי שתיקחי לשנה הבאה. האחריות אינה רק על מה שתעשי — אלא על מה יישאר בשטח גם בלעדייך.</p></div></div>}</>;
}

function AdaptiveSignal({ profile, activeStage }: { profile: ReturnType<typeof analyzeInteraction>; activeStage: Stage }) { if (profile.responseCount < 2) return null; if (profile.minimalism) return <div className="adaptiveSignal soft">אני מרגיש שאת לא פנויה להרחיב. אפשר לעבוד כרגע באופן ממוקד יותר — {activeStage === 2 ? 'המסלול המקוצר כבר מסומן עבורך כאפשרות.' : 'עני רק על השדות שמקדמים את הצעד הבא.'}</div>; if (profile.overload) return <div className="adaptiveSignal soft">עולה מהתשובות עומס משמעותי. נפריד בין מה שבשליטתך לבין חסמי מערכת, כדי שהרפלקציה לא תהפוך לעוד משימה.</div>; if (profile.pace === 'compact') return <div className="adaptiveSignal">התשובות שלך כרגע קצרות וענייניות. אשמור על תצוגה תמציתית ואעדיף בחירות סגורות כשאפשר.</div>; return null; }
function StatusRow({ done, label }: { done: boolean; label: string }) { return <div className={done ? 'statusDone' : ''}><b aria-hidden="true">{done ? '✓' : '○'}</b><span>{label}</span></div>; }
function ProgressRing({ value, label }: { value: number; label: string }) { return <div className="progressBox"><div className="progressValue">{value}%</div><div><b>{label}</b><span>אחוז מילוי משוער של המסלול שנבחר</span></div></div>; }
// h2, not h3: each stage now opens with its own h1 (see the K/accessibility
// fix — page-has-heading-one), and these sit directly under it with nothing
// between — h3 here would skip a level (axe: heading-order).
function FormSection({ number, title, tone, children }: { number: string; title: string; tone: 'blue' | 'teal' | 'gold'; children: React.ReactNode }) { return <section className={`formSection ${tone}`}><div className="formSectionHead"><span>{number}</span><h2>{title}</h2></div><div className="formGrid">{children}</div></section>; }
function AssessmentSection({ number, title, subtitle, children }: { number: string; title: string; subtitle: string; children: React.ReactNode }) { return <section className="assessmentSection"><div className="assessmentHead"><span>{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="assessmentBody">{children}</div></section>; }
function Field({ label, value, onChange, placeholder, suffix, inputMode, onBlur }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; suffix?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; onBlur?: () => void }) { return <label className="field"><span>{label}</span><div className="inputWrap"><input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} inputMode={inputMode} />{suffix && <b>{suffix}</b>}</div></label>; }
function TextArea({ label, value, onChange, rows = 4 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) { return <label className="field textField"><span>{label}</span><textarea rows={rows} value={value} onChange={(e) => onChange(e.target.value)} placeholder="כתבי כאן. אפשר גם בקצרה." /></label>; }
function OptionGroup({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]> }) { return <fieldset className="optionGroup"><legend>{label}</legend><div>{options.map(([key, text]) => <button type="button" key={key} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}</div></fieldset>; }
function Scale({ label, value, max, onChange }: { label: string; value: number | null; max: 5 | 10; onChange: (value: number) => void }) { return <fieldset className="scale"><legend>{label}</legend><div className={max === 10 ? 'tenScale' : ''}>{Array.from({ length: max }, (_, i) => i + 1).map((n) => <button type="button" key={n} aria-pressed={value === n} onClick={() => onChange(n)}>{n}</button>)}</div><small>{max === 5 ? '1 = ללא שינוי · 5 = שיפור משמעותי' : '1 = נמוך מאוד · 10 = גבוה מאוד'}</small></fieldset>; }
function AnchorHint({ text }: { text: string }) {
  if (!needsConcreteAnchor(text)) return null;
  return <small className="anchorHint" role="note">{ANCHOR_HINT}</small>;
}
function MetricHint({ children }: { children: React.ReactNode }) { return <div className="metricHint">{children}<small>זה חישוב מתוך המספרים שהזנת, לא הערכה של המערכת.</small></div>; }
function EffectivenessAverage({ value }: { value: number }) { const label = value >= 8.5 ? 'מצוין' : value >= 7 ? 'טוב מאוד' : value >= 5.5 ? 'בינוני — דורש חיזוק' : 'נדרש שינוי תוכנית'; return <div className="effectivenessAverage"><span>ממוצע כולל</span><strong>{value}/10</strong><b>{label}</b></div>; }
function MetricCard({ label, value }: { label: string; value: string }) { return <div className="metricCard"><span>{label}</span><strong>{value}</strong></div>; }
function DimensionGrid({ dimensions }: { dimensions: ReturnType<typeof scoreDimensions> }) { return <div className="dimensionGrid">{dimensions.map((item) => <div className="dimension" key={item.name}><div><b>{item.name}</b><Stars score={item.score} /></div><p>{item.note}</p><small>{item.evidence.length ? item.evidence.slice(0, 2).join(' · ') : 'עדיין חסרה ראיה קונקרטית.'}</small></div>)}</div>; }
function Mirror({ dimensions, state, children }: { dimensions: ReturnType<typeof scoreDimensions>; state: MatiState; children?: React.ReactNode }) { const sorted = [...dimensions].sort((a, b) => a.score - b.score); const lowest = sorted[0]; const strongest = sorted[sorted.length - 1]; const questions: Record<string, string> = { 'רפלקציה ולמידה': 'איזה סימן בשטח יגרום לך לשנות כיוון במקום להמשיך לפי התוכנית המקורית?', 'מדדים כמותיים': 'איזו ראיה אחת תאפשר למישהו שלא היה בתהליך לראות שהתרחש שינוי?', 'לוח זמנים ויישום': 'איפה צפוי הפער הגדול ביותר בין מה שתכננת לבין מה שאפשר באמת לבצע?', 'מערכת ואחריות': 'איזו החלטה נמצאת אצל מנהל/ת או צוות, ולא נכון שתישאר בבעלותך?', 'אופרטיביות ועצמאות': 'מה המודרך יעשה בעצמו כדי שתדעי שההדרכה לא יצרה תלות?' }; return <section className="mirror"><div className="sectionHead compact"><div><span className="kicker">המראה המקצועית</span><h3>מה התכנון כבר מחזיק — ומה עדיין צריך לחזק</h3></div><p>הדירוג מתייחס לראיות שנמצאות בתוכנית, לא לאישיות ולא לערך המקצועי שלך.</p></div><div className="strengthBanner"><span aria-hidden="true">✦</span><div><b>חוזקה שנראית כרגע: {strongest.name}</b><p>{strongest.evidence[0] || 'זה הממד החזק יחסית בתמונה הנוכחית.'}</p></div></div><DimensionGrid dimensions={dimensions} /><div className="opportunity"><span className="opportunityLabel">ההזדמנות הקריטית</span><b>{lowest.name}</b><p>{questions[lowest.name]}</p><p className="whyItMatters"><strong>למה זה משנה:</strong> תוכנית טובה לא רק מתארת מה תעשי; היא מאפשרת לדעת מה השתנה ומי מחזיק את השינוי אחרייך.</p><p className="beforeAfter"><strong>לפני:</strong> “דיברנו על התאמות.” <strong>אחרי:</strong> “בשלושה מתוך ארבעה שיעורים המורה בחרה התאמה בעצמה והסבירה למה.”</p></div>{children}</section>; }

function SmartChecklist({ plan }: { plan: MatiState['plan'] }) {
  if (!plan.smartGoal.trim()) return null;
  const evaluation = evaluateSmartGoal(plan);
  // One question, not a scorecard. Four rows of misses under a sentence she just
  // wrote reads as a grade, and nothing here is a grade: none of it blocks a save,
  // and the deferred letters are other fields' business entirely. When there is
  // nothing worth asking, this says nothing at all — silence is the good outcome,
  // and a row of ticks would still be the product marking her work.
  const [first] = evaluation.missing;
  if (!first) return null;
  return <div className="smartChecklist"><p>{first.hint}</p></div>;
}

function IndependenceCard({ state }: { state: MatiState }) {
  const reading = independenceReading(state);
  return <section className={`independenceCard ${reading.stopAndCheck ? 'stopAndCheck' : reading.verdict}`}>
    <div className="independenceHead">
      <span className="kicker">{reading.stopAndCheck ? 'שווה לעצור כאן' : 'עצמאות והמשכיות'}</span>
      <b>{reading.headline}</b>
    </div>
    {reading.signals.length > 0 && <ul className="independenceSignals">{reading.signals.map((s) => (
      <li key={s.label} className={`level-${s.level}`}><span>{s.label}</span><strong>{s.reading}</strong></li>
    ))}</ul>}
    <p>{reading.note}</p>
  </section>;
}

function PlanChangeLog({ state }: { state: MatiState }) {
  const revisions = state.planRevisions;
  const fmt = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'long' });
  if (!revisions.length) {
    return <section className="planChanges empty"><div className="sectionHead compact"><div><span className="kicker">מה השתנה בתוכנית</span><h3>עוד לא שינית את התוכנית</h3></div></div>
      <p>זו עדיין הגרסה הראשונה. אם בהמשך השנה תשני מטרה, מדד או לוח זמנים — הגרסה הקודמת תישמר כאן לצד החדשה, כדי שיהיה אפשר לראות מה למדת ולא רק איפה הגעת.</p></section>;
  }
  const summary = changedFieldsSummary(revisions);
  return <section className="planChanges"><div className="sectionHead compact"><div><span className="kicker">מה השתנה בתוכנית</span><h3>{revisions.length === 1 ? 'עדכנת את התוכנית פעם אחת' : `עדכנת את התוכנית ${revisions.length} פעמים`}</h3></div><p>שינוי בתוכנית הוא ראיה ללמידה. כאן נשמר מה בדיוק השתנה ומתי.</p></div>
    <div className="planChangesSummary">{summary.map((s) => <span key={s.label}>{s.label}{s.times > 1 ? ` · ${s.times}×` : ''}</span>)}</div>
    <ol className="planChangeList">{[...revisions].reverse().map((revision) => (
      <li key={revision.at}>
        <b>{fmt(revision.at)}</b>
        <ul>{revision.changes.map((change) => (
          <li key={change.field}>
            <strong>{change.label}</strong>
            <span className="planChangeBefore">{change.before || '(היה ריק)'}</span>
            <span className="planChangeArrow" aria-hidden="true">←</span>
            <span className="planChangeAfter">{change.after || '(רוקן)'}</span>
          </li>
        ))}</ul>
      </li>
    ))}</ol>
  </section>;
}

function PersonalGanttView({ state, setState }: { state: MatiState; setState: React.Dispatch<React.SetStateAction<MatiState>> }) {
  const gantt = useMemo(() => buildPersonalGantt(state), [state]);
  if (!gantt) return null;
  const { start, end, now, milestones, cadence } = gantt;
  const todayPct = timelinePercent(now, start, end);
  const fmt = (d: Date) => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
  const bands = milestones.filter((m) => m.rangeEnd);
  const marks = milestones.filter((m) => !m.rangeEnd);
  // A repeating texture, not enumerated ticks: a weekly cadence over a
  // ten-month span is dozens of occurrences — too many points for a 34px
  // bar, and the gap between them would barely be perceptible at this
  // scale either way. The texture is a fixed, qualitative "recurs here"
  // signal; the exact interval is stated in the text note below instead
  // of encoded in pixel spacing that would be misleading at this size.

  // The bar's dots stay purely decorative (aria-hidden, pointer-events:none
  // via CSS): they sit inside an already-tight 34px track next to several
  // overlapping absolutely-positioned siblings, and the visible dot itself
  // is a ::before pseudo-element with no real hit area of its own. The
  // legend rows below are real DOM, already roomy, and already the
  // accessible-equivalent listing for the whole chart — so that is where
  // the actual interaction lives.
  function adjustMilestone(m: TimelineMilestone, deltaDays: number) {
    if (!m.adjustable) return;
    const next = toDateOnly(addDays(m.date, deltaDays));
    setState((s) => ({ ...s, plan: { ...s.plan, [m.adjustable!.overrideKey]: next } }));
  }
  function resetMilestone(m: TimelineMilestone) {
    if (!m.adjustable) return;
    setState((s) => ({ ...s, plan: { ...s.plan, [m.adjustable!.overrideKey]: '' } }));
  }

  const todayInRange = now.getTime() >= start.getTime() && now.getTime() <= end.getTime();

  return <section className="personalGantt"><div className="sectionHead compact"><div><span className="kicker">לוח הזמנים שלך</span><h3>הגאנט האישי שנגזר מהתוכנית</h3></div><p>נבנה מתאריך שמירת התוכנית ומהשדות שמילאת למעלה. שדה ריק לא מקבל נקודת דרך. התאריך לכל נקודת דרך אישית הוא הצעה שאפשר לכוונן בכל שורה למטה — לא עובדה קבועה, בשונה משני חלונות ההערכה.</p></div>
    {/* role="img": a bare div's implicit role is "generic", which does not
        permit aria-label at all (axe: aria-prohibited-attr) — a screen
        reader has no obligation to announce it. This is a compound visual
        graphic described as one whole, which is exactly what role="img" is for. */}
    <div className="ganttTrack" role="img" aria-label={`ציר זמן מ־${fmt(start)} עד ${fmt(end)}${cadence ? `, קצב מפגשים שזוהה: ${cadence.label}` : ''}`}>
      <div className="ganttBar">
        {cadence && <div className="ganttCadence" aria-hidden="true" />}
        {bands.map((m) => <div key={m.kind} className="ganttBand" aria-hidden="true" style={{ right: `${timelinePercent(m.date, start, end)}%`, width: `${Math.max(2, timelinePercent(m.rangeEnd!, start, end) - timelinePercent(m.date, start, end))}%` }} />)}
        {marks.map((m) => <span key={m.kind} className="ganttMark" aria-hidden="true" style={{ right: `${timelinePercent(m.date, start, end)}%` }} />)}
        {/* Pinning "today" to an edge when it's actually outside [start,end] (an old plan viewed much later, say) would misreport where today really is — so it only renders inside the range it can honestly represent. */}
        {todayInRange && <div className="ganttToday" aria-hidden="true" style={{ right: `${todayPct}%` }}><i aria-hidden="true" /><b>היום</b></div>}
      </div>
      <div className="ganttAxis" aria-hidden="true"><span>{fmt(start)}</span><span>{fmt(end)}</span></div>
    </div>
    {cadence && <p className="ganttCadenceNote">זוהה קצב מפגשים — <strong>{cadence.label}</strong> — מתוך "מסגרת זמן" למעלה. אם זה לא מדויק, אפשר פשוט להתעלם; שום דבר לא נשמר בגלל זה.</p>}
    <ul className="ganttLegend">{milestones.map((m) => {
      const row = <span className="ganttLegendRow"><b aria-hidden="true" className={m.rangeEnd ? 'ganttDot band' : 'ganttDot'} /><span><strong>{m.label}</strong> · {fmt(m.date)}{m.rangeEnd ? `–${fmt(m.rangeEnd)}` : ''}</span><small>{m.detail}</small></span>;
      if (!m.adjustable) return <li key={m.kind}>{row}</li>;
      const adjustable = m.adjustable;
      return <li key={m.kind}><details className="ganttLegendAdjust"><summary>{row}</summary>
        <div className="ganttAdjustPanel">
          <div className="ganttAdjustRow">
            <button type="button" onClick={() => adjustMilestone(m, -7)}>שבוע קודם</button>
            <button type="button" onClick={() => adjustMilestone(m, -1)}>יום קודם</button>
            <span>{fmt(m.date)}</span>
            <button type="button" onClick={() => adjustMilestone(m, 1)}>יום הבא</button>
            <button type="button" onClick={() => adjustMilestone(m, 7)}>שבוע הבא</button>
          </div>
          {adjustable.adjusted && <button type="button" className="textButton ganttReset" onClick={() => resetMilestone(m)}>איפוס להצעה ({fmt(adjustable.defaultDate)})</button>}
        </div>
      </details></li>;
    })}</ul>
  </section>;
}
