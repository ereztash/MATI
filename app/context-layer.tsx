'use client';

import { useEffect, useMemo, useState } from 'react';
import { analyzeInteraction, emptyState, MatiState, stageFromDate } from '../lib/stages';
import {
  buildContextSnapshot,
  deriveCoachStrategy,
  DeviceClass,
  greetingForDaypart,
  UsageContext,
} from '../lib/context-engine';

const STATE_KEY = 'mati-v2';
const USAGE_KEY = 'mati-usage-v1';

function hydrateState(raw: string | null): MatiState {
  if (!raw) return emptyState;
  try {
    const source = JSON.parse(raw) as Partial<MatiState>;
    return {
      ...emptyState,
      ...source,
      plan: { ...emptyState.plan, ...(source.plan ?? {}) },
      formative: {
        ...emptyState.formative,
        ...(source.formative ?? {}),
        context: { ...emptyState.formative.context, ...(source.formative?.context ?? {}) },
        answers: {
          ...emptyState.formative.answers,
          ...(source.formative?.answers ?? {}),
        },
        post: { ...emptyState.formative.post, ...(source.formative?.post ?? {}) },
      },
      summative: { ...emptyState.summative, ...(source.summative ?? {}) },
      history: Array.isArray(source.history) ? source.history : [],
    };
  } catch {
    return emptyState;
  }
}

function deviceFromWidth(width: number): DeviceClass {
  if (width < 720) return 'mobile';
  if (width < 1050) return 'tablet';
  return 'desktop';
}

function readUsage(now = new Date()): UsageContext {
  const width = typeof window === 'undefined' ? undefined : window.innerWidth;
  const device = width ? deviceFromWidth(width) : 'unknown';
  let previous: Partial<UsageContext> = {};
  try { previous = JSON.parse(localStorage.getItem(USAGE_KEY) ?? '{}'); } catch { previous = {}; }
  return {
    sessionStartedAt: now.toISOString(),
    lastVisitAt: previous.lastVisitAt,
    device,
  };
}

function persistUsage() {
  localStorage.setItem(USAGE_KEY, JSON.stringify({ lastVisitAt: new Date().toISOString() }));
}

export default function ContextLayer() {
  const [state, setState] = useState<MatiState>(emptyState);
  const [usage, setUsage] = useState<UsageContext | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const now = new Date();
    const initialUsage = readUsage(now);
    setUsage(initialUsage);
    setState(hydrateState(localStorage.getItem(STATE_KEY)));
    persistUsage();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setState(hydrateState(localStorage.getItem(STATE_KEY)));
        setTick((v) => v + 1);
      }, 180);
    };
    const onResize = () => setUsage((current) => current ? { ...current, device: deviceFromWidth(window.innerWidth) } : current);
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') persistUsage();
    };
    window.addEventListener('input', refresh, true);
    window.addEventListener('change', refresh, true);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    const minuteTicker = window.setInterval(() => setTick((v) => v + 1), 60_000);
    return () => {
      clearTimeout(timer);
      clearInterval(minuteTicker);
      window.removeEventListener('input', refresh, true);
      window.removeEventListener('change', refresh, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      persistUsage();
    };
  }, []);

  const model = useMemo(() => {
    if (!usage) return null;
    const automaticStage = stageFromDate();
    const activeStage = state.manualStage ?? automaticStage;
    if (!activeStage) return null;
    const profile = analyzeInteraction(state);
    const snapshot = buildContextSnapshot({ state, activeStage, automaticStage, profile, usage });
    const strategy = deriveCoachStrategy(snapshot);
    return { snapshot, strategy };
  }, [state, usage, tick]);

  useEffect(() => {
    if (!model) return;
    const root = document.documentElement;
    root.dataset.matiDensity = model.strategy.density;
    root.dataset.matiInput = model.strategy.preferredInput;
    root.dataset.matiSupport = model.strategy.intensity;
    return () => {
      delete root.dataset.matiDensity;
      delete root.dataset.matiInput;
      delete root.dataset.matiSupport;
    };
  }, [model]);

  if (!model || !usage) return null;
  const { snapshot, strategy } = model;
  const greeting = greetingForDaypart(snapshot.calendar.daypart);
  const strongReason = snapshot.signals.find((s) => s.strength === 'strong');
  const shouldShow = Boolean(strategy.headline || strongReason || snapshot.calendar.stagePosition === 'closing');
  if (!shouldShow) return null;

  return (
    <aside className={`contextRibbon ${strategy.intensity}`} aria-label="התאמת סביבת העבודה">
      <div className="contextRibbonMain">
        <span className="contextEyebrow">{greeting} · התאמה לפי ההקשר הנוכחי</span>
        <strong>{strategy.headline ?? strongReason?.implication ?? 'אני מתאים את עומק העבודה למה שכבר ידוע כרגע.'}</strong>
        {strategy.nextPrompt && <p>{strategy.nextPrompt}</p>}
      </div>
      <details className="contextWhy">
        <summary>למה?</summary>
        <ul>{strategy.explanation.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
        <small>זמן, מכשיר ומשך הסשן משפיעים רק בעדינות. הם אינם משמשים כאבחון או כציון מקצועי.</small>
      </details>
    </aside>
  );
}
