import { emptyState, FormativeAnswers, MatiState } from './stages';

export const STORAGE_KEY = 'mati-v2';
export const LEGACY_KEY = 'mati-v1';

/**
 * Spreadable view of an untrusted value. Guards the merges below against
 * stored sections that are strings, arrays or null rather than plain objects.
 */
function objectOr(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/**
 * Normalises anything read out of storage into a complete MatiState.
 *
 * Every answer section is merged field by field against the empty state, so a
 * section written by an older build still comes back with all of its current
 * sub-fields present. The v1 layout, where each section was a single free-text
 * string, is mapped onto the field that replaced it.
 *
 * This is the only place that knows the stored shape. Every surface reads
 * through it so they cannot disagree about what a partial state means.
 */
export function migrateState(raw: unknown): MatiState {
  const source = objectOr(raw);
  const formative = objectOr(source.formative);
  const storedAnswers = objectOr(formative.answers);
  const isLegacy = typeof storedAnswers.q1 === 'string' || typeof storedAnswers.q2 === 'string';

  const answers = isLegacy ? {
    ...emptyState.formative.answers,
    q1: { ...emptyState.formative.answers.q1, evidence: storedAnswers.q1 ?? '' },
    q2: { ...emptyState.formative.answers.q2, evidence: storedAnswers.q2 ?? '' },
    q3: { ...emptyState.formative.answers.q3, notes: storedAnswers.q3 ?? '' },
    q4: { ...emptyState.formative.answers.q4, evidence: storedAnswers.q4 ?? '' },
    q5: { ...emptyState.formative.answers.q5, reflection: storedAnswers.q5 ?? '' },
    q6: { ...emptyState.formative.answers.q6, culturePositiveSign: storedAnswers.q6 ?? '' },
    q7: { ...emptyState.formative.answers.q7, evidence: storedAnswers.q7 ?? '' },
    q8: { ...emptyState.formative.answers.q8, didNotWork: storedAnswers.q8 ?? '' },
    q9: { ...emptyState.formative.answers.q9 },
  } as FormativeAnswers : Object.fromEntries(
    Object.entries(emptyState.formative.answers).map(([section, defaults]) => [
      section,
      { ...(defaults as Record<string, unknown>), ...objectOr(storedAnswers[section]) },
    ]),
  ) as FormativeAnswers;

  return {
    ...emptyState,
    ...source,
    plan: { ...emptyState.plan, ...objectOr(source.plan) },
    formative: {
      ...emptyState.formative,
      ...formative,
      context: { ...emptyState.formative.context, ...objectOr(formative.context) },
      answers,
      post: { ...emptyState.formative.post, ...objectOr(formative.post) },
    },
    summative: { ...emptyState.summative, ...objectOr(source.summative) },
    history: Array.isArray(source.history) ? source.history : [],
    // Same guard as history: `...source` above spreads unvalidated stored data,
    // so a corrupted value here would otherwise reach diffPlans as garbage.
    planRevisions: Array.isArray(source.planRevisions) ? source.planRevisions : [],
    // Only a real object can serve as a diff baseline; merging onto emptyState.plan
    // guarantees every tracked field exists even in a save that predates one.
    lastSavedPlan: source.lastSavedPlan ? { ...emptyState.plan, ...objectOr(source.lastSavedPlan) } : undefined,
  };
}

export type StoredStateLoad = { state: MatiState; corrupted: boolean };

/**
 * Reads the saved state, falling back to the v1 key. `corrupted` is true only
 * when something was stored but could not be read, so a caller can tell an
 * unreadable save apart from a first visit.
 */
export function loadStoredState(): StoredStateLoad {
  if (typeof window === 'undefined') return { state: emptyState, corrupted: false };
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return { state: emptyState, corrupted: false };
    return { state: migrateState(JSON.parse(raw)), corrupted: false };
  } catch {
    return { state: emptyState, corrupted: raw !== null };
  }
}

/** Convenience wrapper for the read-only surfaces that only need the state. */
export function readStoredState(): MatiState {
  return loadStoredState().state;
}
