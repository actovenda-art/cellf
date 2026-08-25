import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import documentsHandler from '../api/documents.mjs';
import sessionHandler from '../api/session.mjs';
import stateHandler from '../api/state.mjs';
import {
  getSupabaseConfig,
  isAuthConfigured,
  isSupabaseConfigured,
  issueSession,
  MAX_DOCUMENT_BYTES,
  MAX_STATE_BYTES,
  readSession,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_SECONDS,
  supabaseRequest,
  verifyPassword
} from '../api/supabase.mjs';

const VARIABLES = [
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_STATE_ID',
  'SUPABASE_DOCUMENT_BUCKET',
  'CELLF_APP_PASSWORD',
  'CELLF_AUTH_SECRET',
  'VERCEL'
];

function configured(context, overrides = {}) {
  const previous = new Map(VARIABLES.map(name => [name, process.env[name]]));
  const defaults = {
    SUPABASE_URL: 'https://cellf-example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_chave_falsa_exclusiva_dos_testes',
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_STATE_ID: undefined,
    SUPABASE_DOCUMENT_BUCKET: undefined,
    CELLF_APP_PASSWORD: 'senha-exclusiva-dos-testes',
    CELLF_AUTH_SECRET: 'segredo-falso-de-autenticacao-com-mais-de-trinta-e-dois-caracteres',
    VERCEL: undefined,
    ...overrides
  };

  for (const [name, value] of Object.entries(defaults)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  context.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

function recorder() {
  return {
    statusCode: null,
    headers: {},
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.payload = value;
      return this;
    }
  };
}

function request(method, options = {}) {
  const headers = {
    host: 'cellf.example.test',
    ...(options.headers || {})
  };

  if (options.authenticated !== false) {
    headers.cookie = SESSION_COOKIE_NAME + '=' + issueSession().token;
  }

  return {
    method,
    url: options.url || '/',
    headers,
    ...(options.body === undefined ? {} : { body: options.body }),
    ...(options.query === undefined ? {} : { query: options.query })
  };
}

function upstream(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  };
}

function fakeFetch(context, implementation) {
  const calls = [];

  context.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return implementation(url, options, calls);
  });

  return calls;
}

test('a autenticação exige senha e segredo com pelo menos 32 caracteres', context => {
  configured(context);
  assert.equal(isAuthConfigured(), true);
  assert.equal(verifyPassword('senha-exclusiva-dos-testes'), true);
  assert.equal(verifyPassword('senha-incorreta'), false);
  assert.equal(verifyPassword('x'.repeat(1025)), false);

  process.env.CELLF_AUTH_SECRET = 'curto';
  assert.equal(isAuthConfigured(), false);
  assert.equal(verifyPassword('senha-exclusiva-dos-testes'), false);
});

test('login sem configuração de segurança falha de forma fechada', async context => {
  configured(context, { CELLF_AUTH_SECRET: undefined });
  const response = recorder();

  await sessionHandler({
    method: 'POST',
    headers: { host: 'cellf.example.test' },
    body: { password: 'qualquer-senha' }
  }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.code, 'AUTH_NOT_CONFIGURED');
  assert.equal(response.headers['Set-Cookie'], undefined);
});

test('login inválido não emite sessão nem expõe a senha configurada', async context => {
  configured(context);
  const response = recorder();

  await sessionHandler(request('POST', {
    authenticated: false,
    body: { password: 'senha-incorreta' }
  }), response);

  assert.equal(response.statusCode, 401);
  assert.equal(response.payload.code, 'INVALID_CREDENTIALS');
  assert.equal(response.headers['Set-Cookie'], undefined);
  assert.ok(!JSON.stringify(response.payload).includes(process.env.CELLF_APP_PASSWORD));
});

