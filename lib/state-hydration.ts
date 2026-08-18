import { emptyState, FormativeAnswers, MatiState } from './stages';

export const MATI_STATE_KEY = 'mati-v2';
export const MATI_LEGACY_KEY = 'mati-v1';

/**
 * Canonical interpreter for persisted MATI state.
 *
 * Every support layer must interpret the same local snapshot identically. This
 * function also preserves the legacy v1 formative-answer migration used by the
 * professional page, so a shell, context sensor or signal projector cannot see
 * a different state shape from the main workflow.
 */
export function mergeMatiState(raw: unknown): MatiState {
  if (!raw || typeof raw !== 'object') return emptyState;
  const source = raw as Record<string, any>;
  const legacyAnswers = source.formative?.answers ?? {};
  const isLegacy = typeof legacyAnswers.q1 === 'string' || typeof legacyAnswers.q2 === 'string';

  const migratedAnswers = isLegacy ? {
    ...emptyState.formative.answers,
    q1: { ...emptyState.formative.answers.q1, evidence: legacyAnswers.q1 ?? '' },
    q2: { ...emptyState.formative.answers.q2, evidence: legacyAnswers.q2 ?? '' },
    q3: { ...emptyState.formative.answers.q3, notes: legacyAnswers.q3 ?? '' },
    q4: { ...emptyState.formative.answers.q4, evidence: legacyAnswers.q4 ?? '' },
    q5: { ...emptyState.formative.answers.q5, reflection: legacyAnswers.q5 ?? '' },
    q6: { ...emptyState.formative.answers.q6, culturePositiveSign: legacyAnswers.q6 ?? '' },
    q7: { ...emptyState.formative.answers.q7, evidence: legacyAnswers.q7 ?? '' },
    q8: { ...emptyState.formative.answers.q8, didNotWork: legacyAnswers.q8 ?? '' },
    q9: { ...emptyState.formative.answers.q9 },
  } : Object.fromEntries(
    Object.entries(emptyState.formative.answers).map(([key, value]) => [
      key,
      { ...(value as Record<string, unknown>), ...(legacyAnswers[key] ?? {}) },
    ]),
  ) as FormativeAnswers;

  return {
    ...emptyState,
    ...source,
    plan: { ...emptyState.plan, ...(source.plan ?? {}) },
    formative: {
      ...emptyState.formative,
      ...(source.formative ?? {}),
      context: { ...emptyState.formative.context, ...(source.formative?.context ?? {}) },
      answers: migratedAnswers,
      post: { ...emptyState.formative.post, ...(source.formative?.post ?? {}) },
    },
    summative: { ...emptyState.summative, ...(source.summative ?? {}) },
    history: Array.isArray(source.history) ? source.history : [],
  };
}

export function parseMatiState(raw: string | null): MatiState {
  if (!raw) return emptyState;
  try {
    return mergeMatiState(JSON.parse(raw));
  } catch {
    return emptyState;
  }
}

export function readStoredMatiState(): MatiState {
  if (typeof window === 'undefined') return emptyState;
  try {
    return parseMatiState(localStorage.getItem(MATI_STATE_KEY) ?? localStorage.getItem(MATI_LEGACY_KEY));
  } catch {
    return emptyState;
  }
}
