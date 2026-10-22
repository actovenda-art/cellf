import assert from 'node:assert/strict';
import { test } from 'node:test';
import shopHandler, { createShopHandler, validCpf } from '../api/shop.mjs';
import { updateStripeSale } from '../api/stripe.mjs';
import { hashPassword, issueSession, SESSION_COOKIE_NAME } from '../api/supabase.mjs';

const CPF = '52998224725';
const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; }, end() {} });
const request = (operation, { method = 'GET', body, cookie = '' } = {}) => ({ method, url: `/api/shop?operation=${operation}`, body, headers: { origin: 'https://cellf.com.br', host: 'cellf.com.br', 'x-forwarded-host': 'cellf.com.br', 'x-forwarded-proto': 'https', cookie } });
async function call(operation, options) { const res = response(); await shopHandler(request(operation, options), res); return res; }

function setup(t) {
  const values = { SUPABASE_URL: 'https://cellf-test.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test', SUPABASE_STATE_ID: 'cellf-primary', CELLF_AUTH_SECRET: 'shop-secret-with-at-least-thirty-two-characters', CELLF_ADMIN_EMAIL: 'owner@cellf.test', CELLF_APP_PASSWORD_HASH: hashPassword('OwnerPassword2026!') };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const rows = new Map([['cellf-primary', { id: 'cellf-primary', state: { settings: { address: 'Rua A, 1', city: 'São Paulo', deliveryPricePerKm: 5, deliverySlots: [{ id: 'slot-1', date: '2099-01-01', start: '09:00', end: '12:00', capacity: 2 }] }, products: [{ id: 'product-1', name: 'Cabo USB-C', category: 'Acessórios', description: 'Cabo de 2 metros', price: 39, cost: 9, stock: 3, online: true }, { id: 'private-part', name: 'Bateria interna', price: 70, cost: 20, stock: 5, online: false }], sales: [], orders: [], customers: [], quoteRequests: [], shopRatings: [] }, updated_at: '2026-10-20T00:00:00.000Z' }]]);
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.hostname === 'routes.googleapis.com') return { ok: true, json: async () => ({ routes: [{ distanceMeters: 2500 }] }) };
    if (url.pathname.startsWith('/storage/v1/object/')) return { ok: true, json: async () => ({}) };
    const selector = url.searchParams.get('id') || '';
    if ((options.method || 'GET') === 'GET') {
      const matches = selector.startsWith('eq.') ? [rows.get(selector.slice(3))].filter(Boolean) : selector.startsWith('like.cellf-customer-') ? [...rows.values()].filter(row => row.id.startsWith('cellf-customer-')) : [];
      return { ok: true, json: async () => structuredClone(matches) };
    }
    const payload = JSON.parse(options.body);
    if (options.method === 'POST') {
      if (rows.has(payload.id)) return { ok: true, json: async () => [] };
      rows.set(payload.id, { ...payload });
      return { ok: true, json: async () => [{ ...payload }] };
    }
    if (options.method === 'PATCH') {
      const id = selector.slice(3), old = rows.get(id);
      if (!old || old.updated_at !== (url.searchParams.get('updated_at') || '').slice(3)) return { ok: true, json: async () => [] };
      const next = { ...old, ...payload }; rows.set(id, next);
      return { ok: true, json: async () => [structuredClone(next)] };
    }
    throw new Error(`Unexpected fetch ${options.method} ${url}`);
  };
  t.after(() => { globalThis.fetch = previousFetch; });
  return rows;
}

test('CPF é validado por dígitos verificadores', () => {
  assert.equal(validCpf(CPF), true);
  assert.equal(validCpf('529.982.247-25'), true);
  assert.equal(validCpf('11111111111'), false);
  assert.equal(validCpf('52998224726'), false);
});

test('catálogo publica somente produtos autorizados e não revela custos nem CPF', async t => {
  setup(t);
  const res = await call('catalog');
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.products.length, 1);
  assert.equal(res.payload.products[0].name, 'Cabo USB-C');
  assert.doesNotMatch(JSON.stringify(res.payload), /Bateria interna|"cost"|529982/);
  assert.equal(res.payload.deliveryEnabled, false);
});

