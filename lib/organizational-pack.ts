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

export function createOrganizationalPack(args: {
  contributorId: string;
  contextId: string;
  periodId: string;
  signals: OrganizationalSignal[];
}): OrganizationalPack {
  return {
    schema: ORGANIZATIONAL_PACK_SCHEMA,
    exportedAt: new Date().toISOString(),
    contributorId: args.contributorId.trim(),
    contextId: args.contextId.trim(),
    periodId: args.periodId.trim(),
    signals: args.signals.map((signal) => ({ ...signal })),
  };
}

export function validateOrganizationalPack(input: unknown): input is OrganizationalPack {
  if (!input || typeof input !== 'object') return false;
  const pack = input as Partial<OrganizationalPack>;
  if (pack.schema !== ORGANIZATIONAL_PACK_SCHEMA) return false;
  if (!pack.contributorId || !pack.contextId || !pack.periodId || !Array.isArray(pack.signals)) return false;
  return pack.signals.every((signal) => {
    if (!signal || typeof signal !== 'object') return false;
    const s = signal as Partial<OrganizationalSignal>;
    return typeof s.key === 'string' &&
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
    const rows = packs.flatMap((pack) => pack.signals
      .filter((signal) => signal.key === key)
      .map((signal) => ({ pack, signal, concern: signalConcern(signal) })));

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
