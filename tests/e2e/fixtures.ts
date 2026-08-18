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

export const nav = (page: Page, label: string) => page.click(`.experienceNav button:has-text("${label}")`);

export const readStored = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('mati-v2') ?? '{}'));
