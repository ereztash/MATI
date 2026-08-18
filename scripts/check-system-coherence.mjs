import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

const contract = JSON.parse(read('lib', 'system-coherence-contract.json'));
const stages = read('lib', 'stages.ts');
const contextEngine = read('lib', 'context-engine.ts');
const contextLayer = read('app', 'context-layer.tsx');
const page = read('app', 'page.tsx');
const experienceShell = read('app', 'experience-shell.tsx');
const workSession = read('app', 'work-session-layer.tsx');
const orgPreview = read('app', 'organizational-signal-preview.tsx');
const orgPage = read('app', 'org', 'page.tsx');
const orgConsole = read('app', 'org', 'organizational-console.tsx');
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
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const requiredInvariants = [
  'R1_NO_DUPLICATE_SEMANTIC_WORK',
  'R2_PURPOSE_LIMIT_FREE_TEXT',
  'R3_DERIVATION_RETURNS_VALUE',
  'R4_NO_UNUSED_TELEMETRY',
  'C1_SINGLE_RULE_SOURCE',
  'C2_SAME_TERM_SAME_MEANING',
  'C3_NO_EVIDENCE_IS_NOT_EVIDENCE',
  'C4_PRIVACY_CLAIMS_MATCH_DATA_FLOW',
  'C5_DETECTION_IS_NOT_AUTHORITY',
  'C6_DOCS_COPY_CODE_ALIGN',
  'C7_NO_SILENT_CLASSIFICATION',
];
const declared = new Set((contract.invariants ?? []).map((item) => item.id));
for (const id of requiredInvariants) if (!declared.has(id)) issue('MISSING_INVARIANT', `System coherence contract is missing ${id}`);

// R2: UX state may use interaction structure, device and time, but not semantic mining of reflection prose or unrelated metadata.
const interactionBody = bodyOf(stages, 'analyzeInteraction');
if (!interactionBody) issue('INTERACTION_PROFILE_MISSING', 'analyzeInteraction is missing.');
for (const forbidden of ['collectStrings', 'minimalTokens', 'negative =', 'overload-language', 'קשה|מתסכל', 'מותשת', 'נכשל|כישלון']) {
  if (interactionBody.includes(forbidden)) issue('FREE_TEXT_SECONDARY_USE', `analyzeInteraction contains forbidden semantic-text UX inference: ${forbidden}`);
}
if (/\.length\s*[<>]=?\s*\d+/.test(interactionBody) || /reduce\([^)]*\.length/.test(interactionBody)) {
  issue('FREE_TEXT_LENGTH_PROFILE', 'analyzeInteraction must not infer UX state from reflection-text length.');
}
for (const forbiddenSource of ['state.plan', 'state.formative.context', 'state.formative.post', 'state.summative', 'state.history']) {
  if (interactionBody.includes(forbiddenSource)) issue('UX_SENSOR_SCOPE_DRIFT', `Response-modality sensing must not use unrelated metadata or stages: ${forbiddenSource}`);
}
if (!interactionBody.includes('state.formative.answers')) {
  issue('UX_SENSOR_SOURCE_MISSING', 'Response-modality sensing must be scoped to the formative answer surface.');
}
if (!interactionBody.includes("pace: 'balanced'") || !interactionBody.includes('minimalism: false') || !interactionBody.includes('overload: false')) {
  issue('UX_PROFILE_AUTHORITY_DRIFT', 'Content-derived pace/minimalism/overload must remain disabled unless separately authorized.');
}

// R4: keep only telemetry that currently drives a declared decision.
for (const unused of ['visitCount', 'interactionCount', 'maxTouchPoints', 'touch: boolean', 'width?: number']) {
  if (contextEngine.includes(unused) || contextLayer.includes(unused)) issue('UNUSED_UX_TELEMETRY', `Pilot still collects or models unused UX telemetry: ${unused}`);
}
if (!contextEngine.includes('sessionStartedAt: string') || !contextEngine.includes('lastVisitAt?: string') || !contextEngine.includes('device: DeviceClass')) {
  issue('REQUIRED_UX_SIGNAL_MISSING', 'Minimal context contract must retain session start, last visit and device because current decisions use them.');
}
if (!contextLayer.includes("JSON.stringify({ lastVisitAt: new Date().toISOString() })")) {
  issue('USAGE_STORAGE_SCOPE_DRIFT', 'Persistent UX usage storage must contain only lastVisitAt; session duration and device are session-local.');
}

