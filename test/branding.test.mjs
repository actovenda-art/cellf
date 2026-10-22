import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import brandingHandler, { publicBranding } from '../api/branding.mjs';
import documentsHandler from '../api/documents.mjs';
import { issueSession } from '../api/supabase.mjs';
import { stateForAccess, mergeEmployeeState } from '../api/access.mjs';

function configure(t) {
  const values = { SUPABASE_URL: 'https://branding-example.supabase.co', SUPABASE_SECRET_KEY: 'sb_secret_test_only', SUPABASE_STATE_ID: 'cellf-primary', SUPABASE_DOCUMENT_BUCKET: 'cellf-documents', CELLF_ADMIN_EMAIL: 'admin@example.test', CELLF_APP_PASSWORD: 'example-test-password', CELLF_AUTH_SECRET: 'only-for-tests-secret-with-more-than-32-characters' };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  t.after(() => { for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
}
function response() { return { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(value) { this.statusCode = value; return this; }, json(value) { this.payload = value; }, end() {} }; }
const brand = { companyName: 'Minha empresa', slogan: 'Nossa marca', branding: { primaryColor: '#123456', secondaryColor: '#aabbcc', logo: { id: 'logo-123', fileName: 'private-file-name.png' } }, document: 'private-cnpj', phone: 'private-phone', managerName: 'private-manager' };

test('a identidade pública expõe somente nome, slogan, cores e a logo selecionada', async t => {
  configure(t);
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => [{ state: { settings: brand, companyDocuments: [{ id: 'secret-document' }] } }] }));
  const res = response();
  await brandingHandler({ method: 'GET', url: '/api/branding' }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.payload).sort(), ['branding', 'companyName', 'slogan']);
  assert.deepEqual(res.payload.branding.logo, { id: 'logo-123' });
  assert.doesNotMatch(JSON.stringify(res.payload), /private|secret-document/);
});

test('cores inválidas e caminhos arbitrários não são publicados', () => {
  const value = publicBranding({ branding: { primaryColor: 'red;background:url(x)', secondaryColor: '#xyz', logo: { id: '../company/document' } } });
  assert.equal(value.branding.primaryColor, '#d9f15a');
  assert.equal(value.branding.secondaryColor, '#00aeef');
  assert.equal(value.branding.logo, null);
  assert.equal(publicBranding(null).companyName, 'Cellf');
});

test('a rota da logo assina apenas o arquivo publicado do escopo branding', async t => {
  configure(t);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.includes('/rest/') ? [{ state: { settings: brand } }] : { signedURL: '/object/sign/cellf-documents/branding/logo-123?token=test' } };
  });
  const res = response();
  await brandingHandler({ method: 'GET', url: '/api/branding?asset=logo&id=company-secret' }, res);
  assert.equal(res.statusCode, 302);
  assert.match(res.headers.Location, /\/branding\/logo-123\?token=/);
  assert.ok(calls[1].url.endsWith('/branding/logo-123'));
  assert.equal(JSON.parse(calls[1].options.body).expiresIn, 300);
});

test('a rota da marca rejeita alterações públicas e redirecionamentos externos', async t => {
  configure(t);
  const denied = response();
  await brandingHandler({ method: 'POST', url: '/api/branding' }, denied);
  assert.equal(denied.statusCode, 405);
  t.mock.method(globalThis, 'fetch', async url => ({ ok: true, json: async () => url.includes('/rest/') ? [{ state: { settings: brand } }] : { signedURL: 'https://other.example/steal' } }));
  const res = response();
  await brandingHandler({ method: 'GET', url: '/api/branding?asset=logo' }, res);
  assert.equal(res.statusCode, 502);
  assert.equal(res.headers.Location, undefined);
});

test('colaboradores recebem a marca, mas suas gravações não alteram a identidade', () => {
  const access = { admin: false, name: 'Técnico', modules: ['orders'], financial: false };
  const original = { settings: brand, orders: [], products: [] };
  assert.deepEqual(stateForAccess(original, access).settings.branding, brand.branding);
  assert.deepEqual(mergeEmployeeState(original, { settings: { companyName: 'Alterada' } }, access).settings, brand);
});

test('o envio de branding aceita imagens limitadas e exige administrador', async t => {
  configure(t);
  let calls = 0;
  const employee = { id: '11111111-1111-1111-1111-111111111111', email: 'tech@example.test', version: 1, active: true, modules: ['orders'] };
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    return { ok: true, json: async () => url.includes('/rest/') ? [{ state: { users: [employee] } }] : { url: '/object/upload/sign/cellf-documents/branding/logo-test?token=test' } };
  });
  const invoke = async (body, token = issueSession().token) => {
    const res = response();
    await documentsHandler({ method: 'POST', url: '/api/documents?operation=upload-url', headers: { host: 'cellf.test', cookie: 'cellf_session=' + token }, body: { id: 'logo-test', scope: 'branding', fileName: 'logo.png', contentType: 'image/png', size: 100, ...body } }, res);
    return res;
  };
  assert.equal((await invoke({ size: 2 * 1024 * 1024 + 1 })).statusCode, 400);
  assert.equal((await invoke({ fileName: 'file.pdf', contentType: 'application/pdf' })).statusCode, 400);
  assert.equal(calls, 0);
  assert.equal((await invoke({})).statusCode, 200);
  assert.equal((await invoke({}, issueSession(employee.email, employee).token)).statusCode, 403);
});

test('a paleta normaliza cores e escolhe texto legível para fundos claros e escuros', () => {
  const context = createContext({});
  runInContext(readFileSync(new URL('../public/branding.js', import.meta.url), 'utf8'), context);
  const api = context.CellfBranding;
  assert.equal(api.foreground('#ffffff'), '#101410');
  assert.equal(api.foreground('#000000'), '#ffffff');
  assert.equal(api.normalize(null).primaryColor, '#d9f15a');
  assert.equal(api.normalize({ primaryColor: '#ABCDEF' }).primaryColor, '#abcdef');
  assert.equal(api.logoUrl({ branding: { logo: { id: '../documents' } } }), '/cellf-logo-brand.svg');
  assert.notEqual(api.textColor('#eeeeee'), '#eeeeee');
});
