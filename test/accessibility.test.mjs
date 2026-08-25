import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

const expectedViews = [
  'dashboard',
  'orders',
  'customers',
  'products',
  'services',
  'sales',
  'payables',
  'reports',
  'settings',
  'agenda'
];

function attributesOf(openingTag) {
  const attributes = {};
  const source = openingTag
    .replace(/^<[\w:-]+\s*/u, '')
    .replace(/\/?>$/u, '');
  const attributePattern = /([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/gu;

  for (const [, name, doubleQuoted, singleQuoted, unquoted] of source.matchAll(attributePattern)) {
    attributes[name.toLowerCase()] = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
  }

  return attributes;
}

function openingTags(tagName) {
  const pattern = new RegExp('<' + tagName + '\\b[^>]*>', 'giu');

  return Array.from(html.matchAll(pattern), match => attributesOf(match[0]));
}

function hasClass(attributes, className) {
  return (attributes.class ?? '').split(/\s+/u).includes(className);
}

function elementById(id) {
  const pattern = /<[a-z][\w:-]*\b[^>]*>/giu;
  const element = Array.from(html.matchAll(pattern), match => attributesOf(match[0]))
    .find(attributes => attributes.id === id);

  assert.ok(element, 'O elemento #' + id + ' precisa existir.');

  return element;
}

function metaContent(name) {
  const meta = openingTags('meta').find(attributes => attributes.name === name);

  assert.ok(meta, 'A meta tag ' + name + ' precisa existir.');

  return meta.content;
}

function buttonLabels() {
  const pattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/giu;

  return Array.from(html.matchAll(pattern), ([, source, content]) => ({
    attributes: attributesOf('<button ' + source + '>'),
    label: content.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ').trim()
  }));
}

test('o documento declara português brasileiro e codificação UTF-8', () => {
  const documentElement = openingTags('html')[0];
  const charset = openingTags('meta').find(attributes => 'charset' in attributes);

  assert.equal(documentElement?.lang, 'pt-BR');
  assert.equal(charset?.charset.toUpperCase(), 'UTF-8');
});

test('a página oferece viewport responsivo sem bloquear ampliação', () => {
  const viewport = metaContent('viewport');

  assert.match(viewport, /width\s*=\s*device-width/iu);
  assert.match(viewport, /initial-scale\s*=\s*1(?:\.0)?/iu);
  assert.doesNotMatch(viewport, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?(?:,|$)/iu);
});

test('a identidade oficial Cellf aparece nos metadados e no título', () => {
  const title = html.match(/<title>([^<]+)<\/title>/iu)?.[1];
  const description = metaContent('description');

  assert.equal(metaContent('application-name'), 'Cellf');
  assert.equal(metaContent('theme-color').toLowerCase(), '#e0f967');
  assert.match(title ?? '', /^Cellf\s*[—-]\s*Reparo e Comércio$/u);
  assert.match(description, /Cellf/iu);
  assert.match(description, /assistência técnica/iu);
  assert.doesNotMatch(html, /NEXO\s+MOBILE/iu);
});

test('a logo oficial tem descrição acessível e também é usada como favicon', () => {
  const logo = openingTags('img').find(attributes => hasClass(attributes, 'brand-logo'));
  const favicon = openingTags('link').find(attributes => attributes.rel === 'icon');

  assert.equal(logo?.src, '/cellf-logo.png');
  assert.match(logo?.alt ?? '', /Cellf.*Reparo e Comércio/iu);
  assert.ok(Number(logo?.width) > 0, 'A logo precisa declarar largura.');
  assert.ok(Number(logo?.height) > 0, 'A logo precisa declarar altura.');
  assert.equal(favicon?.href, '/cellf-logo.png');
  assert.equal(favicon?.type, 'image/png');
});

test('o atalho para pular navegação aponta para conteúdo principal focalizável', () => {
  const skipLink = openingTags('a').find(attributes => hasClass(attributes, 'skip-link'));
  const content = elementById('app-content');
  const main = openingTags('main').find(attributes => attributes.id === 'main-area');

  assert.equal(skipLink?.href, '#app-content');
  assert.equal(content.tabindex, '-1');
  assert.ok(content['aria-label'], 'O conteúdo principal precisa ter nome acessível.');
  assert.ok(main, 'A aplicação precisa expor um landmark semântico main.');
});

test('a aplicação oferece exatamente dez módulos de navegação exclusivos', () => {
  const navigationButtons = openingTags('button')
    .filter(attributes => hasClass(attributes, 'nav-item'));
  const actualViews = navigationButtons.map(attributes => attributes['data-view']);
  const uniqueViews = new Set(actualViews);

  assert.equal(navigationButtons.length, 10);
  assert.equal(uniqueViews.size, 10, 'Cada módulo deve aparecer apenas uma vez no menu.');
  assert.deepEqual([...uniqueViews].sort(), [...expectedViews].sort());
});

test('todos os módulos apresentam rótulos claros em português', () => {
  const expectedLabels = new Map([
    ['dashboard', 'Visão geral'],
    ['orders', 'Ordens de serviço'],
    ['customers', 'Clientes'],
    ['products', 'Produtos e estoque'],
    ['services', 'Serviços'],
    ['sales', 'Vendas'],
    ['payables', 'Contas a pagar'],
    ['reports', 'Relatórios'],
    ['settings', 'Configurações'],
    ['agenda', 'Agenda']
  ]);

  for (const { attributes, label } of buttonLabels()) {
    if (!hasClass(attributes, 'nav-item')) continue;

    const expectedLabel = expectedLabels.get(attributes['data-view']);

    assert.ok(expectedLabel, 'Módulo não reconhecido: ' + attributes['data-view']);
    assert.ok(
      label.startsWith(expectedLabel),
      'O módulo ' + attributes['data-view'] + ' precisa exibir o rótulo ' + expectedLabel + '.'
    );
  }

  assert.doesNotMatch(html, /\bEM\s+BREVE\b/iu);
});

test('a navegação principal tem nome acessível e seções identificadas', () => {
  const navigation = openingTags('nav').find(attributes => hasClass(attributes, 'main-nav'));
  const groups = openingTags('section').filter(attributes => hasClass(attributes, 'nav-group'));
  const namedGroups = groups.filter(attributes => attributes['aria-labelledby']);

  assert.ok(navigation?.['aria-label'], 'O menu principal precisa de aria-label.');
  assert.ok(groups.length >= 5, 'Os módulos precisam ser organizados em grupos.');
  assert.ok(namedGroups.length >= 4, 'Os grupos operacionais precisam ter título associado.');

  for (const group of namedGroups) {
    assert.ok(elementById(group['aria-labelledby']));
  }
});

test('os itens de menu controlam a área de conteúdo e indicam a página atual', () => {
  const navigationButtons = openingTags('button')
    .filter(attributes => hasClass(attributes, 'nav-item'));
  const currentButtons = navigationButtons
    .filter(attributes => attributes['aria-current'] === 'page');

  assert.equal(currentButtons.length, 1);
  assert.equal(currentButtons[0]['data-view'], 'dashboard');

  for (const button of navigationButtons) {
    assert.equal(button.type, 'button');
    assert.equal(button['aria-controls'], 'app-content');
  }
});

test('a localização atual possui landmark e página ativa anunciável', () => {
  const breadcrumb = openingTags('nav').find(attributes => hasClass(attributes, 'breadcrumb'));
  const currentView = elementById('current-view-label');

  assert.ok(breadcrumb?.['aria-label'], 'A trilha de navegação precisa de nome acessível.');
  assert.equal(currentView['aria-current'], 'page');
});

test('o menu móvel informa estado expandido e aponta para a barra lateral', () => {
  const menuButton = elementById('menu-button');
  const sidebar = elementById('sidebar');

  assert.equal(menuButton.type, 'button');
  assert.equal(menuButton['aria-controls'], sidebar.id);
  assert.equal(menuButton['aria-expanded'], 'false');
  assert.match(menuButton['aria-label'] ?? '', /menu/iu);
  assert.ok(sidebar['aria-label'], 'A barra lateral precisa ter nome acessível.');
});

test('o menu móvel possui fechamento explícito e camada inicialmente oculta', () => {
  const closeButton = elementById('sidebar-close');
  const backdrop = elementById('sidebar-backdrop');

  assert.equal(closeButton['data-action'], 'close-menu');
  assert.match(closeButton['aria-label'] ?? '', /fechar/iu);
  assert.equal(backdrop['data-action'], 'close-menu');
  assert.ok('hidden' in backdrop, 'A camada do menu deve iniciar oculta.');
  assert.match(backdrop['aria-label'] ?? '', /fechar/iu);
});

test('a busca global anuncia atalhos de teclado e a janela controlada', () => {
  const search = elementById('global-search');
  const shortcuts = search['aria-keyshortcuts'] ?? '';

  assert.match(search['aria-label'] ?? '', /busca|buscar/iu);
  assert.match(shortcuts, /\bControl\+K\b/u);
  assert.match(shortcuts, /\bMeta\+K\b/u);
  assert.equal(search['aria-haspopup'], 'dialog');
  assert.equal(search['aria-controls'], 'command-backdrop');
  assert.ok(elementById(search['aria-controls']));
});

test('o campo de pesquisa global possui rótulo associado e tipo search', () => {
  const query = elementById('command-query');
  const label = openingTags('label')
    .find(attributes => attributes.for === 'command-query');

  assert.equal(query.type, 'search');
  assert.ok(label, 'O campo de busca global precisa de label associado.');
  assert.ok(hasClass(label, 'sr-only'));
});

test('a janela de cadastro usa semântica de diálogo e referências válidas', () => {
  const backdrop = elementById('modal-backdrop');
  const dialog = openingTags('section')
    .find(attributes => hasClass(attributes, 'modal'));

  assert.ok('hidden' in backdrop);
  assert.equal(dialog?.role, 'dialog');
  assert.equal(dialog?.['aria-modal'], 'true');
  assert.ok(elementById(dialog['aria-labelledby']));
  assert.ok(elementById(dialog['aria-describedby']));
  assert.ok(elementById('modal-body'));
});

test('a paleta de comandos é modal, identificada e inicialmente oculta', () => {
  const backdrop = elementById('command-backdrop');
  const dialog = openingTags('section')
    .find(attributes => hasClass(attributes, 'command-palette'));

  assert.ok('hidden' in backdrop);
  assert.equal(dialog?.role, 'dialog');
  assert.equal(dialog?.['aria-modal'], 'true');
  assert.match(dialog?.['aria-label'] ?? '', /busca/iu);
});

test('a central de lembretes possui diálogo, acionador e botão para fechar', () => {
  const drawer = elementById('notification-drawer');
  const trigger = elementById('notifications-button');
  const closer = openingTags('button')
    .find(attributes => attributes['data-action'] === 'close-notifications');

  assert.equal(drawer.role, 'dialog');
  assert.equal(drawer['aria-hidden'], 'true');
  assert.match(drawer['aria-label'] ?? '', /lembretes/iu);
  assert.equal(trigger['aria-controls'], drawer.id);
  assert.equal(trigger['aria-haspopup'], 'dialog');
  assert.match(closer?.['aria-label'] ?? '', /fechar/iu);
});

test('mensagens e resultados são anunciados por regiões acessíveis', () => {
  const content = elementById('app-content');
  const results = elementById('command-results');
  const toasts = elementById('toast-region');

  assert.equal(content['aria-live'], 'polite');
  assert.equal(results['aria-live'], 'polite');
  assert.equal(toasts.role, 'status');
  assert.equal(toasts['aria-live'], 'polite');
});

test('ícones decorativos não são anunciados por leitores de tela', () => {
  const icons = openingTags('svg');

  assert.ok(icons.length >= 10, 'Os módulos devem ter ícones identificáveis.');

  for (const icon of icons) {
    assert.equal(icon['aria-hidden'], 'true');
  }
});

test('os botões estruturais declaram tipo explícito e nome acessível', () => {
  for (const { attributes, label } of buttonLabels()) {
    assert.equal(
      attributes.type,
      'button',
      'O botão estrutural ' + (attributes.id ?? attributes['data-view'] ?? 'sem identificador') +
        ' precisa declarar type="button".'
    );
    assert.ok(
      attributes['aria-label'] || label,
      'Todo botão estrutural precisa de texto visível ou aria-label.'
    );
  }
});
