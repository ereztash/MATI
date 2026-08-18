'use client';

import { useEffect, useMemo, useState } from 'react';
import { FormativeAnswers, MatiState, stage2SectionStarted, stageFromDate, Stage } from '../lib/stages';
import { readStoredState } from '../lib/state-storage';

const shortIds: Array<keyof FormativeAnswers> = ['q1', 'q2', 'q5', 'q8', 'q9'];
const fullIds: Array<keyof FormativeAnswers> = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q9'];
const summativeGroupSizes = [2, 1, 1] as const;
const stageNames: Record<Stage, string> = { 1: 'תכנון', 2: 'הערכה מעצבת', 3: 'הערכה מסכמת' };

type WorkItem = { elements: HTMLElement[] };

function currentStage(state: MatiState): Stage {
  return (state.manualStage ?? stageFromDate() ?? 1) as Stage;
}

function firstUsefulIndex(state: MatiState, stage: Stage, count: number) {
  if (stage === 1) {
    if (!state.plan.audience.trim() || !state.plan.smartGoal.trim()) return 0;
    if (!state.plan.metric1.trim() || !state.plan.metric2.trim()) return Math.min(1, count - 1);
    return Math.min(2, count - 1);
  }
  if (stage === 2) {
    const ids = state.formative.route === 'full' ? fullIds : shortIds;
    const missing = ids.findIndex((id) => !stage2SectionStarted(state.formative, id));
    return missing >= 0 ? Math.min(missing, count - 1) : Math.max(0, count - 1);
  }
  if (!state.summative.achievement.trim() || !state.summative.achievementMetric.trim()) return 0;
  if (!state.summative.turningPoint.trim()) return Math.min(1, count - 1);
  if (!state.summative.nextYearChange.trim()) return Math.min(2, count - 1);
  return Math.max(0, count - 1);
}

function singleItems(elements: HTMLElement[]): WorkItem[] {
  return elements.map((element) => ({ elements: [element] }));
}

function workItemsFor(stage: Stage): WorkItem[] {
  if (stage === 1) return singleItems(Array.from(document.querySelectorAll<HTMLElement>('.view-work .workExperience .formSection')));
  if (stage === 2) return singleItems(Array.from(document.querySelectorAll<HTMLElement>('.view-work .workExperience .assessmentSection')));

  const elements = Array.from(document.querySelectorAll<HTMLElement>('.view-work .workExperience .summativeStack > *'));
  const groups: WorkItem[] = [];
  let cursor = 0;
  for (const size of summativeGroupSizes) {
    const slice = elements.slice(cursor, cursor + size);
    if (slice.length) groups.push({ elements: slice });
    cursor += size;
  }
  while (cursor < elements.length) {
    groups.push({ elements: [elements[cursor]] });
    cursor += 1;
  }
  return groups;
}

function titleFor(item: WorkItem, fallback: string) {
  const heading = item.elements[0]?.querySelector('h3, h2, label > span, .field > span');
  return heading?.textContent?.trim() || fallback;
}

function savedStamp(state: MatiState, stage: Stage) {
  if (stage === 1) return state.plan.savedAt;
  if (stage === 2) return state.formative.savedAt;
  return state.summative.savedAt;
}

function openInsight() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.experienceNav button'));
  buttons.find((button) => button.textContent?.includes('מה למדנו'))?.click();
}

export default function WorkSessionLayer() {
  const [stage, setStage] = useState<Stage>(1);
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [title, setTitle] = useState('');
  const [initializedKey, setInitializedKey] = useState('');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const state = readStoredState();
        const nextStage = currentStage(state);
        const candidates = workItemsFor(nextStage);
        if (!candidates.length) return;
        const key = `${nextStage}:${candidates.length}:${state.formative.route}`;
        setStage(nextStage);
        setCount(candidates.length);
        setInitializedKey((previous) => {
          if (previous !== key) setIndex(firstUsefulIndex(state, nextStage, candidates.length));
          return key;
        });
      }, 40);
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { subtree: true, childList: true });
    window.addEventListener('input', sync, true);
    window.addEventListener('change', sync, true);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('input', sync, true);
      window.removeEventListener('change', sync, true);
      document.documentElement.removeAttribute('data-work-session');
      workItemsFor(stage).flatMap((item) => item.elements).forEach((element) => { element.hidden = false; });
    };
  }, [stage]);

  useEffect(() => {
    const candidates = workItemsFor(stage);
    if (!candidates.length) return;
    const safeIndex = Math.max(0, Math.min(index, candidates.length - 1));
    document.documentElement.setAttribute('data-work-session', 'on');
    candidates.forEach((item, candidateIndex) => {
      item.elements.forEach((element) => { element.hidden = candidateIndex !== safeIndex; });
    });
    setCount(candidates.length);
    setTitle(titleFor(candidates[safeIndex], `חלק ${safeIndex + 1}`));
    candidates[safeIndex].elements[0]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [stage, index, initializedKey]);

  const progress = useMemo(() => count ? Math.round(((index + 1) / count) * 100) : 0, [count, index]);

  const finish = () => {
    const before = savedStamp(readStoredState(), stage);
    const saveButton = document.querySelector<HTMLButtonElement>('.view-work .workExperience .actions .primary');
    if (!saveButton) { openInsight(); return; }
    saveButton.click();
    let attempts = 0;
    const check = window.setInterval(() => {
      attempts += 1;
      const after = savedStamp(readStoredState(), stage);
      if (after && after !== before) {
        clearInterval(check);
        openInsight();
      } else if (attempts >= 8) {
        clearInterval(check);
        document.querySelector<HTMLElement>('.view-work .notice')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }, 180);
  };

  if (count <= 1) return null;

  return (
    <section className="workSessionBar" aria-label="התקדמות בסשן העבודה">
      <div className="workSessionMeta">
        <span>{stageNames[stage]} · חלק {index + 1} מתוך {count}</span>
        <strong>{title}</strong>
      </div>
      <div className="workSessionProgress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
      <div className="workSessionActions">
        <button className="workSessionSecondary" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>הקודם</button>
        {index < count - 1 ? (
          <button className="workSessionPrimary" onClick={() => setIndex((value) => Math.min(count - 1, value + 1))}>הבא</button>
        ) : (
          <button className="workSessionPrimary" onClick={finish}>שמירה ומה למדנו</button>
        )}
      </div>
    </section>
  );
}
