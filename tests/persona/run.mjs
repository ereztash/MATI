/**
 * Persona journey runner.
 *
 * Deliberately NOT an e2e test. The e2e suite knows every selector, so it can
 * only prove that a path exists — never that a person can find it. Here the
 * only actions available are the ones a human has: tap something whose text is
 * visible on screen, type into a field identified by its visible label, scroll,
 * or give up. There is no selector vocabulary on purpose.
 *
 * A step that cannot find its target is not a broken test. It is the finding:
 * she looked for that and it was not there.
 *
 * Usage: node run.mjs '<json steps array>'
 */
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';

const OUT = process.env.PERSONA_OUT || '/tmp/persona';
const URL = process.env.PERSONA_URL || 'http://127.0.0.1:3215';
fs.mkdirSync(OUT, { recursive: true });
const steps = JSON.parse(process.argv[2] || '[]');
const seedState = process.env.PERSONA_SEED || '';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'he-IL' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
if (seedState) await page.addInitScript(s => localStorage.setItem('mati-v2', s), seedState);

const log = [];
const note = (n, msg) => { console.log(`[${n}] ${msg}`); log.push(`[${n}] ${msg}`); };

/** Everything she can actually read on screen right now, in reading order. */
async function visible() {
  return page.evaluate(() => {
    const out = [];
    const vpBottom = scrollY + innerHeight;
    document.querySelectorAll('h1,h2,h3,label>span,button,a,p,small,strong,li,legend').forEach(el => {
      const r = el.getBoundingClientRect();
      const t = (el.innerText || '').trim();
      if (!t || r.height === 0 || r.width === 0) return;
      const top = r.top + scrollY;
      if (top + r.height < scrollY || top > vpBottom) return;
      if (getComputedStyle(el).visibility === 'hidden') return;
      out.push(`${el.tagName.toLowerCase()}: ${t.replace(/\s+/g, ' ').slice(0, 90)}`);
    });
    return [...new Set(out)];
  });
}

// Pinned so the persona always walks the Stage 1 planning flow this script is
// written about, rather than whichever stage the month CI runs in produces.
await page.clock.setFixedTime(new Date('2026-08-15T10:00:00'));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

let n = 0, stopped = null;
for (const step of steps) {
  n += 1;
  try {
    if (step.tapText) {
      const el = page.getByText(step.tapText, { exact: false }).filter({ visible: true }).first();
      if (!await el.count()) throw new Error(`nothing on screen reads "${step.tapText}"`);
      await el.click({ timeout: 4000 });
      note(n, `tapped "${step.tapText}"`);
    } else if (step.typeInto) {
      const field = page.locator('label').filter({ hasText: step.typeInto }).first();
      if (!await field.count()) throw new Error(`no field labelled "${step.typeInto}" is visible`);
      const box = field.locator('input, textarea').first();
      await box.fill(step.text, { timeout: 4000 });
      await box.blur();
      note(n, `typed into "${step.typeInto}"`);
    } else if (step.scroll) {
      await page.mouse.wheel(0, step.scroll);
      note(n, `scrolled ${step.scroll}px`);
    } else if (step.look) {
      note(n, `looked: ${step.look}`);
    }
  } catch (e) {
    stopped = { step: n, action: JSON.stringify(step), why: String(e.message).split('\n')[0] };
    note(n, `STUCK — ${stopped.why}`);
    break;
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/step-${String(n).padStart(2, '0')}.png` });
}

await page.screenshot({ path: `${OUT}/final.png`, fullPage: true });
console.log('\n--- what she can see now ---');
(await visible()).forEach(l => console.log('  ' + l));
const stored = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('mati-v2') || '{}'); } catch { return {}; } });
console.log('\nplan saved:', Boolean(stored?.plan?.savedAt), '| console errors:', errors.length);
if (stopped) console.log('STOPPED AT:', JSON.stringify(stopped));
fs.writeFileSync(`${OUT}/log.txt`, log.join('\n'));
await browser.close();
