import assert from 'node:assert/strict';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let baseUrl;
let server;

async function availablePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolveClose, rejectClose) => {
    probe.close(error => error ? rejectClose(error) : resolveClose());
  });
  return port;
}

before(async () => {
  const port = await availablePort();
  baseUrl = `http://127.0.0.1:${port}`;
  const environment = { ...process.env, PORT: String(port) };
  delete environment.INFOSIMPLES_TOKEN;

  server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let errors = '';
  server.stderr.on('data', chunk => { errors += chunk; });
  await Promise.race([
    once(server.stdout, 'data'),
    once(server, 'exit').then(([code]) => {
      throw new Error(`O servidor Cellf encerrou antes de iniciar (${code}): ${errors}`);
    }),
    new Promise((_, reject) => {
      const timeout = setTimeout(() => reject(new Error('O servidor Cellf não iniciou em 10 segundos.')), 10_000);
      timeout.unref();
    })
  ]);
});

after(async () => {
  if (!server || server.exitCode !== null) return;
  const closed = once(server, 'exit');
  server.kill();
  await closed;
});

test('a aplicação apresenta a marca Cellf e todos os módulos operacionais', async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.match(html, /Cellf/i);
  assert.match(html, /cellf-logo\.png/);

  for (const view of ['dashboard', 'orders', 'customers', 'products', 'services', 'sales', 'payables', 'reports', 'settings', 'agenda']) {
    assert.match(html, new RegExp(`data-view=["']${view}["']`), `O módulo ${view} precisa estar disponível na navegação.`);
  }
});

test('os arquivos de interface e a logo oficial são entregues com o formato correto', async () => {
  const files = [
    ['/styles.css', 'text/css'],
    ['/app.js', 'text/javascript'],
    ['/cellf-logo.png', 'image/png']
  ];

  await Promise.all(files.map(async ([path, type]) => {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 200, `${path} precisa estar disponível.`);
    assert.match(response.headers.get('content-type'), new RegExp(`^${type}`));
    assert.ok((await response.arrayBuffer()).byteLength > 0, `${path} não pode estar vazio.`);
  }));
});

test('rotas diretas da aplicação preservam o carregamento da SPA', async () => {
  const response = await fetch(`${baseUrl}/clientes`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Cellf/i);
});

test('a API de disponibilidade informa a situação da integração de IMEI', async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, imeiConfigured: false });
});

test('a API rejeita IMEIs inválidos com uma mensagem tratável pela interface', async () => {
  const response = await fetch(`${baseUrl}/api/imei`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imei: '123' })
  });

  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_IMEI');
});

test('a API identifica claramente quando a integração de IMEI ainda não foi configurada', async () => {
  const response = await fetch(`${baseUrl}/api/imei`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imei: '490154203237518' })
  });

  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'IMEI_API_NOT_CONFIGURED');
});

test('rotas desconhecidas da API retornam erros claros sem cair na interface', async () => {
  const response = await fetch(`${baseUrl}/api/inexistente`);
  assert.equal(response.status, 404);
  assert.match((await response.json()).message, /não encontrada/i);
});
