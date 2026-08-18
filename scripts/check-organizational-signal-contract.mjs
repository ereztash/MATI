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

const layer = stripComments(read('app', 'organizational-signal-layer.tsx'));
const snapshotStart = layer.indexOf('localStorage.setItem(SIGNAL_SNAPSHOT_KEY');
const snapshotEnd = layer.indexOf('} catch', snapshotStart);
if (snapshotStart < 0 || snapshotEnd < 0) throw new Error('Could not locate local organizational signal snapshot boundary.');
const snapshot = layer.slice(snapshotStart, snapshotEnd);
if (!snapshot.includes('signals')) throw new Error('Organizational snapshot must contain the sanitized signals array.');
const forbiddenSnapshotFields = ['state,', 'source,', 'instructorName', 'framework', 'reflection', 'evidence', 'notes', 'shortages'];
const snapshotLeaks = forbiddenSnapshotFields.filter((field) => snapshot.includes(field));
if (snapshotLeaks.length) throw new Error(`Private/raw state entered organizational snapshot: ${snapshotLeaks.join(', ')}`);

const pack = stripComments(read('lib', 'organizational-pack.ts'));
for (const required of ['TOP_LEVEL_KEYS', 'SIGNAL_KEYS', 'exactKeys', 'projection: \'aggregate_only\'']) {
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
