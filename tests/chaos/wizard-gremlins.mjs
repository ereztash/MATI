/**
 * Chaos / monkey testing for the Stage 1 wizard, using gremlins.js.
 *
 * Why this exists: the wizard's "finish" bug (fixed 2026-08-19) survived 103
 * unit tests and 13 e2e tests because every one of them drives the app the
 * way a *cooperative* tester does — fill what's asked, in order. It was
 * found by clicking out of order and out of pace instead. gremlins.js
 * automates exactly that: a horde of random clicks, form fills, touches and
 * scrolls, fired faster and in less order than a person would ever
 * volunteer to test by hand. It does not replace the persona harness
 * (tests/persona) or the instructor e2e suite — it covers the family they
 * structurally can't: A/B/F from the taxonomy in this project's chat log —
 * out-of-order navigation, rapid/overlapping clicks, and the exact "click
 * forward without complying" pattern that broke the wizard once already.
 *
 * Scope: the clicker species is restricted to the Stage 1 work view via
 * canClick — it cannot reach the header nav, so the horde can't
 * teleport itself to another view. It CAN reach the wizard's own
 * pagination bar, every visible form field and choice button in whichever
 * part is currently shown, the Gantt adjusters, and the footer's
 * "מחיקת המידע המקומי" delete button — that button is deliberately left
 * reachable, because "does a click-storm accidentally wipe local data" is
 * itself one of the questions this run exists to answer. It found exactly
 * that once: a random sequence reached the button's confirm() and the
 * alert mogwai (below) auto-accepted it, wiping storage mid-run. Fixed
 * 2026-08-19 — the button no longer uses a native dialog at all (two real
 * in-app clicks now, naming what's actually at stake), which structurally
 * closes that exploit path: the alert mogwai only intercepts native
 * alert()/confirm()/prompt(), so it has nothing left to auto-accept here.
 * Form-filler, toucher and typer are not selector-restrictable in gremlins.js 2.x, but
 * none of them can navigate away on their own, so this scoping is enough
 * to keep the run meaningfully about the wizard.
 *
 * Seeded (Chance(SEED)) for reproducibility: a finding here should be
 * re-runnable, not a one-off flake. Override with GREMLINS_SEED.
 * Override GREMLINS_COUNT to run longer/shorter than the default.
 *
 * Usage: node tests/chaos/wizard-gremlins.mjs
 * Requires the app already running at MATI_BASE_URL (default
 * http://127.0.0.1:3210 — start with `npm run build && npx next start -p 3210`).
 */