const strategyBody = bodyOf(contextEngine, 'deriveCoachStrategy');
for (const forbidden of ['snapshot.profile.pace', 'snapshot.profile.overload', 'snapshot.profile.minimalism', "has('overload-language')", "has('minimal-replies')", "has('compact-responses')"]) {
  if (strategyBody.includes(forbidden)) issue('CONTEXT_ENGINE_SECONDARY_USE', `Context strategy still depends on inferred reflection profile: ${forbidden}`);
}
if (!strategyBody.includes("has('device-mobile')") || !strategyBody.includes("has('long-session')")) {
  issue('OBSERVABLE_CONTEXT_DRIFT', 'Context strategy should retain observable device/session signals as its low-risk adaptation basis.');
}

// R3: user-visible derivations must disclose derivation and preserve source authority.
for (const phrase of [
  'זה תמצות מכני של מה שכתבת',
  'השאירי את הטקסט המקורי כסמכות',
  'זה חישוב מתוך המספרים שהזנת, לא הערכה של המערכת',
  'כל המסקנות כאן נשענות על מה שהזנת',
]) {
  if (!page.includes(phrase)) issue('DERIVATION_DISCLOSURE_DRIFT', `User-visible derivation disclosure is missing: ${phrase}`);
}

// C1: Stage 1 has one semantic gate even though several surfaces guide the user through it.
const stage1Fields = ['audience', 'smartGoal', 'metric1', 'metric2', 'timeframe'];
const optionalStage1 = ['flexibility', 'managers', 'independence'];
const planReadyBody = bodyOf(stages, 'planReady');
const savePlanBody = bodyOf(page, 'savePlan');
const nextActionBody = bodyOf(experienceShell, 'nextAction');
for (const field of stage1Fields) {
  if (!planReadyBody.includes(`plan.${field}`)) issue('GATE_SOURCE_DRIFT', `planReady no longer references ${field}`);
  if (!savePlanBody.includes(`state.plan.${field}`) && field !== 'smartGoal') issue('SAVE_GATE_DRIFT', `savePlan no longer checks ${field}`);
  if (!nextActionBody.includes(`state.plan.${field}`)) issue('HOME_GATE_DRIFT', `Home nextAction no longer reflects ${field}`);
}
if (!savePlanBody.includes('smartGoalLooksValid(state.plan.smartGoal)')) issue('SAVE_GATE_DRIFT', 'savePlan no longer delegates goal validity to smartGoalLooksValid.');
for (const field of optionalStage1) {
  if (planReadyBody.includes(`plan.${field}`)) issue('OPTIONAL_FIELD_BECAME_GATE', `planReady silently made ${field} mandatory.`);
  if (savePlanBody.includes(`state.plan.${field}`)) issue('OPTIONAL_FIELD_BECAME_GATE', `savePlan silently made ${field} mandatory.`);
}

// C7: unresolved calendar gaps must remain unresolved in every support layer.
for (const [name, source] of [['ExperienceShell', experienceShell], ['ContextLayer', contextLayer], ['WorkSessionLayer', workSession]]) {
  if (/stageFromDate\([^)]*\)[^\n;]*\?\?\s*1/.test(source) || /automaticStage\s*\?\?\s*1/.test(source)) {
    issue('SILENT_STAGE_CLASSIFICATION', `${name} silently defaults an unresolved calendar stage to Stage 1.`);
  }
}
if (!experienceShell.includes('if (!activeStage) return') || !contextLayer.includes('if (!activeStage) return null') || !workSession.includes('return state.manualStage ?? stageFromDate();')) {
  issue('UNRESOLVED_STAGE_PATH_DRIFT', 'Support layers must explicitly preserve the between-window unresolved stage until the instructor chooses.');
}

