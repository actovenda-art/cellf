import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CELLF_PLAYWRIGHT_PATH || 'playwright');
const output = join(tmpdir(), 'cellf-branding-review');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CELLF_BROWSER_EXECUTABLE || undefined });
const results = [], errors = [];
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, hasTouch: width <= 780, reducedMotion: 'reduce' });
    const page = await context.newPage();
    let saved = { operationalDataVersion: 'controle-cellf-2026-09-v1', products: [], services: [], orders: [], sales: [], customers: [], payables: [], activity: [], settings: { companyName: 'Cellf', slogan: 'Reparo e Comércio', managerName: 'Equipe Cellf', document: '' } };
    let failSave = false, isPublic = false, uploaded = null;
    page.on('pageerror', error => errors.push({ width, message: error.message }));
    // All API requests are fixtures. Production state and Storage are never modified.
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.pathname === '/api/state') {
        if (isPublic) return route.fulfill({ status: 401, json: { message: 'Faça login' } });
        if (request.method() === 'PUT') {
          if (failSave) return route.fulfill({ status: 502, json: { message: 'Falha de teste ao salvar' } });
          saved = request.postDataJSON().state;
        }
        return route.fulfill({ json: { state: saved, updatedAt: '2026-10-21T12:00:00Z', access: { admin: true, financial: true, modules: [] } } });
      }
      if (url.pathname === '/api/branding') {
        if (url.searchParams.has('asset')) return uploaded ? route.fulfill({ contentType: 'image/png', body: uploaded }) : route.fulfill({ status: 404, body: '' });
        return route.fulfill({ json: saved.settings });
      }
      if (url.pathname === '/api/documents') return route.fulfill({ json: { signedUrl: 'http://localhost:4173/api/test-brand-upload', path: 'branding/test-logo', token: 'fixture' } });
      if (url.pathname === '/api/test-brand-upload') { uploaded = request.postDataBuffer(); return route.fulfill({ json: { ok: true } }); }
      return route.fulfill({ json: { users: [] } });
    });
    await page.goto('http://localhost:4173');
    await page.locator('.page-title, .page-heading h1').first().waitFor();
    if (await page.locator('#menu-button').isVisible()) await page.locator('#menu-button').click();
    await page.locator('.nav-item[data-view="settings"]').click();
    for (const tab of ['empresa', 'branding', 'documentos', 'loja', 'operacao', 'avisos', 'dados']) {
      await page.locator('#settings-tab-' + tab).click();
      await page.locator('#' + tab).waitFor({ state: 'visible' });
      const layout = await page.evaluate(id => {
        const panel = document.getElementById(id), width = document.documentElement.clientWidth;
        const clipped = [...panel.querySelectorAll('input, button, textarea, img')].filter(el => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.right > width + 1 || r.left < -1);
        }).map(el => el.id || el.name || el.className);
        return { width, scrollWidth: document.documentElement.scrollWidth, clipped };
      }, tab);
      assert.ok(layout.scrollWidth <= width + 1, `${tab} overflows ${width}: ${layout.scrollWidth}`);
      assert.deepEqual(layout.clipped, [], `${tab} controls clipped at ${width}`);
      results.push({ width, tab, ...layout });
      if (['empresa', 'branding'].includes(tab)) await page.screenshot({ path: join(output, `${tab}-${width}.png`), fullPage: true });
    }
    if ([390, 1440].includes(width)) {
      await page.locator('#settings-tab-loja').click();
      await page.locator('#shop-slot-date').fill('2099-01-01');
      await page.locator('#shop-slot-start').fill('09:00');
      await page.locator('#shop-slot-end').fill('12:00');
      await page.locator('#shop-slot-capacity').fill('2');
      await page.locator('#shop-slot-add').click();
      assert.match(await page.locator('#shop-delivery-slot-list').textContent(), /09:00/);
      await page.locator('#settings-form [type="submit"]').click();
      await page.locator('#settings-save-status').filter({ hasText: 'atualizadas' }).waitFor();
      assert.equal(saved.settings.deliverySlots[0].capacity, 2);
      await page.locator('#settings-tab-branding').click();
      await page.locator('[name="companyName"]').fill('Cellf Teste');
      await page.locator('[name="slogan"]').fill('Uma marca de teste');
      await page.locator('[name="primaryColor"]').fill('#17324d');
      await page.locator('[name="secondaryColor"]').fill('#e9662e');
      assert.equal(await page.locator('[data-preview-name]').textContent(), 'Cellf Teste');
      assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent')), '#d9f15a');
      await page.locator('#branding-logo-file').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80"><rect width="200" height="80" rx="16" fill="#e9662e"/><text x="25" y="50" font-size="30">CELLF</text></svg>') });
      await page.locator('#branding-file-status').filter({ hasText: 'pronta para salvar' }).waitFor();
      await page.locator('#settings-form [type="submit"]').click();
      await page.locator('#settings-save-status').filter({ hasText: 'atualizadas' }).waitFor();
      assert.equal(saved.settings.branding.primaryColor, '#17324d');
      assert.equal(saved.settings.branding.secondaryColor, '#e9662e');
      assert.ok(saved.settings.branding.logo.id);
      assert.equal(uploaded.subarray(1, 4).toString(), 'PNG');
      await page.reload();
      await page.waitForFunction(() => document.title.includes('Cellf Teste'));
      assert.equal(await page.evaluate(() => document.documentElement.style.getPropertyValue('--accent')), '#17324d');
      if (await page.locator('#menu-button').isVisible()) await page.locator('#menu-button').click();
      await page.locator('.nav-item[data-view="settings"]').click();
      await page.locator('#settings-tab-branding').click();
      assert.equal(await page.locator('[name="companyName"]').inputValue(), 'Cellf Teste');
      failSave = true;
      await page.locator('[name="companyName"]').fill('Não deve publicar');
      await page.locator('#settings-form [type="submit"]').click();
      await page.locator('#settings-save-status').filter({ hasText: 'Falha de teste' }).waitFor();
      assert.equal(saved.settings.companyName, 'Cellf Teste');
      assert.ok((await page.title()).startsWith('Cellf Teste'));
      failSave = false;
      await page.locator('#settings-discard').click();
      assert.equal(await page.locator('[name="companyName"]').inputValue(), 'Cellf Teste');
      isPublic = true;
      await page.reload();
      await page.locator('.cellf-public-page').waitFor();
      await page.waitForFunction(() => document.querySelector('[data-brand-name]')?.textContent === 'Cellf Teste');
      assert.match(await page.locator('.cellf-public-brand img').getAttribute('src'), /\/api\/branding\?asset=logo/);
      isPublic = false;
      await page.reload();
      await page.locator('.page-title, .page-heading h1').first().waitFor();
      if (await page.locator('#menu-button').isVisible()) await page.locator('#menu-button').click();
      await page.locator('.nav-item[data-view="settings"]').click();
      await page.locator('#settings-tab-branding').click();
      await page.locator('#branding-reset-colors').click();
      await page.locator('#branding-restore-logo').click();
      await page.locator('#settings-form [type="submit"]').click();
      await page.locator('#settings-save-status').filter({ hasText: 'atualizadas' }).waitFor();
      assert.equal(saved.settings.branding.primaryColor, '#d9f15a');
      assert.equal(saved.settings.branding.logo, null);
      results.push({ width, flow: 'preview → PNG upload → save → reload → failed save rollback → public identity', passed: true });
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
await writeFile(join(output, 'results.json'), JSON.stringify({ results, errors }, null, 2));
console.log(JSON.stringify({ checks: results.length, errors, output }));
