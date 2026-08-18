import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = path.join(root, 'lib', 'ux-structural-contract.json');
const stagesPath = path.join(root, 'lib', 'stages.ts');
const pagePath = path.join(root, 'app', 'page.tsx');
const workSessionPath = path.join(root, 'app', 'work-session-layer.tsx');

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
const stagesSource = fs.readFileSync(stagesPath, 'utf8');
const pageSource = fs.readFileSync(pagePath, 'utf8');
const workSessionSource = fs.readFileSync(workSessionPath, 'utf8');

function providedFacts(field) {
  return new Map((field.provides ?? []).map(({ fact, count = 1 }) => [fact, count]));
}

function sameMembers(actual, expected) {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function parseQuestionIds(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/['"](q\d+)['"]/g)].map((item) => item[1]);
}

function parseNumberArray(source, name) {
  const match = source.match(new RegExp(`const\\s+${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return [];
  return [...match[1].matchAll(/\d+/g)].map((item) => Number(item[0]));
}

export function auditFlow(flow) {
  const issues = [];
  const fields = flow.fields ?? [];
  const requiredFields = fields.filter((field) => field.required);
  const gateMode = flow.gate?.mode ?? 'all';
  const gateRequirements = new Map((flow.gate?.requires ?? []).map(({ fact, count = 1 }) => [fact, count]));

  for (const field of fields) {
    const ownFacts = providedFacts(field);
    for (const fact of field.validatorRequires ?? []) {
      if (ownFacts.has(fact)) continue;
      const siblingProviders = fields
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

  const gateProviders = gateMode === 'any' ? fields : requiredFields;
  for (const [fact, requiredCount] of gateRequirements) {
    const availableCount = gateProviders.reduce((sum, field) => sum + (providedFacts(field).get(fact) ?? 0), 0);
    if (availableCount < requiredCount) {
      issues.push({
        code: 'UNSATISFIABLE_GATE',
        flow: flow.id,
        fact,
        requiredCount,
        availableCount,
        message: `${flow.gate.id} requires ${requiredCount} × ${fact}, but eligible fields provide only ${availableCount}`,
      });
    }
    if (gateMode === 'all' && availableCount > requiredCount) {
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

  if (gateMode === 'all') {
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
  }

  const fieldIds = new Set(fields.map((field) => field.id));
  for (const route of flow.routes ?? []) {
    const seen = new Set();
    for (const fieldId of route.fields ?? []) {
      if (!fieldIds.has(fieldId)) {
        issues.push({ code: 'UNKNOWN_ROUTE_FIELD', flow: flow.id, route: route.id, field: fieldId, message: `${route.id} references unknown field ${fieldId}` });
      }
      if (seen.has(fieldId)) {
        issues.push({ code: 'DUPLICATE_ROUTE_FIELD', flow: flow.id, route: route.id, field: fieldId, message: `${route.id} includes ${fieldId} more than once` });
      }
      seen.add(fieldId);
    }
    if (route.complete) {
      const missing = [...fieldIds].filter((fieldId) => !seen.has(fieldId));
      if (missing.length) {
        issues.push({ code: 'INCOMPLETE_ROUTE', flow: flow.id, route: route.id, missing, message: `${route.id} is declared complete but omits ${missing.join(', ')}` });
      }
    }
  }

  if (flow.uiUnits) {
    if (typeof flow.expectedUiUnits === 'number' && flow.uiUnits.length !== flow.expectedUiUnits) {
      issues.push({
        code: 'UI_UNIT_COUNT_MISMATCH',
        flow: flow.id,
        expected: flow.expectedUiUnits,
        actual: flow.uiUnits.length,
        message: `${flow.id} expects ${flow.expectedUiUnits} semantic UI units but declares ${flow.uiUnits.length}`,
      });
    }
    const mapped = new Set();
    for (const unit of flow.uiUnits) {
      for (const fieldId of unit.fields ?? []) {
        if (!fieldIds.has(fieldId)) {
          issues.push({ code: 'UNKNOWN_UI_FIELD', flow: flow.id, unit: unit.id, field: fieldId, message: `${unit.id} references unknown field ${fieldId}` });
        }
        if (mapped.has(fieldId)) {
          issues.push({ code: 'FIELD_IN_MULTIPLE_UI_UNITS', flow: flow.id, field: fieldId, message: `${fieldId} is mapped to more than one semantic UI unit` });
        }
        mapped.add(fieldId);
      }
    }
    const unmappedRequired = requiredFields.map((field) => field.id).filter((fieldId) => !mapped.has(fieldId));
    if (unmappedRequired.length) {
      issues.push({
        code: 'UNMAPPED_REQUIRED_UI_FIELD',
        flow: flow.id,
        fields: unmappedRequired,
        message: `Required fields are not mapped to a semantic UI unit: ${unmappedRequired.join(', ')}`,
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
  } else {
    if (/hasTime|hasMeasure|ינואר|אחוז|%/.test(smartGoalBody)) {
      issues.push({
        code: 'SOURCE_DRIFT',
        message: 'smartGoalLooksValid still validates timeframe/measurement inside the goal field; those facts belong to sibling fields.',
      });
    }
    if (/length\s*[<>]=?\s*\d+|split\(/.test(smartGoalBody)) {
      issues.push({
        code: 'HIDDEN_VALIDATOR_REQUIREMENT',
        message: 'smartGoalLooksValid adds an unapproved length/word-count requirement that is not part of the Stage 1 professional gate.',
      });
    }
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

  const stage2 = contract.flows.find((flow) => flow.id === 'stage2-formative');
  const shortRoute = stage2?.routes?.find((route) => route.id === 'short')?.fields ?? [];
  const fullRoute = stage2?.routes?.find((route) => route.id === 'full')?.fields ?? [];
  const sourceShort = parseQuestionIds(workSessionSource, 'shortIds');
  const sourceFull = parseQuestionIds(workSessionSource, 'fullIds');
  if (!sameMembers(sourceShort, shortRoute)) {
    issues.push({ code: 'ROUTE_SOURCE_DRIFT', message: `Work Session short route is ${sourceShort.join(', ')}, contract expects ${shortRoute.join(', ')}` });
  }
  if (!sameMembers(sourceFull, fullRoute)) {
    issues.push({ code: 'ROUTE_SOURCE_DRIFT', message: `Work Session full route is ${sourceFull.join(', ')}, contract expects ${fullRoute.join(', ')}` });
  }

  const formativeStartedBody = stagesSource.match(/export function formativeStarted\(formative: Formative\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  if (!formativeStartedBody.includes('formative.answers') || !formativeStartedBody.includes('some(hasValue)')) {
    issues.push({
      code: 'PARTIAL_GATE_DRIFT',
      message: 'Stage 2 no longer treats any answered professional section as sufficient for a valid partial formative save.',
    });
  }
  if (!pageSource.includes('גם מענה חלקי הוא בעל ערך')) {
    issues.push({ code: 'UX_COPY_DRIFT', message: 'Stage 2 no longer tells the user that partial input is valid.' });
  }

  const stage3 = contract.flows.find((flow) => flow.id === 'stage3-summative');
  const expectedGroupSizes = (stage3?.uiUnits ?? []).map((unit) => unit.fields.length);
  const sourceGroupSizes = parseNumberArray(workSessionSource, 'summativeGroupSizes');
  if (!sameMembers(sourceGroupSizes, expectedGroupSizes)) {
    issues.push({
      code: 'UI_UNIT_SOURCE_DRIFT',
      message: `Stage 3 Work Session groups are [${sourceGroupSizes.join(', ')}], expected semantic question groups [${expectedGroupSizes.join(', ')}].`,
    });
  }

  return issues;
}

function assertAuditorCatchesKnownRegressions() {
  const stage1 = contract.flows.find((flow) => flow.id === 'stage1-plan');
  if (!stage1) throw new Error('Missing stage1-plan contract fixture');
  const legacyGoal = structuredClone(stage1);
  const goal = legacyGoal.fields.find((field) => field.id === 'smartGoal');
  goal.validatorRequires = ['desired_change', 'success_measure', 'timeframe'];
  const duplicateFacts = new Set(auditFlow(legacyGoal)
    .filter((issue) => issue.code === 'CROSS_FIELD_VALIDATOR_DUPLICATION')
    .map((issue) => issue.fact));
  if (!duplicateFacts.has('success_measure') || !duplicateFacts.has('timeframe')) {
    throw new Error('Auditor regression: the original SMART duplication bug is no longer detected');
  }

  const stage2 = contract.flows.find((flow) => flow.id === 'stage2-formative');
  if (!stage2) throw new Error('Missing stage2-formative contract fixture');
  const brokenRoute = structuredClone(stage2);
  brokenRoute.routes.find((route) => route.id === 'full').fields = ['q1', 'q2', 'q3'];
  if (!auditFlow(brokenRoute).some((issue) => issue.code === 'INCOMPLETE_ROUTE')) {
    throw new Error('Auditor regression: an incomplete full formative route is no longer detected');
  }

  const stage3 = contract.flows.find((flow) => flow.id === 'stage3-summative');
  if (!stage3) throw new Error('Missing stage3-summative contract fixture');
  const brokenUnits = structuredClone(stage3);
  brokenUnits.uiUnits = [
    { id: 'one', fields: ['achievement'] },
    { id: 'metric', fields: ['achievementMetric'] },
    { id: 'two', fields: ['turningPoint'] },
    { id: 'three', fields: ['nextYearChange'] },
  ];
  if (!auditFlow(brokenUnits).some((issue) => issue.code === 'UI_UNIT_COUNT_MISMATCH')) {
    throw new Error('Auditor regression: Stage 3 split into four UI parts is no longer detected');
  }
}

assertAuditorCatchesKnownRegressions();

const contractIssues = contract.flows.flatMap(auditFlow);
const sourceIssues = auditSourceAlignment();
const issues = [...contractIssues, ...sourceIssues];

if (issues.length) {
  console.error('Structural UX semantic audit failed:\n');
  for (const issue of issues) console.error(`- [${issue.code}] ${issue.message}`);
  process.exit(1);
}

console.log(`Structural UX semantic audit passed (${contract.flows.length} flows).`);
console.log('Regression fixtures: SMART duplication, incomplete formative route, and four-part summative UI are detected before production.');
