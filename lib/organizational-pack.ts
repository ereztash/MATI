import type { OrganizationalSignal, OrganizationalSignalKey } from './organizational-signals';
import { classifySystemicPattern, signalConcern } from './organizational-signals';

export const ORGANIZATIONAL_PACK_SCHEMA = 'mati-organizational-pack-v1' as const;

export interface OrganizationalPack {
  schema: typeof ORGANIZATIONAL_PACK_SCHEMA;
  exportedAt: string;
  contributorId: string;
  contextId: string;
  periodId: string;
  signals: OrganizationalSignal[];
}

export interface OrganizationalPatternSummary {
  key: OrganizationalSignalKey;
  observations: number;
  contributors: number;
  contexts: number;
  periods: number;
  concerns: number;
  neutral: number;
  classification: ReturnType<typeof classifySystemicPattern>;
}

const TOP_LEVEL_KEYS = ['schema', 'exportedAt', 'contributorId', 'contextId', 'periodId', 'signals'].sort();
const SIGNAL_KEYS = ['key', 'stage', 'value', 'confidence', 'projection', 'operationalImpact'].sort();
const SIGNAL_KEY_SET = new Set<OrganizationalSignalKey>([
  'implementation_rate', 'goal_attainment', 'meeting_execution', 'implementation_depth', 'student_impact',
  'student_improvement_rate', 'manager_meeting_rate', 'manager_commitment', 'resource_allocation',
  'resource_allocation_rate', 'teacher_independence', 'sustainability', 'team_feedback_presence',
]);

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function createOrganizationalPack(args: { contributorId: string; contextId: string; periodId: string; signals: OrganizationalSignal[] }): OrganizationalPack {
  return {
    schema: ORGANIZATIONAL_PACK_SCHEMA,
    exportedAt: new Date().toISOString(),
    contributorId: args.contributorId.trim(),
    contextId: args.contextId.trim(),
    periodId: args.periodId.trim(),
    signals: args.signals.map((signal) => ({
      key: signal.key,
      stage: signal.stage,
      value: signal.value,
      confidence: signal.confidence,
      projection: 'aggregate_only',
      operationalImpact: signal.operationalImpact,
    })),
  };
}

export function validateOrganizationalPack(input: unknown): input is OrganizationalPack {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const raw = input as Record<string, unknown>;
  if (!exactKeys(raw, TOP_LEVEL_KEYS)) return false;
  if (raw.schema !== ORGANIZATIONAL_PACK_SCHEMA) return false;
  if (typeof raw.exportedAt !== 'string' || !Number.isFinite(Date.parse(raw.exportedAt))) return false;
  if (typeof raw.contributorId !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(raw.contributorId)) return false;
  if (typeof raw.contextId !== 'string' || !/^[A-Za-z0-9_-]{3,24}$/.test(raw.contextId)) return false;
  if (typeof raw.periodId !== 'string' || !/^\d{4}-\d{2}$/.test(raw.periodId)) return false;
  if (!Array.isArray(raw.signals) || raw.signals.length > 30) return false;

  return raw.signals.every((signal) => {
    if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return false;
    const s = signal as Record<string, unknown>;
    if (!exactKeys(s, SIGNAL_KEYS)) return false;
    return typeof s.key === 'string' && SIGNAL_KEY_SET.has(s.key as OrganizationalSignalKey) &&
      (s.stage === 1 || s.stage === 2 || s.stage === 3) &&
      (typeof s.value === 'string' || typeof s.value === 'number' || typeof s.value === 'boolean') &&
      (s.confidence === 'high' || s.confidence === 'medium') &&
      s.projection === 'aggregate_only' &&
      (s.operationalImpact === 'low' || s.operationalImpact === 'medium' || s.operationalImpact === 'high');
  });
}

export function summarizeOrganizationalPacks(packs: OrganizationalPack[]): OrganizationalPatternSummary[] {
  const keys = [...new Set(packs.flatMap((pack) => pack.signals.map((signal) => signal.key)))];

  return keys.map((key) => {
    const rows = packs.flatMap((pack) => pack.signals.filter((signal) => signal.key === key).map((signal) => ({ pack, signal, concern: signalConcern(signal) })));
    const classifiable = rows.filter((row) => row.concern !== null);
    const observations = classifiable.map(({ pack, signal, concern }) => ({
      key,
      contributorId: pack.contributorId,
      contextId: pack.contextId,
      periodId: pack.periodId,
      adverse: concern === true,
      operationalImpact: signal.operationalImpact,
    }));

    return {
      key,
      observations: rows.length,
      contributors: new Set(rows.map((row) => row.pack.contributorId)).size,
      contexts: new Set(rows.map((row) => row.pack.contextId)).size,
      periods: new Set(rows.map((row) => row.pack.periodId)).size,
      concerns: classifiable.filter((row) => row.concern === true).length,
      neutral: rows.length - classifiable.length,
      classification: classifySystemicPattern(observations),
    };
  });
}
