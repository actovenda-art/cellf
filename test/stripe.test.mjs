import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createStripeHandler, updateStripeSale } from '../api/stripe.mjs';
import { createStripeWebhookHandler } from '../api/stripe-webhook.mjs';
import { hashPassword, issueSession, SESSION_COOKIE_NAME } from '../api/supabase.mjs';

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
}

function configureEnvironment(context) {
  const keys = ['CELLF_ADMIN_EMAIL', 'CELLF_APP_PASSWORD_HASH', 'CELLF_AUTH_SECRET', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.CELLF_ADMIN_EMAIL = 'admin@cellf.com.br';
  process.env.CELLF_APP_PASSWORD_HASH = hashPassword('SenhaSegura2026.');
  process.env.CELLF_AUTH_SECRET = 'cellf-test-secret-with-at-least-thirty-two-characters';
  process.env.SUPABASE_URL = 'https://projeto.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_test';
  process.env.STRIPE_SECRET_KEY = 'sk_test_cellf';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_cellf';
  context.after(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

function authenticatedRequest(method, body, query = '') {
  const token = issueSession('admin@cellf.com.br').token;
  return {
    method,
    url: `/api/stripe${query}`,
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      origin: 'https://cellf.com.br',
      host: 'cellf.com.br',
      'x-forwarded-host': 'cellf.com.br',
      'x-forwarded-proto': 'https'
    },
    body
  };
}

function installSupabaseState(context, initialState) {
  const previousFetch = globalThis.fetch;
  let state = structuredClone(initialState);
  const writes = [];
  globalThis.fetch = async (_url, options = {}) => {
    if ((options.method || 'GET') === 'GET') {
      return { ok: true, status: 200, json: async () => [{ state, updated_at: '2026-09-19T12:00:00.000Z' }] };
    }
    const payload = JSON.parse(options.body);
    state = structuredClone(payload.state);
    writes.push(structuredClone(state));
    return { ok: true, status: 201, json: async () => [{state,updated_at:payload.updated_at}] };
  };
  context.after(() => { globalThis.fetch = previousFetch; });
  return { get state() { return state; }, writes };
}

function pendingSaleState() {
  return {
    products: [{ id: 'produto-1', name: 'Cabo USB-C', stock: 3 }],
    customers: [{ id: 'cliente-1', name: 'Cliente', email: 'cliente@example.com' }],
    sales: [{
      id: 'venda-stripe-1',
      customerId: 'cliente-1',
      customer: 'Cliente',
      customerPhone: '',
      items: [{ productId: 'produto-1', name: 'Cabo USB-C', quantity: 2, unitPrice: 30, cost: 10 }],
      subtotal: 60,
      discount: 10,
      total: 50,
      payment: 'stripe',
      status: 'pending_payment',
      attendanceType: 'counter_sale',
      createdAt: '2026-09-19T12:00:00.000Z'
    }],
    stockMovements: [],
    deliveries: [],
    activity: []
  };
}

test('cobrança combinada Stripe baixa o serviço uma única vez e retira aparelho da vitrine',async context=>{
  configureEnvironment(context);
  const initial=pendingSaleState();
  initial.products[0].stock=2;
  initial.orders=[{id:'OS-1',value:100,receiptsTracked:true}];
  initial.devices=[{id:'d1',productId:'produto-1',status:'available',published:true}];
  initial.sales[0].servicePayment={orderId:'OS-1',amount:100};
  initial.sales[0].total=150;
  const remote=installSupabaseState(context,initial);
  const session={id:'cs_test_combined',client_reference_id:'venda-stripe-1',payment_status:'paid',amount_total:15000,currency:'brl'};
  await updateStripeSale(session);await updateStripeSale(session);
  assert.equal(remote.state.receipts.length,1);assert.equal(remote.state.receipts[0].amount,100);
  assert.equal(remote.state.products[0].stock,0);assert.equal(remote.state.devices[0].published,false);
});
test('Stripe não sobrescreve uma alteração simultânea do caixa',async context=>{
  configureEnvironment(context);
  const previous=globalThis.fetch;
  globalThis.fetch=async (_url,options)=>({ok:true,json:async()=>options.method==='GET'?[{state:pendingSaleState(),updated_at:'2026-09-25T12:00:00.000Z'}]:[]});
  context.after(()=>globalThis.fetch=previous);
  await assert.rejects(updateStripeSale({id:'cs_test_conflict',client_reference_id:'venda-stripe-1',payment_status:'paid',amount_total:5000,currency:'brl'}),e=>e.code==='STATE_CONFLICT');
});

test('o checkout da Stripe é criado no servidor em reais e sem expor a chave secreta', async context => {
  configureEnvironment(context);
  const remote = installSupabaseState(context, pendingSaleState());
  const calls = [];
  const handler = createStripeHandler({
    createClient: () => ({ checkout: { sessions: {
      create: async (payload, options) => {
        calls.push({ payload, options });
        return { id: 'cs_test_cellf', url: 'https://checkout.stripe.com/c/pay/cs_test_cellf' };
      }
    } } })
  });
  const response = responseRecorder();

  await handler(authenticatedRequest('POST', { saleId: 'venda-stripe-1' }), response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.payload.url, 'https://checkout.stripe.com/c/pay/cs_test_cellf');
  assert.equal(calls[0].payload.line_items[0].price_data.currency, 'brl');
  assert.equal(calls[0].payload.line_items[0].price_data.unit_amount, 5000);
  assert.equal(calls[0].payload.client_reference_id, 'venda-stripe-1');
  assert.match(calls[0].payload.success_url, /cellf\.com\.br/u);
  assert.equal(remote.state.sales[0].stripeSessionId, 'cs_test_cellf');
  assert.doesNotMatch(JSON.stringify(response.payload), /sk_test/u);
});

test('a confirmação da Stripe baixa o estoque uma única vez', async context => {
  configureEnvironment(context);
  const remote = installSupabaseState(context, pendingSaleState());
  const session = {
    id: 'cs_test_cellf',
    client_reference_id: 'venda-stripe-1',
    metadata: { cellf_sale_id: 'venda-stripe-1' },
    payment_status: 'paid',
    payment_intent: 'pi_cellf',
    amount_total: 5000,
    currency: 'brl'
  };
  const handler = createStripeHandler({
    createClient: () => ({ checkout: { sessions: { retrieve: async () => session } } })
  });

  const first = responseRecorder();
  await handler(authenticatedRequest('GET', undefined, '?session_id=cs_test_cellf'), first);
  const second = responseRecorder();
  await handler(authenticatedRequest('GET', undefined, '?session_id=cs_test_cellf'), second);

  assert.equal(first.payload.paid, true);
  assert.equal(second.payload.paid, true);
  assert.equal(remote.state.sales[0].status, 'paid');
  assert.equal(remote.state.products[0].stock, 1);
  assert.equal(remote.state.stockMovements.length, 1);
  assert.equal(remote.state.stockMovements[0].stripeSaleId, 'venda-stripe-1');
});

test('o webhook rejeita eventos sem assinatura válida', async context => {
  configureEnvironment(context);
  class InvalidStripe {
    constructor() {
      this.webhooks = { constructEvent: () => { throw new Error('assinatura inválida'); } };
    }
  }
  const handler = createStripeWebhookHandler({ StripeClass: InvalidStripe });
  const response = responseRecorder();

  await handler({
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=incorreta' },
    body: '{"id":"evt_cellf"}'
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.code, 'INVALID_STRIPE_SIGNATURE');
});