test('login válido cria cookie assinado HttpOnly com SameSite Strict e expiração', async context => {
  configured(context);
  const response = recorder();

  await sessionHandler(request('POST', {
    authenticated: false,
    body: { password: 'senha-exclusiva-dos-testes' }
  }), response);

  const cookie = response.headers['Set-Cookie'];
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.authenticated, true);
  assert.ok(!Number.isNaN(Date.parse(response.payload.expiresAt)));
  assert.match(cookie, /^cellf_session=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+;/u);
  assert.match(cookie, /;\s*Path=\/api\b/u);
  assert.match(cookie, /;\s*HttpOnly\b/u);
  assert.match(cookie, /;\s*SameSite=Strict\b/u);
  assert.match(cookie, /;\s*Max-Age=43200\b/u);
  assert.ok(!('token' in response.payload));
  assert.equal(response.headers['Cache-Control'], 'no-store, private');
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
});

test('cookies de sessão recebem Secure em HTTPS e em publicações Vercel', async context => {
  configured(context);

  for (const headers of [
    { 'x-forwarded-proto': 'https' },
    {}
  ]) {
    if (!headers['x-forwarded-proto']) process.env.VERCEL = '1';

    const response = recorder();
    await sessionHandler(request('POST', {
      authenticated: false,
      headers,
      body: { password: 'senha-exclusiva-dos-testes' }
    }), response);

    assert.match(response.headers['Set-Cookie'], /;\s*Secure\b/u);
  }
});

test('sessões adulteradas, expiradas ou excessivamente longas não são aceitas', context => {
  configured(context);
  const valid = issueSession().token;
  const altered = valid.slice(0, -1) + (valid.endsWith('x') ? 'y' : 'x');

  assert.ok(readSession({ headers: { cookie: SESSION_COOKIE_NAME + '=' + valid } }));
  assert.equal(readSession({ headers: { cookie: SESSION_COOKIE_NAME + '=' + altered } }), null);
  assert.equal(readSession({ headers: { cookie: SESSION_COOKIE_NAME + '=' + 'x'.repeat(2049) } }), null);

  const now = Math.floor(Date.now() / 1000);
  const expiredPayload = Buffer.from(JSON.stringify({
    sub: 'cellf-admin',
    iat: now - 120,
    exp: now - 60
  })).toString('base64url');
  const expiredSignature = createHmac('sha256', process.env.CELLF_AUTH_SECRET)
    .update(expiredPayload)
    .digest('base64url');
  const expired = expiredPayload + '.' + expiredSignature;

  assert.equal(readSession({ headers: { cookie: SESSION_COOKIE_NAME + '=' + expired } }), null);
  assert.equal(SESSION_DURATION_SECONDS, 12 * 60 * 60);
});

test('a consulta de sessão informa autenticação sem devolver token ou senha', async context => {
  configured(context);

  for (const authenticated of [true, false]) {
    const response = recorder();
    await sessionHandler(request('GET', { authenticated }), response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.payload.authenticated, authenticated);
    assert.equal('token' in response.payload, false);
    assert.equal('password' in response.payload, false);
  }
});

test('encerrar a sessão limpa o cookie seguro', async context => {
  configured(context);
  const response = recorder();

  await sessionHandler(request('DELETE'), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { authenticated: false });
  assert.match(response.headers['Set-Cookie'], /^cellf_session=;/u);
  assert.match(response.headers['Set-Cookie'], /;\s*Max-Age=0\b/u);
  assert.match(response.headers['Set-Cookie'], /;\s*HttpOnly\b/u);
});

test('login, dados e documentos rejeitam alterações vindas de outra origem', async context => {
  configured(context);
  const scenarios = [
    [sessionHandler, request('POST', {
      authenticated: false,
      headers: { origin: 'https://intruso.example.test' },
      body: { password: 'senha-exclusiva-dos-testes' }
    })],
    [stateHandler, request('PUT', {
      headers: { origin: 'https://intruso.example.test' },
      body: { state: {} }
    })],
    [documentsHandler, request('DELETE', {
      url: '/api/documents?id=contrato-1',
      headers: { origin: 'https://intruso.example.test' }
    })]
  ];

  for (const [handler, input] of scenarios) {
    const response = recorder();
    await handler(input, response);

    assert.equal(response.statusCode, 403);
    assert.equal(response.payload.code, 'CROSS_ORIGIN_REQUEST');
  }
});

