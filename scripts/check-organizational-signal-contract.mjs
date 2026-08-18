import fs from 'node:fs';
import path from 'node:path';

const signalFile = path.join(process.cwd(), 'lib', 'organizational-signals.ts');
const source = fs.readFileSync(signalFile, 'utf8');

function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

const extractorStart = source.indexOf('export function extractOrganizationalSignals');
const extractorEnd = source.indexOf('export function canProjectSignal');
if (extractorStart < 0 || extractorEnd < 0 || extractorEnd <= extractorStart) {
  throw new Error('Could not locate organizational signal extractor boundary.');
}

const extractor = stripComments(source.slice(extractorStart, extractorEnd));
const forbidden = [
  'instructorName',
  'framework',
  '.evidence',
  '.notes',
  '.reflection',
  '.shortages',
  'centralMistake',
  'feeling',
  'turningPoint',
  'nextYearChange',
  'smartGoal',
  'centralGoals',
];

const leaks = forbidden.filter((field) => extractor.includes(field));
if (leaks.length) {
  throw new Error(`Private/free-text fields entered organizational extractor: ${leaks.join(', ')}`);
}

const cohortMatch = source.match(/MIN_AGGREGATE_COHORT\s*=\s*(\d+)/);
if (!cohortMatch) throw new Error('MIN_AGGREGATE_COHORT is missing.');
const cohort = Number(cohortMatch[1]);
if (cohort < 5) throw new Error(`Privacy floor too low: ${cohort}. Expected >= 5.`);

if (!source.includes("mayAssertCausality: false")) {
  throw new Error('Systemic classifier must explicitly deny causal assertion.');
}

if (!source.includes("projection: 'aggregate_only'")) {
  throw new Error('Signals must be aggregate-only by construction.');
}

const layerFile = path.join(process.cwd(), 'app', 'organizational-signal-layer.tsx');
if (fs.existsSync(layerFile)) {
  const layer = stripComments(fs.readFileSync(layerFile, 'utf8'));
  const snapshotStart = layer.indexOf('localStorage.setItem(SIGNAL_SNAPSHOT_KEY');
  const snapshotEnd = layer.indexOf('} catch', snapshotStart);
  if (snapshotStart < 0 || snapshotEnd < 0) {
    throw new Error('Could not locate local organizational signal snapshot boundary.');
  }
  const snapshot = layer.slice(snapshotStart, snapshotEnd);
  if (!snapshot.includes('signals')) {
    throw new Error('Organizational snapshot must contain the sanitized signals array.');
  }
  const forbiddenSnapshotFields = ['state,', 'source,', 'instructorName', 'framework', 'reflection', 'evidence', 'notes', 'shortages'];
  const snapshotLeaks = forbiddenSnapshotFields.filter((field) => snapshot.includes(field));
  if (snapshotLeaks.length) {
    throw new Error(`Private/raw state entered organizational snapshot: ${snapshotLeaks.join(', ')}`);
  }
}

console.log('Organizational signal contract check passed.');
