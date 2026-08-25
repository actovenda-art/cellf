import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createContext, Script } from 'node:vm';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

function functionSource(name) {
  const declaration = new RegExp(
    '(?:^|\\r?\\n)(?:async\\s+)?function\\s+' + name + '\\s*\\(',
    'u'
  );
  const match = declaration.exec(source);

  assert.ok(match, 'A função ' + name + ' precisa existir.');

  const start = match.index + (source[match.index] === '\r' ? 2 : source[match.index] === '\n' ? 1 : 0);
  const remainder = source.slice(start);
  const next = /\r?\n(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/u.exec(remainder);

  return next ? remainder.slice(0, next.index) : remainder;
}

const settingsSource = functionSource('renderSettings');
const uploadSource = functionSource('handleCompanyDocumentUpload');
const renderDocumentsSource = functionSource('renderCompanyDocuments');
const tabsDeclaration = source.match(/const SETTINGS_TABS\s*=\s*\[[\s\S]*?\];/u)?.[0];
const keyboardStart = source.indexOf("document.addEventListener('keydown', event => {");
const globalShortcutStart = source.indexOf('\n  if ((event.ctrlKey', keyboardStart);
const constants = source.match(
  /const MAX_COMPANY_DOCUMENT_BYTES[\s\S]*?(?=\r?\n\r?\nfunction localDate)/u
)?.[0];

assert.ok(tabsDeclaration, 'As seis sub-abas das configurações precisam ser declaradas.');
assert.ok(keyboardStart >= 0, 'A navegação por teclado das configurações precisa existir.');
assert.ok(globalShortcutStart > keyboardStart, 'Os atalhos das abas precisam preceder os atalhos globais.');
assert.ok(constants, 'As configurações de documentos empresariais precisam existir.');

const settingsKeyboardSource = source.slice(keyboardStart, globalShortcutStart) + '\n});';
const helpers = createContext({});
const helperProgram = [
  constants,
  "let cloudConnection = { status: 'connected', authenticated: true };",
  functionSource('formatCnpj'),
  functionSource('isValidCnpj'),
  functionSource('validateCompanyDocument'),
  functionSource('companyDocumentStorageAvailable'),
  'globalThis.companyHelpers = {',
  '  formatCnpj, isValidCnpj, validateCompanyDocument, companyDocumentStorageAvailable,',
  '  setCloudState(value) { cloudConnection = { ...cloudConnection, ...value }; },',
  '  maxBytes: MAX_COMPANY_DOCUMENT_BYTES,',
  '  allowedExtensions: Array.from(ALLOWED_COMPANY_DOCUMENT_EXTENSIONS),',
  '  allowedTypes: Array.from(ALLOWED_COMPANY_DOCUMENT_TYPES)',
  '};'
].join('\n');

new Script(helperProgram, { filename: 'company-helpers.test.js' }).runInContext(helpers, {
  timeout: 1_000
});

const company = helpers.companyHelpers;

function createTabHarness(initial = 'empresa') {
  const ids = ['empresa', 'responsavel', 'documentos', 'operacao', 'avisos', 'dados'];
  const elements = new Map();
  const listeners = new Map();
  class FakeElement {}

  for (const id of ids) {
    for (const selector of ['#settings-tab-' + id, '#' + id]) {
      const element = {
        id: selector.slice(1),
        hidden: false,
        focused: false,
        dataset: selector.startsWith('#settings-tab-') ? { tab: id } : {},
        attributes: new Map(),
        classes: new Set(),
        setAttribute(name, value) {
          this.attributes.set(name, String(value));
        },
        getAttribute(name) {
          return this.attributes.get(name) ?? null;
        },
        focus() {
          this.focused = true;
        },
        closest(selector) {
          return selector === '[role="tab"][data-action="settings-tab"]' && this.dataset.tab
            ? this
            : null;
        }
      };

      Object.setPrototypeOf(element, FakeElement.prototype);
      element.classList = {
        toggle(name, enabled) {
          if (enabled) element.classes.add(name);
          else element.classes.delete(name);
        }
      };
      elements.set(selector, element);
    }
  }

  const context = createContext({
    Element: FakeElement,
    document: {
      querySelector(selector) {
        return elements.get(selector) ?? null;
      },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      }
    }
  });
  const program = [
    tabsDeclaration,
    'let activeSettingsTab = ' + JSON.stringify(initial) + ';',
    functionSource('settingsPanelAttributes'),
    functionSource('activateSettingsTab'),
    settingsKeyboardSource,
    'globalThis.settingsTabHelpers = {',
    '  tabs: SETTINGS_TABS,',
    '  panelAttributes: settingsPanelAttributes,',
    '  activate: activateSettingsTab,',
    '  get active() { return activeSettingsTab; }',
    '};'
  ].join('\n');

  new Script(program, { filename: 'settings-tabs.test.js' }).runInContext(context, {
    timeout: 1_000
  });

  return { api: context.settingsTabHelpers, elements, listeners };
}