test('cadastro cria cookie HttpOnly e histórico antigo só aparece após aprovação do proprietário', async t => {
  const rows = setup(t);
  rows.get('cellf-primary').state.orders.push({ id: 'OS-1', customerDocument: CPF, device: 'iPhone 11', issue: 'Bateria', status: 'delivered', parts: [], createdAt: '2026-10-01', deliveredAt: '2026-10-02', warrantyDays: 90 });
  const created = await call('register', { method: 'POST', body: { cpf: CPF, pin: '1234', name: 'Cliente Teste', phone: '11999999999' } });
  assert.equal(created.statusCode, 201);
  assert.match(created.headers['Set-Cookie'], /HttpOnly; SameSite=Lax/);
  assert.doesNotMatch(JSON.stringify(created.payload), /1234|52998224725/);
  const cookie = created.headers['Set-Cookie'].split(';')[0];
  const before = await call('session', { cookie });
  assert.equal(before.payload.signedIn, true);
  assert.deepEqual(before.payload.orders, []);
  assert.equal(before.payload.approved, false);
  const accounts = await call('owner-accounts', { cookie: `${SESSION_COOKIE_NAME}=${issueSession('owner@cellf.test').token}` });
  assert.equal(accounts.payload.accounts.length, 1);
  assert.doesNotMatch(JSON.stringify(accounts.payload), /pinHash|scrypt/);
  const approved = await call('owner-approve', { method: 'POST', cookie: `${SESSION_COOKIE_NAME}=${issueSession('owner@cellf.test').token}`, body: { id: created.payload.account.id, cpf: CPF, approved: true } });
  assert.equal(approved.statusCode, 200);
  const after = await call('session', { cookie });
  assert.equal(after.payload.orders.length, 1);
});

test('PIN incorreto não autentica e bloqueia após cinco tentativas', async t => {
  setup(t);
  await call('register', { method: 'POST', body: { cpf: CPF, pin: '1234', name: 'Cliente Teste', phone: '11999999999' } });
  for (let i = 0; i < 5; i++) {
    const failed = await call('login', { method: 'POST', body: { cpf: CPF, pin: '9999' } });
    assert.equal(failed.statusCode, 401);
  }
  const locked = await call('login', { method: 'POST', body: { cpf: CPF, pin: '1234' } });
  assert.equal(locked.statusCode, 429);
});