test('dados e documentos protegidos exigem sessão assinada', async context => {
  configured(context);

  for (const [handler, input] of [
    [stateHandler, request('GET', { authenticated: false })],
    [stateHandler, request('PUT', { authenticated: false, body: { state: {} } })],
    [documentsHandler, request('GET', {
      authenticated: false,
      url: '/api/documents?operation=download-url&id=contrato'
    })],
    [documentsHandler, request('POST', {
      authenticated: false,
      url: '/api/documents?operation=upload-url',
      body: {}
    })]
  ]) {
    const response = recorder();
    await handler(input, response);

    assert.equal(response.statusCode, 401);
    assert.equal(response.payload.code, 'AUTH_REQUIRED');
  }
});

test('sem conexão Supabase, rotas autenticadas não recorrem a armazenamento local', async context => {
  configured(context, { SUPABASE_SECRET_KEY: undefined });
  const response = recorder();

  assert.equal(isSupabaseConfigured(), false);
  await stateHandler(request('GET'), response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.code, 'SUPABASE_NOT_CONFIGURED');
});

test('o endereço e os identificadores do Supabase rejeitam configurações inseguras', context => {
  configured(context);

  for (const url of [
    'http://cellf-example.supabase.co',
    'https://usuario:senha@cellf-example.supabase.co',
    'https://cellf-example.supabase.co?token=segredo',
    'ftp://cellf-example.supabase.co'
  ]) {
    process.env.SUPABASE_URL = url;
    assert.throws(() => getSupabaseConfig(), { code: 'SUPABASE_NOT_CONFIGURED' });
  }

  process.env.SUPABASE_URL = 'https://cellf-example.supabase.co';
  process.env.SUPABASE_DOCUMENT_BUCKET = '../public';
  assert.throws(() => getSupabaseConfig(), { code: 'SUPABASE_NOT_CONFIGURED' });
  delete process.env.SUPABASE_DOCUMENT_BUCKET;
  process.env.SUPABASE_STATE_ID = '../outra-empresa';
  assert.throws(() => getSupabaseConfig(), { code: 'SUPABASE_NOT_CONFIGURED' });
});

test('GET do estado consulta o identificador correto e mantém a chave apenas no servidor', async context => {
  configured(context);
  const row = {
    state: { settings: { companyName: 'Cellf Nuvem' } },
    updated_at: '2026-08-24T12:00:00.000Z'
  };
  const calls = fakeFetch(context, async () => upstream([row]));
  const response = recorder();

  await stateHandler(request('GET'), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, {
    state: row.state,
    updatedAt: row.updated_at,
    source: 'supabase'
  });
  assert.match(calls[0].url, /^https:\/\/cellf-example\.supabase\.co\/rest\/v1\/cellf_app_state\?/u);
  assert.match(calls[0].url, /id=eq\.cellf-primary/u);
  assert.equal(calls[0].options.headers.apikey, process.env.SUPABASE_SECRET_KEY);
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.ok(!JSON.stringify(response.payload).includes(process.env.SUPABASE_SECRET_KEY));
});

test('GET de um projeto ainda vazio retorna estado nulo, sem erro', async context => {
  configured(context);
  fakeFetch(context, async () => upstream([]));
  const response = recorder();

  await stateHandler(request('GET'), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { state: null, updatedAt: null, source: 'supabase' });
});

test('PUT persiste o estado por upsert atômico e retorna o horário atualizado', async context => {
  configured(context, { SUPABASE_STATE_ID: 'cellf-filial' });
  const calls = fakeFetch(context, async (_url, options) => {
    const body = JSON.parse(options.body);
    return upstream([{ ...body, updated_at: '2026-08-24T14:00:00.000Z' }]);
  });
  const expected = { settings: { companyName: 'Cellf Filial' }, orders: [] };
  const response = recorder();

  await stateHandler(request('PUT', { body: { state: expected } }), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload.state, expected);
  assert.equal(response.payload.updatedAt, '2026-08-24T14:00:00.000Z');
  assert.match(calls[0].url, /\/rest\/v1\/cellf_app_state\?on_conflict=id$/u);
  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].options.headers.Prefer, /resolution=merge-duplicates/u);
  const stored = JSON.parse(calls[0].options.body);
  assert.equal(stored.id, 'cellf-filial');
  assert.deepEqual(stored.state, expected);
});

