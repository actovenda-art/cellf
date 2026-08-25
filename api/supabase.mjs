import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE_NAME = 'cellf_session';
export const SESSION_DURATION_SECONDS = 12 * 60 * 60;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_STATE_BYTES = 4 * 1024 * 1024;

const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

function requestHeader(request, name) {
  const headers = request.headers || {};
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const value = headers[name.toLowerCase()] ?? headers[name] ?? '';
  return Array.isArray(value) ? value[0] || '' : String(value);
}

function setHeader(response, name, value) {
  if (typeof response.setHeader === 'function') response.setHeader(name, value);
}

export function sendJson(response, status, payload) {
  setHeader(response, 'Content-Type', 'application/json; charset=utf-8');
  setHeader(response, 'Cache-Control', 'no-store, private');
  setHeader(response, 'X-Content-Type-Options', 'nosniff');

  if (typeof response.status === 'function' && typeof response.json === 'function') {
    return response.status(status).json(payload);
  }

  response.statusCode = status;
  response.end(JSON.stringify(payload));
  return response;
}

export function sendApiError(response, error) {
  if (error instanceof ApiError) {
    return sendJson(response, error.status, { code: error.code, message: error.message });
  }
  return sendJson(response, 500, {
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Não foi possível concluir a operação segura.'
  });
}

export async function readJsonBody(request, options = {}) {
  const maxBytes = options.maxBytes || 64 * 1024;
  let value = request.body;

  if (value === undefined) {
    if (typeof request.on !== 'function') value = '{}';
    else {
      value = await new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        let size = 0;
        let rejected = false;

        request.on('data', chunk => {
          if (rejected) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buffer.length;
          if (size > maxBytes) {
            rejected = true;
            rejectBody(new ApiError(413, 'PAYLOAD_TOO_LARGE', 'A requisição ultrapassa o tamanho permitido.'));
            return;
          }
          chunks.push(buffer);
        });
        request.on('end', () => {
          if (!rejected) resolveBody(Buffer.concat(chunks).toString('utf8'));
        });
        request.on('error', rejectBody);
      });
    }
  }

  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > maxBytes) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'A requisição ultrapassa o tamanho permitido.');
    }
    try {
      value = JSON.parse(value || '{}');
    } catch {
      throw new ApiError(400, 'INVALID_JSON', 'O conteúdo enviado não é um JSON válido.');
    }
  } else if (value !== undefined) {
    let serialized;
    try {
      serialized = JSON.stringify(value);
    } catch {
      throw new ApiError(400, 'INVALID_JSON', 'O conteúdo enviado não é um JSON válido.');
    }
    if (serialized && Buffer.byteLength(serialized, 'utf8') > maxBytes) {
      throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'A requisição ultrapassa o tamanho permitido.');
    }
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'INVALID_JSON', 'Envie um objeto JSON válido.');
  }
  return value;
}

export function isSupabaseConfigured() {
  return Boolean(
    String(process.env.SUPABASE_URL || '').trim()
    && String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

export function isAuthConfigured() {
  return Boolean(
    String(process.env.CELLF_APP_PASSWORD || '').trim()
    && String(process.env.CELLF_AUTH_SECRET || '').trim().length >= 32
  );
}

export function getSupabaseConfig() {
  if (!isSupabaseConfigured()) {
    throw new ApiError(
      503,
      'SUPABASE_NOT_CONFIGURED',
      'O armazenamento seguro da Cellf ainda não foi configurado.'
    );
  }

  let url;
  try {
    url = new URL(String(process.env.SUPABASE_URL).trim());
  } catch {
    throw new ApiError(503, 'SUPABASE_NOT_CONFIGURED', 'O endereço seguro do Supabase é inválido.');
  }

  const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new ApiError(503, 'SUPABASE_NOT_CONFIGURED', 'A conexão com o Supabase deve utilizar HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new ApiError(503, 'SUPABASE_NOT_CONFIGURED', 'O endereço seguro do Supabase é inválido.');
  }

  const bucket = String(process.env.SUPABASE_DOCUMENT_BUCKET || 'cellf-documents').trim();
  const stateId = String(process.env.SUPABASE_STATE_ID || 'cellf-primary').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(bucket) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(stateId)) {
    throw new ApiError(503, 'SUPABASE_NOT_CONFIGURED', 'A configuração do armazenamento seguro é inválida.');
  }

  return {
    url: url.toString().replace(/\/+$/, ''),
    secretKey: String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY).trim(),
    bucket,
    stateId
  };
}

export function assertSameOrigin(request) {
  const origin = requestHeader(request, 'origin').trim();
  if (!origin) return;

  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new ApiError(403, 'CROSS_ORIGIN_REQUEST', 'Esta operação exige acesso pela própria aplicação.');
  }

  const host = requestHeader(request, 'x-forwarded-host').split(',')[0].trim()
    || requestHeader(request, 'host').trim();
  const forwardedProtocol = requestHeader(request, 'x-forwarded-proto').split(',')[0].trim();
  const expectedProtocol = forwardedProtocol ? forwardedProtocol + ':' : '';

  if (!host || originUrl.host.toLowerCase() !== host.toLowerCase() || (expectedProtocol && originUrl.protocol !== expectedProtocol)) {
    throw new ApiError(403, 'CROSS_ORIGIN_REQUEST', 'Esta operação exige acesso pela própria aplicação.');
  }
}

