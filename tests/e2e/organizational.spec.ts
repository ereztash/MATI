import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nav, savedPlan, seed, STORAGE_KEY } from './fixtures';
import { MIN_AGGREGATE_COHORT } from '../../lib/organizational-signals';

const SECRET_NAME = 'נועה כהן';
const SECRET_FRAMEWORK = 'בית ספר הדקל';
const SECRET_TEXT = 'המורה סיפרה שהיא מרגישה שהיא נכשלת';

const answeredState = {
  plan: savedPlan,
  formative: {
    route: 'short',
    context: { instructorName: SECRET_NAME, framework: SECRET_FRAMEWORK, period: '', menteeCount: '', centralGoals: '' },
    answers: {
      q1: { goalAchievement: 'partial', implementationPercent: '65', evidence: SECRET_TEXT },
      q7: { independence: 'partial', continuesWithoutDependency: 'no', evidence: SECRET_TEXT },
    },
    post: { oneThing: '', feeling: '', nextCheck: '' },
    savedAt: '2026-01-06T10:00:00.000Z',
  },
  history: [],
};

/** Writes n valid signal packs to a temp dir and returns their paths. */
function writePacks(dir: string, count: number) {
  fs.mkdirSync(dir, { recursive: true });
  return Array.from({ length: count }, (_, i) => {
    const file = path.join(dir, `pack-${i}.json`);
    fs.writeFileSync(file, JSON.stringify({
      schema: 'mati-organizational-pack-v1',
      exportedAt: '2026-02-01T10:00:00.000Z',
      contributorId: `contributor-000${i}`,
      contextId: `RGV-0${i}`,
      periodId: '2026-01',
      signals: [
        { key: 'goal_attainment', stage: 2, value: 'partial', confidence: 'high', projection: 'aggregate_only', operationalImpact: 'high' },
        { key: 'resource_allocation', stage: 2, value: 'no', confidence: 'high', projection: 'aggregate_only', operationalImpact: 'high' },
      ],
    }, null, 2));
    return file;
  });
}

test('the exported signal pack carries measures and nothing the instructor wrote', async ({ page }) => {
  await seed(page, STORAGE_KEY, answeredState);
  await page.goto('/');
  await nav(page, 'מה למדנו');

  await page.locator('.signalExport input').fill('RGV-07');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('.signalExport button').click(),
  ]);

  const raw = fs.readFileSync(await download.path(), 'utf8');
  const pack = JSON.parse(raw);

  expect(download.suggestedFilename()).toMatch(/^mati-signal-\d{4}-\d{2}\.json$/);
  expect(Object.keys(pack).sort()).toEqual(
    ['contextId', 'contributorId', 'exportedAt', 'periodId', 'schema', 'signals'],
  );
  expect(pack.signals.map((s: { key: string }) => s.key)).toContain('goal_attainment');

  for (const secret of [SECRET_NAME, SECRET_FRAMEWORK, SECRET_TEXT, savedPlan.smartGoal, savedPlan.audience]) {
    expect(raw, `"${secret}" must never leave the device`).not.toContain(secret);
  }
});

test('export stays disabled until an anonymous framework code is entered', async ({ page }) => {
  await seed(page, STORAGE_KEY, answeredState);
  await page.goto('/');
  await nav(page, 'מה למדנו');

  const button = page.locator('.signalExport button');
  await expect(button).toBeDisabled();
  await page.locator('.signalExport input').fill('אב');
  await expect(button).toBeDisabled();
  await page.locator('.signalExport input').fill('RGV-07');
  await expect(button).toBeEnabled();
});

test('the console re-imports the same files after a clear', async ({ page }, testInfo) => {
  // Regression: the file input kept its selection, so choosing the same packs
  // again never fired onChange and nothing was imported.
  const files = writePacks(path.join(os.tmpdir(), `mati-e2e-${testInfo.workerIndex}-reimport`), 5);
  await page.goto('/org');

  const contributors = page.locator('section[aria-label="היקף הנתונים"] div').first().locator('b');
  await page.setInputFiles('input[type=file]', files);
  await expect(contributors).toHaveText('5');

  await page.locator('button', { hasText: 'ניקוי' }).click();
  await expect(contributors).toHaveText('0');

  await page.setInputFiles('input[type=file]', files);
  await expect(contributors).toHaveText('5');
});

