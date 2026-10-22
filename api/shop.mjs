import Stripe from 'stripe';
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { ApiError, assertSameOrigin, getSupabaseConfig, queryValue, readJsonBody, sendApiError, sendJson, supabaseRequest } from './supabase.mjs';
import { accessFor, readRecord, writeRecord } from './access.mjs';
import { isStripeConfigured, updateStripeSale } from './stripe.mjs';

const COOKIE = 'cellf_customer';
const SESSION_SECONDS = 30 * 24 * 60 * 60;
const MAX_QUOTE_IMAGE = 850 * 1024;
const RESERVATION_MS = 36 * 60_000;
const CPF = /^\d{11}$/;
const PIN = /^\d{4}$/;
const stateId = () => getSupabaseConfig().stateId;
const digits = value => String(value || '').replace(/\D/g, '');
const money = value => Math.round(Number(value || 0) * 100) / 100;
const secret = () => {
  const value = String(process.env.CELLF_AUTH_SECRET || '');
  if (value.length < 32) throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'O acesso seguro da loja ainda não foi configurado.');
  return value;
};
const mac = value => createHmac('sha256', secret()).update(value).digest('base64url');

export function validCpf(value) {
  const cpf = digits(value);
  if (!CPF.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  for (const size of [9, 10]) {
    const sum = [...cpf.slice(0, size)].reduce((acc, char, index) => acc + Number(char) * (size + 1 - index), 0);
    const check = (sum * 10) % 11 % 10;
    if (check !== Number(cpf[size])) return false;
  }
  return true;
}

function accountRowId(cpf) { return 'cellf-customer-' + mac('cpf:' + cpf).slice(0, 48); }
function pinHash(pin, salt = randomBytes(16).toString('base64url')) {
  return `scrypt:${salt}:${scryptSync(pin + secret(), salt, 32).toString('base64url')}`;
}
function pinMatches(pin, encoded) {
  const match = /^scrypt:([A-Za-z0-9_-]{16,128}):([A-Za-z0-9_-]{43})$/.exec(String(encoded || ''));
  if (!PIN.test(String(pin || '')) || !match) return false;
  return timingSafeEqual(scryptSync(pin + secret(), match[1], 32), Buffer.from(match[2], 'base64url'));
}
function header(request, name) {
  const value = request.headers?.[name] ?? request.headers?.[name.toLowerCase()] ?? request.headers?.get?.(name) ?? '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}
function cookieValue(request) {
  const part = header(request, 'cookie').split(';').map(value => value.trim()).find(value => value.startsWith(COOKIE + '='));
  return part ? part.slice(COOKIE.length + 1) : '';
}
function setCookie(response, request, value, age = SESSION_SECONDS) {
  const secure = process.env.VERCEL === '1' || header(request, 'x-forwarded-proto').split(',')[0] === 'https';
  // Lax keeps the session available when Stripe redirects the browser back to the store.
  response.setHeader?.('Set-Cookie', `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`);
}
function issueSession(account) {
  const payload = Buffer.from(JSON.stringify({ id: account.id, rowId: account.rowId, version: account.sessionVersion, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString('base64url');
  return payload + '.' + mac('session:' + payload);
}
async function customerFor(request, required = true) {
  const token = cookieValue(request);
  const [payload, signature] = token.split('.');
  if (payload && signature && token.length < 1500 && /^[A-Za-z0-9_-]+$/.test(payload)) {
    const expected = mac('session:' + payload);
    const left = Buffer.from(expected), right = Buffer.from(signature);
    if (left.length === right.length && timingSafeEqual(left, right)) {
      let session;
      try { session = JSON.parse(Buffer.from(payload, 'base64url').toString()); }
      catch { session = null; }
      if (session && /^[0-9a-f-]{36}$/.test(session.id) && /^cellf-customer-[A-Za-z0-9_-]{43}$/.test(session.rowId) && session.exp > Date.now() / 1000) {
        const record = await readRecord(session.rowId);
        if (record?.state?.id === session.id && record.state.sessionVersion === session.version && record.state.active !== false) return { ...record.state, rowId: session.rowId, updatedAt: record.updated_at };
      }
    }
  }
  if (required) throw new ApiError(401, 'CUSTOMER_AUTH_REQUIRED', 'Entre com seu CPF e PIN para continuar.');
  return null;
}
async function saveAccount(account) {
  const { rowId, updatedAt, ...state } = account;
  const next = await writeRecord(rowId, state, updatedAt ? { updated_at: updatedAt } : null);
  return { ...state, rowId, updatedAt: next };
}
async function readMain() {
  const record = await readRecord();
  if (!record?.state || typeof record.state !== 'object') throw new ApiError(503, 'STORE_NOT_READY', 'A loja ainda não foi inicializada pelo proprietário.');
  return record;
}
async function mutateMain(change) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const record = await readMain();
    const next = structuredClone(record.state);
    const result = change(next);
    try { await writeRecord(stateId(), next, record); return result; }
    catch (error) { if (error.code !== 'STATE_CONFLICT' || attempt === 3) throw error; }
  }
}
function availableProducts(state) {
  const reserved = new Map();
  // The storefront and the in-store POS must count the same pending Stripe sales.
  for (const sale of state.sales || []) if (sale.payment === 'stripe' && sale.status === 'pending_payment') {
    for (const item of sale.items || []) reserved.set(item.productId, (reserved.get(item.productId) || 0) + Number(item.quantity || 0));
  }
  return (state.products || []).filter(product => product.online === true && Number(product.price) > 0 && Number(product.stock) > 0).map(product => ({
    id: product.id, name: product.name, category: product.category || 'Acessórios', description: String(product.description || '').slice(0, 500),
    price: money(product.price), available: Math.max(0, Number(product.stock) - (reserved.get(product.id) || 0))
  })).filter(product => product.available > 0);
}
function deliverySlots(state) {
  const now = Date.now();
  return (state.settings?.deliverySlots || []).filter(slot => {
    if (!slot?.id || !slot.date || !slot.start || !slot.end || new Date(`${slot.date}T${slot.end}:00-03:00`).getTime() < now) return false;
    const occupied = (state.sales || []).filter(sale => sale.deliverySlotId === slot.id && (sale.status === 'paid' || sale.status === 'pending_payment' && now - Date.parse(sale.createdAt) < RESERVATION_MS)).length;
    return occupied < Number(slot.capacity || 1);
  }).map(slot => ({ id: slot.id, date: slot.date, start: slot.start, end: slot.end, remaining: Number(slot.capacity || 1) - (state.sales || []).filter(sale => sale.deliverySlotId === slot.id && (sale.status === 'paid' || sale.status === 'pending_payment' && now - Date.parse(sale.createdAt) < RESERVATION_MS)).length }));
}
function ratingCounts(state) {
  const counts = new Map();
  for (const rating of state.shopRatings || []) {
    const current = counts.get(rating.productId) || { positive: 0, negative: 0 };
    if (rating.stars >= 4) current.positive++;
    if (rating.stars <= 2) current.negative++;
    counts.set(rating.productId, current);
  }
  return Object.fromEntries(counts);
}
function customerMatchesDocument(value, cpf) { return digits(value) === cpf; }
function customerRecords(state, account) {
  const approved = account.approved === true;
  const customerIds = new Set(approved ? (state.customers || []).filter(c => customerMatchesDocument(c.document, account.cpf)).map(c => c.id) : []);
  const sales = (state.sales || []).filter(s => s.shopAccountId === account.id || approved && (customerMatchesDocument(s.customerDocument, account.cpf) || customerIds.has(s.customerId))).map(s => ({
    id: s.id, status: s.status, createdAt: s.createdAt, paidAt: s.paidAt || '', total: money(s.total), deliveryFee: money(s.deliveryFee),
    attendanceType: s.attendanceType, deliverySlotId: s.deliverySlotId || '', items: (s.items || []).map(item => ({ productId: item.productId, name: item.name, quantity: item.quantity, unitPrice: money(item.unitPrice) })),
    warrantyDays: Number(s.warrantyDays ?? state.settings?.warrantyDays ?? 0)
  }));
  const orders = approved ? (state.orders || []).filter(o => customerMatchesDocument(o.customerDocument, account.cpf) || customerIds.has(o.customerId)).map(o => ({
    id: o.id, device: o.device, issue: o.issue, status: o.status, value: o.value == null ? null : money(o.value), createdAt: o.createdAt,
    dueAt: o.dueAt, deliveredAt: o.deliveredAt || '', warrantyDays: Number(o.warrantyDays ?? state.settings?.warrantyDays ?? 0),
    parts: (o.parts || []).map(part => ({ productId: part.productId, name: part.name, quantity: part.quantity }))
  })) : [];
  const quotes = (state.quoteRequests || []).filter(q => q.shopAccountId === account.id).map(q => ({ id: q.id, model: q.model, status: q.status, createdAt: q.createdAt }));
  const ratings = (state.shopRatings || []).filter(r => r.accountId === account.id).map(r => ({ sourceType: r.sourceType, sourceId: r.sourceId, productId: r.productId, stars: r.stars, comment: r.comment }));
  return { sales, orders, quotes, ratings, approved };
}
function validatedAddress(value) {
  const address = value && typeof value === 'object' ? value : {};
  const clean = key => String(address[key] || '').trim().slice(0, 120);
  const result = { postalCode: digits(address.postalCode), street: clean('street'), number: clean('number'), complement: clean('complement'), neighborhood: clean('neighborhood'), city: clean('city'), state: clean('state'), reference: clean('reference') };
  if (!/^\d{8}$/.test(result.postalCode) || !result.street || !result.number || !result.city || !/^[A-Za-z]{2}$/.test(result.state)) throw new ApiError(400, 'INVALID_ADDRESS', 'Informe CEP, rua, número, cidade e UF para entrega.');
  return result;
}
function addressText(address) { return `${address.street}, ${address.number}, ${address.neighborhood}, ${address.city} - ${address.state}, ${address.postalCode}, Brasil`; }
async function deliveryPrice(state, address) {
  const key = String(process.env.GOOGLE_MAPS_API_KEY || '').trim();
  const rate = Number(state.settings?.deliveryPricePerKm);
  const origin = [state.settings?.address, state.settings?.city, state.settings?.postalCode, 'Brasil'].filter(Boolean).join(', ');
  if (!key || !Number.isFinite(rate) || rate <= 0 || !state.settings?.address || !state.settings?.city) throw new ApiError(503, 'DELIVERY_NOT_CONFIGURED', 'A entrega aguarda a chave Google Maps, o endereço da loja e o valor por km configurados pelo proprietário.');
  let response;
  try {
    response = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'routes.distanceMeters' },
      body: JSON.stringify({ origin: { address: origin }, destination: { address: addressText(address) }, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_UNAWARE', languageCode: 'pt-BR', regionCode: 'BR' }),
      signal: AbortSignal.timeout(12_000)
    });
  } catch { throw new ApiError(503, 'ROUTE_UNAVAILABLE', 'Não foi possível calcular a rota de entrega agora. Tente novamente.'); }
  const data = await response.json().catch(() => ({}));
  const distanceMeters = Number(data.routes?.[0]?.distanceMeters);
  if (!response.ok || !Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new ApiError(422, 'ROUTE_NOT_FOUND', 'Não foi encontrada uma rota de carro até esse endereço. Confira os dados informados.');
  const km = Math.ceil(distanceMeters / 100) / 10;
  return { km, fee: money(km * rate), rate: money(rate) };
}
function stripeClient() {
  if (!isStripeConfigured()) throw new ApiError(503, 'STRIPE_NOT_CONFIGURED', 'A Stripe ainda não está configurada para pagamentos.');
  return new Stripe(process.env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2 });
}
function siteOrigin(request) {
  const host = header(request, 'x-forwarded-host').split(',')[0].trim() || header(request, 'host').trim();
  const protocol = header(request, 'x-forwarded-proto').split(',')[0].trim() || (process.env.VERCEL === '1' ? 'https' : 'http');
  if (!/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host) || !['http', 'https'].includes(protocol)) throw new ApiError(400, 'INVALID_RETURN_URL', 'Não foi possível preparar o retorno do pagamento.');
  return `${protocol}://${host}`;
}

async function uploadQuoteImage(data, id, side) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!match) throw new ApiError(400, 'INVALID_QUOTE_PHOTO', 'Envie fotos JPG, PNG ou WebP da frente e de trás.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > MAX_QUOTE_IMAGE) throw new ApiError(413, 'QUOTE_PHOTO_TOO_LARGE', 'Cada foto deve ter até 850 KB.');
  const kind = match[1];
  const valid = kind === 'jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 || kind === 'png' && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || kind === 'webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!valid) throw new ApiError(400, 'INVALID_QUOTE_PHOTO', 'O conteúdo da foto não corresponde ao formato informado.');
  const config = getSupabaseConfig();
  const path = `quotes/${id}-${side}.${kind === 'jpeg' ? 'jpg' : kind}`;
  const headers = { apikey: config.secretKey, 'Content-Type': `image/${kind}`, 'x-upsert': 'false' };
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(config.secretKey)) headers.Authorization = `Bearer ${config.secretKey}`;
  let response;
  try { response = await fetch(`${config.url}/storage/v1/object/${encodeURIComponent(config.bucket)}/${path}`, { method: 'POST', headers, body: bytes, signal: AbortSignal.timeout(20_000) }); }
  catch { throw new ApiError(503, 'SUPABASE_UNAVAILABLE', 'Não foi possível enviar a foto com segurança.'); }
  if (!response.ok) throw new ApiError(502, 'PHOTO_UPLOAD_FAILED', 'Não foi possível salvar a foto do aparelho.');
  return path;
}

