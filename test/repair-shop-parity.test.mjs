import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const documentsApi = readFileSync(new URL('../api/documents.mjs', import.meta.url), 'utf8');

test('ordens reúnem orçamento, checklist, descrição técnica e evidências', () => {
  assert.match(app, /QUOTE_STATUS_LABELS/u);
  assert.match(app, /DEVICE_CHECKLIST/u);
  assert.match(app, /name="technicalDescription"/u);
  assert.match(app, /name="deviceCondition"/u);
  assert.match(app, /data-action="add-order-photo"/u);
  assert.match(css, /\.device-checklist/u);
  assert.match(css, /\.photo-evidence-list/u);
});

test('fotos das ordens usam escopo privado próprio no Supabase Storage', () => {
  assert.match(app, /saveCompanyDocument\(photo\.storageId, file, 'orders'\)/u);
  assert.match(app, /readCompanyDocument\(photo\.storageId, 'orders'\)/u);
  assert.match(app, /deleteCompanyDocument\(photo\.storageId, 'orders'\)/u);
  assert.match(documentsApi, /\['company', 'orders'\]/u);
  assert.doesNotMatch(app, /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/iu);
});

test('a operação oferece mesa técnica, mensagens por etapa e impressão profissional', () => {
  assert.match(app, /MESA TÉCNICA/u);
  assert.match(app, /function orderWhatsappMessage/u);
  for (const action of ['print-order-quote', 'print-service-order', 'print-order-thermal', 'print-order-label']) {
    assert.match(app, new RegExp(`data-action="${action}"`, 'u'));
  }
  assert.match(app, /thermal80/u);
  assert.match(app, /thermal58/u);
});

test('relatórios acompanham conversão e oportunidades dos orçamentos', () => {
  assert.match(app, /CONVERSÃO DE ORÇAMENTOS/u);
  assert.match(app, /OPORTUNIDADE PENDENTE/u);
  assert.match(app, /ORÇAMENTOS RECUSADOS/u);
  assert.match(app, /TÍQUETE MÉDIO APROVADO/u);
});
