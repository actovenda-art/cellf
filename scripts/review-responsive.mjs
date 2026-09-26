import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const engines = require(process.env.CELLF_PLAYWRIGHT_PATH || 'playwright');
const output = process.env.CELLF_REVIEW_OUTPUT || join(tmpdir(), 'cellf-responsive-review');
await mkdir(output, { recursive: true });
const browser = await engines[process.env.CELLF_BROWSER || 'chromium'].launch({ headless: true });
const results = [];
const errors = [];
async function measure(page, name) {
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const clipped = [...document.querySelectorAll('main *, #modal-backdrop *')].filter(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return false;
      // Content of intentionally scrollable tables/panels is not a page overflow.
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (['auto', 'scroll', 'hidden', 'clip'].includes(getComputedStyle(p).overflowX)) return false;
      }
      return r.right > width + 1 || r.left < -1;
    }).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent.slice(0, 70) }));
    return { width, scrollWidth: document.documentElement.scrollWidth, clipped: clipped.slice(0, 12), heading: document.querySelector('#app-content h1')?.textContent, textLength: document.querySelector('#app-content')?.innerText.length };
  });
  results.push({ name, ...result });
  await page.screenshot({ path: join(output, `${name}.png`), fullPage: true });
}
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: width < 768, hasTouch: width < 768, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push({ width, error: e.message }));
    page.on('console', e => {if(e.type()==='error' && !e.text().includes('401')) errors.push({width,error:e.text()});});
    await page.route('**/api/team',route=>route.fulfill({json:{users:[]}}));
    // Isolated browser fixtures: no reads or writes of production customer data.
    let saved = null;
    await page.route('**/api/state', route => route.fulfill({ status: 401, json: { message: 'Faça login' } }));
    await page.goto('http://localhost:4173');
    await page.getByRole('button', { name: 'Login', exact: true }).waitFor();
    await measure(page, `public-${width}`);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await measure(page, `login-${width}`);
    await page.getByRole('button', { name: 'Fechar login', exact: true }).click();
    await page.unroute('**/api/state');
    await page.route('**/api/state', async route => {
      if (route.request().method() === 'PUT') saved = route.request().postDataJSON().state;
      await route.fulfill({ json: { state: saved, updatedAt: new Date().toISOString() } });
    });
    await page.reload();
    await page.locator('.page-title').waitFor();
    for (const view of ['dashboard','orders','deliveries','customers','products','services','sales','payables','reports','settings','agenda','team','cash','devices','fiscal']) {
      if (await page.locator('#menu-button').isVisible()) await page.locator('#menu-button').click();
      await page.locator(`.nav-item[data-view="${view}"]`).click();
      await measure(page, `${view}-${width}`);
    }
    for (const [view, action] of [['orders','new-order'],['customers','new-customer'],['products','new-product'],['services','new-service'],['payables','new-payable'],['agenda','new-appointment']]) {
      if (await page.locator('#menu-button').isVisible()) await page.locator('#menu-button').click();
      await page.locator(`.nav-item[data-view="${view}"]`).click();
      await page.locator(`#app-content [data-action="${action}"]`).first().click();
      await measure(page, `${action}-${width}`);
      await page.locator('#modal-backdrop [data-action="close-modal"]').first().click();
    }
    for (const [view, action] of [['team','new-employee'],['devices','new-device'],['cash','cash-open']]) {
      if (await page.locator('#menu-button').isVisible()) await page.locator('#menu-button').click();
      await page.locator(`.nav-item[data-view="${view}"]`).click();
      await page.locator(`#app-content [data-extra="${action}"]`).first().click();
      await measure(page, `${action}-${width}`);
      await page.locator('#modal-backdrop [data-action="close-modal"]').first().click();
    }
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ output, screens: results.length, errors, failures: results.filter(r => r.scrollWidth > r.width + 1 || r.clipped.length || !r.textLength) }, null, 2));
if (errors.length || results.some(r => r.scrollWidth > r.width + 1 || !r.textLength)) process.exitCode = 1;