async function handleGet(request, response, operation, createClient) {
  if (operation === 'catalog') {
    const state = (await readMain()).state;
    return sendJson(response, 200, { products: availableProducts(state), ratings: ratingCounts(state), deliverySlots: deliverySlots(state), deliveryEnabled: Boolean(process.env.GOOGLE_MAPS_API_KEY && Number(state.settings?.deliveryPricePerKm) > 0 && state.settings?.address) });
  }
  if (operation === 'session') {
    const account = await customerFor(request, false);
    if (!account) return sendJson(response, 200, { signedIn: false });
    const records = customerRecords((await readMain()).state, account);
    return sendJson(response, 200, { signedIn: true, account: { id: account.id, name: account.name, cpfLast4: account.cpf.slice(-4), approved: account.approved }, ...records });
  }
  if (operation === 'payment') {
    const account = await customerFor(request);
    const sessionId = queryValue(request, 'session_id');
    if (!/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(sessionId)) throw new ApiError(400, 'INVALID_PAYMENT', 'Pagamento inválido.');
    const sale = (await readMain()).state.sales?.find(entry => entry.stripeSessionId === sessionId && entry.shopAccountId === account.id);
    if (!sale) throw new ApiError(404, 'PAYMENT_NOT_FOUND', 'Compra não encontrada nesta conta.');
    const session = await createClient().checkout.sessions.retrieve(sessionId);
    if (session.payment_status === 'paid') await updateStripeSale(session, 'paid');
    return sendJson(response, 200, { saleId: sale.id, paid: session.payment_status === 'paid', status: session.payment_status });
  }
  if (operation === 'owner-accounts') {
    const access = await accessFor(request);
    if (!access.admin) throw new ApiError(403, 'OWNER_REQUIRED', 'Somente o proprietário pode aprovar contas de clientes.');
    const rows = await supabaseRequest('/rest/v1/cellf_app_state?select=id,state,updated_at&id=like.cellf-customer-*&limit=500');
    return sendJson(response, 200, { accounts: (rows || []).map(row => ({ id: row.state?.id, name: row.state?.name, cpf: row.state?.cpf, createdAt: row.state?.createdAt, approved: row.state?.approved === true })).filter(row => row.id) });
  }
  if (operation === 'owner-quotes') {
    const access = await accessFor(request);
    if (!access.admin && !access.modules.includes('orders')) throw new ApiError(403, 'ACCESS_DENIED', 'Acesso às solicitações de orçamento não autorizado.');
    return sendJson(response, 200, { quotes: ((await readMain()).state.quoteRequests || []).map(quote => ({
      id: quote.id, name: quote.name, phone: quote.phone, model: quote.model,
      details: quote.details, status: quote.status, createdAt: quote.createdAt
    })) });
  }
  if (operation === 'quote-photo') {
    const access = await accessFor(request);
    if (!access.admin && !access.modules.includes('orders')) throw new ApiError(403, 'ACCESS_DENIED', 'Acesso às fotos não autorizado.');
    const quote = (await readMain()).state.quoteRequests?.find(q => q.id === queryValue(request, 'id'));
    const side = queryValue(request, 'side');
    const path = side === 'front' ? quote?.frontPhoto : side === 'back' ? quote?.backPhoto : '';
    if (!path || !/^quotes\/[A-Za-z0-9-]+-(?:front|back)\.(?:jpg|png|webp)$/.test(path)) throw new ApiError(404, 'PHOTO_NOT_FOUND', 'Foto não encontrada.');
    const config = getSupabaseConfig();
    const signed = await supabaseRequest(`/storage/v1/object/sign/${encodeURIComponent(config.bucket)}/${path}`, { method: 'POST', body: { expiresIn: 120 } });
    const raw = signed?.signedURL || signed?.signedUrl;
    if (typeof raw !== 'string' || !raw) throw new ApiError(502, 'INVALID_SIGNED_URL', 'Não foi possível abrir a foto.');
    const url = new URL(raw.startsWith('http') ? raw : `${config.url}/storage/v1/${raw.replace(/^\/+/, '')}`);
    if (url.origin !== new URL(config.url).origin) throw new ApiError(502, 'INVALID_SIGNED_URL', 'Não foi possível abrir a foto.');
    return sendJson(response, 200, { url: url.href });
  }
  throw new ApiError(400, 'INVALID_OPERATION', 'Operação da loja desconhecida.');
}

