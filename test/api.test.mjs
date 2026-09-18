import assert from 'node:assert/strict';
import { test } from 'node:test';
import healthHandler from '../api/health.mjs';
import imeiHandler from '../api/imei.mjs';

function responseRecorder() {
  return {
    statusCode: null,
    headers: {},
    payload: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

function setToken(context, token) {
  const previous = process.env.INFOSIMPLES_TOKEN;
  if (token === undefined) delete process.env.INFOSIMPLES_TOKEN;
  else process.env.INFOSIMPLES_TOKEN = token;

  context.after(() => {
    if (previous === undefined) delete process.env.INFOSIMPLES_TOKEN;
    else process.env.INFOSIMPLES_TOKEN = previous;
  });
}

function replaceFetch(context, replacement) {
  const previous = globalThis.fetch;
  globalThis.fetch = replacement;
  context.after(() => { globalThis.fetch = previous; });
}

test('a função de disponibilidade identifica quando o token está ausente', context => {
  setToken(context, undefined);
  const response = responseRecorder();
  healthHandler({}, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { ok: true, imeiConfigured: false });
});

test('a função de disponibilidade identifica quando o token está configurado', context => {
  setToken(context, 'token-de-teste');
  const response = responseRecorder();
  healthHandler({}, response);

  assert.deepEqual(response.payload, { ok: true, imeiConfigured: true });
});

test('a consulta de IMEI aceita apenas requisições POST', async () => {
  const response = responseRecorder();
  await imeiHandler({ method: 'GET' }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, 'POST');
});

test('a consulta de IMEI rejeita números inválidos', async () => {
  const response = responseRecorder();
  await imeiHandler({ method: 'POST', body: { imei: '490154203237519' } }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.code, 'INVALID_IMEI');
});

test('a consulta de IMEI informa ausência de configuração sem expor credenciais', async context => {
  setToken(context, undefined);
  const response = responseRecorder();
  await imeiHandler({ method: 'POST', body: { imei: '490154203237518' } }, response);

  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.code, 'IMEI_API_NOT_CONFIGURED');
});

test('a consulta de IMEI encaminha o identificador normalizado ao provedor', async context => {
  setToken(context, 'token-de-teste');
  replaceFetch(context, async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.body.get('imei'), '490154203237518');
    assert.equal(options.body.get('token'), 'token-de-teste');
    return { ok: true, json: async () => ({ situacao: 'regular' }) };
  });

  const response = responseRecorder();
  await imeiHandler({ method: 'POST', body: { imei: '49 015420 323751 8' } }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, { situacao: 'regular' });
});

test('falhas do provedor de IMEI retornam uma resposta tratável pela interface', async context => {
  setToken(context, 'token-de-teste');
  replaceFetch(context, async () => ({ ok: false, json: async () => ({ erro: 'indisponível' }) }));

  const response = responseRecorder();
  await imeiHandler({ method: 'POST', body: { imei: '490154203237518' } }, response);

  assert.equal(response.statusCode, 502);
  assert.equal(response.payload.code, 'UPSTREAM_ERROR');
  assert.deepEqual(response.payload.details, { erro: 'indisponível' });
});

test('falhas inesperadas na consulta de IMEI recebem tratamento consistente', async context => {
  setToken(context, 'token-de-teste');
  replaceFetch(context, async () => { throw new Error('Falha simulada de rede'); });

  const response = responseRecorder();
  await imeiHandler({ method: 'POST', body: { imei: '490154203237518' } }, response);

  assert.equal(response.statusCode, 500);
  assert.equal(response.payload.code, 'SERVER_ERROR');
  assert.match(response.payload.message, /Falha simulada de rede/);
});
