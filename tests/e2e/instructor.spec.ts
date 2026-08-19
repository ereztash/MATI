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
  // The locked stage button carries aria-disabled but is still meant to be
  // clicked, so it can explain what is missing. force is needed to click past
  // Playwright's actionability check — see the accessibility note in the review.
  await page.locator('.stageStrip button').nth(1).click({ force: true });
  await expect(page.locator('.view-work .notice p')).toContainText('צריך קודם תוכנית עבודה שמורה');
  await expect(page.locator('.view-work .assessmentSection')).toHaveCount(0);
});

test('adjusting a personal-Gantt milestone never clears savedAt, and reset returns to the suggested date', async ({ page }) => {
  // Regression: updatePlan() always clears savedAt (that is correct for a
  // real plan edit — it un-saves a plan whose substance changed). Reusing
  // it for a Gantt date nudge would make planSaved() go false and the
  // entire Gantt/Mirror section — including the control just clicked —
  // vanish on the very first adjustment. The nudge must go through a
  // setter that leaves savedAt untouched.
  await seed(page, STORAGE_KEY, {
    plan: { ...savedPlan, nextSmallStep: 'לשוחח עם מורה אחת השבוע', timeframe: 'ספטמבר–ינואר, אחת לשבועיים' },
    history: [],
  });
  await page.goto('/');
  await nav(page, 'עבודה');

  const row = page.locator('.ganttLegendAdjust').first();
  await expect(row).toBeVisible();
  await row.locator('summary').click();
  await row.locator('button', { hasText: 'יום הבא' }).click();

  await expect.poll(async () => (await readStored(page)).plan?.savedAt).toBe(savedPlan.savedAt);
  await expect.poll(async () => (await readStored(page)).plan?.smallStepDate).not.toBe('');
  // The Gantt section itself must still be there — this is what a savedAt
  // regression would actually break, not just the stored field.
  await expect(page.locator('.personalGantt')).toBeVisible();
  // The cadence phrase in the seeded timeframe should have been picked up too.
  await expect(page.locator('.ganttCadenceNote')).toContainText('אחת לשבועיים');

  await row.locator('.ganttReset').click();
  await expect.poll(async () => (await readStored(page)).plan?.smallStepDate).toBe('');
});

test('clicking through an empty plan via the work-session wizard explains why, instead of silently doing nothing', async ({ page }) => {
  // Regression: the wizard's finish button finds the real save button by
  // querying `.actions .primary` — a button that only exists in the DOM once
  // planReady() holds. Clicking "הבא" through empty parts used to reach
  // "שמירה ומה למדנו" on part 3, find no button to click, and fall through to
  // openInsight(): no save, no error, a silent jump to a view that says
  // "not enough evidence yet" as if the click had done nothing at all. This
  // is exactly the wizard path a real instructor uses — the happy-path test
  // above bypasses it entirely via a direct `hidden = false`, which is why
  // 103 unit tests and every other e2e test passed while this was live.
  await page.goto('/');
  await nav(page, 'עבודה');

  // "הבא" through part 1 and part 2 with nothing filled in either.
  await page.locator('.workSessionPrimary').click();
  await page.locator('.workSessionPrimary').click();
  // Part 3's last click is labelled "שמירה ומה למדנו", not "הבא".
  await expect(page.locator('.workSessionPrimary')).toHaveText('שמירה ומה למדנו');
  await page.locator('.workSessionPrimary').click();

  // Must stay put and explain what's missing — never silently navigate away.
  await expect(page.locator('.experienceShell')).toHaveClass(/view-work/);
  await expect(page.locator('.view-work .workExperience .saveWhen')).toBeVisible();
  await expect.poll(async () => (await readStored(page)).plan?.savedAt).toBeUndefined();
});

test('deleting local data takes two real clicks and names what is actually at stake', async ({ page }) => {
  // Regression: a chaos-testing run (gremlins.js) found that a single native
  // confirm() with a generic message doesn't distinguish a real saved year
  // from an empty session, and gets auto-accepted by any tool (or accidental
  // rapid-click sequence) that dismisses browser dialogs. Fixed by dropping
  // confirm() entirely for an in-app two-step disclosure that names the
  // actual stakes — this test drives both states through the real UI.
  const dialogs: string[] = [];
  page.on('dialog', (d) => dialogs.push(d.message())); // must never fire — nothing to accept

  await seed(page, STORAGE_KEY, { plan: savedPlan, history: [{ at: '2026-01-05T10:00:00.000Z', stage: 1, label: 'תוכנית עבודה נשמרה', note: '' }] });
  await page.goto('/');
  await nav(page, 'עבודה');

  const trigger = page.locator('.deleteLocal > summary');
  await trigger.click();
  await expect(page.locator('.deleteLocalPanel p')).toContainText('תוכנית עבודה שמורה');
  await expect(page.locator('.deleteLocalPanel p')).toContainText('נקודת דרך אחת בהיסטוריה');

  // Opening the panel must not, by itself, delete anything.
  await expect.poll(async () => (await readStored(page)).plan?.savedAt).toBe(savedPlan.savedAt);

  await page.locator('.deleteLocalConfirm').click();
  await expect(page.locator('.notice p')).toContainText('המידע המקומי נמחק');
  await expect.poll(async () => (await readStored(page)).plan?.savedAt).toBeUndefined();
  expect(dialogs).toEqual([]);
});