test('overlapping imports do not lose packs', async ({ page }, testInfo) => {
  // Regression: importFiles is async and read `packs` from its closure, so an
  // import resolving after another one merged onto a stale list.
  const files = writePacks(path.join(os.tmpdir(), `mati-e2e-${testInfo.workerIndex}-race`), 5);
  await page.goto('/org');

  const contributors = page.locator('section[aria-label="היקף הנתונים"] div').first().locator('b');
  await Promise.all([
    page.setInputFiles('input[type=file]', files.slice(0, 3)),
    page.setInputFiles('input[type=file]', files.slice(3)),
  ]);
  await expect(contributors).toHaveText('5');
});

test('the privacy floor hides patterns below the cohort size', async ({ page }, testInfo) => {
  const dir = path.join(os.tmpdir(), `mati-e2e-${testInfo.workerIndex}-floor`);
  const files = writePacks(dir, 5);
  await page.goto('/org');

  // Driven off the constant rather than a literal: the floor moved from 5 to 3
  // on 2026-08-18 and this assertion silently encoded the old value.
  await page.setInputFiles('input[type=file]', files.slice(0, MIN_AGGREGATE_COHORT - 1));
  await expect(page.locator('text=רצפת פרטיות פעילה')).toBeVisible();
  await expect(page.locator('article').filter({ hasText: 'השגת מטרות' })).toHaveCount(0);

  await page.setInputFiles('input[type=file]', files);
  await expect(page.locator('text=רצפת פרטיות פעילה')).toHaveCount(0);
  await expect(page.locator('article').filter({ hasText: 'השגת מטרות' }).first()).toBeVisible();
});

test('the console rejects a malformed pack and names the file', async ({ page }, testInfo) => {
  const dir = path.join(os.tmpdir(), `mati-e2e-${testInfo.workerIndex}-bad`);
  fs.mkdirSync(dir, { recursive: true });
  const smuggled = path.join(dir, 'smuggled.json');
  fs.writeFileSync(smuggled, JSON.stringify({
    schema: 'mati-organizational-pack-v1', exportedAt: '2026-02-01T10:00:00.000Z',
    contributorId: 'contributor-0001', contextId: 'RGV-01', periodId: '2026-01',
    note: SECRET_TEXT,   // an extra key carrying free text
    signals: [],
  }));
  const unparseable = path.join(dir, 'broken.json');
  fs.writeFileSync(unparseable, '{ not json');

  await page.goto('/org');
  await page.setInputFiles('input[type=file]', [smuggled, unparseable]);

  await expect(page.locator('text=smuggled.json: מבנה או ערכים לא תקינים')).toBeVisible();
  await expect(page.locator('text=broken.json: לא ניתן לקרוא JSON')).toBeVisible();
  await expect(page.locator('section[aria-label="היקף הנתונים"] div').first().locator('b')).toHaveText('0');
});

test('the aggregate report downloads and asserts no causality', async ({ page }, testInfo) => {
  const files = writePacks(path.join(os.tmpdir(), `mati-e2e-${testInfo.workerIndex}-agg`), 5);
  await page.goto('/org');
  await page.setInputFiles('input[type=file]', files);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('button', { hasText: 'ייצוא דוח מצטבר' }).click(),
  ]);
  const report = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));

  expect(report.schema).toBe('mati-organizational-aggregate-v1');
  expect(report.privacyFloor).toBe(MIN_AGGREGATE_COHORT);
  expect(report.cohort).toEqual({ contributors: 5, contexts: 5, periods: 1 });
  expect(report.patterns.every((p: { mayAssertCausality: boolean }) => p.mayAssertCausality === false)).toBe(true);
});