async function handlePost(request, response, operation, createClient) {
  assertSameOrigin(request);
  if (operation === 'register') {
    const body = await readJsonBody(request, { maxBytes: 4 * 1024 });
    const cpf = digits(body.cpf), pin = String(body.pin || ''), name = String(body.name || '').trim().slice(0, 100), phone = digits(body.phone);
    if (!validCpf(cpf) || !PIN.test(pin) || name.length < 3 || phone.length < 10 || phone.length > 13) throw new ApiError(400, 'INVALID_CUSTOMER', 'Informe nome, telefone, CPF válido e um PIN de 4 dígitos.');
    const rowId = accountRowId(cpf);
    if (await readRecord(rowId)) throw new ApiError(409, 'ACCOUNT_EXISTS', 'Este CPF já possui conta. Entre com o PIN cadastrado.');
    const account = { id: randomUUID(), cpf, name, phone, pinHash: pinHash(pin), approved: false, active: true, failedAttempts: 0, lockedUntil: '', sessionVersion: randomBytes(16).toString('base64url'), createdAt: new Date().toISOString() };
    await saveAccount({ ...account, rowId });
    account.rowId = rowId;
    setCookie(response, request, issueSession(account));
    return sendJson(response, 201, { signedIn: true, account: { id: account.id, name, cpfLast4: cpf.slice(-4), approved: false } });
  }
  if (operation === 'login') {
    const body = await readJsonBody(request, { maxBytes: 2048 });
    const cpf = digits(body.cpf), pin = String(body.pin || '');
    if (!validCpf(cpf) || !PIN.test(pin)) throw new ApiError(401, 'INVALID_CUSTOMER_CREDENTIALS', 'CPF ou PIN incorretos.');
    const row = await readRecord(accountRowId(cpf));
    const account = row?.state && { ...row.state, rowId: accountRowId(cpf), updatedAt: row.updated_at };
    if (!account) throw new ApiError(401, 'INVALID_CUSTOMER_CREDENTIALS', 'CPF ou PIN incorretos.');
    if (Date.parse(account.lockedUntil) > Date.now()) throw new ApiError(429, 'ACCOUNT_LOCKED', 'Muitas tentativas. Tente novamente em 30 minutos.');
    if (!pinMatches(pin, account.pinHash)) {
      account.failedAttempts = Number(account.failedAttempts || 0) + 1;
      if (account.failedAttempts >= 5) { account.lockedUntil = new Date(Date.now() + 30 * 60_000).toISOString(); account.failedAttempts = 0; }
      await saveAccount(account);
      throw new ApiError(401, 'INVALID_CUSTOMER_CREDENTIALS', 'CPF ou PIN incorretos.');
    }
    account.failedAttempts = 0; account.lockedUntil = '';
    await saveAccount(account);
    setCookie(response, request, issueSession(account));
    return sendJson(response, 200, { signedIn: true, account: { id: account.id, name: account.name, cpfLast4: cpf.slice(-4), approved: account.approved } });
  }
  if (operation === 'logout') {
    const account = await customerFor(request, false);
    if (account) { account.sessionVersion = randomBytes(16).toString('base64url'); await saveAccount(account); }
    setCookie(response, request, '', 0);
    return sendJson(response, 200, { signedIn: false });
  }
  if (operation === 'delivery-quote') {
    const body = await readJsonBody(request, { maxBytes: 5 * 1024 });
    const state = (await readMain()).state;
    const address = validatedAddress(body.address);
    return sendJson(response, 200, await deliveryPrice(state, address));
  }
  if (operation === 'checkout') {
    const account = await customerFor(request);
    const body = await readJsonBody(request, { maxBytes: 8 * 1024 });
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 30) throw new ApiError(400, 'EMPTY_CART', 'Adicione produtos ao carrinho.');
    const requested = new Map();
    for (const item of body.items) {
      const id = String(item?.productId || '');
      const quantity = Number(item?.quantity);
      if (!/^[A-Za-z0-9._-]{1,128}$/.test(id) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 20) throw new ApiError(400, 'INVALID_CART', 'Confira as quantidades do carrinho.');
      requested.set(id, (requested.get(id) || 0) + quantity);
    }
    const fulfillment = body.fulfillment === 'delivery' ? 'delivery' : body.fulfillment === 'pickup' ? 'pickup' : '';
    if (!fulfillment) throw new ApiError(400, 'INVALID_FULFILLMENT', 'Escolha entrega ou retirada.');
    const address = fulfillment === 'delivery' ? validatedAddress(body.address) : null;
    const deliverySlotId = fulfillment === 'delivery' ? String(body.deliverySlotId || '') : '';
    const before = (await readMain()).state;
    if (fulfillment === 'delivery' && !deliverySlots(before).some(slot => slot.id === deliverySlotId)) throw new ApiError(409, 'SLOT_UNAVAILABLE', 'Escolha um horário de entrega disponível.');
    const route = address ? await deliveryPrice(before, address) : { km: 0, fee: 0, rate: 0 };
    const saleId = `web-${randomUUID()}`;
    const sale = await mutateMain(state => {
      const catalog = new Map(availableProducts(state).map(product => [product.id, product]));
      const items = [...requested].map(([productId, quantity]) => {
        const product = catalog.get(productId);
        if (!product || product.available < quantity) throw new ApiError(409, 'OUT_OF_STOCK', 'Um item do carrinho ficou indisponível. Atualize a vitrine.');
        return { productId, name: product.name, quantity, sku: state.products.find(p => p.id === productId)?.sku || '', unitPrice: product.price, cost: Number(state.products.find(p => p.id === productId)?.cost || 0) };
      });
      if (fulfillment === 'delivery' && !deliverySlots(state).some(slot => slot.id === deliverySlotId)) throw new ApiError(409, 'SLOT_UNAVAILABLE', 'Este horário de entrega acabou de esgotar.');
      const subtotal = money(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
      const total = money(subtotal + route.fee);
      if (!Number.isSafeInteger(Math.round(total * 100)) || total < 0.5 || total > 999_999.99) throw new ApiError(400, 'INVALID_TOTAL', 'O valor do pedido não pode ser processado.');
      const record = { id: saleId, shopAccountId: account.id, customerId: '', customer: account.name, customerDocument: account.cpf, customerPhone: account.phone,
        items, subtotal, discount: 0, deliveryFee: route.fee, deliveryKm: route.km, deliveryRate: route.rate, total,
        attendanceType: fulfillment === 'delivery' ? 'delivery' : 'counter_sale', deliveryAddress: address, deliverySlotId, payment: 'stripe', status: 'pending_payment',
        warrantyDays: Number(state.settings?.warrantyDays || 0), createdAt: new Date().toISOString() };
      state.sales ||= []; state.sales.unshift(record);
      return record;
    });
    try {
      const client = createClient();
      const origin = siteOrigin(request);
      const session = await client.checkout.sessions.create({
        mode: 'payment', client_reference_id: sale.id, metadata: { cellf_sale_id: sale.id },
        line_items: [{ quantity: 1, price_data: { currency: 'brl', unit_amount: Math.round(sale.total * 100), product_data: { name: `Compra CELLF · ${sale.id.slice(0, 12)}`, description: sale.items.map(item => `${item.quantity}× ${item.name}`).join(', ').slice(0, 500) } } }],
        success_url: `${origin}/?shop=success&session_id={CHECKOUT_SESSION_ID}#minha-conta`,
        cancel_url: `${origin}/?shop=cancel#vitrine-online`, locale: 'pt-BR', expires_at: Math.floor(Date.now() / 1000) + 35 * 60
      }, { idempotencyKey: `cellf-shop-${sale.id}` });
      await mutateMain(state => { const current = state.sales?.find(entry => entry.id === sale.id); if (current) current.stripeSessionId = session.id; });
      return sendJson(response, 201, { saleId: sale.id, url: session.url });
    } catch (error) {
      await mutateMain(state => { const current = state.sales?.find(entry => entry.id === sale.id); if (current && current.status === 'pending_payment') current.status = 'payment_failed'; }).catch(() => {});
      if (error instanceof ApiError) throw error;
      throw new ApiError(502, 'STRIPE_UNAVAILABLE', 'Não foi possível iniciar o pagamento. Tente novamente.');
    }
  }
  if (operation === 'quote-request') {
    const body = await readJsonBody(request, { maxBytes: 2_200_000 });
    const account = await customerFor(request, false);
    const name = account?.name || String(body.name || '').trim().slice(0, 100);
    const phone = account?.phone || digits(body.phone);
    const model = String(body.model || '').trim().slice(0, 120);
    const details = String(body.details || '').trim().slice(0, 2000);
    if (name.length < 3 || phone.length < 10 || model.length < 3 || details.length < 10 || String(body.website || '').trim()) throw new ApiError(400, 'INVALID_QUOTE', 'Informe nome, telefone, modelo e detalhes do aparelho.');
    const clientIp = (header(request, 'x-vercel-forwarded-for') || header(request, 'x-forwarded-for') || header(request, 'remote-addr')).split(',')[0].trim().slice(0, 80);
    const sourceHash = clientIp ? mac('quote-source:' + clientIp).slice(0, 24) : '';
    const recent = sourceHash ? (await readMain()).state.quoteRequests?.filter(quote => quote.sourceHash === sourceHash && Date.now() - Date.parse(quote.createdAt) < 24 * 60 * 60_000).length || 0 : 0;
    if (recent >= 3) throw new ApiError(429, 'QUOTE_LIMIT', 'Você atingiu o limite diário de solicitações. Fale com a loja para continuar.');
    const id = `quote-${randomUUID()}`;
    const frontPhoto = await uploadQuoteImage(body.frontPhoto, id, 'front');
    const backPhoto = await uploadQuoteImage(body.backPhoto, id, 'back');
    const quote = { id, shopAccountId: account?.id || '', cpf: account?.cpf || '', name, phone, model, details, frontPhoto, backPhoto, sourceHash, status: 'new', createdAt: new Date().toISOString() };
    await mutateMain(state => { state.quoteRequests ||= []; state.quoteRequests.unshift(quote); });
    return sendJson(response, 201, { id, status: 'new' });
  }
  if (operation === 'rate') {
    const account = await customerFor(request);
    const body = await readJsonBody(request, { maxBytes: 3 * 1024 });
    const sourceType = String(body.sourceType || ''), sourceId = String(body.sourceId || ''), productId = String(body.productId || '');
    const stars = Number(body.stars), comment = String(body.comment || '').trim().slice(0, 500);
    if (!['sale', 'order'].includes(sourceType) || !Number.isSafeInteger(stars) || stars < 1 || stars > 5) throw new ApiError(400, 'INVALID_RATING', 'Escolha de 1 a 5 estrelas.');
    await mutateMain(state => {
      const own = customerRecords(state, account);
      const entitled = sourceType === 'sale' ? own.sales.some(s => s.id === sourceId && s.status === 'paid' && s.items.some(i => i.productId === productId)) : own.orders.some(o => o.id === sourceId && o.status === 'delivered' && o.parts.some(p => p.productId === productId));
      if (!entitled) throw new ApiError(403, 'RATING_NOT_ALLOWED', 'Você só pode avaliar um produto comprado ou uma peça de serviço concluído.');
      state.shopRatings ||= [];
      const existing = state.shopRatings.find(r => r.accountId === account.id && r.sourceType === sourceType && r.sourceId === sourceId && r.productId === productId);
      if (existing) { existing.stars = stars; existing.comment = comment; existing.updatedAt = new Date().toISOString(); }
      else state.shopRatings.push({ id: `rating-${randomUUID()}`, accountId: account.id, sourceType, sourceId, productId, stars, comment, createdAt: new Date().toISOString() });
    });
    return sendJson(response, 200, { saved: true });
  }
  if (operation === 'owner-approve') {
    const access = await accessFor(request);
    if (!access.admin) throw new ApiError(403, 'OWNER_REQUIRED', 'Somente o proprietário pode aprovar contas de clientes.');
    const body = await readJsonBody(request, { maxBytes: 1024 });
    const cpf = digits(body.cpf);
    if (!validCpf(cpf)) throw new ApiError(400, 'INVALID_CPF', 'CPF inválido.');
    const row = await readRecord(accountRowId(cpf));
    if (!row?.state || row.state.id !== body.id) throw new ApiError(404, 'ACCOUNT_NOT_FOUND', 'Conta não encontrada.');
    const account = { ...row.state, rowId: accountRowId(cpf), updatedAt: row.updated_at, approved: Boolean(body.approved) };
    await saveAccount(account);
    return sendJson(response, 200, { id: account.id, approved: account.approved });
  }
  throw new ApiError(400, 'INVALID_OPERATION', 'Operação da loja desconhecida.');
}

export function createShopHandler({ createClient = stripeClient } = {}) {
  return async function handler(request, response) {
    const method = String(request.method || 'GET').toUpperCase();
    const operation = queryValue(request, 'operation');
    try {
      if (method === 'GET') return await handleGet(request, response, operation, createClient);
      if (method === 'POST') return await handlePost(request, response, operation, createClient);
      response.setHeader?.('Allow', 'GET, POST');
      return sendJson(response, 405, { code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' });
    } catch (error) { return sendApiError(response, error); }
  };
}

export default createShopHandler();
