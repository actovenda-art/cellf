import Stripe from 'stripe';
import { randomUUID } from 'node:crypto';
import {
  ApiError,
  getSupabaseConfig,
  queryValue,
  readJsonBody,
  requireAuthenticatedSession,
  sendApiError,
  sendJson,
  supabaseRequest
} from './supabase.mjs';
import { writeRecord } from './access.mjs';

const STRIPE_SALE_STATUSES = new Set(['pending_payment', 'payment_failed']);
const stateVersions = new WeakMap();

function headerValue(request, name) {
  const headers = request.headers || {};
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const value = headers[name.toLowerCase()] ?? headers[name] ?? '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

export function isStripeConfigured() {
  return /^sk_(?:test|live)_[A-Za-z0-9_]+$/.test(String(process.env.STRIPE_SECRET_KEY || '').trim());
}

function stripeClient() {
  if (!isStripeConfigured()) {
    throw new ApiError(503, 'STRIPE_NOT_CONFIGURED', 'A Stripe ainda não foi conectada à Cellf na Vercel.');
  }
  return new Stripe(String(process.env.STRIPE_SECRET_KEY).trim(), { maxNetworkRetries: 2 });
}

function requestOrigin(request) {
  const supplied = headerValue(request, 'origin').trim();
  if (supplied) {
    try {
      const url = new URL(supplied);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.origin;
    } catch {
      // Use the trusted forwarded host below.
    }
  }

  const host = headerValue(request, 'x-forwarded-host').split(',')[0].trim()
    || headerValue(request, 'host').trim();
  const protocol = headerValue(request, 'x-forwarded-proto').split(',')[0].trim()
    || (process.env.VERCEL === '1' ? 'https' : 'http');
  if (!host || !/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host) || !['http', 'https'].includes(protocol)) {
    throw new ApiError(400, 'INVALID_RETURN_URL', 'Não foi possível preparar o retorno seguro do pagamento.');
  }
  return `${protocol}://${host}`;
}

async function readAppState() {
  const config = getSupabaseConfig();
  const path = '/rest/v1/cellf_app_state?select=state,updated_at&id=eq.'
    + encodeURIComponent(config.stateId) + '&limit=1';
  const rows = await supabaseRequest(path);
  const record = Array.isArray(rows) ? rows[0] : null;
  if (!record?.state || typeof record.state !== 'object' || Array.isArray(record.state)) {
    throw new ApiError(409, 'STATE_NOT_READY', 'Os dados da Cellf precisam ser sincronizados antes de cobrar.');
  }
  stateVersions.set(record.state,record.updated_at);
  return record.state;
}

async function writeAppState(state) {
  const config = getSupabaseConfig();
  const updatedAt = await writeRecord(config.stateId,state,{updated_at:stateVersions.get(state)});
  stateVersions.set(state,updatedAt);
  return updatedAt;
}

function findSale(state, saleId) {
  const sale = Array.isArray(state.sales) ? state.sales.find(entry => entry.id === saleId) : null;
  if (!sale) throw new ApiError(404, 'SALE_NOT_FOUND', 'A venda vinculada ao pagamento não foi encontrada.');
  return sale;
}

function saleAmount(sale) {
  const cents = Math.round(Number(sale.total) * 100);
  if (!Number.isSafeInteger(cents) || cents < 50 || cents > 99_999_999) {
    throw new ApiError(400, 'INVALID_PAYMENT_AMOUNT', 'O total da venda não pode ser processado pela Stripe.');
  }
  return cents;
}

function paymentSucceeded(session) {
  return session?.payment_status === 'paid' || session?.payment_status === 'no_payment_required';
}

