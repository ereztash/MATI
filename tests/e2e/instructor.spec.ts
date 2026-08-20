import { expect, test } from '@playwright/test';
import { atDate, IN_CALENDAR_GAP, IN_STAGE_1, IN_STAGE_2, LEGACY_KEY, nav, readStored, savedPlan, seed, STORAGE_KEY } from './fixtures';

// Pin the calendar for every test here. Most of these specs reach for Stage 1
// fields, the Gantt or the stage strip, none of which exist in Dec–Feb, May–Jun
// or the four gap months — so without this the suite silently depends on which
// month CI runs in and turns red on 1 October. Tests about other months call
// atDate again to override.
test.beforeEach(async ({ page }) => { await atDate(page, IN_STAGE_1); });

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
  //
  // The wait is the assertion. The context engine is driven by a 180ms debounce
  // (app/context-layer.tsx), and a bare toHaveCount(0) here is satisfied on its
  // first poll — measured, the ribbon is still displaying its PRE-fill sentence
  // for ~200ms after fill() returns, so the check was reading the state from
  // before the input it had just made and would have passed against an
  // implementation that reports the gap on one fact. Waiting past the debounce
  // and then asserting the ribbon has actually reacted (its previous headline
  // is gone) is what makes the absence below mean anything.
  await page.waitForTimeout(500);
  await expect(page.locator('.contextRibbonMain strong')).toHaveCount(0);
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
  // force is right here and not a smell: a locked stage carries aria-disabled
  // rather than the disabled attribute precisely so it stays clickable and can
  // say what is missing. Playwright's actionability check refuses aria-disabled
  // elements; a real mouse is not so principled. Whether the button is
  // physically reachable at all is a separate question, tested below.
  await page.locator('.stageStrip button').nth(1).click({ force: true });
  await expect(page.locator('.view-work .notice p')).toContainText('צריך קודם תוכנית עבודה שמורה');
  await expect(page.locator('.view-work .assessmentSection')).toHaveCount(0);
});

test('the work-session bar does not cover the stage strip', async ({ page }) => {
  // Regression, and the reason the test above is allowed to use force. The
  // sticky .workSessionBar is rendered before the header in the DOM, so the
  // header scrolled underneath it: measured on desktop and on a Pixel 7,
  // elementFromPoint at the centre of all three stage buttons returned the bar
  // (or its children), i.e. stage navigation was entirely unclickable for a
  // real user. Every directed test clicked with force, so none of them saw it.
  // A short viewport on purpose. At the default 1280x800 the work view is only
  // ~110px taller than the window, so the strip and the bar never scroll close
  // enough to reach each other and the check passes without testing anything.
  // 412x480 is a real phone with the browser chrome and keyboard-adjacent UI
  // showing, and it is where the overlap band actually lives.
  await page.setViewportSize({ width: 412, height: 480 });
  await seed(page, STORAGE_KEY, { plan: savedPlan, history: [] });
  await page.goto('/');
  await nav(page, 'עבודה');
  await expect(page.locator('.workSessionBar')).toBeVisible();

  const range = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const problems: string[] = [];
  const checked: Record<string, number> = { stage: 0, 'next/save': 0, prev: 0 };
  let positions = 0;
  let deepest = 0;

  // One scroll per round trip, deliberately. Doing the whole sweep inside a
  // single page.evaluate is the obvious way to write this and it silently does
  // nothing: window.scrollTo inside one synchronous evaluate never takes
  // effect, so scrollY stays put and every iteration re-measures the same
  // position. An earlier version of this test did exactly that and passed
  // against a build with the bug still in it.
  for (let y = 0; y <= range; y += 30) {
    await page.evaluate((target) => window.scrollTo({ top: target, behavior: 'instant' }), y);
    const step = await page.evaluate(() => {
      const found: string[] = [];
      const seen: string[] = [];
      const topbar = document.querySelector('.experienceTopbar')!.getBoundingClientRect().height;
      const targets = [['.stageStrip button', 'stage'], ['.workSessionPrimary', 'next/save'], ['.workSessionSecondary', 'prev']];
      for (const [selector, label] of targets) {
        const element = document.querySelector(selector);
        if (!element) continue;
        const box = element.getBoundingClientRect();
        // Only counted while at least half visible below the topbar: something
        // scrolled off screen is not a target anyone is trying to hit.
        const visible = Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, topbar));
        if (visible / box.height < 0.5) continue;
        seen.push(label);
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        if (!element.contains(hit)) found.push(`${label} blocked by ${hit?.className || hit?.tagName}`);
      }
      return { found, seen, scrollY: Math.round(window.scrollY) };
    });
    positions += 1;
    deepest = Math.max(deepest, step.scrollY);
    for (const label of step.seen) checked[label] += 1;
    for (const problem of step.found) problems.push(`@${step.scrollY} ${problem}`);
  }

  // Checked in both directions. Settling this with z-index instead of DOM order
  // simply moved the problem: on the committed build this sweep reports the
  // strip covering the bar's own הקודם/הבא at scrollY 240 and 270.
  expect(problems).toEqual([]);

  // And the sweep has to have actually swept. Both of the failure modes above —
  // a no-op scroll, and a viewport too tall to have a scroll range — leave an
  // empty problems list that reads as success, so the movement is asserted
  // rather than assumed.
  expect(range).toBeGreaterThan(400);
  expect(deepest).toBeGreaterThan(400);
  expect(checked['next/save']).toBe(positions);
  expect(checked.prev).toBe(positions);
});

