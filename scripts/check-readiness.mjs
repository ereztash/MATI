/**
 * Readiness check — keeps docs/MARKET_READINESS.md honest.
 *
 * This does NOT fail because criteria are open; open criteria are the normal
 * state of a pilot in progress. It fails only when the DoD *claims* a
 * machine-checkable row is done and the code does not back that up. A DoD
 * that drifts ahead of reality launders drift as progress, which is worse
 * than having no DoD at all.
 *
 * Rows marked `human` in the document are never asserted here — no amount of
 * code proves that a real מדריכה completed a plan unaided.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (...p) => {
  try { return fs.readFileSync(path.join(root, ...p), 'utf8'); } catch { return ''; }
};

const dod = read('docs', 'MARKET_READINESS.md');
if (!dod) {
  console.error('Readiness check: docs/MARKET_READINESS.md is missing — the DoD is the source of truth and must exist.');
  process.exit(1);
}

const stages = read('lib', 'stages.ts');
const page = read('app', 'page.tsx');
const storage = read('lib', 'state-storage.ts');
const signals = read('lib', 'organizational-signals.ts');
const e2e = read('tests', 'e2e', 'instructor.spec.ts');
const orgPreview = read('app', 'organizational-signal-preview.tsx');

/** Each probe answers: does the code actually support this criterion today? */
const probes = [
  {
    id: 'R2',
    label: 'work survives reload / restart',
    // The write is asserted where the key lives, not where it is called from.
    // This used to require the literal `localStorage.setItem(STORAGE_KEY` in
    // page.tsx, which made moving that call into the module that owns the key
    // — a fix, not a regression — read as R2 having been withdrawn.
    met: /loadStoredState/.test(page) && /writeStoredState/.test(page)
      && /localStorage\.setItem\(STORAGE_KEY/.test(storage) && /savedAt/.test(e2e),
    why: 'the page must hydrate via loadStoredState, persist through writeStoredState (which writes STORAGE_KEY), and be covered by an e2e test that asserts savedAt',
  },
  {
    id: 'R3',
    label: 'instructor-facing backup / restore path',
    // Matched on a real control, never on prose: "גיבוי" also means managerial
    // *backing* and appears in a Stage 1 placeholder ("החלטות, משאבים, זמן, גיבוי"),
    // which is exactly the false positive that would let this row lie.
    // The organizational signal export is also NOT this — it ships structured
    // signals to the org, not a restorable copy of her own work.
    met: /restoreOwnState|downloadOwnState|onRestoreFile|type="file"/.test(page),
    why: 'no instructor-facing control to save or restore her own plan as a file',
  },
  {
    id: 'R4',
    label: 'plan changes recorded as before/after',
    met: /planRevisions|planHistory|previousPlan|revisions/.test(stages),
    why: 'Plan is overwritten in place; no revision trail exists in the schema',
  },
  {
    id: 'R5',
    label: 'copy states the reflection is not used to rate her',
    met: /לא משמש[ת]? לדירוג|אינה? כלי הערכה|לא לצורך דירוג|לא משמשת להערכת/.test(page),
    why: 'no explicit not-for-appraisal statement in the instructor-facing copy',
  },
  {
    id: 'R7',
    label: 'persistence beyond localStorage',
    met: /supabase|fetch\(['"`]\/api|indexedDB|createClient/.test(page + storage),
    why: 'localStorage is still the only store',
  },
  {
    id: 'R8',
    label: 'generic answer prompts for a concrete anchor',
    // Must be wired into the page, not merely present as a library.
    met: /needsConcreteAnchor/.test(page) && /AnchorHint/.test(page),
    why: 'a generic reflective answer is accepted as-is',
  },
  {
    id: 'R9',
    label: 'independence gap surfaced on its own terms',
    met: /independenceReading/.test(page) && /stopAndCheck/.test(read('lib', 'independence.ts')),
    why: 'independence is only one score among five, where a stop-and-look signal goes unnoticed',
  },
  {
    id: 'R11',
    label: 'pattern sensitivity matches 2-3 repetitions in one framework',
    // The manager asked for local-cluster sensitivity; today a local_cluster is
    // explicitly non-surfaceable and everything is gated behind a 5-contributor floor.
    met: !/classification !== 'local_cluster'/.test(signals),
    why: "local_cluster is still non-surfaceable and gated behind MIN_AGGREGATE_COHORT",
  },
];

// Read the status column the document claims for each row.
function claimedDone(id) {
  const row = dod.split('\n').find((l) => l.trim().startsWith(`| ${id} `));
  return row ? /✅/.test(row) : false;
}

const lies = [];
const open = [];
for (const probe of probes) {
  const claims = claimedDone(probe.id);
  if (claims && !probe.met) lies.push(probe);
  if (!probe.met) open.push(probe);
}

console.log('MATI readiness — machine-checkable rows\n');
for (const probe of probes) {
  const mark = probe.met ? '✅' : '❌';
  console.log(`  ${mark} ${probe.id}  ${probe.label}`);
  if (!probe.met) console.log(`        ${probe.why}`);
}

// Surface the org-export nuance rather than letting it silently satisfy R3.
if (!probes.find((p) => p.id === 'R3').met && /download|ייצוא/.test(orgPreview)) {
  console.log('\n  note: the organizational signal export exists, but it ships structured signals');
  console.log('        for the org — it is not a backup of the instructor\'s own work (R3).');
}

console.log(`\n${probes.length - open.length}/${probes.length} machine-checkable criteria met.`);

if (lies.length) {
  console.error('\nDoD DRIFT — the document claims these are done, the code says otherwise:');
  for (const l of lies) console.error(`  - ${l.id} ${l.label}: ${l.why}`);
  console.error('\nFix the code or correct the status column. A DoD ahead of reality is worse than none.');
  process.exit(1);
}

console.log('DoD status column agrees with the code.');
