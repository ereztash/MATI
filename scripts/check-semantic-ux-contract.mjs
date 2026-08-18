import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = path.join(root, 'lib', 'ux-structural-contract.json');
const stagesPath = path.join(root, 'lib', 'stages.ts');
const pagePath = path.join(root, 'app', 'page.tsx');

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const stagesSource = fs.readFileSync(stagesPath, 'utf8');
const pageSource = fs.readFileSync(pagePath, 'utf8');

function providedFacts(field) {
  return new Map((field.provides ?? []).map(({ fact, count = 1 }) => [fact, count]));
}

export function auditFlow(flow) {
  const issues = [];
  const requiredFields = (flow.fields ?? []).filter((field) => field.required);
  const gateRequirements = new Map((flow.gate?.requires ?? []).map(({ fact, count = 1 }) => [fact, count]));

  for (const field of flow.fields ?? []) {
    const ownFacts = providedFacts(field);
    for (const fact of field.validatorRequires ?? []) {
      if (ownFacts.has(fact)) continue;
      const siblingProviders = requiredFields
        .filter((candidate) => candidate.id !== field.id && providedFacts(candidate).has(fact))
        .map((candidate) => candidate.id);
      issues.push({
        code: siblingProviders.length ? 'CROSS_FIELD_VALIDATOR_DUPLICATION' : 'HIDDEN_VALIDATOR_REQUIREMENT',
        flow: flow.id,
        field: field.id,
        fact,
        siblingProviders,
        message: siblingProviders.length
          ? `${field.id} validates ${fact}, but that fact is already collected by ${siblingProviders.join(', ')}`
          : `${field.id} validates ${fact}, but no field declares that it collects this fact`,
      });
    }
  }

  for (const [fact, requiredCount] of gateRequirements) {
    const availableCount = requiredFields.reduce((sum, field) => sum + (providedFacts(field).get(fact) ?? 0), 0);
    if (availableCount < requiredCount) {
      issues.push({
        code: 'UNSATISFIABLE_GATE',
        flow: flow.id,
        fact,
        requiredCount,
        availableCount,
        message: `${flow.gate.id} requires ${requiredCount} × ${fact}, but required fields provide only ${availableCount}`,
      });
    }
    if (availableCount > requiredCount) {
      issues.push({
        code: 'OVER_COLLECTION',
        flow: flow.id,
        fact,
        requiredCount,
        availableCount,
        message: `Required fields collect ${availableCount} × ${fact}, while ${flow.gate.id} needs only ${requiredCount}`,
      });
    }
  }

  for (const field of requiredFields) {
    const contributesToGate = [...providedFacts(field).keys()].some((fact) => gateRequirements.has(fact));
    if (!contributesToGate) {
      issues.push({
        code: 'REQUIRED_FIELD_WITHOUT_GATE_PURPOSE',
        flow: flow.id,
        field: field.id,
        message: `${field.id} is required but does not provide any fact required by ${flow.gate.id}`,
      });
    }
  }

  return issues;
}

function auditSourceAlignment() {
  const issues = [];
  const smartGoalBody = stagesSource.match(/export function smartGoalLooksValid\(goal: string\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  if (!smartGoalBody) {
    issues.push({ code: 'SOURCE_DRIFT', message: 'smartGoalLooksValid is missing from lib/stages.ts' });
  } else if (/hasTime|hasMeasure|ינואר|אחוז|%/.test(smartGoalBody)) {
    issues.push({
      code: 'SOURCE_DRIFT',
      message: 'smartGoalLooksValid still validates timeframe/measurement inside the goal field; those facts belong to sibling fields.',
    });
  }

  const planReadyBody = stagesSource.match(/export function planReady\(plan: Plan\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  for (const field of ['audience', 'smartGoal', 'metric1', 'metric2', 'timeframe']) {
    if (!planReadyBody.includes(`plan.${field}`)) {
      issues.push({ code: 'SOURCE_DRIFT', message: `planReady no longer references required field ${field}` });
    }
  }

  if (pageSource.includes('כדאי להוסיף גם מידה/כמות וגם נקודת זמן.')) {
    issues.push({
      code: 'UX_COPY_DRIFT',
      message: 'Stage 1 still instructs the user to duplicate measurement/timeframe inside the goal field.',
    });
  }

  return issues;
}

function assertAuditorCatchesKnownRegression() {
  const current = contract.flows.find((flow) => flow.id === 'stage1-plan');
  if (!current) throw new Error('Missing stage1-plan contract fixture');
  const legacy = structuredClone(current);
  const goal = legacy.fields.find((field) => field.id === 'smartGoal');
  goal.validatorRequires = ['desired_change', 'success_measure', 'timeframe'];
  const caught = auditFlow(legacy).filter((issue) => issue.code === 'CROSS_FIELD_VALIDATOR_DUPLICATION');
  const facts = new Set(caught.map((issue) => issue.fact));
  if (!facts.has('success_measure') || !facts.has('timeframe')) {
    throw new Error('Auditor regression: the original SMART duplication bug is no longer detected');
  }
}

assertAuditorCatchesKnownRegression();

const contractIssues = contract.flows.flatMap(auditFlow);
const sourceIssues = auditSourceAlignment();
const issues = [...contractIssues, ...sourceIssues];

if (issues.length) {
  console.error('Structural UX semantic audit failed:\n');
  for (const issue of issues) console.error(`- [${issue.code}] ${issue.message}`);
  process.exit(1);
}

console.log(`Structural UX semantic audit passed (${contract.flows.length} flow${contract.flows.length === 1 ? '' : 's'}).`);
console.log('Known regression fixture: SMART field duplication is detected before production.');