test('the first keystroke after deleting local data is still saved', async ({ page }) => {
  // Regression: the delete handler set a "skip the next autosave" flag so the
  // key it had just removed would not be re-created a render later. On a visit
  // where the state was already the empty state, setState(emptyState) was an
  // Object.is no-op, the effect never ran, and the flag survived to swallow the
  // next real keystroke instead — one character silently unsaved, on a page
  // whose header promises "הטיוטה נשמרת אוטומטית".
  await page.goto('/');
  await nav(page, 'עבודה');
  await page.locator('.deleteLocal summary').click();
  await page.locator('.deleteLocalConfirm').click();
  await expect.poll(async () => page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

  await page.locator('.field', { hasText: 'מי צוותי המוקד' }).locator('input').fill('א');
  await expect.poll(async () => (await readStored(page)).plan?.audience).toBe('א');
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

test('the home screen asks which stage you are in during a calendar gap, instead of asserting one', async ({ page }) => {
  // Regression: ExperienceShell defaulted activeStage to 1 whenever neither
  // a manual choice nor stageFromDate() had an answer — which during a real
  // gap month (Oct/Nov/Mar/Apr, verified live with page.clock across all
  // four) meant confidently opening on "את בשלב תכנון" even though
  // stageFromDate() deliberately returns null there specifically so nothing
  // has to guess. page.tsx's own work view already refuses to invent a stage
  // in this exact situation; the home view — the first screen she sees —
  // silently did the opposite. Fixed by asking instead, same copy and
  // pattern as the existing gapShell screen.
  await atDate(page, IN_CALENDAR_GAP);
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('באיזה שלב בלוח השנה את נמצאת?');
  await expect(page.locator('.gapOptions button')).toHaveCount(3);

  // This test used to click straight through to stage 2 on an empty state and
  // assert it was accepted — codifying the bug it was written next to. The
  // picker wrote manualStage with no canOpenStage check, so it could put a
  // first-time user on the summative screen over an empty plan while the stage
  // strip rendered that same stage as aria-current AND aria-disabled at once.
  await page.locator('.gapOptions button', { hasText: 'הערכה מעצבת' }).click({ force: true });
  await expect(page.locator('.gapNotice')).toContainText('צריך קודם תוכנית עבודה שמורה');
  await expect(page.locator('h1')).toHaveText('באיזה שלב בלוח השנה את נמצאת?');
  expect(await readStored(page)).not.toHaveProperty('gapStage');

  // Stage 1 is always open, so that answer is taken — and recorded as a gap
  // answer rather than as manualStage, which SessionStageReset wipes on load.
  await page.locator('.gapOptions button', { hasText: 'תכנון' }).click();
  await expect(page.locator('h1')).toContainText('את בשלב תכנון');
  await expect.poll(async () => (await readStored(page)).gapStage?.stage).toBe(1);

  // The answer has to outlive a reload, or the question is re-asked on every
  // single visit for the four months a year the calendar has no answer.
  await page.reload();
  await expect(page.locator('h1')).toContainText('את בשלב תכנון');
});

test('a stage chosen during a gap stops applying once a real window opens', async ({ page }) => {
  // The mirror of the test above. Storing the gap answer as `manualStage` made
  // it both too short-lived (wiped on reload) and too long-lived: nothing
  // expired it, so a stage picked in November was still asserted in December —
  // the confident wrong assertion the gap screen exists to prevent.
  await atDate(page, IN_CALENDAR_GAP);
  await page.goto('/');
  await page.locator('.gapOptions button', { hasText: 'תכנון' }).click();
  await expect(page.locator('h1')).toContainText('את בשלב תכנון');

  await atDate(page, IN_STAGE_2);
  await page.reload();
  await expect(page.locator('h1')).toContainText('את בשלב הערכה מעצבת');
});

test('a real month is never shown the gap picker', async ({ page }) => {
  await atDate(page, IN_STAGE_2);
  await page.goto('/');
  await expect(page.locator('.gapOptions button')).toHaveCount(0);
  await expect(page.locator('h1')).toContainText('הערכה מעצבת');
});

test('a change made in another tab surfaces here instead of being silently overwritten', async ({ page, context }) => {
  // Regression: two tabs sharing one plan have no merge — this tab's own
  // next write replaces the whole stored object with whatever it last held
  // in memory, silently erasing a field the other tab just changed, with no
  // warning in either tab (confirmed live with two real pages before this
  // fix existed). The native `storage` event fires only in *other* tabs,
  // which is exactly the signal used here — this does not solve merging
  // (that belongs with the parked R3/R7/R10 persistence work) but it does
  // mean it's never silent.
  await seed(page, STORAGE_KEY, { plan: savedPlan, history: [] });
  await page.goto('/');
  await nav(page, 'עבודה');
  await expect(page.locator('.notice')).toHaveCount(0);

  const otherTab = await context.newPage();
  await otherTab.goto('/');
  // The writing tab must be on the work view BEFORE it writes, or this proves
  // nothing: `.noticeWarn` is rendered only by page.tsx's Home, which
  // ExperienceShell mounts only under view === 'work'. Asserting its absence
  // on the home view — or after navigating there afterwards, which mounts a
  // fresh Home with its state reset — cannot fail for any implementation.
  await nav(otherTab, 'עבודה');

  // Merely opening a second tab must NOT raise the alarm. SessionStageReset
  // rewrites the key on every load to strip manualStage, which at the
  // StorageEvent level is indistinguishable from an edit — so this used to
  // warn that her work was about to be overwritten when nothing of hers had
  // changed, and a warning that fires on a non-event is one she learns to
  // ignore, which costs the case it exists for.
  await otherTab.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key) ?? '{}');
    s.manualStage = 2;
    localStorage.setItem(key, JSON.stringify(s));
  }, STORAGE_KEY);
  // A real wait, not a bare toHaveCount(0): a zero-count assertion is satisfied
  // on its first poll, microseconds after evaluate() returns and before the
  // cross-process StorageEvent could possibly have landed — so it would pass
  // against an implementation that warns on every write.
  await page.waitForTimeout(500);
  await expect(page.locator('.noticeWarn')).toHaveCount(0);

  await otherTab.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key) ?? '{}');
    s.plan.flexibility = 'שונה מטאב אחר';
    localStorage.setItem(key, JSON.stringify(s));
  }, STORAGE_KEY);

  await expect(page.locator('.noticeWarn p')).toContainText('התוכנית עודכנה בטאב אחר');
  // The tab that made the change is not told anything about its own write —
  // now a real check, because Home has been mounted there throughout.
  await expect(otherTab.locator('.noticeWarn')).toHaveCount(0);
  await otherTab.close();
});

test('a blocked or full store degrades to a notice, not a crash', async ({ page }) => {
  // Regression, and the most severe finding of this pass: a full/blocked
  // localStorage (Safari private browsing enforces a zero quota, so even
  // the first write throws QuotaExceededError) used to escape uncaught from
  // page.tsx's persistence effect on every keystroke. Confirmed live before
  // this fix: it didn't just fail to save — the tab's renderer actually
  // crashed (Chromium's own "This page couldn't load" screen), because the
  // effect re-fires and re-throws on every character typed. A caught write
  // can only fail to persist, which she is now actually told.
  await page.goto('/');
  await nav(page, 'עבודה');
  await page.evaluate(() => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'mati-v2') throw new DOMException('quota exceeded', 'QuotaExceededError');
      return real.call(this, key, value);
    };
  });

  const field = page.locator('.field', { hasText: 'מי צוותי המוקד' }).locator('input');
  await field.fill('טקסט בזמן שהאחסון חסום');

  await expect(page.locator('.notice p')).toContainText('לא הצלחתי לשמור באופן אוטומטי');
  // The tab must still be alive and usable — not the browser's own crash page.
  await expect(field).toHaveValue('טקסט בזמן שהאחסון חסום');
});
