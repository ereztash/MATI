import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const contract = JSON.parse(read('lib', 'system-coherence-contract.json'));
const stages = read('lib', 'stages.ts');
const contextEngine = read('lib', 'context-engine.ts');
const page = read('app', 'page.tsx');
const orgPreview = read('app', 'organizational-signal-preview.tsx');
const readme = read('README.md');
const orgContract = read('docs', 'organizational-signal-contract.md');
const structuralContract = read('lib', 'ux-structural-contract.json');

const issues = [];
const warnings = [];

function issue(code, message) { issues.push({ code, message }); }
function warning(code, message) { warnings.push({ code, message }); }
function bodyOf(source, functionName) {
  const match = source.match(new RegExp(`(?:export\\s+)?function\\s+${functionName}\\([^)]*\\)[^{]*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? '';
}

const requiredInvariants = [
  'R1_NO_DUPLICATE_SEMANTIC_WORK',
  'R2_PURPOSE_LIMIT_FREE_TEXT',
  'R3_DERIVATION_RETURNS_VALUE',
  'C1_SINGLE_RULE_SOURCE',
  'C2_SAME_TERM_SAME_MEANING',
  'C3_NO_EVIDENCE_IS_NOT_EVIDENCE',
  'C4_PRIVACY_CLAIMS_MATCH_DATA_FLOW',
  'C5_DETECTION_IS_NOT_AUTHORITY',
  'C6_DOCS_COPY_CODE_ALIGN',
];
const declared = new Set((contract.invariants ?? []).map((item) => item.id));
for (const id of requiredInvariants) if (!declared.has(id)) issue('MISSING_INVARIANT', `System coherence contract is missing ${id}`);

// R2: UX state may use interaction structure, device and time, but not semantic mining of reflection prose.
const interactionBody = bodyOf(stages, 'analyzeInteraction');
if (!interactionBody) issue('INTERACTION_PROFILE_MISSING', 'analyzeInteraction is missing.');
for (const forbidden of ['collectStrings', 'minimalTokens', 'negative =', 'overload-language', 'קשה|מתסכל', 'מותשת', 'נכשל|כישלון']) {
  if (interactionBody.includes(forbidden)) issue('FREE_TEXT_SECONDARY_USE', `analyzeInteraction contains forbidden semantic-text UX inference: ${forbidden}`);
}
if (/\.length\s*[<>]=?\s*\d+/.test(interactionBody) || /reduce\([^)]*\.length/.test(interactionBody)) {
  issue('FREE_TEXT_LENGTH_PROFILE', 'analyzeInteraction must not infer UX state from reflection-text length.');
}
if (!interactionBody.includes("pace: 'balanced'") || !interactionBody.includes('minimalism: false') || !interactionBody.includes('overload: false')) {
  issue('UX_PROFILE_AUTHORITY_DRIFT', 'Content-derived pace/minimalism/overload must remain disabled unless separately authorized.');
}

const strategyBody = bodyOf(contextEngine, 'deriveCoachStrategy');
for (const forbidden of ['snapshot.profile.pace', 'snapshot.profile.overload', 'snapshot.profile.minimalism', "has('overload-language')", "has('minimal-replies')", "has('compact-responses')"]) {
  if (strategyBody.includes(forbidden)) issue('CONTEXT_ENGINE_SECONDARY_USE', `Context strategy still depends on inferred reflection profile: ${forbidden}`);
}
if (!strategyBody.includes("has('device-mobile')") || !strategyBody.includes("has('long-session')")) {
  issue('OBSERVABLE_CONTEXT_DRIFT', 'Context strategy should retain observable device/session signals as its low-risk adaptation basis.');
}

// C1/C6: documentation and implementation must describe the same Stage 1 gate.
const oldSmartClaims = [
  'בדיקת SMART בסיסית למטרה: זמן + רכיב מדיד',
  'המטרה עצמה חייבת לכלול זמן',
  'המטרה עצמה חייבת לכלול מדד',
];
for (const claim of oldSmartClaims) if (readme.includes(claim)) issue('DOC_RULE_CONTRADICTION', `README still contains obsolete SMART rule: ${claim}`);
if (!readme.includes('ה־SMART נבחן ברמת התוכנית השלמה')) {
  issue('DOC_SOURCE_OF_TRUTH_MISSING', 'README must state that SMART is evaluated at the whole-plan level.');
}
if (!readme.includes('קהל יעד, שינוי רצוי, שני מדדים ומסגרת זמן')) {
  issue('DOC_GATE_DRIFT', 'README does not describe the current Stage 1 gate atoms.');
}

const obsoleteAdaptiveClaims = ['מינימליזם ועומס', 'תמציתי/עמוק'];
for (const claim of obsoleteAdaptiveClaims) if (readme.includes(claim)) issue('DOC_ADAPTATION_CONTRADICTION', `README still claims semantic response profiling: ${claim}`);
if (!readme.includes('אינה מנתחת את משמעות הטקסט החופשי לצורך התאמת UX')) {
  issue('DOC_PURPOSE_LIMIT_MISSING', 'README must disclose that free reflection prose is not semantically mined for UX adaptation.');
}

// Calendar semantics must agree across docs and source.
for (const window of ['יולי–ספטמבר', 'דצמבר–פברואר', 'מאי–יוני']) {
  if (!readme.includes(window)) issue('CALENDAR_DOC_DRIFT', `README is missing stage window ${window}`);
}

// C4/C5: privacy and organizational authority must stay aligned.
for (const phrase of [
  'Reflection belongs to the instructor',
  'does not yet send or aggregate signals across devices',
  'may not automatically',
  'assert causality',
]) {
  if (!orgContract.includes(phrase)) issue('ORGANIZATIONAL_AUTHORITY_DRIFT', `Organizational contract is missing authority boundary: ${phrase}`);
}
if (!orgPreview.includes('כרגע: מקומי בלבד')) issue('PRIVACY_COPY_DRIFT', 'Instructor signal preview no longer states that the current signal state is local only.');
if (!orgPreview.includes('ייצוא signal')) issue('PRIVACY_EXPORT_DRIFT', 'Explicit organizational signal export control is missing.');
if (/\bfetch\s*\(/.test(orgPreview)) issue('UNDECLARED_TRANSMISSION', 'Organizational signal preview performs network transmission; explicit export-only pilot contract would be false.');
if (!readme.includes('אין שליחה אוטומטית של תוכן רפלקטיבי')) issue('PRIVACY_DOC_DRIFT', 'README must distinguish no automatic transmission from explicit local export.');

// C3: expose professional conflicts without silently rewriting approved scoring.
const pending = new Map((contract.pendingAuthorityConflicts ?? []).map((item) => [item.id, item]));
const dimensionFloorExists = stages.includes('Math.max(2, Math.min(5');
const noEvidencePromiseExists = page.includes('כשאין נתון, המערכת מציינת שאין נתון ולא משלימה אותו');
if (dimensionFloorExists && noEvidencePromiseExists) {
  const registered = pending.get('DIMENSION_SCORE_WITHOUT_EVIDENCE');
  if (!registered || registered.status !== 'PENDING_HUMAN_AUTHORITY') {
    issue('UNREGISTERED_PROFESSIONAL_CONFLICT', 'Unevidenced 2/5 dimension floor conflicts with the no-invention promise and is not registered for human authority.');
  } else {
    warning('PENDING_HUMAN_AUTHORITY', registered.conflict);
  }
}

// Structural UX audit remains the lower-level representation consistency gate.
const structural = JSON.parse(structuralContract);
if (!Array.isArray(structural.flows) || structural.flows.length !== 3) issue('STRUCTURAL_CONTRACT_DRIFT', 'Structural UX contract must cover all three professional stages.');

if (issues.length) {
  console.error('System coherence audit failed:\n');
  for (const item of issues) console.error(`- [${item.code}] ${item.message}`);
  if (warnings.length) {
    console.error('\nContained pending conflicts:');
    for (const item of warnings) console.error(`- [${item.code}] ${item.message}`);
  }
  process.exit(1);
}

console.log(`System coherence audit passed (${requiredInvariants.length} invariants).`);
console.log('Representation, source-of-truth, privacy, authority and documentation boundaries are aligned.');
for (const item of warnings) console.log(`PENDING: ${item.message}`);