import { chromium, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.MATI_BASE_URL || 'http://127.0.0.1:3210';
const SEED = Number(process.env.GREMLINS_SEED ?? 42);
const COUNT = Number(process.env.GREMLINS_COUNT ?? 400);
const CHROMIUM_PATH = process.env.MATI_E2E_CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const GREMLINS_DIST = path.resolve(__dirname, '../../node_modules/gremlins.js/dist/gremlins.min.js');
const OUT_DIR = path.resolve(__dirname, '../../.chaos-out');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ executablePath: fs.existsSync(CHROMIUM_PATH) ? CHROMIUM_PATH : undefined });
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'he-IL' });
  const page = await context.newPage();

  const findings = { consoleErrors: [], pageErrors: [], dialogs: [], deadEnds: [] };
  // The location URL is kept, not just the text. Chromium's console text for a
  // failed subresource is bare — "Failed to load resource: the server responded
  // with a status of 404 (Not Found)" — with the URL only in location(). The
  // benign-404 filter at the bottom of this file matches on 'favicon', so
  // against text alone it never matched and the harness exited 1 on every
  // single run. A check that is always red reports exactly as much as one that
  // is always green.
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const url = msg.location()?.url ?? '';
    findings.consoleErrors.push(url ? `${msg.text()} [${url}]` : msg.text());
  });
  page.on('pageerror', (err) => findings.pageErrors.push(String(err)));
  page.on('dialog', async (d) => { findings.dialogs.push(`${d.type()}: ${d.message()}`); await d.accept(); });

  // Pin the calendar, for the same reason tests/e2e/fixtures.ts does: this
  // harness declares its scope as the Stage 1 work view, but stageFromDate
  // reads the real clock — so run in December it fuzzes Stage 2, in May
  // Stage 3, and on 1 October the calendar-gap picker, while still printing
  // "Stage-1 work view".
  await page.clock.setFixedTime(new Date('2026-08-15T10:00:00'));
  await page.goto(BASE_URL);
  await page.waitForLoadState('networkidle');
  await page.locator('.experienceNav button', { hasText: 'עבודה' }).click();
  await page.waitForTimeout(300);

  await page.addScriptTag({ path: GREMLINS_DIST });

  console.log(`gremlins.js horde: seed=${SEED} nb=${COUNT} scope=Stage-1 work view`);

  const result = await page.evaluate(({ seed, nb }) => new Promise((resolve) => {
    const log = { warn: [], error: [] };
    // gremlins.js calls logger.warn/error with multiple arguments (e.g. a
    // mogwai name plus details) — join all of them, not just the first, or
    // the captured text is a meaningless fragment like "mogwai ".
    const join = (args) => args.map((a) => { try { return typeof a === 'string' ? a : JSON.stringify(a); } catch { return String(a); } }).join(' ');
    const logger = {
      log() {}, info() {},
      warn: (...args) => log.warn.push(join(args)),
      error: (...args) => log.error.push(join(args)),
    };

    // Keep the horde inside the work view: never the header nav (that's how
    // it could otherwise teleport itself to /org or another stage entirely),
    // everything else in the work view — wizard bar, whichever form part is
    // currently visible, Gantt adjusters, and the delete-data button — is
    // fair game on purpose (see file header).
    const inScope = (el) => Boolean(el.closest('.view-work')) && !el.closest('.experienceTopbar');

    const horde = window.gremlins.createHorde({
      randomizer: new window.gremlins.Chance(seed),
      logger,
      species: [
        window.gremlins.species.clicker({ canClick: inScope }),
        window.gremlins.species.formFiller(),
        window.gremlins.species.toucher(),
        window.gremlins.species.scroller(),
      ],
      mogwais: [
        window.gremlins.mogwais.alert(), // native alert()/confirm() must not hang the horde
        window.gremlins.mogwais.gizmo(), // auto-stop if things go seriously wrong
      ],
      strategies: [
        window.gremlins.strategies.distribution({ nb, delay: 10 }),
      ],
    });

    horde.unleash().then(() => resolve({ warn: log.warn, error: log.error }));
  }), { seed: SEED, nb: COUNT });

  findings.gremlinsWarn = result.warn;
  findings.gremlinsError = result.error;

  await page.waitForTimeout(500);

  // Post-run sanity: is the app still alive and in a state a user could act
  // on, or did the horde find a dead end — the exact shape of the bug this
  // harness exists to catch (something visible, but nothing clickable)?
  const shellClass = await page.locator('.experienceShell').getAttribute('class').catch(() => null);
  const onWorkView = shellClass?.includes('view-work') ?? false;
  let clickableCount = 0;
  if (onWorkView) {
    clickableCount = await page.locator('.view-work button:visible, .view-work input:visible, .view-work textarea:visible').count();
    if (clickableCount === 0) findings.deadEnds.push('work view has zero visible/interactive elements after the horde ran');
  } else {
    // The clicker species is scoped to the work view and none of the other
    // species can navigate, so ending anywhere else means that scoping broke —
    // and it silently disables the dead-end check above, which is the whole
    // point of the run. Previously this branch did not exist: the harness
    // simply reported "clickable elements remaining: 0" and exited 0, i.e. it
    // could report success having checked nothing.
    findings.deadEnds.push(`horde ended outside the work view (shell class: ${shellClass}) — the dead-end check did not run`);
  }

  const stored = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('mati-v2') ?? 'null'); } catch { return 'UNPARSEABLE'; } });
  // Viewport screenshot at the horde's own final scroll position, not fullPage:
  // fullPage stitches multiple scroll slices together, and this app has more
  // than one sticky-positioned element (header, .workSessionBar) — that
  // stitching drew a header/ribbon overlap on the first run here that did not
  // reproduce at all in a real viewport capture. A fullPage shot of a sticky
  // layout is not evidence of anything by itself; verify with a plain one first.
  const screenshotPath = path.join(OUT_DIR, `after-horde-${SEED}.png`);
  await page.screenshot({ path: screenshotPath }).catch(() => {});

  console.log('\n=== after the horde ===');
  console.log('shell class:', shellClass);
  console.log('clickable elements remaining in work view:', clickableCount);
  console.log('storage still parseable JSON:', stored !== 'UNPARSEABLE');
  console.log('screenshot:', screenshotPath);
  console.log('\nconsole errors:', findings.consoleErrors.length, findings.consoleErrors.slice(0, 10));
  console.log('page errors:', findings.pageErrors.length, findings.pageErrors.slice(0, 10));
  console.log('native dialogs triggered:', findings.dialogs);
  console.log('gremlins-reported warnings:', findings.gremlinsWarn.length, findings.gremlinsWarn.slice(0, 5));
  console.log('gremlins-reported errors:', findings.gremlinsError.length, findings.gremlinsError.slice(0, 5));
  console.log('dead ends:', findings.deadEnds.length ? findings.deadEnds : '(none)');

  fs.writeFileSync(path.join(OUT_DIR, `report-${SEED}.json`), JSON.stringify({ seed: SEED, count: COUNT, ...findings, storedIsParseable: stored !== 'UNPARSEABLE' }, null, 2));

  await browser.close();

  // /favicon.ico 404 is a known, already-documented cosmetic non-issue (every
  // browser requests it automatically) — filtered here so it doesn't drown
  // out or cry wolf about a real console error on every run.
  const isKnownBenign = (e) => e.toLowerCase().includes('favicon');
  // storedIsParseable was computed, printed and written to the report, and then
  // left out of this expression — so a horde that corrupted localStorage into
  // unparseable JSON was reported on screen and still exited 0. A check whose
  // result nothing acts on is not a check.
  const hasRealFinding = findings.pageErrors.length || findings.deadEnds.length
    || findings.consoleErrors.some((e) => !isKnownBenign(e))
    || findings.gremlinsError.length || findings.gremlinsWarn.length
    || stored === 'UNPARSEABLE';
  process.exit(hasRealFinding ? 1 : 0);
}

main().catch((err) => { console.error('chaos run crashed:', err); process.exit(2); });
