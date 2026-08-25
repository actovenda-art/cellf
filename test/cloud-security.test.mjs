import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const client = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const markup = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

test('o banco mantém um único estado JSON estruturado e registra a última atualização', () => {
  assert.match(schema, /create\s+table\s+if\s+not\s+exists\s+public\.cellf_app_state\s*\(/iu);
  assert.match(schema, /\bid\s+text\s+primary\s+key\b/iu);
  assert.match(schema, /\bstate\s+jsonb\s+not\s+null\b/iu);
  assert.match(schema, /\bupdated_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/iu);
  assert.match(schema, /check\s*\(\s*jsonb_typeof\(state\)\s*=\s*'object'\s*\)/iu);
});

test('a tabela pública ativa RLS e bloqueia visitantes e clientes autenticados', () => {
  assert.match(schema, /alter\s+table\s+public\.cellf_app_state\s+enable\s+row\s+level\s+security/iu);

  for (const role of ['public', 'anon', 'authenticated']) {
    assert.match(
      schema,
      new RegExp(
        '\\brevoke\\s+all\\s+on\\s+table\\s+public\\.cellf_app_state\\s+from\\s+' + role + '\\b',
        'iu'
      ),
      'O acesso do papel ' + role + ' deve ser revogado explicitamente.'
    );
  }

  assert.doesNotMatch(
    schema,
    /grant\s+(?:all|select|insert|update|delete)[^;]*\bto\s+(?:public|anon|authenticated)\b/iu
  );
  assert.doesNotMatch(schema, /using\s*\(\s*true\s*\)/iu);
});

test('somente a função privilegiada do servidor recebe acesso à tabela', () => {
  assert.match(schema, /grant\s+usage\s+on\s+schema\s+public\s+to\s+service_role/iu);
  assert.match(
    schema,
    /grant\s+select\s*,\s*insert\s*,\s*update\s+on\s+table\s+public\.cellf_app_state\s+to\s+service_role/iu
  );
  assert.doesNotMatch(schema, /\bsecurity\s+definer\b/iu);
});

test('o bucket de documentos nasce privado e continua privado em reaplicações', () => {
  assert.match(schema, /insert\s+into\s+storage\.buckets\s*\(/iu);
  assert.match(schema, /'cellf-documents'\s*,\s*'cellf-documents'\s*,\s*false/iu);
  assert.match(schema, /on\s+conflict\s*\(\s*id\s*\)\s+do\s+update/iu);
  assert.match(schema, /\bpublic\s*=\s*false\b/iu);
  assert.doesNotMatch(schema, /\bpublic\s*=\s*true\b/iu);
});

test('o bucket limita arquivos a dez megabytes e rejeita formatos executáveis', () => {
  assert.match(schema, /\b10485760\b/u);

  for (const type of ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv']) {
    assert.ok(schema.includes("'" + type + "'"), type + ' precisa estar na lista de tipos aceitos.');
  }

  for (const unsafe of ['text/html', 'image/svg+xml', 'application/javascript', 'application/x-msdownload']) {
    assert.ok(!schema.includes("'" + unsafe + "'"), unsafe + ' não pode ser aceito pelo bucket.');
  }
});

test('o frontend não contém chaves privilegiadas, tokens embutidos ou armazenamento local', () => {
  for (const pattern of [
    /\bSUPABASE_SECRET_KEY\b/u,
    /\bSUPABASE_SERVICE_ROLE_KEY\b/u,
    /\bCELLF_APP_PASSWORD\b/u,
    /\bCELLF_AUTH_SECRET\b/u,
    /\bsb_secret_[A-Za-z0-9_-]+/u,
    /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/iu
  ]) {
    assert.doesNotMatch(client, pattern);
    assert.doesNotMatch(markup, pattern);
  }
});

test('a documentação explica as variáveis privadas, RLS e a sessão HttpOnly', () => {
  for (const variable of [
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'CELLF_APP_PASSWORD',
    'CELLF_AUTH_SECRET'
  ]) {
    assert.ok(readme.includes(variable), 'A documentação precisa explicar ' + variable + '.');
  }

  assert.match(readme, /Row Level Security\s*\(RLS\)/iu);
  assert.match(readme, /bucket privado/iu);
  assert.match(readme, /\bHttpOnly\b/u);
  assert.match(readme, /urls assinadas/iu);
  assert.match(readme, /Vercel/u);
});
