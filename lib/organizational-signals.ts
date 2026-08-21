import type { MatiState, Stage } from './stages';
import { managerMeetingPercent, studentImprovementPercent } from './stages';

/**
 * Privacy floor for aggregation.
 *
 * Lowered from 5 to 3 by an explicit decision (2026-08-18), because the
 * מתי״א manager asked for sensitivity at "2–3 חזרות באותה מסגרת"
 * (docs/manager-decisions.md, Q12). With a cohort of 10–30 מדריכות spread
 * across many frameworks, a floor of 5 could plausibly surface nothing at
 * all for a whole year — a privacy guarantee that protects an organization
 * from ever learning anything is not a neutral default.
 *
 * The cost is real and is not hidden: at 3 contributors a manager who knows
 * the cohort may be able to infer who is behind an aggregate. Every decision
 * therefore carries `identifiabilityRisk`, and the console is expected to
 * show it rather than present a small aggregate as if it were anonymous.
 */
export const MIN_AGGREGATE_COHORT = 3;

/** Below this, an aggregate is small enough that a reader who knows the cohort may infer individuals. */
export const LOW_IDENTIFIABILITY_COHORT = 5;

export type OrganizationalSignalKey =
  | 'implementation_rate'
  | 'goal_attainment'
  | 'meeting_execution'
  | 'implementation_depth'
  | 'student_impact'
  | 'student_improvement_rate'
  | 'manager_meeting_rate'
  | 'manager_commitment'
  | 'resource_allocation'
  | 'resource_allocation_rate'
  | 'teacher_independence'
  | 'sustainability'
  | 'team_feedback_presence';

export type SignalValue = string | number | boolean;
export type SignalConfidence = 'high' | 'medium';
export type SignalProjection = 'aggregate_only' | 'private_only';

export interface OrganizationalSignal {
  key: OrganizationalSignalKey;
  stage: Stage;
  value: SignalValue;
  confidence: SignalConfidence;
  projection: SignalProjection;
  operationalImpact: 'low' | 'medium' | 'high';
}

export interface AggregatedSignalObservation {
  key: OrganizationalSignalKey;
  contributorId: string;
  contextId: string;
  periodId: string;
  adverse: boolean;
  operationalImpact: 'low' | 'medium' | 'high';
}

export type SystemicClassification =
  | 'insufficient_privacy_floor'
  | 'local_observation'
  | 'local_cluster'
  | 'cross_context_pattern'
  | 'persistent_pattern'
  | 'systemic_candidate';

export interface SystemicPatternDecision {
  classification: SystemicClassification;
  contributors: number;
  contexts: number;
  periods: number;
  adverseShare: number;
  maySurfaceToOrganization: boolean;
  mayAssertCausality: false;
  requiresHumanReview: boolean;
  /** 'elevated' once an aggregate is small enough that individuals may be inferable — surface it, never suppress it. */
  identifiabilityRisk: 'low' | 'elevated';
  reasons: string[];
}