export async function updateStripeSale(session, nextStatus = 'paid') {
  const saleId = String(session?.metadata?.cellf_sale_id || session?.client_reference_id || '').trim();
  if (!saleId) throw new ApiError(400, 'INVALID_STRIPE_SESSION', 'A sessão da Stripe não está vinculada a uma venda Cellf.');

  const state = await readAppState();
  const sale = findSale(state, saleId);
  const expectedAmount = saleAmount(sale);
  if (Number(session.amount_total) !== expectedAmount || String(session.currency || '').toLowerCase() !== 'brl') {
    throw new ApiError(409, 'PAYMENT_MISMATCH', 'O valor confirmado pela Stripe não corresponde à venda.');
  }

  sale.stripeSessionId = session.id;
  sale.stripePaymentIntent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || '';

  if (nextStatus === 'paid' && paymentSucceeded(session)) {
    if (sale.status !== 'paid') {
      for (const item of sale.items || []) {
        const product = state.products?.find(entry => entry.id === item.productId);
        if (!product) continue;
        product.stock = Number(product.stock || 0) - Number(item.quantity || 0);
        const device = (state.devices || []).find(d=>d.productId===product.id);
        if (device && product.stock <= 0) {device.status='sold';device.published=false;}
        state.stockMovements ||= [];
        if (!state.stockMovements.some(movement => movement.stripeSaleId === sale.id && movement.productId === product.id)) {
          state.stockMovements.unshift({
            id: `mov-${randomUUID()}`,
            productId: product.id,
            productName: product.name,
            type: 'out',
            quantity: Number(item.quantity || 0),
            reason: `Venda ${String(sale.id).toUpperCase()} · Stripe`,
            stripeSaleId: sale.id,
            createdAt: new Date().toISOString()
          });
        }
      }
      state.stockMovements = (state.stockMovements || []).slice(0, 200);
      const payment=sale.servicePayment;
      const order=payment && state.orders?.find(o=>o.id===payment.orderId);
      if(order) {
        state.receipts ||= [];
        if(!state.receipts.some(r=>r.saleId===sale.id)) state.receipts.push({id:`rec-${randomUUID()}`,orderId:order.id,saleId:sale.id,amount:Number(payment.amount),payment:'stripe',createdAt:new Date().toISOString()});
        order.receiptsTracked=true;order.payment='stripe';
      }

      if (sale.attendanceType === 'delivery' && sale.deliveryAddress) {
        state.deliveries ||= [];
        if (!state.deliveries.some(delivery => delivery.sourceType === 'sale' && delivery.sourceId === sale.id)) {
          state.deliveries.unshift({
            id: `delivery-${randomUUID()}`,
            sourceType: 'sale',
            sourceId: sale.id,
            kind: 'sale_delivery',
            customerId: sale.customerId || '',
            customer: sale.customer || 'Cliente sem identificação',
            phone: sale.customerPhone || '',
            address: { ...sale.deliveryAddress },
            scheduledDate: new Date().toISOString().slice(0, 10),
            status: 'scheduled',
            createdAt: new Date().toISOString()
          });
        }
      }

      state.activity ||= [];
      state.activity.unshift({
        id: `activity-${randomUUID()}`,
        kind: 'sale',
        description: `Venda ${String(sale.id).toUpperCase()} paga pela Stripe`,
        createdAt: new Date().toISOString()
      });
      state.activity = state.activity.slice(0, 80);
    }
    sale.status = 'paid';
    sale.payment = 'stripe';
    sale.paymentDetails = 'Stripe Checkout';
    sale.paidAt = sale.paidAt || new Date().toISOString();
  } else if (sale.status !== 'paid') {
    sale.status = nextStatus;
    sale.paymentFailure = nextStatus === 'payment_failed' ? 'Pagamento não confirmado pela Stripe.' : '';
  }

  await writeAppState(state);
  return sale;
}

async function cancelStripeSale(client, saleId) {
  const state = await readAppState();
  const sale = findSale(state, saleId);
  if (sale.status === 'paid') return sale;

  if (sale.stripeSessionId) {
    const session = await client.checkout.sessions.retrieve(sale.stripeSessionId);
    if (paymentSucceeded(session)) return updateStripeSale(session, 'paid');
    if (session.status === 'open') await client.checkout.sessions.expire(session.id);
  }

  sale.status = 'cancelled';
  sale.cancelledAt = new Date().toISOString();
  await writeAppState(state);
  return sale;
}

