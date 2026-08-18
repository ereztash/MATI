import fs from 'node:fs';
import path from 'node:path';

function read(...parts) { return fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8'); }
function stripComments(text) { return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); }

const source = read('lib', 'organizational-signals.ts');
const extractorStart = source.indexOf('export function extractOrganizationalSignals');
const extractorEnd = source.indexOf('export function signalConcern');
if (extractorStart < 0 || extractorEnd < 0 || extractorEnd <= extractorStart) throw new Error('Could not locate organizational signal extractor boundary.');

const extractor = stripComments(source.slice(extractorStart, extractorEnd));
const forbidden = ['instructorName', 'framework', '.evidence', '.notes', '.reflection', '.shortages', 'centralMistake', 'feeling', 'turningPoint', 'nextYearChange', 'smartGoal', 'centralGoals'];
const leaks = forbidden.filter((field) => extractor.includes(field));
if (leaks.length) throw new Error(`Private/free-text fields entered organizational extractor: ${leaks.join(', ')}`);

const cohortMatch = source.match(/MIN_AGGREGATE_COHORT\s*=\s*(\d+)/);
if (!cohortMatch) throw new Error('MIN_AGGREGATE_COHORT is missing.');
const cohort = Number(cohortMatch[1]);
if (cohort < 5) throw new Error(`Privacy floor too low: ${cohort}. Expected >= 5.`);
if (!source.includes('mayAssertCausality: false')) throw new Error('Systemic classifier must explicitly deny causal assertion.');
if (!source.includes("projection: 'aggregate_only'")) throw new Error('Signals must be aggregate-only by construction.');

// The live instructor-side path is intentionally ephemeral:
// private state -> sanitized extractor -> visible preview -> explicit pack export.
// Do not require or permit a cached signal snapshot when there is no consumer.
const layer = stripComments(read('app', 'organizational-signal-layer.tsx'));
if (!layer.includes('extractOrganizationalSignals(state)')) throw new Error('Organizational signal layer must derive signals through the sanitized extractor.');
if (!layer.includes('<OrganizationalSignalPreview signals={signals}')) throw new Error('Sanitized signals must flow directly into the visible/exportable preview.');
for (const forbiddenLayer of ['SIGNAL_SNAPSHOT_KEY', 'mati-organizational-signal-v0', 'localStorage.setItem']) {
  if (layer.includes(forbiddenLayer)) throw new Error(`Organizational signal layer reintroduced unused persisted derived state: ${forbiddenLayer}`);
}

const preview = stripComments(read('app', 'organizational-signal-preview.tsx'));
if (!preview.includes('createOrganizationalPack')) throw new Error('Instructor preview must create exports through the strict organizational pack builder.');
if (!preview.includes('exportPack')) throw new Error('Organizational export must remain an explicit user action.');
for (const forbiddenPreview of ['state.plan', 'state.formative', 'state.summative', 'reflection:', 'evidence:']) {
  if (preview.includes(forbiddenPreview)) throw new Error(`Instructor signal preview crossed back into private/raw state: ${forbiddenPreview}`);
}

const pack = stripComments(read('lib', 'organizational-pack.ts'));
for (const required of ['TOP_LEVEL_KEYS', 'SIGNAL_KEYS', 'exactKeys', "projection: 'aggregate_only'"]) {
  if (!pack.includes(required)) throw new Error(`Strict organizational pack contract missing: ${required}`);
}
const forbiddenPackFields = ['instructorName', 'framework', 'reflection', 'evidence', 'notes', 'shortages', 'turningPoint', 'centralMistake', 'feeling'];
const packLeaks = forbiddenPackFields.filter((field) => pack.includes(field));
if (packLeaks.length) throw new Error(`Private fields entered organizational pack module: ${packLeaks.join(', ')}`);

const consoleSource = stripComments(read('app', 'org', 'organizational-console.tsx'));
for (const forbiddenImport of ['MatiState', 'mati-v2', 'localStorage']) {
  if (consoleSource.includes(forbiddenImport)) throw new Error(`Organizational console crossed private-state boundary: ${forbiddenImport}`);
}
if (!consoleSource.includes('validateOrganizationalPack')) throw new Error('Organizational console must validate every imported pack.');
if (!consoleSource.includes('summarizeOrganizationalPacks(packs)')) throw new Error('Organizational console must aggregate only validated sanitized packs.');

const rootLayout = stripComments(read('app', 'layout.tsx'));
if (rootLayout.includes('SessionStageReset') || rootLayout.includes('OrganizationalSignalLayer') || rootLayout.includes('ContextLayer')) {
  throw new Error('Root layout must not mount private-state components across organizational routes.');
}

const shellRouter = stripComments(read('app', 'shell-router.tsx'));
const orgReturn = shellRouter.indexOf('if (isOrganizationalSurface) return');
const privateMount = shellRouter.indexOf('<SessionStageReset');
if (orgReturn < 0 || privateMount < 0 || orgReturn > privateMount) {
  throw new Error('Organizational route must return before any private-state component mounts.');
}

console.log('Organizational signal contract check passed.');
