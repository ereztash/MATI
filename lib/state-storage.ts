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

export type WriteResult = 'ok' | 'blocked' | 'unreadable';

/**
 * The write half of this module, which until now did not exist — every surface
 * hand-rolled its own `try { localStorage.setItem(...) } catch`, and they
 * diverged: one reported failure, one swallowed it, and one was left unguarded
 * entirely. A write that can fail should say so in its return type rather than
 * leave each caller to remember.
 *
 * `blocked` is a full or unavailable store (Safari private browsing enforces a
 * zero quota, so even a first write throws; a locked-down profile throws on
 * property access, which is why the whole body is inside the try).
 */
export function writeStoredState(state: MatiState): WriteResult {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return 'ok';
  } catch {
    return 'blocked';
  }
}

/**
 * Read → patch → write, refusing to write over a save it could not read.
 *
 * That refusal is the point: `readStoredState()` collapses unreadable JSON to
 * `emptyState`, so patching through it and writing back replaces a damaged save
 * with a blank one — verified in a browser, where one click on the calendar-gap
 * picker made a truncated record parse cleanly again and took its recoverable
 * text with it, while `loadStoredState().corrupted` flipped to false so nothing
 * could ever report the loss. Callers are told instead.
 */
export function patchStoredState(patch: Partial<MatiState>): WriteResult {
  const loaded = loadStoredState();
  if (loaded.corrupted) return 'unreadable';
  return writeStoredState({ ...loaded.state, ...patch });
}

/**
 * Fields that record where she is rather than what she wrote. Listed once so
 * adding another cannot be half-applied: `gapStage` was added as a navigation
 * field and not added here, which made the app's own gap-answer write trip the
 * cross-tab data-loss alarm that this list exists to prevent.
 */
const NAVIGATION_FIELDS = ['manualStage', 'gapStage'] as const;

/** Key-sorted serialization, so two payloads written by different code paths compare equal. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(',')}}`;
}

/**
 * True when two stored payloads differ only in fields navigation owns rather
 * than the instructor.
 *
 * `manualStage` is the only one, and app/session-stage-reset.tsx rewrites the
 * key to strip it on every page load — so without this, opening a second tab
 * is indistinguishable at the StorageEvent level from editing the plan there,
 * and the first tab warns that work is about to be overwritten when nothing of
 * hers changed. A warning that fires on a non-event is one she learns to
 * dismiss, which costs the case it exists for.
 */
export function sameExceptNavigation(before: string, after: string): boolean {
  try {
    const strip = (raw: string) => {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const field of NAVIGATION_FIELDS) delete parsed[field];
      return canonical(parsed);
    };
    return strip(before) === strip(after);
  } catch {
    return false;
  }
}

/**
 * True when a payload another tab just created holds nothing an instructor
 * wrote — which is what a freshly-mounted page autosaving its empty state
 * looks like, and what happens in the surviving tab right after a delete.
 * Without this the receiving tab is warned that a plan is about to be
 * overwritten moments after she deliberately deleted it.
 */
export function isEmptyPayload(raw: string): boolean {
  return sameExceptNavigation(JSON.stringify(emptyState), raw);
}

/** Removes both keys. Guarded for the same reason writes are. */
export function clearStoredState(): WriteResult {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_KEY);
    return 'ok';
  } catch {
    return 'blocked';
  }
}