function hmac(value) {
  return createHmac('sha256', String(process.env.CELLF_AUTH_SECRET || ''))
    .update(value)
    .digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieValue(request, name) {
  for (const cookie of requestHeader(request, 'cookie').split(';')) {
    const separator = cookie.indexOf('=');
    if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

export function verifyPassword(password) {
  if (!isAuthConfigured() || typeof password !== 'string' || password.length > 1024) return false;
  const expected = createHash('sha256').update(String(process.env.CELLF_APP_PASSWORD)).digest();
  const actual = createHash('sha256').update(password).digest();
  return timingSafeEqual(expected, actual);
}

export function issueSession() {
  if (!isAuthConfigured()) {
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'O acesso seguro da Cellf ainda não foi configurado.');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_DURATION_SECONDS;
  const payload = Buffer.from(JSON.stringify({
    sub: 'cellf-admin',
    iat: issuedAt,
    exp: expiresAt,
    jti: randomBytes(18).toString('base64url')
  })).toString('base64url');

  return {
    token: payload + '.' + hmac(payload),
    expiresAt: new Date(expiresAt * 1000).toISOString()
  };
}

export function readSession(request) {
  if (!isAuthConfigured()) return null;
  const token = cookieValue(request, SESSION_COOKIE_NAME);
  if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;

  const separator = token.lastIndexOf('.');
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  if (!safeEqual(signature, hmac(payload))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (
      session.sub !== 'cellf-admin'
      || !Number.isSafeInteger(session.iat)
      || !Number.isSafeInteger(session.exp)
      || session.iat > now + 60
      || session.exp <= now
      || session.exp - session.iat > SESSION_DURATION_SECONDS
    ) return null;
    return session;
  } catch {
    return null;
  }
}

export function requireAuthenticatedSession(request) {
  if (!isAuthConfigured()) {
    throw new ApiError(503, 'AUTH_NOT_CONFIGURED', 'O acesso seguro da Cellf ainda não foi configurado.');
  }
  const session = readSession(request);
  if (!session) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Entre com a senha da Cellf para acessar estes dados.');
  }
  if (!['GET', 'HEAD'].includes(String(request.method || 'GET').toUpperCase())) {
    assertSameOrigin(request);
  }
  return session;
}

export function setSessionCookie(response, request, token, maxAge = SESSION_DURATION_SECONDS) {
  const secure = requestHeader(request, 'x-forwarded-proto').split(',')[0].trim() === 'https'
    || process.env.VERCEL === '1';
  let value = SESSION_COOKIE_NAME + '=' + token
    + '; Path=/api; HttpOnly; SameSite=Strict; Max-Age=' + Math.max(0, Number(maxAge) || 0);
  if (secure) value += '; Secure';
  setHeader(response, 'Set-Cookie', value);
}

export function clearSessionCookie(response, request) {
  setSessionCookie(response, request, '', 0);
}

export function queryValue(request, name) {
  const direct = request.query?.[name];
  if (direct !== undefined) return Array.isArray(direct) ? String(direct[0] || '') : String(direct);
  try {
    return new URL(request.url || '/', 'http://localhost').searchParams.get(name) || '';
  } catch {
    return '';
  }
}

export async function supabaseRequest(path, options = {}) {
  const config = getSupabaseConfig();
  if (typeof path !== 'string' || !/^\/(?:rest|storage)\/v1\//.test(path)) {
    throw new ApiError(500, 'INVALID_UPSTREAM_PATH', 'A operação segura não pôde ser preparada.');
  }

  const headers = {
    apikey: config.secretKey,
    Accept: 'application/json',
    ...(options.headers || {})
  };

  // sb_secret_* é opaco e não deve ser enviado como Authorization: Bearer.
  if (JWT_PATTERN.test(config.secretKey)) {
    headers.Authorization = 'Bearer ' + config.secretKey;
  }

  let body;
  if (options.body !== undefined) {
    body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
    if (!headers['Content-Type'] && !headers['content-type']) {
      headers['Content-Type'] = 'application/json';
    }
  }

  let response;
  try {
    response = await fetch(config.url + path, {
      method: options.method || 'GET',
      headers,
      ...(body === undefined ? {} : { body }),
      signal: AbortSignal.timeout(options.timeout || 20_000)
    });
  } catch {
    throw new ApiError(503, 'SUPABASE_UNAVAILABLE', 'O armazenamento seguro está temporariamente indisponível.');
  }

  let payload = null;
  try {
    if (typeof response.json === 'function') payload = await response.json();
    else if (typeof response.text === 'function') {
      const text = await response.text();
      payload = text ? JSON.parse(text) : null;
    }
  } catch {
    payload = null;
  }

  if (!response.ok) {
    if (response.status === 404 && options.allowNotFound) return null;
    const status = response.status === 404 ? 404 : 502;
    const code = response.status === 404 ? 'RESOURCE_NOT_FOUND' : 'SUPABASE_UPSTREAM_ERROR';
    throw new ApiError(
      status,
      code,
      response.status === 404
        ? 'O recurso solicitado não foi encontrado no armazenamento seguro.'
        : 'O armazenamento seguro não conseguiu concluir a operação.'
    );
  }

  return payload;
}
