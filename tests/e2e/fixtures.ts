import { Page } from '@playwright/test';

export const STORAGE_KEY = 'mati-v2';
export const LEGACY_KEY = 'mati-v1';

export const savedPlan = {
  audience: '8 מחנכות כיתות א׳–ב׳',
  smartGoal: 'להעלות שימוש בהתאמות',
  metric1: 'תצפיות בכיתה',
  metric2: 'משוב מורים',
  timeframe: 'ספטמבר–ינואר',
  flexibility: '', managers: '', independence: '', nextSmallStep: '', identityFit: '', confidenceNeed: '',
  smallStepDate: '', managerTouchDate: '', flexibilityCheckDate: '',
  savedAt: '2026-01-05T10:00:00.000Z',
};

/** Seeds storage before any app script runs, so the app hydrates from it. */
export async function seed(page: Page, key: string, state: unknown) {
  await page.addInitScript(([k, s]) => {
    localStorage.removeItem('mati-v2');
    localStorage.removeItem('mati-v1');
    localStorage.setItem(k as string, JSON.stringify(s));
  }, [key, state] as [string, unknown]);
}

/**
 * Dates the suite pins itself to, so which stage the app opens on is never the
 * month CI happens to run in.
 *
 * Without this, most of these tests only pass between July and September:
 * `stageFromDate` returns 2 in Dec–Feb, 3 in May–Jun and null in the four gap
 * months, so a spec that reaches for a Stage 1 field, `.ganttTrack` or
 * `.stageStrip` goes red on 1 October with no code change at all.
 *
 * `setFixedTime`, not `install`: install also replaces setTimeout/setInterval
 * and does not advance them on its own, which would freeze the 180ms/220ms
 * debounces this app's context ribbon and work-session bar are driven by.
 */
export const IN_STAGE_1 = new Date('2026-08-15T10:00:00');
export const IN_STAGE_2 = new Date('2026-12-15T10:00:00');
export const IN_CALENDAR_GAP = new Date('2026-10-15T10:00:00');

/** Call before `goto`, or the first render still reads the real clock. */
export const atDate = (page: Page, when: Date) => page.clock.setFixedTime(when);

export const nav = (page: Page, label: string) => page.click(`.experienceNav button:has-text("${label}")`);

export const readStored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('mati-v2') ?? '{}'));
