import { expect, test } from '@playwright/test';
import { LEGACY_KEY, nav, readStored, savedPlan, seed, STORAGE_KEY } from './fixtures';

test('a v1 save is readable by every surface, not just the form page', async ({ page }) => {
  // Regression: the shells used to read only the v2 key with a shallow merge, so a
  // v1 browser saw an empty state until the form page happened to rewrite storage.
  await seed(page, LEGACY_KEY, {
    plan: savedPlan,
    formative: { route: 'short', answers: { q1: 'טקסט ישן על יעדים' } },
    history: [{ at: '2026-01-05T10:00:00.000Z', stage: 1, label: 'תוכנית עבודה נשמרה', note: 'מטרה' }],
  });
  await page.goto('/');

  await expect(page.locator('.knownFacts div').filter({ hasText: 'תוכנית עבודה' }).locator('dd')).toHaveText('שמורה');
  await expect(page.locator('.knownFacts div').filter({ hasText: 'נקודות דרך' }).locator('dd')).toHaveText('1');

  await nav(page, 'המסע שלי');
  await expect(page.locator('.journeyEntry')).toHaveCount(1);

  // The rewrite to the v2 key happens when the form page mounts; the v1 free text
  // must land in the field that replaced it rather than being dropped.
  await nav(page, 'עבודה');
  await expect.poll(async () => (await readStored(page)).formative?.answers?.q1?.evidence)
    .toBe('טקסט ישן על יעדים');
});

test('the context ribbon reacts to a closed-choice answer, not only to typing', async ({ page }) => {
  // Regression: scales and option groups are <button>s and emit neither input nor
  // change, so the ribbon used to stay silent until the next keystroke.
  await seed(page, STORAGE_KEY, { plan: savedPlan, history: [] });
  await page.goto('/');
  await nav(page, 'עבודה');
  await page.locator('.stageStrip button').nth(1).click();
  await page.locator('.routePicker button', { hasText: 'מסלול מלא' }).click();

  const visible = page.locator('.view-work .assessmentSection:not([hidden])');
  await expect(visible).toHaveCount(1);

  // Fact one: a typed percentage, which does emit an input event.
  await expect(visible).toContainText('עמידה ביעדים');
  await visible.locator('input').first().fill('90');

  // The ribbon may be absent or showing something else; either way it must not
  // report the gap yet, because only one of the two facts is in.
  await expect(page.locator('.contextRibbonMain strong', { hasText: 'פער ששווה לעצור' })).toHaveCount(0);

  // Fact two: reached through the stepper the way an instructor would, so the
  // work session is not fighting an externally unhidden section.
  for (let step = 0; step < 9; step += 1) {
    if (await visible.filter({ hasText: 'מדדים לסיום התהליך' }).count()) break;
    await page.locator('.workSessionPrimary').click();
    await expect(visible).toHaveCount(1);
  }
  await expect(visible).toContainText('מדדים לסיום התהליך');
  await visible.locator('.optionGroup button').first().click();   // independence = none

  await expect(page.locator('.contextRibbonMain strong'))
    .toHaveText('יש כאן פער ששווה לעצור עליו לפני שממשיכים.');
});

test('the work session shows exactly one part at a time across a route switch', async ({ page }) => {
  await seed(page, STORAGE_KEY, { plan: savedPlan, history: [] });
  await page.goto('/');
  await nav(page, 'עבודה');
  await page.locator('.stageStrip button').nth(1).click();

  const sections = page.locator('.view-work .assessmentSection');
  const visible = page.locator('.view-work .assessmentSection:not([hidden])');

  await expect(sections).toHaveCount(5);
  await expect(visible).toHaveCount(1);

  await page.locator('.routePicker button', { hasText: 'מסלול מלא' }).click();
  await expect(sections).toHaveCount(9);
  await expect(visible).toHaveCount(1);

  await page.locator('.routePicker button', { hasText: 'מסלול ממוקד' }).click();
  await expect(sections).toHaveCount(5);
  await expect(visible).toHaveCount(1);
});

