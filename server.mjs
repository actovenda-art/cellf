import http from 'node:http';
import { readFileSync, existsSync, createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');

function loadEnv() {
  const path = join(root, '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv();

const port = Number(process.env.PORT || 4173);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 32_000) reject(new Error('Payload muito grande'));
    });
    req.on('end', () => {
      try { resolveBody(JSON.parse(body || '{}')); } catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function isValidImei(value) {
  if (!/^\d{15}$/.test(value)) return false;
  const digits = [...value].map(Number);
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    let digit = digits[i] * (i % 2 === 1 ? 2 : 1);
    sum += digit > 9 ? digit - 9 : digit;
  }
  return (10 - (sum % 10)) % 10 === digits[14];
}

async function consultImei(req, res) {
  try {
    const { imei: rawImei } = await readBody(req);
    const imei = String(rawImei || '').replace(/\D/g, '');
    if (!isValidImei(imei)) return json(res, 400, { code: 'INVALID_IMEI', message: 'Informe um IMEI válido com 15 dígitos.' });

    const token = process.env.INFOSIMPLES_TOKEN;
    if (!token) {
      return json(res, 503, {
        code: 'IMEI_API_NOT_CONFIGURED',
        message: 'A integração está pronta, mas o token da Infosimples ainda não foi configurado.'
      });
    }

    const endpoint = process.env.INFOSIMPLES_ENDPOINT || 'https://api.infosimples.com/api/v2/consultas/anatel/celular-legal';
    const params = new URLSearchParams({ token, imei, timeout: '300' });
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: params,
      signal: AbortSignal.timeout(310_000)
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return json(res, 502, { code: 'UPSTREAM_ERROR', message: 'A Infosimples não concluiu a consulta.', details: payload });
    return json(res, 200, payload);
  } catch (error) {
    return json(res, 500, { code: 'SERVER_ERROR', message: error.message || 'Falha inesperada na consulta.' });
  }
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const relative = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  let file = resolve(publicDir, normalize(relative));
  if (!file.startsWith(resolve(publicDir))) return json(res, 403, { message: 'Acesso negado.' });
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(publicDir, 'index.html');
  res.writeHead(200, {
    'Content-Type': mime[extname(file)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin'
  });
  createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') return json(res, 200, { ok: true, imeiConfigured: Boolean(process.env.INFOSIMPLES_TOKEN) });
  if (req.method === 'POST' && req.url === '/api/imei') return consultImei(req, res);
  if (req.url.startsWith('/api/')) return json(res, 404, { message: 'Rota não encontrada.' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { message: 'Método não permitido.' });
  return serveStatic(req, res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Gestão Celular rodando em http://localhost:${port}`);
});