test('os dados empresariais permanecem em Configurações sem criar outro menu', () => {
  const views = Array.from(
    html.matchAll(/<button\b[^>]*class="[^"]*\bnav-item\b[^"]*"[^>]*data-view="([^"]+)"/gu),
    match => match[1]
  );

  assert.equal(views.length, 10);
  assert.equal(new Set(views).size, 10);
  assert.ok(views.includes('settings'));
  assert.ok(!views.includes('company'));
  assert.match(source, /\bsettings\s*:\s*renderSettings\b/u);
  assert.doesNotMatch(source, /\bcompany\s*:\s*renderCompany\b/u);
});

test('a tela mantém um único formulário para empresa, documentos e preferências', () => {
  const forms = Array.from(settingsSource.matchAll(/<form\b/gu));
  const closingForms = Array.from(settingsSource.matchAll(/<\/form>/gu));

  assert.equal(forms.length, 1, 'A tela não pode conter formulários aninhados.');
  assert.equal(closingForms.length, 1);
  assert.match(settingsSource, /<form\b[^>]*id="settings-form"/u);
  assert.match(settingsSource, /pageHeading\([^)]*'Configurações'/u);
});

test('as configurações apresentam exatamente seis sub-abas com títulos claros', () => {
  const { api } = createTabHarness();
  const expected = [
    ['empresa', 'Empresa'],
    ['responsavel', 'Administrador'],
    ['documentos', 'Documentos'],
    ['operacao', 'Operação'],
    ['avisos', 'Avisos'],
    ['dados', 'Privacidade']
  ];
  const actual = Array.from(api.tabs, tab => [tab.id, tab.label]);

  assert.equal(api.tabs.length, 6);
  assert.deepEqual(actual, expected);
  assert.match(readme, /sub-abas Empresa, Administrador, Documentos, Operação, Avisos e Privacidade/u);
});