export function createStripeHandler({ createClient = stripeClient } = {}) {
  return async function handler(request, response) {
    const method = String(request.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'DELETE'].includes(method)) {
      if (typeof response.setHeader === 'function') response.setHeader('Allow', 'GET, POST, DELETE');
      return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido para pagamentos.' });
    }

    try {
      requireAuthenticatedSession(request);
      const client = createClient();

      if (method === 'GET') {
        const sessionId = queryValue(request, 'session_id');
        if (!/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) {
          throw new ApiError(400, 'INVALID_STRIPE_SESSION', 'A sessão de pagamento informada é inválida.');
        }
        const session = await client.checkout.sessions.retrieve(sessionId);
        const sale = paymentSucceeded(session)
          ? await updateStripeSale(session, 'paid')
          : findSale(await readAppState(), String(session.metadata?.cellf_sale_id || session.client_reference_id || ''));
        return sendJson(response, 200, {
          saleId: sale.id,
          status: sale.status,
          paymentStatus: session.payment_status,
          paid: sale.status === 'paid'
        });
      }

      if (method === 'DELETE') {
        const saleId = queryValue(request, 'sale_id').trim();
        if (!/^[A-Za-z0-9._-]{1,128}$/.test(saleId)) throw new ApiError(400, 'INVALID_SALE_ID', 'A venda informada é inválida.');
        const sale = await cancelStripeSale(client, saleId);
        return sendJson(response, 200, { saleId: sale.id, status: sale.status, paid: sale.status === 'paid' });
      }

      const body = await readJsonBody(request, { maxBytes: 4 * 1024 });
      const saleId = String(body.saleId || '').trim();
      if (!/^[A-Za-z0-9._-]{1,128}$/.test(saleId)) throw new ApiError(400, 'INVALID_SALE_ID', 'A venda informada é inválida.');

      const state = await readAppState();
      const sale = findSale(state, saleId);
      if (!STRIPE_SALE_STATUSES.has(sale.status) || sale.payment !== 'stripe') {
        throw new ApiError(409, 'SALE_NOT_PAYABLE', 'Esta venda não está aguardando um pagamento pela Stripe.');
      }
      const amount = saleAmount(sale);
      const origin = requestOrigin(request);
      const customer = state.customers?.find(entry => entry.id === sale.customerId);
      const email = String(customer?.email || '').trim();
      const itemSummary = (sale.items || []).map(item => `${Number(item.quantity || 0)}× ${item.name}`).join(', ').slice(0, 500);

      const session = await client.checkout.sessions.create({
        mode: 'payment',
        client_reference_id: sale.id,
        metadata: { cellf_sale_id: sale.id },
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: amount,
            product_data: {
              name: `Compra CELLF · ${String(sale.id).toUpperCase()}`,
              description: itemSummary || 'Produtos e serviços CELLF'
            }
          }
        }],
        ...(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { customer_email: email } : {}),
        success_url: `${origin}/?stripe=success&session_id={CHECKOUT_SESSION_ID}#sales`,
        cancel_url: `${origin}/?stripe=cancel&sale_id=${encodeURIComponent(sale.id)}#sales`,
        locale: 'pt-BR'
      }, { idempotencyKey: `cellf-${sale.id}-${amount}-${String(sale.stripeAttemptId || 'initial')}` });

      sale.stripeSessionId = session.id;
      sale.paymentDetails = 'Stripe Checkout';
      sale.stripeCheckoutCreatedAt = new Date().toISOString();
      await writeAppState(state);
      return sendJson(response, 201, { saleId: sale.id, sessionId: session.id, url: session.url });
    } catch (error) {
      if (error?.type?.startsWith?.('Stripe')) {
        return sendApiError(response, new ApiError(502, 'STRIPE_UNAVAILABLE', 'A Stripe não conseguiu preparar o pagamento agora.'));
      }
      return sendApiError(response, error);
    }
  };
}

export default createStripeHandler();
