import Stripe from 'stripe';
import { ApiError, sendApiError, sendJson } from './supabase.mjs';
import { isStripeConfigured, updateStripeSale } from './stripe.mjs';

export const config = { api: { bodyParser: false } };

function headerValue(request, name) {
  const headers = request.headers || {};
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const value = headers[name.toLowerCase()] ?? headers[name] ?? '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

async function rawBody(request, maxBytes = 1024 * 1024) {
  if (Buffer.isBuffer(request.body)) return request.body;
  if (typeof request.body === 'string') return Buffer.from(request.body);
  if (typeof request.on !== 'function') return Buffer.alloc(0);
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += value.length;
      if (size > maxBytes) return reject(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'O evento da Stripe ultrapassa o tamanho permitido.'));
      chunks.push(value);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

export function createStripeWebhookHandler({ StripeClass = Stripe } = {}) {
  return async function handler(request, response) {
    if (String(request.method || '').toUpperCase() !== 'POST') {
      if (typeof response.setHeader === 'function') response.setHeader('Allow', 'POST');
      return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido para o webhook.' });
    }

    try {
      const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
      const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
      if (!isStripeConfigured() || !/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret)) {
        throw new ApiError(503, 'STRIPE_NOT_CONFIGURED', 'O webhook da Stripe ainda não foi configurado.');
      }

      const signature = headerValue(request, 'stripe-signature');
      if (!signature) throw new ApiError(400, 'INVALID_STRIPE_SIGNATURE', 'A assinatura do evento da Stripe está ausente.');
      const body = await rawBody(request);
      const client = new StripeClass(secretKey, { maxNetworkRetries: 2 });
      let event;
      try {
        event = client.webhooks.constructEvent(body, signature, webhookSecret);
      } catch {
        throw new ApiError(400, 'INVALID_STRIPE_SIGNATURE', 'A assinatura do evento da Stripe é inválida.');
      }

      if (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') {
        await updateStripeSale(event.data.object, 'paid');
      } else if (event.type === 'checkout.session.async_payment_succeeded') {
        await updateStripeSale(event.data.object, 'paid');
      } else if (event.type === 'checkout.session.async_payment_failed') {
        await updateStripeSale(event.data.object, 'payment_failed');
      } else if (event.type === 'checkout.session.expired') {
        await updateStripeSale(event.data.object, 'cancelled');
      }

      return sendJson(response, 200, { received: true });
    } catch (error) {
      return sendApiError(response, error);
    }
  };
}

export default createStripeWebhookHandler();
