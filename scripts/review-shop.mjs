import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CELLF_PLAYWRIGHT_PATH || 'playwright');
const out = join(tmpdir(), 'cellf-shop-review');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CELLF_BROWSER_EXECUTABLE || undefined });
const results = [];
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width <= 768, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const errors = [];
    let signedIn = false;
    page.on('pageerror', value => errors.push(value.message));
    await page.route('**/api/**', async route => {
      const url = new URL(route.request().url()), operation = url.searchParams.get('operation');
      if (url.pathname === '/api/state') return route.fulfill({ status: 401, json: { message: 'Faça login' } });
      if (url.pathname === '/api/branding') return route.fulfill({ json: { companyName: 'CELLF', slogan: 'Reparo e Comércio', branding: { primaryColor: '#d9f15a', secondaryColor: '#00aeef' } } });
      if (url.pathname === '/api/shop') {
        if (operation === 'catalog') return route.fulfill({ json: { products: [{ id: 'p1', name: 'Cabo USB-C Premium', category: 'Acessórios', description: 'Carregamento e dados', price: 39, available: 4 }], ratings: { p1: { positive: 7, negative: 1 } }, deliverySlots: [{ id: 'slot1', date: '2099-01-01', start: '09:00', end: '12:00', remaining: 2 }], deliveryEnabled: false } });
        if (operation === 'session') return route.fulfill({ json: signedIn ? { signedIn: true, account: { id: 'account1', name: 'Cliente de Teste', cpfLast4: '4725', approved: false }, sales: [{ id: 'sale1', status: 'paid', createdAt: '2026-10-20', paidAt: '2026-10-20', total: 39, warrantyDays: 90, items: [{ productId: 'p1', name: 'Cabo USB-C Premium', quantity: 1, unitPrice: 39 }] }], orders: [], ratings: [], quotes: [], approved: false } : { signedIn: false } });
        if (operation === 'register') { signedIn = true; return route.fulfill({ status: 201, json: { signedIn: true, account: { id: 'account1', name: 'Cliente de Teste', cpfLast4: '4725' } } }); }
        if (operation === 'quote-request') {
          const body = route.request().postDataJSON();
          assert.match(body.frontPhoto, /^data:image\/jpeg;base64,/);
          assert.match(body.backPhoto, /^data:image\/jpeg;base64,/);
          return route.fulfill({ status: 201, json: { id: 'quote-fixture-12345', status: 'new' } });
        }
        if (operation === 'owner-quotes' || operation === 'owner-accounts') return route.fulfill({ status: 401, json: { message: 'Acesso interno' } });
        return route.fulfill({ json: {} });
      }
      return route.fulfill({ json: {} });
    });
    await page.goto('http://localhost:4173/');
    await page.locator('.cellf-public-hero').waitFor();
    assert.equal(await page.locator('#vitrine-online').count(), 0);
    assert.ok(await page.locator('a[href="/loja"]:visible').first().isVisible());
    const homeBounds = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(homeBounds.scroll <= homeBounds.width + 1, `home overflows at ${width}: ${JSON.stringify(homeBounds)}`);
    if ([390, 1440].includes(width)) await page.screenshot({ path: join(out, `home-${width}.png`), fullPage: true });
    await page.locator('button[data-open-shop-quote]:visible').first().click();
    await page.locator('#shop-quote-dialog').waitFor({ state: 'visible' });
    const quoteBounds = await page.locator('#shop-quote-dialog').evaluate(dialog => ({ left: dialog.getBoundingClientRect().left, right: dialog.getBoundingClientRect().right, width: document.documentElement.clientWidth }));
    assert.ok(quoteBounds.left >= -1 && quoteBounds.right <= quoteBounds.width + 1, `quote modal clipped at ${width}: ${JSON.stringify(quoteBounds)}`);
    if (width === 390) await page.screenshot({ path: join(out, 'quote-390.png') });
    assert.ok(await page.locator('#shop-account-button').isVisible());
    if (width === 390) {
      const photo = readFileSync(new URL('../public/icon-192.png', import.meta.url));
      await page.locator('#shop-quote-form [name=name]').fill('Visitante Teste');
      await page.locator('#shop-quote-form [name=phone]').fill('11988888888');
      await page.locator('#shop-quote-form [name=model]').fill('iPhone 11');
      await page.locator('#shop-quote-form [name=details]').fill('A tela apagou após uma queda.');
      await page.locator('#shop-quote-form [name=frontPhoto]').setInputFiles({ name: 'frente.png', mimeType: 'image/png', buffer: photo });
      await page.locator('#shop-quote-form [name=backPhoto]').setInputFiles({ name: 'verso.png', mimeType: 'image/png', buffer: photo });
      await page.locator('#shop-quote-form [type=submit]').click();
      await page.locator('#shop-quote-message').filter({ hasText: 'recebida' }).waitFor();
      assert.equal(await page.locator('#shop-auth-dialog').isVisible(), false);
    }
    await page.locator('#shop-quote-dialog [data-shop-close]').click();
    await page.goto('http://localhost:4173/loja');
    await page.locator('#shop-products .shop-product-card').waitFor();
    assert.equal(await page.locator('.cellf-public-hero').count(), 0);
    assert.ok(await page.locator('#shop-cart-button').isVisible());
    await page.locator('button[data-open-shop-quote]:visible').first().click();
    await page.locator('#shop-quote-dialog').waitFor({ state: 'visible' });
    await page.locator('#shop-quote-dialog [data-shop-close]').click();
    const bounds = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, sections: [...document.querySelectorAll('#vitrine-online')].map(section => ({ id: section.id, width: section.getBoundingClientRect().width })) }));
    assert.ok(bounds.scroll <= bounds.width + 1, `horizontal overflow at ${width}: ${JSON.stringify(bounds)}`);
    await page.locator('[data-shop-add="p1"]').click();
    await page.locator('#shop-cart-button').click();
    assert.match(await page.locator('#shop-cart-total').textContent(), /39,00/);
    await page.locator('#shop-start-checkout').click();
    await page.locator('#shop-auth-dialog').waitFor({ state: 'visible' });
    await page.locator('#shop-register-form [name=name]').fill('Cliente de Teste');
    await page.locator('#shop-register-form [name=phone]').fill('11999999999');
    await page.locator('#shop-register-form [name=cpf]').fill('52998224725');
    await page.locator('#shop-register-form [name=pin]').fill('1234');
    await page.locator('#shop-register-form [type=submit]').click();
    await page.locator('#shop-checkout-dialog').waitFor({ state: 'visible' });
    assert.match(await page.locator('#shop-checkout-items').textContent(), /39,00/);
    await page.locator('#shop-checkout-dialog [data-shop-close]').click();
    await page.locator('#shop-account-button').click();
    await page.locator('#shop-account-body .shop-history-card').waitFor();
    await page.locator('[data-shop-account-tab="orders"]').click();
    assert.match(await page.locator('#shop-account-body').textContent(), /aguardando aprovação/i);
    await page.locator('[data-shop-account-tab="report"]').click();
    assert.ok(await page.locator('.shop-pie').isVisible());
    await page.screenshot({ path: join(out, `account-${width}.png`) });
    await page.locator('#shop-account-dialog [data-shop-close]').click();
    await page.locator('#shop-account-dialog').waitFor({ state: 'hidden' });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: join(out, `shop-${width}.png`), fullPage: true });
    assert.deepEqual(errors, [], `page errors at ${width}`);
    results.push({ width, ...bounds, focus: await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName), screenshots: join(out, `shop-${width}.png`) });
    await context.close();
  }
  console.log(JSON.stringify(results, null, 2));
} finally { await browser.close(); }
