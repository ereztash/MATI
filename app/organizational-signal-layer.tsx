'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { emptyState, MatiState } from '../lib/stages';
import { extractOrganizationalSignals, OrganizationalSignal } from '../lib/organizational-signals';
import OrganizationalSignalPreview from './organizational-signal-preview';

const STATE_KEY = 'mati-v2';
const SIGNAL_SNAPSHOT_KEY = 'mati-organizational-signal-v0';

function hydrateState(): MatiState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return emptyState;
    const source = JSON.parse(raw) as Partial<MatiState>;
    return {
      ...emptyState,
      ...source,
      plan: { ...emptyState.plan, ...(source.plan ?? {}) },
      formative: {
        ...emptyState.formative,
        ...(source.formative ?? {}),
        context: { ...emptyState.formative.context, ...(source.formative?.context ?? {}) },
        answers: { ...emptyState.formative.answers, ...(source.formative?.answers ?? {}) },
        post: { ...emptyState.formative.post, ...(source.formative?.post ?? {}) },
      },
      summative: { ...emptyState.summative, ...(source.summative ?? {}) },
      history: Array.isArray(source.history) ? source.history : [],
    };
  } catch {
    return emptyState;
  }
}

export default function OrganizationalSignalLayer() {
  const [state, setState] = useState<MatiState>(emptyState);
  const [target, setTarget] = useState<Element | null>(null);

  const signals = useMemo<OrganizationalSignal[]>(() => extractOrganizationalSignals(state), [state]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      setState(hydrateState());
      setTarget(document.querySelector('.view-insight .insightExperience'));
    };

    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(sync, 100);
    };

    sync();
    window.addEventListener('input', schedule, true);
    window.addEventListener('change', schedule, true);
    window.addEventListener('click', schedule, true);
    window.addEventListener('mati-state-changed', schedule as EventListener);

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

    return () => {
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('input', schedule, true);
      window.removeEventListener('change', schedule, true);
      window.removeEventListener('click', schedule, true);
      window.removeEventListener('mati-state-changed', schedule as EventListener);
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIGNAL_SNAPSHOT_KEY, JSON.stringify({
        schema: 'mati-organizational-signal-v0',
        generatedAt: new Date().toISOString(),
        localOnly: true,
        signals,
      }));
    } catch {
      // The signal snapshot is optional. Failure must never block the instructor workflow.
    }
  }, [signals]);

  if (!target) return null;
  return createPortal(<OrganizationalSignalPreview signals={signals} />, target);
}