test('PUT rejeita estado ausente, listas e documentos maiores que quatro megabytes', async context => {
  configured(context);

  for (const state of [undefined, null, [], 'invalido', 10]) {
    const response = recorder();
    await stateHandler(request('PUT', { body: { state } }), response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.code, 'INVALID_STATE');
  }

  const tooLarge = recorder();
  await stateHandler(request('PUT', {
    body: { state: { value: 'x'.repeat(MAX_STATE_BYTES + 1) } }
  }), tooLarge);

  assert.equal(tooLarge.statusCode, 413);
  assert.equal(tooLarge.payload.code, 'PAYLOAD_TOO_LARGE');
});

test('falhas do Supabase não revelam segredos, mensagens internas ou credenciais', async context => {
  configured(context);
  fakeFetch(context, async () => upstream({
    message: 'segredo interno ' + process.env.SUPABASE_SECRET_KEY
  }, 500));
  const response = recorder();

  await stateHandler(request('GET'), response);

  assert.equal(response.statusCode, 502);
  assert.equal(response.payload.code, 'SUPABASE_UPSTREAM_ERROR');
  assert.ok(!JSON.stringify(response.payload).includes(process.env.SUPABASE_SECRET_KEY));
  assert.ok(!JSON.stringify(response.payload).includes('segredo interno'));
});

test('falhas de rede do Supabase informam indisponibilidade sem expor detalhes', async context => {
  configured(context);
  fakeFetch(context, async () => {
    throw new Error('falha interna: token-sensivel');
  });
  const response = recorder();

  await stateHandler(request('GET'), response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.code, 'SUPABASE_UNAVAILABLE');
  assert.ok(!JSON.stringify(response.payload).includes('token-sensivel'));
});

test('chaves opacas usam somente apikey e JWT legado usa também Authorization', async context => {
  configured(context);
  const calls = fakeFetch(context, async () => upstream({ ok: true }));

  await supabaseRequest('/rest/v1/cellf_app_state');
  assert.equal(calls[0].options.headers.Authorization, undefined);
  assert.equal(calls[0].options.headers.apikey, process.env.SUPABASE_SECRET_KEY);

  delete process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'cabecalho.payload.assinatura';
  await supabaseRequest('/rest/v1/cellf_app_state');

  assert.equal(calls[1].options.headers.apikey, 'cabecalho.payload.assinatura');
  assert.equal(calls[1].options.headers.Authorization, 'Bearer cabecalho.payload.assinatura');
});

test('o proxy rejeita caminhos fora das APIs autorizadas do Supabase', async context => {
  configured(context);

  for (const path of [
    'https://intruso.example.test/rest/v1/estado',
    '/auth/v1/admin/users',
    '/rest/v2/estado',
    '/storage/v2/object'
  ]) {
    await assert.rejects(supabaseRequest(path), { code: 'INVALID_UPSTREAM_PATH' });
  }
});

