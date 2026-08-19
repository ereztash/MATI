import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { nav, savedPlan, seed, STORAGE_KEY } from './fixtures';

/**
 * A real axe-core scan, not a hand-picked checklist — found three distinct,
 * confirmed issues in one pass (2026-08-19): color-contrast on .saveWhen
 * (introduced the same day, missed because nothing had looked), an invalid
 * aria-label on a bare div (aria-prohibited-attr — role="generic" does not
 * permit it), and a work-view heading structure with no <h1> at all, then a
 * jump straight to <h3>/<h4> once one was added. All three fixed; asserted
 * here by name so they can't drift back silently.
 *
 * color-contrast is deliberately NOT asserted zero here: it is a real,
 * confirmed, pre-existing gap in --muted against light backgrounds across
 * dozens of nodes app-wide (see docs/MARKET_READINESS.md) — fixing it
 * properly means a design decision on the replacement color with visual
 * sign-off, not an automated swap. Asserting it away here would either mask
 * that decision being skipped or make this test fail on every unrelated
 * future page.tsx change that happens to touch --muted text.
 */
function ruleIds(violations: { id: string }[]) {
  return violations.map((v) => v.id);
}

test('Stage 1 has no aria-prohibited-attr, heading-order, or missing-h1 violations', async ({ page }) => {
  await seed(page, STORAGE_KEY, { plan: savedPlan, history: [{ at: '2026-01-05T10:00:00.000Z', stage: 1, label: 'x', note: '' }] });
  await page.goto('/');
  await nav(page, 'עבודה');

  const results = await new AxeBuilder({ page }).analyze();
  const ids = ruleIds(results.violations);
  expect(ids).not.toContain('aria-prohibited-attr');
  expect(ids).not.toContain('heading-order');
  expect(ids).not.toContain('page-has-heading-one');

  // The Gantt only renders with a saved plan — this is the surface that had
  // the aria-prohibited-attr finding, so it has to actually be on screen.
  await expect(page.locator('.ganttTrack')).toBeVisible();
  await expect(page.locator('.ganttTrack')).toHaveAttribute('role', 'img');
});

test('every stage opens with exactly one h1, and nothing after it skips a level', async ({ page }) => {
  await seed(page, STORAGE_KEY, { plan: savedPlan, history: [] });
  await page.goto('/');
  await nav(page, 'עבודה');

  for (const label of ['תכנון', 'הערכה מעצבת', 'הערכה מסכמת']) {
    await page.locator('.stageStrip button', { hasText: label }).click({ force: true });
    // Exactly one *visible* h1 — not a raw DOM count. page.tsx's own legacy
    // .welcomeBlock heading ("שלום, כאן עוצרות...") is still in the DOM
    // alongside the stage-specific one added here, correctly hidden from
    // assistive tech (axe's page-has-heading-one/heading-order both ignore
    // it, same as a screen reader would) — a pre-existing duplicate worth a
    // cleanup pass on its own, not a live accessibility violation, so this
    // asserts what a screen reader user actually encounters.
    await expect(page.locator('h1:visible')).toHaveCount(1);
    const ids = ruleIds((await new AxeBuilder({ page }).analyze()).violations);
    expect(ids, `${label} should not have a heading-order violation`).not.toContain('heading-order');
  }
});