function numericPercent(value: string): number | null {
  const cleaned = value.replace(/[^0-9.]/g, '');
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function pushSignal(target: OrganizationalSignal[], signal: Omit<OrganizationalSignal, 'projection'>) {
  target.push({ ...signal, projection: 'aggregate_only' });
}

export function extractOrganizationalSignals(state: MatiState): OrganizationalSignal[] {
  const signals: OrganizationalSignal[] = [];
  const a = state.formative.answers;

  const implementationRate = numericPercent(a.q1.implementationPercent);
  if (implementationRate !== null) pushSignal(signals, { key: 'implementation_rate', stage: 2, value: implementationRate, confidence: 'high', operationalImpact: 'high' });
  if (a.q1.goalAchievement) pushSignal(signals, { key: 'goal_attainment', stage: 2, value: a.q1.goalAchievement, confidence: 'high', operationalImpact: 'high' });
  if (a.q3.meetingRate) pushSignal(signals, { key: 'meeting_execution', stage: 2, value: a.q3.meetingRate, confidence: 'high', operationalImpact: 'medium' });
  if (a.q3.depth) pushSignal(signals, { key: 'implementation_depth', stage: 2, value: a.q3.depth, confidence: 'medium', operationalImpact: 'high' });
  if (a.q4.studentImpact) pushSignal(signals, { key: 'student_impact', stage: 2, value: a.q4.studentImpact, confidence: 'high', operationalImpact: 'high' });

  const studentRate = studentImprovementPercent(state);
  if (studentRate !== null) pushSignal(signals, { key: 'student_improvement_rate', stage: 2, value: studentRate, confidence: 'high', operationalImpact: 'high' });

  const managerRate = managerMeetingPercent(state);
  if (managerRate !== null) pushSignal(signals, { key: 'manager_meeting_rate', stage: 2, value: managerRate, confidence: 'high', operationalImpact: 'medium' });
  if (a.q6.managerCommitment) pushSignal(signals, { key: 'manager_commitment', stage: 2, value: a.q6.managerCommitment, confidence: 'medium', operationalImpact: 'high' });
  if (a.q6.resourcesAllocated) pushSignal(signals, { key: 'resource_allocation', stage: 2, value: a.q6.resourcesAllocated, confidence: 'high', operationalImpact: 'high' });

  const resourceRate = numericPercent(a.q6.resourcesPercent);
  if (resourceRate !== null) pushSignal(signals, { key: 'resource_allocation_rate', stage: 2, value: resourceRate, confidence: 'high', operationalImpact: 'high' });

  if (a.q7.independence) pushSignal(signals, { key: 'teacher_independence', stage: 2, value: a.q7.independence, confidence: 'medium', operationalImpact: 'high' });
  if (a.q7.continuesWithoutDependency) pushSignal(signals, { key: 'sustainability', stage: 2, value: a.q7.continuesWithoutDependency, confidence: 'medium', operationalImpact: 'high' });
  if (a.q6.teamFeedbackAsked) pushSignal(signals, { key: 'team_feedback_presence', stage: 2, value: a.q6.teamFeedbackAsked === 'yes', confidence: 'high', operationalImpact: 'medium' });

  return signals;
}

/**
 * Concern is only assigned where the approved instrument already contains a
 * categorical direction. Numeric percentages remain neutral here because MATI
 * has no approved professional cut-off for them.
 */
export function signalConcern(signal: OrganizationalSignal): boolean | null {
  const value = signal.value;
  switch (signal.key) {
    case 'goal_attainment': return value === 'none' || value === 'partial';
    case 'meeting_execution': return value === 'under70';
    case 'implementation_depth': return value === 'shallow' || value === 'partial';
    case 'student_impact': return value === 'none' || value === 'low';
    case 'manager_commitment': return value === 'low' || value === 'resistance';
    case 'resource_allocation': return value === 'no' || value === 'partial';
    case 'teacher_independence': return value === 'none' || value === 'partial';
    case 'sustainability': return value === 'no' || value === 'partial';
    case 'team_feedback_presence': return value === false;
    default: return null;
  }
}

export function canProjectSignal(signal: OrganizationalSignal, cohortSize: number) {
  return signal.projection === 'aggregate_only' && cohortSize >= MIN_AGGREGATE_COHORT;
}

export function classifySystemicPattern(observations: AggregatedSignalObservation[], minCohort = MIN_AGGREGATE_COHORT): SystemicPatternDecision {
  const contributors = new Set(observations.map((o) => o.contributorId)).size;
  const contexts = new Set(observations.map((o) => o.contextId)).size;
  const periods = new Set(observations.map((o) => o.periodId)).size;
  const adverseCount = observations.filter((o) => o.adverse).length;
  const adverseShare = observations.length ? adverseCount / observations.length : 0;
  const highImpact = observations.some((o) => o.operationalImpact === 'high');
  const reasons: string[] = [];

  const identifiabilityRisk: 'low' | 'elevated' = contributors < LOW_IDENTIFIABILITY_COHORT ? 'elevated' : 'low';

  if (contributors < minCohort) {
    reasons.push(`privacy_floor:${contributors}/${minCohort}`);
    return { classification: 'insufficient_privacy_floor', contributors, contexts, periods, adverseShare, maySurfaceToOrganization: false, mayAssertCausality: false, requiresHumanReview: false, identifiabilityRisk, reasons };
  }

  if (contributors >= 2) reasons.push('recurrence');
  if (contexts >= 2) reasons.push('cross_context_spread');
  if (periods >= 2) reasons.push('persistence');
  if (highImpact) reasons.push('operational_impact');
  if (adverseShare >= 0.5) reasons.push('majority_adverse');

  let classification: SystemicClassification = 'local_observation';
  if (contributors >= 2) classification = 'local_cluster';
  if (contributors >= minCohort && contexts >= 2) classification = 'cross_context_pattern';
  if (contributors >= minCohort && contexts >= 2 && periods >= 2) classification = 'persistent_pattern';
  if (contributors >= minCohort && contexts >= 3 && periods >= 2 && adverseShare >= 0.5 && highImpact) classification = 'systemic_candidate';

  // Q12 asks for sensitivity at 2-3 repetitions inside a single framework, so a
  // local cluster is no longer silently withheld. Q11 is equally explicit that
  // recurrence alone is not systemic — it has to bear on implementation — so a
  // cluster surfaces only when it carries operational impact, and it surfaces as
  // something to ask about, never as a systemic claim.
  const maySurfaceToOrganization = classification === 'local_cluster'
    ? highImpact
    : classification !== 'local_observation';
  return { classification, contributors, contexts, periods, adverseShare, maySurfaceToOrganization, mayAssertCausality: false, requiresHumanReview: maySurfaceToOrganization, identifiabilityRisk, reasons };
}

export type OrganizationalAuthority = 'detect' | 'surface' | 'suggest_inquiry' | 'diagnose_cause' | 'set_policy' | 'act';

export function organizationalAuthority(action: OrganizationalAuthority): 'automatic' | 'human_required' | 'forbidden' {
  if (action === 'detect' || action === 'surface' || action === 'suggest_inquiry') return 'automatic';
  if (action === 'diagnose_cause' || action === 'set_policy' || action === 'act') return 'human_required';
  return 'forbidden';
}