test('o envio gera URL assinada temporária em caminho privado determinístico', async context => {
  configured(context);
  const calls = fakeFetch(context, async () => upstream({
    url: '/object/upload/sign/cellf-documents/company/contrato-1?token=autorizacao-temporaria'
  }));
  const response = recorder();

  await documentsHandler(request('POST', {
    url: '/api/documents?operation=upload-url',
    body: {
      id: 'contrato-1',
      fileName: 'contrato-social.pdf',
      contentType: 'application/pdf',
      size: 2048
    }
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.path, 'company/contrato-1');
  assert.equal(response.payload.token, 'autorizacao-temporaria');
  assert.match(
    response.payload.signedUrl,
    /^https:\/\/cellf-example\.supabase\.co\/storage\/v1\/object\/upload\/sign\//u
  );
  assert.match(calls[0].url, /\/storage\/v1\/object\/upload\/sign\/cellf-documents\/company\/contrato-1$/u);
  assert.equal(calls[0].options.method, 'POST');
});

test('documentos inválidos, nomes maliciosos e formatos divergentes são recusados', async context => {
  configured(context);
  const base = {
    id: 'contrato-1',
    fileName: 'contrato.pdf',
    contentType: 'application/pdf',
    size: 100
  };
  const invalid = [
    [{ id: '../outra-empresa' }, 'INVALID_DOCUMENT_ID'],
    [{ id: 'id com espaços' }, 'INVALID_DOCUMENT_ID'],
    [{ fileName: '../contrato.pdf' }, 'INVALID_DOCUMENT_NAME'],
    [{ fileName: 'pasta\\contrato.pdf' }, 'INVALID_DOCUMENT_NAME'],
    [{ fileName: 'programa.exe', contentType: 'application/octet-stream' }, 'INVALID_DOCUMENT_TYPE'],
    [{ fileName: 'contrato.pdf', contentType: 'text/html' }, 'INVALID_DOCUMENT_TYPE'],
    [{ size: 0 }, 'INVALID_DOCUMENT_SIZE'],
    [{ size: MAX_DOCUMENT_BYTES + 1 }, 'INVALID_DOCUMENT_SIZE'],
    [{ size: 1.5 }, 'INVALID_DOCUMENT_SIZE']
  ];

  for (const [changes, code] of invalid) {
    const response = recorder();
    await documentsHandler(request('POST', {
      url: '/api/documents?operation=upload-url',
      body: { ...base, ...changes }
    }), response);

    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.code, code);
  }
});

test('URLs assinadas de outra origem ou sem autorização são recusadas', async context => {
  configured(context);
  let signedUrl = 'https://intruso.example.test/storage/v1/object/upload/sign/arquivo?token=x';
  fakeFetch(context, async () => upstream({ url: signedUrl }));

  for (const value of [
    'https://intruso.example.test/storage/v1/object/upload/sign/arquivo?token=x',
    'https://cellf-example.supabase.co/auth/v1/admin?token=x',
    '/object/upload/sign/cellf-documents/company/contrato-1'
  ]) {
    signedUrl = value;
    const response = recorder();
    await documentsHandler(request('POST', {
      url: '/api/documents?operation=upload-url',
      body: {
        id: 'contrato-1',
        fileName: 'contrato.pdf',
        contentType: 'application/pdf',
        size: 100
      }
    }), response);

    assert.equal(response.statusCode, 502);
    assert.equal(response.payload.code, 'INVALID_SIGNED_URL');
  }
});

test('download cria link privado com validade curta de cinco minutos', async context => {
  configured(context);
  const calls = fakeFetch(context, async () => upstream({
    signedURL: '/object/sign/cellf-documents/company/alvara-1?token=download-temporario'
  }));
  const response = recorder();

  await documentsHandler(request('GET', {
    url: '/api/documents?operation=download-url&id=alvara-1'
  }), response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.path, 'company/alvara-1');
  assert.match(response.payload.signedUrl, /token=download-temporario/u);
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { expiresIn: 300 });
});

test('remoção apaga somente o objeto privado correspondente ao identificador', async context => {
  configured(context);
  const calls = fakeFetch(context, async () => upstream([]));
  const response = recorder();

  await documentsHandler(request('DELETE', {
    url: '/api/documents?id=alvara-2'
  }), response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { removed: true, id: 'alvara-2' });
  assert.equal(calls[0].options.method, 'DELETE');
  assert.deepEqual(JSON.parse(calls[0].options.body), { prefixes: ['company/alvara-2'] });
});

test('operações e métodos HTTP incompatíveis retornam erros claros', async context => {
  configured(context);

  for (const [handler, input, allow] of [
    [sessionHandler, request('PATCH'), 'GET, POST, DELETE'],
    [stateHandler, request('DELETE'), 'GET, PUT'],
    [documentsHandler, request('PUT'), 'GET, POST, DELETE']
  ]) {
    const response = recorder();
    await handler(input, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.Allow, allow);
  }

  for (const [method, url] of [
    ['POST', '/api/documents?operation=desconhecida'],
    ['GET', '/api/documents?operation=desconhecida&id=contrato']
  ]) {
    const response = recorder();
    await documentsHandler(request(method, { url, body: {} }), response);
    assert.equal(response.statusCode, 400);
    assert.equal(response.payload.code, 'INVALID_OPERATION');
  }
});