// C2/R1: repeated cross-stage concepts must be explicitly reviewed as distinct temporal meanings.
const reviewed = contract.reviewedCrossStageRepresentations ?? [];
if (reviewed.length < 4) issue('CROSS_STAGE_REGISTRY_INCOMPLETE', 'Cross-stage representation registry is unexpectedly small.');
for (const item of reviewed) {
  if (item.status !== 'DISTINCT_TEMPORAL_MEANING' || !item.earlierMeaning || !item.laterMeaning) {
    issue('CROSS_STAGE_SEMANTIC_AMBIGUITY', `${item.earlier} -> ${item.later} is not explicitly distinguished.`);
  }
}
for (const label of ['מסגרת זמן גסה', 'תקופת ההערכה', 'מטרת SMART אחת', 'מטרות מרכזיות בתוכנית']) {
  if (!page.includes(label)) issue('TEMPORAL_LABEL_DRIFT', `UI no longer distinguishes a reviewed cross-stage representation: ${label}`);
}

// C5: inquiry heuristics can raise a question, never become a gate, score or causal diagnosis.
const heuristics = contract.inquiryOnlyHeuristics ?? [];
if (heuristics.length < 5) issue('HEURISTIC_REGISTRY_INCOMPLETE', 'Inquiry-only heuristic registry is unexpectedly small.');
for (const heuristic of heuristics) {
  if (heuristic.authority !== 'INQUIRY_ONLY' || heuristic.mayGate !== false || heuristic.mayScore !== false || heuristic.mayAssertCausality !== false) {
    issue('HEURISTIC_AUTHORITY_DRIFT', `${heuristic.id} exceeds inquiry-only authority.`);
  }
}
const canOpenBody = bodyOf(stages, 'canOpenStage');
if (canOpenBody.includes('hasLargeGoalResultGap') || canOpenBody.includes('findContradictions')) issue('HEURISTIC_BECAME_GATE', 'An inquiry heuristic is being used as a stage gate.');
if (/if\s*\(\s*hasLargeGoalResultGap/.test(savePlanBody)) issue('HEURISTIC_BECAME_GATE', 'Goal/result heuristic is being used to block plan saving.');
const contradictionBody = bodyOf(contextEngine, 'findContradictions');
for (const causal of ['הסיבה היא', 'נגרם בגלל', 'גורם ל', 'מוכיח ש']) {
  if (contradictionBody.includes(causal)) issue('CAUSALITY_OVERREACH', `Contradiction detector asserts causality: ${causal}`);
}

// C6: documentation and implementation must describe the same Stage 1 gate and adaptation model.
const oldSmartClaims = [
  'בדיקת SMART בסיסית למטרה: זמן + רכיב מדיד',
  'המטרה עצמה חייבת לכלול זמן',
  'המטרה עצמה חייבת לכלול מדד',
];
const textDocs = [path.join(root, 'README.md'), ...walk(path.join(root, 'docs')).filter((file) => file.endsWith('.md'))];
for (const file of textDocs) {
  const source = fs.readFileSync(file, 'utf8');
  for (const claim of oldSmartClaims) if (source.includes(claim)) issue('DOC_RULE_CONTRADICTION', `${path.relative(root, file)} contains obsolete SMART rule: ${claim}`);
}
if (!readme.includes('ה־SMART נבחן ברמת התוכנית השלמה')) issue('DOC_SOURCE_OF_TRUTH_MISSING', 'README must state that SMART is evaluated at the whole-plan level.');
if (!readme.includes('קהל יעד, שינוי רצוי, שני מדדים ומסגרת זמן')) issue('DOC_GATE_DRIFT', 'README does not describe the current Stage 1 gate atoms.');
for (const claim of ['מינימליזם ועומס', 'תמציתי/עמוק']) if (readme.includes(claim)) issue('DOC_ADAPTATION_CONTRADICTION', `README still claims semantic response profiling: ${claim}`);
if (!readme.includes('אינה מנתחת את משמעות הטקסט החופשי לצורך התאמת UX')) issue('DOC_PURPOSE_LIMIT_MISSING', 'README must disclose that free reflection prose is not semantically mined for UX adaptation.');
for (const window of ['יולי–ספטמבר', 'דצמבר–פברואר', 'מאי–יוני']) if (!readme.includes(window)) issue('CALENDAR_DOC_DRIFT', `README is missing stage window ${window}`);

// C4: privacy claims must match every current network, aggregation and identity path.
for (const phrase of ['Reflection belongs to the instructor', 'no automatic cross-device collection', 'manual import of multiple packs', 'may not automatically', 'assert causality', 'pseudonymous rather than anonymous']) {
  if (!orgContract.includes(phrase)) issue('ORGANIZATIONAL_AUTHORITY_DRIFT', `Organizational contract is missing current boundary: ${phrase}`);
}
if (orgContract.includes('does not aggregate across instructors')) issue('ORGANIZATIONAL_DOC_DRIFT', 'Organizational contract still claims no aggregation even though /org supports manual local multi-pack aggregation.');
if (!orgConsole.includes('summarizeOrganizationalPacks(packs)') || (!orgConsole.includes('כמה קבצי MATI יחד') && !orgConsole.includes('multiple'))) {
  issue('ORGANIZATIONAL_RUNTIME_DRIFT', '/org no longer clearly implements manual local multi-pack aggregation.');
}
for (const [name, source] of [['org page', orgPage], ['org console', orgConsole], ['signal preview', orgPreview]]) {
  for (const forbidden of ['משתתפות אנונימיות', 'קוד מסגרת אנונימי']) {
    if (source.includes(forbidden)) issue('ANONYMITY_OVERCLAIM', `${name} overstates pseudonymous data as anonymous: ${forbidden}`);
  }
}
if (!orgPage.includes('פסבדונימיות') || !orgConsole.includes('מזהים פסבדונימיים') || !orgPreview.includes('פסבדונימ')) {
  issue('PSEUDONYMITY_DISCLOSURE_DRIFT', 'Organizational surfaces must disclose that stable linkage identifiers are pseudonymous, not anonymous.');
}
if (!orgPreview.includes('כרגע: מקומי בלבד')) issue('PRIVACY_COPY_DRIFT', 'Instructor signal preview no longer states that the current signal state is local only.');
if (!orgPreview.includes('ייצוא signal')) issue('PRIVACY_EXPORT_DRIFT', 'Explicit organizational signal export control is missing.');
if (!readme.includes('אין שליחה אוטומטית של תוכן רפלקטיבי')) issue('PRIVACY_DOC_DRIFT', 'README must distinguish no automatic transmission from explicit local export.');
const appSources = walk(path.join(root, 'app')).filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));
const networkPatterns = [/\bfetch\s*\(/, /XMLHttpRequest/, /navigator\.sendBeacon/, /new\s+WebSocket\s*\(/];
for (const file of appSources) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of networkPatterns) if (pattern.test(source)) issue('UNDECLARED_TRANSMISSION', `${path.relative(root, file)} contains network transmission while the pilot declares no automatic sending.`);
}

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

// Lower-level structural contract must still cover the full journey.
const structural = JSON.parse(structuralContract);
if (!Array.isArray(structural.flows) || structural.flows.length !== 3) issue('STRUCTURAL_CONTRACT_DRIFT', 'Structural UX contract must cover all three professional stages.');
if (!workSession.includes('const summativeGroupSizes = [2, 1, 1]')) issue('WORK_UNIT_DRIFT', 'Stage 3 is no longer grouped into three professional work units.');

if (issues.length) {
  console.error('System coherence audit failed:\n');
  for (const item of issues) console.error(`- [${item.code}] ${item.message}`);
  if (warnings.length) {
    console.error('\nContained pending conflicts:');
    for (const item of warnings) console.error(`- [${item.code}] ${item.message}`);
  }
  process.exit(1);
}

console.log(`System coherence audit passed (${requiredInvariants.length} invariants, ${reviewed.length} cross-stage representations, ${heuristics.length} inquiry-only heuristics).`);
console.log('Representation, source-of-truth, unresolved-state, privacy, authority, identity, telemetry, data-path, aggregation and documentation boundaries are aligned.');
for (const item of warnings) console.log(`PENDING: ${item.message}`);