test('as sub-abas utilizam os landmarks e os controles ARIA recomendados', () => {
  assert.match(
    settingsSource,
    /<nav\b(?=[^>]*\bclass="[^"]*\bsettings-tabs\b)(?=[^>]*\brole="tablist")(?=[^>]*\baria-label=)[^>]*>/u
  );
  assert.match(settingsSource, /SETTINGS_TABS\.map\(/u);
  assert.match(settingsSource, /<button\b[^>]*\brole="tab"/u);
  assert.match(settingsSource, /\baria-selected="/u);
  assert.match(settingsSource, /\baria-controls="/u);
  assert.match(settingsSource, /\btabindex="/u);
  assert.match(settingsSource, /data-action="settings-tab"/u);
  assert.match(settingsSource, /data-tab="/u);
  assert.doesNotMatch(settingsSource, /href="#(?:empresa|responsavel|documentos|operacao|avisos|dados)"/u);
});

test('cada painel possui nome associado à sua aba e somente Empresa inicia visível', () => {
  const { api } = createTabHarness();
  const rendered = Array.from(api.tabs, tab => ({
    id: tab.id,
    attributes: api.panelAttributes(tab.id)
  }));
  const visible = rendered.filter(panel => !/\bhidden\b/u.test(panel.attributes));

  assert.equal(api.active, 'empresa');
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, 'empresa');

  for (const panel of rendered) {
    assert.match(panel.attributes, /\brole="tabpanel"/u);
    assert.match(
      panel.attributes,
      new RegExp('\\baria-labelledby="settings-tab-' + panel.id + '"', 'u')
    );
    assert.match(panel.attributes, /\btabindex="0"/u);
    assert.match(
      settingsSource,
      new RegExp('<section\\b[^>]*id="' + panel.id + '"[^>]*settingsPanelAttributes\\(', 'u')
    );
  }
});

test('trocar a sub-aba mantém apenas um painel visível e atualiza o foco', () => {
  const { api, elements } = createTabHarness();

  assert.equal(api.activate('documentos', { focus: true }), true);
  assert.equal(api.active, 'documentos');

  for (const tab of api.tabs) {
    const button = elements.get('#settings-tab-' + tab.id);
    const panel = elements.get('#' + tab.id);
    const selected = tab.id === 'documentos';

    assert.equal(button.getAttribute('aria-selected'), String(selected));
    assert.equal(button.getAttribute('tabindex'), selected ? '0' : '-1');
    assert.equal(button.classes.has('active'), selected);
    assert.equal(panel.hidden, !selected);
  }

  assert.equal(elements.get('#settings-tab-documentos').focused, true);
});

test('uma sub-aba inexistente não altera o painel selecionado', () => {
  const { api } = createTabHarness();

  assert.equal(api.activate('inexistente'), false);
  assert.equal(api.active, 'empresa');
});

test('as setas percorrem as sub-abas nos dois sentidos e respeitam a navegação circular', () => {
  const scenarios = [
    ['empresa', 'ArrowLeft', 'dados'],
    ['dados', 'ArrowRight', 'empresa'],
    ['empresa', 'ArrowUp', 'dados'],
    ['dados', 'ArrowDown', 'empresa'],
    ['documentos', 'ArrowRight', 'operacao'],
    ['documentos', 'ArrowLeft', 'responsavel'],
    ['operacao', 'ArrowDown', 'avisos'],
    ['operacao', 'ArrowUp', 'documentos']
  ];

  for (const [initial, key, expected] of scenarios) {
    const { api, elements, listeners } = createTabHarness(initial);
    const event = {
      key,
      target: elements.get('#settings-tab-' + initial),
      prevented: false,
      preventDefault() {
        this.prevented = true;
      }
    };

    listeners.get('keydown')(event);

    assert.equal(api.active, expected, initial + ' + ' + key);
    assert.equal(event.prevented, true);
    assert.equal(elements.get('#settings-tab-' + expected).focused, true);
    assert.equal(
      Array.from(api.tabs, tab => elements.get('#' + tab.id)).filter(panel => !panel.hidden).length,
      1
    );
  }
});

test('Home e End levam às extremidades e teclas sem atalho não trocam a sub-aba', () => {
  for (const [initial, key, expected] of [
    ['dados', 'Home', 'empresa'],
    ['empresa', 'End', 'dados'],
    ['documentos', 'Tab', 'documentos']
  ]) {
    const { api, elements, listeners } = createTabHarness(initial);
    let prevented = false;

    listeners.get('keydown')({
      key,
      target: elements.get('#settings-tab-' + initial),
      preventDefault() {
        prevented = true;
      }
    });

    assert.equal(api.active, expected);
    assert.equal(prevented, key !== 'Tab');
  }
});

test('cliques selecionam a sub-aba e erros revelam automaticamente o painel inválido', () => {
  assert.match(
    source,
    /case\s+['"]settings-tab['"]\s*:\s*activateSettingsTab\(button\.dataset\.tab\)/u
  );
  assert.match(settingsSource, /addEventListener\(\s*['"]invalid['"]/u);
  assert.match(
    settingsSource,
    /if\s*\(\s*panel\s*&&\s*panel\.hidden\s*\)\s*activateSettingsTab\(panel\.id\)/u
  );
  assert.match(
    settingsSource,
    /if\s*\(\s*documentValue\s*&&\s*!isValidCnpj\(documentValue\)\s*\)\s*\{\s*activateSettingsTab\(['"]empresa['"]\)/u
  );
});

test('o formulário oferece apenas um botão global para salvar as configurações', () => {
  const submitButtons = Array.from(
    settingsSource.matchAll(/<button\b(?=[^>]*\btype="submit")[^>]*>/gu)
  );

  assert.equal(submitButtons.length, 1);
  assert.match(settingsSource, /class="[^"]*\bcompany-savebar\b[^"]*"/u);
  assert.match(settingsSource, /Salvar configurações/u);
  assert.match(settingsSource, /<button\b(?=[^>]*data-action="settings-tab")(?=[^>]*\btype="button")[^>]*>/u);
});

test('as configurações preservam seis seções para dados, documentos e preferências', () => {
  for (const section of ['empresa', 'responsavel', 'documentos', 'operacao', 'avisos', 'dados']) {
    assert.match(
      settingsSource,
      new RegExp('<section\\b[^>]*id="' + section + '"', 'u'),
      'A seção #' + section + ' precisa existir.'
    );
  }

  assert.match(settingsSource, /Dados da empresa/u);
  assert.match(settingsSource, /Administrador/u);
  assert.match(settingsSource, /Documentos/u);
});

test('os dados cadastrais incluem identidade, slogan, CNPJ, contato e endereço', () => {
  const fields = [
    'companyName', 'slogan', 'legalName', 'document',
    'managerName', 'managerRole', 'phone', 'email',
    'address', 'city', 'postalCode'
  ];

  for (const field of fields) {
    assert.match(
      settingsSource,
      new RegExp('<input\\b[^>]*\\bname="' + field + '"', 'u'),
      'O cadastro da empresa precisa incluir ' + field + '.'
    );
  }
});

test('nome da empresa e administrador continuam obrigatórios', () => {
  for (const field of ['companyName', 'managerName']) {
    assert.match(
      settingsSource,
      new RegExp('<input\\b(?=[^>]*\\bname="' + field + '")(?=[^>]*\\brequired\\b)[^>]*>', 'u'),
      field + ' precisa ser obrigatório.'
    );
  }
});

test('o CNPJ oferece máscara, teclado numérico e instrução acessível', () => {
  const input = settingsSource.match(/<input\b[^>]*id="company-cnpj"[^>]*>/u)?.[0];

  assert.ok(input);
  assert.match(input, /\bname="document"/u);
  assert.match(input, /\binputmode="numeric"/u);
  assert.match(input, /\bmaxlength="18"/u);
  assert.match(input, /\baria-describedby="company-cnpj-help"/u);
  assert.match(settingsSource, /id="company-cnpj-help"/u);
});

test('a máscara do CNPJ formata e limita corretamente os 14 dígitos', () => {
  assert.equal(company.formatCnpj('04252011000110'), '04.252.011/0001-10');
  assert.equal(company.formatCnpj('04.252.011/0001-10'), '04.252.011/0001-10');
  assert.equal(company.formatCnpj('04.252.011/0001-109999'), '04.252.011/0001-10');
  assert.equal(company.formatCnpj(''), '');
});

test('a validação de CNPJ rejeita dígitos inválidos e sequências repetidas', () => {
  assert.equal(company.isValidCnpj('04.252.011/0001-10'), true);
  assert.equal(company.isValidCnpj('04252011000110'), true);
  assert.equal(company.isValidCnpj('04.252.011/0001-11'), false);
  assert.equal(company.isValidCnpj('00.000.000/0000-00'), false);
  assert.equal(company.isValidCnpj('11.111.111/1111-11'), false);
  assert.equal(company.isValidCnpj('1234567890123'), false);
  assert.equal(company.isValidCnpj(''), false);
});

test('o formulário impede salvar CNPJ inválido e anuncia o erro', () => {
  assert.match(settingsSource, /!isValidCnpj\(documentValue\)/u);
  assert.match(settingsSource, /setCustomValidity\(/u);
  assert.match(settingsSource, /aria-invalid/u);
  assert.match(settingsSource, /reportValidity\(\)/u);
  assert.match(settingsSource, /toast\([^)]*CNPJ[^)]*'error'/u);
});

test('o estado inicial e a migração preservam slogan e metadados de documentos', () => {
  assert.match(source, /\bcompanyDocuments\s*:\s*\[\s*\]/u);
  assert.match(source, /\bslogan\s*:\s*['"]Reparo e Comércio['"]/u);
  assert.match(
    source,
    /companyDocuments\s*:\s*Array\.isArray\(stored\.companyDocuments\)/u
  );
  assert.match(settingsSource, /\bslogan\s*:\s*String\(form\.get\('slogan'\)/u);
});

test('a identidade exibida no sistema utiliza o slogan cadastrado', () => {
  const syncSource = functionSource('syncShell');

  assert.match(syncSource, /brandCaption\.textContent\s*=\s*state\.settings\.slogan/u);
  assert.match(settingsSource, /document\.title\s*=/u);
  assert.match(settingsSource, /state\.settings\.slogan/u);
});

test('a seção de documentos oferece nome explícito e seleção acessível de arquivo', () => {
  const nameInput = settingsSource.match(/<input\b[^>]*id="company-document-name"[^>]*>/u)?.[0];
  const fileInput = settingsSource.match(/<input\b[^>]*id="company-document-file"[^>]*>/u)?.[0];

  assert.ok(nameInput);
  assert.ok(fileInput);
  assert.match(nameInput, /\bname="companyDocumentName"/u);
  assert.match(fileInput, /\bname="companyDocumentFile"/u);
  assert.match(fileInput, /\btype="file"/u);
  assert.match(fileInput, /\baria-describedby="company-document-status"/u);
  assert.match(settingsSource, /<label\b[^>]*for="company-document-name"/u);
  assert.match(settingsSource, /<label\b[^>]*for="company-document-file"/u);
});

test('anexar documentos não dispara o envio do formulário principal', () => {
  const uploadButton = settingsSource.match(
    /<button\b[^>]*id="company-document-upload-button"[^>]*>/u
  )?.[0];

  assert.ok(uploadButton);
  assert.match(uploadButton, /\btype="button"/u);
  assert.match(uploadButton, /data-action="upload-company-document"/u);
});

test('o seletor aceita somente formatos empresariais previstos', () => {
  const fileInput = settingsSource.match(/<input\b[^>]*id="company-document-file"[^>]*>/u)?.[0];
  const accepted = fileInput?.match(/\baccept="([^"]+)"/u)?.[1]
    .split(',')
    .map(value => value.trim().replace(/^\./u, '').toLowerCase());
  const expected = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'];

  assert.deepEqual([...accepted].sort(), [...expected].sort());
  assert.deepEqual(Array.from(company.allowedExtensions).sort(), [...expected].sort());
});

test('arquivos empresariais válidos passam pela verificação de extensão e MIME', () => {
  const accepted = [
    ['contrato.pdf', 'application/pdf'],
    ['foto.JPG', 'image/jpeg'],
    ['alvara.png', 'image/png'],
    ['imagem.webp', 'image/webp'],
    ['documento.doc', 'application/msword'],
    ['planilha.xls', 'application/vnd.ms-excel'],
    ['texto.txt', 'text/plain'],
    ['relatorio.csv', 'text/csv']
  ];

  for (const [name, type] of accepted) {
    const result = company.validateCompanyDocument({ name, type, size: 2_048 });

    assert.equal(result.valid, true, name + ' deveria ser aceito.');
    assert.ok(result.extension);
  }
});

test('formatos perigosos, arquivos vazios e MIME incompatíveis são bloqueados', () => {
  const rejected = [
    null,
    { name: 'programa.exe', type: 'application/octet-stream', size: 2_048 },
    { name: 'pagina.html', type: 'text/html', size: 2_048 },
    { name: 'vetor.svg', type: 'image/svg+xml', size: 2_048 },
    { name: 'script.js', type: 'text/javascript', size: 2_048 },
    { name: 'contrato.pdf', type: 'text/html', size: 2_048 },
    { name: 'vazio.pdf', type: 'application/pdf', size: 0 },
    { name: 'sem-extensao', type: 'application/pdf', size: 100 }
  ];

  for (const file of rejected) {
    const result = company.validateCompanyDocument(file);

    assert.equal(result.valid, false, 'Arquivo inseguro não pode ser aceito.');
    assert.ok(result.error);
  }
});

test('o limite de documentos permanece em dez megabytes', () => {
  assert.equal(company.maxBytes, 10 * 1024 * 1024);

  const allowed = company.validateCompanyDocument({
    name: 'contrato.pdf',
    type: 'application/pdf',
    size: company.maxBytes
  });
  const oversized = company.validateCompanyDocument({
    name: 'contrato.pdf',
    type: 'application/pdf',
    size: company.maxBytes + 1
  });

  assert.equal(allowed.valid, true);
  assert.equal(oversized.valid, false);
  assert.match(oversized.error, /10 MB/iu);
  assert.match(settingsSource, /até 10 MB/u);
});

test('documentos binários utilizam o bucket privado por URLs assinadas', () => {
  const saveDocument = functionSource('saveCompanyDocument');
  const readDocument = functionSource('readCompanyDocument');
  const deleteDocument = functionSource('deleteCompanyDocument');

  assert.match(saveDocument, /\/api\/documents\?operation=upload-url/u);
  assert.match(saveDocument, /method:\s*['"]POST['"]/u);
  assert.match(saveDocument, /fetch\(upload\.signedUrl/u);
  assert.match(saveDocument, /method:\s*['"]PUT['"]/u);
  assert.match(saveDocument, /['"]x-upsert['"]:\s*['"]false['"]/u);
  assert.match(readDocument, /operation=download-url/u);
  assert.match(readDocument, /signedUrl/u);
  assert.match(deleteDocument, /\/api\/documents\?id=/u);
  assert.match(deleteDocument, /method:\s*['"]DELETE['"]/u);
  assert.doesNotMatch(source, /\blocalStorage\b|\bsessionStorage\b|\bindexedDB\b/iu);
});

test('os documentos são liberados apenas enquanto a sessão remota está autenticada', () => {
  assert.equal(company.companyDocumentStorageAvailable(), true);
  company.setCloudState({ authenticated: false, status: 'locked' });
  assert.equal(company.companyDocumentStorageAvailable(), false);
  company.setCloudState({ authenticated: true, status: 'connecting' });
  assert.equal(company.companyDocumentStorageAvailable(), false);
  company.setCloudState({ authenticated: true, status: 'connected' });
  assert.equal(company.companyDocumentStorageAvailable(), true);
  assert.match(settingsSource, /storageAvailable\s*\?\s*''\s*:\s*'disabled'/u);
  assert.match(settingsSource, /Supabase|nuvem/u);
  assert.match(uploadSource, /!companyDocumentStorageAvailable\(\)/u);
});

test('os metadados persistidos não incluem o conteúdo binário do arquivo', () => {
  const declaration = uploadSource.match(/const metadata\s*=\s*\{([^}]+)\}/u)?.[1];

  assert.ok(declaration);

  for (const key of ['id', 'name', 'filename', 'size', 'mimeType', 'createdAt']) {
    assert.match(
      declaration,
      new RegExp('(?:^|,)\\s*' + key + '(?:\\s*[:,]|\\s*$)', 'u'),
      'O documento precisa armazenar o metadado ' + key + '.'
    );
  }

  assert.doesNotMatch(declaration, /\bblob\b|\bbase64\b|\bdataUrl\b/iu);
  assert.match(uploadSource, /saveCompanyDocument\((?:metadata\.id|id),\s*file\)/u);
  assert.match(uploadSource, /storagePath/u);
  assert.match(uploadSource, /state\.companyDocuments\s*=\s*\[metadata/u);
});

test('o upload exige identificação, valida o arquivo e impede envios simultâneos', () => {
  assert.match(uploadSource, /if\s*\(!name\)/u);
  assert.match(uploadSource, /validateCompanyDocument\(file\)/u);
  assert.match(uploadSource, /companyDocumentUploadInFlight/u);
  assert.match(uploadSource, /button\.disabled\s*=\s*true/u);
  assert.match(uploadSource, /button\.disabled\s*=\s*false/u);
});

test('falhas na persistência revertem o documento e removem o binário remoto', () => {
  assert.match(uploadSource, /const previousDocuments\s*=\s*state\.companyDocuments/u);
  assert.match(uploadSource, /saveState\(\)/u);
  assert.match(uploadSource, /await flushStateSave\(\)/u);
  assert.match(uploadSource, /state\.companyDocuments\s*=\s*previousDocuments/u);
  assert.match(uploadSource, /deleteCompanyDocument\((?:metadata\.id|id)\)/u);
});

test('a lista de documentos exibe estado vazio, dados protegidos e ações acessíveis', () => {
  assert.match(renderDocumentsSource, /Nenhum documento anexado/u);
  assert.match(renderDocumentsSource, /esc\(item\.name\)/u);
  assert.match(renderDocumentsSource, /esc\(item\.filename\)/u);
  assert.match(renderDocumentsSource, /data-action="download-company-document"/u);
  assert.match(renderDocumentsSource, /data-action="remove-company-document"/u);
  assert.match(renderDocumentsSource, /aria-label="Baixar/u);
  assert.match(renderDocumentsSource, /aria-label="Remover/u);
  assert.match(settingsSource, /id="company-document-count"/u);
  assert.match(settingsSource, /id="company-document-list"/u);
});

test('as ações de anexar, baixar e remover estão conectadas à interface', () => {
  const actions = [
    ['upload-company-document', 'handleCompanyDocumentUpload'],
    ['download-company-document', 'downloadCompanyDocument'],
    ['remove-company-document', 'removeCompanyDocument']
  ];

  for (const [action, handler] of actions) {
    assert.match(
      source,
      new RegExp("case\\s+['\"]" + action + "['\"]\\s*:\\s*" + handler + "\\(", 'u'),
      'A ação ' + action + ' precisa acionar ' + handler + '.'
    );
  }
});

test('a remoção de documentos exige confirmação antes de apagar o arquivo', () => {
  const removeDocument = functionSource('removeCompanyDocument');

  assert.match(removeDocument, /window\.confirm\(/u);
  assert.match(removeDocument, /await deleteCompanyDocument\(id\)/u);
  assert.match(removeDocument, /state\.companyDocuments\.filter/u);
  assert.match(removeDocument, /renderCompanyDocuments\(\)/u);
});

test('documentos ficam em armazenamento remoto privado, sem chaves administrativas no cliente', () => {
  const binaryOperations = [
    functionSource('saveCompanyDocument'),
    functionSource('readCompanyDocument'),
    functionSource('deleteCompanyDocument'),
    uploadSource
  ].join('\n');

  assert.match(binaryOperations, /\bfetch\s*\(/u);
  assert.doesNotMatch(binaryOperations, /\bXMLHttpRequest\b/u);
  assert.doesNotMatch(source, /\bSUPABASE_SECRET_KEY\b|\bSUPABASE_SERVICE_ROLE_KEY\b/u);
  assert.doesNotMatch(source, /\bCELLF_APP_PASSWORD\b|\bCELLF_AUTH_SECRET\b/u);
  assert.match(settingsSource, /Supabase|bucket privado|armazenamento seguro/u);
  assert.match(readme, /Supabase Storage/u);
  assert.match(readme, /bucket privado/u);
  assert.match(readme, /HttpOnly/u);
  assert.match(readme, /Configurações.*Documentos.*(?:anexos|documentos)\s+empresariais/iu);
});