test('saving a plan opens stage 2 and records a checkpoint', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await nav(page, 'עבודה');

  const show = () => page.evaluate(() =>
    document.querySelectorAll<HTMLElement>('.view-work .formSection').forEach((el) => { el.hidden = false; }));
  const fill = async (label: string, value: string) => {
    await show();
    await page.locator('.field', { hasText: label }).locator('input').first().fill(value);
  };
  await fill('מי צוותי המוקד', savedPlan.audience);
  await fill('מטרת SMART אחת', savedPlan.smartGoal);
  await fill('מדד הצלחה 1', savedPlan.metric1);
  await fill('מדד הצלחה 2', savedPlan.metric2);
  await fill('מסגרת זמן גסה', savedPlan.timeframe);
  await page.locator('.view-work .actions .primary').click();

  await expect(page.locator('.view-work .notice p')).toContainText('התוכנית נשמרה');
  await expect.poll(async () => Boolean((await readStored(page)).plan?.savedAt)).toBe(true);

  await page.locator('.stageStrip button').nth(1).click();
  await expect(page.locator('.view-work .sectionHead .kicker').first()).toHaveText('שלב 2 · הערכה מעצבת');

  await nav(page, 'היום');
  await expect(page.locator('.knownFacts div').filter({ hasText: 'נקודות דרך' }).locator('dd')).toHaveText('1');
  expect(errors).toEqual([]);
});

test('stage 2 stays locked until a plan is actually saved', async ({ page }) => {
  await page.goto('/');
  await nav(page, 'עבודה');
  // The locked stage button is a real actionable button (no aria-disabled) so it
  // can explain what is missing — see finding N2 in the review.
  await page.locator('.stageStrip button').nth(1).click();
  await expect(page.locator('.view-work .notice p')).toContainText('צריך קודם תוכנית עבודה שמורה');
  await expect(page.locator('.view-work .assessmentSection')).toHaveCount(0);
});

test('editing a field on a saved plan does not silently re-lock stage 2', async ({ page }) => {
  // Regression (finding 8): every plan/context/answer updater cleared savedAt on
  // each keystroke, so fixing a typo in an already-saved plan re-locked stage 2
  // with no indication why. planReady still gates a genuinely incomplete field.
  await seed(page, STORAGE_KEY, { plan: savedPlan, history: [] });
  await page.goto('/');
  await nav(page, 'עבודה');

  // WorkSessionLayer computes its initial section asynchronously: for an
  // already-complete plan it starts at index 0 and then jumps to the last
  // section a beat later, re-hiding whatever was force-unhidden in between.
  // toPass() re-applies the unhide until a fill actually sticks.
  const audienceField = page.locator('.field', { hasText: 'מי צוותי המוקד' }).locator('input').first();
  await expect(async () => {
    await page.evaluate(() =>
      document.querySelectorAll<HTMLElement>('.view-work .formSection').forEach((el) => { el.hidden = false; }));
    await audienceField.fill(`${savedPlan.audience} (תוקן)`, { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await expect.poll(async () => Boolean((await readStored(page)).plan?.savedAt)).toBe(true);

  await page.locator('.stageStrip button').nth(1).click();
  await expect(page.locator('.view-work .sectionHead .kicker').first()).toHaveText('שלב 2 · הערכה מעצבת');

  // Emptying a required field must still close the gate — this is not a blanket
  // "never re-lock", only "don't re-lock just because something was typed".
  await nav(page, 'עבודה');
  await page.locator('.stageStrip button').first().click();
  await expect(async () => {
    await page.evaluate(() =>
      document.querySelectorAll<HTMLElement>('.view-work .formSection').forEach((el) => { el.hidden = false; }));
    await audienceField.fill('', { timeout: 500 });
  }).toPass({ timeout: 5000 });
  // Wait for the cleared field to actually reach storage before judging the
  // gate on it — savedAt itself must stay untouched (fix for finding 8).
  await expect.poll(async () => (await readStored(page)).plan?.audience).toBe('');
  // savedAt only clears on explicit save — must stay true here.
  await expect.poll(async () => Boolean((await readStored(page)).plan?.savedAt)).toBe(true);
  await page.locator('.stageStrip button').nth(1).click();
  await expect(page.locator('.view-work .notice p')).toContainText('צריך קודם תוכנית עבודה שמורה');
});
