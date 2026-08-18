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

const CATEGORICAL_VALUES: Partial<Record<OrganizationalSignalKey, readonly unknown[]>> = {
  goal_attainment: ['none', 'partial', 'mostly', 'full'],
  meeting_execution: ['under70', '70-90', '90-100'],
  implementation_depth: ['consistent', 'shallow', 'partial'],
  student_impact: ['none', 'low', 'medium', 'high'],
  manager_commitment: ['high', 'medium', 'low', 'resistance'],
  resource_allocation: ['yes', 'partial', 'no'],
  teacher_independence: ['none', 'partial', 'most', 'all'],
  sustainability: ['yes', 'partial', 'no'],
  team_feedback_presence: [true, false],
};
const PERCENT_KEYS = new Set<OrganizationalSignalKey>([
  'implementation_rate', 'student_improvement_rate', 'manager_meeting_rate', 'resource_allocation_rate',
]);

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function validSignalValue(key: OrganizationalSignalKey, value: unknown) {
  if (PERCENT_KEYS.has(key)) return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  const allowed = CATEGORICAL_VALUES[key];
  return Boolean(allowed?.includes(value));
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
  if (typeof raw.periodId !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(raw.periodId)) return false;
  if (!Array.isArray(raw.signals) || raw.signals.length > 30) return false;

  const seen = new Set<string>();
  return raw.signals.every((signal) => {
    if (!signal || typeof signal !== 'object' || Array.isArray(signal)) return false;
    const s = signal as Record<string, unknown>;
    if (!exactKeys(s, SIGNAL_KEYS) || typeof s.key !== 'string' || !SIGNAL_KEY_SET.has(s.key as OrganizationalSignalKey)) return false;
    if (seen.has(s.key)) return false;
    seen.add(s.key);
    const key = s.key as OrganizationalSignalKey;
    return s.stage === 2 &&
      validSignalValue(key, s.value) &&
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