test('frete usa distância de carro do Google e falha fechado sem chave', async t => {
  setup(t);
  const old = process.env.GOOGLE_MAPS_API_KEY;
  t.after(() => { if (old === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = old; });
  const address = { postalCode: '01001000', street: 'Praça da Sé', number: '1', city: 'São Paulo', state: 'SP' };
  delete process.env.GOOGLE_MAPS_API_KEY;
  const disabled = await call('delivery-quote', { method: 'POST', body: { address } });
  assert.equal(disabled.statusCode, 503);
  process.env.GOOGLE_MAPS_API_KEY = 'test-only-key';
  const priced = await call('delivery-quote', { method: 'POST', body: { address } });
  assert.equal(priced.statusCode, 200);
  assert.deepEqual(priced.payload, { km: 2.5, fee: 12.5, rate: 5 });
});

test('não aceita avaliações de itens não comprados', async t => {
  setup(t);
  const created = await call('register', { method: 'POST', body: { cpf: CPF, pin: '1234', name: 'Cliente Teste', phone: '11999999999' } });
  const cookie = created.headers['Set-Cookie'].split(';')[0];
  const rating = await call('rate', { method: 'POST', cookie, body: { sourceType: 'sale', sourceId: 'v-1', productId: 'product-1', stars: 5, comment: 'Gostei' } });
  assert.equal(rating.statusCode, 403);
});

test('checkout recalcula preço, confirma Stripe, baixa estoque, agenda entrega e agrega avaliação sem publicar comentário', async t => {
  const rows = setup(t);
  const oldKey = process.env.GOOGLE_MAPS_API_KEY;
  process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  t.after(() => { if (oldKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY; else process.env.GOOGLE_MAPS_API_KEY = oldKey; });
  const created = await call('register', { method: 'POST', body: { cpf: CPF, pin: '1234', name: 'Cliente Teste', phone: '11999999999' } });
  const cookie = created.headers['Set-Cookie'].split(';')[0];
  const stripeCalls = [];
  const handler = createShopHandler({ createClient: () => ({ checkout: { sessions: { create: async payload => { stripeCalls.push(payload); return { id: 'cs_test_online', url: 'https://checkout.stripe.com/c/pay/cs_test_online' }; } } } }) });
  const res = response();
  await handler(request('checkout', { method: 'POST', cookie, body: { items: [{ productId: 'product-1', quantity: 1, unitPrice: 0.01 }], fulfillment: 'delivery', deliverySlotId: 'slot-1', address: { postalCode: '01001000', street: 'Praça da Sé', number: '1', city: 'São Paulo', state: 'SP' } } }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(stripeCalls[0].line_items[0].price_data.unit_amount, 5150);
  assert.match(stripeCalls[0].success_url, /^https:\/\/cellf\.com\.br\/loja\?shop=success/);
  assert.match(stripeCalls[0].cancel_url, /^https:\/\/cellf\.com\.br\/loja\?shop=cancel/);
  const sale = rows.get('cellf-primary').state.sales[0];
  assert.equal(sale.total, 51.5);
  assert.equal(sale.customerDocument, CPF);
  assert.equal(sale.stripeSessionId, 'cs_test_online');
  assert.equal(sale.status, 'pending_payment');
  await updateStripeSale({ id: 'cs_test_online', metadata: { cellf_sale_id: sale.id }, payment_status: 'paid', amount_total: 5150, currency: 'brl' });
  assert.equal(rows.get('cellf-primary').state.products[0].stock, 2);
  assert.equal(rows.get('cellf-primary').state.deliveries[0].scheduledDate, '2099-01-01');
  const rating = await call('rate', { method: 'POST', cookie, body: { sourceType: 'sale', sourceId: sale.id, productId: 'product-1', stars: 5, comment: 'Está durando bastante!' } });
  assert.equal(rating.statusCode, 200);
  const catalog = await call('catalog');
  assert.deepEqual(catalog.payload.ratings['product-1'], { positive: 1, negative: 0 });
  assert.doesNotMatch(JSON.stringify(catalog.payload), /Está durando bastante/);
  const account = await call('session', { cookie });
  assert.equal(account.payload.sales[0].status, 'paid');
  assert.equal(account.payload.ratings[0].comment, 'Está durando bastante!');
});

test('orçamento aceita fotos privadas antes do login e exige acesso interno para leitura', async t => {
  const rows = setup(t);
  const photo = 'data:image/png;base64,' + Buffer.from([137,80,78,71,13,10,26,10,1]).toString('base64');
  const submitted = await call('quote-request', { method: 'POST', body: { name: 'Visitante Teste', phone: '11988888888', model: 'iPhone 11', details: 'A tela apagou após uma queda.', frontPhoto: photo, backPhoto: photo } });
  assert.equal(submitted.statusCode, 201);
  assert.equal(rows.get('cellf-primary').state.quoteRequests.length, 1);
  const publicView = await call('owner-quotes');
  assert.equal(publicView.statusCode, 401);
  const ownerView = await call('owner-quotes', { cookie: `${SESSION_COOKIE_NAME}=${issueSession('owner@cellf.test').token}` });
  assert.equal(ownerView.statusCode, 200);
  assert.equal(ownerView.payload.quotes[0].model, 'iPhone 11');
  assert.doesNotMatch(JSON.stringify(ownerView.payload), /frontPhoto|backPhoto|sourceHash|"cpf"/);
  const photoResult = response();
  await shopHandler({ ...request('quote-photo', { cookie: `${SESSION_COOKIE_NAME}=${issueSession('owner@cellf.test').token}` }), url: `/api/shop?operation=quote-photo&id=${submitted.payload.id}&side=front` }, photoResult);
  assert.equal(photoResult.statusCode, 502);
  assert.equal(photoResult.payload.code, 'INVALID_SIGNED_URL');
  const catalog = await call('catalog');
  assert.doesNotMatch(JSON.stringify(catalog.payload), /Visitante Teste|A tela apagou|quotes\//);
});

test('vitrine respeita reservas Stripe do PDV e da loja online', async t => {
  const rows = setup(t);
  rows.get('cellf-primary').state.sales = [
    { id: 'pdv-1', payment: 'stripe', status: 'pending_payment', items: [{ productId: 'product-1', quantity: 1 }] },
    { id: 'web-1', shopAccountId: 'customer-1', payment: 'stripe', status: 'pending_payment', createdAt: new Date().toISOString(), items: [{ productId: 'product-1', quantity: 1 }] }
  ];
  const catalog = await call('catalog');
  assert.equal(catalog.payload.products[0].available, 1);
});
